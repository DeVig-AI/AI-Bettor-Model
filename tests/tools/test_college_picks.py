"""CHAMPION_CHALLENGER_V3 (tools/college_picks.py): tiers, pass, lock price, no back-fill, grading, on made-up games.

    python3 -m unittest discover -s tests/tools
"""
import os
import sys
import unittest
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import college_picks as CP  # noqa: E402

NOW = datetime(2026, 11, 10, 12, 0, tzinfo=timezone.utc)


def iso(t):
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def lock(gid, p, logged, kick, model="devigcbb", slot="CBB.ml", role="champion"):
    return {"logged_at": iso(logged), "slot": slot, "game_id": gid, "kickoff": iso(kick), "model": model, "role": role,
            "home_wp": str(p), "champion_lock_at": iso(kick - timedelta(hours=6))}


def game(gid, kick, home_ml=-300.0, away_ml=250.0):
    return {"sport": "CBB", "game_id": gid, "home": "HOM" + gid, "away": "AWY" + gid, "kickoff": iso(kick),
            "date": kick.date().isoformat(), "picks": {"kalshi": {"home_ml": home_ml, "away_ml": away_ml, "home_line": -7.5}}}


class CollegePicks(unittest.TestCase):
    def setUp(self):
        self._board = CP.board_docs
        CP.board_docs = lambda path: {}          # start from an empty board, never the repo's file

    def tearDown(self):
        CP.board_docs = self._board

    def run_cbb(self, locks, games, picks=(), results=None):
        latest = {"games": {f"CBB:{g['game_id']}": g for g in games}}
        _, out, added = CP.build(NOW, "CBB", locks, latest, list(picks), results or {})
        return {d["doc_id"]: d["data"] for d in out["docs"]}, added

    def test_tiers_and_pass(self):
        kick = NOW + timedelta(hours=5)
        at = NOW - timedelta(minutes=5)
        locks = [lock("a", 0.90, at, kick), lock("b", 0.25, at, kick), lock("c", 0.60, at, kick),
                 lock("a", 0.88, at, kick, model="market", role="tracked")]
        docs, added = self.run_cbb(locks, [game("a", kick), game("b", kick), game("c", kick)])
        self.assertEqual(added, 3)
        a, b, c = docs["a"]["decision"], docs["b"]["decision"], docs["c"]["decision"]
        self.assertEqual((a["action"], a["side"], a["tier"]), ("ML", "HOMa", "top25"))
        self.assertEqual((b["action"], b["side"], b["tier"], b["prob"]), ("ML", "AWYb", "top50", 0.75))
        self.assertEqual((c["action"], c["side"]), ("PASS", None))
        self.assertEqual(docs["c"]["lean"]["side"], "HOMc")
        self.assertEqual(docs["a"]["market_snapshot"]["moneyline_home"], -300)
        self.assertEqual(docs["a"]["market_snapshot"]["from"], "lock")
        self.assertEqual(docs["a"]["inputs"]["market_prob_home_at_lock"], 0.88)

    def test_no_backfill_and_no_lock_after_start(self):
        kick = NOW + timedelta(hours=5)
        before_rule = CP.parse_t(CP.START) - timedelta(minutes=1)
        locks = [lock("old", 0.9, before_rule, kick), lock("late", 0.9, kick + timedelta(minutes=1), kick)]
        docs, added = self.run_cbb(locks, [game("old", kick), game("late", kick)])
        self.assertEqual(added, 0)
        self.assertEqual(docs, {})

    def test_missed_run_uses_last_pre_start_price_and_grades(self):
        kick = NOW - timedelta(hours=3)
        at = kick - timedelta(hours=6)
        close = {"sport": "CBB", "model": "kalshi", "game_id": "g", "home": "HOMg", "away": "AWYg",
                 "kickoff": iso(kick), "date": kick.date().isoformat(), "home_ml": -500.0, "away_ml": 400.0}
        docs, _ = self.run_cbb([lock("g", 0.2, at, kick)], [game("g", kick)], picks=[close],
                               results={"g": {"home_score": 60, "away_score": 71}})
        d = docs["g"]
        self.assertEqual(d["market_snapshot"]["moneyline_home"], -500)
        self.assertTrue(d["market_snapshot"]["from"].startswith("last pre-start"))
        self.assertEqual(d["decision"]["side"], "AWYg")
        self.assertEqual(d["outcome"], {"resolved": True, "home_score": 60, "away_score": 71, "decision_correct": True})

    def test_cfb_waits_for_its_tiers_file(self):
        kick = NOW + timedelta(hours=5)
        real = CP.CFB_TIERS
        CP.CFB_TIERS = os.path.join(ROOT, "no-such-tiers.json")
        try:
            _, out, added = CP.build(NOW, "CFB", [lock("f", 0.9, NOW, kick, model="devigcfb", slot="CFB.ml")],
                                     {"games": {"CFB:f": dict(game("f", kick), sport="CFB")}}, [], {})
        finally:
            CP.CFB_TIERS = real
        self.assertEqual((added, out["docs"], out["tiers"]), (0, [], None))

    def test_summarize(self):
        rows = [(0.55, False), (0.6, True), (0.7, True), (0.8, True), (0.9, True)]
        s = CP.summarize(rows)
        self.assertEqual((s["games"], s["top50"], s["top25"]), (5, 0.7, 0.8))
        self.assertEqual((s["acc_top50"], s["acc_top25"], s["acc_rest"]), (1.0, 1.0, 0.5))


if __name__ == "__main__":
    unittest.main()
