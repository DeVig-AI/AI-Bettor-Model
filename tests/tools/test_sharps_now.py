"""The game page's sharps card file (tools/sharps_now.py): counts upcoming games, keeps a started game's last count,
keeps the old file when a history can't be read. No network (2026-11-11).

    python3 -m unittest -v tests/tools/test_sharps_now.py
"""
import os
import sys
import unittest
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import sharps_log as L  # noqa: E402
import sharps_now as N  # noqa: E402

NOW = datetime(2026, 11, 11, 23, 0, tzinfo=timezone.utc)
BOARD = [{"rank": i + 1, "wallet": f"0x{i:02d}", "name": f"t{i}", "pnl": 1000 - i} for i in range(20)]


def pg(away, home, kick, first="away"):
    return {"sport": "NBA", "date": "2026-11-11", "away": away, "home": home, "kickoff": L.iso(kick), "slug": f"{away}-{home}",
            "listed_first": first, "away_bid": 0.41, "away_ask": 0.42}


def trade(cid, idx, usd, at):
    return {"condition_id": cid, "outcome_index": idx, "size": usd / 0.5, "price": 0.5, "side": "BUY", "timestamp": at.timestamp()}


class Build(unittest.TestCase):
    def setUp(self):
        self._orig = (L.moneyline, L.trades)
        L.moneyline = lambda slug: ("c-" + slug.lower(), [])

    def tearDown(self):
        L.moneyline, L.trades = self._orig

    def test_counts_upcoming_games_up_to_now(self):
        kick = NOW + timedelta(hours=1)
        L.trades = lambda w, cids: {"0x05": [trade("c-was-ind", 1, 101600, NOW - timedelta(hours=2))],
                                    "0x07": [trade("c-was-ind", 0, 400, NOW - timedelta(hours=2))]}.get(w, [])
        out = N.build({}, {"games": [pg("WAS", "IND", kick)]}, BOARD, NOW)
        g = out["games"]["NBA:2026-11-11:WAS@IND"]
        self.assertEqual((g["side"], g["usd_home"], g["n_home"], g["n_away"], g["poly_away"]), ("home", 101600, 1, 0, 0.415))
        self.assertEqual(g["traders"], [{"rank": 6, "name": "t5", "pnl": 995, "side": "home", "usd": 101600}])   # $400 isn't counted

    def test_started_games_keep_their_last_count_for_12_hours(self):
        L.trades = lambda w, cids: []
        old = {"games": {"NBA:2026-11-11:A@B": {"kickoff": L.iso(NOW - timedelta(hours=2)), "side": "away"},
                         "NBA:2026-11-10:C@D": {"kickoff": L.iso(NOW - timedelta(hours=13)), "side": "home"}}}
        out = N.build(old, {"games": [pg("A", "B", NOW - timedelta(hours=2))]}, BOARD, NOW)
        self.assertEqual(out["games"], {"NBA:2026-11-11:A@B": old["games"]["NBA:2026-11-11:A@B"]})

    def test_unreadable_history_keeps_the_old_file(self):
        L.trades = lambda w, cids: None if w == "0x03" else []
        self.assertIsNone(N.build({}, {"games": [pg("WAS", "IND", NOW + timedelta(hours=1))]}, BOARD, NOW))


if __name__ == "__main__":
    unittest.main()
