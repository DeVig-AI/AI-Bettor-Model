# The injuries archive: one line per status change, cleared players noted. python3 -m unittest tests/tools/test_injuries_archive.py
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))
import injuries_export as X  # noqa: E402


def row(status, reason="Ankle"):
    return {"team": "BOS", "player": "A Player", "status": status, "reason": reason, "away": "BOS", "home": "CHA",
            "tip_sort": "11061900", "impact": {"level": "big"}}


class Archive(unittest.TestCase):
    def test_changes_only(self):
        with tempfile.TemporaryDirectory() as t:
            X.ARCHIVE = Path(t)
            X.archive("NBA", [row("Questionable")], "2026-11-06T12:00:00Z")
            X.archive("NBA", [row("Questionable")], "2026-11-06T13:00:00Z")      # same: nothing new
            X.archive("NBA", [row("Out")], "2026-11-06T14:00:00Z")
            X.archive("NBA", [], "2026-11-07T01:00:00Z")
            lines = [json.loads(x) for x in (Path(t) / "nba" / "2026-11.jsonl").read_text().splitlines()]
            self.assertEqual([x["status"] for x in lines], ["Questionable", "Out", "Cleared"])
            self.assertEqual(lines[1]["impact"], "big")
            self.assertEqual(lines[0]["seen_at"], "2026-11-06T12:00:00Z")


if __name__ == "__main__":
    unittest.main()
