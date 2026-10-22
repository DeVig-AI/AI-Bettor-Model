"""tools/stats_nhl.py: NHL API schedules read into results (overtime / shootout, the app's team codes), records with
overtime losses, ratings, and skater pages from box-score files shaped like nhl/data/player_games_<year>.csv.gz.

    python3 -m unittest discover -s tests/tools
"""
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timezone

import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import stats_nhl as H  # noqa: E402

NOW = datetime(2026, 10, 22, 12, tzinfo=timezone.utc)


def game(gid, date, home, away, hs, as_, last="REG", gtype=2, state="OFF"):
    return {"id": gid, "gameType": gtype, "gameDate": date, "gameState": state, "gameOutcome": {"lastPeriodType": last},
            "homeTeam": {"abbrev": home, "score": hs}, "awayTeam": {"abbrev": away, "score": as_}}


class StatsNHL(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        H.DATA, H.OUT, H.LINES = self.tmp, os.path.join(self.tmp, "out"), os.path.join(self.tmp, "none.json")
        self.sched = {
            "20252026": [game(1, "2026-01-10", "LAK", "NJD", 4, 1), game(2, "2026-01-12", "NJD", "LAK", 3, 2, "OT"),
                         game(3, "2026-01-14", "LAK", "NJD", 2, 1, "SO"), game(4, "2026-04-30", "LAK", "NJD", 5, 0, gtype=3),
                         game(5, "2025-09-25", "LAK", "NJD", 9, 0, gtype=1)],                        # preseason: left out
            "20262027": [game(11, "2026-10-20", "NJD", "LAK", 2, 1), game(12, "2026-10-28", "LAK", "NJD", None, None, state="FUT")]}
        H.get = lambda path, tries=3: {"games": self.sched.get(path.rsplit("/", 1)[-1], [])} if ("/LAK/" in path or "/NJD/" in path) else {}
        rows = []
        for y, gs in ((2025, self.sched["20252026"]), (2026, self.sched["20262027"])):
            for g in gs:
                if g["gameType"] not in (2, 3) or g["homeTeam"]["score"] is None:
                    continue
                for t, o, home, gf in (("LAK", "NJD", g["homeTeam"]["abbrev"] == "LAK", g["homeTeam"]["score"] if g["homeTeam"]["abbrev"] == "LAK" else g["awayTeam"]["score"]),
                                       ("NJD", "LAK", g["homeTeam"]["abbrev"] == "NJD", g["homeTeam"]["score"] if g["homeTeam"]["abbrev"] == "NJD" else g["awayTeam"]["score"])):
                    rows.append({"game_id": g["id"], "season": y, "game_type": g["gameType"], "game_date": g["gameDate"],
                                 "start_utc": g["gameDate"] + "T23:00:00Z", "team": t, "opp": o, "home": int(home),
                                 "player_id": 1 if t == "LAK" else 2, "name": "A. Kopi" if t == "LAK" else "J. Hughes",
                                 "first_name": "Anze" if t == "LAK" else "Jack", "last_name": "Kopi" if t == "LAK" else "Hughes",
                                 "position": "C", "goals": min(gf, 2), "assists": 1, "points": min(gf, 2) + 1, "sog": 4,
                                 "toi_s": 1200, "pp_goals": 0})
        for y in (2025, 2026):
            pd.DataFrame([r for r in rows if r["season"] == y]).to_csv(os.path.join(self.tmp, f"player_games_{y}.csv.gz"), index=False)

    def test_results_from_the_api(self):
        r = H.results(2025)
        self.assertEqual(sorted(r), [1, 2, 3, 4])                             # preseason left out
        self.assertEqual((r[2]["home"], r[2]["away"], r[2]["last"]), ("NJ", "LA", "OT"))   # the app's codes
        self.assertEqual(H.results(2026).keys(), {11})                        # a future game left out

    def test_files(self):
        H.build(NOW)
        idx = json.load(open(os.path.join(H.OUT, "index.json")))
        self.assertEqual((idx["season"], idx["last_season"], len(idx["teams"])), ("2026-27", "2025-26", 32))
        la = json.load(open(os.path.join(H.OUT, "team_LA.json")))
        self.assertEqual(la["last"]["record"], "2-0-1")                      # W 4-1, OT loss 2-3, SO win 2-1
        self.assertEqual(la["last"]["pts"], 5)
        self.assertEqual(la["this"]["record"], "0-1-0")
        self.assertEqual(la["games"][0][:6], ["2026-10-20", "NJ", "A", 1, 2, "L"])
        self.assertIn(["2026-01-14", "NJ", "H", 2, 1, "W", "R", 2026, "SO"], la["games"])
        p = la["players"][0]
        self.assertEqual(p["name"], "Anze Kopi")                              # full name, as Kalshi writes it
        self.assertEqual((p["last"]["gp"], p["last"]["g_tot"], p["this"]["gp"]), (3, 6, 1))   # 2 + 2 + 2
        self.assertEqual(p["log"][0][:8], ["2026-10-20", "NJ", "A", 20, 1, 1, 2, 4])
        self.assertEqual(idx["hit_stats"][0][0], "goals")
        t = {x["code"]: x for x in idx["teams"]}
        self.assertGreater(t["LA"]["rating"], t["NJ"]["rating"])            # LA won the season series

    def test_no_scores_keeps_the_old_files(self):
        H.get = lambda path, tries=3: None
        with self.assertRaises(RuntimeError):
            H.build(NOW)
        self.assertFalse(os.path.exists(os.path.join(H.OUT, "index.json")))


if __name__ == "__main__":
    unittest.main()
