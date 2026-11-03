"""DeVig's NHL model v1 (tools/nhl_model_live.py, NHL_MODEL_V1_PREREG.md): the ratings, the frozen formula, and the
Models page reading live/devig/nhl.json as the "devig" NHL model beside the Lab's (2026-11-03).

    python3 -m unittest discover -s tests/tools
"""
import json
import math
import os
import sys
import tempfile
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import models_compare as MC  # noqa: E402
import nhl_model_live as M  # noqa: E402

UTC = timezone.utc


def game(gid, day, home, away, hs=None, as_=None, hsh=None, ash=None, season=2026):
    return {"game_id": gid, "season": season, "game_type": 2, "day": day,
            "start": datetime(day.year, day.month, day.day, 23, tzinfo=UTC), "home": home, "away": away,
            "home_score": hs, "away_score": as_, "home_shots": hsh, "away_shots": ash}


class Formula(unittest.TestCase):
    def test_even_teams_get_the_home_bonus_only(self):
        p = M.Ratings().parts("BOS", "TOR", date(2026, 11, 3))
        self.assertEqual(p["b2b"], 0)
        self.assertAlmostEqual(p["sh"], 0)
        self.assertAlmostEqual(p["elo"], 45 / 400 * math.log(10))
        z = M.W[0] + M.W[1] * p["elo"]
        self.assertAlmostEqual(M.home_wp(p), 1 / (1 + math.exp(-z)))
        self.assertTrue(0.53 < M.home_wp(p) < 0.57)

    def test_winner_gains_and_back_to_back_counts(self):
        r = M.Ratings()
        r.new_season(2026)
        r.update("BOS", "TOR", date(2026, 11, 2), 5, 1, 40, 20)
        self.assertGreater(r.elo["BOS"], 1500)
        self.assertAlmostEqual(r.elo["BOS"] + r.elo["TOR"], 3000)
        self.assertGreater(r.sh["BOS"], 0.5)
        p = r.parts("BOS", "NYR", date(2026, 11, 3))
        self.assertEqual(p["b2b"], 1)                         # BOS played yesterday, NYR did not
        self.assertEqual(r.parts("BOS", "NYR", date(2026, 11, 4))["b2b"], 0)

    def test_new_season_pulls_back(self):
        r = M.Ratings()
        r.new_season(2025)
        r.elo["BOS"], r.sh["BOS"] = 1600.0, 0.6
        r.new_season(2026)
        self.assertAlmostEqual(r.elo["BOS"], 1500 + 0.85 * 100)
        self.assertAlmostEqual(r.sh["BOS"], 0.5 + 0.6 * 0.1)

    def test_run_uses_only_earlier_games(self):
        d1, d2 = date(2026, 11, 1), date(2026, 11, 2)
        _, out = M.run([game("2", d2, "BOS", "TOR"), game("1", d1, "BOS", "TOR", 4, 0, 35, 25)])
        (g1, p1, w1), (g2, p2, w2) = out
        self.assertEqual(g1["game_id"], "1")                 # sorted by day
        self.assertAlmostEqual(p1["elo"], 45 / 400 * math.log(10))
        self.assertGreater(w2, w1)                           # BOS won game 1
        self.assertEqual(p2["b2b"], 0)                       # both played yesterday: even

    def test_score(self):
        out = M.run([game(str(i), date(2026, 10, 1) + timedelta(days=i), "BOS", "TOR", 3, 2, 30, 30) for i in range(5)])[1]
        s = M.score(out, 2026)
        self.assertEqual(s["games"], 5)
        self.assertEqual(s["accuracy"], 1.0)


class OnTheModelsPage(unittest.TestCase):
    def setUp(self):
        self.old = MC.DEVIG_DIR
        MC.DEVIG_DIR = Path(tempfile.mkdtemp())

    def tearDown(self):
        MC.DEVIG_DIR = self.old

    def test_devig_nhl_registered_and_read(self):
        self.assertIn("NHL", next(m for m in MC.MODELS if m["key"] == "devig")["sports"])
        self.assertIn("devig", MC.COVERS["NHL"]["ml"])
        self.assertIn("lab", MC.COVERS["NHL"]["ml"])         # the Lab's leader stays as the challenger
        now = datetime(2026, 11, 3, 12, tzinfo=UTC)
        (MC.DEVIG_DIR / "nhl.json").write_text(json.dumps({"generated_at": MC.iso(now - timedelta(minutes=5)), "games": [
            {"game_id": "2026020200", "home": "LAK", "away": "SJS", "kickoff": "2026-11-04T02:30:00Z", "home_wp": 0.61}]}))
        ups = [{"sport": "NHL", "game_id": "401", "kickoff": datetime(2026, 11, 4, 2, 30, tzinfo=UTC), "date": "2026-11-03",
                "home": "LA", "away": "SJ"}]
        out = MC.read_lab("NHL", ups, now, MC.DEVIG_DIR)
        self.assertEqual(out["401"]["home_wp"], 0.61)


if __name__ == "__main__":
    unittest.main()
