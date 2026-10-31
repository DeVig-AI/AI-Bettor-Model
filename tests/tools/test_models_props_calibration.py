"""Do the percentages come true, for the props model (tools/models_compare.py props_calibration), on a temporary log.

    python3 -m unittest discover -s tests/tools
"""
import os
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import models_compare as MC  # noqa: E402


class PropsCalibration(unittest.TestCase):
    def setUp(self):
        self.old = MC.NBA_PROPS
        MC.NBA_PROPS = Path(tempfile.mkdtemp()) / "log.sqlite3"
        c = sqlite3.connect(MC.NBA_PROPS)
        c.execute("CREATE TABLE locked_rows (ticker TEXT, model_p REAL, k_bid REAL, k_ask REAL)")
        c.execute("CREATE TABLE grades (ticker TEXT, result TEXT)")
        rows = [("A", 0.65, 0.58, 0.62, "yes"), ("B", 0.35, 0.38, 0.42, "no"),     # both favoured sides happened
                ("C", 0.90, 0.80, 0.84, "no"),                                       # an 80%+ miss
                ("D", 0.60, None, 0.50, "yes"),                                      # no Kalshi bid: left out
                ("E", 0.55, 0.50, 0.52, "void")]                                     # not graded yes/no: left out
        c.executemany("INSERT INTO locked_rows VALUES (?,?,?,?)", [r[:4] for r in rows])
        c.executemany("INSERT INTO grades VALUES (?,?)", [(r[0], r[4]) for r in rows])
        c.commit()
        c.close()

    def tearDown(self):
        MC.NBA_PROPS = self.old

    def test_every_locked_prop_against_kalshis_mid(self):
        model, market = MC.props_calibration("NBA")
        self.assertEqual((model["key"], market["key"]), ("devig", "kalshi"))
        self.assertEqual(model["n"], 3)
        b60 = model["bins"][1]
        self.assertEqual((b60["n"], b60["said"], b60["won"]), (2, 0.65, 1.0))
        self.assertEqual((model["bins"][3]["n"], model["bins"][3]["won"]), (1, 0.0))
        self.assertEqual(market["logloss"], model["mkt_logloss"])
        self.assertEqual(market["bins"][1]["said"], 0.6)                        # Kalshi's mids: 0.60 and 1 - 0.40


if __name__ == "__main__":
    unittest.main()
