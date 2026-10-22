"""
nba_props_model_lib_v2.py -- shared code for the NBA player-prop model v2.

v1 averaged each player's past stat lines. v2 adds what Kalshi's price knows and v1 did not, built from box scores
only, every input known before tip-off:
  - minutes and role: recent minutes, starts, games missed lately, rest days, back-to-backs, home/away;
  - teammates out: teammates who played for this team in its last 10 games and are not playing tonight for a reason
    other than "coach's decision" (injury, illness, rest, suspension, not with team) -- the injury report lists them
    before tip-off. Their recent minutes, shots, assists, rebounds and points are "vacated";
  - the player's per-minute rates and usage (shots + 0.44 free throws + turnovers);
  - the opponent's pace and what it allows per game in each stat; the team's own pace.
A gradient-boosted Poisson model per stat (LightGBM) turns these into the expected value; the spread of outcomes
around it comes from history. No betting prices are inputs.
"""
import numpy as np
import pandas as pd

STATS = ["points", "rebounds", "assists", "threes"]          # the four stats Kalshi lists
LADDER = {"points": [9.5, 14.5, 19.5, 24.5, 29.5, 34.5, 39.5], "rebounds": [3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 11.5],
          "assists": [1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 9.5], "threes": [0.5, 1.5, 2.5, 3.5, 4.5, 5.5]}
ESPN_TO_STD = {"GS": "GSW", "NO": "NOP", "NY": "NYK", "SA": "SAS", "UTAH": "UTA", "WSH": "WAS"}
COLS = ["game_id", "season", "season_type", "game_date", "athlete_id", "athlete_display_name",
        "athlete_position_abbreviation", "team_abbreviation", "opponent_team_abbreviation", "home_away", "minutes",
        "points", "rebounds", "offensive_rebounds", "assists", "three_point_field_goals_made",
        "three_point_field_goals_attempted", "field_goals_attempted", "free_throws_attempted", "turnovers",
        "did_not_play", "reason", "starter"]
NUM = ["minutes", "points", "rebounds", "offensive_rebounds", "assists", "threes", "fg3a", "fga", "fta", "turnovers"]
OWN = STATS + ["minutes", "usage", "fg3a"]
SPANS = (5, 20)
OUT_LOOKBACK = 10
VAC = {"vac_min": "minutes", "vac_usage": "usage", "vac_ast": "assists", "vac_reb": "rebounds", "vac_pts": "points"}

FEATURES = ([f"{s}_e{sp}" for s in OWN for sp in SPANS] + [f"{s}_pm" for s in STATS + ["usage"]] +
            ["start_rate", "last_min", "n_prev", "days_since", "missed_10", "home", "rest_days", "b2b",
             "team_pace", "opp_pace"] + [f"opp_allowed_{s}" for s in STATS] +
            ["n_out", "vac_min_same"] + list(VAC))


def load_box(paths):
    frames = []
    for p in paths:
        d = pd.read_csv(p, usecols=lambda c: c in COLS, low_memory=False)
        frames.append(d[d["season_type"].isin([2, 3, 5])])
    d = pd.concat(frames, ignore_index=True)
    d = d.rename(columns={"three_point_field_goals_made": "threes", "three_point_field_goals_attempted": "fg3a",
                          "field_goals_attempted": "fga", "free_throws_attempted": "fta", "athlete_id": "player_id",
                          "athlete_display_name": "name", "team_abbreviation": "team",
                          "opponent_team_abbreviation": "opp", "athlete_position_abbreviation": "pos"})
    d["team"] = d["team"].replace(ESPN_TO_STD)
    d["opp"] = d["opp"].replace(ESPN_TO_STD)
    d = d.dropna(subset=["player_id"])
    d["player_id"] = d["player_id"].astype("int64").astype(str)
    for c in NUM:
        d[c] = pd.to_numeric(d[c], errors="coerce").fillna(0.0)
    d["usage"] = d["fga"] + 0.44 * d["fta"] + d["turnovers"]
    d["game_date"] = pd.to_datetime(d["game_date"])
    dnp = d["did_not_play"].astype(str).str.lower().eq("true")
    d["played"] = ~dnp & (d["minutes"] > 0)
    d["coach_dnp"] = dnp & d["reason"].fillna("").str.upper().str.startswith("COACH")
    d["starter"] = d["starter"].astype(str).str.lower().eq("true")
    d["home"] = d["home_away"].eq("home").astype(float)
    d["pos"] = d["pos"].fillna("").str[:1].replace({"": "X"})
    d = d.drop_duplicates(["game_id", "player_id"])
    return d.sort_values(["game_date", "game_id", "team", "player_id"]).reset_index(drop=True)


def _pregame(d, after_cols):
    """after_cols hold a player's state right after each PLAYED game (NaN on other rows). Returns the state each row
    sees before its game: the latest played game strictly before it."""
    a = d[["player_id"] + after_cols].copy()
    a[after_cols] = a.groupby("player_id")[after_cols].ffill()
    return a.groupby("player_id")[after_cols].shift(1)


def player_features(d):
    d = d.sort_values(["player_id", "game_date", "game_id"]).copy()
    pl = d["played"]
    g = d[pl].groupby("player_id")
    after = pd.DataFrame(index=d.index)
    for s in OWN:
        for sp in SPANS:
            after[f"{s}_e{sp}"] = g[s].transform(lambda x: x.ewm(span=sp, min_periods=1).mean())
    pm = d.loc[pl, "minutes"].clip(lower=1)
    for s in STATS + ["usage"]:
        after[f"{s}_pm"] = (d.loc[pl, s] / pm).groupby(d.loc[pl, "player_id"]).transform(
            lambda x: x.ewm(span=20, min_periods=1).mean())
    after["start_rate"] = g["starter"].transform(lambda x: x.astype(float).ewm(span=10, min_periods=1).mean())
    after["last_min"] = d.loc[pl, "minutes"]
    after["n_prev"] = g.cumcount() + 1
    after["last_date"] = d.loc[pl, "game_date"]
    after["last_team"] = d.loc[pl, "team"]
    cols = list(after.columns)
    pre = _pregame(d.join(after), cols)
    d[cols] = pre
    d["n_prev"] = d["n_prev"].fillna(0)
    d["days_since"] = (d["game_date"] - pd.to_datetime(d["last_date"])).dt.days
    # state right after each played game (not shifted): used to describe teammates who are out tonight
    for k, s in VAC.items():
        col = f"{s}_e20"
        d["_after_" + k] = after[col]
    return d.sort_values(["game_date", "game_id", "team", "player_id"]).reset_index(drop=True)


def team_features(d):
    """Pace, what each team allows, rest and back-to-back, all from games before this one."""
    pl = d[d["played"]]
    t = pl.groupby(["game_id", "game_date", "team", "opp"], as_index=False)[
        STATS + ["fga", "fta", "offensive_rebounds", "turnovers"]].sum()
    t["poss"] = t["fga"] + 0.44 * t["fta"] - t["offensive_rebounds"] + t["turnovers"]
    opp = t[["game_id", "team", "poss"] + STATS].rename(columns={"team": "opp", "poss": "o_poss",
                                                                **{s: "a_" + s for s in STATS}})
    t = t.merge(opp, on=["game_id", "opp"], how="left").sort_values(["team", "game_date", "game_id"])
    t["pace"] = (t["poss"] + t["o_poss"]) / 2
    gt = t.groupby("team")
    out = t[["game_id", "team", "opp"]].copy()
    out["team_pace"] = gt["pace"].transform(lambda x: x.shift(1).ewm(span=10, min_periods=1).mean())
    for s in STATS:
        out["allowed_" + s] = gt["a_" + s].transform(lambda x: x.shift(1).ewm(span=10, min_periods=1).mean())
    out["rest_days"] = gt["game_date"].diff().dt.days.clip(upper=7).fillna(7)
    out["b2b"] = (out["rest_days"] == 1).astype(float)
    out["tidx"] = gt.cumcount()
    o = out[["game_id", "team", "team_pace"] + ["allowed_" + s for s in STATS]].rename(
        columns={"team": "opp", "team_pace": "opp_pace", **{"allowed_" + s: "opp_allowed_" + s for s in STATS}})
    out = out.merge(o, on=["game_id", "opp"], how="left")
    keep = ["game_id", "team", "team_pace", "rest_days", "b2b", "tidx", "opp_pace"] + [f"opp_allowed_{s}" for s in STATS]
    return d.merge(out[keep], on=["game_id", "team"], how="left")


def absence_features(d):
    """Walk every team's games in date order. A teammate is 'out' tonight if he played for this team within its last
    OUT_LOOKBACK games, has not since played for another team, and is neither playing nor a coach's-decision DNP."""
    d = d.sort_values(["game_date", "game_id", "team", "player_id"]).reset_index(drop=True)
    roster = {}            # team -> {player_id: (tidx last played, pos, {vac stat: value after that game})}
    current_team = {}      # player_id -> team he last played for
    rows = []
    for (gid, team), g in d.groupby(["game_id", "team"], sort=False):
        tidx = g["tidx"].iloc[0]
        r = roster.setdefault(team, {})
        here = set(g.loc[g["played"] | g["coach_dnp"], "player_id"])
        out = [(pos, v) for pid, (ti, pos, v) in r.items()
               if pid not in here and tidx - ti <= OUT_LOOKBACK and current_team.get(pid) == team]
        fresh = [pid for pid, (ti, _, _) in r.items()
                 if pid not in here and ti == tidx - 1 and current_team.get(pid) == team]
        row = {"game_id": gid, "team": team, "n_out": float(len(out)), "n_out_fresh": float(len(fresh))}
        for k in VAC:
            row[k] = float(sum(v[k] for _, v in out))
        for p in ("G", "F", "C"):
            row["vac_min_" + p] = float(sum(v["vac_min"] for pos, v in out if pos == p))
        rows.append(row)
        for _, p in g[g["played"]].iterrows():
            r[p["player_id"]] = (tidx, p["pos"], {k: p["_after_" + k] for k in VAC})
            current_team[p["player_id"]] = team
    a = pd.DataFrame(rows)
    d = d.merge(a, on=["game_id", "team"], how="left")
    d["vac_min_same"] = np.select([d["pos"] == p for p in ("G", "F", "C")],
                                  [d["vac_min_" + p] for p in ("G", "F", "C")], 0.0)
    # games the player missed in his team's last 10 (returning from injury / role change)
    d = d.sort_values(["player_id", "game_date", "game_id"])
    d["_tp"] = d["tidx"].where(d["played"])
    last_tidx = _pregame(d, ["_tp"])["_tp"]
    d["missed_10"] = (d["tidx"] - last_tidx - 1).clip(lower=0, upper=10).fillna(0.0)
    d = d.drop(columns="_tp")
    d.loc[d["team"] != d["last_team"], "missed_10"] = 0.0
    return d.sort_values(["game_date", "game_id", "team", "player_id"]).reset_index(drop=True)


def build(paths):
    d = load_box(paths)
    d = player_features(d)
    d = team_features(d)
    d = absence_features(d)
    return d
