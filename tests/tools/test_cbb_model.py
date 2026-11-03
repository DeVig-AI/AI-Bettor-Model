"""DeVig's CBB model v1 (tools/cbb_model_live.py, cbb/CBB_MODEL_V1_PREREG.md): the ratings, the frozen formula, the
start file, the live file from ESPN's scoreboard (stubbed), and the Models page reading live/devig/cbb.json as the
"devigcbb" challenger (2026-11-03).

    python3 -m unittest discover -s tests/tools
"""
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import cbb_model_live as M  # noqa: E402
import models_compare as MC  # noqa: E402

UTC = timezone.utc
P, W = M.FROZEN["settings"], M.FROZEN["weights"]
DI = lambda season, team: team != "small"   # noqa: E731


def game(gid, home, away, hs=None, as_=None, season=2027, neutral=False, day="2026-11-10"):
    return {"id": gid, "season": season, "day": day, "kickoff": day + "T23:00Z", "home": home, "away": away,
            "neutral": neutral, "hn": home, "an": away, "hs": hs, "as": as_}


class Formula(unittest.TestCase):
    def test_frozen(self):
        self.assertEqual(P, {"k": 0.05, "k_early": 0.15, "early_n": 4, "carry": 1.0, "non_di": -28.0, "cap": 40})
        self.assertEqual(W, {"home": 3.5185, "m": 0.9429})

    def test_even_teams_get_home_court_only(self):
        self.assertAlmostEqual(M.margin(W, 0.0, False), W["home"])
        self.assertEqual(M.margin(W, 0.0, True), 0.0)
        self.assertTrue(0.62 < M.logistic(M.FROZEN["win_chance"]["a"], M.FROZEN["win_chance"]["b"], W["home"]) < 0.65)

    def test_first_game_uses_the_early_k_and_caps_blowouts(self):
        r, _ = M.run([game("1", "a", "b", 60, 10)], P, W["home"], DI)
        self.assertAlmostEqual(r.m["a"], (P["k"] + P["k_early"]) * (P["cap"] - W["home"]))
        self.assertAlmostEqual(r.m["a"], -r.m["b"])

    def test_small_colleges_start_low(self):
        _, out = M.run([game("1", "a", "small")], P, W["home"], DI)
        g, gap, both = out[0]
        self.assertEqual(gap, -P["non_di"])
        self.assertFalse(both)

    def test_run_uses_only_earlier_games(self):
        _, out = M.run([game("1", "a", "b", 80, 70), game("2", "a", "b", day="2026-11-12")], P, W["home"], DI)
        self.assertEqual(out[0][1], 0.0)
        self.assertGreater(out[1][1], 0.0)

    def test_new_season_resets_the_early_k_only(self):
        r, _ = M.run([game("1", "a", "b", 80, 70, season=2026), game("2", "a", "b", 80, 70, season=2027)], P, W["home"], DI)
        self.assertEqual(r.n, {"a": 1, "b": 1})


class StartFile(unittest.TestCase):
    def test_after_last_season_and_numbers_only(self):
        d = json.loads(Path(M.START).read_text())
        self.assertEqual(d["after_season"], M.LAST)
        self.assertGreater(len(d["m"]), 1000)
        self.assertTrue(all(isinstance(v, float) for v in d["m"].values()))
        self.assertEqual(set(d), {"after_season", "data_through", "m", "model", "note"})


class Live(unittest.TestCase):
    def test_writes_upcoming_games_from_the_start_file(self):
        now = datetime(2026, 11, 3, 12, tzinfo=UTC)
        start = json.loads(Path(M.START).read_text())
        h, a = sorted(start["m"], key=lambda t: start["m"][t])[-1], sorted(start["m"], key=lambda t: start["m"][t])[0]
        rows = {"2026-11-02": [game("9", h, a, 90, 60, day="2026-11-02")],
                "2026-11-04": [dict(game("10", h, a, day="2026-11-04"), kickoff="2026-11-04T00:00Z")]}
        out = Path(tempfile.mkdtemp()) / "cbb.json"
        with mock.patch.object(M, "day_games", lambda d: rows.get(d.isoformat(), [])), \
                mock.patch.object(M, "di_teams", lambda: {h, a}), mock.patch.object(M, "OUT", str(out)):
            M.live(now)
        f = json.loads(out.read_text())
        self.assertEqual((f["sport"], f["finals_used"], f["data_through"]), ("CBB", 1, "2026-11-02"))
        self.assertEqual([g["game_id"] for g in f["games"]], ["10"])
        g = f["games"][0]
        self.assertGreater(g["home_wp"], 0.99)
        self.assertAlmostEqual(g["home_line"], -round(M.margin(W, g["parts"]["m"], False), 1), places=1)


class OnTheModelsPage(unittest.TestCase):
    def setUp(self):
        self.old = MC.DEVIG_DIR
        MC.DEVIG_DIR = Path(tempfile.mkdtemp())

    def tearDown(self):
        MC.DEVIG_DIR = self.old

    def test_a_challenger_beside_kalshi(self):
        self.assertIn("CBB", MC.SPORTS)
        self.assertEqual([m["key"] for m in MC.MODELS if "CBB" in m["sports"]], ["devigcbb", "kalshi"])
        self.assertEqual(MC.COVERS["CBB"]["ml"], {"devigcbb", "kalshi"})
        self.assertEqual(MC.COVERS["CBB"]["spread"], {"devigcbb", "kalshi"})

    def test_read_by_espn_id(self):
        now = datetime(2026, 11, 3, 12, tzinfo=UTC)
        (MC.DEVIG_DIR / "cbb.json").write_text(json.dumps({"generated_at": MC.iso(now - timedelta(minutes=5)), "games": [
            {"game_id": "401906848", "home": "2633", "away": "2747", "kickoff": "2026-11-03T23:00:00Z", "home_wp": 0.98,
             "home_line": -26.2}]}))
        ups = [{"sport": "CBB", "game_id": "401906848", "kickoff": datetime(2026, 11, 3, 23, tzinfo=UTC),
                "date": "2026-11-03", "home": "TENN", "away": "WOF"}]
        out = MC.read_lab("CBB", ups, now, MC.DEVIG_DIR)
        self.assertEqual(out["401906848"]["home_wp"], 0.98)
        self.assertEqual(out["401906848"]["home_line"], -26.2)


if __name__ == "__main__":
    unittest.main()
