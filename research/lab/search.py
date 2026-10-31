"""Research Lab search (Constitution v10 A3.3c): find candidates automatically, deterministically, with no AI.

    python3 -m research.lab.search round [--force] [--sport CFB|NBA|NHL|MLB]   # one round (back to back)

A round scores configurations from the sport's MENU.yaml on the SEARCH seasons only -- this module is given data up
to the last search season and nothing later -- then sends candidates to confirmation by writing them to the sport's
candidates folder (the lab confirms them on the gate seasons like any candidate; only that is an attempt).
Each round: up to max_new_per_round configurations not scored before (the grid in order, then neighbours of the 30
best per market), then blends of the best. Shortlist: t >= 2.5, positive in every search period, not a near-copy,
at most 2 per market per 7 days. Nothing is scored twice. Everything scored is logged in the sport's search folder.
"""
import argparse
import csv
import datetime as dt
import glob
import gzip
import hashlib
import io
import itertools
import json
import os
import sys
import zlib

import numpy as np
import pandas as pd
import yaml

from . import config as C
from . import data as D
from . import lab as L
from . import metrics as M
from . import models

def path(name):
    """One of the search's files for the sport in use: research/search/ (NFL), research/<sport>/search/ (others)."""
    return os.path.join(C.SEARCH_DIR, name)

SCORE_COLS = ["round", "id", "market", "type", "label", "games", "effect", "t", "p1", "p2", "p3", "eligible",
              "config"]
ROUND_COLS = ["round", "at", "data_through", "scored_new", "scored_total", "best_spread_id", "best_spread_t",
              "best_total_id", "best_total_t", "shortlisted", "run_url"]      # NFL and CFB (spread and total)


def round_cols():
    """ROUNDS.csv columns: the best configuration of each of the sport's markets (NFL, CFB, NBA: spread and total)."""
    return (["round", "at", "data_through", "scored_new", "scored_total"]
            + [f"best_{m}_{k}" for m in C.MARKETS for k in ("id", "t")] + ["shortlisted", "run_url"])
METRIC_NAMES = {"points": "Points", "epa": "EPA", "pass_epa": "Passing-EPA", "early_epa": "Early-down EPA",
                "success": "Success-rate", "noto_epa": "No-turnover EPA", "comp_epa": "Competitive EPA"}


# ---- configurations ---------------------------------------------------------------------------------------------------
def load_menu(menu_path=None, auto=True):
    """The sport's MENU.yaml plus, unless auto=False or a menu file is named, every widening in AUTO.yaml."""
    with open(menu_path or path("MENU.yaml")) as f:
        menu = yaml.safe_load(f)
    return with_auto(menu, read_auto()) if auto and not menu_path else menu


# ---- automatic widening (Constitution v10 A3.3c) ------------------------------------------------------------------
# When a round would have fewer than the menu's `widen_below` configurations left to score, the search widens its own
# menu instead of stopping: one generation at a time, deterministically, from its own search-season scores only. Each
# generation is appended to the sport's AUTO.yaml (never edited) and adds
#   1. ladder values: the midpoints next to the 2 best values of each numeric setting (by median search t) and, when a
#      best value is at the end of its ladder, one step beyond it (within the setting's bounds);
#   2. signal variants: the 6 best team signals not varied before, each with its half-life halved and doubled and its
#      season carry 0.2 lower and higher (same columns, same football reason);
#   3. signal bases: the best single model per market that is not a base yet;
#   4. bigger signal sets: pairs of 4 more and trios of 2 more of the best signals;
#   5. (v12) formula signals: the next 8 of a fixed catalogue of team-column formulas (rates per play / per dropback /
#      per second, play-type shares, per-game differences), offense and defense, that the library does not have yet.
BOUNDS = {"season_carry": (0.0, 1.0), "carry": (0.0, 1.0), "revert": (0.0, 1.0), "market_blend": (0.0, 1.0),
          "def_weight": (0.0, 2.0), "k": (1, 100), "halflife": (1, 64), "prior_w": (0.1, 50), "hfa_pts": (0.0, 6.0),
          "margin_cap": (7, 60), "market_resist": (0.0, 6.0), "bye_elo": (0, 100), "travel_elo_per_1000mi": (0, 20)}
AUTO_COLS = ("ladders", "signals", "signal_bases", "signal_sets")


def read_auto():
    try:
        with open(path("AUTO.yaml")) as f:
            return yaml.safe_load(f) or {}
    except OSError:
        return {}


def with_auto(menu, auto):
    gens = auto.get("generations") or []
    lad = menu.setdefault("ladders", {})
    for g in gens:
        for name, vals in (g.get("ladders") or {}).items():
            lad[name] = sorted(set(lad.get(name, [])) | set(vals))
        for market, bl in (g.get("signal_bases") or {}).items():
            menu.setdefault("signal_bases", {}).setdefault(market, []).extend(bl)
    S = menu["search"]
    n = sum(int(g.get("signal_sets") or 0) for g in gens)
    S["signal_pairs_of"] = S.get("signal_pairs_of", 0) + 4 * n
    S["signal_trios_of"] = S.get("signal_trios_of", 0) + 2 * n
    return menu


def auto_signals():
    """The signal variants every widening added, in order (signals.load_library adds them to the library)."""
    return [x for g in read_auto().get("generations") or [] for x in g.get("signals") or []]


def tidy(x, ints):
    return int(round(x)) if ints else float(f"{x:.4g}")


def widen_ladders(menu, scored_rows):
    """New ladder values next to each numeric setting's 2 best values (median search t, values seen 3+ times)."""
    med = {}
    for r in scored_rows:
        if r["type"] in ("blend", "signals") or r["t"] == "-inf":
            continue
        for k, v in json.loads(r["config"])["params"].items():
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                med.setdefault(k, {}).setdefault(v, []).append(float(r["t"]))
    out = {}
    for name, ladder in sorted((menu.get("ladders") or {}).items()):
        lad = sorted(set(ladder))
        if len(lad) < 2:
            continue
        ints = all(float(v).is_integer() for v in lad) and name not in ("season_carry", "carry", "revert")
        lo, hi = BOUNDS.get(name, (0, float("inf")))
        judged = {v: float(np.median(ts)) for v, ts in med.get(name, {}).items() if len(ts) >= 3 and v in lad}
        best = sorted(judged, key=lambda v: (-judged[v], v))[:2]
        new = set()
        for v in best:
            i = lad.index(v)
            if i > 0:
                new.add(tidy((lad[i - 1] + v) / 2, ints))
            if i < len(lad) - 1:
                new.add(tidy((v + lad[i + 1]) / 2, ints))
            if i == 0:
                new.add(tidy(v - (lad[1] - v), ints))
            if i == len(lad) - 1:
                new.add(tidy(v + (v - lad[-2]), ints))
        new = sorted(x for x in new if lo <= x <= hi and x not in lad)
        if new:
            out[name] = new
    return out


def widen_signals(scored_rows, n=6):
    """Half-life and carry variants of the n best team signals (best single-signal search t) not varied before."""
    from . import signals as SG
    lib = SG.load_library()
    have = {x["id"] for x in lib}
    varied = {x.get("variant_of") for x in auto_signals()}
    best = {}
    for r in scored_rows:
        if r["type"] == "signals" and r["t"] != "-inf":
            ids = [x["id"] for x in json.loads(r["config"])["params"]["signals"]]
            if len(ids) == 1:
                best[ids[0]] = max(best.get(ids[0], -np.inf), float(r["t"]))
    pool = sorted((x for x in lib if x["kind"] == "team" and x["id"] not in varied and x["id"] in best),
                  key=lambda x: (-best[x["id"]], x["id"]))[:n]
    out = []
    for sig in pool:
        h, c = float(sig.get("halflife", 8)), float(sig.get("carry", 0.5))
        for tag, h2, c2 in (("h", max(1, round(h / 2)), c), ("h", min(64, round(h * 2)), c),
                            ("c", h, round(max(0.0, c - 0.2), 2)), ("c", h, round(min(1.0, c + 0.2), 2))):
            if (h2, c2) == (h, c):
                continue
            v = {k: x for k, x in sig.items() if k != "markets"}
            v.update(id=f"{sig['id']}~{tag}{h2 if tag == 'h' else c2:g}", halflife=h2, carry=c2, variant_of=sig["id"],
                     markets=list(sig["markets"]),
                     reason=f"Automatic variant of {sig['id']} (half-life {h2:g}, carry {c2:g}): {sig['reason']}")
            if v["id"] not in have:
                have.add(v["id"])
                out.append(v)
    return out


# v12 A3.3c(5): the formula catalogue, in a fixed order. Value columns are summed amounts; count columns are numbers of
# plays (or seconds). Built only from the sport's allowed columns, so A3.3e's data rules hold; A3.5 holds because no
# column can express a betting angle.
FORMULA_COLUMNS = {"NFL": {"values": ["epa", "pass_epa", "early_epa", "noto_epa", "comp_epa", "succ", "points"],
                           "counts": ["plays", "pass_plays", "early_plays", "noto_plays", "comp_plays", "top_seconds"]},
                   "CFB": {"values": ["epa", "comp_epa", "points"], "counts": ["plays", "comp_plays"]}}
FORMULA_STYLE = {"NFL": (8, 0.5), "CFB": (6, 0.4)}     # half-life and season carry, as the hand-written signals use


def formula_catalogue(sport=None):
    """Every formula signal for the sport, in the fixed order generations take them from."""
    cols = FORMULA_COLUMNS.get(sport or C.SPORT)
    if not cols:
        return []
    h, c = FORMULA_STYLE[sport or C.SPORT]
    vals, cnts = cols["values"], cols["counts"]
    forms = []                                          # (num, den, plain-language description)
    for v in vals:
        for n in cnts:
            forms.append(({v: 1}, n, f"{v} per {n[:-1] if n.endswith('s') else n} (summed {v} / {n})"))
    for n in cnts:
        if n not in ("plays", "top_seconds") and "plays" in cnts:
            forms.append(({n: 1}, "plays", f"share of plays that are {n.replace('_plays', '')} plays ({n} / plays)"))
    if "top_seconds" in cnts:
        forms.append(({"plays": 1}, "top_seconds", "plays per second of possession (tempo)"))
    for a, b in (("epa", "pass_epa"), ("epa", "early_epa"), ("epa", "comp_epa"), ("epa", "noto_epa")):
        if a in vals and b in vals:
            forms.append(({a: 1, b: -1}, None, f"{a} minus {b}, per game"))
    out = []
    for num, den, desc in forms:
        for side in ("offense", "defense"):
            terms = "-".join(f"{k}{'' if w == 1 else 'x' + str(w)}" for k, w in sorted(num.items()))
            sid = f"f-{'off' if side == 'offense' else 'def'}-{terms}" + (f"-per-{den}" if den else "")
            out.append({"id": sid, "kind": "team", "side": side, "num": dict(num), "den": den, "halflife": h,
                        "carry": c, "formula": True,
                        "reason": (f"Automatic formula signal (Constitution v12 A3.3c): {desc}, "
                                   f"{'by the team' if side == 'offense' else 'allowed by the team'}. Generated "
                                   "mechanically from the allowed team columns, with no hand-written football reason: "
                                   "it competes only on search-season scores and, if shortlisted, confirmation.")})
    return out


def signal_shape(sig):
    """What makes two team signals the same model input (id, reason, half-life and carry aside)."""
    return json.dumps({"side": sig.get("side"), "num": {k: float(v) for k, v in (sig.get("num") or {}).items()},
                       "den": sig.get("den") or None}, sort_keys=True)


def widen_formulas(n=8):
    """The next n formula signals the library does not have (same columns and side as an existing signal = have)."""
    from . import signals as SG
    lib = SG.load_library()
    have_ids = {x["id"] for x in lib}
    have_shape = {signal_shape(x) for x in lib if x["kind"] == "team"}
    out = []
    for f in formula_catalogue():
        if f["id"] in have_ids or signal_shape(f) in have_shape:
            continue
        out.append(f)
        have_shape.add(signal_shape(f))
        if len(out) == n:
            break
    return out


def widen_bases(menu, scored_rows):
    """The best single model per market (by search t) that is not a signal base yet."""
    bases = menu.get("signal_bases") or {}
    out = {}
    for market in sorted(bases):
        cur = [json.dumps({"type": b["type"], "params": b["params"]}, sort_keys=True) for b in bases[market]]
        rows = sorted((r for r in scored_rows if r["market"] == market and r["type"] not in ("blend", "signals")
                       and r["t"] != "-inf" and "(same as" not in r["label"]), key=lambda r: (-float(r["t"]), r["id"]))
        for r in rows:
            cfg = json.loads(r["config"])
            b = {"type": cfg["type"], "params": cfg["params"]}
            if json.dumps(b, sort_keys=True) not in cur:
                out[market] = [b]
                break
    return out


def widen(menu, scored_rows, n_round, log=print):
    """Append one generation to AUTO.yaml. Returns it ({} if there was nothing at all to add)."""
    from . import signals as SG
    room = menu.get("signal_bases") and menu["search"].get("signal_pairs_of", 0) < len(SG.load_library())
    gen = {"ladders": widen_ladders(menu, scored_rows), "signals": widen_signals(scored_rows) + widen_formulas(),
           "signal_bases": widen_bases(menu, scored_rows), "signal_sets": 1 if room else 0}
    gen = {k: v for k, v in gen.items() if v}
    if not gen:
        return {}
    auto = read_auto()
    gens = auto.setdefault("generations", [])
    gen = {"generation": len(gens) + 1, "at": L.now(), "round": n_round, **gen}
    gens.append(gen)
    with open(path("AUTO.yaml"), "w") as f:
        f.write(f"# Research Lab search ({C.SPORT}) -- automatic widenings of MENU.yaml and SIGNALS.yaml (Constitution v10 "
                "A3.3c; formula signals since v12).\n# Written by research/lab/search.py from search-season scores only; append-only, never edit.\n")
        yaml.safe_dump(auto, f, sort_keys=False, allow_unicode=True, width=120)
    log(f"search: widened the menu (generation {gen['generation']}): " + ", ".join(
        f"{len(v) if not isinstance(v, int) else '+'} {k}" for k, v in gen.items() if k in AUTO_COLS))
    return gen


def config_key(cfg):
    return json.dumps({"market": cfg["market"], "type": cfg["type"], "params": cfg["params"]}, sort_keys=True)


def config_id(cfg):
    return "s-" + hashlib.sha1(config_key(cfg).encode()).hexdigest()[:8]


def grid(menu):
    out = []
    for fam in menu["families"]:
        names = list(fam["grid"])
        seen = set()
        for values in itertools.product(*(fam["grid"][n] for n in names)):
            p = dict(fam.get("fixed") or {})
            p.update(dict(zip(names, values)))
            if "points_has_no_pace" in (fam.get("rules") or []) and p.get("metric") == "points":
                p["pace"] = "none"
            cfg = {"market": fam["market"], "type": fam["type"], "params": p}
            k = config_key(cfg)
            if k not in seen:
                seen.add(k)
                out.append(cfg)
    return out


def neighbours(cfg, ladders):
    out = []
    for name, ladder in ladders.items():
        v = cfg["params"].get(name)
        if not isinstance(v, (int, float)) or isinstance(v, bool):
            continue
        i = min(range(len(ladder)), key=lambda j: abs(ladder[j] - v))
        for j in (i - 1, i + 1):
            if 0 <= j < len(ladder) and ladder[j] != v:
                p = dict(cfg["params"])
                p[name] = ladder[j]
                out.append({"market": cfg["market"], "type": cfg["type"], "params": p})
    return out


def focus(menu, scored_rows, top=2, min_n=3):
    """What the search learned, used: for each family, every combination of the `top` best values of each setting
    (by median search t over the configurations already scored with that value; values seen fewer than `min_n` times
    are not judged). Uses search-season scores only."""
    out = []
    for fam in menu["families"]:
        rows = [r for r in scored_rows if r["market"] == fam["market"] and r["type"] == fam["type"] and r["t"] != "-inf"]
        if not rows:
            continue
        cfgs = [(json.loads(r["config"]), float(r["t"])) for r in rows]
        choices = []
        for name in fam["grid"]:
            by = {}
            for c, t in cfgs:
                by.setdefault(json.dumps(c["params"].get(name)), []).append(t)
            judged = {v: float(np.median(ts)) for v, ts in by.items() if len(ts) >= min_n}
            best = sorted(judged, key=lambda v: (-judged[v], v))[:top] or [json.dumps(fam["grid"][name][0])]
            choices.append([json.loads(v) for v in best])
        for values in itertools.product(*choices):
            p = dict(fam.get("fixed") or {})
            p.update(dict(zip(fam["grid"], values)))
            if "points_has_no_pace" in (fam.get("rules") or []) and p.get("metric") == "points":
                p["pace"] = "none"
            out.append({"market": fam["market"], "type": fam["type"], "params": p})
    return out


def value_space(fam, ladders):
    """Every value a family's setting may take: its grid values plus, for numeric settings, its ladder."""
    out = {}
    for name, vals in fam["grid"].items():
        vs = list(vals)
        numeric = all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in vals if v is not None)
        if numeric and name in ladders:
            vs += [v for v in ladders[name] if v not in vs]
        out[name] = vs
    return out


def samples(menu, scored_rows, n, seed, learned=True):
    """Up to n configurations not scored before, drawn with a fixed seed (deterministic). learned=True: each setting's
    value is drawn with weight exp(median search t of the configurations already scored with it) -- what past rounds
    learned; values never tried get the family's average weight. learned=False: uniform (exploration)."""
    rng = np.random.default_rng(seed)
    fams = menu["families"]
    have = {r["id"] for r in scored_rows}
    plan = []
    for fam in fams:
        space = value_space(fam, menu["ladders"])
        rows = [(json.loads(r["config"]), float(r["t"])) for r in scored_rows
                if r["market"] == fam["market"] and r["type"] == fam["type"] and r["t"] != "-inf"]
        probs = {}
        for name, vals in space.items():
            w = np.ones(len(vals))
            if learned and rows:
                med = {}
                for c, t in rows:
                    med.setdefault(json.dumps(c["params"].get(name)), []).append(t)
                med = {k: float(np.median(v)) for k, v in med.items()}
                avg = float(np.mean(list(med.values()))) if med else 0.0
                w = np.exp(np.array([med.get(json.dumps(v), avg) for v in vals]))
            probs[name] = w / w.sum()
        plan.append((fam, space, probs))
    out, keys = [], set()
    for _ in range(n * 20):
        if len(out) >= n:
            break
        fam, space, probs = plan[int(rng.integers(len(plan)))]
        p = dict(fam.get("fixed") or {})
        for name, vals in space.items():
            p[name] = vals[int(rng.choice(len(vals), p=probs[name]))]
        if "points_has_no_pace" in (fam.get("rules") or []) and p.get("metric") == "points":
            p["pace"] = "none"
        cfg = {"market": fam["market"], "type": fam["type"], "params": p}
        cid = config_id(cfg)
        if cid in have or cid in keys:
            continue
        keys.add(cid)
        out.append(cfg)
    return out


def signal_configs(menu, scored_rows):
    """Signals (A3.3e) on top of the menu's signal_bases: each signal alone, then pairs of the best `signal_pairs_of`
    and trios of the best `signal_trios_of`, ranked by their best single-signal search t so far (learned)."""
    from . import signals as SG
    lib = SG.load_library()
    bases = menu.get("signal_bases") or {}
    S = menu["search"]
    best = {}
    for r in scored_rows:
        if r["type"] == "signals" and r["t"] != "-inf":
            ids = [x["id"] for x in json.loads(r["config"])["params"]["signals"]]
            if len(ids) == 1:
                best[ids[0]] = max(best.get(ids[0], -np.inf), float(r["t"]))
    out = []
    for market, blist in bases.items():
        mine = [x for x in lib if market in x["markets"]]
        ranked = sorted(mine, key=lambda x: (-best.get(x["id"], -np.inf), x["id"]))
        sets = [[x] for x in mine]
        sets += [list(c) for c in itertools.combinations(ranked[:S.get("signal_pairs_of", 0)], 2)]
        sets += [list(c) for c in itertools.combinations(ranked[:S.get("signal_trios_of", 0)], 3)]
        for b in blist:
            for st in sets:
                out.append({"market": market, "type": "signals",
                            "params": {"base": b, "signals": sorted(st, key=lambda x: x["id"]), "ridge": 1.0}})
    return out


def fingerprint(out):
    """Identical forecasts on the search seasons = the same model under another name (A3.3c: scored once)."""
    v = out.forecast[(out.season <= C.SEARCH[1])].values
    return hashlib.sha1(np.round(v.astype(float), 6).tobytes()).hexdigest()[:16]


def label(cfg):
    p, t = cfg["params"], cfg["type"]
    if t == "elo":
        bits = [f"K{p['k']:g}", "home edge by season" if p["hfa_mode"] == "rolling" else "fixed home edge"]
        bits += {"538": ["538 margin"], "nfelo": ["nfelo margin"]}.get(p["mov"], [])
        bits.append(f"revert {p['revert']:.2f}")
        bits += (["QB"] if p["qb"] != "none" else []) + ([f"market-resist {p['market_resist']:g}"] if p["market_resist"] else [])
        bits += ([f"bye {p['bye_elo']:g}"] if p.get("bye_elo") else []) + \
            ([f"travel {p['travel_elo_per_1000mi']:g}"] if p.get("travel_elo_per_1000mi") else [])
        bits += (["revert to conference"] if p.get("revert_center") == "conference" else []) + \
            ([f"returning {p['returning']}"] if p.get("returning", "none") != "none" else []) + \
            ([f"margin cap {p['mov_cap']:g}"] if p.get("mov_cap") else []) + \
            ([f"market blend {p['market_blend']:g}"] if p.get("market_blend") else [])
        return "Elo · " + " · ".join(bits)
    if t == "srs":
        return (f"SRS · carry {p['carry']:g} · prior {p['prior_w']:g}" +
                (f" · margin cap {p['margin_cap']:g}" if p.get("margin_cap") else ""))
    if t == "ppa":
        return (f"PPA rating · carry {p['carry']:g} · prior {p['prior_w']:g}" +
                (" · no garbage time" if p.get("garbage_time") == "exclude" else ""))
    if t == "team_rating":
        bits = [f"half-life {p['halflife']:g}", f"carry {p['season_carry']:g}"]
        if p.get("def_weight", 1.0) != 1.0:
            bits.append(f"defense ×{p['def_weight']:g}")
        if cfg["market"] == "total" and p.get("pace") != "none":
            bits.append("pace: " + ("seconds/play" if p["pace"] == "seconds" else "plays"))
        return f"{METRIC_NAMES[p['metric']]} rating · " + " · ".join(bits)
    if t == "pace_eff":
        return (f"{'Pace × ' if p.get('pace', True) else 'Points, no pace · '}{p['efficiency']} · half-life "
                f"{p['halflife']:g} · carry {p['season_carry']:g}")
    if t in ("elo_ml", "srs_ml", "rating_ml"):             # Part D3: a margin model turned into a win probability
        inner = {"elo_ml": "elo", "srs_ml": "srs", "rating_ml": "team_rating"}[t]
        how = " · Elo win chance" if t == "elo_ml" and p.get("prob", "elo") == "elo" else " · win chance fit on training"
        return label({"market": "spread", "type": inner, "params": p}) + how
    if t == "signals":
        b = p["base"]
        return f"Signals ({label({'market': cfg['market'], 'type': b['type'], 'params': b['params']})}) + " + \
            ", ".join(x["id"] for x in p["signals"])
    if t == "blend":
        ws = p["weights"]
        same = len(set(round(w, 6) for w in ws)) == 1
        return f"Blend of {len(ws)}" + ("" if same else " (fitted weights)") + ": " + \
            " + ".join(config_id({"market": c["market"], "type": c["model"]["type"], "params": c["model"]["params"]})
                       for c in p["components"])
    return t


def as_candidate(cfg):
    return {"id": config_id(cfg), "name": label(cfg), "market": cfg["market"], "model": {"type": cfg["type"],
                                                                                         "params": cfg["params"]}}


# ---- scoring on the search seasons only -------------------------------------------------------------------------------
def search_data():
    """The lab's data cut at the last search season: the search cannot see confirmation or sealed seasons."""
    d = L.dm().load_lab()
    return {k: v[v.season <= C.SEARCH[1]].reset_index(drop=True) for k, v in d.items()}


def forecasts(cfg, data):
    out, _ = models.run(as_candidate(cfg), data)
    if int(out.season.max()) > C.SEARCH[1]:
        raise RuntimeError("search saw a season after the search seasons")
    return out


def score_out(out):
    e = L.score(out)
    s0 = M.baseline_side(L.between(e, *C.TRAIN).r.values)
    se = L.between(e, *C.SEARCH)
    v = M.effect_parts(se.d.values, se.r.values, s0)
    n = len(v)
    eff = float(v.mean())
    sd = float(v.std(ddof=1)) if n > 1 else 0.0
    t = eff / (sd / np.sqrt(n)) if sd > 0 else 0.0
    parts = []
    for a, b in C.SEARCH_PERIODS:
        w = (se.season >= a) & (se.season <= b)
        parts.append(float(v[w.values].mean()) if w.any() else float("nan"))
    return {"games": n, "effect": round(eff, 4), "t": round(t, 4), "p1": round(parts[0], 4), "p2": round(parts[1], 4),
            "p3": round(parts[2], 4), "eligible": all(x > 0 for x in parts),
            "d": pd.Series(se.d.values, index=se.game_id.values)}


def blend_cfg(cfgs, weights, market):
    return {"market": market, "type": "blend",
            "params": {"components": [{"market": c["market"], "model": {"type": c["type"], "params": c["params"]}}
                                      for c in cfgs], "weights": [round(float(w), 4) for w in weights]}}


def fit_weights(F, y):
    """Non-negative weights summing to 1 that best fit y (least squares), by trying every subset (small k)."""
    k = F.shape[1]
    best = (np.inf, np.full(k, 1 / k))
    for r in range(1, k + 1):
        for S in itertools.combinations(range(k), r):
            A = F[:, S]
            KKT = np.zeros((r + 1, r + 1))
            KKT[:r, :r] = 2 * A.T @ A
            KKT[:r, r] = KKT[r, :r] = 1
            rhs = np.concatenate([2 * A.T @ y, [1.0]])
            try:
                sol = np.linalg.solve(KKT, rhs)[:r]
            except np.linalg.LinAlgError:
                continue
            if (sol < -1e-12).any():
                continue
            w = np.zeros(k)
            w[list(S)] = np.clip(sol, 0, None)
            sse = float(((y - F @ w) ** 2).sum())
            if sse < best[0]:
                best = (sse, w)
    return best[1]


# ---- logs -------------------------------------------------------------------------------------------------------------
def read_csv(path):
    if not os.path.exists(path):
        return []
    with open(path, newline="") as f:
        return list(csv.DictReader(f))


# Every configuration scored, one gzipped CSV per round in the sport's search/scores/ folder (a single SCORES.csv
# passed GitHub's 100 MB file limit, so pushes failed). SCORES.csv is still read if it exists (older checkouts).
def scores_dir():
    return path("scores")


def round_scores_path(n_round):
    return os.path.join(scores_dir(), f"round-{int(n_round):04d}.csv.gz")


def read_scores():
    rows = read_csv(path("SCORES.csv"))
    for p in sorted(glob.glob(os.path.join(scores_dir(), "round-*.csv.gz"))):
        with gzip.open(p, "rt", newline="") as f:
            rows += list(csv.DictReader(f))
    return rows


def write_round_scores(n_round, rows):
    """One round's scores. gzip with mtime 0, so the same rows always give the same bytes."""
    if not rows:
        return
    os.makedirs(scores_dir(), exist_ok=True)
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=SCORE_COLS, lineterminator="\n")
    w.writeheader()
    for r in rows:
        w.writerow({k: r.get(k, "") for k in SCORE_COLS})
    with open(round_scores_path(n_round), "wb") as raw, \
            gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0) as f:
        f.write(buf.getvalue().encode())


def migrate_scores(log=print):
    """One time: split SCORES.csv into per-round files under scores/ and delete it. Same rows, same order."""
    src = path("SCORES.csv")
    rows = read_csv(src)
    if not rows:
        log(f"migrate: no {src}")
        return 0
    by = {}
    for r in rows:
        by.setdefault(int(r["round"]), []).append(r)
    for n_round, rs in sorted(by.items()):
        if os.path.exists(round_scores_path(n_round)):
            raise RuntimeError(f"{round_scores_path(n_round)} already exists")
        write_round_scores(n_round, rs)
    os.remove(src)
    log(f"migrate: {len(rows)} rows from {src} into {len(by)} round files in {scores_dir()}")
    return len(rows)


# The search stops itself when its menu has nothing left to score (every grid value, neighbour, sample, signal and
# blend tried): no empty rounds are run or committed. STATE.json says so on /lab until the menu or signals change.
def read_state():
    try:
        with open(path("STATE.json")) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def write_state(state):
    if state == read_state():
        return
    if not state:
        if os.path.exists(path("STATE.json")):
            os.remove(path("STATE.json"))
        return
    with open(path("STATE.json"), "w") as f:
        json.dump(state, f, indent=1)
        f.write("\n")


def append_rows(path, cols, rows):
    new = not os.path.exists(path)
    with open(path, "a", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols, lineterminator="\n")
        if new:
            w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in cols})


def round_due(rounds, force, hours):
    if force or not rounds:
        return True
    last = dt.datetime.fromisoformat(rounds[-1]["at"].replace("Z", "+00:00"))
    return dt.datetime.now(dt.timezone.utc) - last >= dt.timedelta(hours=hours)


def sent_before():
    """Configs the search already sent to confirmation: {id: (cfg, sent_at or None)}."""
    out = {}
    for cid, c in L.load_candidates().items():
        if c.get("search"):
            out[cid] = ({"market": c["market"], "type": c["model"]["type"], "params": c["model"]["params"]},
                        c["search"].get("sent_at"))
    return out


# ---- one round --------------------------------------------------------------------------------------------------------
def run_round(force=False, log=print, progress=None):
    L.check_constitution()
    os.makedirs(C.SEARCH_DIR, exist_ok=True)
    rounds = read_csv(path("ROUNDS.csv"))
    menu = load_menu()
    S = menu["search"]
    if not round_due(rounds, force, S["round_every_hours"]):
        log(f"search: last round {rounds[-1]['at']}; the next one after {S['round_every_hours']} hours")
        return []
    n_round = len(rounds) + 1
    # a configuration whose only record is one crash ("(error)": no score) is tried once more, in case the cause was a
    # bug since fixed; a second crash is final, as are diverged settings and look-alikes
    allscores = read_scores()
    crashes = {}
    for r in allscores:
        if r["label"].endswith(" (error)"):
            crashes[r["id"]] = crashes.get(r["id"], 0) + 1
    # crashed settings stay in `scored`, so the samplers never draw them again (left out, the learned sampler kept
    # redrawing runaway Elo settings: 741 of 1,115 in NFL round 107); only the grid and signal lists retry one crash
    scored = {}
    for r in allscores:
        if r["id"] not in scored or not r["label"].endswith(" (error)"):
            scored[r["id"]] = r
    retry = {cid for cid, r in scored.items() if r["label"].endswith(" (error)") and crashes[cid] < 2}
    # 1) every grid configuration not scored yet, in order (a big grid spreads over several rounds), 2) the focus
    # step: every combination of the best values of each setting so far, 3) neighbours of the best, 4) samples
    # weighted by what past rounds learned, 5) uniform samples (exploration) -- 4 and 5 with a seed fixed by round
    def plan(menu):
        todo = [c for c in grid(menu) if config_id(c) not in scored or config_id(c) in retry]
        todo += signal_configs(menu, list(scored.values()))
        todo += focus(menu, list(scored.values()))
        for market in C.MARKETS:
            singles = sorted((r for r in scored.values() if r["market"] == market and r["type"] != "blend"),
                             key=lambda r: (-float(r["t"]), r["id"]))
            for r in singles[:menu["search"]["neighbours_of_best"]]:
                todo += neighbours(json.loads(r["config"]), menu["ladders"])
        seed = zlib.crc32(f"{C.SPORT}-{n_round}".encode())
        todo += samples(menu, list(scored.values()), menu["search"].get("learned_samples", 0), seed, learned=True)
        todo += samples(menu, list(scored.values()), menu["search"].get("random_samples", 0), seed + 1, learned=False)
        return todo

    todo = plan(menu)
    seen = set(scored) - retry
    # v10: running short of new configurations widens the menu (a generation at a time) instead of stopping
    for _ in range(S.get("max_widenings_per_round", 0)):
        if len({config_id(c) for c in todo} - seen) >= S.get("widen_below", 1):
            break
        if not widen(menu, list(scored.values()), n_round, log=log):
            break
        menu = load_menu()
        S = menu["search"]
        todo = plan(menu)
    rows, fc = [], {}
    fps = {r["fingerprint"]: r["id"] for r in read_csv(path("FINGERPRINTS.csv")) if not r["same_as"]}
    fp_rows = []
    cap = S.get("max_new_per_round") or len(todo) + 1

    def add(cfg):
        cid = config_id(cfg)
        if cid in seen:
            return
        seen.add(cid)
        try:
            out = forecasts(cfg, data)
            sc = score_out(out)
        except Exception as e:                         # a setting that breaks is logged, never shortlisted
            diverged = isinstance(e, models.Diverged)
            if not diverged:
                log(f"search: {cid} {label(cfg)}: {type(e).__name__}: {e}")
            rows.append({"round": n_round, "id": cid, "market": cfg["market"], "type": cfg["type"],
                         "label": label(cfg) + (" (diverged)" if diverged else " (error)"), "games": 0, "effect": "nan", "t": "-inf", "p1": "nan",
                         "p2": "nan", "p3": "nan", "eligible": "false", "config": config_key(cfg)})
            return
        fp = fingerprint(out)
        twin = fps.get(fp)
        fp_rows.append({"id": cid, "fingerprint": fp, "same_as": twin or ""})
        if twin:                                       # same forecasts as a model already scored: never ranked again
            rows.append({"round": n_round, "id": cid, "market": cfg["market"], "type": cfg["type"],
                         "label": label(cfg) + f" (same as {twin})", **{k: sc[k] for k in ("games", "effect", "p1",
                                                                                         "p2", "p3")},
                         "t": "-inf", "eligible": "false", "config": config_key(cfg)})
            return
        fps[fp] = cid
        fc[cid] = (cfg, out, sc)
        rows.append({"round": n_round, "id": cid, "market": cfg["market"], "type": cfg["type"], "label": label(cfg),
                     **{k: sc[k] for k in ("games", "effect", "t", "p1", "p2", "p3")},
                     "eligible": "true" if sc["eligible"] else "false", "config": config_key(cfg)})

    fresh = len({config_id(c) for c in todo} - seen)
    if not fresh:                                      # nothing new on the menu: blends of the same best are scored too
        st = read_state()
        write_state({"exhausted": True, "since": st.get("since") if st.get("exhausted") else L.now(),
                     "scored_total": len(scored), "rounds": len(rounds),
                     "note": "Every configuration the menu allows has been scored and widening added nothing new. The "
                             "search resumes when new values, families or signals are added to MENU.yaml or SIGNALS.yaml."})
        log(f"search: nothing new to score ({len(scored)} configurations scored in {len(rounds)} rounds); menu "
            "exhausted, no round run")
        return []
    write_state({})
    data = search_data()
    planned = min(cap, fresh)
    if progress:
        progress(n_round, 0, planned)
    # v10: first pass, no model type takes more than max_share_per_type of the round; second pass fills what is left
    per_type = {}
    type_cap = max(1, int(S.get("max_share_per_type", 1.0) * cap))
    for limit in (type_cap, cap):
        for cfg in todo:
            done = sum(1 for r in rows if r["type"] != "blend")
            if done >= cap:
                break
            if per_type.get(cfg["type"], 0) >= limit or config_id(cfg) in seen:
                continue
            per_type[cfg["type"]] = per_type.get(cfg["type"], 0) + 1
            add(cfg)
            if progress:
                progress(n_round, done + 1, planned)
    # blends of the best singles so far (this round's and earlier rounds')
    allrows = list(scored.values()) + rows
    for market in C.MARKETS:
        best = sorted((r for r in allrows if r["market"] == market and r["type"] != "blend" and r["t"] != "-inf"),
                      key=lambda r: (-float(r["t"]), r["id"]))
        pool = [json.loads(r["config"]) for r in best[:S["blend_pool"]]]
        if len(pool) < 2:
            continue
        outs = []
        for cfg in pool:
            cid = config_id(cfg)
            outs.append(fc[cid][1] if cid in fc else forecasts(cfg, data))
        for i, j in itertools.combinations(range(len(pool)), 2):
            add(blend_cfg([pool[i], pool[j]], [0.5, 0.5], market))
        for trio in itertools.combinations(range(min(len(pool), S["blend_triples_of"])), 3):
            add(blend_cfg([pool[k] for k in trio], [1 / 3] * 3, market))
        for k in S["equal_blends"]:
            if len(pool) >= k:
                add(blend_cfg(pool[:k], [1 / k] * k, market))
        for k in S["fitted_blends"]:
            if len(pool) >= k:
                F = np.column_stack([o.forecast.values for o in outs[:k]])
                y = outs[0].actual.values
                fit = ((outs[0].season >= C.TRAIN[0]) & (outs[0].season <= C.SEARCH[1])
                       & ~outs[0].season.isin(C.SKIP_SEASONS)).values & ~np.isnan(y)
                add(blend_cfg(pool[:k], fit_weights(F[fit], y[fit]), market))
    write_round_scores(n_round, rows)
    append_rows(path("FINGERPRINTS.csv"), ["id", "fingerprint", "same_as"], fp_rows)
    allrows = list(scored.values()) + rows
    picks = shortlist(allrows, data, S, fc)
    for cfg, r in picks:
        write_candidate(cfg, r, n_round)
    row = {"round": n_round, "at": L.now(), "data_through": C.SEARCH[1], "scored_new": len(rows),
           "scored_total": len(allrows)}
    for market in C.MARKETS:
        b = max((r for r in allrows if r["market"] == market), key=lambda r: float(r["t"]), default=None)
        row[f"best_{market}_id"], row[f"best_{market}_t"] = (b["id"], b["t"]) if b else ("", "")
    number, url = L.run_info()
    row.update(shortlisted=" ".join(config_id(c) for c, _ in picks), run_url=url or "")
    append_rows(path("ROUNDS.csv"), round_cols(), [row])
    write_leaderboard(allrows)
    log(f"search round {n_round}: {len(rows)} new configurations scored on {C.SEARCH[0]}-{C.SEARCH[1]} "
        f"({len(allrows)} so far); shortlisted {[config_id(c) for c, _ in picks] or 'none'}")
    return [config_id(c) for c, _ in picks]


def shortlist(allrows, data, S, fc, now=None):
    sent = sent_before()
    now = now or dt.datetime.now(dt.timezone.utc)
    sent_d = {}
    for cid, (cfg, _) in sent.items():
        sent_d[cid] = fc[cid][2]["d"] if cid in fc else score_out(forecasts(cfg, data))["d"]
    picks = []
    for market in C.MARKETS:
        recent = sum(1 for cfg, at in sent.values() if cfg["market"] == market and at and
                     now - dt.datetime.fromisoformat(at.replace("Z", "+00:00")) < dt.timedelta(days=S["shortlist_window_days"]))
        pool = sorted((r for r in allrows if r["market"] == market and r["eligible"] == "true"
                       and float(r["t"]) >= S["shortlist_min_t"] and r["id"] not in sent),
                      key=lambda r: (-float(r["t"]), r["id"]))
        n = recent                                     # at most shortlist_per_market per market in any window
        for r in pool:
            if n >= S["shortlist_per_market"]:
                break
            cfg = json.loads(r["config"])
            d = fc[r["id"]][2]["d"] if r["id"] in fc else score_out(forecasts(cfg, data))["d"]
            if any(abs(float(np.corrcoef(d.values, o.reindex(d.index).values)[0, 1])) > S["max_disagreement_corr"]
                   for o in sent_d.values()):
                continue
            sent_d[r["id"]] = d
            picks.append((cfg, r))
            n += 1
    return picks


def write_candidate(cfg, r, n_round):
    cid = config_id(cfg)
    c = {"id": cid, "name": label(cfg), "market": cfg["market"],
         "family": {"elo": "Elo family", "team_rating": "Team rating", "pace_eff": "Pace × efficiency",
                    "srs": "SRS", "ppa": "PPA rating", "blend": "Blend", "signals": "Signals",
                    "elo_ml": "Elo win chance", "srs_ml": "SRS win chance",
                    "rating_ml": "Team rating win chance"}.get(cfg["type"], cfg["type"]) + " · search",
         "parent": None,
         "reason": (f"Found by search round {n_round}: on {C.SEARCH[0]}–{C.SEARCH[1]} it beat the line by "
                    f"{float(r['effect']):+.2f} {'win-chance ' if cfg['market'] == 'moneyline' else ''}pts a game (t = {float(r['t']):.2f}), positive in all three search "
                    f"periods. Now confirmed on {C.GATES[0][1]}–{C.GATES[-1][2]}, which the search never saw."),
         "source": f"automatic search ({C.SPORT}, Constitution {C.CONSTITUTION_VERSION} A3.3c)",
         "search": {"round": n_round, "t": float(r["t"]), "effect": float(r["effect"]),
                    "periods": [float(r["p1"]), float(r["p2"]), float(r["p3"])], "games": int(r["games"]),
                    "sent_at": L.now()},
         "model": {"type": cfg["type"], "params": cfg["params"]}}
    os.makedirs(C.CANDIDATES, exist_ok=True)
    with open(L.cand_path(cid), "w") as f:
        f.write(f"# Research Lab candidate {cid} -- written by the search; registered before it runs (A3). "
                "Never edit after it has run.\n")
        yaml.safe_dump(c, f, sort_keys=False, allow_unicode=True, width=120)


def write_leaderboard(allrows):
    lines = [f"# Research Lab search ({C.SPORT}) -- leaderboard (EXPLORATORY)", "",
             f"_Generated {L.now()} by research/lab/search.py. Scores are on the search seasons {C.SEARCH[0]}–"
             f"{C.SEARCH[1]} only: effect = cover points (moneyline: win-chance points) per game beyond the line-only "
             "baseline, t = effect ÷ its "
             "standard error. Thousands of tries mean the best t here is partly luck: that is why only the shortlist "
             "is confirmed, on seasons the search never saw._", "",
             f"{len(allrows)} configurations scored so far.", ""]
    for market in C.MARKETS:
        rs = sorted((r for r in allrows if r["market"] == market), key=lambda r: -float(r["t"]))
        lines += [f"## {market.title()} -- top 25 of {len(rs)}", "",
                  "| # | id | model | effect | t | " + " | ".join(
                      str(a) if a == b else f"{a}–{str(b)[2:]}" for a, b in C.SEARCH_PERIODS) + " |",
                  "|---|---|---|---|---|---|---|---|"]
        for i, r in enumerate(rs[:25], 1):
            lines.append(f"| {i} | `{r['id']}` | {r['label']} | {float(r['effect']):+.2f} | {float(r['t']):.2f} | "
                         f"{float(r['p1']):+.2f} | {float(r['p2']):+.2f} | {float(r['p3']):+.2f} |")
        lines.append("")
    lines += ["## What the search learned (exploratory)", ""] + [f"- {x}" for x in learned(allrows)]
    with open(path("LEADERBOARD.md"), "w") as f:
        f.write("\n".join(lines) + "\n")


def learned(allrows):
    """For each setting, the median search t of every configuration with each value, per market and family."""
    out = []
    by = {}
    for r in allrows:
        if r["type"] == "blend":
            continue
        cfg = json.loads(r["config"])
        for k, v in cfg["params"].items():
            by.setdefault((r["market"], r["type"], k), {}).setdefault(str(v), []).append(float(r["t"]))
    for (market, t, k), vals in sorted(by.items()):
        if len(vals) < 2:
            continue
        med = {v: float(np.median(x)) for v, x in vals.items()}
        hi = max(med, key=med.get)
        lo = min(med, key=med.get)
        if med[hi] - med[lo] < 0.25:
            continue
        out.append(f"{market} · {t} · `{k}`: best {hi} (median t {med[hi]:+.2f}), worst {lo} ({med[lo]:+.2f}) "
                   f"over {sum(len(x) for x in vals.values())} configurations")
    return out or ["no setting made a clear difference yet"]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["round", "migrate-scores"])
    ap.add_argument("--force", action="store_true", help="run a round even if the last one was under 20 hours ago")
    ap.add_argument("--sport", default=os.environ.get("LAB_SPORT", "NFL"), help="NFL (Part B), CFB (Part C), NBA, NHL or MLB (Part D)")
    ap.add_argument("--progress", action="store_true", help="post the round's progress to /lab (GitHub Actions)")
    a = ap.parse_args(argv)
    C.use(a.sport)
    C.refuse_if_suspended()                          # D1b
    if a.cmd == "migrate-scores":
        migrate_scores()
        return 0
    run_round(force=a.force, progress=Progress() if a.progress else None)
    return 0


class Progress:
    """Posts a running search round to /lab once it has run `every` seconds, then at most every `every` seconds
    (status.json only changes; the scores are written when the round ends). Rounds shorter than that post nothing
    here: back to back, a start post each minute or two only crowded main for the other bots. A failed push never
    stops the search."""

    def __init__(self, every=600):
        import time
        self.every, self.last, self.started = every, time.time(), L.now()

    def __call__(self, n_round, done, planned):
        import time
        now = time.time()
        if now - self.last < self.every:
            return
        self.last = now
        from . import report
        number, url = L.run_info()
        live = {"kind": "search", "name": f"Search round {n_round} ({C.SPORT}, running)", "started_at": self.started,
                "finished_at": None, "duration_s": None, "run_number": number, "run_url": url,
                "summary": f"{done:,} of {planned:,} models scored on {C.SEARCH[0]}–{C.SEARCH[1]}",
                "funnel": [{"label": "models scored", "count": done}, {"label": "planned this round", "count": planned}],
                "steps": []}
        try:
            report.write_all(live=live)
            import subprocess
            subprocess.run([os.path.join(C.ROOT, "research", "lab", "push.sh"),
                            f"Research Lab {C.SPORT} search round {n_round}: {done:,} of {planned:,} scored"],
                           cwd=C.ROOT, timeout=120, capture_output=True)
        except Exception as e:                         # progress is a courtesy; the round goes on
            print(f"progress post failed: {e}")


if __name__ == "__main__":
    sys.exit(main())
