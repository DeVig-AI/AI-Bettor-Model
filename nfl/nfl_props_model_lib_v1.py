"""
nfl_props_model_lib_v1.py -- shared code for the NFL player-prop model (v1).

Model, in plain words:
  1. From nflverse play-by-play, build every player's stats in every game he touched the ball / was targeted.
  2. Before each game, a player's expected value for a stat = an exponentially weighted average of his
     PREVIOUS games only (recent games count more), shrunk toward his longer-run average when he has few games.
  3. How spread out the result is comes from history: for each stat and expected-value bucket, the empirical
     distribution of (actual / expected) across past player-games. P(stat > line) = share of those past
     ratios with ratio * expected > line.
No betting prices, injuries or future information are inputs. Everything is computed from games before the
one being predicted (shift(1)).
"""
import numpy as np
import pandas as pd

STATS = ["passing_yards", "passing_tds", "passing_attempts", "passing_completions", "interceptions",
         "rushing_yards", "rushing_attempts", "receiving_yards", "receptions", "rush_rec_yards", "touchdowns"]
# which role a stat belongs to (a player's expected value is only built from games where he had that role)
ROLE = {"passing_yards": "pass", "passing_tds": "pass", "passing_attempts": "pass", "passing_completions": "pass",
        "interceptions": "pass", "rushing_yards": "rush", "rushing_attempts": "rush", "receiving_yards": "rec",
        "receptions": "rec", "rush_rec_yards": "skill", "touchdowns": "skill"}
SPAN_SHORT, SPAN_LONG, SHRINK_K = 5, 16, 2.0
N_BUCKETS = 10
PBP_COLS = ["game_id", "season", "week", "season_type", "game_date", "posteam", "defteam", "play_type",
            "pass_attempt", "rush_attempt", "sack", "complete_pass", "incomplete_pass", "interception",
            "passer_player_id", "passer_player_name", "passing_yards", "pass_touchdown",
            "receiver_player_id", "receiver_player_name", "receiving_yards",
            "rusher_player_id", "rusher_player_name", "rushing_yards", "rush_touchdown",
            "td_player_id", "touchdown", "two_point_attempt"]


def load_pbp(path):
    d = pd.read_csv(path, usecols=lambda c: c in PBP_COLS, low_memory=False)
    d = d[d["two_point_attempt"].fillna(0) == 0]
    return d


def player_games(pbp):
    """One row per (game, player) with the stats a sportsbook/exchange settles on."""
    p = pbp
    g = ["game_id", "season", "week", "season_type", "game_date"]
    # passing (attempts exclude sacks; spikes count as attempts, as in official stats)
    pa = p[p["passer_player_id"].notna() & (p["sack"].fillna(0) == 0) & (p["pass_attempt"].fillna(0) == 1)]
    passing = pa.groupby(g + ["passer_player_id", "posteam", "defteam"], dropna=False).agg(
        passing_attempts=("pass_attempt", "sum"), passing_completions=("complete_pass", "sum"),
        passing_yards=("passing_yards", "sum"), passing_tds=("pass_touchdown", "sum"),
        interceptions=("interception", "sum"), name_p=("passer_player_name", "last")).reset_index() \
        .rename(columns={"passer_player_id": "player_id"})
    passing["role_pass"] = 1
    ru = p[p["rusher_player_id"].notna() & (p["rush_attempt"].fillna(0) == 1)]
    rushing = ru.groupby(g + ["rusher_player_id", "posteam", "defteam"], dropna=False).agg(
        rushing_attempts=("rush_attempt", "sum"), rushing_yards=("rushing_yards", "sum"),
        rush_td=("rush_touchdown", "sum"), name_r=("rusher_player_name", "last")).reset_index() \
        .rename(columns={"rusher_player_id": "player_id"})
    rushing["role_rush"] = 1
    rc = p[p["receiver_player_id"].notna() & (p["pass_attempt"].fillna(0) == 1) & (p["sack"].fillna(0) == 0)]
    rec = rc.groupby(g + ["receiver_player_id", "posteam", "defteam"], dropna=False).agg(
        targets=("pass_attempt", "sum"), receptions=("complete_pass", "sum"), receiving_yards=("receiving_yards", "sum"),
        name_c=("receiver_player_name", "last")).reset_index().rename(columns={"receiver_player_id": "player_id"})
    rec["role_rec"] = 1
    td = p[(p["touchdown"].fillna(0) == 1) & p["td_player_id"].notna()]
    tds = td.groupby(["game_id", "td_player_id"]).size().rename("touchdowns").reset_index() \
        .rename(columns={"td_player_id": "player_id"})
    keys = g + ["player_id", "posteam", "defteam"]
    out = passing.merge(rushing, on=keys, how="outer").merge(rec, on=keys, how="outer")
    out = out.merge(tds, on=["game_id", "player_id"], how="left")
    for c in ["passing_attempts", "passing_completions", "passing_yards", "passing_tds", "interceptions",
              "rushing_attempts", "rushing_yards", "rush_td", "targets", "receptions", "receiving_yards",
              "touchdowns", "role_pass", "role_rush", "role_rec"]:
        out[c] = out[c].fillna(0)
    out["rush_rec_yards"] = out["rushing_yards"] + out["receiving_yards"]
    out["role_skill"] = ((out["role_rush"] + out["role_rec"]) > 0).astype(int)
    out["name"] = out["name_p"].fillna(out["name_r"]).fillna(out["name_c"])
    out = out.drop(columns=["name_p", "name_r", "name_c"])
    out["game_date"] = pd.to_datetime(out["game_date"])
    return out.sort_values(["player_id", "game_date", "game_id"]).reset_index(drop=True)


def add_expectations(pg):
    """Expected value of each stat BEFORE each game, from the player's earlier games with that role only."""
    pg = pg.copy()
    for s in STATS:
        role = "role_" + ROLE[s]
        sub = pg[pg[role] == 1][["player_id", "game_date", s]].copy()
        grp = sub.groupby("player_id")[s]
        prev = grp.shift(1)
        sub["ewm_s"] = prev.groupby(sub["player_id"]).transform(lambda x: x.ewm(span=SPAN_SHORT, min_periods=1).mean())
        sub["ewm_l"] = prev.groupby(sub["player_id"]).transform(lambda x: x.ewm(span=SPAN_LONG, min_periods=1).mean())
        sub["n_prev"] = grp.cumcount()
        w = sub["n_prev"] / (sub["n_prev"] + SHRINK_K)
        sub["exp_" + s] = w * sub["ewm_s"] + (1 - w) * sub["ewm_l"]
        pg = pg.merge(sub[["exp_" + s, "n_prev"]].rename(columns={"n_prev": "n_" + s}),
                      left_index=True, right_index=True, how="left")
    return pg


def next_game_expectations(pg, as_of):
    """Expected values for each player's NEXT game, using only games before `as_of` (a Timestamp)."""
    hist = pg[pg["game_date"] < as_of]
    rows = {}
    for s in STATS:
        role = "role_" + ROLE[s]
        sub = hist[hist[role] == 1].sort_values("game_date")
        for pid, x in sub.groupby("player_id")[s]:
            v = x.to_numpy(float)
            n = len(v)
            es = pd.Series(v).ewm(span=SPAN_SHORT).mean().iloc[-1]
            el = pd.Series(v).ewm(span=SPAN_LONG).mean().iloc[-1]
            w = n / (n + SHRINK_K)
            rows.setdefault(pid, {})["exp_" + s] = w * es + (1 - w) * el
            rows[pid]["n_" + s] = n
    return rows


def fit_ratio_tables(train, min_prev=3):
    """Per stat: expected-value bucket edges + the empirical actual/expected ratios inside each bucket."""
    tables = {}
    for s in STATS:
        e, n, y = train.get("exp_" + s), train.get("n_" + s), train.get(s)
        m = e.notna() & (n >= min_prev) & (e > 0)
        if ROLE[s] != "skill":
            m &= train["role_" + ROLE[s]] == 1
        else:
            m &= train["role_skill"] == 1
        ee, yy = e[m].to_numpy(float), y[m].to_numpy(float)
        if len(ee) < 500:
            continue
        edges = np.unique(np.quantile(ee, np.linspace(0, 1, N_BUCKETS + 1)))
        b = np.clip(np.searchsorted(edges, ee, side="right") - 1, 0, len(edges) - 2)
        tables[s] = {"edges": edges.tolist(),
                     "ratios": [np.sort(yy[b == i] / ee[b == i]).round(4).tolist() for i in range(len(edges) - 1)]}
    return tables


def p_over(tables, stat, expected, line):
    """P(stat > line) given the player's expected value. None if the stat isn't modeled."""
    t = tables.get(stat)
    if t is None or expected is None or not np.isfinite(expected) or expected <= 0:
        return None
    edges = t["edges"]
    i = int(np.clip(np.searchsorted(edges, expected, side="right") - 1, 0, len(edges) - 2))
    r = np.asarray(t["ratios"][i])
    if len(r) == 0:
        return None
    thr = line / expected
    k = len(r) - np.searchsorted(r, thr, side="right")      # ratios strictly above threshold
    return float((k + 0.5) / (len(r) + 1.0))                # light smoothing, never exactly 0 or 1
