#!/usr/bin/env python3
"""
kalshi_props_backtest_v2.py -- NBA_PROPS_KALSHI_BACKTEST_V2 (prereg nba/NBA_PROPS_KALSHI_BACKTEST_V2_PREREG.md).

Rows and v1 chances come from the v1 back-test's own code (unchanged). v2 chances come from the frozen
nba/nba_props_model_v2_T2026.json.gz with inputs built from box scores before each game plus tonight's availability.

Run from the repo root:  python3 nba/kalshi_props_backtest_v2.py
Output: nba/props_history/backtest_v2_results.{json,md}, backtest_v2_rows.csv
"""
import csv, json, os, sys
import numpy as np
import pandas as pd
from scipy.optimize import minimize

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import kalshi_props_backtest_v1 as B1  # noqa: E402
import nba_props_model_lib_v1 as V1  # noqa: E402
_V1_STATS = list(V1.STATS)
import nba_props_fit_v2 as F  # noqa: E402
V1.STATS = _V1_STATS            # the v2 design module narrows this on import; the v1 scoring needs all 12 stats

PREREG = os.path.join(HERE, "NBA_PROPS_KALSHI_BACKTEST_V2_PREREG.md")
MODEL = F.out_path(2026)
OUT_JSON = os.path.join(HERE, "props_history", "backtest_v2_results.json")
OUT_MD = os.path.join(HERE, "props_history", "backtest_v2_results.md")
OUT_ROWS = os.path.join(HERE, "props_history", "backtest_v2_rows.csv")
STATS = ["points", "rebounds", "assists", "threes"]
SEED, DRAWS, C_DRAWS = 20261022, 10000, 1000
SPLIT = "2026-02-15"
T_GRID, T_DEFAULT, MIN_LEARN_PICKS = [0.02, 0.03, 0.04, 0.06], 0.03, 100
CLIP = (0.01, 0.99)
B1.SEED = SEED                  # every bootstrap in this file uses this prereg's seed


def logit(p):
    p = np.clip(p, *CLIP)
    return np.log(p / (1 - p))


def compare(rs, a, b, words):
    """Log loss of chance column a vs b, game bootstrap of the mean difference."""
    if not rs:
        return {"rows": 0, "games": 0}
    y = np.array([r["y"] for r in rs], float)
    la = B1.logloss(np.array([r[a] for r in rs], float), y)
    lb = B1.logloss(np.array([r[b] for r in rs], float), y)
    res = {"rows": len(rs), "games": len({r["game"] for r in rs}), "yes_rate": round(float(y.mean()), 4),
           f"{a}_logloss": round(float(la.mean()), 5), f"{b}_logloss": round(float(lb.mean()), 5),
           f"diff_{a}_minus_{b}": round(float((la - lb).mean()), 5)}
    if res["games"] >= 2:
        ci = [round(x, 5) for x in B1.boot_ratio([r["game"] for r in rs], la - lb, np.ones(len(rs)))]
        res["diff_95ci"] = ci
        if res["rows"] < B1.MIN_ROWS or res["games"] < B1.MIN_GAMES:
            res["verdict"] = "INCONCLUSIVE"
        else:
            res["verdict"] = words[0] if ci[1] < 0 else words[1] if ci[0] > 0 else "TOO CLOSE TO CALL"
    return res


def picks(rows, col, min_ev):
    best = {}
    for r in rows:
        p, no_ask = r[col], round(1 - r["bid"], 4)
        for side, ev, price in (("OVER", p - r["ask"] - B1.fee(r["ask"]), r["ask"]),
                                ("UNDER", (1 - p) - no_ask - B1.fee(no_ask), no_ask)):
            if ev >= min_ev:
                k = (r["game"], r["pid"], r["stat"])
                if k not in best or ev > best[k]["ev"]:
                    best[k] = {"game": r["game"], "season": r["season"], "stat": r["stat"], "side": side, "ev": ev,
                               "price": price, "won": (r["y"] == 1) if side == "OVER" else (r["y"] == 0)}
    return list(best.values())


def pick_test(bets):
    res = B1.roi_block(bets)
    ci = res.get("roi_95ci")
    res["verdict"] = ("INCONCLUSIVE" if res["count"] < B1.MIN_PICKS or res.get("games", 0) < B1.MIN_GAMES else
                      "PROFITABLE" if ci and ci[0] > 0 else "NOT SHOWN PROFITABLE")
    return res


def fit_blend(rs):
    x1 = logit(np.array([r["mid"] for r in rs])); x2 = logit(np.array([r["v2_p"] for r in rs]))
    y = np.array([r["y"] for r in rs], float)

    def nll(w):
        z = w[0] + w[1] * x1 + w[2] * x2
        return float(np.sum(np.logaddexp(0, z) - y * z))
    return minimize(nll, np.array([0.0, 1.0, 0.0]), method="BFGS").x


def apply_blend(rs, w):
    for r in rs:
        z = w[0] + w[1] * logit(np.array([r["mid"]]))[0] + w[2] * logit(np.array([r["v2_p"]]))[0]
        r["blend_p"] = float(1 / (1 + np.exp(-z)))


def main():
    out = {"doc": "NBA_PROPS_KALSHI_BACKTEST_V2", "prereg_sha256": B1.sha(PREREG), "script_sha256": B1.sha(__file__),
           "model_sha256": B1.sha(MODEL), "funnel": {}}
    funnel = out["funnel"]
    rows = B1.load_rows(funnel)
    seasons, scored = B1.score(rows, funnel, {})
    scored = [r for r in scored if r["stat"] in STATS and r["season"] == 2026]
    funnel["v1_scored_four_stats"] = len(scored)

    # v2 inputs: box scores 2019-2026 (2019 only feeds early-season history), the same files the v1 code downloaded
    for y in range(2019, 2027):
        B1.box_path(y)
    d = F.frame(B1.CACHE, 2019, 2026)
    d["date"] = d["game_date"].dt.strftime("%Y-%m-%d")
    key = {(r.date, r.player_id): i for i, r in zip(d.index, d[["date", "player_id"]].itertuples(index=False))}
    model = F.load(2026)
    status = {"no_pid": 0, "not_in_box": 0, "out_dnp": 0, "ok": 0}
    want = {s: [] for s in STATS}
    for r in scored:
        r["v2_p"] = None
        if not r["pid"]:
            status["no_pid"] += 1; r["out"] = None; continue
        i = key.get((r["game"][:10], r["pid"]))
        if i is None:
            status["not_in_box"] += 1; r["out"] = True; continue
        row = d.loc[i]
        if not (row["played"] or row["coach_dnp"]):
            status["out_dnp"] += 1; r["out"] = True; continue
        status["ok"] += 1; r["out"] = False; r["_i"] = i
        r["n_out_fresh"] = float(row["n_out_fresh"])
        want[r["stat"]].append(r)
    funnel["v2_status"] = status
    for s, rs in want.items():
        if rs:
            mu, p = F.p_over(model, s, d.loc[[r["_i"] for r in rs]], [r["line"] for r in rs])
            for r, m, q in zip(rs, mu, p):
                r["v2_mean"], r["v2_p"] = float(m), (None if not np.isfinite(q) else float(q))
    funnel["v2_chance_exists"] = sum(r["v2_p"] is not None for r in scored)

    def base(r):
        return (r["v2_p"] is not None and r["model_p"] is not None and not r["out"] and B1.in_set(r, STATS, gap=False))
    nogap = [r for r in scored if base(r)]
    for r in nogap:
        r["mid"] = (r["bid"] + r["ask"]) / 2
        r["v1_p"] = r["model_p"]
    main = [r for r in nogap if abs(r["v2_p"] - r["mid"]) <= B1.MAX_GAP]
    funnel["no_gap_set"], funnel["main_set"] = len(nogap), len(main)

    t1 = compare(main, "v2_p", "mid", ("V2 MORE RIGHT", "KALSHI MORE RIGHT"))
    t1["by_stat"] = {s: compare([r for r in main if r["stat"] == s], "v2_p", "mid", ("V2 MORE RIGHT", "KALSHI MORE RIGHT"))
                     for s in STATS}
    months = sorted({r["game"][:7] for r in main})
    t1["by_month"] = {m: compare([r for r in main if r["game"][:7] == m], "v2_p", "mid", ("V2", "KALSHI"))
                      for m in months}
    t2 = compare(nogap, "v2_p", "v1_p", ("V2 MORE RIGHT", "V1 MORE RIGHT"))
    t2["by_stat"] = {s: compare([r for r in nogap if r["stat"] == s], "v2_p", "v1_p", ("V2", "V1")) for s in STATS}
    bets = picks(main, "v2_p", B1.MIN_EV)
    t3 = {"all": pick_test(bets),
          "by_side": {sd: B1.roi_block([b for b in bets if b["side"] == sd]) for sd in ("OVER", "UNDER")},
          "by_stat": {s: B1.roi_block([b for b in bets if b["stat"] == s]) for s in STATS}}

    learn = [r for r in nogap if r["game"][:10] < SPLIT]
    test = [r for r in nogap if r["game"][:10] >= SPLIT]
    w = fit_blend(learn)
    apply_blend(nogap, w)
    rng = np.random.default_rng(SEED)
    lg = sorted({r["game"] for r in learn})
    by_game = {}
    for r in learn:
        by_game.setdefault(r["game"], []).append(r)
    cs = []
    for _ in range(C_DRAWS):
        draw = [r for g in rng.choice(lg, len(lg)) for r in by_game[g]]
        cs.append(fit_blend(draw)[2])
    t4a = compare(test, "blend_p", "mid", ("BLEND MORE RIGHT", "KALSHI MORE RIGHT"))
    t4a.update({"a": round(float(w[0]), 4), "b": round(float(w[1]), 4), "c": round(float(w[2]), 4),
                "c_95ci": [round(float(np.percentile(cs, 2.5)), 4), round(float(np.percentile(cs, 97.5)), 4)],
                "learning_rows": len(learn), "learning_games": len(lg), "split": SPLIT})
    grid = {}
    for T in T_GRID:
        lb = picks(learn, "blend_p", T)
        grid[T] = B1.roi_block(lb)
    ok = [T for T in T_GRID if grid[T]["count"] >= MIN_LEARN_PICKS]
    Tsel = max(ok, key=lambda T: grid[T]["roi"]) if ok else T_DEFAULT
    t4b = {"threshold": Tsel, "learning_grid": {str(k): v for k, v in grid.items()},
           "test": pick_test(picks(test, "blend_p", Tsel))}

    v1main = [r for r in nogap if abs(r["v1_p"] - r["mid"]) <= B1.MAX_GAP]
    late = [r for r in main if r["n_out_fresh"] == 0]
    info = {"test1_on_v1_main_set": compare(v1main, "v2_p", "mid", ("V2", "KALSHI")),
            "test1_v1_on_v1_main_set": compare(v1main, "v1_p", "mid", ("V1", "KALSHI")),
            "test1_no_gap_set": compare(nogap, "v2_p", "mid", ("V2", "KALSHI")),
            "late_news_check_no_fresh_absence": compare(late, "v2_p", "mid", ("V2", "KALSHI")),
            "late_news_check_with_fresh_absence": compare([r for r in main if r["n_out_fresh"] > 0], "v2_p", "mid",
                                                          ("V2", "KALSHI"))}
    out.update({"test1": t1, "test2": t2, "test3": t3, "test4a": t4a, "test4b": t4b, "info_only": info})

    if t2.get("verdict") == "V2 MORE RIGHT":
        edge = t1.get("verdict") != "KALSHI MORE RIGHT" and t3["all"]["verdict"] == "PROFITABLE"
        blend = t4a.get("verdict") in ("BLEND MORE RIGHT", "TOO CLOSE TO CALL") and t4b["test"]["verdict"] == "PROFITABLE"
        out["decision"] = ("V2 REPLACES V1; V2 PICKS GO LIVE AS AN EDGE TEST" if edge else
                           "V2 REPLACES V1; THE BLEND GOES LIVE" if blend else
                           "V2 REPLACES V1; NO NBA PROP MODEL HAS BEATEN KALSHI'S PRICES")
    else:
        out["decision"] = "KEEP V1"

    json.dump(out, open(OUT_JSON, "w"), indent=1, default=str)
    cols = ["game", "stat", "player", "pid", "line", "n", "bid", "ask", "mid", "oi", "y", "v1_p", "v2_p", "v2_mean",
            "blend_p", "n_out_fresh", "ticker"]
    with open(OUT_ROWS, "w", newline="") as f:
        wr = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        wr.writeheader()
        for r in nogap:
            wr.writerow(r)

    def j(x):
        return json.dumps(x)
    md = ["# NBA_PROPS_KALSHI_BACKTEST_V2 results", "",
          f"Prereg sha256 `{out['prereg_sha256']}` · model sha256 `{out['model_sha256']}`", "",
          f"Funnel: {j(funnel)}", "",
          f"## Test 1 (primary) — v2 vs Kalshi: {t1.get('verdict')}",
          f"Main set {t1['rows']} rows / {t1['games']} games. v2 log loss {t1.get('v2_p_logloss')}, Kalshi mid "
          f"{t1.get('mid_logloss')}, difference {t1.get('diff_v2_p_minus_mid')} (95% CI {t1.get('diff_95ci')}). "
          "Negative = v2 more right.", "", "By stat: " + j(t1["by_stat"]), "", "By month: " + j(t1["by_month"]), "",
          f"## Test 2 — v2 vs v1: {t2.get('verdict')}",
          f"No-gap set {t2['rows']} rows / {t2['games']} games. v2 {t2.get('v2_p_logloss')}, v1 {t2.get('v1_p_logloss')}, "
          f"difference {t2.get('diff_v2_p_minus_v1_p')} (95% CI {t2.get('diff_95ci')}).", "", "By stat: " + j(t2["by_stat"]), "",
          f"## Test 3 — v2 picks: {t3['all']['verdict']}", j(t3["all"]), "", "By side: " + j(t3["by_side"]), "",
          "By stat: " + j(t3["by_stat"]), "",
          f"## Test 4a — v2 on top of Kalshi (test games from {SPLIT}): {t4a.get('verdict')}", j(t4a), "",
          f"## Test 4b — blend picks (T = {Tsel}): {t4b['test']['verdict']}", j(t4b), "",
          "## Information only", j(info), "", f"## Decision: {out['decision']}", "",
          "Availability is from box scores, not the injury report at snapshot time (see the late-news check). "
          "This is a back-test on past prices; it cannot replace a live paper test."]
    open(OUT_MD, "w").write("\n".join(md) + "\n")
    print("\n".join(md))


if __name__ == "__main__":
    main()
