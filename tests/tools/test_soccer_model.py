"""DeVig Soccer v1 (tools/soccer_model_live.py, soccer/SOCCER_MODEL_V1_PREREG.md) and the SOCCER.ml record
(tools/soccer_track.py, CHAMPION_CHALLENGER_V4_PREREG.md): the ratings, the frozen formula, the start file, the live
file from ESPN's scoreboard (stubbed), and the locks and grades (2026-11-05).

    python3 -m unittest discover -s tests/tools
"""
import json
import math
import os
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import soccer_model_live as M  # noqa: E402
import soccer_track as T  # noqa: E402

UTC = timezone.utc
P, RHO = M.FROZEN["settings"], M.FROZEN["rho"]
LEVEL = {"season": 2025, "teams": {"eng.1|a": [0.0, 0.0, 2025], "eng.1|b": [0.0, 0.0, 2025]},
         "leagues": {"eng.1": [M.MU0, M.H0]}}      # two level teams already in the league


def game(gid, h, a, hs=None, as_=None, season=2026, start="2026-11-08T15:00Z", lg="eng.1"):
    return {"id": gid, "season": season, "league": lg, "start": start, "neutral": False, "hk": f"{lg}|{h}",
            "ak": f"{lg}|{a}", "hs": hs, "as": as_, "state": "post" if hs is not None else "pre", "names": (h, a)}


class Formula(unittest.TestCase):
    def test_frozen(self):
        self.assertEqual(P, {"k": 0.015, "early": 0.5, "carry": 1.0, "promo": 0.2, "cap": 4})
        self.assertEqual(RHO, -0.05)

    def test_chances_add_to_one_and_favour_more_goals(self):
        hw, dr, aw = M.chances(1.8, 0.9, RHO)
        self.assertAlmostEqual(hw + dr + aw, 1.0)
        self.assertGreater(hw, aw)
        self.assertAlmostEqual(M.chances(1.3, 1.3, RHO)[0], M.chances(1.3, 1.3, RHO)[2])

    def test_dixon_coles_adds_draws(self):
        self.assertGreater(M.chances(1.3, 1.1, -0.1)[1], M.chances(1.3, 1.1, 0.0)[1])

    def test_even_teams_get_the_home_edge_only(self):
        _, out = M.run([game("1", "a", "b")], P, LEVEL)
        g, lh, la = out[0]
        self.assertAlmostEqual(lh, math.exp(M.MU0 + M.H0))
        self.assertAlmostEqual(la, math.exp(M.MU0))

    def test_run_uses_only_earlier_games_and_caps_goals(self):
        r, out = M.run([game("1", "a", "b", 7, 0, start="2026-08-20T15:00Z"), game("2", "a", "b")], P, LEVEL)
        self.assertAlmostEqual(out[0][1], math.exp(M.MU0 + M.H0))
        self.assertGreater(out[1][1], out[0][1])
        k0 = P["k"] * (1 + P["early"])
        self.assertAlmostEqual(r.t["eng.1|a"][0], k0 * (4 - math.exp(M.MU0 + M.H0)))
        self.assertAlmostEqual(r.t["eng.1|b"][1], -r.t["eng.1|a"][0])

    def test_promoted_teams_start_below_the_league_average(self):
        rows = [game("1", "a", "b", 2, 1, season=2024), game("2", "b", "a", 0, 0, season=2024, start="2024-12-01T15:00Z"),
                game("3", "a", "new", season=2025, start="2025-08-20T15:00Z")]
        r, _ = M.run(rows, P)
        avg = [(r.t["eng.1|a"][i] + r.t["eng.1|b"][i]) / 2 for i in (0, 1)]
        self.assertAlmostEqual(r.t["eng.1|new"][0], avg[0] - P["promo"])
        self.assertAlmostEqual(r.t["eng.1|new"][1], avg[1] - P["promo"])

    def test_a_team_back_after_a_season_away_restarts(self):
        rows = [game("1", "a", "b", 5, 0, season=2022), game("2", "a", "c", season=2024, start="2024-08-20T15:00Z")]
        r, _ = M.run(rows, P)
        self.assertLess(r.t["eng.1|a"][0], 0.0)

    def test_never_stores_this_season(self):
        with mock.patch.object(sys, "argv", ["x", "fetch", tempfile.mkdtemp(), str(M.LAST + 1)]):
            with self.assertRaises(SystemExit):
                M.main()


class StartFile(unittest.TestCase):
    def test_numbers_only_after_the_last_season(self):
        d = json.loads(Path(M.START).read_text())
        self.assertEqual(d["season"], M.LAST)
        self.assertEqual(d["settings"], P)
        self.assertEqual(d["rho"], RHO)
        self.assertEqual(set(d["leagues"]), set(M.LEAGUES))
        self.assertGreater(len(d["teams"]), 150)
        self.assertTrue(all(len(v) == 3 and all(isinstance(x, (int, float)) for x in v) for v in d["teams"].values()))
        self.assertEqual(set(d), {"model", "season", "settings", "rho", "note", "leagues", "teams"})


class Live(unittest.TestCase):
    def test_writes_upcoming_matches_from_the_start_file(self):
        start = json.loads(Path(M.START).read_text())
        epl = sorted((k for k in start["teams"] if k.startswith("eng.1|") and start["teams"][k][2] == M.LAST),
                     key=lambda k: start["teams"][k][0] - start["teams"][k][1])
        h, a = epl[-1].split("|")[1], epl[0].split("|")[1]
        rows = [game("9", h, a, 3, 0, start="2026-11-01T15:00Z"), game("10", h, a, start="2026-11-07T15:00Z"),
                game("11", h, a, start="2026-12-30T15:00Z")]
        out = Path(tempfile.mkdtemp()) / "soccer.json"
        now = datetime(2026, 11, 5, 12, tzinfo=UTC)

        class Now(datetime):
            @classmethod
            def now(cls, tz=None):
                return now
        with mock.patch.object(M, "fetch_season", lambda s, until=None: [dict(r) for r in rows]), \
                mock.patch.object(M, "OUT", str(out)), mock.patch.object(M, "datetime", Now):
            M.live()
        d = json.loads(out.read_text())
        self.assertEqual(d["finals_used"], 1)
        self.assertEqual([g["game_id"] for g in d["games"]], ["10"])
        g = d["games"][0]
        self.assertEqual((g["league"], g["home"], g["away"]), ("EPL", h, a))
        self.assertAlmostEqual(g["home_wp"] + g["draw_p"] + g["away_wp"], 1.0, places=3)
        self.assertGreater(g["home_wp"], 0.5)
        self.assertGreater(g["home_wp"], g["away_wp"] + 0.3)


class Track(unittest.TestCase):
    now = datetime(2026, 11, 7, 12, tzinfo=UTC)

    def model(self, kickoff="2026-11-07T15:00Z"):
        return {"generated_at": "2026-11-07T11:30:00Z", "games": [
            {"game_id": "10", "league": "EPL", "kickoff": kickoff, "home": "1", "away": "2", "home_name": "A",
             "away_name": "B", "home_wp": 0.5, "draw_p": 0.3, "away_wp": 0.2}]}

    def test_locks_until_kickoff_then_never_again(self):
        locks = {}
        lines = {"games": [{"espn_id": "10", "fair": {"home": 0.45, "draw": 0.3, "away": 0.25}}]}
        self.assertEqual(T.lock(locks, self.model(), lines, self.now), 1)
        self.assertEqual(locks["10"]["kalshi"], [0.45, 0.3, 0.25])
        later = datetime(2026, 11, 7, 15, 5, tzinfo=UTC)
        m2 = self.model()
        m2["generated_at"], m2["games"][0]["home_wp"] = "2026-11-07T15:00:00Z", 0.9
        self.assertEqual(T.lock(locks, m2, lines, later), 0)
        self.assertEqual(locks["10"]["model"][0], 0.5)

    def test_a_stale_model_file_is_not_locked(self):
        locks = {}
        self.assertEqual(T.lock(locks, self.model(), {}, datetime(2026, 11, 8, 12, tzinfo=UTC)), 0)

    def test_missing_kalshi_price_counts_for_the_model_only(self):
        locks = {}
        T.lock(locks, self.model(), {"games": [{"espn_id": "10", "fair": {"home": 0.5, "draw": None, "away": 0.2}}]}, self.now)
        self.assertIsNone(locks["10"]["kalshi"])

    def test_grades_from_the_lines_file_then_espn(self):
        locks = {}
        T.lock(locks, self.model(), {"games": [{"espn_id": "10", "fair": {"home": 0.45, "draw": 0.3, "away": 0.25}}]}, self.now)
        after = datetime(2026, 11, 7, 17, tzinfo=UTC)
        post = {"games": [{"espn_id": "10", "state": "post", "home_score": 1.0, "away_score": 1.0}]}
        self.assertEqual(T.grade(locks, post, after, fetch=lambda r, c: self.fail("no ESPN call needed")), 1)
        self.assertEqual(locks["10"]["result"], [1, 1])
        locks["10"]["result"] = None
        self.assertEqual(T.grade(locks, {}, datetime(2026, 11, 7, 16, tzinfo=UTC), fetch=lambda r, c: (2, 0)), 0)
        self.assertEqual(T.grade(locks, {}, datetime(2026, 11, 7, 19, tzinfo=UTC), fetch=lambda r, c: (2, 0)), 1)
        rec = T.record(locks, after)
        self.assertEqual(rec["devig"]["games"], 1)
        self.assertAlmostEqual(rec["devig"]["log_loss"], -math.log(0.5), places=4)
        self.assertEqual(rec["shared"]["kalshi"]["picked_right"], 1.0)

    def test_three_way_clip_and_rescale(self):
        p = T.three([1.0, 0.0, 0.0])
        self.assertAlmostEqual(sum(p), 1.0)
        self.assertAlmostEqual(p[1], 0.01 / 1.01)


if __name__ == "__main__":
    unittest.main()
