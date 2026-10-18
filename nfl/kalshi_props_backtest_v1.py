#!/usr/bin/env python3
"""
kalshi_props_backtest_v1.py -- runs the pre-registered back-test NFL_PROPS_KALSHI_BACKTEST_V1
(nfl/NFL_PROPS_KALSHI_BACKTEST_V1_PREREG.md) on the settled Kalshi prop markets collected by
nfl/kalshi_props_history_v1.py. Written and committed before any result was computed.

Run from the repo root (GitHub Actions):  python3 nfl/kalshi_props_backtest_v1.py
Inputs : nfl/props_history/kalshi_props_history_v1.csv, nfl/nfl_props_model_v1_tables.json,
         nfl/NFL_PROPS_KALSHI_BACKTEST_V1_PREREG.md, nflverse play-by-play + rosters (downloaded).
Outputs: nfl/props_history/backtest_v1_results.json and backtest_v1_results.md

Implementation choices the prereg does not spell out, fixed here before running:
- A player's expected value uses his games in that role from season S-3 through the game date (same window as the
  live test, which loads 2023-2026 for 2026), strictly before the game date.
- Tables for a season S < 2026 are refit with the v1 method on 2016..S-1: add_expectations over 2016..S-1
  play-by-play, then fit_ratio_tables(min_prev=3). For S = 2026 the frozen tables file is used (sha checked).
  As a reproducibility check the same refit is also run for 2026 and compared with the frozen file (reported only).
- Each bootstrap uses its own numpy default_rng(20261018), resampling games (date_away_home) with replacement.
- Test 2 uses the app's label rules exactly as the app computes them (propEdge): model chance, two-sided Kalshi
  price with 0 < ask < 1, 21+ prior games, open interest >= 100, stat not touchdowns, |model - mid| <= 0.20, side
  with the bigger edge, edge >= 0.02; then one line per player per stat per game (biggest edge). No spread limit.
"""
import csv, hashlib, json, os, re, sys, unicodedata, urllib.request
from collections import defaultdict
import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import nfl_props_model_lib_v1 as L  # noqa: E402

DATA = os.path.join(HERE, "props_history", "kalshi_props_history_v1.csv")
TABLES = os.path.join(HERE, "nfl_props_model_v1_tables.json")
PREREG = os.path.join(HERE, "NFL_PROPS_KALSHI_BACKTEST_V1_PREREG.md")
OUT_JSON = os.path.join(HERE, "props_history", "backtest_v1_results.json")
OUT_MD = os.path.join(HERE, "props_history", "backtest_v1_results.md")
CACHE = os.path.join(HERE, ".nflverse_cache")
NFLVERSE = "https://github.com/nflverse/nflverse-data/releases/download/"
FROZEN_SHA = "d566c111331235218182c708c7e353a4c0983e65e7ba10fd7b48aaaa3e3a1743"
FIRST_SEASON, FROZEN_SEASON = 2016, 2026
PICK_STATS = ["passing_yards", "passing_tds", "passing_attempts", "passing_completions", "interceptions",
              "rushing_yards", "rushing_attempts", "receiving_yards", "receptions", "rush_rec_yards"]
MIN_PREV, MIN_PREV_PICK, MAX_SPREAD, MIN_OI, MAX_GAP = 3, 21, 0.10, 100.0, 0.20
CLIP, DRAWS, SEED = (0.01, 0.99), 10000, 20261018
KALSHI_CODES = {"JAX": ["JAX", "JAC"], "LA": ["LAR", "LA"], "WAS": ["WAS", "WSH"], "LV": ["LV", "LVR"]}


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def fetch(rel, name):
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, name)
    if not os.path.exists(p):
        req = urllib.request.Request(NFLVERSE + rel, headers={"User-Agent": "nfl-props-backtest/1.0"})
        with urllib.request.urlopen(req, timeout=180) as r, open(p, "wb") as f:
            f.write(r.read())
    return p


def norm(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z ]", "", s.replace("-", " ").replace(".", ""))
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", s)
    return re.sub(r"\s+", " ", s).strip()


def fnum(x):
    try:
        v = float(x)
        return v if v == v else None
    except (TypeError, ValueError):
        return None


def fee(p):
    return 0.07 * p * (1 - p)


_pbp = {}


def pbp(season):
    if season not in _pbp:
        _pbp[season] = L.load_pbp(fetch(f"pbp/play_by_play_{season}.csv.gz", f"pbp_{season}.csv.gz"))
    return _pbp[season]


def player_games(seasons):
    return L.player_games(pd.concat([pbp(s) for s in seasons], ignore_index=True))


def refit_tables(season):
    """v1 method on 2016..season-1."""
    pg = L.add_expectations(player_games(range(FIRST_SEASON, season)))
    return L.fit_ratio_tables(pg, min_prev=3)


def tables_equal(a, b):
    if set(a) != set(b):
        return False
    for s in a:
        if not np.allclose(a[s]["edges"], b[s]["edges"], atol=1e-9) or len(a[s]["ratios"]) != len(b[s]["ratios"]):
            return False
        if any(len(x) != len(y) or not np.allclose(x, y, atol=1e-4) for x, y in zip(a[s]["ratios"], b[s]["ratios"])):
            return False
    return True


def roster_map(season):
    r = pd.read_csv(fetch(f"rosters/roster_{season}.csv", f"roster_{season}.csv"), low_memory=False)
    m = {}
    for row in r.itertuples(index=False):
        if not isinstance(row.gsis_id, str):
            continue
        for nm in {row.full_name, getattr(row, "football_name", None) and f"{row.football_name} {row.last_name}"}:
            if isinstance(nm, str):
                m.setdefault((norm(nm), row.team), set()).add(row.gsis_id)
                m.setdefault((norm(nm), None), set()).add(row.gsis_id)
    return m


def slug_team(slug, away, home):
    """Team from the Kalshi ticker's player part (e.g. JACNBOERKIRCHER87): the longest matching team code."""
    best, blen = None, 0
    for t in (away, home):
        for c in KALSHI_CODES.get(t, [t]):
            if str(slug).startswith(c) and len(c) > blen:
                best, blen = t, len(c)
    return best


def logloss(p, y):
    p = np.clip(p, *CLIP)
    return -(y * np.log(p) + (1 - y) * np.log(1 - p))


def boot_mean_diff(games, a, b):
    """95% game-bootstrap interval for mean(a - b) over rows, resampling games."""
    keys = sorted(set(games))
    idx = {k: i for i, k in enumerate(keys)}
    gi = np.array([idx[g] for g in games])
    sa, sb, cnt = (np.bincount(gi, weights=w, minlength=len(keys)) for w in (a, b, np.ones(len(gi))))
    rng = np.random.default_rng(SEED)
    pick = rng.integers(0, len(keys), size=(DRAWS, len(keys)))
    w = np.apply_along_axis(np.bincount, 1, pick, minlength=len(keys))
    d = (w @ sa - w @ sb) / (w @ cnt)
    return [float(np.percentile(d, 2.5)), float(np.percentile(d, 97.5))]


def boot_ratio(games, num, den):
    keys = sorted(set(games))
    idx = {k: i for i, k in enumerate(keys)}
    gi = np.array([idx[g] for g in games])
    sn, sd = (np.bincount(gi, weights=w, minlength=len(keys)) for w in (num, den))
    rng = np.random.default_rng(SEED)
    pick = rng.integers(0, len(keys), size=(DRAWS, len(keys)))
    w = np.apply_along_axis(np.bincount, 1, pick, minlength=len(keys))
    r = (w @ sn) / np.maximum(w @ sd, 1e-12)
    return [float(np.percentile(r, 2.5)), float(np.percentile(r, 97.5))]


def label_edge(r):
    """The app's propEdge, unchanged in substance (no injury filter: none available historically)."""
    mp, kb, ka = r["model_p"], r["bid"], r["ask"]
    if mp is None or kb is None or ka is None or not (0 < ka < 1):
        return None
    if r["stat"] not in PICK_STATS or r["n"] < MIN_PREV_PICK or (r["oi"] or 0) < MIN_OI:
        return None
    if abs(mp - (kb + ka) / 2) > MAX_GAP:
        return None
    no_ask = round(1 - kb, 4)
    eo, eu = mp - ka - fee(ka), (1 - mp) - no_ask - fee(no_ask)
    side, ev = ("OVER", eo) if eo >= eu else ("UNDER", eu)
    if ev < 0.02:
        return None
    return {"side": side, "ev": ev, "price": ka if side == "OVER" else no_ask,
            "tier": "HIGH" if ev >= 0.10 else ("MEDIUM" if ev >= 0.05 else "LEAN")}


def roi_block(bets):
    if not bets:
        return {"count": 0}
    games = [b["game"] for b in bets]
    cost = np.array([b["price"] + fee(b["price"]) for b in bets])
    won = np.array([b["won"] for b in bets], dtype=float)
    profit = won * (1 - cost) - (1 - won) * cost
    return {"count": len(bets), "games": len(set(games)), "win_rate": round(float(won.mean()), 4),
            "avg_needs_pct": round(float(cost.mean() * 100), 2), "profit_sum": round(float(profit.sum()), 3),
            "cost_sum": round(float(cost.sum()), 3), "roi": round(float(profit.sum() / cost.sum()), 4),
            "roi_95ci": [round(x, 4) for x in boot_ratio(games, profit, cost)]}


def main():
    rows = list(csv.DictReader(open(DATA)))
    out = {"doc": "NFL_PROPS_KALSHI_BACKTEST_V1", "prereg_sha256": sha(PREREG), "script_sha256": sha(__file__),
           "data_sha256": sha(DATA), "tables_sha256": sha(TABLES), "funnel": {}}
    assert out["tables_sha256"] == FROZEN_SHA, "frozen tables file changed"
    funnel = out["funnel"]
    funnel["collected"] = len(rows)
    rows = [r for r in rows if r["result"] in ("yes", "no") and r["stat"] in L.STATS]
    funnel["settled_yes_no_modeled_stat"] = len(rows)
    seasons = sorted({int(r["season"]) for r in rows})
    out["seasons"] = seasons

    frozen = json.load(open(TABLES))["tables"]
    tables_by_season, repro = {}, None
    for s in seasons:
        tables_by_season[s] = frozen if s == FROZEN_SEASON else refit_tables(s)
    if FROZEN_SEASON in seasons:
        repro = tables_equal(refit_tables(FROZEN_SEASON), frozen)
    out["refit_reproduces_frozen_2026_tables"] = repro

    scored = []
    unmatched = 0
    for s in seasons:
        rmap = roster_map(s)
        pg = player_games(range(s - 3, s + 1))
        srows = [r for r in rows if int(r["season"]) == s]
        for date in sorted({r["game_date"] for r in srows}):
            exp = L.next_game_expectations(pg, pd.Timestamp(date))
            for r in (x for x in srows if x["game_date"] == date):
                team = slug_team(r["player_slug"], r["away_team"], r["home_team"])
                ids = rmap.get((norm(r["player"]), team), set()) if team else set()
                if not ids:
                    for t in (r["away_team"], r["home_team"]):
                        ids |= rmap.get((norm(r["player"]), t), set())
                if not ids:
                    ids = rmap.get((norm(r["player"]), None), set())
                pid = next(iter(ids)) if len(ids) == 1 else None
                if pid is None:
                    unmatched += 1
                e = exp.get(pid, {}) if pid else {}
                ev, n = e.get("exp_" + r["stat"]), int(e.get("n_" + r["stat"], 0) or 0)
                line = float(r["line"])
                mp = L.p_over(tables_by_season[s], r["stat"], ev, line) if (pid and n >= MIN_PREV) else None
                scored.append({"game": f'{r["game_date"]}_{r["away_team"]}_{r["home_team"]}', "season": s,
                               "stat": r["stat"], "player": r["player"], "line": line, "n": n, "model_p": mp,
                               "bid": fnum(r["yes_bid"]), "ask": fnum(r["yes_ask"]), "oi": fnum(r["open_interest"]),
                               "y": 1 if r["result"] == "yes" else 0})
    funnel["player_unmatched"] = unmatched
    funnel["model_chance_exists"] = sum(1 for r in scored if r["model_p"] is not None)

    def main_set(r, stats):
        return (r["model_p"] is not None and r["n"] >= MIN_PREV_PICK and r["stat"] in stats and
                r["bid"] is not None and r["ask"] is not None and 0 < r["bid"] < r["ask"] < 1 and
                r["ask"] - r["bid"] <= MAX_SPREAD and (r["oi"] or 0) >= MIN_OI)

    # ---- Test 1 ----
    def t1(rs):
        if not rs:
            return {"rows": 0}
        y = np.array([r["y"] for r in rs], float)
        lm = logloss(np.array([r["model_p"] for r in rs]), y)
        lk = logloss(np.array([(r["bid"] + r["ask"]) / 2 for r in rs]), y)
        res = {"rows": len(rs), "games": len({r["game"] for r in rs}), "model_logloss": round(float(lm.mean()), 5),
               "kalshi_logloss": round(float(lk.mean()), 5), "diff_model_minus_kalshi": round(float((lm - lk).mean()), 5)}
        if res["games"] >= 2:
            res["diff_95ci"] = [round(x, 5) for x in boot_mean_diff([r["game"] for r in rs], lm, lk)]
        return res
    main_rows = [r for r in scored if main_set(r, PICK_STATS)]
    funnel["main_set"] = len(main_rows)
    test1 = t1(main_rows)
    if test1["rows"] < 300 or test1.get("games", 0) < 30:
        verdict1 = "INCONCLUSIVE"
    elif test1["diff_95ci"][1] < 0:
        verdict1 = "MODEL MORE RIGHT"
    elif test1["diff_95ci"][0] > 0:
        verdict1 = "KALSHI MORE RIGHT"
    else:
        verdict1 = "TOO CLOSE TO CALL"
    test1["verdict"] = verdict1
    test1["by_season"] = {str(s): t1([r for r in main_rows if r["season"] == s]) for s in seasons}
    test1["by_stat"] = {st: t1([r for r in main_rows if r["stat"] == st]) for st in PICK_STATS}
    out["test1"] = test1
    out["touchdowns_info_only"] = t1([r for r in scored if main_set(r, ["touchdowns"])])

    # ---- Test 2 ----
    best = {}
    for r in scored:
        e = label_edge(r)
        if not e:
            continue
        k = (r["game"], r["player"], r["stat"])
        if k not in best or e["ev"] > best[k][1]["ev"]:
            best[k] = (r, e)
    bets = [{"game": r["game"], "season": r["season"], "stat": r["stat"], "tier": e["tier"], "price": e["price"],
             "won": (r["y"] == 1) if e["side"] == "OVER" else (r["y"] == 0), "side": e["side"]} for r, e in best.values()]
    mh = [b for b in bets if b["tier"] in ("MEDIUM", "HIGH")]
    test2 = {"medium_plus_high": roi_block(mh)}
    for t in ("HIGH", "MEDIUM", "LEAN"):
        test2[t] = roi_block([b for b in bets if b["tier"] == t])
    ci = test2["medium_plus_high"].get("roi_95ci")
    if test1["verdict"] == "INCONCLUSIVE":
        test2["verdict"] = "INCONCLUSIVE"
    else:
        test2["verdict"] = "MEDIUM + HIGH PROFITABLE" if ci and ci[0] > 0 else "NOT SHOWN PROFITABLE"
    test2["mh_by_season"] = {str(s): roi_block([b for b in mh if b["season"] == s]) for s in seasons}
    test2["mh_by_stat"] = {st: roi_block([b for b in mh if b["stat"] == st]) for st in PICK_STATS}
    test2["mh_by_side"] = {sd: roi_block([b for b in mh if b["side"] == sd]) for sd in ("OVER", "UNDER")}
    out["test2"] = test2

    os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
    json.dump(out, open(OUT_JSON, "w"), indent=1)
    md = [f"# NFL_PROPS_KALSHI_BACKTEST_V1 results", "",
          f"Prereg sha256 `{out['prereg_sha256']}` · seasons {seasons} · refit reproduces frozen 2026 tables: {repro}", "",
          f"Funnel: {json.dumps(funnel)}", "",
          f"## Test 1 (primary): {test1['verdict']}",
          f"Main set {test1['rows']} rows / {test1.get('games', 0)} games. Model log loss {test1.get('model_logloss')}, "
          f"Kalshi mid {test1.get('kalshi_logloss')}, difference {test1.get('diff_model_minus_kalshi')} "
          f"(95% CI {test1.get('diff_95ci')}). Negative = model more right.", "",
          f"## Test 2: {test2['verdict']}",
          f"MEDIUM + HIGH: {json.dumps(test2['medium_plus_high'])}",
          f"HIGH: {json.dumps(test2['HIGH'])}", f"MEDIUM: {json.dumps(test2['MEDIUM'])}", f"LEAN: {json.dumps(test2['LEAN'])}", "",
          "This is a back-test on past prices; it cannot replace the live paper test."]
    open(OUT_MD, "w").write("\n".join(md) + "\n")
    print("\n".join(md))


if __name__ == "__main__":
    main()
