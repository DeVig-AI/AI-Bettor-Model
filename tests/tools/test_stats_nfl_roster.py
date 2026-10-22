"""tools/stats_nfl.py, the team page parts, on a tiny season (tests/tools/nfl_stats_fixture.py): league ranks, defensive players grouped
by position with their own averages and game log, special teams left out; and stats_common.league_ranks.

    python3 -m unittest discover -s tests/tools
"""
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools"))
sys.path.insert(0, os.path.dirname(__file__))
import nfl_stats_fixture as F  # noqa: E402
import stats_common as S  # noqa: E402
import stats_nfl as N  # noqa: E402


class LeagueRanks(unittest.TestCase):
    def test_ranks(self):
        rows = [["Record", "record"], ["Points", "ppg", 1], ["Allowed", "oppg", 1], ["Pace", "pace", 1]]
        this = {"A": {"ppg": 30, "oppg": 20, "pace": 99}, "B": {"ppg": 20, "oppg": 15}, "C": {"ppg": 30, "oppg": None}, "D": None}
        r = S.league_ranks(this, rows, low=["oppg"], skip=["pace"])
        self.assertEqual(r["A"], {"ppg": 1, "oppg": 2})
        self.assertEqual(r["B"], {"ppg": 3, "oppg": 1})
        self.assertEqual(r["C"], {"ppg": 1}, "a tie shares the better rank; no value, no rank")
        self.assertEqual(r["D"], {})


class NflRosterFiles(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        cache = os.path.join(cls.tmp, "cache")
        F.make_cache(cache)
        N.OUT = os.path.join(cls.tmp, "out")
        N.build(datetime(2026, 10, 22, tzinfo=timezone.utc), cache)

    def load(self, name):
        with open(os.path.join(N.OUT, name)) as f:
            return json.load(f)

    def test_team_ranks(self):
        sf = self.load("team_SF.json")
        self.assertEqual(sf["this"]["record"], "3-0")
        self.assertEqual(sf["ranks"]["ppg"], 1)
        self.assertEqual(sf["ranks"]["oppg"], 1, "fewest allowed is 1st")
        self.assertNotIn("record", sf["ranks"])
        self.assertEqual(self.load("team_NE.json")["ranks"]["ppg"], 4)

    def test_roster_by_position_with_defense(self):
        sf = self.load("team_SF.json")
        self.assertEqual([p["grp"] for p in sf["players"]], ["QB", "RB", "TE", "DL", "LB", "DB"], "roster order, kicker left out")
        warner = [p for p in sf["players"] if p["name"] == "Fred Warner"][0]
        self.assertEqual(warner["this"]["tkl"], 9.0)
        self.assertEqual(warner["this"]["int_d"], 0.33)
        self.assertNotIn("pass_yds", warner["this"], "a defender's averages are defensive")
        bosa = [p for p in sf["players"] if p["name"] == "Nick Bosa"][0]
        idx = self.load("index.json")
        L = {c: i for i, c in enumerate(idx["log_cols"])}
        self.assertEqual([g[L["sk"]] for g in bosa["log"]], [2, 0.5, 1.5], "newest first, half sacks kept")
        purdy = [p for p in sf["players"] if p["name"] == "Brock Purdy"][0]
        self.assertEqual(purdy["log"][0][L["pass_yds"]], 250)
        self.assertEqual(purdy["log"][0][L["type"]], "R")

    def test_index_config(self):
        idx = self.load("index.json")
        self.assertEqual(idx["roster_units"], [["Offense", ["QB", "RB", "WR", "TE"]], ["Defense", ["DL", "LB", "DB"]]])
        self.assertEqual(idx["rank_low"], ["oppg", "oypg", "give"])
        self.assertIn("LB", idx["group_cols"])
        self.assertEqual(idx["hit_stats_def"][0][0], "tackles")
        self.assertIn("Fred Warner", [p[1] for p in idx["players"]])


if __name__ == "__main__":
    unittest.main()
