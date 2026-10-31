"""Do the percentages come true, on the Models page (tools/models_compare.py calibration).

    python3 -m unittest discover -s tests/tools
"""
import os
import sys
import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import models_compare as MC  # noqa: E402


def g(gid, devig_wp, kalshi_wp):
    return ("NBA", gid), {"meta": {}, "picks": {"devig": {"home_wp": devig_wp}, "kalshi": {"home_wp": kalshi_wp}}}


class Calibration(unittest.TestCase):
    def test_bands_use_the_favoured_side_and_skip_ties(self):
        by_game = dict([g("1", 0.65, 0.6), g("2", 0.35, 0.4), g("3", 0.85, 0.8), g("4", 0.62, 0.5), g("5", 0.7, 0.7)])
        results = {("NBA", "1"): {"home_score": 100, "away_score": 90},     # favoured home won
                   ("NBA", "2"): {"home_score": 100, "away_score": 90},     # favoured away (65%) lost
                   ("NBA", "3"): {"home_score": 80, "away_score": 90},      # 85% home lost
                   ("NBA", "4"): {"home_score": 90, "away_score": 90}}      # tie: left out; 5 not played: left out
        rows = {r["key"]: r for r in MC.calibration("NBA", by_game, results)}
        d = rows["devig"]
        self.assertEqual(d["n"], 3)
        b60 = d["bins"][1]
        self.assertEqual((b60["n"], b60["said"], b60["won"]), (2, 0.65, 0.5))
        self.assertEqual((d["bins"][3]["n"], d["bins"][3]["won"]), (1, 0.0))
        self.assertEqual(d["bins"][0]["n"], 0)
        self.assertIsNone(d["bins"][0]["said"])
        self.assertEqual(rows["kalshi"]["logloss"], d["mkt_logloss"])        # the market on the very same games
        self.assertGreater(d["logloss"], d["mkt_logloss"])                  # a confident miss costs more


if __name__ == "__main__":
    unittest.main()
