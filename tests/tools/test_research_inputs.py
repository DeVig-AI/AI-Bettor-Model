"""tools/research_inputs.py on answers shaped like the real ones: NHL goalies from an api-web.nhle.com box score,
MLB starting pitchers from a Retrosheet game log line, sportsdataverse basketball files, and the sealed season (2021)
never fetched.

    python3 -m unittest discover -s tests/tools
"""
import csv
import gzip
import os
import sys
import tempfile
import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import research_inputs as RI  # noqa: E402


def goalie(pid, name, toi, sa, sv, ga, starter=None, decision=""):
    g = {"playerId": pid, "name": {"default": name}, "toi": toi, "shotsAgainst": sa, "saves": sv, "goalsAgainst": ga,
         "decision": decision}
    if starter is not None:
        g["starter"] = starter
    return g


BOX = {"id": 2016020001, "season": 20162017, "gameType": 2, "gameDate": "2016-10-12", "startTimeUTC": "2016-10-12T23:00:00Z",
       "gameState": "OFF", "homeTeam": {"abbrev": "OTT"}, "awayTeam": {"abbrev": "TOR"},
       "playerByGameStats": {
           "homeTeam": {"goalies": [goalie(1, "C. Anderson", "65:00", 40, 37, 3, decision="W"),
                                    goalie(2, "A. Condon", "00:00", 0, 0, 0)]},
           "awayTeam": {"goalies": [goalie(3, "F. Andersen", "40:00", 20, 17, 3, starter=True),
                                    goalie(4, "J. Bernier", "24:12", 10, 10, 0, starter=False, decision="O")]}}}


def retro_line(d="20160403", away="TOR", home="TBA", vs=3, hs=5, vsp=("happj001", "J.A. Happ"), hsp=("archc001", "Chris Archer")):
    f = [""] * 161
    f[0], f[1], f[3], f[6], f[9], f[10], f[11], f[12], f[16] = d, "0", away, home, str(vs), str(hs), "54", "D", "STP01"
    f[77], f[78] = "umpire1", "Angel Hernandez"
    f[101], f[102], f[103], f[104] = vsp[0], vsp[1], hsp[0], hsp[1]
    return ",".join(f'"{x}"' if x else "" for x in f)


class Parsers(unittest.TestCase):
    def test_nhl_goalies(self):
        rows = RI.goalie_rows(BOX)
        self.assertEqual([(r["team"], r["name"], r["starter"]) for r in rows],
                         [("OTT", "C. Anderson", 1), ("TOR", "F. Andersen", 1), ("TOR", "J. Bernier", 0)],
                         "a goalie who never played is left out; no starter flag = most time on ice")
        self.assertEqual((rows[0]["season"], rows[0]["toi_s"], rows[0]["saves"], rows[0]["home"]), (2016, 3900, 37, 1))
        self.assertEqual(RI.goalie_rows(dict(BOX, gameState="LIVE")), [], "only finished games")

    def test_mlb_game_log(self):
        rows = RI.mlb_rows(retro_line() + "\n" + retro_line(d="20160404", hsp=("smitb001", "Bob Smith")), 2016)
        self.assertEqual(rows[0]["game_date"], "2016-04-03")
        self.assertEqual((rows[0]["away"], rows[0]["home"], rows[0]["away_score"], rows[0]["home_score"]), ("TOR", "TBA", 3, 5))
        self.assertEqual((rows[0]["away_sp_name"], rows[0]["home_sp_name"], rows[1]["home_sp_id"]), ("J.A. Happ", "Chris Archer", "smitb001"))
        self.assertNotIn("Angel Hernandez", str(rows), "umpires are never kept (A3.5)")


class Collect(unittest.TestCase):
    def setUp(self):
        self.saved = (RI.OUT, RI.get, RI.current_start)
        RI.OUT = tempfile.mkdtemp()
        RI.current_start = lambda sport, now=None: 2022
        self.urls = []

    def tearDown(self):
        RI.OUT, RI.get, RI.current_start = self.saved

    def test_basketball_and_the_sealed_season(self):
        team = ("game_id,season,season_type,game_date,game_date_time,team_abbreviation,team_name,team_home_away,team_score,"
                "opponent_team_abbreviation,opponent_team_score,field_goals_made,field_goals_attempted,total_turnovers\n"
                "1,2016,2,2015-10-27,2015-10-28T00:00:00Z,ATL,Hawks,home,94,DET,106,37,82,15\n"
                "1,2016,2,2015-10-27,2015-10-28T00:00:00Z,DET,Pistons,away,106,ATL,94,37,96,15\n")
        player = ("game_id,game_date,team_abbreviation,athlete_id,athlete_display_name,athlete_position_abbreviation,starter,"
                  "did_not_play,minutes,points,reason\n"
                  "1,2015-10-27,ATL,11,Kyle Korver,G,TRUE,FALSE,29,7,COACH'S DECISION\n"
                  "1,2015-10-27,ATL,12,Tiago Splitter,C,FALSE,TRUE,,,LEFT HIP INJURY\n")

        def get(url, binary=False, **kw):
            self.urls.append(url)
            return (team if "team_box" in url else player).encode()
        RI.get = get
        RI.main(["--sport", "NBA"])
        self.assertTrue(all("_2022.csv" not in u for u in self.urls), "2021-22 (file 2022) is sealed: never fetched")
        self.assertEqual(sorted(os.listdir(os.path.join(RI.OUT, "nba"))),
                         sorted(["DONE.txt", "MANIFEST.json"] + [f"{k}_{s}.csv.gz" for k in ("team_games", "player_games")
                                                                  for s in range(2011, 2023) if s != 2021]))
        with gzip.open(os.path.join(RI.OUT, "nba", "player_games_2015.csv.gz"), "rt") as f:
            ps = list(csv.DictReader(f))
        self.assertEqual([(p["name"], p["played"], p["reason"]) for p in ps],
                         [("Kyle Korver", "1", ""), ("Tiago Splitter", "0", "LEFT HIP INJURY")])
        with open(os.path.join(RI.OUT, "nba", "DONE.txt")) as f:
            self.assertNotIn("2022", f.read(), "the season in progress is refreshed")
        with self.assertRaises(SystemExit):
            RI.main(["--sport", "NHL", "--seasons", "2021"])


if __name__ == "__main__":
    unittest.main()
