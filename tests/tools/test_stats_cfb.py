"""tools/stats_cfb.py on ESPN-shaped answers (teams, week scoreboards, box scores, rosters) served by a fake fetcher:
FBS teams only, this season only (nothing from 2025 is asked for), records and ranks, players by roster position with
a guess when the roster is missing, box scores fetched once and kept in the cache.

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
import stats_cfb as C  # noqa: E402

TEAMS = {"1": ("UGA", "Georgia Bulldogs", "BA0C2F"), "2": ("BAMA", "Alabama Crimson Tide", "9E1B32"),
         "3": ("TA&M", "Texas A&M Aggies", "500000")}
GAMES = [  # id, week, date, home, away, home pts, away pts
    ("g1", 1, "2026-09-05", "1", "9", 45, 3),        # Georgia vs an FCS team (id 9, "SAM")
    ("g2", 2, "2026-09-12", "2", "3", 24, 27),
    ("g3", 3, "2026-09-19", "1", "2", 31, 20),
    ("g4", 3, "2026-09-19", "3", "9", 38, 10),
]


def team(tid):
    if tid == "9":
        return {"id": "9", "abbreviation": "SAM"}
    code, name, color = TEAMS[tid]
    return {"id": tid, "abbreviation": code, "displayName": name, "color": color}


def scoreboard(week):
    evs = [{"id": g, "date": d + "T23:00Z", "competitions": [{"status": {"type": {"completed": True}}, "neutralSite": False,
            "competitors": [{"homeAway": "home", "score": str(hp), "team": team(h)}, {"homeAway": "away", "score": str(ap), "team": team(a)}]}]}
           for g, w, d, h, a, hp, ap in GAMES if w == week]
    if week == 4:                                   # next week: scheduled, nothing finished
        evs = [{"id": "g5", "date": "2026-09-26T23:00Z", "competitions": [{"status": {"type": {"completed": False}},
                "competitors": [{"homeAway": "home", "score": "0", "team": team("2")}, {"homeAway": "away", "score": "0", "team": team("1")}]}]}]
    return {"events": evs}


def box(gid):
    g = [x for x in GAMES if x[0] == gid][0]
    _, _, _, h, a, hp, ap = g

    def side(tid, pts):
        return {"team": {"id": tid}, "statistics": [{"name": "totalYards", "displayValue": str(200 + 5 * pts)},
                {"name": "netPassingYards", "displayValue": str(120 + 3 * pts)}, {"name": "rushingYards", "displayValue": str(80 + 2 * pts)},
                {"name": "turnovers", "displayValue": "1"}, {"name": "sacksYardsLost", "displayValue": "2-14"}]}
    players = []
    for tid, pts in ((h, hp), (a, ap)):
        if tid == "9":
            continue
        qb, rb, lb = tid + "01", tid + "02", tid + "03"
        players.append({"team": {"id": tid}, "statistics": [
            {"name": "passing", "keys": ["completions/passingAttempts", "passingYards", "passingTouchdowns", "interceptions"],
             "athletes": [{"athlete": {"id": qb, "displayName": TEAMS[tid][0] + " Passer"}, "stats": ["20/30", str(8 * pts), "2", "1"]}]},
            {"name": "rushing", "keys": ["rushingAttempts", "rushingYards", "rushingTouchdowns"],
             "athletes": [{"athlete": {"id": rb, "displayName": TEAMS[tid][0] + " Runner"}, "stats": ["18", str(3 * pts), "1"]}]},
            {"name": "defensive", "keys": ["totalTackles", "soloTackles", "sacks", "tacklesForLoss", "passesDefended", "QBHits"],
             "athletes": [{"athlete": {"id": lb, "displayName": TEAMS[tid][0] + " Backer"}, "stats": ["9", "6", "1.5", "2", "0", "1"]}]},
            {"name": "interceptions", "keys": ["interceptions"], "athletes": [{"athlete": {"id": lb, "displayName": TEAMS[tid][0] + " Backer"}, "stats": ["1"]}]}]})
    return {"boxscore": {"teams": [side(h, hp), side(a, ap)], "players": players}}


def roster(tid):
    if tid == "3":
        raise ValueError("roster unavailable")      # Texas A&M: grouped by what its players did
    return {"athletes": [{"position": "offense", "items": [{"id": tid + "01", "position": {"abbreviation": "QB"}},
                                                           {"id": tid + "02", "position": {"abbreviation": "RB"}}]},
                         {"position": "defense", "items": [{"id": tid + "03", "position": {"abbreviation": "OLB"}}]},
                         {"position": "specialTeam"}]}                 # a group with no list (seen on ESPN's college rosters)


class FakeEspn:
    def __init__(self):
        self.urls = []

    def __call__(self, url):
        self.urls.append(url)
        path = url.split("/college-football/", 1)[1]
        if path.startswith("teams?"):
            return {"sports": [{"leagues": [{"teams": [{"team": team(t)} for t in TEAMS]}]}]}
        if path.startswith("scoreboard?"):
            q = dict(x.split("=") for x in path.split("?", 1)[1].split("&"))
            return scoreboard(int(q["week"])) if q["seasontype"] == "2" else {"events": []}
        if path.startswith("summary?event="):
            return box(path.split("=", 1)[1])
        if path.startswith("teams/") and path.endswith("/roster"):
            return roster(path.split("/")[1])
        raise AssertionError("unexpected " + url)


class StatsCFB(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cache = tempfile.mkdtemp()
        C.OUT = os.path.join(cls.cache, "out")
        cls.fake = FakeEspn()
        cls.result = C.build(datetime(2026, 10, 22, tzinfo=timezone.utc), cls.cache, fetch=cls.fake, pause=0)

    def load(self, name):
        with open(os.path.join(C.OUT, name)) as f:
            return json.load(f)

    def test_this_season_only(self):
        self.assertTrue(all("dates=2026" in u for u in self.fake.urls if "scoreboard" in u))
        self.assertFalse(any("2025" in u for u in self.fake.urls), "nothing from the sealed 2025 season")
        idx = self.load("index.json")
        self.assertEqual((idx["season"], idx["last_season"]), ("2026", "—"))
        self.assertIsNone(self.load("team_UGA.json")["last"])

    def test_teams_records_ranks(self):
        idx = self.load("index.json")
        self.assertEqual(sorted(t["code"] for t in idx["teams"]), ["BAMA", "TA_M", "UGA"], "FBS only; TA&M -> TA_M")
        uga = self.load("team_UGA.json")
        self.assertEqual(uga["this"]["record"], "2-0")
        self.assertEqual(uga["ranks"]["ppg"], 1)
        self.assertEqual(uga["games"][-1][:6], ["2026-09-05", "SAM", "H", 45, 3, "W"], "an FCS opponent keeps its abbreviation")
        self.assertEqual(uga["this"]["sacks"], 2.0, "sacks: the opponents' sacks taken")
        self.assertEqual(idx["teams"][0]["code"], "UGA")

    def test_players_by_position(self):
        uga = self.load("team_UGA.json")
        self.assertEqual([(p["name"], p["grp"]) for p in uga["players"]], [("UGA Passer", "QB"), ("UGA Runner", "RB"), ("UGA Backer", "LB")])
        backer = uga["players"][2]
        self.assertEqual(backer["pos"], "OLB")
        self.assertEqual(backer["this"], {"gp": 2, "tkl": 9.0, "sk": 1.5, "int_d": 1.0, "pd": 0.0, "tfl": 2.0, "qbh": 1.0, "ff": 0.0})
        idx = self.load("index.json")
        L = {c: i for i, c in enumerate(idx["log_cols"])}
        self.assertEqual(backer["log"][0][L["sk"]], 1.5)
        self.assertEqual(uga["players"][0]["log"][0][L["pass_yds"]], 248)
        tam = self.load("team_TA_M.json")
        self.assertEqual(sorted(p["grp"] for p in tam["players"]), ["LB", "QB", "RB"], "no roster: grouped by what they did")

    def test_box_scores_fetched_once(self):
        n = len([u for u in self.fake.urls if "summary" in u])
        self.assertEqual(n, len(GAMES))
        again = FakeEspn()
        C.build(datetime(2026, 10, 22, tzinfo=timezone.utc), self.cache, fetch=again, pause=0)
        self.assertEqual([u for u in again.urls if "summary" in u], [], "kept in the cache")


if __name__ == "__main__":
    unittest.main()
