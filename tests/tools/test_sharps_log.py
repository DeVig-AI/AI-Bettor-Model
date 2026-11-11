"""Polymarket's top earners, locked at the start (tools/sharps_log.py; SHARPS_LIVE_V1_PREREG.md): counting, no look-ahead,
and a game that waits when a trader's history can't be read. No network (2026-11-11).

    python3 -m unittest -v tests/tools/test_sharps_log.py
"""
import csv
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import sharps_log as L  # noqa: E402

KICK = datetime(2026, 11, 11, 1, 0, tzinfo=timezone.utc)
CID = "0xabc"
BOARD = [{"rank": i + 1, "wallet": f"0x{i:02d}", "name": f"t{i}", "pnl": 1000 - i} for i in range(20)]


def game(first="away", kick=KICK, board=True):
    g = {"sport": "NBA", "date": "2026-11-10", "away": "BOS", "home": "PHI", "kickoff": L.iso(kick),
         "slug": "nba-bos-phi-2026-11-10", "listed_first": first,
         "kalshi": {"seen": "2026-11-10T22:00:00Z", "away_ml": -140, "home_ml": 120, "home_wp": 0.43}}
    if board:
        g["board"] = {"at": "2026-11-11T00:37:00Z", "top": BOARD}
    return g


def trade(idx, usd, side="BUY", before=60, cid=CID):
    return {"condition_id": cid, "outcome_index": idx, "size": usd / 0.5, "price": 0.5, "side": side,
            "timestamp": (KICK - timedelta(minutes=before)).timestamp()}


class Tally(unittest.TestCase):
    def test_counts_net_money_per_trader(self):
        hist = {"0x00": [trade(0, 5000)],                          # $5k on BOS
                "0x01": [trade(0, 3000), trade(1, 2500)],          # both sides, net $500: not counted
                "0x02": [trade(1, 4000), trade(1, 1000, "SELL")],  # $3k on PHI after selling some back
                "0x03": [trade(0, 2000)]}
        r = L.tally(game(), CID, BOARD, hist)
        self.assertEqual((r["n_away"], r["usd_away"], r["n_home"], r["usd_home"]), (2, 7000, 1, 3000))
        self.assertEqual((r["sharp_side"], r["heads_side"]), ("away", "away"))
        t = {x["wallet"]: x["counted"] for x in json.loads(r["traders"])}
        self.assertEqual(t, {"0x00": "away", "0x01": "", "0x02": "home", "0x03": "away"})

    def test_money_and_heads_can_disagree(self):
        hist = {"0x00": [trade(1, 50000)], "0x01": [trade(0, 2000)], "0x02": [trade(0, 1500)]}
        r = L.tally(game(), CID, BOARD, hist)
        self.assertEqual((r["sharp_side"], r["heads_side"]), ("home", "away"))

    def test_trades_at_or_after_the_start_and_other_markets_are_ignored(self):
        hist = {"0x00": [trade(0, 5000, before=0), trade(0, 5000, before=-30), trade(0, 9000, cid="0xother")]}
        r = L.tally(game(), CID, BOARD, hist)
        self.assertEqual((r["sharp_side"], r["usd_away"], r["traders"]), ("", 0, "[]"))

    def test_home_listed_first_flips_outcome_zero(self):
        r = L.tally(game(first="home"), CID, BOARD, {"0x00": [trade(0, 5000)]})
        self.assertEqual((r["n_home"], r["sharp_side"]), (1, "home"))

    def test_only_the_board_counts(self):
        r = L.tally(game(), CID, BOARD, {"0xstranger": [trade(0, 90000)]})
        self.assertEqual(r["sharp_side"], "")


class Trades(unittest.TestCase):
    def test_long_market_lists_are_asked_in_chunks_and_paged(self):
        calls, orig = [], L.KG.get

        def fake(url, params):
            calls.append((params["condition"].count(",") + 1, params.get("cursor")))
            if params.get("cursor") is None and params["condition"].startswith("c00"):
                return {"data": [{"n": 1}], "pagination": {"has_more": True, "next_cursor": "p2"}}
            return {"data": [{"n": 2}], "pagination": {"has_more": False}}
        L.KG.get = fake
        try:
            rows = L.trades("0x00", {f"c{i:02d}" for i in range(31)})
        finally:
            L.KG.get = orig
        self.assertEqual(calls, [(10, None), (10, "p2"), (10, None), (10, None), (1, None)])
        self.assertEqual(len(rows), 5)

    def test_a_refused_chunk_means_unreadable(self):
        orig = L.KG.get
        L.KG.get = lambda url, params: None if params["condition"].startswith("c10") else {"data": [], "pagination": {}}
        try:
            self.assertIsNone(L.trades("0x00", {f"c{i:02d}" for i in range(31)}))
        finally:
            L.KG.get = orig


class Lock(unittest.TestCase):
    def setUp(self):
        self._orig = (L.moneyline, L.trades)
        L.moneyline = lambda slug: (CID, ["Celtics", "76ers"])

    def tearDown(self):
        L.moneyline, L.trades = self._orig

    def test_unreadable_history_waits_for_the_next_run(self):
        L.trades = lambda w, cids: None if w == "0x05" else []
        pend = {"k": game()}
        self.assertEqual(L.lock(pend, KICK + timedelta(minutes=20)), [])
        self.assertIn("k", pend)

    def test_locks_once_with_kalshi_price_and_leaves_pending(self):
        L.trades = lambda w, cids: [trade(0, 5000)] if w == "0x00" else []
        pend = {"k": game(), "later": game(kick=KICK + timedelta(hours=3))}
        rows = L.lock(pend, KICK + timedelta(minutes=20))
        self.assertEqual([(r["key"], r["status"], r["sharp_side"], r["kalshi_away_ml"]) for r in rows], [("k", "locked", "away", -140)])
        self.assertEqual(list(pend), ["later"])

    def test_missed_and_no_board(self):
        L.trades = lambda w, cids: []
        pend = {"old": game(kick=KICK - timedelta(hours=80)), "nob": game(board=False)}
        rows = {r["key"]: r["status"] for r in L.lock(pend, KICK + timedelta(minutes=5))}
        self.assertEqual(rows, {"old": "missed", "nob": "no_board"})


class Snapshot(unittest.TestCase):
    def test_board_and_prices_only_before_the_start(self):
        now = KICK - timedelta(minutes=30)
        poly = {"generated_at": "2026-11-11T00:30:00Z", "games": [
            {"sport": "NBA", "date": "2026-11-10", "away": "BOS", "home": "PHI", "kickoff": L.iso(KICK), "slug": "s",
             "listed_first": "away", "away_bid": 0.56, "away_ask": 0.58},
            {"sport": "NBA", "date": "2026-11-10", "away": "MIA", "home": "UTA", "kickoff": L.iso(now - timedelta(minutes=1)),
             "slug": "t", "listed_first": "away", "away_bid": 0.7, "away_ask": 0.72}]}
        with tempfile.TemporaryDirectory() as d:
            orig = L.MODELS
            L.MODELS = Path(d) / "latest.json"
            L.MODELS.write_text(json.dumps({"games": {"NBA:1": {"sport": "NBA", "date": "2026-11-10", "away": "BOS", "home": "PHI",
                                                                "picks": {"kalshi": {"seen": L.iso(KICK + timedelta(minutes=5)), "away_ml": -300}}}}}))
            try:
                pend = {}
                L.snapshot(pend, poly, BOARD, now)
            finally:
                L.MODELS = orig
        self.assertEqual(list(pend), ["NBA:2026-11-10:BOS@PHI"])          # a started game is never snapshotted
        g = pend["NBA:2026-11-10:BOS@PHI"]
        self.assertEqual((g["poly_away_mid"], g["board"]["top"][0]["wallet"]), (0.57, "0x00"))
        self.assertNotIn("kalshi", g)                                       # a Kalshi price seen after the start is not used

    def test_main_appends_and_never_relocks(self):
        with tempfile.TemporaryDirectory() as d:
            saved = (L.DIR, L.PENDING, L.LOCKS, L.POLY, L.leaderboard, L.moneyline, L.trades)
            L.DIR, L.PENDING, L.LOCKS, L.POLY = Path(d), Path(d) / "p.json", Path(d) / "L.csv", Path(d) / "poly.json"
            L.POLY.write_text("{}")
            L.leaderboard, L.moneyline, L.trades = (lambda: None), (lambda s: (CID, [])), (lambda w, c: [])
            try:
                L.PENDING.write_text(json.dumps({"k": game(kick=datetime.now(timezone.utc) - timedelta(hours=1))}))
                L.main()
                L.PENDING.write_text(json.dumps({"k": game(kick=datetime.now(timezone.utc) - timedelta(hours=1))}))
                L.main()
                with L.LOCKS.open(newline="") as f:
                    rows = list(csv.DictReader(f))
            finally:
                L.DIR, L.PENDING, L.LOCKS, L.POLY, L.leaderboard, L.moneyline, L.trades = saved
        self.assertEqual([(r["key"], r["status"]) for r in rows], [("k", "locked")])


if __name__ == "__main__":
    unittest.main()
