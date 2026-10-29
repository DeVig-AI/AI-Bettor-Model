#!/usr/bin/env python3
"""
hdata.py -- NFL Handicapper v1 input data (public nflverse files only), written to nfl/handicapper/data/:
  games.csv         every game from 2009 on: teams, kickoff, scores, rest, closing spread / total, stadium
  team_games.csv    per team-game offense stats from play-by-play (research.lab.data.aggregate_pbp columns)
  availability.csv  per team-game snap share of players listed Out / Doubtful (research.lab.availability, 2013 on)

Seasons through research.lab.config.LAB_MAX_SEASON come from the Research Lab's committed files (same code, same
sources); later seasons are downloaded from nflverse and built here, so the current season is refreshed every run.
Run from the repo root:  python3 nfl/handicapper/hdata.py
"""
import io
import os
import sys
import tempfile

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, ROOT)
from research.lab import availability as AV  # noqa: E402
from research.lab import config as C  # noqa: E402
from research.lab import data as D  # noqa: E402

OUT = os.path.join(HERE, "data")
LAB = os.path.join(ROOT, "research", "data", "nfl")
FIRST = 2009
GAME_COLS = ["game_id", "season", "game_type", "week", "gameday", "weekday", "gametime", "away_team", "home_team",
             "away_score", "home_score", "location", "away_rest", "home_rest", "spread_line", "total_line", "div_game",
             "roof", "temp", "wind", "away_qb_id", "home_qb_id", "stadium_id"]


def new_seasons(games):
    return sorted(s for s in games.season.unique() if s > C.LAB_MAX_SEASON)


def pbp_season(season):
    with tempfile.TemporaryDirectory() as d:          # downloads land in their own empty folder
        path = os.path.join(d, f"pbp_{season}.csv.gz")
        with open(path, "wb") as f:
            f.write(D._get(C.PBP_URL.format(season=season)))
        pbp = pd.read_csv(path, usecols=lambda c: c in D.PBP_COLS, low_memory=False)
    return D.aggregate_pbp(pbp)[0]


def main():
    os.makedirs(OUT, exist_ok=True)
    raw = pd.read_csv(io.BytesIO(D._get(C.GAMES_URL)), low_memory=False)
    games = raw[raw.season >= FIRST][GAME_COLS].sort_values(["gameday", "gametime", "game_id"]).reset_index(drop=True)
    games.to_csv(os.path.join(OUT, "games.csv"), index=False)
    fresh = new_seasons(games)
    played = set(games[games.home_score.notna()].game_id)

    team = pd.read_csv(os.path.join(LAB, "team_games.csv"))
    team = team[team.season >= FIRST]
    parts = [team] + [pbp_season(s) for s in fresh]
    team = pd.concat(parts, ignore_index=True)
    team[team.game_id.isin(played)].to_csv(os.path.join(OUT, "team_games.csv"), index=False)

    av = pd.read_csv(os.path.join(LAB, "availability.csv"))
    seasons = [C.LAB_MAX_SEASON] + fresh               # the last lab season seeds each team's recent snaps
    inj, snaps, players = AV.download(seasons, D._get)
    built = AV.build(games[games.season.isin(seasons)], inj, snaps, players)
    av = pd.concat([av, built[built.season > C.LAB_MAX_SEASON]], ignore_index=True)
    av.to_csv(os.path.join(OUT, "availability.csv"), index=False)
    print(f"games {len(games)} (to {games.gameday.max()}), team_games {len(team)}, availability {len(av)}; "
          f"downloaded seasons {fresh}")


if __name__ == "__main__":
    main()
