"""The History tab's NHL and WNBA games (live/market_history.json): tools/game_lines.py keeps Kalshi's last numbers
before the start and ESPN's final; tools/market_history_backfill.py fills earlier games from ESPN's finished games and
the settled Kalshi market's last candle before the start. Answers shaped like the real ones.

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
import game_lines as GL  # noqa: E402
import market_history_backfill as MB  # noqa: E402

KO = "2026-10-20T23:00Z"


def board_game(**kw):
    g = {"sport": "NHL", "espn_id": "401", "kickoff": KO, "away": "SJ", "home": "MTL", "home_wp": 0.615,
         "ml": {"home": -170.0, "away": 150.0}, "spread": {"home_point": -1.5, "home": 180.0, "away": -220.0},
         "total": {"line": 5.5, "over": -105.0, "under": -115.0}, "colors": {"away": "#00788c", "home": "#af1e2d"}}
    g.update(kw)
    return g


def scoreboard(state, away=2, home=4, eid="401"):
    return {"events": [{"id": eid, "date": KO, "status": {"type": {"state": state}},
                        "competitions": [{"competitors": [
                            {"homeAway": "away", "score": str(away), "team": {"abbreviation": "SJ", "displayName": "San Jose Sharks",
                                                                             "location": "San Jose", "color": "00788c"}},
                            {"homeAway": "home", "score": str(home), "team": {"abbreviation": "MTL", "displayName": "Montreal Canadiens",
                                                                             "location": "Montreal", "color": "af1e2d"}}]}]}]}


class Patched(unittest.TestCase):
    """Puts back what a test replaces (the shared Kalshi/ESPN getter, the file path, the clock)."""
    def setUp(self):
        self._saved = (GL.KG.get, GL.MARKET_HISTORY, MB.datetime)

    def tearDown(self):
        GL.KG.get, GL.MARKET_HISTORY, MB.datetime = self._saved


class Recorder(Patched):
    def setUp(self):
        super().setUp()
        self.d = tempfile.mkdtemp()
        GL.MARKET_HISTORY = os.path.join(self.d, "market_history.json")
        self.calls = []
        self.state = "pre"
        GL.KG.get = lambda url, params=None, **kw: (self.calls.append((url, params)), scoreboard(self.state))[1]

    def read(self):
        with open(GL.MARKET_HISTORY) as f:
            return json.load(f)["games"]

    def test_pre_then_final(self):
        before = datetime(2026, 10, 20, 22, 0, tzinfo=timezone.utc)
        GL.update_market_history(before, [board_game(), board_game(sport="NBA", espn_id="9")])
        h = self.read()
        self.assertEqual(list(h), ["NHL:401"], "only NHL and WNBA are kept")
        self.assertEqual(h["NHL:401"]["pre"]["home_wp"], 0.615)
        self.assertEqual(h["NHL:401"]["date"], "2026-10-20", "the US date of the game")
        self.assertEqual(self.calls, [], "no scoreboard is read before the game")
        after = datetime(2026, 10, 21, 3, 0, tzinfo=timezone.utc)
        self.state = "post"
        GL.update_market_history(after, [board_game(home_wp=0.99)])       # prices after the start never replace pre
        h = self.read()["NHL:401"]
        self.assertEqual((h["pre"]["home_wp"], h["final"]), (0.615, {"away": 2, "home": 4}))
        self.assertIn("hockey/nhl", self.calls[0][0])
        GL.update_market_history(datetime(2026, 10, 21, 4, 0, tzinfo=timezone.utc), [])
        self.assertEqual(len(self.calls), 1, "a game with its final is not looked up again")

    def test_old_games_drop_off(self):
        GL.update_market_history(datetime(2026, 10, 20, 22, 0, tzinfo=timezone.utc), [board_game()])
        GL.update_market_history(datetime(2027, 6, 1, tzinfo=timezone.utc), [])
        self.assertEqual(self.read(), {})


class Backfill(Patched):
    def test_finished_game_with_kalshi_chance(self):
        d = tempfile.mkdtemp()
        GL.MARKET_HISTORY = os.path.join(d, "market_history.json")
        ko = int(datetime(2026, 10, 20, 23, 0, tzinfo=timezone.utc).timestamp())
        ev = {"event_ticker": "KXNHLGAME-26OCT20SJMTL", "markets": [
            {"ticker": "KXNHLGAME-26OCT20SJMTL-MTL", "yes_sub_title": "Montreal"},
            {"ticker": "KXNHLGAME-26OCT20SJMTL-SJ", "yes_sub_title": "San Jose"}]}
        candles = {"candlesticks": [
            {"end_period_ts": ko - 3600, "yes_bid": {"close_dollars": "0.6000"}, "yes_ask": {"close_dollars": "0.6200"}},
            {"end_period_ts": ko, "yes_bid": {"close_dollars": "0.6300"}, "yes_ask": {"close_dollars": "0.6500"}},
            {"end_period_ts": ko + 3600, "yes_bid": {"close_dollars": "0.9000"}, "yes_ask": {"close_dollars": "0.9200"}}]}
        seen = []

        def get(url, params=None, **kw):
            seen.append(url)
            if "espn" in url:
                return scoreboard("post") if (params or {}).get("dates") == "20261020" else {"events": []}
            if url.endswith("/events"):
                return {"events": [ev], "cursor": None}
            if "KXNHLGAME-26OCT20SJMTL-MTL/candlesticks" in url:
                return candles
            return None
        MB.KG.get = get
        MB.datetime = type("D", (datetime,), {"now": staticmethod(lambda tz=None: datetime(2026, 10, 21, 12, tzinfo=timezone.utc))})
        MB.main(["--sport", "NHL", "--since", "2026-10-19"])
        with open(GL.MARKET_HISTORY) as f:
            h = json.load(f)["games"]
        g = h["NHL:401"]
        self.assertEqual((g["away"], g["home"], g["final"]), ("SJ", "MTL", {"away": 2, "home": 4}))
        self.assertEqual(g["pre"]["home_wp"], 0.64, "the last candle at or before the start, home team's market")
        self.assertTrue(g["backfill"])
        MB.main(["--sport", "NHL", "--since", "2026-10-19"])               # a second run changes nothing
        with open(GL.MARKET_HISTORY) as f:
            self.assertEqual(json.load(f)["games"], h)


if __name__ == "__main__":
    unittest.main()
