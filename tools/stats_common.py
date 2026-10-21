"""stats_common.py -- shared parts of the Research section's stats files (tools/stats_nba.py, later NHL and NFL):
DeVig's power rating, records and the JSON writer. Display only: nothing here feeds a model, a pick or a test.
"""
import json
import os

import numpy as np

PRIOR_GAMES = 10        # early in a season, last season's rating counts as this many games
CARRY = 0.6             # ...pulled 40% toward average first (teams change over a summer)


def srs(games, teams, ridge=1.0):
    """Simple Rating System: points per game better than an average team on a neutral floor, adjusted for opponents.
    games: [(home, away, home_margin)]. Least squares of margin = r_home - r_away + home edge, a small ridge keeps
    teams with few games near 0. Returns ({team: rating}, home edge)."""
    idx = {t: i for i, t in enumerate(teams)}
    rows = [(idx[h], idx[a], m) for h, a, m in games if h in idx and a in idx]
    if not rows:
        return {t: 0.0 for t in teams}, 0.0
    n = len(teams)
    X = np.zeros((len(rows), n + 1))
    y = np.zeros(len(rows))
    for k, (i, j, m) in enumerate(rows):
        X[k, i], X[k, j], X[k, n], y[k] = 1, -1, 1, m
    reg = ridge * np.eye(n + 1)
    reg[n, n] = 0                                       # the home edge is not shrunk
    beta = np.linalg.solve(X.T @ X + reg, X.T @ y)
    r = beta[:n] - beta[:n].mean()
    return {t: float(r[idx[t]]) for t in teams}, float(beta[n])


def blend(this, last, gp):
    """This season's rating, with last season's (times CARRY) counting as PRIOR_GAMES games early on."""
    w = gp / (gp + PRIOR_GAMES)
    return w * this + (1 - w) * CARRY * last


def record(results):
    """results: 'W'/'L' oldest first -> (wins, losses, last-10 'W-L', streak like 'W3')."""
    w = results.count("W")
    l10 = results[-10:]
    streak = ""
    if results:
        k = 0
        for r in reversed(results):
            if r != results[-1]:
                break
            k += 1
        streak = f"{results[-1]}{k}"
    return w, len(results) - w, f"{l10.count('W')}-{l10.count('L')}", streak


def r1(x, d=1):
    return None if x is None or x != x else round(float(x), d)


def write(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(obj, f, separators=(",", ":"), allow_nan=False)
