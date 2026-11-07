#!/usr/bin/env python3
"""
nba_modelc_plus_injuries_v1_build.py -- the two files the live "Model C + injuries" (nba/nba_live_tracker_lock_v2.py)
needs from the test in nba_modelc_plus_injuries_v1.py, written once:

  nba/nba_injury_features_train.csv   per game of 2022-23 .. 2025-26: event_id, season, d_out, d_q, d_top (derived
                                      numbers only; the report PDFs and box scores stay out of the repo)
  nba/nba_v2_tiers.json               confidence cutoffs from the model's own walk-forward test games (2023-24 ..
                                      2025-26): top 25% and top 50% of its winner chances, as Model C's were set

It reruns the test's walk-forward and stops unless it reproduces the recorded pooled log loss.
Usage: python3 research/injuries/nba_modelc_plus_injuries_v1_build.py <cache dir>
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import nba_modelc_plus_injuries_v1 as T  # noqa: E402
C = T.C
ROOT = T.ROOT


def features(cache):
    games = []
    for y in T.FORM_ONLY + T.SEASONS:
        g = pd.read_csv(ROOT / "nba" / f"nba_games_raw_season{y}.csv")
        g["season"] = y
        games.append(g)
    games = pd.concat(games, ignore_index=True)
    games = games[games["season_type"] == 2].copy()
    games["date_utc"] = pd.to_datetime(games["date_utc"], utc=True)
    games["played"] = games["played"].astype(str).str.lower() == "true"
    teams = {n: C.resolve_code(n) or n for n in sorted(set(games["home_team"]) | set(games["away_team"]))}
    for col in ("home_team", "away_team"):
        games[col] = games[col].map(teams)
    feat = C.build_features(games)
    feat = feat[feat["season"].isin(T.SEASONS)].copy()
    box = pd.concat([T.load_box(cache, y) for y in T.SEASONS], ignore_index=True)
    box = box[box["team"].isin(set(teams.values()))]
    share = T.shares_before(box)
    parsed, d = {}, {"d_out": [], "d_q": [], "d_top": []}
    for eid, r in feat.iterrows():
        f = T.pick_report(cache, r["date_utc"])
        if f is not None and f not in parsed:
            parsed[f] = T.parse_report(f.read_text(errors="ignore"), teams)
        v = {}
        for side in ("home", "away"):
            t = r[f"{side}_team"]
            rep = parsed[f].get(t, {}) if f is not None else {}
            v[side] = T.side_feats(rep, share.get((int(eid), t), {}))[:3]
        for i, k in enumerate(("d_out", "d_q", "d_top")):
            d[k].append(v["home"][i] - v["away"][i])
    for k, x in d.items():
        feat[k] = x
    return feat


def main(cache):
    feat = features(cache)
    F = list(C.FEATURES_C) + ["d_out", "d_q", "d_top"]
    ok = (feat["played"] == True) & (feat["home_prior_count"] >= C.MIN_HISTORY) & (feat["away_prior_count"] >= C.MIN_HISTORY) & feat["home_win"].notna()  # noqa: E712
    ps, lls = [], []
    for y in T.TEST:
        tr, te = feat[ok & (feat["season"] < y)], feat[ok & (feat["season"] == y)]
        pipe = Pipeline([("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler()),
                         ("clf", LogisticRegression(C=0.2, max_iter=2000))]).fit(tr[F], tr["home_win"])
        p = pipe.predict_proba(te[F])[:, 1]
        ps.append(p)
        lls.append(T.metrics(te["home_win"].values, p)[0])
    ll = float(np.concatenate(lls).mean())
    want = json.loads((HERE / "nba_modelc_plus_injuries_v1_results.json").read_text())["pooled"]["c_plus_injuries"]["log_loss"]
    if round(ll, 4) != want:
        sys.exit(f"walk-forward log loss {ll:.4f} does not reproduce the recorded {want}")
    wp = np.maximum(np.concatenate(ps), 1 - np.concatenate(ps))
    tiers = {"top25": round(float(np.quantile(wp, 0.75)), 4), "top50": round(float(np.quantile(wp, 0.5)), 4),
             "from": "walk-forward test games 2023-24 .. 2025-26 (research/injuries/nba_modelc_plus_injuries_v1.py)",
             "games": int(len(wp))}
    out = feat.reset_index()[["event_id", "season", "d_out", "d_q", "d_top"]].copy()
    for k in ("d_out", "d_q"):
        out[k] = out[k].round(4)
    out.to_csv(ROOT / "nba" / "nba_injury_features_train.csv", index=False)
    (ROOT / "nba" / "nba_v2_tiers.json").write_text(json.dumps(tiers, indent=1) + "\n")
    print(f"reproduced log loss {ll:.4f}; {len(out)} games written; tiers {tiers['top25']} / {tiers['top50']}")


if __name__ == "__main__":
    main(sys.argv[1])
