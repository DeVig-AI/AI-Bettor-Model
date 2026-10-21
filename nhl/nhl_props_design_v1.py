#!/usr/bin/env python3
"""
nhl_props_design_v1.py -- picks the NHL prop model's settings on BOX SCORES ONLY, before any price is seen.

Walk-forward: for each test season S from 2016-17 to 2024-25, ratio tables are fit on 2010-11 .. S-1; every
candidate predicts S's games for players with >= 40 earlier played games. Score = log loss of P(stat > line) for the
lines Kalshi lists most (goals 0.5 / 1.5, assists 0.5 / 1.5, points 0.5 / 1.5 / 2.5), each (stat, line) weighted
equally, chances clipped to [0.01, 0.99]. The candidate with the lowest mean log loss is chosen; a tie within 0.0005
goes to the simpler one (poisson before ratio, shorter spans, smaller shrink). 2025-26 and later are never used here:
they are the seasons Kalshi prices exist for.

Run from the repo root:  python3 nhl/nhl_props_design_v1.py
Output: nhl/design/design_v1.json and design_v1.md
"""
import itertools, json, os, sys
import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import nhl_props_model_lib_v1 as L  # noqa: E402

SPANS = [(5, 20), (10, 40), (20, 80), (40, 160)]   # 40/160 added after the first run chose the longest (20/80)
SHRINKS = [3.0, 10.0]
METHODS = ["poisson", "ratio"]
TEST_SEASONS = range(2016, 2025)
LINES = {"goals": [0.5, 1.5], "assists": [0.5, 1.5], "points": [0.5, 1.5, 2.5]}
MIN_PREV = 40
CLIP = (0.01, 0.99)
OUT = os.path.join(HERE, "design")


def logloss(p, y):
    p = np.clip(p, *CLIP)
    return float(np.mean(-(y * np.log(p) + (1 - y) * np.log(1 - p))))


def poisson_vec(e, line):
    """P(X > line), X ~ Poisson(e), vectorised; the same numbers as L.p_over_poisson."""
    k = int(np.floor(line))
    term, cdf = np.exp(-e), np.exp(-e)
    for i in range(1, k + 1):
        term = term * e / i
        cdf = cdf + term
    return np.clip(1.0 - cdf, 1e-6, 1 - 1e-6)


def ratio_vec(tab, e, line):
    edges = np.asarray(tab["edges"])
    out = np.full(len(e), np.nan)
    b = np.clip(np.searchsorted(edges, e, side="right") - 1, 0, len(edges) - 2)
    for i in np.unique(b):
        if not tab["q"][i]:
            continue
        m = b == i
        q = np.asarray(tab["q"][i])
        k = len(q) - np.searchsorted(q, line / e[m], side="right")
        out[m] = (k / len(q) * tab["n"][i] + 0.5) / (tab["n"][i] + 1.0)
    return out


def main():
    pg = L.player_games(L.load_games(seasons=range(2010, 2025)))
    print("player-games", len(pg), "seasons", sorted(pg.season.unique()), flush=True)
    results = []
    for (ss, sl), k in itertools.product(SPANS, SHRINKS):
        ex = L.add_expectations(pg, ss, sl, k)
        per = {m: {f"{s}>{ln}": [] for s in LINES for ln in LINES[s]} for m in METHODS}
        cal = {m: {} for m in METHODS}
        for S in TEST_SEASONS:
            tables = L.fit_ratio_tables(ex[ex.season < S], min_prev=5)
            t = ex[(ex.season == S) & (ex.n_prev >= MIN_PREV)]
            for s, lines in LINES.items():
                e = t["exp_" + s].to_numpy(float)
                ok = np.isfinite(e) & (e > 0)
                for ln in lines:
                    y = (t[s].to_numpy(float) > ln).astype(float)
                    for m in METHODS:
                        p = poisson_vec(e[ok], ln) if m == "poisson" else ratio_vec(tables[s], e[ok], ln)
                        good = np.isfinite(p)
                        per[m][f"{s}>{ln}"].append((logloss(p[good], y[ok][good]), int(good.sum()),
                                                    float(p[good].mean()), float(y[ok][good].mean())))
        for m in METHODS:
            by = {}
            for key, vals in per[m].items():
                n = sum(v[1] for v in vals)
                by[key] = {"logloss": round(sum(v[0] * v[1] for v in vals) / n, 5), "rows": n,
                           "mean_p": round(sum(v[2] * v[1] for v in vals) / n, 4),
                           "hit_rate": round(sum(v[3] * v[1] for v in vals) / n, 4)}
            results.append({"span_short": ss, "span_long": sl, "shrink_k": k, "method": m,
                            "mean_logloss": round(float(np.mean([v["logloss"] for v in by.values()])), 5), "by_line": by})
            print(results[-1]["span_short"], sl, k, m, results[-1]["mean_logloss"], flush=True)

    def simple(r):
        return (METHODS.index(r["method"]), SPANS.index((r["span_short"], r["span_long"])), SHRINKS.index(r["shrink_k"]))
    best = min(r["mean_logloss"] for r in results)
    chosen = min((r for r in results if r["mean_logloss"] <= best + 0.0005), key=simple)
    os.makedirs(OUT, exist_ok=True)
    out = {"doc": "NHL_PROPS_DESIGN_V1", "test_seasons": list(TEST_SEASONS), "min_prev": MIN_PREV, "lines": LINES,
           "candidates": results, "chosen": {k: chosen[k] for k in ("span_short", "span_long", "shrink_k", "method",
                                                                      "mean_logloss")},
           "note": "Box scores only (2010-11 to 2024-25). No price was read."}
    json.dump(out, open(os.path.join(OUT, "design_v1.json"), "w"), indent=1)
    md = ["# NHL props model -- design study v1 (box scores only, no prices)", "",
          f"Walk-forward over {TEST_SEASONS.start}-{TEST_SEASONS.stop - 1} test seasons; players with >= {MIN_PREV} "
          "earlier games; mean log loss over goals 0.5/1.5, assists 0.5/1.5, points 0.5/1.5/2.5 (lower is better).", "",
          "| spans | shrink | method | mean log loss |", "|---|---|---|---|"]
    for r in sorted(results, key=lambda r: r["mean_logloss"]):
        md.append(f"| {r['span_short']}/{r['span_long']} | {r['shrink_k']:g} | {r['method']} | {r['mean_logloss']} |")
    md += ["", f"**Chosen:** spans {chosen['span_short']}/{chosen['span_long']}, shrink {chosen['shrink_k']:g}, "
           f"method {chosen['method']}.", "", "Chosen model by line (calibration: mean chance vs how often it happened):", "",
           "| line | log loss | mean chance | hit rate | rows |", "|---|---|---|---|---|"]
    for key, v in chosen["by_line"].items():
        md.append(f"| {key} | {v['logloss']} | {v['mean_p']} | {v['hit_rate']} | {v['rows']} |")
    open(os.path.join(OUT, "design_v1.md"), "w").write("\n".join(md) + "\n")
    print("\n".join(md))


if __name__ == "__main__":
    main()
