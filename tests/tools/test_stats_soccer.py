"""tools/stats_soccer.py: which months a run reads, who counts as having played, the club file a player lands in, and
the incremental merge (2026-11-05). Fixtures only, no network.

    python3 -m unittest discover -s tests/tools
"""
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from unittest import mock

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import stats_soccer as S  # noqa: E402


def player(pid, name, played=1, g=0, a=0):
    return {"athlete": {"id": pid, "displayName": name}, "stats": [
        {"name": "appearances", "value": float(played)}, {"name": "totalGoals", "value": float(g)},
        {"name": "goalAssists", "value": float(a)}]}


def summary(team_id, abbr, roster):
    return {"rosters": [{"team": {"id": team_id, "abbreviation": abbr}, "roster": roster}]}


class StatsSoccer(unittest.TestCase):
    def test_months(self):
        now = datetime(2026, 1, 15, tzinfo=timezone.utc)
        self.assertEqual(S.months(now, False), ["202512", "202601"])
        full = S.months(now, True)
        self.assertEqual((full[0], full[-1], len(full)), ("202507", "202601", 7))

    def test_unused_subs_are_left_out(self):
        s = summary("359", "ARS", [player("1", "Bukayo Saka", g=1), player("2", "Kepa", played=0)])
        with mock.patch.object(S, "get", return_value=s):
            rows = S.appearances("EPL", "eng.1", "9", "2026-01-01")
        self.assertEqual(rows, [("1", "Bukayo Saka", "359", "ARS", 1, 0)])

    def test_a_transfer_moves_the_player_and_keeps_both_clubs_matches(self):
        st = {"done": [], "players": {}}
        S.merge(st, ("EPL", "eng.1", "e2", "2026-02-01"), [("1", "A Player", "364", "LIV", 0, 1)])
        S.merge(st, ("EPL", "eng.1", "e1", "2026-01-01"), [("1", "A Player", "359", "ARS", 1, 0)])   # read later, older
        p = st["players"]["1"]
        self.assertEqual((p["team_id"], p["team"]), ("364", "LIV"))
        S.trim(st)
        self.assertEqual([r[0] for r in p["log"]], ["2026-02-01", "2026-01-01"])

    def test_write_then_read_back_is_incremental(self):
        d = tempfile.mkdtemp()
        st = {"done": [], "players": {}}
        for i in range(S.KEEP + 3):
            S.merge(st, ("EPL", "eng.1", f"e{i}", f"2026-01-{i + 1:02d}"), [("1", "A Player", "359", "ARS", 1, 0)])
        S.trim(st)
        with mock.patch.object(S, "DIR", d):
            S.write(st, datetime(2026, 2, 1, tzinfo=timezone.utc), [])
            with open(os.path.join(d, "team_359.json")) as f:
                team = json.load(f)
            with open(os.path.join(d, "index.json")) as f:
                idx = json.load(f)
        self.assertEqual(len(team["players"][0]["log"]), S.KEEP)
        self.assertEqual(team["players"][0]["log"][0][0], f"2026-01-{S.KEEP + 3:02d}")   # newest first
        self.assertEqual(len(idx["done"]), S.KEEP + 3)
        self.assertEqual(idx["log_cols"], S.LOG_COLS)


if __name__ == "__main__":
    unittest.main()
