"""College football in tools/game_lines.py, with Kalshi and ESPN answers shaped like the real ones (2026-10-19).

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

NOW = datetime(2026, 10, 20, 12, 0, tzinfo=timezone.utc)


def mkt(t, sub, bid, ask, strike=None):
    return {"ticker": t, "yes_sub_title": sub, "yes_bid_dollars": bid, "yes_ask_dollars": ask, "status": "active",
            "floor_strike": strike, "strike_type": "greater" if strike is not None else None}


EVENTS = {
    "KXNCAAFGAME": [{"event_ticker": "KXNCAAFGAME-26OCT20MOSUDEL", "markets": [
        mkt("KXNCAAFGAME-26OCT20MOSUDEL-DEL", "Delaware", "0.5800", "0.5900"),
        mkt("KXNCAAFGAME-26OCT20MOSUDEL-MOSU", "Missouri St.", "0.4100", "0.4200")]},
        {"event_ticker": "KXNCAAFGAME-26OCT20ABCXYZ", "markets": [
            mkt("KXNCAAFGAME-26OCT20ABCXYZ-XYZ", "Some FCS U", "0.5", "0.6"),
            mkt("KXNCAAFGAME-26OCT20ABCXYZ-ABC", "Other FCS", "0.4", "0.5")]}],
    "KXNCAAFSPREAD": [{"event_ticker": "KXNCAAFSPREAD-26OCT20MOSUDEL", "markets": [
        mkt("KXNCAAFSPREAD-26OCT20MOSUDEL-DEL2", "Delaware wins by over 1.5 points", "0.4800", "0.5100", 1.5),
        mkt("KXNCAAFSPREAD-26OCT20MOSUDEL-DEL5", "Delaware wins by over 4.5 points", "0.3000", "0.3300", 4.5)]}],
    "KXNCAAFTOTAL": [{"event_ticker": "KXNCAAFTOTAL-26OCT20MOSUDEL", "markets": [
        mkt("KXNCAAFTOTAL-26OCT20MOSUDEL-52", "Over 51.5 points", "0.4900", "0.5200", 51.5)]}],
}
ESPN = {"events": [{"id": "401", "date": "2026-10-20T23:00Z", "status": {"type": {"state": "pre", "shortDetail": "7:00 PM"}},
                    "competitions": [{"neutralSite": False, "competitors": [
                        {"homeAway": "home", "score": "0", "curatedRank": {"current": 99},
                         "team": {"id": "48", "abbreviation": "DEL", "location": "Delaware", "shortDisplayName": "Delaware",
                                  "displayName": "Delaware Blue Hens", "color": "00539f"}},
                        {"homeAway": "away", "score": "0", "curatedRank": {"current": 24},
                         "team": {"id": "2623", "abbreviation": "MOST", "location": "Missouri State",
                                  "shortDisplayName": "Missouri St", "displayName": "Missouri State Bears"}}]}]}]}


def fake_get(url, params=None, **kw):
    if "espn" in url:
        return ESPN
    return {"events": EVENTS.get(params["series_ticker"], []), "cursor": None}


class CFBLines(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        GL.CFB_HISTORY = os.path.join(self.tmp, "cfb_history.json")
        GL.KG.get = fake_get
        GL.KG.log.clear()

    def test_match_and_shape(self):
        cfb, espn = GL.cfb_games(NOW)
        self.assertEqual(len(cfb), 1)
        g = cfb[0]
        self.assertEqual((g["away"], g["home"]), ("MOST", "DEL"))        # ESPN codes, not Kalshi's MOSU
        self.assertEqual(g["home_ticker"], "KXNCAAFGAME-26OCT20MOSUDEL-DEL")
        self.assertEqual(g["ids"], {"away": "2623", "home": "48"})
        self.assertEqual(g["rank"], {"away": 24, "home": None})
        self.assertAlmostEqual(g["home_wp"], 0.585, places=3)
        self.assertEqual(g["spread"]["home_point"], -1.5)
        self.assertEqual(g["total"]["line"], 51.5)
        self.assertIn("DEL", g["spreads"])
        self.assertIn("MOST", g["spreads"])
        self.assertTrue(any("1 Kalshi games with no FBS match" in x for x in GL.KG.log))

    def test_history_pre_then_final(self):
        cfb, espn = GL.cfb_games(NOW)
        GL.update_history(NOW, cfb, espn)
        h = json.load(open(GL.CFB_HISTORY))["games"]["401"]
        self.assertAlmostEqual(h["pre"]["home_wp"], 0.585, places=3)
        self.assertNotIn("final", h)
        late = datetime(2026, 10, 21, 3, 0, tzinfo=timezone.utc)          # after kickoff: prices move, pre stays
        cfb[0]["home_wp"] = 0.99
        espn["401"].update(state="post", home_score=31.0, away_score=24.0)
        GL.update_history(late, cfb, espn)
        h = json.load(open(GL.CFB_HISTORY))["games"]["401"]
        self.assertAlmostEqual(h["pre"]["home_wp"], 0.585, places=3)
        self.assertEqual(h["final"], {"away": 24.0, "home": 31.0})


if __name__ == "__main__":
    unittest.main()


class CFBModels(unittest.TestCase):
    """The Models page's CFB readers on files shaped like the two open repos' (2026-10-19)."""

    def setUp(self):
        import models_compare as MC
        self.MC = MC
        ko = datetime(2026, 10, 24, 16, 0, tzinfo=timezone.utc)
        self.up = [{"sport": "CFB", "game_id": "401", "kickoff": ko, "date": "2026-10-24", "home": "MIA", "away": "PITT",
                    "home_names": ["Miami", "Miami", "Miami Hurricanes"], "away_names": ["Pittsburgh", "Pitt"], "neutral": False}]
        files = {MC.CFBELO_URL: "as_of_date,game_id,p_home,model_home_spread,prediction_timestamp\n"
                                "2026-10-17,401,0.70,-6.0,2026-10-17T07:00:00-05:00\n"
                                "2026-10-18,401,0.75,-7.0,2026-10-18T07:00:00-05:00\n"
                                "2026-10-25,401,0.99,-30.0,2026-10-25T07:00:00-05:00\n",
                 MC.CFBRANK_URL: "season,week,team,rating,rank\n2026,6,Miami,1700,1\n2026,6,Pittsburgh,1500,40\n"
                                 "2026,7,Miami,1735,1\n2026,7,Pittsburgh,1500,40\n2025,15,Miami,1,1\n"}
        MC.fetch = lambda url: files[url]

    def test_cfbelo_last_before_kickoff(self):
        p = self.MC.read_cfbelo(self.up)["401"]
        self.assertEqual((p["home_wp"], p["home_line"]), (0.75, -7.0))      # the post-kickoff row is ignored

    def test_cfbrank_formula(self):
        p = self.MC.read_cfbrank(self.up, 2026)["401"]
        self.assertAlmostEqual(p["home_wp"], 1 / (1 + 10 ** (-(235 + 65) / 400)), places=9)   # latest week, +65 home
