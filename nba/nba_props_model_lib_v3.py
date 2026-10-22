"""
nba_props_model_lib_v3.py -- inputs for the NBA prop model v3: v2's inputs plus what the v2 back-test showed it
handled worst (teammates newly out; early season), all from box scores, all known before tip-off:
  - teammates newly out (played the team's previous game, out tonight) and teammates back (missed the previous game,
    playing tonight) -- their usage, minutes and points; the most-used player out; starters out;
  - shares: the player's usage as a share of his team's recent usage, and the vacated usage as a share of it;
  - the opponent's teammates out (minutes, points);
  - new team (his last game was for another team), games with this team, team game number in the season.
"Out" is decided per date: every game of a date is read before anyone's team is updated, so a player who changed
teams counts by what was known that morning (v2 updated within the date in game-id order).
"""
import numpy as np
import pandas as pd

import nba_props_model_lib_v2 as L2

STATS = L2.STATS
LADDER = L2.LADDER
NEW = ["n_out_fresh", "vac_usage_fresh", "vac_min_fresh", "vac_pts_fresh", "n_back", "back_usage", "back_min",
       "back_pts", "star_out_usage", "starters_out", "usage_share", "vac_usage_share", "opp_n_out", "opp_vac_min",
       "opp_vac_pts", "new_team", "games_with_team", "team_game_no"]
FEATURES = L2.FEATURES + ["is_G", "is_C"] + NEW


def absence_v3(d):
    """Per (game, team): v2's vacated sums recomputed date by date, plus fresh-out / back / star / starters."""
    d = d.sort_values(["game_date", "game_id", "team", "player_id"]).reset_index(drop=True)
    roster, current_team = {}, {}
    rows = []
    for date, dg in d.groupby("game_date", sort=True):
        updates = []
        for (gid, team), g in dg.groupby(["game_id", "team"], sort=False):
            tidx = g["tidx"].iloc[0]
            r = roster.setdefault(team, {})
            here = set(g.loc[g["played"] | g["coach_dnp"], "player_id"])
            playing = set(g.loc[g["played"], "player_id"])
            mine = {pid: v for pid, v in r.items() if current_team.get(pid) == team}
            out = [v for pid, v in mine.items() if pid not in here and tidx - v[0] <= L2.OUT_LOOKBACK]
            fresh = [v for pid, v in mine.items() if pid not in here and v[0] == tidx - 1]
            back = [v for pid, v in mine.items() if pid in playing and tidx - v[0] >= 2 and tidx - v[0] <= L2.OUT_LOOKBACK]
            row = {"game_id": gid, "team": team, "n_out": float(len(out))}
            for k in L2.VAC:
                row[k] = float(sum(v[2][k] for v in out))
            for p in ("G", "F", "C"):
                row["vac_min_" + p] = float(sum(v[2]["vac_min"] for v in out if v[1] == p))
            row.update(n_out_fresh=float(len(fresh)), vac_usage_fresh=float(sum(v[2]["vac_usage"] for v in fresh)),
                       vac_min_fresh=float(sum(v[2]["vac_min"] for v in fresh)),
                       vac_pts_fresh=float(sum(v[2]["vac_pts"] for v in fresh)),
                       n_back=float(len(back)), back_usage=float(sum(v[2]["vac_usage"] for v in back)),
                       back_min=float(sum(v[2]["vac_min"] for v in back)),
                       back_pts=float(sum(v[2]["vac_pts"] for v in back)),
                       star_out_usage=float(max([v[2]["vac_usage"] for v in out], default=0.0)),
                       starters_out=float(sum(v[3] > 0.5 for v in out)),
                       team_usage=float(sum(v[2]["vac_usage"] for pid, v in mine.items()
                                            if tidx - v[0] <= L2.OUT_LOOKBACK and pid in here) + row["vac_usage"]))
            rows.append(row)
            for _, p in g[g["played"]].iterrows():
                updates.append((team, p["player_id"], (tidx, p["pos"], {k: p["_after_" + k] for k in L2.VAC},
                                                         p["_after_start"])))
        for team, pid, v in updates:            # the date's games are all read before anyone moves
            roster.setdefault(team, {})[pid] = v
            current_team[pid] = team
    return pd.DataFrame(rows)


def build(paths):
    d = L2.load_box(paths)
    d = L2.player_features(d)
    # state after each played game, for describing teammates (start rate too)
    d = d.sort_values(["player_id", "game_date", "game_id"])
    pl = d["played"]
    d["_after_start"] = d.loc[pl].groupby("player_id")["starter"].transform(
        lambda x: x.astype(float).ewm(span=10, min_periods=1).mean())
    d = L2.team_features(d)
    a = absence_v3(d)
    d = d.merge(a, on=["game_id", "team"], how="left")
    d["vac_min_same"] = np.select([d["pos"] == p for p in ("G", "F", "C")],
                                  [d["vac_min_" + p] for p in ("G", "F", "C")], 0.0)
    o = a[["game_id", "team", "n_out", "vac_min", "vac_pts"]].rename(
        columns={"team": "opp", "n_out": "opp_n_out", "vac_min": "opp_vac_min", "vac_pts": "opp_vac_pts"})
    d = d.merge(o, on=["game_id", "opp"], how="left")
    d = d.sort_values(["player_id", "game_date", "game_id"])
    d["_tp"] = d["tidx"].where(d["played"])
    last_tidx = L2._pregame(d, ["_tp"])["_tp"]
    d["missed_10"] = (d["tidx"] - last_tidx - 1).clip(lower=0, upper=10).fillna(0.0)
    d.loc[d["team"] != d["last_team"], "missed_10"] = 0.0
    d["new_team"] = ((d["team"] != d["last_team"]) & d["last_team"].notna()).astype(float)
    # played games for this team, this season, before tonight
    d["_pt"] = (d["played"]).astype(float)
    d["games_with_team"] = d.groupby(["player_id", "team", "season"])["_pt"].transform(lambda x: x.shift(1).cumsum()).fillna(0.0)
    d = d.drop(columns=["_tp", "_pt"])
    tg = d[["game_id", "team", "season", "game_date"]].drop_duplicates(["game_id", "team"]).sort_values("game_date")
    tg["team_game_no"] = tg.groupby(["team", "season"]).cumcount()
    d = d.merge(tg[["game_id", "team", "team_game_no"]], on=["game_id", "team"], how="left")
    d["usage_share"] = d["usage_e20"] / d["team_usage"].replace(0, np.nan)
    d["vac_usage_share"] = d["vac_usage"] / d["team_usage"].replace(0, np.nan)
    d["is_G"] = (d["pos"] == "G").astype(float)
    d["is_C"] = (d["pos"] == "C").astype(float)
    return d.sort_values(["game_date", "game_id", "team", "player_id"]).reset_index(drop=True)
