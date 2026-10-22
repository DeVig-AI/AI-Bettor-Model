"""
nba_props_live_features_v3.py -- v3's inputs for games not yet played: v2's live inputs
(nba_props_live_features_v2.live_features) plus nba_props_model_lib_v3.NEW, computed from the box scores so far and
tonight's availability with the same definitions as nba_props_model_lib_v3.build. check_parity compares the two on a
past date. One unavoidable difference: training's "teammate back" needs the teammate to have played; live it means
he is available tonight.
"""
import numpy as np
import pandas as pd

import nba_props_live_features_v2 as LF2
import nba_props_model_lib_v2 as L2
import nba_props_model_lib_v3 as L3


def _team_status(ps, tgames, team, out_ids, roster):
    gl = tgames.get(team, [])
    tidx = len(gl)
    pos = {gid: i for i, gid in enumerate(gl)}
    mine = ps[ps["last_team"] == team].copy()
    mine["ti"] = mine["last_game_id"].map(pos)
    mine = mine[mine["ti"].notna()]
    avail = (~mine.index.isin(list(out_ids))) & (mine.index.isin(list(roster)) if roster is not None else True)
    gap = tidx - mine["ti"]
    recent = gap <= L2.OUT_LOOKBACK
    out = mine[recent & ~avail]
    fresh = mine[(gap == 1) & ~avail]
    back = mine[avail & (gap >= 2) & recent]
    here_recent = mine[recent & avail]
    vac_usage = float(out["usage_e20"].sum())
    return {"n_out": float(len(out)), "vac_min": float(out["minutes_e20"].sum()), "vac_pts": float(out["points_e20"].sum()),
            "vac_usage": vac_usage, "n_out_fresh": float(len(fresh)), "vac_usage_fresh": float(fresh["usage_e20"].sum()),
            "vac_min_fresh": float(fresh["minutes_e20"].sum()), "vac_pts_fresh": float(fresh["points_e20"].sum()),
            "n_back": float(len(back)), "back_usage": float(back["usage_e20"].sum()),
            "back_min": float(back["minutes_e20"].sum()), "back_pts": float(back["points_e20"].sum()),
            "star_out_usage": float(out["usage_e20"].max()) if len(out) else 0.0,
            "starters_out": float((out["start_rate"] > 0.5).sum()),
            "team_usage": float(here_recent["usage_e20"].sum()) + vac_usage}


def live_features(box, games, out_ids, rosters, season):
    base = LF2.live_features(box, games, out_ids, rosters)
    if base.empty:
        return base
    ps = LF2.player_state(box)
    _, tgames = LF2.team_state(box)
    cur = box[box["season"] == season]
    team_no = cur[cur["played"]].groupby("team")["game_id"].nunique().to_dict()
    with_team = cur[cur["played"]].groupby(["player_id", "team"]).size().to_dict()
    status = {}
    for gm in games:
        for team in (gm["away"], gm["home"]):
            status[(gm["game_key"], team)] = _team_status(ps, tgames, team, out_ids,
                                                          rosters.get(team) if rosters else None)
    rows = []
    for _, r in base.iterrows():
        s = status[(r["game_key"], r["team"])]
        o = status.get((r["game_key"], r["opp"]), {})
        p = ps.loc[r["player_id"]]
        x = {k: s[k] for k in ("n_out_fresh", "vac_usage_fresh", "vac_min_fresh", "vac_pts_fresh", "n_back",
                                "back_usage", "back_min", "back_pts", "star_out_usage", "starters_out")}
        tu = s["team_usage"]
        x["usage_share"] = r["usage_e20"] / tu if tu else np.nan
        x["vac_usage_share"] = r["vac_usage"] / tu if tu else np.nan
        x["opp_n_out"] = o.get("n_out", np.nan)
        x["opp_vac_min"] = o.get("vac_min", np.nan)
        x["opp_vac_pts"] = o.get("vac_pts", np.nan)
        x["new_team"] = 1.0 if p["last_team"] != r["team"] else 0.0
        x["games_with_team"] = float(with_team.get((r["player_id"], r["team"]), 0))
        x["team_game_no"] = float(team_no.get(r["team"], 0))
        rows.append(x)
    return pd.concat([base.reset_index(drop=True), pd.DataFrame(rows)], axis=1)


def check_parity(box_paths, date):
    full = L3.build(box_paths)
    day = pd.Timestamp(date)
    raw = L2.load_box(box_paths)
    hist = raw[raw["game_date"] < day]
    tonight = raw[raw["game_date"] == day]
    games, rosters, out_ids = [], {}, set()
    for gid, g in tonight.groupby("game_id"):
        games.append({"game_key": gid, "date": day, "away": g.loc[g["home"] == 0, "team"].iloc[0],
                      "home": g.loc[g["home"] == 1, "team"].iloc[0]})
        for team, x in g.groupby("team"):
            rosters[team] = set(x["player_id"])
        out_ids |= set(g.loc[~(g["played"] | g["coach_dnp"]), "player_id"])
    season = int(tonight["season"].iloc[0])
    live = live_features(hist, games, out_ids, rosters, season).set_index(["game_key", "player_id"])
    ref = full[(full["game_date"] == day) & full["played"]].set_index(["game_id", "player_id"])
    both = ref.index.intersection(live.index)
    diff = (ref.loc[both, L3.FEATURES].astype(float) - live.loc[both, L3.FEATURES].astype(float)).abs()
    return {"players": len(both), "ref_players": len(ref), "max_abs_diff": diff.max().round(6).to_dict()}
