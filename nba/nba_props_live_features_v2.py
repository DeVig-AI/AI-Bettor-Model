"""
nba_props_live_features_v2.py -- the v2 model's inputs for games that have not been played yet.

nba_props_model_lib_v2.build computes inputs for games already in the box scores. Before tip-off there is no box
score, so this file computes the same inputs from the box scores so far plus tonight's availability:
  - a player's own inputs = his state after his last played game (the same averages build() carries forward);
  - team / opponent pace and allowed = their averages after their last game; rest days from their last game;
  - teammates out = players who played for the team in its last 10 games, still count it as their latest team, and
    are tonight on the injury report as Out / Doubtful / suspended, or are no longer on the team's roster
    (in the box scores, a player missing from the game counts as out the same way).
tests (check_parity) rebuild a past date both ways and compare.
"""
import numpy as np
import pandas as pd

import nba_props_model_lib_v2 as L

AFTER_PLAYER = ([f"{s}_e{sp}" for s in L.OWN for sp in L.SPANS] + [f"{s}_pm" for s in L.STATS + ["usage"]] +
                ["start_rate", "last_min", "n_prev"])


def player_state(box):
    """One row per player: his inputs as of right after his last played game."""
    pl = box[box["played"]].sort_values(["player_id", "game_date", "game_id"])
    g = pl.groupby("player_id")
    st = pd.DataFrame({"player_id": pl["player_id"]})
    for s in L.OWN:
        for sp in L.SPANS:
            st[f"{s}_e{sp}"] = g[s].transform(lambda x: x.ewm(span=sp, min_periods=1).mean())
    pm = pl["minutes"].clip(lower=1)
    for s in L.STATS + ["usage"]:
        st[f"{s}_pm"] = (pl[s] / pm).groupby(pl["player_id"]).transform(lambda x: x.ewm(span=20, min_periods=1).mean())
    st["start_rate"] = g["starter"].transform(lambda x: x.astype(float).ewm(span=10, min_periods=1).mean())
    st["last_min"] = pl["minutes"]
    st["n_prev"] = g.cumcount() + 1
    st["last_date"] = pl["game_date"]
    st["last_team"] = pl["team"]
    st["last_game_id"] = pl["game_id"]
    st["pos"] = pl["pos"]
    st["name"] = pl["name"]
    return st.groupby("player_id").tail(1).set_index("player_id")


def team_state(box):
    """One row per team: pace / allowed averages after its last game, last game date, games played, game list."""
    pl = box[box["played"]]
    t = pl.groupby(["game_id", "game_date", "team", "opp"], as_index=False)[
        L.STATS + ["fga", "fta", "offensive_rebounds", "turnovers"]].sum()
    t["poss"] = t["fga"] + 0.44 * t["fta"] - t["offensive_rebounds"] + t["turnovers"]
    opp = t[["game_id", "team", "poss"] + L.STATS].rename(columns={"team": "opp", "poss": "o_poss",
                                                                 **{s: "a_" + s for s in L.STATS}})
    t = t.merge(opp, on=["game_id", "opp"], how="left").sort_values(["team", "game_date", "game_id"])
    t["pace"] = (t["poss"] + t["o_poss"]) / 2
    g = t.groupby("team")
    t["team_pace"] = g["pace"].transform(lambda x: x.ewm(span=10, min_periods=1).mean())
    for s in L.STATS:
        t["allowed_" + s] = g["a_" + s].transform(lambda x: x.ewm(span=10, min_periods=1).mean())
    games = {tm: x["game_id"].tolist() for tm, x in t.groupby("team")}
    last = g.tail(1).set_index("team")
    return last, games


def live_features(box, games, out_ids, rosters=None):
    """box: L.load_box rows of games before tonight. games: [{"game_key", "date" (Timestamp), "away", "home"}].
    out_ids: player ids ruled out tonight. rosters: {team: set(player_id)} or None (then nobody is 'off the roster').
    Returns one row per (game, team, player) for players who could play: L.FEATURES + is_G / is_C + ids."""
    ps = player_state(box)
    ts, tgames = team_state(box)
    rows = []
    for gm in games:
        for team, opp in ((gm["away"], gm["home"]), (gm["home"], gm["away"])):
            if team not in ts.index:
                continue
            gl = tgames[team]
            tidx = len(gl)                                  # tonight's index in the team's game list
            pos_in_team = {gid: i for i, gid in enumerate(gl)}
            mine = ps[ps["last_team"] == team]
            ti = mine["last_game_id"].map(pos_in_team)
            # played for the team in its last 10 games (tidx - ti <= 10) and the team is still his latest team
            recent = mine[ti.notna() & (tidx - ti <= L.OUT_LOOKBACK)]
            roster = rosters.get(team) if rosters else None
            is_out = recent.index.isin(list(out_ids)) | (
                ~recent.index.isin(list(roster)) if roster is not None else False)
            out = recent[is_out]
            vac = {k: float(out[f"{s}_e20"].sum()) for k, s in L.VAC.items()}
            vac_pos = {p: float(out.loc[out["pos"] == p, "minutes_e20"].sum()) for p in ("G", "F", "C")}
            tr, orow = ts.loc[team], ts.loc[opp] if opp in ts.index else None
            rest = min((gm["date"] - tr["game_date"]).days, 7)
            cands = set(roster) if roster is not None else set(recent.index)
            cands = [p for p in cands if p in ps.index and p not in out_ids]
            for pid in cands:
                p = ps.loc[pid]
                r = {"game_key": gm["game_key"], "team": team, "opp": opp, "player_id": pid, "name": p["name"],
                     "pos": p["pos"]}
                for c in AFTER_PLAYER:
                    r[c] = float(p[c])
                r["days_since"] = float((gm["date"] - p["last_date"]).days)
                if p["last_team"] == team and p["last_game_id"] in pos_in_team:
                    r["missed_10"] = float(np.clip(tidx - pos_in_team[p["last_game_id"]] - 1, 0, 10))
                else:
                    r["missed_10"] = 0.0
                r["home"] = 1.0 if team == gm["home"] else 0.0
                r["rest_days"] = float(rest)
                r["b2b"] = 1.0 if rest == 1 else 0.0
                r["team_pace"] = float(tr["team_pace"])
                r["opp_pace"] = float(orow["team_pace"]) if orow is not None else np.nan
                for s in L.STATS:
                    r["opp_allowed_" + s] = float(orow["allowed_" + s]) if orow is not None else np.nan
                r["n_out"] = float(len(out))
                r.update(vac)
                r["vac_min_same"] = vac_pos.get(p["pos"], 0.0)
                r["is_G"] = 1.0 if p["pos"] == "G" else 0.0
                r["is_C"] = 1.0 if p["pos"] == "C" else 0.0
                rows.append(r)
    return pd.DataFrame(rows)


def check_parity(box_paths, date):
    """Rebuild one past date's inputs with live_features (history before the date + that night's actual availability)
    and compare with build(). Returns the largest absolute difference per input over the players who played."""
    full = L.build(box_paths)
    day = pd.Timestamp(date)
    raw = L.load_box(box_paths)
    hist = raw[raw["game_date"] < day]
    tonight = raw[raw["game_date"] == day]
    games, rosters, out_ids = [], {}, set()
    for gid, g in tonight.groupby("game_id"):
        home = g.loc[g["home"] == 1, "team"].iloc[0]
        away = g.loc[g["home"] == 0, "team"].iloc[0]
        games.append({"game_key": gid, "date": day, "away": away, "home": home})
        for team, x in g.groupby("team"):
            rosters[team] = set(x["player_id"])
        out_ids |= set(g.loc[~(g["played"] | g["coach_dnp"]), "player_id"])
    live = live_features(hist, games, out_ids, rosters).set_index(["game_key", "player_id"])
    ref = full[(full["game_date"] == day) & full["played"]].copy()
    ref["is_G"] = (ref["pos"] == "G").astype(float)
    ref["is_C"] = (ref["pos"] == "C").astype(float)
    ref = ref.set_index(["game_id", "player_id"])
    both = ref.index.intersection(live.index)
    cols = L.FEATURES + ["is_G", "is_C"]
    diff = (ref.loc[both, cols].astype(float) - live.loc[both, cols].astype(float)).abs()
    return {"players": len(both), "ref_players": len(ref), "max_abs_diff": diff.max().round(6).to_dict()}
