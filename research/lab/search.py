"""Research Lab search (Constitution v7 A3.3c): find candidates automatically, deterministically, with no AI.

    python3 -m research.lab.search round [--force] [--sport CFB]   # one round if 20 hours have passed (or --force)

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
import hashlib
import itertools
import json
import os
import sys

import numpy as np
import pandas as pd
import yaml

from . import config as C
from . import data as D
from . import lab as L
from . import metrics as M
from . import models

def path(name):
    """One of the search's files for the sport in use: research/search/ (NFL), research/cfb/search/ (CFB)."""
    return os.path.join(C.SEARCH_DIR, name)

SCORE_COLS = ["round", "id", "market", "type", "label", "games", "effect", "t", "p1", "p2", "p3", "eligible",
              "config"]
ROUND_COLS = ["round", "at", "data_through", "scored_new", "scored_total", "best_spread_id", "best_spread_t",
              "best_total_id", "best_total_t", "shortlisted", "run_url"]
METRIC_NAMES = {"points": "Points", "epa": "EPA", "pass_epa": "Passing-EPA", "early_epa": "Early-down EPA",
                "success": "Success-rate", "noto_epa": "No-turnover EPA", "comp_epa": "Competitive EPA"}


# ---- configurations ---------------------------------------------------------------------------------------------------
def load_menu(menu_path=None):
    with open(menu_path or path("MENU.yaml")) as f:
        return yaml.safe_load(f)


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
    scored = {r["id"]: r for r in read_csv(path("SCORES.csv"))}
    data = search_data()
    # 1) every grid configuration not scored yet, in order (a big grid spreads over several rounds), 2) the focus
    # step: every combination of the best values of each setting so far, 3) neighbours of the best
    todo = [c for c in grid(menu) if config_id(c) not in scored]
    todo += focus(menu, list(scored.values()))
    for market in ("spread", "total"):
        singles = sorted((r for r in scored.values() if r["market"] == market and r["type"] != "blend"),
                         key=lambda r: (-float(r["t"]), r["id"]))
        for r in singles[:S["neighbours_of_best"]]:
            todo += neighbours(json.loads(r["config"]), menu["ladders"])
    rows, fc = [], {}
    seen = set(scored)
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
            log(f"search: {cid} {label(cfg)}: {type(e).__name__}: {e}")
            rows.append({"round": n_round, "id": cid, "market": cfg["market"], "type": cfg["type"],
                         "label": label(cfg) + " (error)", "games": 0, "effect": "nan", "t": "-inf", "p1": "nan",
                         "p2": "nan", "p3": "nan", "eligible": "false", "config": config_key(cfg)})
            return
        fc[cid] = (cfg, out, sc)
        rows.append({"round": n_round, "id": cid, "market": cfg["market"], "type": cfg["type"], "label": label(cfg),
                     **{k: sc[k] for k in ("games", "effect", "t", "p1", "p2", "p3")},
                     "eligible": "true" if sc["eligible"] else "false", "config": config_key(cfg)})

    planned = min(cap, len(todo))
    if progress:
        progress(n_round, 0, planned)
    for cfg in todo:
        done = sum(1 for r in rows if r["type"] != "blend")
        if done >= cap:
            break
        add(cfg)
        if progress:
            progress(n_round, done + 1, planned)
    # blends of the best singles so far (this round's and earlier rounds')
    allrows = list(scored.values()) + rows
    for market in ("spread", "total"):
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
    append_rows(path("SCORES.csv"), SCORE_COLS, rows)
    allrows = list(scored.values()) + rows
    picks = shortlist(allrows, data, S, fc)
    for cfg, r in picks:
        write_candidate(cfg, r, n_round)
    best = {}
    for market in ("spread", "total"):
        b = max((r for r in allrows if r["market"] == market), key=lambda r: float(r["t"]), default=None)
        best[market] = b
    number, url = L.run_info()
    append_rows(path("ROUNDS.csv"), ROUND_COLS, [{
        "round": n_round, "at": L.now(), "data_through": C.SEARCH[1], "scored_new": len(rows),
        "scored_total": len(allrows), "best_spread_id": best["spread"]["id"] if best["spread"] else "",
        "best_spread_t": best["spread"]["t"] if best["spread"] else "",
        "best_total_id": best["total"]["id"] if best["total"] else "",
        "best_total_t": best["total"]["t"] if best["total"] else "",
        "shortlisted": " ".join(config_id(c) for c, _ in picks), "run_url": url or ""}])
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
    for market in ("spread", "total"):
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
                    "srs": "SRS", "ppa": "PPA rating", "blend": "Blend"}.get(cfg["type"], cfg["type"]) + " · search",
         "parent": None,
         "reason": (f"Found by search round {n_round}: on {C.SEARCH[0]}–{C.SEARCH[1]} it beat the line by "
                    f"{float(r['effect']):+.2f} pts a game (t = {float(r['t']):.2f}), positive in all three search "
                    f"periods. Now confirmed on {C.GATES[0][1]}–{C.GATES[-1][2]}, which the search never saw."),
         "source": f"automatic search ({C.SPORT}, Constitution v7 A3.3c)",
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
             f"{C.SEARCH[1]} only: effect = cover points per game beyond the line-only baseline, t = effect ÷ its "
             "standard error. Thousands of tries mean the best t here is partly luck: that is why only the shortlist "
             "is confirmed, on seasons the search never saw._", "",
             f"{len(allrows)} configurations scored so far.", ""]
    for market in ("spread", "total"):
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
    ap.add_argument("cmd", choices=["round"])
    ap.add_argument("--force", action="store_true", help="run a round even if the last one was under 20 hours ago")
    ap.add_argument("--sport", default=os.environ.get("LAB_SPORT", "NFL"), help="NFL (Part B) or CFB (Part C)")
    ap.add_argument("--progress", action="store_true", help="post the round's progress to /lab (GitHub Actions)")
    a = ap.parse_args(argv)
    C.use(a.sport)
    run_round(force=a.force, progress=Progress() if a.progress else None)
    return 0


class Progress:
    """Posts a running search round to /lab: once at the start, then at most every `every` seconds (status.json only
    changes; the scores are written when the round ends). A failed push never stops the search."""

    def __init__(self, every=180):
        self.every, self.last, self.started = every, 0.0, L.now()

    def __call__(self, n_round, done, planned):
        import time
        now = time.time()
        if done and now - self.last < self.every:
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
