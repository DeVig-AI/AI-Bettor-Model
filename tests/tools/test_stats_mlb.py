"""tools/stats_mlb.py on Stats API-shaped answers served by a fake fetcher: the app's team codes, records and ranks
(rate stats ranked as numbers, lower ERA better), hitters and pitchers split (starters vs relievers), logs from the
last games' box scores, fetched once.

    python3 -m unittest discover -s tests/tools
"""
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import stats_mlb as M  # noqa: E402

TEAMS = [{"id": 147, "abbreviation": "NYY", "name": "New York Yankees"}, {"id": 119, "abbreviation": "LAD", "name": "Los Angeles Dodgers"},
         {"id": 135, "abbreviation": "SDP", "name": "San Diego Padres"}]
GAMES = {2026: [("1", "2026-09-01", 147, 119, 5, 3, "R"), ("2", "2026-09-02", 119, 135, 2, 6, "R"), ("3", "2026-09-03", 135, 147, 1, 4, "R"),
                ("4", "2026-10-21", 147, 119, 7, 2, "W")],
         2025: [("9", "2025-09-01", 135, 147, 3, 2, "R")]}


def schedule(y):
    return {"dates": [{"date": d, "games": [{"gamePk": int(pk), "gameType": t, "status": {"abstractGameState": "Final"},
                                             "teams": {"home": {"team": {"id": h}, "score": hs}, "away": {"team": {"id": a}, "score": as_}}}]}
                      for pk, d, h, a, hs, as_, t in GAMES[y]]}


def team_stats(y, grp):
    vals = {147: (".265", ".340", ".455", ".795", "3.40", "1.15"), 119: (".250", ".320", ".410", ".730", "4.10", "1.30"),
            135: (".240", ".300", ".390", ".690", "3.90", "1.25")}
    splits = []
    for t, (avg, obp, slg, ops, era, whip) in vals.items():
        stat = {"avg": avg, "obp": obp, "slg": slg, "ops": ops, "homeRuns": 3} if grp == "hitting" else \
            {"era": era, "whip": whip, "strikeOuts": 27, "inningsPitched": "27.0"}
        splits.append({"team": {"id": t}, "stat": stat})
    return {"stats": [{"splits": splits if y == 2026 else []}]}


def player_stats(y, grp):
    if y != 2026:
        return {"stats": [{"splits": []}]}
    if grp == "hitting":
        sp = [{"player": {"id": 592450, "fullName": "Aaron Judge"}, "team": {"id": 147}, "position": {"abbreviation": "RF"},
               "stat": {"gamesPlayed": 150, "atBats": 540, "hits": 170, "homeRuns": 52, "rbi": 130, "runs": 120, "baseOnBalls": 120,
                        "strikeOuts": 160, "avg": ".315", "obp": ".450", "slg": ".690", "ops": "1.140"}},
              {"player": {"id": 660271, "fullName": "Shohei Ohtani"}, "team": {"id": 119}, "position": {"abbreviation": "TWP"},
               "stat": {"gamesPlayed": 158, "atBats": 600, "hits": 175, "homeRuns": 50, "rbi": 110, "avg": ".292", "ops": "1.000"}}]
    else:
        sp = [{"player": {"id": 543037, "fullName": "Gerrit Cole"}, "team": {"id": 147}, "position": {"abbreviation": "P"},
               "stat": {"gamesPitched": 30, "gamesStarted": 30, "wins": 14, "losses": 6, "inningsPitched": "190.1", "strikeOuts": 220,
                        "baseOnBalls": 45, "era": "3.12", "whip": "1.05"}},
              {"player": {"id": 621242, "fullName": "Devin Williams"}, "team": {"id": 147}, "position": {"abbreviation": "P"},
               "stat": {"gamesPitched": 65, "gamesStarted": 0, "saves": 30, "inningsPitched": "62.0", "strikeOuts": 90, "era": "2.40", "whip": "1.00"}},
              {"player": {"id": 660271, "fullName": "Shohei Ohtani"}, "team": {"id": 119}, "position": {"abbreviation": "P"},
               "stat": {"gamesPitched": 14, "gamesStarted": 14, "inningsPitched": "70.0", "strikeOuts": 80, "era": "3.50", "whip": "1.10"}}]
    return {"stats": [{"splits": sp}]}


def box(pk):
    g = [x for x in GAMES[2026] + GAMES[2025] if x[0] == pk][0]
    _, _, h, a, _, _, _ = g

    def players(tid):
        if tid != 147:
            return {}
        return {"ID592450": {"person": {"id": 592450}, "stats": {"batting": {"atBats": 4, "hits": 2, "doubles": 1, "homeRuns": 1, "rbi": 2,
                                                                                "runs": 1, "plateAppearances": 4}, "pitching": {}}},
                "ID543037": {"person": {"id": 543037}, "stats": {"batting": {}, "pitching": {"inningsPitched": "6.2", "strikeOuts": 9,
                                                                                               "earnedRuns": 1, "hits": 4}}},
                "ID999": {"person": {"id": 999}, "stats": {"batting": {"atBats": 0, "plateAppearances": 0}, "pitching": {}}}}
    return {"teams": {"home": {"team": {"id": h}, "players": players(h)}, "away": {"team": {"id": a}, "players": players(a)}}}


class FakeApi:
    def __init__(self):
        self.urls = []

    def __call__(self, url):
        self.urls.append(url)
        path = url.split("/api/v1/", 1)[1]
        q = dict(x.split("=", 1) for x in path.split("?", 1)[1].split("&")) if "?" in path else {}
        if path.startswith("teams?"):
            return {"teams": TEAMS}
        if path.startswith("schedule?"):
            return schedule(int(q["season"]))
        if path.startswith("teams/stats?"):
            return team_stats(int(q["season"]), q["group"])
        if path.startswith("stats?"):
            return player_stats(int(q["season"]), q["group"])
        if path.startswith("game/"):
            return box(path.split("/")[1])
        raise AssertionError("unexpected " + url)


class StatsMLB(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cache = tempfile.mkdtemp()
        M.OUT = os.path.join(cls.cache, "out")
        cls.fake = FakeApi()
        M.build(datetime(2026, 10, 22, tzinfo=timezone.utc), cls.cache, fetch=cls.fake, pause=0)

    def load(self, name):
        with open(os.path.join(M.OUT, name)) as f:
            return json.load(f)

    def test_codes_records_ranks(self):
        idx = self.load("index.json")
        self.assertEqual(sorted(t["code"] for t in idx["teams"]), ["LAD", "NYY", "SD"], "Stats API SDP -> the app's SD")
        nyy = self.load("team_NYY.json")
        self.assertEqual(nyy["this"]["record"], "2-0", "the World Series game isn't in the record")
        self.assertEqual(nyy["ranks"]["avg"], 1)
        self.assertEqual(nyy["ranks"]["era"], 1, "lowest ERA is 1st")
        self.assertEqual(nyy["this"]["ops"], ".795", "rate stats stay as MLB writes them")
        self.assertEqual(nyy["games"][0][:7], ["2026-10-21", "LAD", "H", 7, 2, "W", "P"])
        self.assertEqual(nyy["last"]["record"], "0-1")

    def test_hitters_and_pitchers(self):
        nyy = self.load("team_NYY.json")
        self.assertEqual([(p["name"], p["grp"]) for p in nyy["players"]],
                         [("Aaron Judge", "OF"), ("Gerrit Cole", "SP"), ("Devin Williams", "RP")])
        lad = self.load("team_LAD.json")
        self.assertEqual([p["grp"] for p in lad["players"]], ["DH"], "a two-way player who hits more than he pitches: a hitter")

    def test_logs_from_box_scores(self):
        idx = self.load("index.json")
        L = {c: i for i, c in enumerate(idx["log_cols"])}
        judge = [p for p in self.load("team_NYY.json")["players"] if p["name"] == "Aaron Judge"][0]
        self.assertEqual(len(judge["log"]), 3, "his team's games this season (box score shows him in all)")
        g = judge["log"][0]
        self.assertEqual((g[0], g[L["h"]], g[L["tb"]], g[L["hr"]]), ("2026-10-21", 2, 6, 1))
        cole = [p for p in self.load("team_NYY.json")["players"] if p["name"] == "Gerrit Cole"][0]
        self.assertEqual((cole["log"][0][L["ip"]], cole["log"][0][L["k"]]), (6.7, 9))
        boxes = len([u for u in self.fake.urls if "/boxscore" in u])
        again = FakeApi()
        M.build(datetime(2026, 10, 22, tzinfo=timezone.utc), self.cache, fetch=again, pause=0)
        self.assertEqual([u for u in again.urls if "/boxscore" in u], [], f"{boxes} box scores kept in the cache")


if __name__ == "__main__":
    unittest.main()
