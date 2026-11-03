"""Men's college basketball (sport "CBB") in tools/game_lines.py: Kalshi's KXNCAAMB games matched to ESPN's Division I
scoreboard by team names, written in ESPN's codes (2026-11-03).

    python3 -m unittest discover -s tests/tools
"""
import os
import sys
import unittest
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import cfb_teams  # noqa: E402
import game_lines as GL  # noqa: E402

NOW = datetime(2026, 11, 3, 12, 0, tzinfo=timezone.utc)


def mkt(t, sub, bid, ask, strike=None):
    return {"ticker": t, "yes_sub_title": sub, "yes_bid_dollars": bid, "yes_ask_dollars": ask, "status": "active",
            "floor_strike": strike, "strike_type": "greater" if strike is not None else None}


EVENTS = {
    "KXNCAAMBGAME": [{"event_ticker": "KXNCAAMBGAME-26NOV03UNOLSU", "markets": [
        mkt("KXNCAAMBGAME-26NOV03UNOLSU-LSU", "LSU", "0.9300", "0.9400"),
        mkt("KXNCAAMBGAME-26NOV03UNOLSU-UNO", "New Orleans", "0.0600", "0.0700")]}],
    "KXNCAAMBSPREAD": [{"event_ticker": "KXNCAAMBSPREAD-26NOV03UNOLSU", "markets": [
        mkt("KXNCAAMBSPREAD-26NOV03UNOLSU-LSU19", "LSU wins by over 18.5 points", "0.4800", "0.5100", 18.5)]}],
    "KXNCAAMBTOTAL": [{"event_ticker": "KXNCAAMBTOTAL-26NOV03UNOLSU", "markets": [
        mkt("KXNCAAMBTOTAL-26NOV03UNOLSU-148", "Over 147.5 points", "0.4900", "0.5200", 147.5)]}],
}
ESPN = {"events": [{"id": "401907001", "date": "2026-11-04T00:00Z", "status": {"type": {"state": "pre", "shortDetail": "7:00 PM"}},
                    "competitions": [{"neutralSite": False, "competitors": [
                        {"homeAway": "home", "score": "0", "curatedRank": {"current": 99},
                         "team": {"id": "99", "abbreviation": "LSU", "location": "LSU", "shortDisplayName": "LSU",
                                  "displayName": "LSU Tigers", "color": "461d7c"}},
                        {"homeAway": "away", "score": "0", "curatedRank": {"current": 99},
                         "team": {"id": "2443", "abbreviation": "UNO", "location": "LSU New Orleans",
                                  "shortDisplayName": "LSU N Orleans", "displayName": "LSU New Orleans Privateers"}}]}]}]}


class CBBLines(unittest.TestCase):
    def setUp(self):
        self.asked = []

        def fake_get(url, params=None, **kw):
            if "espn" in url:
                self.asked.append((url, dict(params or {})))
                return ESPN
            return {"events": EVENTS.get(params["series_ticker"], []), "cursor": None}
        GL.KG.get = fake_get
        GL.KG.log.clear()

    def test_match_and_shape(self):
        rows, _ = GL.college_games("CBB", NOW)
        self.assertEqual(len(rows), 1)
        g = rows[0]
        self.assertEqual(g["sport"], "CBB")
        self.assertEqual((g["away"], g["home"]), ("UNO", "LSU"))
        self.assertEqual(g["names"], {"away": "LSU New Orleans", "home": "LSU"})
        self.assertEqual(g["home_ticker"], "KXNCAAMBGAME-26NOV03UNOLSU-LSU")
        self.assertEqual(g["rank"], {"away": None, "home": None})            # 99 = unranked
        self.assertAlmostEqual(g["home_wp"], 0.935, places=3)
        self.assertEqual(g["spread"]["home_point"], -18.5)
        self.assertEqual(g["total"]["line"], 147.5)
        self.assertEqual(GL.UNMATCHED["CBB"], [])

    def test_reads_division_one_scoreboard_day_by_day(self):
        GL.college_games("CBB", NOW)
        c = GL.COLLEGE["CBB"]
        self.assertEqual(len(self.asked), c["back"] + c["ahead"] + 1)
        self.assertTrue(all("basketball/mens-college-basketball/scoreboard" in u for u, _ in self.asked))
        self.assertTrue(all(p["groups"] == 50 for _, p in self.asked))

    def test_unmatched_is_listed(self):
        EVENTS["KXNCAAMBGAME"].append({"event_ticker": "KXNCAAMBGAME-26NOV03ABCXYZ", "markets": [
            mkt("KXNCAAMBGAME-26NOV03ABCXYZ-XYZ", "Nowhere St.", "0.5", "0.6"),
            mkt("KXNCAAMBGAME-26NOV03ABCXYZ-ABC", "Elsewhere", "0.4", "0.5")]})
        try:
            GL.college_games("CBB", NOW)
        finally:
            EVENTS["KXNCAAMBGAME"].pop()
        self.assertEqual([u["why"] for u in GL.UNMATCHED["CBB"]], ["no Division I match"])
        self.assertTrue(any(x.startswith("CBB: 1 Kalshi games not matched") for x in GL.KG.log))


class Names(unittest.TestCase):
    def test_kalshi_and_espn_spellings_agree(self):
        for kalshi, espn in [("New Orleans", "LSU New Orleans"), ("Southeastern Louisiana", "SE Louisiana"),
                             ("LIU", "Long Island University"), ("University at Albany", "UAlbany"),
                             ("Central Connecticut St.", "Central Connecticut"), ("USC Upstate", "South Carolina Upstate"),
                             ("Nicholls St.", "Nicholls"), ("Southern University", "Southern")]:
            self.assertTrue(cfb_teams.same_team(kalshi, espn), kalshi)
        self.assertFalse(cfb_teams.same_team("USC Upstate", "USC"))        # not Southern California
        self.assertFalse(cfb_teams.same_team("LSU New Orleans", "LSU"))


if __name__ == "__main__":
    unittest.main()
