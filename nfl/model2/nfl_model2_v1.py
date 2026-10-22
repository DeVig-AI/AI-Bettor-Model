#!/usr/bin/env python3
"""
nfl_model2_v1.py -- NFL Model 2.0 = Model 1.0's 63 features + the injury study's 3 injury features, same pipeline.
Paper-tracked next to Model 1.0 (which keeps running unchanged); see nfl/model2/NFL_MODEL_2_0_LIVE_PREREG.md.

  fit   fit on 2018-2025 (2,227 games, as in research/injuries/NFL_MODEL1_PLUS_INJURIES_V1_PREREG.md) and save
        nfl/model2/NFL_MODEL_2_0.joblib (done once, then locked).
  live  (default) forecast the next NFL week's games not started yet, with the injury reports and rosters as
        nflverse has them now; write nfl/model2/upcoming.json (read by the Models page, which grades the last
        number before kickoff) and append every forecast to nfl/model2/MODEL2_LIVE_LOG.jsonl.

Features are built by the same locked code that was tested: Model 1.0's own builder (from its bundle) and the
injury study's build(). Each live run checks that Model 1.0's forecast from these features equals what Model 1.0's
tracker locked for the same games (parity), and records the largest gap.

Usage:  python3 nfl/model2/nfl_model2_v1.py [fit|live]
"""
import hashlib
import json
import os
import sqlite3
import sys
from datetime import datetime, timezone

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "research", "injuries"))
import nfl_injury_study_v1 as INJ            # noqa: E402  (locked; read-only use)
import nfl_model1_plus_injuries_v1 as T      # noqa: E402  (locked; read-only use)

ARTIFACT = os.path.join(HERE, "NFL_MODEL_2_0.joblib")
UPCOMING = os.path.join(HERE, "upcoming.json")
LOG = os.path.join(HERE, "MODEL2_LIVE_LOG.jsonl")
TRACKER = os.path.join(ROOT, "nfl", "PROSPECTIVE_TRACKER_V1_1.sqlite3")
DECIDER = "OLD_LAB28_43_HYBRID"
SEASON = 2026
INJURY = T.INJURY


def iso(t):
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def fit():
    import joblib
    from sklearn.base import clone
    w, art = T.model1()
    F = art["features"]
    d = T.model1_features(w, F)
    INJ.SEASONS = range(2017, 2026)
    inj, _ = INJ.build(*INJ.load())
    d = d.merge(inj[["game_id"] + INJURY], on="game_id", how="left")
    d[INJURY] = d[INJURY].fillna(0.0)
    y = (d.home_score > d.away_score).astype(int)
    model = clone(art["model"]).fit(d[F + INJURY], y)
    joblib.dump({"model": model, "features": F + INJURY, "training_rows": int(len(d)), "training_seasons": "2018-2025",
                 "architecture": "Model 1.0's pipeline (median impute, scale, logistic regression C=0.2)",
                 "fit_utc": iso(datetime.now(timezone.utc))}, ARTIFACT)
    print(f"fit on {len(d)} games -> {ARTIFACT}")


def next_week(s):
    """The 2026 week with the earliest game not yet played, and the schedule up to it with that week's games given
    placeholder scores (the builders only keep games with scores; a game's own score never enters its features)."""
    s26 = s[s.season == SEASON].copy()
    wk = int(s26[s26.home_score.isna()].week.min())
    s26 = s26[s26.week <= wk].copy()
    pending = s26.week == wk
    s26.loc[pending & s26.home_score.isna(), ["home_score", "away_score"]] = 0
    return wk, s26


def live():
    import joblib
    now = datetime.now(timezone.utc)
    if os.path.isdir(INJ.CACHE):                       # this season's files and the schedule change: always fresh
        for n in os.listdir(INJ.CACHE):
            if str(SEASON) in n or "games.csv" in n:
                os.remove(os.path.join(INJ.CACHE, n))
    w, art = T.model1()
    F = art["features"]
    m2 = joblib.load(ARTIFACT)
    s = INJ.get("schedules/games.csv")
    wk, s26 = next_week(s)
    hist_s = s[s.season.between(2018, SEASON - 1)]
    hist_pb = pd.concat([pd.read_parquet(T.get_raw(f"pbp/play_by_play_{y}.parquet"), columns=T.PBP_COLS)
                         for y in range(2018, SEASON)], ignore_index=True)
    pb26 = pd.read_parquet(T.get_raw(f"pbp/play_by_play_{SEASON}.parquet"), columns=T.PBP_COLS)
    o = w.build_exact_v53(hist_s, hist_pb, s26, pb26, F)
    o = o[o.week == wk].copy()

    # injury features: the study's build() over this season, with the coming week included
    g = s26.copy()
    g["home"], g["away"] = g.home_team.map(INJ.fr), g.away_team.map(INJ.fr)
    g = g.sort_values(["season", "week", "gameday", "game_id"]).reset_index(drop=True)
    snaps = INJ.get(f"snap_counts/snap_counts_{SEASON}.csv")
    inj = INJ.get(f"injuries/injuries_{SEASON}.csv")
    rosters = INJ.get(f"weekly_rosters/roster_weekly_{SEASON}.csv")
    players = INJ.get("players/players.csv")
    feats, cover = INJ.build(g, snaps, inj, players, rosters)
    o = o.merge(feats[["game_id"] + INJURY], on="game_id", how="left")
    o[INJURY] = o[INJURY].fillna(0.0)

    o["p1"] = art["model"].predict_proba(o[F])[:, 1]
    o["p2"] = m2["model"].predict_proba(o[m2["features"]])[:, 1]
    parity = None
    if os.path.exists(TRACKER):
        c = sqlite3.connect(f"file:{TRACKER}?mode=ro", uri=True)
        t = pd.read_sql("SELECT game_id, winner_p_home, lock_timestamp_utc FROM picks WHERE decider_version = ? AND season = ? AND week = ?",
                        c, params=(DECIDER, SEASON, wk))
        c.close()
        t = t.sort_values("lock_timestamp_utc").drop_duplicates("game_id", keep="last")
        x = o.merge(t, on="game_id")
        parity = None if x.empty else float((x.p1 - x.winner_p_home).abs().max())

    kick = {r.game_id: datetime.fromisoformat(f"{r.gameday}T{r.gametime or '13:00'}").replace(
        tzinfo=__import__("zoneinfo").ZoneInfo("America/New_York")).astimezone(timezone.utc)
        for r in s[s.season == SEASON].itertuples() if isinstance(r.gameday, str)}
    games, rows = {}, []
    for r in o.itertuples():
        k = kick.get(r.game_id)
        if k is None or k <= now:
            continue                                   # started: its last forecast before kickoff stands
        feat = {c: round(float(getattr(r, c)), 3) for c in INJURY}
        games[r.game_id] = {"home_wp": round(float(r.p2), 4), "model_1_0_wp": round(float(r.p1), 4), **feat,
                            "kickoff": iso(k)}
        rows.append({"at": iso(now), "game_id": r.game_id, "season": SEASON, "week": wk, "home": r.home_team,
                     "away": r.away_team, "kickoff": iso(k), "home_wp": round(float(r.p2), 6),
                     "model_1_0_wp": round(float(r.p1), 6), **feat})
    old = json.load(open(UPCOMING)) if os.path.exists(UPCOMING) else {}
    for gid, v in (old.get("games") or {}).items():    # keep the last pre-kickoff number of games that started
        if gid not in games and datetime.fromisoformat(v["kickoff"].replace("Z", "+00:00")) > now - pd.Timedelta(days=4):
            games[gid] = v
    out = {"model": "NFL_MODEL_2_0", "generated_at": iso(now), "season": SEASON, "week": wk,
           "parity_max_gap_vs_model_1_0_tracker": parity, "injury_coverage": cover,
           "artifact_sha256": hashlib.sha256(open(ARTIFACT, "rb").read()).hexdigest(), "games": games}
    if parity is not None and parity > 1e-6:
        out["warning"] = "Model 1.0 features here differ from its tracker's lock: Model 2.0 numbers are not written"
        out["games"] = old.get("games") or {}
        rows = []
    with open(UPCOMING, "w") as f:
        json.dump(out, f, indent=1, sort_keys=True)
    if rows:
        with open(LOG, "a") as f:
            for r in rows:
                f.write(json.dumps(r, sort_keys=True, separators=(",", ":")) + "\n")
    print(f"week {wk}: {len(rows)} games forecast, parity {parity}")
    return 0


if __name__ == "__main__":
    sys.exit(fit() if sys.argv[1:2] == ["fit"] else live())
