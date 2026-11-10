"""tools/stats_cbb.py on ESPN-shaped daily scoreboards served by a fake fetcher: Division I teams only, this season
only (the sealed 2025-26 season is never asked for), records, home/road/neutral splits, streaks, ranks, and finished
days kept in the cache.

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
import stats_cbb as C  # noqa: E402

TEAMS = {"1": ("DUKE", "Duke Blue Devils", "003087", "2"), "2": ("UK", "Kentucky Wildcats", "0033A0", "23"),
         "3": ("TA&M", "Texas A&M Aggies", "500000", "23"), "9": ("SPU", "Saint Peter's", None, None)}  # 9: not Division I
GAMES = {  # day -> [(id, home, away, home pts, away pts, neutral, done)]
    "20261102": [("g1", "1", "9", 90, 50, False, True), ("g2", "2", "3", 70, 75, False, True)],
    "20261105": [("g3", "1", "2", 80, 78, True, True)],
    "20261110": [("g4", "3", "1", 60, 61, False, True), ("g5", "2", "9", 0, 0, False, False)],
}


def team(tid):
    code, name, color, conf = TEAMS[tid]
    return {"id": tid, "abbreviation": code, "displayName": name, "color": color, "conferenceId": conf}


def board(day):
    return {"events": [{"id": g, "date": f"{day[:4]}-{day[4:6]}-{day[6:]}T23:00Z", "season": {"year": 2027, "type": 2},
                        "competitions": [{"status": {"type": {"completed": done}}, "neutralSite": n, "competitors": [
                            {"homeAway": "home", "score": str(hp), "team": team(h)}, {"homeAway": "away", "score": str(ap), "team": team(a)}]}]}
                       for g, h, a, hp, ap, n, done in GAMES.get(day, [])]}


class StatsCbb(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.out = os.path.join(self.tmp, "out")
        self._out, C.OUT = C.OUT, self.out
        self.urls = []

    def tearDown(self):
        C.OUT = self._out

    def fetch(self, url):
        self.urls.append(url)
        return board(url.split("dates=")[1].split("&")[0])

    def read(self, name):
        with open(os.path.join(self.out, name)) as f:
            return json.load(f)

    def test_build(self):
        now = datetime(2026, 11, 10, 18, 0, tzinfo=timezone.utc)
        res = C.build(now, os.path.join(self.tmp, "cache"), self.fetch, pause=0)
        self.assertEqual(res["teams"], 3)                     # Saint Peter's (no conference) gets no file
        self.assertEqual(res["games"], 4)                     # g5 isn't final
        self.assertTrue(all("dates=2026" in u for u in self.urls))
        self.assertFalse(os.path.exists(os.path.join(self.out, "team_SPU.json")))
        duke = self.read("team_DUKE.json")
        self.assertEqual(duke["this"]["record"], "3-0")
        self.assertEqual(duke["this"]["streak"], "W3")
        self.assertEqual((duke["this"]["home"], duke["this"]["away"], duke["this"]["neutral"]), ("1-0", "1-0", "1-0"))
        self.assertEqual(duke["games"][0][:6], ["2026-11-10", "TA_M", "A", 61, 60, "W"])
        self.assertEqual(duke["games"][-1][1], "SPU")
        self.assertEqual(duke["season"], "2026-27")
        self.assertEqual(duke["players"], [])
        self.assertEqual(self.read("team_UK.json")["this"]["streak"], "L2")
        idx = self.read("index.json")
        self.assertEqual(idx["sport"], "CBB")
        self.assertEqual([t["rank"] for t in idx["teams"]], [1, 2, 3])
        self.assertEqual(idx["teams"][-1]["code"], "UK")             # 0-2 against Division I teams
        # finished days were kept; a second run asks only for the last two days again
        n = len(self.urls)
        C.build(now, os.path.join(self.tmp, "cache"), self.fetch, pause=0)
        self.assertEqual(sorted(u.split("dates=")[1][:8] for u in self.urls[n:]), ["20261109", "20261110"])

    def test_sealed_season_is_never_fetched(self):
        with self.assertRaises(SystemExit):
            C.build(datetime(2026, 2, 1, tzinfo=timezone.utc), os.path.join(self.tmp, "cache"), self.fetch, pause=0)
        self.assertEqual(self.urls, [])


if __name__ == "__main__":
    unittest.main()
