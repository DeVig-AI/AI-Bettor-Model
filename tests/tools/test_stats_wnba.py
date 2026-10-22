"""tools/stats_wnba.py on box scores shaped like sportsdataverse's ESPN WNBA files (the NBA test's builder): seasons by
calendar year, teams read from the data (an All-Star team left out), ESPN's codes, league ranks; and the NBA module
left as it was.

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
import stats_nba  # noqa: E402
import stats_wnba as W  # noqa: E402
from test_stats_nba import games  # noqa: E402


class StatsWNBA(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cache = tempfile.mkdtemp()
        W.OUT = os.path.join(cls.cache, "out")
        last = [(1, "2025-06-01", "LV", "NY", 90, 80, 2), (2, "2025-06-03", "NY", "LV", 85, 84, 2), (3, "2025-06-05", "LV", "NY", 88, 70, 2)]
        this = [(11, "2026-05-20", "LV", "NY", 92, 81, 2), (12, "2026-05-22", "NY", "LV", 77, 83, 2), (13, "2026-05-24", "LV", "NY", 90, 88, 2),
                (14, "2026-07-18", "COOP", "SPO", 130, 128, 2), (15, "2026-09-30", "LV", "NY", 80, 75, 3)]
        for y, rows in ((2025, last), (2026, this)):
            t, p = games(y, rows)
            t.to_csv(os.path.join(cls.cache, f"team_box_{y}.csv"), index=False)
            p.to_csv(os.path.join(cls.cache, f"player_box_{y}.csv"), index=False)
        W.build(datetime(2026, 10, 22, tzinfo=timezone.utc), cls.cache)
        with open(os.path.join(W.OUT, "index.json")) as f:
            cls.idx = json.load(f)
        with open(os.path.join(W.OUT, "team_LV.json")) as f:
            cls.lv = json.load(f)

    def test_seasons_teams_codes(self):
        self.assertEqual((self.idx["sport"], self.idx["season"], self.idx["last_season"]), ("WNBA", "2026", "2025"))
        self.assertEqual(sorted(t["code"] for t in self.idx["teams"]), ["LV", "NY"], "the All-Star teams are not teams")

    def test_team_file(self):
        self.assertEqual(self.lv["this"]["record"], "3-0")
        self.assertEqual(self.lv["ranks"]["ppg"], 1)
        self.assertEqual(self.lv["games"][0][:6], ["2026-09-30", "NY", "H", 80, 75, "W"])

    def test_nba_module_untouched(self):
        self.assertEqual((stats_nba.SPORT, stats_nba.label(2027)), ("NBA", "2026-27"))
        self.assertIn("GSW", stats_nba.TEAMS)


if __name__ == "__main__":
    unittest.main()
