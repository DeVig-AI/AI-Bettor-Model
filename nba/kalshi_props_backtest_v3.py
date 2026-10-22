#!/usr/bin/env python3
"""
kalshi_props_backtest_v3.py -- NBA_PROPS_KALSHI_BACKTEST_V3 (prereg nba/NBA_PROPS_KALSHI_BACKTEST_V3_PREREG.md).
Rows: the v2 back-test's no-gap set (nba/props_history/backtest_v2_rows.csv). v3 chances from the frozen
nba/nba_props_model_v3_T2026.json.gz. REUSED prices: see the prereg.
Run from the repo root:  python3 nba/kalshi_props_backtest_v3.py
"""
import csv, json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import kalshi_props_backtest_v1 as B1  # noqa: E402
import kalshi_props_backtest_v2 as B2  # noqa: E402  (compare / picks / blend helpers)
import nba_props_fit_v3 as F3  # noqa: E402

PREREG = os.path.join(HERE, "NBA_PROPS_KALSHI_BACKTEST_V3_PREREG.md")
ROWS = os.path.join(HERE, "props_history", "backtest_v2_rows.csv")
OUT_JSON = os.path.join(HERE, "props_history", "backtest_v3_results.json")
OUT_MD = os.path.join(HERE, "props_history", "backtest_v3_results.md")
STATS = ["points", "rebounds", "assists", "threes"]
B1.SEED = 20261024


def fl(x):
    try:
        v = float(x)
        return v if v == v else None
    except (TypeError, ValueError):
        return None


def main():
    out = {"doc": "NBA_PROPS_KALSHI_BACKTEST_V3", "label": "REUSED PRICES", "prereg_sha256": B1.sha(PREREG),
           "script_sha256": B1.sha(__file__), "model_sha256": B1.sha(F3.out_path(2026)), "funnel": {}}
    rows = list(csv.DictReader(open(ROWS)))
    for r in rows:
        for k in ("line", "bid", "ask", "mid", "v1_p", "v2_p", "n_out_fresh"):
            r[k] = fl(r[k])
        r["y"] = int(r["y"])
        r["season"] = 2026
    out["funnel"]["rows"] = len(rows)
    for y in range(2019, 2027):
        B1.box_path(y)
    d = F3.frame(B1.CACHE, 2019, 2026)
    d["date"] = d["game_date"].dt.strftime("%Y-%m-%d")
    key = {(a, b): i for i, a, b in zip(d.index, d["date"], d["player_id"])}
    model = F3.load(2026)
    for s in STATS:
        rs = [r for r in rows if r["stat"] == s and (r["game"][:10], r["pid"]) in key]
        if rs:
            mu, p = F3.p_over(model, s, d.loc[[key[(r["game"][:10], r["pid"])] for r in rs]], [r["line"] for r in rs])
            for r, q in zip(rs, p):
                r["v3_p"] = float(q) if np.isfinite(q) else None
    nogap = [r for r in rows if r.get("v3_p") is not None]
    main_ = [r for r in nogap if abs(r["v3_p"] - r["mid"]) <= B1.MAX_GAP]
    out["funnel"].update(v3_chance=len(nogap), main_set=len(main_))
    W1, W2 = ("V3 MORE RIGHT", "KALSHI MORE RIGHT"), ("V3 MORE RIGHT", "V2 MORE RIGHT")
    t1 = B2.compare(main_, "v3_p", "mid", W1)
    t1["by_stat"] = {s: B2.compare([r for r in main_ if r["stat"] == s], "v3_p", "mid", W1) for s in STATS}
    t1["by_month"] = {m: B2.compare([r for r in main_ if r["game"][:7] == m], "v3_p", "mid", ("V3", "KALSHI"))
                      for m in sorted({r["game"][:7] for r in main_})}
    t2 = B2.compare(nogap, "v3_p", "v2_p", W2)
    t2["by_stat"] = {s: B2.compare([r for r in nogap if r["stat"] == s], "v3_p", "v2_p", ("V3", "V2")) for s in STATS}
    t3 = B2.pick_test(B2.picks(main_, "v3_p", B1.MIN_EV))
    for r in nogap:
        r["v2_p_saved"] = r["v2_p"]; r["v2_p"] = r["v3_p"]            # B2's blend helpers read the model from v2_p
    learn = [r for r in nogap if r["game"][:10] < B2.SPLIT]
    test = [r for r in nogap if r["game"][:10] >= B2.SPLIT]
    w = B2.fit_blend(learn)
    B2.apply_blend(nogap, w)
    for r in nogap:
        r["v2_p"] = r.pop("v2_p_saved")
    t4a = B2.compare(test, "blend_p", "mid", ("BLEND MORE RIGHT", "KALSHI MORE RIGHT"))
    t4a.update({"a": round(float(w[0]), 4), "b": round(float(w[1]), 4), "c": round(float(w[2]), 4)})
    grid = {T: B1.roi_block(B2.picks(learn, "blend_p", T)) for T in B2.T_GRID}
    ok = [T for T in B2.T_GRID if grid[T]["count"] >= B2.MIN_LEARN_PICKS]
    Tsel = max(ok, key=lambda T: grid[T]["roi"]) if ok else B2.T_DEFAULT
    t4b = {"threshold": Tsel, "test": B2.pick_test(B2.picks(test, "blend_p", Tsel))}
    info = {"newly_out": B2.compare([r for r in main_ if r["n_out_fresh"] > 0], "v3_p", "mid", ("V3", "KALSHI")),
            "no_newly_out": B2.compare([r for r in main_ if r["n_out_fresh"] == 0], "v3_p", "mid", ("V3", "KALSHI")),
            "v2_same_main_rows": B2.compare(main_, "v2_p", "mid", ("V2", "KALSHI"))}
    out.update(test1=t1, test2=t2, test3=t3, test4a=t4a, test4b=t4b, info_only=info)
    out["decision"] = ("V3 RUNS AS A LIVE SHADOW NEXT TO V2" if t2.get("verdict") == "V3 MORE RIGHT" else "V3 DROPPED")
    json.dump(out, open(OUT_JSON, "w"), indent=1, default=str)
    j = json.dumps
    md = ["# NBA_PROPS_KALSHI_BACKTEST_V3 results — REUSED PRICES", "",
          "These 2025-26 prices were already used by v1 and v2, and v2's weak spots were seen before v3 was designed; "
          "weaker evidence than a fresh test.", "", f"Prereg sha256 `{out['prereg_sha256']}` · funnel {j(out['funnel'])}", "",
          f"## Test 1 (primary) — v3 vs Kalshi: {t1.get('verdict')}", j({k: v for k, v in t1.items() if k not in ('by_stat', 'by_month')}), "",
          "By stat: " + j(t1["by_stat"]), "", "By month: " + j(t1["by_month"]), "",
          f"## Test 2 — v3 vs v2: {t2.get('verdict')}", j(t2), "",
          f"## Test 3 — v3 picks: {t3['verdict']}", j(t3), "",
          f"## Test 4a — blend: {t4a.get('verdict')}", j(t4a), "", f"## Test 4b — blend picks: {t4b['test']['verdict']}", j(t4b), "",
          "## Information only", j(info), "", f"## Decision: {out['decision']}"]
    open(OUT_MD, "w").write("\n".join(md) + "\n")
    print("\n".join(md))


if __name__ == "__main__":
    main()
