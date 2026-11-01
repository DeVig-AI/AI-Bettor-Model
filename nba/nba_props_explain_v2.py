#!/usr/bin/env python3
"""
nba_props_explain_v2.py -- why the NBA prop model v2 expects what it does for each player tonight. Read-only next to
the frozen model: it runs the live scorer's own score_games() (nba_props_model_v2_live.py, unchanged) and, at the one
place the model is called, also asks LightGBM for each input's exact share of the prediction (pred_contrib). Writes
nba/props_why.json; changes nothing the model, its paper log or its export read.

The model predicts a player's expected stat as exp(sum of every input's share + a constant), so the expected number
splits exactly, in steps that multiply out to it:
  typical player   the constant: an average rotation player in the training seasons
  minutes & role   recent minutes, starts, last game's minutes, games played and missed, days since he last played,
                   guard / center
  recent form      his recent averages, per-minute rates and usage in each stat
  opponent         tonight's opponent's pace and what it allows per game in each stat, his own team's pace
  rest & home      rest days, back-to-back, home / away
  teammates out    teammates ruled out tonight and the minutes, shots and stats they leave behind
The inputs inside each step overlap, so only a step's total is reported, never one input's share. The chance of
going over a line then comes from the expected number and how much players' games vary around it (the model's
ratio tables); that last step is already in the export as model_p.

Usage:  python3 nba/nba_props_explain_v2.py      (after nba_props_model_v2_live.py, same inputs)
"""
import json
import math
import os
import re
import sys
from datetime import datetime, timezone

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import nba_props_model_v2_live as V          # noqa: E402  (frozen; read-only use)

F, L, LF = V.F, V.L, V.LF
OUT = os.path.join(HERE, "props_why.json")

OWN_FORM = [s for s in L.OWN if s != "minutes"]
GROUPS = {
    "role": [f"minutes_e{sp}" for sp in L.SPANS] + ["start_rate", "last_min", "n_prev", "missed_10", "days_since",
                                                     "is_G", "is_C"],
    "form": [f"{s}_e{sp}" for s in OWN_FORM for sp in L.SPANS] + [f"{s}_pm" for s in L.STATS + ["usage"]],
    "opponent": ["team_pace", "opp_pace"] + [f"opp_allowed_{s}" for s in L.STATS],
    "rest": ["home", "rest_days", "b2b"],
    "out": ["n_out", "vac_min_same"] + list(L.VAC),
}
ORDER = ["role", "form", "opponent", "rest", "out"]

CAPTURED = {}      # (game_key, player_id, stat) -> explanation
OUT_NAMES = {}     # (game_key, team) -> teammates ruled out tonight


def r2(x):
    return None if x is None or (isinstance(x, float) and not math.isfinite(x)) else round(float(x), 2)


def explaining_p_over(model, stat, fr, lines, _orig=F.p_over):
    mu, p = _orig(model, stat, fr, lines)
    feats = model["features"]
    assert set(f for g in GROUPS.values() for f in g) == set(feats), "feature groups don't cover the model"
    c = model["boosters"][stat].predict(fr[feats], pred_contrib=True)[0]
    share = dict(zip(feats, c[:-1]))
    base = float(c[-1])
    raw = base + sum(share.values())
    assert abs(max(math.exp(raw), 0.05) - mu[0]) < 1e-6 * max(1.0, mu[0]), (stat, math.exp(raw), mu[0])
    steps, z = [["typical", round(math.exp(base), 3)]], base
    for g in ORDER:
        z += sum(share[f] for f in GROUPS[g])
        steps.append([g, round(math.exp(z), 3)])
    r = fr.iloc[0]
    CAPTURED[(r["game_key"], str(r["player_id"]), stat)] = {
        "team": r["team"], "opp": r["opp"], "expected": round(float(mu[0]), 3), "steps": steps,
        "read": {
            "avg_recent": r2(r[f"{stat}_e5"]), "avg_longer": r2(r[f"{stat}_e20"]),
            "min_recent": r2(r["minutes_e5"]), "min_longer": r2(r["minutes_e20"]), "last_min": r2(r["last_min"]),
            "start_rate": r2(r["start_rate"]), "per_min": None if not np.isfinite(r[f"{stat}_pm"]) else round(float(r[f"{stat}_pm"]), 4), "usage_recent": r2(r["usage_e5"]),
            "days_since": r2(r["days_since"]), "missed_10": r2(r["missed_10"]),
            "opp_allows": r2(r[f"opp_allowed_{stat}"]), "opp_pace": r2(r["opp_pace"]), "team_pace": r2(r["team_pace"]),
            "home": bool(r["home"]), "rest_days": r2(r["rest_days"]), "b2b": bool(r["b2b"]),
            "n_out": r2(r["n_out"]), "vac_min": r2(r["vac_min"]), "vac_stat": r2(r.get(
                {"points": "vac_pts", "rebounds": "vac_reb", "assists": "vac_ast"}.get(stat, ""), np.nan)),
        },
    }
    return mu, p


def explaining_live_features(box, games, out_ids, rosters=None, _orig=LF.live_features):
    """The same call, plus the names of each team's teammates ruled out (the same rule live_features uses)."""
    ps = LF.player_state(box)
    _, tgames = LF.team_state(box)
    for gm in games:
        for team in (gm["away"], gm["home"]):
            if team not in tgames:
                continue
            gl = tgames[team]
            pos = {gid: i for i, gid in enumerate(gl)}
            mine = ps[ps["last_team"] == team]
            ti = mine["last_game_id"].map(pos)
            recent = mine[ti.notna() & (len(gl) - ti <= L.OUT_LOOKBACK)]
            roster = rosters.get(team) if rosters else None
            is_out = recent.index.isin(list(out_ids)) | (
                ~recent.index.isin(list(roster)) if roster is not None else False)
            o = recent[is_out].sort_values("minutes_e20", ascending=False)
            OUT_NAMES[(gm["game_key"], team)] = [[n, round(float(m), 1)] for n, m in zip(o["name"], o["minutes_e20"])]
    return _orig(box, games, out_ids, rosters)


def main():
    F.p_over = explaining_p_over
    LF.live_features = explaining_live_features
    t0 = V.now_utc()
    prices = json.load(open(V.PRICES))
    scored = V.score_games(t0, prices)
    players = {}
    for key, v in scored.items():
        for o in v["rows"]:
            if o["model_p"] is None or not o.get("pid"):
                continue
            e = CAPTURED.get((key, o["pid"], o["stat"]))
            if not e:
                continue
            k = f"{key}|{o['player']}|{o['stat']}"
            if k not in players:
                players[k] = dict(e, teammates_out=OUT_NAMES.get((key, e["team"]), [])[:8])
    old = json.load(open(OUT)) if os.path.exists(OUT) else {}
    now = datetime.now(timezone.utc)
    for k, e in (old.get("players") or {}).items():           # games that tipped off keep their last explanation
        gk = k.split("|")[0]
        g = scored.get(gk)
        if k not in players and (g is None or g["game"]["kick"] <= now):
            if re.match(r"\d{4}-\d{2}-\d{2}_", gk) and (now - datetime.fromisoformat(gk[:10]).replace(
                    tzinfo=timezone.utc)).days <= 2:
                players[k] = e
    out = {"model": "NBA_PROPS_MODEL_V2", "generated_at": V.iso(now),
           "how": "steps: the player's expected stat after each step, in order (typical player, minutes & role, "
                  "recent form, opponent, rest & home, teammates out = expected). Exact for the model's LightGBM "
                  "Poisson means (pred_contrib).",
           "players": dict(sorted(players.items()))}
    with open(OUT, "w") as f:
        json.dump(out, f, separators=(",", ":"), sort_keys=True)
    print(f"{len(players)} player-stats explained across {len(scored)} games")


if __name__ == "__main__":
    main()
