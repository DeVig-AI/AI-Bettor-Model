#!/usr/bin/env python3
"""
build_model_v2.py -- NFL Handicapper v2: v1's lines plus quarterback ratings (qb.py), chosen and fit exactly as v1
(build_model.py) on ratings.FIT_SEASONS only, written to nfl/handicapper/model_v2.json.

  team ratings   v1's settings, unchanged (model.json)
  QB ratings     alpha / carry from GRID_QB by the leave-one-season-out MAE of the early line's base + qb groups
  groups         forward selection from base; candidates are v1's plus "qb" (qb, qb_change)

No game from 2023 on is used to choose or fit anything; 2025-26 (the v1 back-test's games) are not even looked at.
v2 is judged only on games played after it is frozen (HANDICAPPER_V2_LIVE_PREREG.md).
Run from the repo root:  python3 nfl/handicapper/build_model_v2.py
"""
import json
import os
import sys

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(os.path.dirname(HERE)))
sys.path.insert(0, HERE)
import qb as Q  # noqa: E402
import ratings as R  # noqa: E402

R.GROUPS = {**R.GROUPS, "qb": ["qb", "qb_change"]}       # v2's extra group (ratings.py itself is frozen as v1)
DATA = os.path.join(HERE, "data")
MODEL = os.path.join(HERE, "model_v2.json")
GRID_QB = [dict(alpha=a, carry=c) for a in (0.05, 0.1, 0.2) for c in (0.6, 0.8)]
LINES = {
    "early": dict(before=pd.Timedelta(days=6), candidates=["matchup", "schedule", "luck", "qb"], first=R.FIT_SEASONS[0],
                  injuries=False),
    "late": dict(before=pd.Timedelta(days=1), candidates=["matchup", "schedule", "luck", "injuries", "qb"], first=2014,
                 injuries=True),
}


def load():
    d = {n: pd.read_csv(os.path.join(DATA, f"{n}.csv")) for n in ("games", "team_games", "qb_games", "availability")}
    return d["games"], d["team_games"], d["qb_games"], d["availability"]


def qb_constants(games, qb_games):
    st = Q.starters(qb_games)
    fit = set(games[games.season.between(*R.FIT_SEASONS)].game_id)
    league = float(np.mean([v for (gid, _), (_, v) in st.items() if gid in fit]))
    return league, Q.debut_value(games, qb_games, R.FIT_SEASONS)


def frame(walk, qbw, games, av, spec):
    f = R.features(walk, games, av, spec["before"])
    return f.merge(Q.features(qbw, games, av, spec["before"], spec["injuries"]), on="game_id")


def in_fit(df, first):
    return df[(df.season >= first) & (df.season <= R.FIT_SEASONS[1]) & df.actual.notna()]


def main():
    games, team, qbg, av = load()
    v1 = json.load(open(os.path.join(HERE, "model.json")))
    walk = R.Walk(games, team, **v1["ratings"])
    league, debut = qb_constants(games, qbg)
    print(f"league starter VALUE {league:.1f}, debut {debut:.1f}")
    log, best = [], None
    for p in GRID_QB:
        qbw = Q.QBWalk(games, qbg, debut=debut, league=league, **p)
        f = in_fit(frame(walk, qbw, games, av, LINES["early"]), R.FIT_SEASONS[0])
        m = R.cv_mae(f, ["base", "qb"])
        log.append({**p, "cv_mae_base_qb": round(m, 4)})
        print(p, round(m, 4))
        if best is None or m < best[0]:
            best = (m, p, qbw)
    _, qp, qbw = best
    model = {"version": "v2", "fit_seasons": list(R.FIT_SEASONS), "ratings": v1["ratings"],
             "qb": {**qp, "league": round(league, 4), "debut": round(debut, 4), "recent": Q.RECENT, "out_qb": Q.OUT_QB},
             "grid_qb": log, "lines": {}}
    report = []
    for name, spec in LINES.items():
        f_all = frame(walk, qbw, games, av, spec)
        f = in_fit(f_all, spec["first"])
        groups, mae, trail = R.select(f, spec["candidates"])
        c = R.cols(groups)
        b = R.fit(f[c].values, f.actual.values)
        sigma = float(np.std(f.actual.values - R.predict(b, f[c].values)))
        model["lines"][name] = {
            "before_hours": spec["before"].total_seconds() / 3600, "fit_from": spec["first"], "injuries": spec["injuries"],
            "groups": groups, "selection": trail, "coef": dict(zip(c + ["const"], [round(float(x), 5) for x in b])),
            "sigma": round(sigma, 4), "cv_mae": round(mae, 4)}
        v = f_all[f_all.season.between(2023, 2024) & f_all.actual.notna() & f_all.spread_line.notna()]
        ours = R.predict(b, v[c].values)
        report.append(
            f"{name}: groups {groups}, sigma {sigma:.2f}; 2023-24 ({len(v)} games): MAE ours {np.mean(np.abs(ours - v.actual)):.2f}"
            f" vs closing spread {np.mean(np.abs(v.spread_line - v.actual)):.2f}; ours vs closing spread: MAE"
            f" {np.mean(np.abs(ours - v.spread_line)):.2f}, corr {np.corrcoef(ours, v.spread_line)[0, 1]:.3f}")
    model["validation_2023_24"] = report
    with open(MODEL, "w") as fh:
        json.dump(model, fh, indent=1)
    print("\n".join(report))
    for name, l in model["lines"].items():
        print(name, l["coef"], l["selection"])


if __name__ == "__main__":
    main()
