"""Beating the close on the Models page (tools/models_compare.py): Kalshi's price when a pick is made against its last
price before the game, with the stores in a temporary folder (2026-10-22).

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

KICK = datetime(2026, 10, 25, 0, 0, tzinfo=timezone.utc)


def game():
    return {"sport": "NBA", "game_id": "77", "kickoff": KICK, "date": "2026-10-24", "home": "NYK", "away": "PHI",
            "home_name": "New York Knicks", "away_name": "Philadelphia 76ers", "final": False,
            "home_score": None, "away_score": None}


class BeatTheClose(unittest.TestCase):
    def setUp(self):
        d = Path(tempfile.mkdtemp())
        self.old = {k: getattr(MC, k) for k in ("LATEST", "PICKS", "RESULTS", "EXPORT", "nfl_games", "espn_day",
                                                 "devig_nba", "read_blotny", "read_kalshi", "cfb_upcoming", "fetch")}
        MC.LATEST, MC.PICKS, MC.RESULTS, MC.EXPORT = d / "latest.json", d / "picks.jsonl", d / "results.jsonl", d / "export.json"
        def no_nfl(*a):
            raise OSError("offline")
        MC.nfl_games = no_nfl                                       # no NFL games at all (no 538 run, no nfelo)
        MC.cfb_upcoming = no_nfl                                    # nor college football
        MC.fetch = no_nfl
        self.final = False
        def espn(sport, day):
            if sport != "NBA" or day != "2026-10-24":
                return []
            g = game()
            if self.final:
                g.update(final=True, home_score=110.0, away_score=100.0)
            return [g]
        MC.espn_day = espn
        self.devig, self.blotny, self.kalshi = {}, {}, {}
        MC.devig_nba = lambda by_id: {k: dict(v) for k, v in self.devig.items() if k in by_id}
        MC.read_blotny = lambda ups: {k: dict(v) for k, v in self.blotny.items()}
        MC.read_kalshi = lambda sport, ups: {k: dict(v) for k, v in self.kalshi.items()} if sport == "NBA" else {}
        MC.errors.clear()

    def tearDown(self):
        for k, v in self.old.items():
            setattr(MC, k, v)

    def run_at(self, t):
        MC.update(t)

    def test_novig(self):
        self.assertAlmostEqual(MC.novig(-150, 130), 0.6 / (0.6 + 100 / 230), places=9)
        self.assertIsNone(MC.novig(None, 130))

    def test_clv_end_to_end(self):
        # day before: DeVig locks NYK at 60% with Kalshi at -120/+100 in its tracker; Blotny likes PHI; Kalshi NYK -130
        self.devig = {"77": {"home_wp": 0.60, "at": "2026-10-23T18:00:00Z", "mkt_wp": MC.r4(MC.novig(-120, 100))}}
        self.blotny = {"77": {"home_wp": 0.45, "home_line": 2.0}}
        self.kalshi = {"77": {"home_wp": 0.56, "home_ml": -130.0, "away_ml": 110.0}}
        self.run_at(KICK - timedelta(hours=20))
        latest = json.loads(MC.LATEST.read_text())["games"]["NBA:77"]["picks"]
        self.assertEqual(latest["devig"]["mkt_wp"], MC.r4(MC.novig(-120, 100)))     # the tracker's lock price wins
        self.assertEqual(latest["blotny"]["mkt_wp"], MC.r4(MC.novig(-130, 110)))    # Kalshi now, as it first appears
        # the price moves toward NYK; Blotny's unchanged number keeps the price it was first seen at
        self.kalshi = {"77": {"home_wp": 0.64, "home_ml": -190.0, "away_ml": 160.0}}
        self.run_at(KICK - timedelta(minutes=30))
        latest = json.loads(MC.LATEST.read_text())["games"]["NBA:77"]["picks"]
        self.assertEqual(latest["blotny"]["mkt_wp"], MC.r4(MC.novig(-130, 110)))
        # the game starts and finishes: picks lock, the final is graded
        self.final = True
        self.run_at(KICK + timedelta(hours=3))
        MC.export(KICK + timedelta(hours=3))
        rep = [d for d in json.loads(MC.EXPORT.read_text())["docs"] if d["collection"] == "models_report"][0]["data"]
        close = {r["key"]: r for r in rep["sports"]["NBA"]["close"]}
        end = MC.novig(-190, 160)
        self.assertEqual(close["devig"]["n"], 1)
        self.assertEqual(close["devig"]["beat"], 1)                                 # picked NYK, price moved to NYK
        self.assertAlmostEqual(close["devig"]["avg"], round(end - MC.r4(MC.novig(-120, 100)), 4), places=4)
        self.assertEqual(close["blotny"]["beat"], 0)                                # picked PHI, price moved away
        self.assertLess(close["blotny"]["avg"], 0)
        self.assertNotIn("kalshi", close)
        self.assertEqual(rep["sports"]["NBA"]["ml"][0]["w"], 1)                     # the record is graded as before

    def test_old_pick_gets_tracker_price(self):
        self.devig = {"77": {"home_wp": 0.60, "at": "2026-10-23T18:00:00Z"}}
        self.run_at(KICK - timedelta(hours=20))                                     # no Kalshi yet: no price
        self.assertIsNone(json.loads(MC.LATEST.read_text())["games"]["NBA:77"]["picks"]["devig"]["mkt_wp"])
        self.devig["77"]["mkt_wp"] = 0.55
        self.run_at(KICK - timedelta(hours=19))
        self.assertEqual(json.loads(MC.LATEST.read_text())["games"]["NBA:77"]["picks"]["devig"]["mkt_wp"], 0.55)


class Model2(unittest.TestCase):
    def test_devig2_reads_upcoming(self):
        d = Path(tempfile.mkdtemp()) / "upcoming.json"
        d.write_text(json.dumps({"games": {"2026_07_NE_CHI": {"home_wp": 0.631}, "2026_07_LA_LV": {"home_wp": None}}}))
        old, MC.NFL_MODEL2 = MC.NFL_MODEL2, d
        try:
            self.assertEqual(MC.devig2_nfl({"2026_07_NE_CHI": {}, "2026_07_LA_LV": {}}), {"2026_07_NE_CHI": {"home_wp": 0.631}})
            self.assertEqual(MC.devig2_nfl({}), {})
        finally:
            MC.NFL_MODEL2 = old


if __name__ == "__main__":
    unittest.main()
