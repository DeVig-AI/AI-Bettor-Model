"""The live NBA pick (nba/nba_live_tracker_lock_v2.py) reads the official injury report with tools/injuries_export.py's
pdfplumber reader; the test that chose it read the same reports as text (macOS PDFKit,
research/injuries/nba_modelc_plus_injuries_v1.py). This checks the two agree on one fixed past report: the same
players, teams and statuses. Official PDFs are not stored in the repo, so the report is downloaded and compared with
the fingerprint the research parser gave (a hash; no names stored). Skips without pdfplumber or the network.

    python3 -m unittest tests/tools/test_nba_injury_parsers.py
"""
import importlib.util
import sys
import unittest
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "nba"))
sys.path.insert(0, str(ROOT / "tools"))

URL = "https://ak-static.cms.nba.com/referee/injury/Injury-Report_2025-01-15_05PM.pdf"
# research parser on PDFKit's text of this report: fingerprint, (team, player, status) rows. The 5 PM report also
# lists the next day's first game (IND@DET, 01/16); the research parser read both days together, so the check does too.
EXPECTED = ("c89cc92d5721fcec", 161)
DATES = {"01/15/2025", "01/16/2025"}


class LiveReaderMatchesTestedReader(unittest.TestCase):
    def test_same_players_teams_statuses(self):
        if importlib.util.find_spec("pdfplumber") is None:
            self.skipTest("pdfplumber not installed")
        import injuries_export as IE
        import nba_live_tracker_lock_v2 as V
        try:
            req = urllib.request.Request(URL, headers={"User-Agent": V.UA})
            pdf = urllib.request.urlopen(req, timeout=30).read()
        except Exception as e:  # noqa: BLE001
            self.skipTest(f"report not reachable: {e}")
        by_day = V.report_by_day(IE.parse_report(pdf))
        merged = {}
        for teams in by_day.values():
            for code, d in teams.items():
                merged.setdefault(code, {}).update(d)
        self.assertEqual(set(by_day), DATES)
        self.assertEqual(V.fingerprint(merged), EXPECTED)


if __name__ == "__main__":
    unittest.main()
