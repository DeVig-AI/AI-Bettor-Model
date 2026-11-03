"""DeVig's CFB model v1 (tools/cfb_model_live.py, cfb/CFB_MODEL_V1_PREREG.md): the ratings, the frozen formula, the
graded-games comparison, and the Models page reading live/devig/cfb.json as the "devigcfb" challenger (2026-11-03).

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
import cfb_model_live as M  # noqa: E402
import models_compare as MC  # noqa: E402

UTC = timezone.utc
P, W = M.FROZEN["settings"], M.FROZEN["weights"]


def game(gid, day, home, away, margin=None, eh=None, ea=None, season=2026, neutral=False):
    return {"id": gid, "season": season, "week": 1, "day": day, "time": "12:00", "home": home, "away": away,
            "neutral": neutral, "margin": margin, "line": None, "eh": eh, "ea": ea}


class Formula(unittest.TestCase):
    def test_frozen(self):
        self.assertEqual(P, {"k": 0.09, "k_early": 0.18, "early_n": 4, "carry": 0.9, "ke": 0.04, "carry_e": 0.0, "ret": 80})
        self.assertEqual(M.SEALED, 2025)

    def test_even_teams_get_home_field_only(self):
        p = M.Ratings(P).parts("Ohio", "Akron")
        self.assertEqual(p, {"m": 0.0, "e": 0.0})
        self.assertAlmostEqual(M.margin(W, p, False), W["home"])
        self.assertAlmostEqual(M.margin(W, p, True), 0.0)
        self.assertTrue(0.55 < M.logistic(M.FROZEN["win_chance"]["a"], M.FROZEN["win_chance"]["b"], W["home"]) < 0.6)

    def test_winner_gains_and_better_offense_counts(self):
        r = M.Ratings(P)
        r.new_season(2026)
        r.update(game("1", "2026-09-01", "Ohio", "Akron", 21, 0.3, -0.1), W["home"])
        self.assertGreater(r.m["Ohio"], 0)
        self.assertAlmostEqual(r.m["Ohio"], -r.m["Akron"])
        self.assertAlmostEqual(r.m["Ohio"], P["k_early"] * (21 - W["home"]))   # first game: the early k
        self.assertGreater(r.parts("Ohio", "Kent State")["e"], 0)

    def test_new_season_resets_efficiency_and_adds_returning_production(self):
        r = M.Ratings(P, {(2026, "Ohio"): 0.75})
        r.new_season(2024)
        r.m.update(Ohio=10.0, Akron=-10.0)
        r.o.update(Ohio=0.2, Akron=0.1)
        r.d.update(Ohio=-0.1, Akron=0.1)
        r.new_season(2026)
        self.assertAlmostEqual(r.m["Ohio"], 9.0)
        self.assertAlmostEqual(r.o["Ohio"], 0.8 * 0.25)
        self.assertAlmostEqual(r.o["Akron"], 0.0)
        self.assertAlmostEqual(r.d["Ohio"], 0.0)

    def test_run_uses_only_earlier_games(self):
        _, out = M.run([game("1", "2026-09-01", "Ohio", "Akron", 21), game("2", "2026-09-08", "Ohio", "Akron")], P, W)
        (_, p1, _), (_, p2, _) = out
        self.assertEqual(p1["m"], 0.0)                       # game 1's number is from before game 1
        self.assertGreater(p2["m"], 0)                       # game 2's includes it


class Compare(unittest.TestCase):
    def test_last_pick_before_kickoff_on_shared_games(self):
        d = Path(tempfile.mkdtemp())
        k = "2026-10-02T00:00:00Z"
        rows = [{"sport": "CFB", "game_id": "1", "model": "kalshi", "home_wp": 0.7, "at": "2026-10-01T00:00:00Z", "kickoff": k},
                {"sport": "CFB", "game_id": "1", "model": "kalshi", "home_wp": 0.8, "at": "2026-10-01T05:00:00Z", "kickoff": k},
                {"sport": "CFB", "game_id": "1", "model": "kalshi", "home_wp": 0.1, "at": "2026-10-03T00:00:00Z", "kickoff": k},
                {"sport": "NHL", "game_id": "1", "model": "kalshi", "home_wp": 0.1, "at": "2026-10-01T00:00:00Z", "kickoff": k}]
        (d / "p").write_text("".join(json.dumps(r) + "\n" for r in rows))
        (d / "r").write_text(json.dumps({"sport": "CFB", "game_id": "1", "home_score": 30, "away_score": 20}) + "\n")
        rep = M.compare([({"id": "1", "season": 2026}, {}, 10.0)], 0.0, 0.1, d / "p", d / "r", 2026)
        t = rep["each"]["kalshi"]
        self.assertEqual(t["games"], 1)
        self.assertAlmostEqual(t["models"]["kalshi"]["log_loss"], 0.2231, places=4)   # -ln 0.8


class OnTheModelsPage(unittest.TestCase):
    def setUp(self):
        self.old = MC.DEVIG_DIR
        MC.DEVIG_DIR = Path(tempfile.mkdtemp())

    def tearDown(self):
        MC.DEVIG_DIR = self.old

    def test_a_challenger_not_the_apps_pick(self):
        self.assertNotIn("CFB", next(m for m in MC.MODELS if m["key"] == "devig")["sports"])
        self.assertIn("CFB", next(m for m in MC.MODELS if m["key"] == "devigcfb")["sports"])
        self.assertIn("devigcfb", MC.COVERS["CFB"]["ml"])
        self.assertIn("devigcfb", MC.COVERS["CFB"]["spread"])
        self.assertNotIn("devig", MC.COVERS["CFB"]["ml"])

    def test_read_by_espn_id(self):
        now = datetime(2026, 11, 3, 12, tzinfo=UTC)
        (MC.DEVIG_DIR / "cfb.json").write_text(json.dumps({"generated_at": MC.iso(now - timedelta(minutes=5)), "games": [
            {"game_id": "401", "home": "Akron", "away": "Ohio", "kickoff": "2026-11-04T00:00:00Z", "home_wp": 0.12,
             "home_line": 17.3}]}))
        ups = [{"sport": "CFB", "game_id": "401", "kickoff": datetime(2026, 11, 4, tzinfo=UTC), "date": "2026-11-03",
                "home": "AKR", "away": "OHIO"}]
        out = MC.read_lab("CFB", ups, now, MC.DEVIG_DIR)
        self.assertEqual(out["401"]["home_wp"], 0.12)
        self.assertEqual(out["401"]["home_line"], 17.3)


if __name__ == "__main__":
    unittest.main()
