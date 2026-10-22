"""NHL and WNBA in tools/game_lines.py: Kalshi's games matched to ESPN's scoreboard (start time, ESPN id, team
colours), the NHL main spread at the 1.5 puck line. Answers shaped like the real ones (tickers from the 2026-10-21
coverage probe).

    python3 -m unittest discover -s tests/tools
"""
import json
import os
import sys
import tempfile
import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import game_lines as GL  # noqa: E402


def mkt(t, sub, bid, ask, strike=None):
    return {"ticker": t, "yes_sub_title": sub, "yes_bid_dollars": bid, "yes_ask_dollars": ask, "status": "active",
            "floor_strike": strike, "strike_type": "greater" if strike is not None else None}


EVENTS = {
    "KXNHLGAME": [{"event_ticker": "KXNHLGAME-26OCT20SJMTL", "markets": [
        mkt("KXNHLGAME-26OCT20SJMTL-MTL", "Montreal", "0.6100", "0.6200"),
        mkt("KXNHLGAME-26OCT20SJMTL-SJ", "San Jose", "0.3800", "0.3900")]}],
    "KXNHLSPREAD": [{"event_ticker": "KXNHLSPREAD-26OCT20SJMTL", "markets": [
        mkt("KXNHLSPREAD-26OCT20SJMTL-MTL2", "Montreal wins by over 1.5 goals", "0.3400", "0.3600", 1.5),
        mkt("KXNHLSPREAD-26OCT20SJMTL-MTL3", "Montreal wins by over 2.5 goals", "0.1900", "0.2100", 2.5)]}],
    "KXNHLTOTAL": [{"event_ticker": "KXNHLTOTAL-26OCT20SJMTL", "markets": [
        mkt("KXNHLTOTAL-26OCT20SJMTL-6", "Over 5.5 goals", "0.5000", "0.5200", 5.5)]}],
    "KXWNBAGAME": [{"event_ticker": "KXWNBAGAME-26OCT22GSATL", "markets": [
        mkt("KXWNBAGAME-26OCT22GSATL-ATL", "Atlanta", "0.5500", "0.5600"),
        mkt("KXWNBAGAME-26OCT22GSATL-GS", "Golden State", "0.4400", "0.4500")]}],
}


def team(abbr, name, color):
    return {"abbreviation": abbr, "displayName": name, "location": name.split()[0], "color": color}


ESPN = {
    "hockey/nhl": {"20261020": [("401", "2026-10-20T23:00Z", team("SJ", "San Jose Sharks", "00788c"),
                                 team("MTL", "Montreal Canadiens", "af1e2d"))]},
    "basketball/wnba": {"20261022": [("501", "2026-10-23T00:00Z", team("GS", "Golden State Valkyries", "b38fcf"),
                                      team("ATL", "Atlanta Dream", "e31837"))]},
}


def fake_get(url, params=None, **kw):
    if "espn" in url:
        for path, days in ESPN.items():
            if path + "/" in url:
                return {"events": [{"id": i, "date": k, "status": {"type": {"state": "pre"}},
                                    "competitions": [{"competitors": [{"homeAway": "away", "team": a},
                                                                      {"homeAway": "home", "team": h}]}]}
                                   for i, k, a, h in days.get((params or {}).get("dates"), [])]}
        return {"events": []}
    return {"events": EVENTS.get((params or {}).get("series_ticker"), []), "cursor": None}


class NHLWNBALines(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.mkdtemp()
        GL.OUT, GL.CFB_HISTORY = os.path.join(tmp, "game_lines.json"), os.path.join(tmp, "cfb_history.json")
        GL.KG.get = fake_get
        GL.KG._sb.clear()
        GL.KG.log.clear()

    def test_nhl_and_wnba_games(self):
        GL.main()
        with open(GL.OUT) as f:
            games = {(g["sport"], g["away"], g["home"]): g for g in json.load(f)["games"]}
        nhl = games[("NHL", "SJ", "MTL")]
        self.assertEqual((nhl["kickoff"], nhl["espn_id"]), ("2026-10-20T23:00Z", "401"))
        self.assertEqual(nhl["colors"], {"away": "#00788c", "home": "#af1e2d"})
        self.assertEqual(nhl["home_ticker"], "KXNHLGAME-26OCT20SJMTL-MTL")
        self.assertEqual(nhl["spread"]["home_point"], -1.5)              # the puck line, not the line nearest 50-50
        self.assertEqual(nhl["total"]["line"], 5.5)
        wnba = games[("WNBA", "GS", "ATL")]
        self.assertEqual((wnba["kickoff"], wnba["espn_id"]), ("2026-10-23T00:00Z", "501"))
        self.assertEqual(wnba["colors"]["home"], "#e31837")


if __name__ == "__main__":
    unittest.main()
