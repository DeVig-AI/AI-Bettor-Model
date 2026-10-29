#!/usr/bin/env python3
"""
build_model.py -- NFL Handicapper v1: chooses and fits the two lines (ratings.py) on FIT_SEASONS only and writes
nfl/handicapper/model.json, plus a validation look at 2023-24 against the closing spread.

  early line  ratings as of 6 days before kickoff; groups from base, matchup, schedule, luck
  late line   ratings as of 1 day before kickoff;  the same candidates plus injuries (fit from 2014: the injury data
              starts in 2013 and its first weeks are thin)

Steps, all inside FIT_SEASONS: pick alpha / carry from ratings.GRID by the leave-one-season-out MAE of the base
groups, forward-select the other groups, fit, and take sigma from the residuals. Nothing from 2023 on is used.
Run from the repo root:  python3 nfl/handicapper/build_model.py
"""
import json
import os
import sys

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(os.path.dirname(HERE)))
sys.path.insert(0, HERE)
import ratings as R  # noqa: E402

DATA = os.path.join(HERE, "data")
MODEL = os.path.join(HERE, "model.json")
LINES = {
    "early": dict(before=pd.Timedelta(days=6), candidates=["matchup", "schedule", "luck"], first=R.FIT_SEASONS[0]),
    "late": dict(before=pd.Timedelta(days=1), candidates=["matchup", "schedule", "luck", "injuries"], first=2014),
}


def load():
    games = pd.read_csv(os.path.join(DATA, "games.csv"))
    team = pd.read_csv(os.path.join(DATA, "team_games.csv"))
    av = pd.read_csv(os.path.join(DATA, "availability.csv"))
    return games, team, av


def in_fit(df, first):
    return df[(df.season >= first) & (df.season <= R.FIT_SEASONS[1]) & df.actual.notna()]


def main():
    games, team, av = load()
    log = []
    best = None
    for p in R.GRID:                                       # ratings settings, judged on the early line's base groups
        w = R.Walk(games, team, **p)
        f = in_fit(R.features(w, games, av, LINES["early"]["before"]), R.FIT_SEASONS[0])
        m = R.cv_mae(f, ["base"])
        log.append({**p, "cv_mae_base": round(m, 4)})
        print(p, round(m, 4))
        if best is None or m < best[0]:
            best = (m, p, w)
    _, params, walk = best
    model = {"version": "v1", "fit_seasons": list(R.FIT_SEASONS), "ratings": params, "grid": log, "lines": {}}
    report = []
    for name, spec in LINES.items():
        f_all = R.features(walk, games, av, spec["before"])
        f = in_fit(f_all, spec["first"])
        groups, mae, trail = R.select(f, spec["candidates"])
        c = R.cols(groups)
        b = R.fit(f[c].values, f.actual.values)
        resid = f.actual.values - R.predict(b, f[c].values)
        sigma = float(np.std(resid))
        model["lines"][name] = {
            "before_hours": spec["before"].total_seconds() / 3600, "fit_from": spec["first"], "groups": groups,
            "selection": trail, "coef": dict(zip(c + ["const"], [round(float(x), 5) for x in b])),
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


if __name__ == "__main__":
    main()
