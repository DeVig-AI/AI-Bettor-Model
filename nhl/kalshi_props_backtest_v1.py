#!/usr/bin/env python3
"""
kalshi_props_backtest_v1.py -- runs the pre-registered back-test NHL_PROPS_KALSHI_BACKTEST_V1
(nhl/NHL_PROPS_KALSHI_BACKTEST_V1_PREREG.md) on the settled Kalshi NHL prop markets collected by
nhl/kalshi_props_history_v1.py. Written and committed before any past price was collected. Same design as
nba/kalshi_props_backtest_v1.py.

Run from the repo root (GitHub Actions):  python3 nhl/kalshi_props_backtest_v1.py
Inputs : nhl/props_history/kalshi/*.csv, nhl/data/player_games_*.csv.gz, nhl/nhl_props_model_v1_tables.json (settings
         and the reproducibility check), nhl/NHL_PROPS_KALSHI_BACKTEST_V1_PREREG.md.
Outputs: nhl/props_history/backtest_v1_results.json, backtest_v1_results.md, backtest_v1_main_rows.csv

Fixed here before running (the prereg says the same in words):
- Settings (spans, shrink, method) are the frozen model's, read from its tables file.
- Tables for season S: the frozen method on box scores of seasons 2010..S-1 (ratio method only; the Poisson method has
  no tables). Expectations: every played game from 2010-11 on, strictly before the game date.
- Players are matched by full name (first + last, from the NHL rosters); several matches -> the one whose last team is
  in the game; otherwise unmatched.
- Each bootstrap: its own numpy default_rng(20261021), resampling games (game_id) with replacement.
"""
import csv, glob, hashlib, json, os, sys
import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import nhl_props_model_lib_v1 as L  # noqa: E402
import nhl_kalshi_common_v1 as K  # noqa: E402

DATA_GLOB = os.path.join(HERE, "props_history", "kalshi", "*.csv")
TABLES = os.path.join(HERE, "nhl_props_model_v1_tables.json")
PREREG = os.path.join(HERE, "NHL_PROPS_KALSHI_BACKTEST_V1_PREREG.md")
OUT_JSON = os.path.join(HERE, "props_history", "backtest_v1_results.json")
OUT_MD = os.path.join(HERE, "props_history", "backtest_v1_results.md")
OUT_ROWS = os.path.join(HERE, "props_history", "backtest_v1_main_rows.csv")
FIRST_SEASON = 2010
GAME_TYPES = {"2", "3"}
PICK_STATS = ["goals", "assists", "points"]
MIN_PREV, MIN_PREV_PICK, STALE_DAYS = 5, 40, 30
MIN_OI, MAX_SPREAD, MAX_GAP, MIN_EV, FEE_RATE = 100.0, 0.10, 0.20, 0.05, 0.07
MIN_ROWS, MIN_GAMES, MIN_PICKS = 300, 30, 150
CLIP, DRAWS, SEED = (0.01, 0.99), 10000, 20261021


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def fnum(x):
    try:
        v = float(x)
        return v if v == v else None
    except (TypeError, ValueError):
        return None


def fee(p):
    return FEE_RATE * p * (1 - p)


def logloss(p, y):
    p = np.clip(p, *CLIP)
    return -(y * np.log(p) + (1 - y) * np.log(1 - p))


def _boot_weights(games):
    keys = sorted(set(games))
    idx = {k: i for i, k in enumerate(keys)}
    gi = np.array([idx[g] for g in games])
    k = len(keys)
    rng = np.random.default_rng(SEED)
    pick = rng.integers(0, k, size=(DRAWS, k))
    w = np.bincount((pick + np.arange(DRAWS)[:, None] * k).ravel(), minlength=DRAWS * k).reshape(DRAWS, k)
    return gi, k, w.astype(float)


def boot_ratio(games, num, den):
    gi, k, w = _boot_weights(games)
    sn, sd = (np.bincount(gi, weights=x, minlength=k) for x in (num, den))
    r = (w @ sn) / np.maximum(w @ sd, 1e-12)
    return [float(np.percentile(r, 2.5)), float(np.percentile(r, 97.5))]


def tables_equal(a, b):
    if set(a) != set(b):
        return False
    for s in a:
        if not np.allclose(a[s]["edges"], b[s]["edges"], atol=1e-9) or a[s]["n"] != b[s]["n"]:
            return False
        if any(len(x) != len(y) or not np.allclose(x, y, atol=1e-4) for x, y in zip(a[s]["q"], b[s]["q"])):
            return False
    return True


def load_rows(funnel):
    rows = []
    for p in sorted(glob.glob(DATA_GLOB)):
        rows += list(csv.DictReader(open(p)))
    funnel["collected"] = len(rows)
    rows = [r for r in rows if r["result"] in ("yes", "no")]
    funnel["settled_yes_no"] = len(rows)
    rows = [r for r in rows if r["game_type"] in GAME_TYPES and r["stat"] in PICK_STATS]
    funnel["nhl_game_types_prop_stat"] = len(rows)
    best = {}
    for r in rows:
        k = (r["game_id"], K.norm(r["player"]), r["stat"], round(float(r["line"]), 1))
        oi = fnum(r["open_interest"])
        r["_oi"] = -1.0 if oi is None else oi
        if k not in best or (r["_oi"], best[k]["ticker"]) > (best[k]["_oi"], r["ticker"]):
            best[k] = r                                  # larger open interest wins; tie -> first ticker
    funnel["after_dedup"] = len(best)
    return list(best.values())


def score(rows, funnel, out, P):
    seasons = sorted({int(r["season"]) for r in rows})
    pg = L.player_games(L.load_games(seasons=range(FIRST_SEASON, max(seasons) + 1)))
    pg["full"] = (pg["first_name"].fillna("") + " " + pg["last_name"].fillna("")).map(K.norm)
    tables = {}
    if P["method"] == "ratio":
        for s in seasons:
            tables[s] = L.fit_ratio_tables(L.add_expectations(pg[pg.season < s], P["span_short"], P["span_long"],
                                                              P["shrink_k"]), min_prev=5)
        frozen_fit = max(P["fit_seasons"])
        refit = L.fit_ratio_tables(L.add_expectations(pg[pg.season <= frozen_fit], P["span_short"], P["span_long"],
                                                      P["shrink_k"]), min_prev=5)
        out["refit_reproduces_frozen_tables"] = tables_equal(refit, json.load(open(TABLES))["tables"])
    out["tables_fit_seasons"] = {str(s): f"{FIRST_SEASON}-{s - 1}" for s in seasons}
    scored, unmatched = [], 0
    for date in sorted({r["game_date"] for r in rows}):
        as_of = pd.Timestamp(date)
        hist = pg[pg["game_date"] < as_of]
        last = hist.sort_values(["game_date", "game_id"]).groupby("player_id").tail(1)
        by_name = {}
        for pid, nm in zip(last["player_id"], last["full"]):
            by_name.setdefault(nm, []).append(pid)
        drows = [r for r in rows if r["game_date"] == date]
        need = {p for r in drows for p in by_name.get(K.norm(r["player"]), [])}
        exp = L.next_game_expectations(hist[hist["player_id"].isin(need)], as_of, P["span_short"], P["span_long"],
                                       P["shrink_k"]) if need else {}
        for r in drows:
            cands = [p for p in by_name.get(K.norm(r["player"]), []) if p in exp]
            if len(cands) > 1:
                cands = [p for p in cands if exp[p]["team"] in (r["away_team"], r["home_team"])]
            pid = cands[0] if len(cands) == 1 else None
            unmatched += int(pid is None)
            e = exp.get(pid, {}) if pid else {}
            ev, n = e.get("exp_" + r["stat"]), int(e.get("n", 0) or 0)
            s = int(r["season"])
            mp = L.p_over(P["method"], tables.get(s, {}), r["stat"], ev, float(r["line"])) if (pid and n >= MIN_PREV) else None
            days = (as_of - e["last_game"]).days if e.get("last_game") is not None else None
            scored.append({"game": r["game_id"], "season": s, "stat": r["stat"], "player": r["player"], "pid": pid,
                           "line": float(r["line"]), "n": n, "days_since": days, "expected": None if ev is None else float(ev),
                           "model_p": mp, "bid": fnum(r["yes_bid"]), "ask": fnum(r["yes_ask"]),
                           "oi": fnum(r["open_interest"]), "y": 1 if r["result"] == "yes" else 0, "ticker": r["ticker"]})
    funnel["player_unmatched"] = unmatched
    funnel["model_chance_exists"] = sum(1 for r in scored if r["model_p"] is not None)
    return seasons, scored


def in_set(r, gap=True):
    return (r["model_p"] is not None and r["stat"] in PICK_STATS and r["n"] >= MIN_PREV_PICK and
            r["days_since"] is not None and r["days_since"] <= STALE_DAYS and (r["oi"] or 0) >= MIN_OI and
            r["bid"] is not None and r["ask"] is not None and 0 < r["bid"] < r["ask"] < 1 and
            r["ask"] - r["bid"] <= MAX_SPREAD and (not gap or abs(r["model_p"] - (r["bid"] + r["ask"]) / 2) <= MAX_GAP))


def t1(rs):
    if not rs:
        return {"rows": 0, "games": 0}
    y = np.array([r["y"] for r in rs], float)
    lm = logloss(np.array([r["model_p"] for r in rs]), y)
    lk = logloss(np.array([(r["bid"] + r["ask"]) / 2 for r in rs]), y)
    res = {"rows": len(rs), "games": len({r["game"] for r in rs}), "yes_rate": round(float(y.mean()), 4),
           "model_logloss": round(float(lm.mean()), 5), "kalshi_logloss": round(float(lk.mean()), 5),
           "diff_model_minus_kalshi": round(float((lm - lk).mean()), 5)}
    if res["games"] >= 2:
        res["diff_95ci"] = [round(x, 5) for x in boot_ratio([r["game"] for r in rs], lm - lk, np.ones(len(rs)))]
    return res


def roi_block(bets):
    if not bets:
        return {"count": 0}
    games = [b["game"] for b in bets]
    cost = np.array([b["price"] + fee(b["price"]) for b in bets])
    won = np.array([b["won"] for b in bets], dtype=float)
    profit = won * (1 - cost) - (1 - won) * cost
    return {"count": len(bets), "games": len(set(games)), "win_rate": round(float(won.mean()), 4),
            "avg_cost": round(float(cost.mean()), 4), "avg_ev": round(float(np.mean([b["ev"] for b in bets])), 4),
            "profit_sum": round(float(profit.sum()), 3), "cost_sum": round(float(cost.sum()), 3),
            "roi": round(float(profit.sum() / cost.sum()), 4),
            "roi_95ci": [round(x, 4) for x in boot_ratio(games, profit, cost)] if len(set(games)) >= 2 else None}


def picks(rows):
    """The live rule: EV after fee >= 0.05, one line + side per player per stat per game (highest EV)."""
    best = {}
    for r in rows:
        no_ask = round(1 - r["bid"], 4)
        for side, ev, price in (("OVER", r["model_p"] - r["ask"] - fee(r["ask"]), r["ask"]),
                                ("UNDER", (1 - r["model_p"]) - no_ask - fee(no_ask), no_ask)):
            if ev >= MIN_EV:
                k = (r["game"], r["pid"], r["stat"])
                if k not in best or ev > best[k]["ev"]:
                    best[k] = {"game": r["game"], "season": r["season"], "stat": r["stat"], "side": side, "ev": ev,
                               "price": price, "won": (r["y"] == 1) if side == "OVER" else (r["y"] == 0)}
    return list(best.values())


def main():
    frozen = json.load(open(TABLES))
    P = frozen["params"]
    out = {"doc": "NHL_PROPS_KALSHI_BACKTEST_V1", "prereg_sha256": sha(PREREG), "script_sha256": sha(__file__),
           "data_files": {os.path.basename(p): sha(p) for p in sorted(glob.glob(DATA_GLOB))},
           "frozen_tables_sha256": sha(TABLES), "params": P, "funnel": {}}
    funnel = out["funnel"]
    rows = load_rows(funnel)
    cov = {}
    for r in rows:
        c = cov.setdefault(r["season"], {"games": set(), "markets": 0, "with_price": 0, "first": r["game_date"],
                                         "last": r["game_date"], "by_stat": {}, "by_type": {}})
        c["games"].add(r["game_id"]); c["markets"] += 1; c["with_price"] += int(r["yes_ask"] not in ("", None))
        c["first"], c["last"] = min(c["first"], r["game_date"]), max(c["last"], r["game_date"])
        c["by_stat"][r["stat"]] = c["by_stat"].get(r["stat"], 0) + 1
        c["by_type"][r["game_type"]] = c["by_type"].get(r["game_type"], 0) + 1
    out["coverage"] = {s: dict(c, games=len(c["games"])) for s, c in sorted(cov.items())}
    out["coverage_total_games"] = len({r["game_id"] for r in rows})
    seasons, scored = score(rows, funnel, out, P)
    out["seasons"] = seasons

    main_rows = [r for r in scored if in_set(r)]
    funnel["main_set"] = len(main_rows)
    test1 = t1(main_rows)
    small = test1["rows"] < MIN_ROWS or test1["games"] < MIN_GAMES
    if small:
        test1["verdict"] = "INCONCLUSIVE"
    elif test1["diff_95ci"][1] < 0:
        test1["verdict"] = "MODEL MORE RIGHT"
    elif test1["diff_95ci"][0] > 0:
        test1["verdict"] = "KALSHI MORE RIGHT"
    else:
        test1["verdict"] = "TOO CLOSE TO CALL"
    test1["by_season"] = {str(s): t1([r for r in main_rows if r["season"] == s]) for s in seasons}
    test1["by_stat"] = {st: t1([r for r in main_rows if r["stat"] == st]) for st in PICK_STATS}
    test1["by_line"] = {str(ln): t1([r for r in main_rows if r["line"] == ln])
                        for ln in sorted({r["line"] for r in main_rows})}
    out["test1"] = test1
    out["info_only"] = {"test1_no_gap_filter": t1([r for r in scored if in_set(r, gap=False)])}

    bets = picks(main_rows)
    test2 = {"all": roi_block(bets)}
    ci = test2["all"].get("roi_95ci")
    if small or test2["all"]["count"] < MIN_PICKS:
        test2["verdict"] = "INCONCLUSIVE"
    else:
        test2["verdict"] = "PROFITABLE" if ci and ci[0] > 0 else "NOT SHOWN PROFITABLE"
    test2["by_side"] = {sd: roi_block([b for b in bets if b["side"] == sd]) for sd in ("OVER", "UNDER")}
    test2["by_stat"] = {st: roi_block([b for b in bets if b["stat"] == st]) for st in PICK_STATS}
    test2["by_season"] = {str(s): roi_block([b for b in bets if b["season"] == s]) for s in seasons}
    out["test2"] = test2
    out["info_only"]["live_pass_bar_met"] = bool(ci and ci[0] > 0 and test1.get("diff_model_minus_kalshi", 1) < 0)

    os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
    json.dump(out, open(OUT_JSON, "w"), indent=1, default=str)
    cols = ["game", "season", "stat", "player", "pid", "line", "n", "days_since", "expected", "model_p", "bid", "ask",
            "oi", "y", "ticker"]
    with open(OUT_ROWS, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in main_rows:
            w.writerow({k: r[k] for k in cols})

    def j(x):
        return json.dumps(x, default=str)
    md = ["# NHL_PROPS_KALSHI_BACKTEST_V1 results", "",
          f"Prereg sha256 `{out['prereg_sha256']}` · model {j(P)} · seasons {seasons} (tables {out['tables_fit_seasons']})"
          + (f" · refit reproduces the frozen tables: {out.get('refit_reproduces_frozen_tables')}"
             if "refit_reproduces_frozen_tables" in out else ""), "",
          f"Kalshi NHL prop history found: {out['coverage_total_games']} games. Coverage: {j(out['coverage'])}", "",
          f"Funnel: {j(funnel)}", "",
          f"## Test 1 (primary): {test1['verdict']}",
          f"Main set {test1['rows']} rows / {test1['games']} games. Model log loss {test1.get('model_logloss')}, "
          f"Kalshi mid {test1.get('kalshi_logloss')}, difference {test1.get('diff_model_minus_kalshi')} "
          f"(95% CI {test1.get('diff_95ci')}). Negative = model more right.", "",
          "By season: " + j(test1["by_season"]), "", "By stat: " + j(test1["by_stat"]), "", "By line: " + j(test1["by_line"]), "",
          f"## Test 2: {test2['verdict']}", f"All picks: {j(test2['all'])}", "", f"By side: {j(test2['by_side'])}", "",
          f"By stat: {j(test2['by_stat'])}", "", f"By season: {j(test2['by_season'])}", "",
          "## Information only", j(out["info_only"]), "",
          "No injury filter (no historical injury reports). This is a back-test on past prices; it cannot replace the "
          "live paper test."]
    open(OUT_MD, "w").write("\n".join(md) + "\n")
    print("\n".join(md))


if __name__ == "__main__":
    main()
