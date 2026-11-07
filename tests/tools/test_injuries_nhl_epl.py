"""tools/injuries_export.py, NHL and Premier League (2026-11-06): which statuses are listed, the role scale and the
reason text. Fixtures only, no network.

    python3 -m unittest discover -s tests/tools
"""
import os
import sys
import unittest
from datetime import datetime, timezone
from unittest import mock

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import injuries_export as I  # noqa: E402

NOW = datetime(2026, 11, 6, 18, tzinfo=timezone.utc)


class NHL(unittest.TestCase):
    def test_scale(self):
        self.assertEqual(I.nhl_impact("C", (0.15, 20.0, 18, 15), "BUF")["level"], "big")
        self.assertEqual(I.nhl_impact("D", (0.03, 21.0, 4, 15), "BUF")["level"], "some")     # big minutes
        self.assertEqual(I.nhl_impact("LW", (0.02, 11.0, 2, 15), "BUF")["level"], "minor")
        self.assertEqual(I.nhl_impact("G", None, "BUF")["level"], "some")
        self.assertEqual(I.nhl_impact("C", None, "BUF")["level"], "minor")

    def test_reason(self):
        self.assertEqual(I.nhl_reason({"shortComment": "Greer (upper body) was placed on injured reserve."}, "LW"), "LW · Upper body")
        self.assertEqual(I.nhl_reason({}, "G"), "G")

    def test_reserve_only_for_regulars(self):
        stats = {"players": [{"name": "Star Man", "this": {"gp": 10, "p_tot": 15, "toi": 20}},
                             {"name": "Depth Guy", "this": {"gp": 10, "p_tot": 1, "toi": 9}},
                             {"name": "Other", "this": {"gp": 10, "p_tot": 34, "toi": 15}}]}
        feed = {"injuries": [{"injuries": [
            {"status": s, "athlete": {"displayName": n, "team": {"abbreviation": "BUF"}, "position": {"abbreviation": "C"}}}
            for n, s in (("Star Man", "Injured Reserve"), ("Depth Guy", "Injured Reserve"), ("Depth Guy 2", "Day-To-Day"))]}]}
        games = {"BUF": {"away": "CBJ", "home": "BUF", "kickoff": NOW}}
        out = {}
        with mock.patch.object(I, "upcoming", return_value=games), mock.patch.object(I, "fetch_json", return_value=feed), \
             mock.patch.object(I, "team_stats", return_value=stats), mock.patch.object(I, "previous", return_value={}), \
             mock.patch.object(I, "write", side_effect=lambda sp, meta, rows, src: out.setdefault("rows", rows)):
            I.run_nhl(NOW)
        self.assertEqual([r["player"] for r in out["rows"]], ["Star Man", "Depth Guy 2"])
        self.assertEqual(out["rows"][0]["impact"]["label"], "Big")


class EPL(unittest.TestCase):
    def test_status(self):
        self.assertEqual(I.epl_status({"status": "i"}), "Out")
        self.assertEqual(I.epl_status({"status": "s"}), "Suspended")
        self.assertEqual(I.epl_status({"status": "d", "chance_of_playing_next_round": 25}), "Doubtful")
        self.assertEqual(I.epl_status({"status": "d", "chance_of_playing_next_round": 75}), "75% to play")
        self.assertIsNone(I.epl_status({"status": "u"}))       # left the club
        self.assertIsNone(I.epl_status({"status": "a"}))

    def test_run(self):
        boot = {"teams": [{"id": 1, "short_name": "MCI"}, {"id": 2, "short_name": "NFO"}],
                "events": [{"id": 11, "is_next": True}],
                "elements": [
                    {"team": 1, "status": "i", "first_name": "Ace", "second_name": "Striker", "starts": 8, "goals_scored": 5, "assists": 2, "news": "Knee injury"},
                    {"team": 1, "status": "d", "chance_of_playing_next_round": 50, "first_name": "Bench", "second_name": "Player", "starts": 1},
                    {"team": 2, "status": "u", "first_name": "Gone", "second_name": "Away", "starts": 9},
                    {"team": 2, "status": "a", "first_name": "Fit", "second_name": "Guy", "starts": 9}]}
        future = [{"event": 11, "team_h": 2, "team_a": 1, "kickoff_time": "2026-11-08T14:00:00Z", "finished": False}]
        past = [{"finished": True, "team_h": 1, "team_a": 2, "team_h_score": 20, "team_a_score": 0}] + \
               [{"finished": True, "team_h": 1, "team_a": 2, "team_h_score": 0, "team_a_score": 0}] * 9
        urls = {"bootstrap-static/": boot, "fixtures/?future=1": future, "fixtures/": past}
        out = {}
        with mock.patch.object(I, "fetch_json", side_effect=lambda u: urls[u[len(I.FPL):]]), \
             mock.patch.object(I, "previous", return_value={}), \
             mock.patch.object(I, "write", side_effect=lambda sp, meta, rows, src: out.setdefault("rows", rows)):
            I.run_epl(NOW)
        rows = out["rows"]
        self.assertEqual([(r["player"], r["status"]) for r in rows], [("Ace Striker", "Out"), ("Bench Player", "50% to play")])
        self.assertEqual((rows[0]["away"], rows[0]["home"], rows[0]["team"]), ("MNC", "NFO", "MNC"))   # ESPN's codes
        self.assertEqual(rows[0]["impact"]["label"], "Big")    # a regular (8 of 10 starts) in 7 of the 20 goals
        self.assertTrue(rows[0]["starter"])
        self.assertFalse(rows[1]["starter"])


if __name__ == "__main__":
    unittest.main()
