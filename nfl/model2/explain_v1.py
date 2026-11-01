#!/usr/bin/env python3
"""
explain_v1.py -- why NFL Model 2.0 gives each coming game the chance it does. Read-only next to the locked model:
it rebuilds the same 66 inputs the live run uses (Model 1.0's builder + the injury study's build(), the same calls
as nfl_model2_v1.live()), checks that the model's chance from them matches nfl/model2/upcoming.json, and splits
each game's number into what pushed it, so the app can say why the model leans the way it does (picks and passes).

Model 2.0 is a logistic regression on scaled inputs, so the number splits exactly, in three steps that add up to it:
  home field   two league-average teams, nobody out (the model's intercept)
  form         everything it reads about the two teams: points, results and EPA per play over their last 6 and 12
               games, and days of rest (63 of Model 1.0's inputs)
  who is out   the injury study's 3 inputs (home minus away: last game's QB unavailable, regulars out, questionable)
The 63 form inputs overlap heavily (a team's EPA, margin and record all say the same thing), so the model's weight on
any one of them alone can point the "wrong" way; only their sum means something, and only the sum is reported. The
stats themselves are written next to it, so the app can show what the model read.

Writes nfl/model2/why.json. Changes nothing the model or its tracker read.

Usage:  python3 nfl/model2/explain_v1.py
"""
import json
import math
import os
import sys
from datetime import datetime, timezone

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import nfl_model2_v1 as M                    # noqa: E402  (locked; read-only use)

INJ, T = M.INJ, M.T
OUT = os.path.join(HERE, "why.json")

def sig(x):
    return 1 / (1 + math.exp(-x))


def features():
    """The coming week's games with Model 2.0's inputs, built exactly as nfl_model2_v1.live() builds them."""
    import joblib
    if os.path.isdir(INJ.CACHE):
        for n in os.listdir(INJ.CACHE):
            if str(M.SEASON) in n or "games.csv" in n:
                os.remove(os.path.join(INJ.CACHE, n))
    w, art = T.model1()
    F = art["features"]
    m2 = joblib.load(M.ARTIFACT)
    s = INJ.get("schedules/games.csv")
    wk, s26 = M.next_week(s)
    hist_s = s[s.season.between(2018, M.SEASON - 1)]
    hist_pb = pd.concat([pd.read_parquet(T.get_raw(f"pbp/play_by_play_{y}.parquet"), columns=T.PBP_COLS)
                         for y in range(2018, M.SEASON)], ignore_index=True)
    pb26 = pd.read_parquet(T.get_raw(f"pbp/play_by_play_{M.SEASON}.parquet"), columns=T.PBP_COLS)
    o = w.build_exact_v53(hist_s, hist_pb, s26, pb26, F)
    o = o[o.week == wk].copy()
    g = s26.copy()
    g["home"], g["away"] = g.home_team.map(INJ.fr), g.away_team.map(INJ.fr)
    g = g.sort_values(["season", "week", "gameday", "game_id"]).reset_index(drop=True)
    feats, _ = INJ.build(g, INJ.get(f"snap_counts/snap_counts_{M.SEASON}.csv"),
                         INJ.get(f"injuries/injuries_{M.SEASON}.csv"), INJ.get("players/players.csv"),
                         INJ.get(f"weekly_rosters/roster_weekly_{M.SEASON}.csv"))
    o = o.merge(feats[["game_id"] + M.INJURY], on="game_id", how="left")
    o[M.INJURY] = o[M.INJURY].fillna(0.0)
    return wk, o, m2


def explain(o, m2):
    pipe, F = m2["model"], m2["features"]
    imp, sc, lr = pipe.named_steps["imp"], pipe.named_steps["sc"], pipe.named_steps["m"]
    X = o[F]
    z = sc.transform(imp.transform(X))
    coef, b = lr.coef_[0], float(lr.intercept_[0])
    p_model = pipe.predict_proba(X)[:, 1]
    inj = np.array([f in M.INJURY for f in F])
    out = {}
    for i, r in enumerate(o.itertuples()):
        contrib = coef * z[i]
        form, hurt = float(contrib[~inj].sum()), float(contrib[inj].sum())
        p = sig(b + form + hurt)
        assert abs(p - p_model[i]) < 1e-9, (r.game_id, p, p_model[i])
        v = lambda f: None if pd.isna(getattr(r, f)) else round(float(getattr(r, f)), 3)
        teams = {}
        for side, P in (("home", "H"), ("away", "A")):
            teams[side] = {k: v(f"{P}_{k}") for k in (
                "s6_win", "s6_margin", "s6_pf", "s6_pa", "s6_net_epa", "s6_off_epa", "s6_def_epa_allowed",
                "s12_win", "s12_margin", "s12_net_epa", "s12_off_epa", "s12_def_epa_allowed", "rest")}
        out[r.game_id] = {
            "home": r.home_team, "away": r.away_team, "home_wp": round(p, 4),
            # the home team's chance after each step, in order: home field, + form, + who is out (= home_wp)
            "steps": {"home_field": round(sig(b), 4), "form": round(sig(b + form), 4), "who_is_out": round(p, 4)},
            "teams": teams,
            "injuries": {k: v(k) for k in M.INJURY},       # home minus away
        }
    return out


def main():
    now = datetime.now(timezone.utc)
    wk, o, m2 = features()
    games = explain(o, m2)
    up = json.load(open(M.UPCOMING)) if os.path.exists(M.UPCOMING) else {}
    gaps = [abs(games[g]["home_wp"] - u["home_wp"]) for g, u in (up.get("games") or {}).items() if g in games]
    old = json.load(open(OUT)) if os.path.exists(OUT) else {}
    for gid, v in (old.get("games") or {}).items():          # keep the last explanation of games that started
        if gid not in games:
            games[gid] = v
    started = {g for g, u in (up.get("games") or {}).items()
               if datetime.fromisoformat(u["kickoff"].replace("Z", "+00:00")) <= now}
    for gid in started:                                      # a started game keeps its last pre-kickoff explanation
        if gid in old.get("games", {}):
            games[gid] = old["games"][gid]
    out = {"model": "NFL_MODEL_2_0", "generated_at": M.iso(now), "season": M.SEASON, "week": wk,
           "max_gap_vs_upcoming": round(max(gaps), 6) if gaps else None,
           "how": "steps: the home team's chance from home field alone, then with both teams' form (last 6 and 12 "
                  "games, rest), then with who is out (= home_wp). Exact for the model's logistic regression.",
           "games": dict(sorted(games.items()))}
    with open(OUT, "w") as f:
        json.dump(out, f, indent=1, sort_keys=True)
    print(f"week {wk}: {len(o)} games explained, max gap vs upcoming.json {out['max_gap_vs_upcoming']}")


if __name__ == "__main__":
    main()
