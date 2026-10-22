#!/usr/bin/env python3
"""
nba_props_fit_v2.py -- fits the NBA prop model v2 for one target season with the exact method the design study
chose (nba/design/design_v2.json): LightGBM Poisson means per stat + ratio-table spread fit out of sample.

For target season T:  model A trained on T-6..T-2 predicts T-1 -> ratio tables of (actual / A's mean);
                      model B trained on T-6..T-1 -> the mean used for season T games.
Nothing from season T or later is used. Output: nba/nba_props_model_v2_T<T>.json.gz (models + tables, gzip mtime 0).

Run from the repo root:  python3 nba/nba_props_fit_v2.py --box DIR --target 2026
"""
import argparse, gzip, json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import nba_props_design_v2 as D  # noqa: E402  (V1.STATS is narrowed to the four Kalshi stats on import)
import nba_props_model_lib_v1 as V1  # noqa: E402
import nba_props_model_lib_v2 as L  # noqa: E402


def out_path(target):
    return os.path.join(HERE, f"nba_props_model_v2_T{target}.json.gz")


def frame(box_dir, first, last):
    d = L.build([os.path.join(box_dir, f"player_box_{y}.csv") for y in range(first, last + 1)])
    d["is_G"] = (d["pos"] == "G").astype(float)
    d["is_C"] = (d["pos"] == "C").astype(float)
    return d


def fit(box_dir, T):
    d = frame(box_dir, T - D.TRAIN_SPAN - 1, T - 1)
    pg = d[d["played"] & (d["n_prev"] >= D.MIN_PREV)]
    trA = pg[(pg.season >= T - D.TRAIN_SPAN) & (pg.season <= T - 2)]
    valA = pg[pg.season == T - 1]
    trB = pg[(pg.season >= T - D.TRAIN_SPAN) & (pg.season <= T - 1)]
    out = {"doc": "NBA_PROPS_MODEL_V2", "target_season": T, "features": L.FEATURES + ["is_G", "is_C"],
           "train_A": [T - D.TRAIN_SPAN, T - 2], "spread_fit_on": T - 1, "train_B": [T - D.TRAIN_SPAN, T - 1],
           "params": D.PARAMS, "rounds": D.ROUNDS, "rows": {"A": len(trA), "spread": len(valA), "B": len(trB)},
           "models": {}, "tables": {}}
    va = valA.copy()
    for s in L.STATS:
        va["exp_" + s] = np.clip(D.predict(D.fit_gbm(trA, s), valA), 0.05, None)
        out["models"][s] = D.fit_gbm(trB, s).model_to_string()
        print(T, s, "done", flush=True)
    out["tables"] = V1.fit_ratio_tables(va, min_prev=D.MIN_PREV)
    return out


def load(T):
    import lightgbm as lgb
    m = json.loads(gzip.open(out_path(T)).read())
    m["boosters"] = {s: lgb.Booster(model_str=v) for s, v in m["models"].items()}
    return m


def p_over(model, stat, feats_df, lines):
    """P(stat > line) for each row of feats_df (pre-game v2 features) and its line."""
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
    out = fit(a.box, a.target)
    raw = json.dumps(out, sort_keys=True).encode()
    with open(out_path(a.target), "wb") as f, gzip.GzipFile(fileobj=f, mode="wb", mtime=0) as g:
        g.write(raw)
    print("wrote", out_path(a.target), len(raw) // 1024, "KB raw")


if __name__ == "__main__":
    main()
