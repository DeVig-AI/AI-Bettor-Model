#!/usr/bin/env python3
"""
nba_props_design_v2.py -- builds and checks the NBA prop model v2 on BOX SCORES ONLY, before any price is seen.

Walk-forward over test seasons 2021..2025 (season = the year it ends). For test season S:
  - model A (LightGBM, Poisson loss, one per stat) is trained on S-6..S-2 and predicts S-1; the spread of outcomes
    around its mean (ratio tables as in v1, or a negative binomial) is fit on those S-1 predictions, so the spread
    is learned out of sample;
  - model B is trained on S-6..S-1 and predicts S; P(stat > line) comes from B's mean and A's spread.
v1 is scored on the same rows (its ratio tables fit on S-6..S-1, as v1 does).
Rows: games the player played, >= 5 earlier played games. Lines: Kalshi's ladder rungs (LADDER) between 0.4x and
2.0x the player's 20-game average before the game (pre-game only, the same rows for every model).
Score: log loss, chances clipped to [0.01, 0.99], each stat weighted equally. The 2025-26 season (the one Kalshi prices
exist for) and later are never used here.

Run from the repo root:  python3 nba/nba_props_design_v2.py --box DIR
Output: nba/design/design_v2.json and design_v2.md
"""
import argparse, json, os, sys
import numpy as np
import pandas as pd
import lightgbm as lgb
from scipy import stats as st

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import nba_props_model_lib_v1 as V1  # noqa: E402
import nba_props_model_lib_v2 as L  # noqa: E402

V1.STATS = L.STATS          # v1's ratio tables, fit only for the four stats Kalshi lists

TEST_SEASONS = range(2021, 2026)
TRAIN_SPAN = 6
MIN_PREV = 5
CLIP = (0.01, 0.99)
PARAMS = {"objective": "poisson", "learning_rate": 0.05, "num_leaves": 31, "min_child_samples": 100,
          "feature_fraction": 0.8, "bagging_fraction": 0.8, "bagging_freq": 1, "verbose": -1, "seed": 20261022}
ROUNDS = 400
OUT = os.path.join(HERE, "design")


def logloss(p, y):
    p = np.clip(p, *CLIP)
    return float(np.mean(-(y * np.log(p) + (1 - y) * np.log(1 - p))))


def fit_gbm(df, s):
    ds = lgb.Dataset(df[L.FEATURES + ["is_G", "is_C"]], label=df[s])
    return lgb.train(PARAMS, ds, ROUNDS)


def predict(m, df):
    return m.predict(df[L.FEATURES + ["is_G", "is_C"]])


def nb_alpha(mu, y):
    """MLE of alpha in var = mu + alpha mu^2 on a grid (robust, no optimiser)."""
    best = None
    for a in np.linspace(0.001, 0.6, 120):
        n = 1.0 / a
        ll = st.nbinom.logpmf(y, n, n / (n + mu)).sum()
        if best is None or ll > best[1]:
            best = (a, ll)
    return float(best[0])


def p_over_nb(mu, line, a):
    n = 1.0 / a
    return st.nbinom.sf(np.floor(line), n, n / (n + mu))


def eval_rows(t, s):
    """(row index, line) pairs: ladder rungs between 0.4x and 2.0x the 20-game average."""
    base = t[s + "_e20"].to_numpy(float)
    idx, lines = [], []
    for ln in L.LADDER[s]:
        m = (ln >= 0.4 * base) & (ln <= 2.0 * base)
        idx.append(np.nonzero(m)[0]); lines.append(np.full(m.sum(), ln))
    return np.concatenate(idx), np.concatenate(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--box", required=True)
    a = ap.parse_args()
    paths = [os.path.join(a.box, f"player_box_{y}.csv") for y in range(TEST_SEASONS.start - TRAIN_SPAN - 1, 2026)]
    d = L.build(paths)
    d["is_G"] = (d["pos"] == "G").astype(float)
    d["is_C"] = (d["pos"] == "C").astype(float)
    pg = d[d["played"] & (d["n_prev"] >= MIN_PREV)].copy()
    w = pg["n_prev"] / (pg["n_prev"] + V1.SHRINK_K)
    for s in L.STATS:                       # v1's expected value = the same two averages v1 uses
        pg["exp_" + s] = w * pg[s + "_e5"] + (1 - w) * pg[s + "_e20"]
    print("rows", len(pg), "seasons", sorted(pg.season.unique()), flush=True)

    res = {m: {s: [] for s in L.STATS} for m in ("v1", "v2_ratio", "v2_nb", "v2_poisson")}
    calib = {s: [] for s in L.STATS}
    importance = {s: {} for s in L.STATS}
    for S in TEST_SEASONS:
        trA = pg[(pg.season >= S - TRAIN_SPAN) & (pg.season <= S - 2)]
        valA = pg[pg.season == S - 1]
        trB = pg[(pg.season >= S - TRAIN_SPAN) & (pg.season <= S - 1)]
        te = pg[pg.season == S].reset_index(drop=True)
        v1tab = V1.fit_ratio_tables(trB, min_prev=MIN_PREV)
        for s in L.STATS:
            mA = fit_gbm(trA, s)
            muA = np.clip(predict(mA, valA), 0.05, None)
            va = valA.assign(**{"exp_" + s: muA})
            rtab = V1.fit_ratio_tables(va, min_prev=MIN_PREV)[s]
            alpha = nb_alpha(muA, valA[s].to_numpy())
            mB = fit_gbm(trB, s)
            mu = np.clip(predict(mB, te), 0.05, None)
            for f, g in zip(L.FEATURES + ["is_G", "is_C"], mB.feature_importance("gain")):
                importance[s][f] = importance[s].get(f, 0.0) + float(g)
            idx, lines = eval_rows(te, s)
            y = (te[s].to_numpy(float)[idx] > lines).astype(float)
            e1 = te["exp_" + s].to_numpy(float)[idx]
            p1 = np.full(len(idx), np.nan); pr = np.full(len(idx), np.nan)
            for ln in np.unique(lines):
                k = lines == ln
                p1[k] = V1.p_over_vec(v1tab[s], e1[k], ln)
                pr[k] = V1.p_over_vec(rtab, mu[idx][k], ln)
            p = {"v1": p1, "v2_ratio": pr, "v2_nb": p_over_nb(mu[idx], lines, alpha),
                 "v2_poisson": st.poisson.sf(np.floor(lines), mu[idx])}
            ok = np.all([np.isfinite(v) for v in p.values()], axis=0)
            for m, v in p.items():
                res[m][s].append((logloss(v[ok], y[ok]), int(ok.sum())))
            mae1 = float(np.mean(np.abs(te[s] - te["exp_" + s])))
            mae2 = float(np.mean(np.abs(te[s] - mu)))
            calib[s].append({"season": S, "alpha": round(alpha, 4), "mae_v1": round(mae1, 4), "mae_v2": round(mae2, 4),
                             "mean_actual": round(float(te[s].mean()), 4), "mean_v2": round(float(mu.mean()), 4),
                             "rows_scored": int(ok.sum()),
                             "ll": {m: round(res[m][s][-1][0], 5) for m in res}})
            print(S, s, calib[s][-1], flush=True)

    summary = {}
    for m in res:
        by = {}
        for s in L.STATS:
            n = sum(v[1] for v in res[m][s])
            by[s] = round(sum(v[0] * v[1] for v in res[m][s]) / n, 5)
        summary[m] = {"mean_logloss": round(float(np.mean(list(by.values()))), 5), "by_stat": by}
    best = min((m for m in res if m != "v1"), key=lambda m: summary[m]["mean_logloss"])
    imp = {s: dict(sorted(((k, round(v / sum(importance[s].values()), 4)) for k, v in importance[s].items()),
                          key=lambda kv: -kv[1])[:12]) for s in L.STATS}
    os.makedirs(OUT, exist_ok=True)
    out = {"doc": "NBA_PROPS_DESIGN_V2", "test_seasons": list(TEST_SEASONS), "train_span": TRAIN_SPAN,
           "min_prev": MIN_PREV, "ladder": L.LADDER, "params": PARAMS, "rounds": ROUNDS, "summary": summary,
           "chosen_distribution": best, "per_season": calib, "top_features_by_gain": imp,
           "note": "Box scores only (2014-15 to 2024-25). No price was read."}
    json.dump(out, open(os.path.join(OUT, "design_v2.json"), "w"), indent=1)
    md = ["# NBA props model v2 -- design study (box scores only, no prices)", "",
          f"Walk-forward, test seasons {TEST_SEASONS.start}-{TEST_SEASONS.stop - 1}; log loss of P(stat > line) on "
          "Kalshi's ladder rungs near each player's level (lower is better).", "",
          "| model | mean | " + " | ".join(L.STATS) + " |", "|---|---|" + "---|" * len(L.STATS)]
    for m, v in summary.items():
        md.append(f"| {m} | {v['mean_logloss']} | " + " | ".join(str(v["by_stat"][s]) for s in L.STATS) + " |")
    md += ["", f"**Chosen v2 spread:** {best}.", "", "Top inputs by gain:", ""]
    for s in L.STATS:
        md.append(f"- {s}: " + ", ".join(f"{k} {v:.0%}" for k, v in list(imp[s].items())[:6]))
    open(os.path.join(OUT, "design_v2.md"), "w").write("\n".join(md) + "\n")
    print("\n".join(md))


if __name__ == "__main__":
    main()
