"""tools/props_streak_history.py: which past prop lines count as a 10-game streak, the hardest-line rule, the price
filter, and the summary written for the app's Streaks section (2026-11-05). Fixtures only, no real rows.

    python3 -m unittest discover -s tests/tools
"""
import csv
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import props_streak_history as S  # noqa: E402

COLS = ["date", "opp", "ha", "min", "pts", "reb", "ast", "fg3m", "stl", "blk", "tov", "starter", "type", "season"]
FIELDS = ["stat", "event_ticker", "game_date", "season", "player", "line", "yes_bid", "yes_ask", "result"]


def nba_game(day, pts, mins=30):
    return [f"2026-01-{day:02d}", "BOS", "h", mins, pts, 5, 5, 2, 1, 0, 2, True, "reg", "2025-26"]


class Streaks(unittest.TestCase):
    def build(self, log, rows):
        root = tempfile.mkdtemp()
        os.makedirs(os.path.join(root, "stats", "nba"))
        os.makedirs(os.path.join(root, "nba", "props_history", "kalshi"))
        for name, d in [("index.json", {"log_cols": COLS, "hit_stats": [["points", "Points", ["pts"]]]}),
                        ("team_ORL.json", {"players": [{"name": "Jalen Sué", "log": log[::-1]}]})]:
            with open(os.path.join(root, "stats", "nba", name), "w") as f:
                json.dump(d, f)
        with open(os.path.join(root, "nba", "props_history", "kalshi", "a.csv"), "w", newline="") as f:
            w = csv.DictWriter(f, FIELDS)
            w.writeheader()
            for r in rows:
                w.writerow({"stat": "points", "event_ticker": "EV1", "game_date": "2026-01-20", "season": "2026",
                            "player": "Jalen Sue", "yes_bid": 0.80, "yes_ask": 0.82, "result": "yes", **r})
        return root

    def run_rungs(self, log, rows):
        with mock.patch.object(S, "ROOT", self.build(log, rows)):
            return S.rungs("nba")

    def test_hardest_line_still_on_a_streak(self):
        log = [nba_game(d, 22) for d in range(1, 11)] + [nba_game(11, 25)]
        rows, seasons = self.run_rungs(log, [{"line": 14.5}, {"line": 19.5, "result": "no"}, {"line": 24.5}])
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["line"], 19.5)          # 25+ was reached only once
        self.assertFalse(rows[0]["yes"])
        self.assertAlmostEqual(rows[0]["mid"], 0.81)
        self.assertEqual(seasons, ["2025-26"])

    def test_games_not_played_and_later_games_are_skipped(self):
        log = [nba_game(d, 22) for d in range(1, 11)] + [nba_game(12, 0, mins=0), nba_game(25, 0)]
        rows, _ = self.run_rungs(log, [{"line": 19.5}])
        self.assertEqual(len(rows), 1)

    def test_nine_of_ten_is_not_a_streak(self):
        log = [nba_game(d, 22) for d in range(1, 11)]
        log[0] = nba_game(1, 10)
        self.assertEqual(self.run_rungs(log, [{"line": 19.5}])[0], [])

    def test_wide_or_crossed_prices_and_unsettled_rows_are_skipped(self):
        log = [nba_game(d, 22) for d in range(1, 11)]
        rows = [{"line": 9.5, "yes_bid": 0.70, "yes_ask": 0.80}, {"line": 14.5, "yes_bid": 0.9, "yes_ask": 0.88},
                {"line": 19.5, "result": ""}]
        self.assertEqual(self.run_rungs(log, rows)[0], [])

    def test_summary(self):
        rows = [{"ev": "A", "mid": 0.8, "ask": 0.82, "yes": True}, {"ev": "A", "mid": 0.9, "ask": 0.91, "yes": True},
                {"ev": "B", "mid": 0.8, "ask": 0.81, "yes": False}]
        s = S.summary(rows)
        self.assertEqual((s["rungs"], s["games"]), (3, 2))
        self.assertAlmostEqual(s["hit"], 0.6667, places=4)
        self.assertAlmostEqual(s["diff"], round(2 / 3 - 2.5 / 3, 4), places=4)
        self.assertLessEqual(s["diff_95"][0], s["diff_95"][1])
        self.assertIsNone(S.summary([]))

    def test_season_labels(self):
        self.assertEqual(S.season_label("nba", "2026"), "2025-26")
        self.assertEqual(S.season_label("nhl", "2026"), "2026-27")
        self.assertEqual(S.season_label("nfl", "2026"), "2026")

    def test_nfl_single_file_and_one_game_across_stat_events(self):
        root = tempfile.mkdtemp()
        os.makedirs(os.path.join(root, "stats", "nfl"))
        os.makedirs(os.path.join(root, "nfl", "props_history"))
        cols = ["date", "rec", "rec_yds", "type", "season"]
        log = [[f"2026-09-{d:02d}", 6, 70, "R", 2026] for d in range(1, 11)]
        for name, d in [("index.json", {"log_cols": cols, "hit_stats": [["receptions", "Rec", ["rec"]],
                                                                        ["receiving_yards", "Yds", ["rec_yds"]]]}),
                        ("team_KC.json", {"players": [{"name": "Rashee Rice", "log": log[::-1]}]})]:
            with open(os.path.join(root, "stats", "nfl", name), "w") as f:
                json.dump(d, f)
        with open(os.path.join(root, "nfl", "props_history", "kalshi_props_history_v1.csv"), "w", newline="") as f:
            w = csv.DictWriter(f, FIELDS + ["away_team", "home_team"])
            w.writeheader()
            for stat, ev, ln in [("receptions", "REC1", 4.5), ("receiving_yards", "YDS1", 59.5)]:
                w.writerow({"stat": stat, "event_ticker": ev, "game_date": "2026-09-20", "season": "2026", "player": "Rashee Rice",
                            "line": ln, "yes_bid": 0.8, "yes_ask": 0.82, "result": "yes", "away_team": "KC", "home_team": "LV"})
        with mock.patch.object(S, "ROOT", root):
            rows, seasons = S.rungs("nfl")
        self.assertEqual((len(rows), seasons), (2, ["2026"]))
        self.assertEqual(S.summary(rows)["games"], 1)   # two Kalshi events, one game


if __name__ == "__main__":
    unittest.main()
