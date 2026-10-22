"""A tiny NFL season in nflverse's CSV shapes (schedule, team week stats, player week stats) for tools/stats_nfl.py:
four teams, three weeks of 2026, a few offensive and defensive players. Written to a cache folder so the tool reads
it instead of downloading. Used by tests/tools/test_stats_nfl.py and tests/app/teampage.test.mjs.
"""
import csv
import os

GAMES = [  # game_id, date, home, away, home pts, away pts
    ("2026_01_SEA_SF", "2026-09-13", "SF", "SEA", 31, 17), ("2026_01_CHI_NE", "2026-09-13", "NE", "CHI", 20, 23),
    ("2026_02_SF_NE", "2026-09-20", "NE", "SF", 10, 27), ("2026_02_SEA_CHI", "2026-09-20", "CHI", "SEA", 24, 24),
    ("2026_03_CHI_SF", "2026-09-27", "SF", "CHI", 35, 14), ("2026_03_NE_SEA", "2026-09-27", "SEA", "NE", 21, 13),
]
OFF = ["completions", "attempts", "passing_yards", "passing_tds", "passing_interceptions", "carries", "rushing_yards",
       "rushing_tds", "receptions", "targets", "receiving_yards", "receiving_tds"]
DEF = ["def_tackles_solo", "def_tackle_assists", "def_sacks", "def_interceptions", "def_pass_defended",
       "def_tackles_for_loss", "def_qb_hits", "def_fumbles_forced"]
# player: id, name, position, group, team, per-game stats by week (offense or defense dicts)
PLAYERS = [
    ("00-1", "Brock Purdy", "QB", "QB", "SF", [{"completions": 22, "attempts": 30, "passing_yards": 264, "passing_tds": 2},
                                              {"completions": 17, "attempts": 28, "passing_yards": 189, "passing_tds": 1},
                                              {"completions": 21, "attempts": 29, "passing_yards": 250, "passing_tds": 3}]),
    ("00-2", "George Kittle", "TE", "TE", "SF", [{"receptions": 6, "targets": 7, "receiving_yards": 70, "receiving_tds": 1},
                                                {"receptions": 3, "targets": 5, "receiving_yards": 40},
                                                {"receptions": 5, "targets": 6, "receiving_yards": 65}]),
    ("00-3", "Christian McCaffrey", "RB", "RB", "SF", [{"carries": 18, "rushing_yards": 92, "rushing_tds": 1, "receptions": 4, "receiving_yards": 31},
                                                      {"carries": 20, "rushing_yards": 77, "receptions": 5, "receiving_yards": 40},
                                                      {"carries": 16, "rushing_yards": 101, "rushing_tds": 2, "receptions": 3, "receiving_yards": 22}]),
    ("00-4", "Fred Warner", "MLB", "LB", "SF", [{"def_tackles_solo": 7, "def_tackle_assists": 3, "def_pass_defended": 1},
                                               {"def_tackles_solo": 6, "def_tackle_assists": 2, "def_sacks": 1},
                                               {"def_tackles_solo": 5, "def_tackle_assists": 4, "def_interceptions": 1}]),
    ("00-5", "Nick Bosa", "DE", "DL", "SF", [{"def_tackles_solo": 3, "def_sacks": 1.5, "def_qb_hits": 3, "def_tackles_for_loss": 2},
                                            {"def_tackles_solo": 2, "def_sacks": 0.5, "def_qb_hits": 2},
                                            {"def_tackles_solo": 4, "def_sacks": 2, "def_qb_hits": 4, "def_tackles_for_loss": 1}]),
    ("00-6", "Deommodore Lenoir", "CB", "DB", "SF", [{"def_tackles_solo": 4, "def_pass_defended": 2},
                                                    {"def_tackles_solo": 5, "def_interceptions": 1, "def_pass_defended": 1},
                                                    {"def_tackles_solo": 3}]),
    ("00-7", "Sam Darnold", "QB", "QB", "SEA", [{"completions": 19, "attempts": 31, "passing_yards": 210}] * 3),
    ("00-8", "Kicker Guy", "K", "SPEC", "SF", [{}] * 3),                     # special teams: left out
]


def _write(path, rows, cols):
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in rows:
            w.writerow({c: r.get(c, "") for c in cols})


def make_cache(cache):
    """Write the season as the tool's cache files (nfl_games.csv, nfl_team_<y>.csv, nfl_player_<y>.csv)."""
    os.makedirs(cache, exist_ok=True)
    sched = [{"game_id": g, "season": 2026, "game_type": "REG", "gameday": d, "home_team": h, "away_team": a,
              "home_score": hs, "away_score": as_, "overtime": 0} for g, d, h, a, hs, as_ in GAMES]
    _write(os.path.join(cache, "nfl_games.csv"), sched, list(sched[0]))
    team_cols = ["game_id", "team", "passing_yards", "rushing_yards", "passing_interceptions", "sack_fumbles_lost",
                 "rushing_fumbles_lost", "receiving_fumbles_lost", "def_sacks"]
    team = []
    for g, d, h, a, hs, as_ in GAMES:
        for t, pts in ((h, hs), (a, as_)):
            team.append({"game_id": g, "team": t, "passing_yards": 150 + 4 * pts, "rushing_yards": 60 + 2 * pts,
                         "passing_interceptions": 1 if pts < 20 else 0, "sack_fumbles_lost": 0, "rushing_fumbles_lost": 0,
                         "receiving_fumbles_lost": 0, "def_sacks": 3 if t == "SF" else 1})
    _write(os.path.join(cache, "nfl_team_2026.csv"), team, team_cols)
    _write(os.path.join(cache, "nfl_team_2025.csv"), [], team_cols)
    pcols = ["player_id", "player_display_name", "position", "position_group", "season_type", "game_id", "team",
             "opponent_team"] + OFF + DEF
    rows = []
    for pid, name, pos, grp, team_code, weeks in PLAYERS:
        mine = [g for g in GAMES if team_code in (g[2], g[3])]
        for g, stats in zip(mine, weeks):
            opp = g[3] if g[2] == team_code else g[2]
            rows.append({"player_id": pid, "player_display_name": name, "position": pos, "position_group": grp,
                         "season_type": "REG", "game_id": g[0], "team": team_code, "opponent_team": opp,
                         **{c: stats.get(c, 0) for c in OFF + DEF}})
    _write(os.path.join(cache, "nfl_player_2026.csv"), rows, pcols)
    _write(os.path.join(cache, "nfl_player_2025.csv"), [], pcols)
