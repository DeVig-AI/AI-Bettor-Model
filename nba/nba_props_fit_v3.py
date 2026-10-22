#!/usr/bin/env python3
"""
nba_props_fit_v3.py -- fits the NBA prop model v3 for one target season: the v2 method (nba_props_fit_v2.py) with
v3's inputs (nba_props_model_lib_v3.FEATURES), chosen in nba/design/design_v3.md. Fit once per season (the monthly
refit scored 0.0002 better, inside the 0.0005 tie margin, so the simpler fit is kept).

For target season T:  model A trained on T-6..T-2 predicts T-1 -> ratio tables of (actual / A's mean);
                      model B trained on T-6..T-1 -> the mean used for season T games.
Output: nba/nba_props_model_v3_T<T>.json.gz (gzip mtime 0).
Run from the repo root:  python3 nba/nba_props_fit_v3.py --box DIR --target 2026
"""
import argparse, gzip, json, os, sys
import numpy as np
import lightgbm as lgb

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import nba_props_design_v2 as D  # noqa: E402
import nba_props_model_lib_v1 as V1  # noqa: E402
import nba_props_model_lib_v3 as L3  # noqa: E402


def out_path(target):
    return os.path.join(HERE, f"nba_props_model_v3_T{target}.json.gz")


def frame(box_dir, first, last):
    return L3.build([os.path.join(box_dir, f"player_box_{y}.csv") for y in range(first, last + 1)])


def fit_one(df, s):
    return lgb.train(D.PARAMS, lgb.Dataset(df[L3.FEATURES], label=df[s]), D.ROUNDS)


def fit(box_dir, T):
    d = frame(box_dir, T - D.TRAIN_SPAN - 1, T - 1)
    pg = d[d["played"] & (d["n_prev"] >= D.MIN_PREV)]
    trA = pg[(pg.season >= T - D.TRAIN_SPAN) & (pg.season <= T - 2)]
    valA = pg[pg.season == T - 1]
    trB = pg[(pg.season >= T - D.TRAIN_SPAN) & (pg.season <= T - 1)]
    out = {"doc": "NBA_PROPS_MODEL_V3", "target_season": T, "features": L3.FEATURES,
           "train_A": [T - D.TRAIN_SPAN, T - 2], "spread_fit_on": T - 1, "train_B": [T - D.TRAIN_SPAN, T - 1],
           "params": D.PARAMS, "rounds": D.ROUNDS, "rows": {"A": len(trA), "spread": len(valA), "B": len(trB)},
           "models": {}, "tables": {}}
    va = valA.copy()
    for s in L3.STATS:
        va["exp_" + s] = np.clip(fit_one(trA, s).predict(valA[L3.FEATURES]), 0.05, None)
        out["models"][s] = fit_one(trB, s).model_to_string()
        print(T, s, "done", flush=True)
    out["tables"] = V1.fit_ratio_tables(va, min_prev=D.MIN_PREV)
    return out


def load(T):
    m = json.loads(gzip.open(out_path(T)).read())
    m["boosters"] = {s: lgb.Booster(model_str=v) for s, v in m["models"].items()}
    return m


def p_over(model, stat, feats_df, lines):
    mu = np.clip(model["boosters"][stat].predict(feats_df[model["features"]]), 0.05, None)
    p = np.full(len(mu), np.nan)
    lines = np.asarray(lines, float)
    for ln in np.unique(lines):
        k = lines == ln
        p[k] = V1.p_over_vec(model["tables"][stat], mu[k], ln)
    return mu, p


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--box", required=True)
    ap.add_argument("--target", type=int, required=True)
    a = ap.parse_args()
    raw = json.dumps(fit(a.box, a.target), sort_keys=True).encode()
    with open(out_path(a.target), "wb") as f, gzip.GzipFile(fileobj=f, mode="wb", mtime=0) as g:
        g.write(raw)
    print("wrote", out_path(a.target))


if __name__ == "__main__":
    main()
