"""tools/live_lines.py: NBA, MLB and college football scores and win-chance lines, with ESPN and Kalshi answers
shaped like the real ones.

    python3 -m unittest discover -s tests/tools
"""
import io
import json
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest import mock
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import live_lines as LL  # noqa: E402

KICK = datetime(2026, 10, 20, 23, 0, tzinfo=timezone.utc)
LINES = {"games": [
    {"sport": "MLB", "away": "CLE", "home": "TB", "kickoff": "2026-10-20T23:00Z", "espn_id": "401",
     "home_ticker": "KXMLBGAME-26OCT201900CLETB-TB", "ml": {"home": -125, "away": 108}},
    {"sport": "CFB", "away": "MOST", "home": "DEL", "kickoff": "2026-10-20T23:00Z", "espn_id": "501",
     "home_ticker": "KXNCAAFGAME-26OCT20MOSUDEL-DEL", "ml": {"home": -140, "away": 120}},
    {"sport": "NBA", "away": "BOS", "home": "NYK", "kickoff": "2026-10-28T23:30Z", "espn_id": "601",
     "home_ticker": "KXNBAGAME-26OCT28BOSNYK-NYK", "ml": {"home": -110, "away": -105}},
    {"sport": "NFL", "away": "HOU", "home": "JAX", "kickoff": "2026-10-20T23:00Z", "espn_id": "701",
     "home_ticker": "KXNFLGAME-26OCT20HOUJAX-JAX"},
]}


def espn(state, away, home, eid):
    return {"id": eid, "date": "2026-10-20T23:00Z", "status": {"type": {"state": state, "shortDetail": "Top 6th" if state == "in" else "Final"}},
            "competitions": [{"competitors": [{"homeAway": "home", "score": str(home)}, {"homeAway": "away", "score": str(away)}]}]}


def candles(n, start):
    return {"candlesticks": [{"end_period_ts": int(start.timestamp()) + 60 * i,
                              "yes_bid": {"close_dollars": "0.5400"}, "yes_ask": {"close_dollars": "0.5600"}} for i in range(n)]}


class LiveLines(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        LL.LINES, LL.OUT = os.path.join(self.tmp, "game_lines.json"), os.path.join(self.tmp, "live_lines.json")
        with open(LL.LINES, "w") as f:
            json.dump(LINES, f)
        self.state, self.calls, self.moved = "in", [], False
        LL.KG.get = self.fake_get
        LL.KG.log.clear()

    def fake_get(self, url, params=None, **kw):
        self.calls.append(url)
        if "espn" in url:
            if "college-football" in url:
                self.assertEqual(params["groups"], 80)
                return {"events": [espn(self.state, 14, 21, "501")]}
            return {"events": [espn(self.state, 2, 3, "401")]} if "baseball" in url else {"events": []}
        self.assertIn("/candlesticks", url)
        self.assertEqual(params["start_ts"], int((KICK - timedelta(hours=2)).timestamp()))
        if self.moved and "/historical/" not in url:           # Kalshi moved the settled market
            return {"candlesticks": []}
        return candles(400, KICK - timedelta(hours=2))

    def run_at(self, t):
        self.calls = []
        LL.main(now=t)
        with open(LL.OUT) as f:
            return {(g["sport"], g["espn_id"]): g for g in json.load(f)["games"]}

    def test_live_then_final_keeps_the_line(self):
        g = self.run_at(KICK + timedelta(minutes=70))
        mlb = g[("MLB", "401")]
        self.assertEqual((mlb["state"], mlb["away_score"], mlb["home_score"]), ("in", 2, 3))
        self.assertEqual(mlb["kalshi_line"]["team"], "TB")
        self.assertEqual(len(mlb["kalshi_line"]["points"]), 150)               # thinned like the NFL file
        self.assertEqual(mlb["kalshi_line"]["points"][0][1], 0.55)             # bid/ask midpoint
        self.assertEqual(set(mlb["kalshi_game"]["moneyline"]), {"home", "away"})
        self.assertTrue(any("KXMLBGAME/markets" in u for u in self.calls))
        self.assertTrue(any("KXNCAAFGAME/markets" in u for u in self.calls))
        self.assertIsNotNone(g[("CFB", "501")]["kalshi_line"])
        self.assertNotIn(("NFL", "701"), g)                                    # the NFL bot does the NFL
        self.assertNotIn(("NBA", "601"), g)                                    # more than a day ahead

        with open(LL.LINES, "w") as f:                                          # Kalshi closed the market
            json.dump({"games": []}, f)
        self.state = "post"
        g = self.run_at(KICK + timedelta(hours=3, minutes=30))
        mlb = g[("MLB", "401")]
        self.assertEqual(mlb["state"], "post")
        self.assertTrue(mlb["line_final"])
        self.assertIsNone(mlb["kalshi_game"])
        self.assertEqual(len(mlb["kalshi_line"]["points"]), 150)

        g = self.run_at(KICK + timedelta(hours=4))                              # nothing left to do
        self.assertEqual(self.calls, [])
        self.assertEqual(len(g[("MLB", "401")]["kalshi_line"]["points"]), 150)

        g = self.run_at(KICK + timedelta(days=LL.KEEP_DAYS, hours=1))         # old games drop off
        self.assertEqual(g, {})

    def test_never_steps_back_from_a_final(self):
        self.state = "post"
        self.run_at(KICK + timedelta(hours=3))
        self.state = "in"                                                       # a stale ESPN answer
        g = self.run_at(KICK + timedelta(hours=3, minutes=5))
        self.assertEqual(g[("MLB", "401")]["state"], "post")

    def test_outside_game_windows_nothing_runs(self):
        self.run_at(KICK - timedelta(hours=3))                                  # first run writes the file
        self.assertEqual(self.calls, [])
        g = self.run_at(KICK - timedelta(hours=2))
        self.assertEqual(self.calls, [])
        self.assertEqual(g[("MLB", "401")]["kalshi_game"]["moneyline"], {"home": -125, "away": 108})

    def test_a_game_left_live_gets_its_final_however_late(self):
        self.run_at(KICK + timedelta(minutes=70))                            # seen live...
        self.state, self.moved = "post", True                                # ...then no run for hours
        g = self.run_at(KICK + timedelta(hours=18))
        mlb = g[("MLB", "401")]
        self.assertEqual((mlb["state"], mlb["line_final"]), ("post", True))
        self.assertTrue(any("/historical/markets/" in u for u in self.calls))
        self.assertEqual(len(mlb["kalshi_line"]["points"]), 150)

    def test_unchanged_file_is_not_rewritten_and_loop_hint(self):
        out = io.StringIO()
        with redirect_stdout(out):
            self.run_at(KICK - timedelta(hours=3))
        self.assertEqual(json.loads(out.getvalue().splitlines()[-1]),
                         {"working": 0, "next_s": int(timedelta(hours=2, minutes=30).total_seconds()), "wrote": True})
        before = os.stat(LL.OUT).st_mtime_ns
        out = io.StringIO()
        with redirect_stdout(out), mock.patch.dict(os.environ, {"FORCE": "1"}):
            self.run_at(KICK - timedelta(hours=2, minutes=59))               # nothing new: no write, no commit
        self.assertFalse(json.loads(out.getvalue().splitlines()[-1])["wrote"])
        self.assertEqual(os.stat(LL.OUT).st_mtime_ns, before)


if __name__ == "__main__":
    unittest.main()
