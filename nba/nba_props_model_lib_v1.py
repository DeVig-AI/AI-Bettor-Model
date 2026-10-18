"""
nba_props_model_lib_v1.py -- shared code for the NBA player-prop model (v1). Same method as the NFL v1 prop model.

Model, in plain words:
  1. From ESPN player box scores (sportsdataverse), take every game each player actually played.
  2. Before each game, a player's expected value for a stat = an exponentially weighted average of his PREVIOUS
     played games only (recent games count more), shrunk toward his longer-run average when he has few games.
  3. The spread of outcomes comes from history: for each stat and expected-value bucket, the empirical distribution of
     (actual / expected) over past player-games. P(stat > line) = share of those past ratios with ratio * expected > line.
No betting prices, injuries, lineups or future information are inputs.
"""
import numpy as np
import pandas as pd

BASE = ["points", "rebounds", "assists", "threes", "steals", "blocks", "turnovers"]
COMBOS = {"pts_reb_ast": ["points", "rebounds", "assists"], "pts_reb": ["points", "rebounds"],
          "pts_ast": ["points", "assists"], "reb_ast": ["rebounds", "assists"], "stl_blk": ["steals", "blocks"]}
STATS = BASE + list(COMBOS)
SPAN_SHORT, SPAN_LONG, SHRINK_K = 5, 20, 3.0
N_BUCKETS = 10
ESPN_TO_STD = {"GS": "GSW", "NO": "NOP", "NY": "NYK", "SA": "SAS", "UTAH": "UTA", "WSH": "WAS"}
COLS = ["game_id", "season", "season_type", "game_date", "game_date_time", "athlete_id", "athlete_display_name",
        "team_abbreviation", "opponent_team_abbreviation", "minutes", "points", "rebounds", "assists",
        "three_point_field_goals_made", "steals", "blocks", "turnovers", "did_not_play", "starter"]


def load_box(path):
    d = pd.read_csv(path, usecols=lambda c: c in COLS, low_memory=False)
    d = d[d["season_type"].isin([2, 3, 5])]                     # regular season, playoffs, play-in (no All-Star)
    d = d.rename(columns={"three_point_field_goals_made": "threes", "athlete_id": "player_id",
                          "athlete_display_name": "name", "team_abbreviation": "team", "opponent_team_abbreviation": "opp"})
    d["team"] = d["team"].replace(ESPN_TO_STD); d["opp"] = d["opp"].replace(ESPN_TO_STD)
    return d


def player_games(box):
    """One row per (game, player) for games the player actually played (minutes > 0)."""
    d = box.copy()
    d = d[(d["did_not_play"] != True) & (pd.to_numeric(d["minutes"], errors="coerce").fillna(0) > 0)]  # noqa: E712
    d = d.dropna(subset=["player_id"])
    d["player_id"] = d["player_id"].astype("int64").astype(str)
    for c in BASE:
        d[c] = pd.to_numeric(d[c], errors="coerce").fillna(0.0)
    for k, parts in COMBOS.items():
        d[k] = d[parts].sum(axis=1)
    d["game_date"] = pd.to_datetime(d["game_date"])
    d = d.drop_duplicates(["game_id", "player_id"])
    return d.sort_values(["player_id", "game_date", "game_id"]).reset_index(drop=True)


def add_expectations(pg):
    """Expected value of each stat BEFORE each game, from the player's earlier played games only."""
    pg = pg.copy()
    g = pg.groupby("player_id")
    pg["n_prev"] = g.cumcount()
    w = pg["n_prev"] / (pg["n_prev"] + SHRINK_K)
    for s in STATS:
        prev = g[s].shift(1)
        es = prev.groupby(pg["player_id"]).transform(lambda x: x.ewm(span=SPAN_SHORT, min_periods=1).mean())
        el = prev.groupby(pg["player_id"]).transform(lambda x: x.ewm(span=SPAN_LONG, min_periods=1).mean())
        pg["exp_" + s] = w * es + (1 - w) * el
    return pg


def next_game_expectations(pg, as_of):
    """Expected values for each player's NEXT game, using only games before `as_of` (Timestamp)."""
    hist = pg[pg["game_date"] < as_of].sort_values("game_date")
    out = {}
    for pid, x in hist.groupby("player_id"):
        n = len(x)
        w = n / (n + SHRINK_K)
        row = {"n": n, "last_game": x["game_date"].iloc[-1], "team": x["team"].iloc[-1]}
        for s in STATS:
            v = x[s].to_numpy(float)
            es = pd.Series(v).ewm(span=SPAN_SHORT).mean().iloc[-1]
            el = pd.Series(v).ewm(span=SPAN_LONG).mean().iloc[-1]
            row["exp_" + s] = w * es + (1 - w) * el
        out[pid] = row
    return out


QGRID = np.linspace(0, 1, 1001)   # each bucket's ratio distribution is stored as 1,001 quantiles (keeps the file small)


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
    """Share of the bucket's ratios strictly above thr, from its quantile grid, lightly smoothed (never 0 or 1)."""
    q = np.asarray(q)
    k = len(q) - np.searchsorted(q, thr, side="right")          # grid points above thr
    frac = k / len(q)
    return (frac * n + 0.5) / (n + 1.0)


def p_over(tables, stat, expected, line):
    """P(stat > line) given the player's expected value. None if the stat isn't modeled."""
    t = tables.get(stat)
    if t is None or expected is None or not np.isfinite(expected) or expected <= 0:
        return None
    edges = t["edges"]
    i = int(np.clip(np.searchsorted(edges, expected, side="right") - 1, 0, len(edges) - 2))
    if not t["q"][i]:
        return None
    return float(_share_above(t["q"][i], t["n"][i], line / expected))


def p_over_vec(tab, e, line):
    edges = np.asarray(tab["edges"]); out = np.full(len(e), np.nan)
    b = np.clip(np.searchsorted(edges, e, side="right") - 1, 0, len(edges) - 2)
    for i in np.unique(b):
        if not tab["q"][i]: continue
        m = b == i
        out[m] = _share_above(tab["q"][i], tab["n"][i], line / e[m])
    return out
