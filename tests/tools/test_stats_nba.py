"""tools/stats_nba.py on small box scores shaped like sportsdataverse's ESPN files: power ratings, records, the app's
team codes, player averages and logs, All-Star games and did-not-play rows left out, the roster rule.

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
import stats_common as S  # noqa: E402
import stats_nba as N  # noqa: E402


def games(season, rows):
    """rows: (game_id, date, home, away, home_pts, away_pts, type) -> (team box, player box) frames."""
    team, player = [], []
    for gid, date, h, a, hp, ap, st in rows:
        for t, o, ha, pts, op in ((h, a, "home", hp, ap), (a, h, "away", ap, hp)):
            team.append({"game_id": gid, "season_type": st, "game_date": date, "team_abbreviation": t,
                         "opponent_team_abbreviation": o, "team_display_name": t + " Team", "team_color": "112233",
                         "team_home_away": ha, "team_score": pts, "opponent_team_score": op, "field_goals_made": 40,
                         "field_goals_attempted": 88, "three_point_field_goals_made": 12, "three_point_field_goals_attempted": 35,
                         "free_throws_made": 18, "free_throws_attempted": 22, "offensive_rebounds": 10, "turnovers": 13,
                         "total_turnovers": 14})
            for k, (pid, name) in enumerate(((t + "1", t + " Star"), (t + "2", t + " Bench"))):
                player.append({"game_id": gid, "season_type": st, "game_date": date, "athlete_id": hash(pid) % 10**6,
                               "athlete_display_name": name, "athlete_position_abbreviation": "G", "team_abbreviation": t,
                               "opponent_team_abbreviation": o, "did_not_play": k == 1 and gid == 3, "minutes": 30 - 10 * k,
                               "points": pts // 4 - 10 * k, "rebounds": 5, "assists": 4, "three_point_field_goals_made": 2,
                               "steals": 1, "blocks": 0, "turnovers": 2, "field_goals_made": 9, "field_goals_attempted": 18,
                               "three_point_field_goals_attempted": 5, "free_throws_made": 4, "free_throws_attempted": 5,
                               "home_away": ha, "starter": k == 0, "athlete_jersey": None if k else 11})
    return pd.DataFrame(team), pd.DataFrame(player)


class StatsNBA(unittest.TestCase):
    def setUp(self):
        self.cache = tempfile.mkdtemp()
        N.OUT = os.path.join(self.cache, "out")
        last = [(1, "2026-03-01", "NY", "GS", 120, 100, 2), (2, "2026-03-03", "GS", "NY", 101, 99, 2),
                (3, "2026-03-05", "NY", "GS", 118, 108, 2), (4, "2026-02-15", "WORLD", "STARS", 150, 148, 5),
                (5, "2026-05-01", "NY", "GS", 110, 100, 3)]
        this = [(11, "2026-10-21", "GS", "NY", 112, 104, 2)]
        for y, rows in ((2026, last), (2027, this)):
            t, p = games(y, rows)
            t.to_csv(os.path.join(self.cache, f"team_box_{y}.csv"), index=False)
            p.to_csv(os.path.join(self.cache, f"player_box_{y}.csv"), index=False)
        N.build(datetime(2026, 10, 22, 12, tzinfo=timezone.utc), self.cache)
        self.idx = json.load(open(os.path.join(N.OUT, "index.json")))
        self.nyk = json.load(open(os.path.join(N.OUT, "team_NYK.json")))

    def test_seasons_and_codes(self):
        self.assertEqual((self.idx["season"], self.idx["last_season"]), ("2026-27", "2025-26"))
        self.assertEqual(len(self.idx["teams"]), 30)
        self.assertTrue(os.path.exists(os.path.join(N.OUT, "team_GSW.json")))   # ESPN GS -> the app's GSW
        self.assertNotIn("WORLD", json.dumps(self.idx))                        # All-Star game left out

    def test_ratings_blend_last_season(self):
        t = {x["code"]: x for x in self.idx["teams"]}
        # last season NY was much better; one game this season (GS by 8) moves it only a little: NY still ahead
        self.assertGreater(t["NYK"]["rating"], t["GSW"]["rating"])
        self.assertEqual((t["NYK"]["w"], t["NYK"]["l"], t["GSW"]["w"]), (0, 1, 1))
        self.assertEqual([x["rank"] for x in self.idx["teams"][:2]], [1, 2])

    def test_team_file(self):
        self.assertEqual((self.nyk["last"]["w"], self.nyk["last"]["l"]), (2, 1))          # playoffs not in the record
        self.assertEqual(self.nyk["last"]["home"], "2-0")
        self.assertEqual(self.nyk["games"][0][:6], ["2026-10-21", "GSW", "A", 104, 112, "L"])   # newest first
        self.assertIn(["2026-05-01", "GSW", "H", 110, 100, "W", "P", 2026], self.nyk["games"])

    def test_players(self):
        star = [p for p in self.nyk["players"] if p["name"] == "NY Star"][0]
        self.assertEqual(star["this"]["gp"], 1)
        self.assertEqual(star["this"]["pts"], 26.0)
        self.assertEqual(star["last"]["gp"], 3)                                 # regular season only
        self.assertEqual(len(star["log"]), 5)                                   # + the playoff game, + this season
        self.assertEqual(star["log"][0][:5], ["2026-10-21", "GSW", "A", 30, 26])
        bench = [p for p in self.nyk["players"] if p["name"] == "NY Bench"][0]
        self.assertEqual(bench["last"]["gp"], 2)                                # the did-not-play game left out
        self.assertEqual(self.nyk["players"][0]["name"], "NY Star")              # most minutes first
        self.assertEqual(self.nyk["players"][0]["num"], 11)                     # his jersey number, for the app's jersey
        self.assertNotIn("num", self.nyk["players"][1])                         # no number in the box score: none

    def test_srs_and_record(self):
        r, home = S.srs([("A", "B", 10), ("B", "A", -10)] * 50, ["A", "B"])   # A by 10 home and away
        self.assertAlmostEqual(r["A"] - r["B"], 10.0, delta=0.2)               # the small ridge barely shrinks 100 games
        self.assertAlmostEqual(r["A"] + r["B"], 0.0)
        self.assertAlmostEqual(home, 0.0, delta=1e-9)
        self.assertEqual(S.record(list("WWLWW")), (4, 1, "4-1", "W2"))


if __name__ == "__main__":
    unittest.main()
