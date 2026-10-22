#!/usr/bin/env python3
"""
kalshi_props_timing_study_v1.py -- NBA_PROPS_TIMING_V1 (prereg nba/NBA_PROPS_TIMING_V1_PREREG.md).
Reads nba/props_history/backtest_v2_rows.csv and nba/props_history/timing/early_prices.csv.
Run from the repo root:  python3 nba/kalshi_props_timing_study_v1.py
Output: nba/props_history/timing/timing_v1_results.{json,md}
"""
import csv, json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import kalshi_props_backtest_v1 as B1  # noqa: E402  (log loss, fee, game bootstrap, ROI block)

PREREG = os.path.join(HERE, "NBA_PROPS_TIMING_V1_PREREG.md")
ROWS = os.path.join(HERE, "props_history", "backtest_v2_rows.csv")
EARLY = os.path.join(HERE, "props_history", "timing", "early_prices.csv")
OUT_JSON = os.path.join(HERE, "props_history", "timing", "timing_v1_results.json")
OUT_MD = os.path.join(HERE, "props_history", "timing", "timing_v1_results.md")
HORIZONS = [24.0, 12.0, 6.0, 3.0, 1.5]
PRIMARY_H = 6.0
B1.SEED = 20261023


def f(x):
    try:
        v = float(x)
        return v if v == v else None
    except (TypeError, ValueError):
        return None


def compare(rs, a, b, words=("A", "B")):
    if not rs:
        return {"rows": 0, "games": 0}
    y = np.array([r["y"] for r in rs], float)
    la = B1.logloss(np.array([r[a] for r in rs], float), y)
    lb = B1.logloss(np.array([r[b] for r in rs], float), y)
    res = {"rows": len(rs), "games": len({r["game"] for r in rs}), f"{a}_logloss": round(float(la.mean()), 5),
           f"{b}_logloss": round(float(lb.mean()), 5), "diff": round(float((la - lb).mean()), 5)}
    if res["games"] >= 2:
        ci = [round(x, 5) for x in B1.boot_ratio([r["game"] for r in rs], la - lb, np.ones(len(rs)))]
        res["diff_95ci"] = ci
        res["verdict"] = ("INCONCLUSIVE" if res["rows"] < B1.MIN_ROWS or res["games"] < B1.MIN_GAMES else
                          words[0] if ci[1] < 0 else words[1] if ci[0] > 0 else "TOO CLOSE TO CALL")
    return res


def picks(rows, col, bid, ask):
    best = {}
    for r in rows:
        p, mid = r[col], (r[bid] + r[ask]) / 2
        if abs(p - mid) > B1.MAX_GAP:
            continue
        no_ask = round(1 - r[bid], 4)
        for side, ev, price in (("OVER", p - r[ask] - B1.fee(r[ask]), r[ask]),
                                ("UNDER", (1 - p) - no_ask - B1.fee(no_ask), no_ask)):
            if ev >= B1.MIN_EV:
                k = (r["game"], r["pid"], r["stat"])
                if k not in best or ev > best[k]["ev"]:
                    best[k] = {"game": r["game"], "stat": r["stat"], "side": side, "ev": ev, "price": price,
                               "won": (r["y"] == 1) if side == "OVER" else (r["y"] == 0)}
    res = B1.roi_block(list(best.values()))
    ci = res.get("roi_95ci")
    res["verdict"] = ("INCONCLUSIVE" if res["count"] < B1.MIN_PICKS else
                      "PROFITABLE" if ci and ci[0] > 0 else "NOT SHOWN PROFITABLE")
    return res


def main():
    rows = {r["ticker"]: r for r in csv.DictReader(open(ROWS))}
    for r in rows.values():
        r.update(y=int(r["y"]), v1_p=f(r["v1_p"]), v2_p=f(r["v2_p"]), mid40=f(r["mid"]),
                 n_out_fresh=f(r["n_out_fresh"]) or 0.0)
    early = {}
    for e in csv.DictReader(open(EARLY)):
        b, a, oi = f(e["yes_bid"]), f(e["yes_ask"]), f(e["open_interest"])
        if b is not None and a is not None and 0 < b < a < 1 and a - b <= B1.MAX_SPREAD and (oi or 0) >= B1.MIN_OI:
            early[(e["ticker"], float(e["horizon_h"]))] = (b, a)
    out = {"doc": "NBA_PROPS_TIMING_V1", "prereg_sha256": B1.sha(PREREG), "script_sha256": B1.sha(__file__),
           "rows_file_sha256": B1.sha(ROWS), "early_file_sha256": B1.sha(EARLY), "by_horizon": {}}
    for h in HORIZONS:
        rs = []
        for t, r in rows.items():
            if (t, h) in early:
                b, a = early[(t, h)]
                rs.append(dict(r, bid_h=b, ask_h=a, mid_h=(b + a) / 2))
        prim = [r for r in rs if r["n_out_fresh"] == 0]
        res = {"priced_rows": len(rs),
               "test1_v2_vs_kalshi_primary": compare(prim, "v2_p", "mid_h", ("V2 MORE RIGHT", "KALSHI MORE RIGHT")),
               "test2_v2_picks_primary": picks(prim, "v2_p", "bid_h", "ask_h"),
               "test3_kalshi_h_vs_40min": compare(rs, "mid_h", "mid40", ("EARLY PRICE MORE RIGHT", "40-MIN PRICE MORE RIGHT")),
               "v1_vs_kalshi_all_rows": compare(rs, "v1_p", "mid_h", ("V1 MORE RIGHT", "KALSHI MORE RIGHT")),
               "v2_vs_kalshi_newly_out_rows": compare([r for r in rs if r["n_out_fresh"] > 0], "v2_p", "mid_h",
                                                      ("V2 MORE RIGHT", "KALSHI MORE RIGHT")),
               "by_stat_primary": {s: compare([r for r in prim if r["stat"] == s], "v2_p", "mid_h", ("V2", "KALSHI"))
                                   for s in ("points", "rebounds", "assists", "threes")}}
        out["by_horizon"][str(h)] = res
        print(h, json.dumps(res["test1_v2_vs_kalshi_primary"]), flush=True)
    p = out["by_horizon"][str(PRIMARY_H)]
    t1, t2 = p["test1_v2_vs_kalshi_primary"].get("verdict"), p["test2_v2_picks_primary"]["verdict"]
    out["decision"] = ("NEXT NBA LIVE TEST LOCKS AT ABOUT 6 HOURS" if t1 != "KALSHI MORE RIGHT" and t2 == "PROFITABLE"
                       else "THE MODEL DOES NOT BEAT EVEN THE EARLY PRICE" if t1 == "KALSHI MORE RIGHT"
                       else "NO CHANGE: NOT SHOWN PROFITABLE AT 6 HOURS")
    json.dump(out, open(OUT_JSON, "w"), indent=1)
    md = ["# NBA_PROPS_TIMING_V1 results", "", f"Prereg sha256 `{out['prereg_sha256']}`", "",
          "| hours before tip | priced rows | v2 vs Kalshi (primary rows) | 95% CI | verdict | v2 picks ROI [CI] | "
          "Kalshi at H vs 40 min | v1 vs Kalshi |", "|---|---|---|---|---|---|---|---|"]
    for h in HORIZONS:
        r = out["by_horizon"][str(h)]
        a, b, c, v = (r["test1_v2_vs_kalshi_primary"], r["test2_v2_picks_primary"], r["test3_kalshi_h_vs_40min"],
                      r["v1_vs_kalshi_all_rows"])
        md.append(f"| {h:g}{' (primary)' if h == PRIMARY_H else ''} | {r['priced_rows']} | {a.get('diff')} | "
                  f"{a.get('diff_95ci')} | {a.get('verdict')} | {b.get('roi')} {b.get('roi_95ci')} ({b.get('count')} picks) | "
                  f"{c.get('diff')} {c.get('diff_95ci')} | {v.get('diff')} {v.get('diff_95ci')} |")
    md += ["", "Differences are log loss (first minus second); negative = first more right.", "",
           f"## Decision: {out['decision']}", "", "Full numbers: timing_v1_results.json. "
           "This is a back-test on past prices; it cannot replace a live paper test."]
    open(OUT_MD, "w").write("\n".join(md) + "\n")
    print("\n".join(md))


if __name__ == "__main__":
    main()
