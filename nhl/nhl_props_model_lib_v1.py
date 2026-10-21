"""
nhl_props_model_lib_v1.py -- shared code for the NHL player-prop model (v1): goals, assists, points (and shots on
goal, which Kalshi does not list, for information only). Same idea as the NBA and NFL v1 prop models.

Model, in plain words:
  1. From the NHL's own box scores (nhl/data/player_games_<season>.csv.gz), every game each skater actually played.
  2. Before each game, a player's expected value for a stat = an exponentially weighted average of his PREVIOUS played
     games only (recent games count more), shrunk toward his longer-run average when he has few games.
  3. The chance of reaching a line comes from that expected value, by one of two methods (the design study,
     nhl/nhl_props_design_v1.py, picks one on box scores alone, before any price is seen):
       "ratio":   as the NBA model -- per stat and expected-value bucket, the historical distribution of
                  actual / expected; P(stat > line) = share of those ratios with ratio * expected > line;
       "poisson": P(stat > line) from a Poisson distribution with mean = expected.
No betting prices, injuries, lineups or future information are inputs.
"""
import glob
import math
import os

import numpy as np
import pandas as pd

STATS = ["goals", "assists", "points", "sog"]
PROP_STATS = ["goals", "assists", "points"]                       # what Kalshi lists
N_BUCKETS = 10
QGRID = np.linspace(0, 1, 1001)
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")


def load_games(seasons=None, data_dir=DATA):
    """Every skater row of the given seasons (start years; 2010 = 2010-11), regular season and playoffs."""
    frames = []
    for p in sorted(glob.glob(os.path.join(data_dir, "player_games_*.csv.gz"))):
        s = int(os.path.basename(p)[len("player_games_"):-len(".csv.gz")])
        if seasons is None or s in seasons:
            frames.append(pd.read_csv(p, low_memory=False))
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()


def player_games(box):
    """One row per (game, player) the player actually played (time on ice > 0), sorted by player and date."""
    d = box.copy()
    d = d[pd.to_numeric(d["toi_s"], errors="coerce").fillna(0) > 0]
    d["player_id"] = d["player_id"].astype("int64").astype(str)
    for c in STATS:
        d[c] = pd.to_numeric(d[c], errors="coerce").fillna(0.0)
    d["game_date"] = pd.to_datetime(d["game_date"])
    d = d.drop_duplicates(["game_id", "player_id"])
    return d.sort_values(["player_id", "game_date", "game_id"]).reset_index(drop=True)


def add_expectations(pg, span_short, span_long, shrink_k):
    """Expected value of each stat BEFORE each game, from the player's earlier played games only."""
    pg = pg.copy()
    g = pg.groupby("player_id")
    pg["n_prev"] = g.cumcount()
    w = pg["n_prev"] / (pg["n_prev"] + shrink_k)
    for s in STATS:
        prev = g[s].shift(1)
        es = prev.groupby(pg["player_id"]).transform(lambda x: x.ewm(span=span_short, min_periods=1).mean())
        el = prev.groupby(pg["player_id"]).transform(lambda x: x.ewm(span=span_long, min_periods=1).mean())
        pg["exp_" + s] = w * es + (1 - w) * el
    return pg


def next_game_expectations(pg, as_of, span_short, span_long, shrink_k):
    """Expected values for each player's NEXT game, using only games before `as_of` (Timestamp)."""
    hist = pg[pg["game_date"] < as_of].sort_values(["game_date", "game_id"])
    out = {}
    for pid, x in hist.groupby("player_id"):
        n = len(x)
        w = n / (n + shrink_k)
        row = {"n": n, "last_game": x["game_date"].iloc[-1], "team": x["team"].iloc[-1]}
        for s in STATS:
            v = pd.Series(x[s].to_numpy(float))
            row["exp_" + s] = w * v.ewm(span=span_short).mean().iloc[-1] + (1 - w) * v.ewm(span=span_long).mean().iloc[-1]
        out[pid] = row
    return out


def fit_ratio_tables(train, min_prev=5):
    """Per stat: expected-value bucket edges + the (actual / expected) distribution in each bucket, as quantiles."""
    tables = {}
    for s in STATS:
        e, y = train["exp_" + s], train[s]
        m = e.notna() & (train["n_prev"] >= min_prev) & (e > 0)
        ee, yy = e[m].to_numpy(float), y[m].to_numpy(float)
        if len(ee) < 2000:
            continue
        edges = np.unique(np.quantile(ee, np.linspace(0, 1, N_BUCKETS + 1)))
        b = np.clip(np.searchsorted(edges, ee, side="right") - 1, 0, len(edges) - 2)
        qs, ns = [], []
        for i in range(len(edges) - 1):
            r = yy[b == i] / ee[b == i]
            qs.append(np.quantile(r, QGRID).round(4).tolist() if len(r) else [])
            ns.append(int(len(r)))
        tables[s] = {"edges": edges.tolist(), "q": qs, "n": ns}
    return tables


def _share_above(q, n, thr):
    q = np.asarray(q)
    k = len(q) - np.searchsorted(q, thr, side="right")
    return (k / len(q) * n + 0.5) / (n + 1.0)


def p_over_ratio(tables, stat, expected, line):
    t = tables.get(stat)
    if t is None or expected is None or not np.isfinite(expected) or expected <= 0:
        return None
    i = int(np.clip(np.searchsorted(t["edges"], expected, side="right") - 1, 0, len(t["edges"]) - 2))
    if not t["q"][i]:
        return None
    return float(_share_above(t["q"][i], t["n"][i], line / expected))


def p_over_poisson(expected, line):
    """P(X > line) for X ~ Poisson(expected); line is a half-integer (N - 0.5 for an "N+" market)."""
    if expected is None or not np.isfinite(expected) or expected <= 0:
        return None
    k = int(math.floor(line))                                     # X > line  <=>  X >= k + 1
    cdf = sum(math.exp(-expected) * expected ** i / math.factorial(i) for i in range(k + 1))
    return float(min(max(1.0 - cdf, 1e-6), 1 - 1e-6))


def p_over(method, tables, stat, expected, line):
    return p_over_ratio(tables, stat, expected, line) if method == "ratio" else p_over_poisson(expected, line)
