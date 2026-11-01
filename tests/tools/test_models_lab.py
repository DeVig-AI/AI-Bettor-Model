"""The DeVig Lab model on the Models page (tools/models_compare.py reads live/lab/<sport>.json from tools/lab_live.py):
NHL games matched by teams and start time, CFB by ESPN id, an old file refused, and the NHL puck line graded at its
price (2026-11-01).

    python3 -m unittest discover -s tests/tools
"""
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import models_compare as MC  # noqa: E402

NOW = datetime(2026, 11, 1, 4, 0, tzinfo=timezone.utc)
KICK = datetime(2026, 11, 1, 23, 0, tzinfo=timezone.utc)


def espn(gid, home, away, kick=KICK):
    return {"sport": "NHL", "game_id": gid, "kickoff": kick, "date": "2026-11-01", "home": home, "away": away}


class LabModel(unittest.TestCase):
    def setUp(self):
        self.old = MC.LAB_DIR
        MC.LAB_DIR = Path(tempfile.mkdtemp())

    def tearDown(self):
        MC.LAB_DIR = self.old

    def write(self, sport, games, at=NOW - timedelta(minutes=20)):
        (MC.LAB_DIR / f"{sport.lower()}.json").write_text(json.dumps({"generated_at": MC.iso(at), "games": games}))

    def test_nhl_matched_by_codes_and_start(self):
        self.write("NHL", [
            {"game_id": "2026020230", "home": "TBL", "away": "NJD", "kickoff": "2026-11-01T23:00:00Z", "home_wp": 0.55},
            {"game_id": "2026020231", "home": "BOS", "away": "TOR", "kickoff": "2026-11-03T23:00:00Z", "home_wp": 0.6},
        ])
        ups = [espn("401", "TB", "NJ"), espn("402", "BOS", "TOR")]   # BOS-TOR here is a different night: no match
        out = MC.read_lab("NHL", ups, NOW)
        self.assertEqual(set(out), {"401"})
        self.assertEqual(out["401"]["home_wp"], 0.55)
        self.assertEqual(out["401"]["at"], MC.iso(NOW - timedelta(minutes=20)))

    def test_cfb_by_espn_id_with_line(self):
        self.write("CFB", [{"game_id": "401700001", "home_wp": 0.7, "home_line": -6.5}])
        out = MC.read_lab("CFB", [{"game_id": "401700001"}], NOW)
        self.assertEqual(out["401700001"]["home_line"], -6.5)

    def test_stale_or_missing_file(self):
        self.assertEqual(MC.read_lab("NHL", [espn("401", "TB", "NJ")], NOW), {})
        self.write("NHL", [], at=NOW - timedelta(hours=13))
        with self.assertRaises(RuntimeError):
            MC.read_lab("NHL", [], NOW)

    def test_puck_line_graded_at_its_price(self):
        picks = {"kalshi": {"home_line": -1.5, "home_spread_odds": 150.0, "away_spread_odds": -180.0,
                            "home_ml": -200.0, "away_ml": 170.0},
                 "lab": {"home_wp": 0.62}}
        g = MC.grade_game("NHL", picks, {"home_score": 4, "away_score": 2})
        self.assertTrue(g["kalshi"]["spread"][0])
        self.assertAlmostEqual(g["kalshi"]["spread"][2], MC.breakeven(150.0))
        self.assertTrue(g["lab"]["ml"][0])
        self.assertNotIn("spread", g["lab"])
        self.assertIn("lab", MC.COVERS["NHL"]["ml"])
        self.assertIn("NHL", MC.SPORTS)


if __name__ == "__main__":
    unittest.main()
