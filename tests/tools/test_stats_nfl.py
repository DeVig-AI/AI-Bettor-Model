"""tools/stats_nfl.py on small files shaped like nflverse's schedule and weekly stats: records with ties, ratings with
a 4-game prior, rosters in position order (offense, then defense), season numbering by the year the season ends, logs newest first.

    python3 -m unittest discover -s tests/tools
"""
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timezone

import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import stats_nfl as F  # noqa: E402

NOW = datetime(2026, 10, 22, 12, tzinfo=timezone.utc)
GAMES = [  # game_id, season, type, week, day, away, away_score, home, home_score, overtime
    ("2025_01_KC_BUF", 2025, "REG", 1, "2025-09-07", "KC", 20, "BUF", 30, 0),
    ("2025_02_BUF_KC", 2025, "REG", 2, "2025-09-14", "BUF", 24, "KC", 24, 1),
    ("2025_20_KC_BUF", 2025, "DIV", 20, "2026-01-18", "KC", 10, "BUF", 27, 0),
    ("2026_01_BUF_KC", 2026, "REG", 1, "2026-09-13", "BUF", 17, "KC", 21, 0),
    ("2026_05_KC_BUF", 2026, "REG", 5, "2026-10-11", "KC", None, "BUF", None, None)]


def stat_rows(season):
    out = []
    for gid, s, t, wk, day, away, asc, home, hsc, ot in GAMES:
        if s != season or asc is None:
            continue
        for team, opp in ((away, home), (home, away)):
            for pid, name, pos, grp in ((team + "-qb", team + " Passer", "QB", "QB"), (team + "-lb", team + " Backer", "LB", "LB")):
                r = {c: 0 for c in F.COLS}
                r.update(player_id=pid, player_display_name=name, position=pos, position_group=grp, season=s, week=wk,
                         season_type="REG" if t == "REG" else "POST", game_id=gid, team=team, opponent_team=opp,
                         completions=20, attempts=30, passing_yards=250 if team == "KC" else 200, passing_tds=2, rushing_tds=1)
                out.append(r)
    return pd.DataFrame(out)


def team_rows(season):
    out = []
    for gid, s, t, wk, day, away, asc, home, hsc, ot in GAMES:
        if s != season or asc is None:
            continue
        for team, opp in ((away, home), (home, away)):
            out.append({"season": s, "week": wk, "team": team, "season_type": "REG", "game_id": gid, "opponent_team": opp,
                        "passing_yards": 250, "rushing_yards": 100, "passing_interceptions": 1, "sack_fumbles_lost": 0,
                        "rushing_fumbles_lost": 1, "receiving_fumbles_lost": 0, "def_sacks": 3})
    return pd.DataFrame(out)


class StatsNFL(unittest.TestCase):
    def setUp(self):
        self.cache = tempfile.mkdtemp()
        F.OUT = os.path.join(self.cache, "out")
        pd.DataFrame([{"game_id": g[0], "season": g[1], "game_type": g[2], "week": g[3], "gameday": g[4], "away_team": g[5],
                       "away_score": g[6], "home_team": g[7], "home_score": g[8], "overtime": g[9]} for g in GAMES]
                     ).to_csv(os.path.join(self.cache, "nfl_games.csv"), index=False)
        for y in (2025, 2026):
            stat_rows(y).to_csv(os.path.join(self.cache, f"nfl_player_{y}.csv"), index=False)
            team_rows(y).to_csv(os.path.join(self.cache, f"nfl_team_{y}.csv"), index=False)
        # rosters: the QB changed numbers this season; the backer has no ESPN id (nflverse leaves some blank)
        for y, n in ((2025, 9), (2026, 15)):
            pd.DataFrame([{"gsis_id": "KC-qb", "jersey_number": n, "espn_id": 3139477, "week": 1},
                          {"gsis_id": "KC-lb", "jersey_number": 54, "espn_id": None, "week": 1}]
                         ).to_csv(os.path.join(self.cache, f"nfl_roster_{y}.csv"), index=False)
        F.build(NOW, self.cache)
        self.idx = json.load(open(os.path.join(F.OUT, "index.json")))
        self.kc = json.load(open(os.path.join(F.OUT, "team_KC.json")))

    def test_seasons(self):
        self.assertEqual((self.idx["season"], self.idx["last_season"], self.idx["season_year"]), ("2026", "2025", 2027))
        self.assertEqual((self.idx["rank_last"], len(self.idx["teams"])), ("Last 5", 32))

    def test_records(self):
        self.assertEqual(self.kc["last"]["record"], "0-1-1")                  # a loss and an overtime tie; playoffs apart
        self.assertEqual(self.kc["this"]["record"], "1-0")
        self.assertEqual(self.kc["games"][0][:6], ["2026-09-13", "BUF", "H", 21, 17, "W"])
        self.assertIn(["2025-09-14", "BUF", "H", 24, 24, "T", "R", 2026, "OT"], self.kc["games"])
        self.assertIn(["2026-01-18", "BUF", "A", 10, 27, "L", "P", 2026, ""], self.kc["games"])
        self.assertEqual((self.kc["this"]["ypg"], self.kc["this"]["give"], self.kc["this"]["sacks"]), (350.0, 2.0, 3.0))

    def test_players(self):
        self.assertEqual([p["pos"] for p in self.kc["players"]], ["QB", "LB"])   # offense, then defense
        qb = self.kc["players"][0]
        self.assertEqual((qb["this"]["gp"], qb["last"]["gp"], qb["this"]["pass_yds"], qb["this"]["td_tot"]), (1, 2, 250.0, 1))
        self.assertEqual(qb["log"][0][:6], ["2026-09-13", "BUF", "H", 20, 30, 250])
        self.assertEqual(qb["log"][0][-2:], ["R", 2027])
        self.assertEqual(qb["log"][-1][-2:], ["R", 2026])                       # the 2025 season

    def test_jersey_numbers_and_espn_ids(self):
        qb, lb = self.kc["players"]
        self.assertEqual((qb["num"], qb["espn"]), (15, 3139477))               # this season's number wins
        self.assertEqual(lb["num"], 54)
        self.assertNotIn("espn", lb)
        self.assertNotIn("num", json.load(open(os.path.join(F.OUT, "team_BUF.json")))["players"][0])   # not on a roster


if __name__ == "__main__":
    unittest.main()
