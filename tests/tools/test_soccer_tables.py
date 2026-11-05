"""Soccer tables in tools/soccer_tables.py: ESPN's standings parsed into each league's table, every team's finished
results this season, and its last-five form (2026-11-04).

    python3 -m unittest discover -s tests/tools
"""
import os
import sys
import unittest
from unittest import mock

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import soccer_tables as ST  # noqa: E402


def entry(tid, abbr, name, rank, w, d, l, gf, ga, note=None):
    stats = [("rank", rank), ("gamesPlayed", w + d + l), ("wins", w), ("ties", d), ("losses", l), ("pointsFor", gf),
             ("pointsAgainst", ga), ("pointDifferential", gf - ga), ("points", 3 * w + d)]
    e = {"team": {"id": tid, "abbreviation": abbr, "shortDisplayName": name},
         "stats": [{"name": k, "value": v} for k, v in stats]}
    if note:
        e["note"] = note
    return e


def game(date, state, me_home, me_id, opp_abbr, my, their):
    me = {"homeAway": "home" if me_home else "away", "team": {"id": me_id}, "score": {"value": my, "displayValue": str(my)}}
    op = {"homeAway": "away" if me_home else "home", "team": {"id": "999", "abbreviation": opp_abbr},
          "score": {"value": their, "displayValue": str(their)}}
    return {"date": date, "competitions": [{"status": {"type": {"state": state}}, "competitors": [me, op]}]}


class Table(unittest.TestCase):
    def test_single_table_sorted_with_zones(self):
        d = {"children": [{"name": "Premier League", "standings": {"seasonDisplayName": "2026-27", "entries": [
            entry("2", "B", "Bees", 2, 5, 2, 3, 15, 12),
            entry("1", "A", "Ays", 1, 8, 1, 1, 20, 6, {"description": "Champions League", "color": "#81D6AC", "rank": 1}),
        ]}}]}
        season, groups = ST.table(d)
        self.assertEqual(season, "2026-27")
        self.assertEqual(len(groups), 1)
        rows = groups[0]["rows"]
        self.assertEqual([r["code"] for r in rows], ["A", "B"])
        a = rows[0]
        self.assertEqual((a["gp"], a["w"], a["d"], a["l"], a["gf"], a["ga"], a["gd"], a["pts"]), (10, 8, 1, 1, 20, 6, 14, 25))
        self.assertEqual(a["zone"], {"label": "Champions League", "color": "#81D6AC"})
        self.assertIsNone(rows[1]["zone"])

    def test_two_conferences_and_missing_rank(self):
        e1, e2 = entry("1", "A", "Ays", 1, 1, 0, 0, 1, 0), entry("2", "B", "Bees", 1, 0, 0, 1, 0, 1)
        e2["stats"] = [s for s in e2["stats"] if s["name"] != "rank"]
        d = {"children": [{"name": "Eastern", "standings": {"entries": [e1]}},
                          {"name": "Western", "standings": {"entries": [e2]}}]}
        _, groups = ST.table(d)
        self.assertEqual([g["name"] for g in groups], ["Eastern", "Western"])
        self.assertEqual(groups[1]["rows"][0]["rank"], 1)   # no rank from ESPN: its place in the order

    def test_empty(self):
        self.assertEqual(ST.table({}), (None, []))


class Results(unittest.TestCase):
    def test_finished_only_oldest_first_and_colour(self):
        d = {"team": {"color": "c8102e"}, "events": [
            game("2026-10-20T19:00Z", "post", False, "7", "LIV", 1, 1),
            game("2026-10-01T19:00Z", "post", True, "7", "ARS", 2, 0),
            game("2026-11-09T19:00Z", "pre", True, "7", "CHE", 0, 0),
        ]}
        with mock.patch.object(ST.KG, "get", return_value=d):
            games, color = ST.results("eng.1", "7")
        self.assertEqual(games, [["2026-10-01", "ARS", "H", 2, 0], ["2026-10-20", "LIV", "A", 1, 1]])
        self.assertEqual(color, "#c8102e")

    def test_no_schedule(self):
        with mock.patch.object(ST.KG, "get", return_value=None):
            self.assertEqual(ST.results("eng.1", "7"), ([], None))


class Form(unittest.TestCase):
    def test_last_five_newest_last(self):
        g = [["d", "X", "H", a, b] for a, b in [(0, 1), (2, 0), (1, 1), (3, 2), (0, 0), (1, 0)]]
        self.assertEqual(ST.form(g), "WDWDW")
        self.assertEqual(ST.form([]), "")


if __name__ == "__main__":
    unittest.main()
