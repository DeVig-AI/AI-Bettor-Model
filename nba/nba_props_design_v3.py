#!/usr/bin/env python3
"""
nba_props_design_v3.py -- NBA prop model v3 design study, BOX SCORES ONLY (no prices), same walk-forward, rows,
lines, spread method and score as nba_props_design_v2.py. Candidates:
  v2        v2's inputs (on v3's date-by-date frame), model fit once per season (as v2);
  v3        v2's inputs + nba_props_model_lib_v3.NEW, fit once per season;
  v3_month  v3's inputs, refit at the start of every calendar month with the season's games so far.
The spread tables come from model A (S-6..S-2 -> S-1) as in v2, for every candidate.
Also scored on the slices the v2 back-test lost most on: a teammate newly out, a teammate back, October-November,
new team. Seasons 2025-26 and later are never used.

Run from the repo root:  python3 nba/nba_props_design_v3.py --box DIR
Output: nba/design/design_v3.json and design_v3.md
"""
import argparse, json, os, sys
import numpy as np
import lightgbm as lgb

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import nba_props_design_v2 as D  # noqa: E402  (narrows V1.STATS to the four stats)
import nba_props_model_lib_v1 as V1  # noqa: E402
import nba_props_model_lib_v2 as L2  # noqa: E402
import nba_props_model_lib_v3 as L3  # noqa: E402

OUT = os.path.join(HERE, "design")
CANDS = {"v2": L2.FEATURES + ["is_G", "is_C"], "v3": L3.FEATURES, "v3_month": L3.FEATURES}


def fit(df, s, feats):
    return lgb.train(D.PARAMS, lgb.Dataset(df[feats], label=df[s]), D.ROUNDS)


def chances(tab, mu, lines):
    p = np.full(len(mu), np.nan)
    for ln in np.unique(lines):
        k = lines == ln
        p[k] = V1.p_over_vec(tab, mu[k], ln)
    return p


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--box", required=True)
    a = ap.parse_args()
    paths = [os.path.join(a.box, f"player_box_{y}.csv") for y in range(D.TEST_SEASONS.start - D.TRAIN_SPAN - 1, 2026)]
    d = L3.build(paths)
    pg = d[d["played"] & (d["n_prev"] >= D.MIN_PREV)].copy()
    print("rows", len(pg), flush=True)
    slices = {"all": lambda t: np.ones(len(t), bool), "teammate_newly_out": lambda t: t["n_out_fresh"].to_numpy() > 0,
              "teammate_back": lambda t: t["n_back"].to_numpy() > 0,
              "oct_nov": lambda t: t["game_date"].dt.month.isin([10, 11]).to_numpy(),
              "new_team": lambda t: t["new_team"].to_numpy() > 0}
    acc = {c: {sl: {s: [0.0, 0] for s in L3.STATS} for sl in slices} for c in CANDS}
    for S in D.TEST_SEASONS:
        trA = pg[(pg.season >= S - D.TRAIN_SPAN) & (pg.season <= S - 2)]
        valA = pg[pg.season == S - 1]
        trB = pg[(pg.season >= S - D.TRAIN_SPAN) & (pg.season <= S - 1)]
        te = pg[pg.season == S].reset_index(drop=True)
        months = te["game_date"].dt.to_period("M")
        for s in L3.STATS:
            idx, lines = D.eval_rows(te, s)
            y = (te[s].to_numpy(float)[idx] > lines).astype(float)
            for c, feats in CANDS.items():
                va = valA.copy()
                va["exp_" + s] = np.clip(fit(trA, s, feats).predict(valA[feats]), 0.05, None)
                V1.STATS = [s]
                tab = V1.fit_ratio_tables(va, min_prev=D.MIN_PREV)[s]
                V1.STATS = list(L3.STATS)
                if c != "v3_month":
                    mu = np.clip(fit(trB, s, feats).predict(te[feats]), 0.05, None)
                else:
                    mu = np.full(len(te), np.nan)
                    for m in sorted(months.unique()):
                        start = m.to_timestamp()
                        tr = pg[((pg.season >= S - D.TRAIN_SPAN) & (pg.season <= S - 1)) |
                                ((pg.season == S) & (pg.game_date < start))]
                        k = (months == m).to_numpy()
                        mu[k] = np.clip(fit(tr, s, feats).predict(te.loc[k, feats]), 0.05, None)
                p = chances(tab, mu[idx], lines)
                for sl, f in slices.items():
                    m = f(te)[idx] & np.isfinite(p)
                    if m.sum():
                        acc[c][sl][s][0] += D.logloss(p[m], y[m]) * m.sum()
                        acc[c][sl][s][1] += int(m.sum())
                print(S, s, c, round(D.logloss(p[np.isfinite(p)], y[np.isfinite(p)]), 5), flush=True)
    summary = {}
    for c in CANDS:
        summary[c] = {}
        for sl in slices:
            by = {s: round(v[0] / v[1], 5) for s, v in acc[c][sl].items() if v[1]}
            summary[c][sl] = {"mean_logloss": round(float(np.mean(list(by.values()))), 5), "by_stat": by,
                              "rows": sum(v[1] for v in acc[c][sl].values())}
    best = min(CANDS, key=lambda c: summary[c]["all"]["mean_logloss"])
    out = {"doc": "NBA_PROPS_DESIGN_V3", "test_seasons": list(D.TEST_SEASONS), "candidates": list(CANDS),
           "new_features": L3.NEW, "summary": summary, "best": best,
           "note": "Box scores only (2014-15 to 2024-25). No price was read."}
    os.makedirs(OUT, exist_ok=True)
    json.dump(out, open(os.path.join(OUT, "design_v3.json"), "w"), indent=1)
    md = ["# NBA props model v3 -- design study (box scores only, no prices)", "",
          "Mean log loss over points / rebounds / assists / threes, walk-forward 2021-2025 (lower is better).", "",
          "| candidate | " + " | ".join(slices) + " |", "|---|" + "---|" * len(slices)]
    for c in CANDS:
        md.append(f"| {c} | " + " | ".join(str(summary[c][sl]["mean_logloss"]) for sl in slices) + " |")
    md += ["", "Rows: " + ", ".join(f"{sl} {summary['v2'][sl]['rows']}" for sl in slices), "", f"**Best overall:** {best}."]
    open(os.path.join(OUT, "design_v3.md"), "w").write("\n".join(md) + "\n")
    print("\n".join(md))


if __name__ == "__main__":
    main()
