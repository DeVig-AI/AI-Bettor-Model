"""Soccer in tools/soccer_lines.py: Kalshi's three-way game markets (home, draw, away) matched to ESPN's schedule for
each league, with fair chances that add up to 1 (2026-11-04).

    python3 -m unittest discover -s tests/tools
"""
import os
import sys
import unittest
from datetime import datetime, timezone
from unittest import mock

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import soccer_lines as SL  # noqa: E402

NOW = datetime(2026, 11, 4, 12, 0, tzinfo=timezone.utc)


def mkt(t, sub, bid, ask, vol="100"):
    return {"ticker": t, "yes_sub_title": sub, "yes_bid_dollars": bid, "yes_ask_dollars": ask, "status": "active",
            "volume_fp": vol}


def event(et, title, home, away, draw):
    return {"event_ticker": et, "title": title, "markets": [mkt(*away), mkt(*draw), mkt(*home)]}


EV = event("KXEPLGAME-26NOV08EVECOV", "Everton vs Coventry",
           ("KXEPLGAME-26NOV08EVECOV-EVE", "Everton", "0.4900", "0.5100"),
           ("KXEPLGAME-26NOV08EVECOV-COV", "Coventry", "0.2300", "0.2500"),
           ("KXEPLGAME-26NOV08EVECOV-TIE", "Tie", "0.2600", "0.2800"))


def espn(home, away, hn, an, eid="740001", state="pre", hs=None, as_=None):
    return {"espn_id": eid, "kickoff": "2026-11-08T15:00Z", "state": state, "detail": "Scheduled", "date": "2026-11-08",
            "home": home, "away": away, "home_id": "368", "away_id": "388", "home_names": hn, "away_names": an,
            "home_name": hn[0], "away_name": an[0], "home_color": "#1b458f", "away_color": "#64b4e6",
            "home_score": hs, "away_score": as_}


class SoccerLines(unittest.TestCase):
    def test_event_reads_three_markets_home_first(self):
        k = SL.kalshi_event(EV)
        self.assertEqual(k["home"]["name"], "Everton")   # the title names the home side first
        self.assertEqual(k["away"]["name"], "Coventry")
        self.assertTrue(k["draw"]["ticker"].endswith("-TIE"))
        self.assertEqual(k["date"], "2026-11-08")

    def test_event_without_draw_is_skipped(self):
        ev = dict(EV, markets=[m for m in EV["markets"] if not m["ticker"].endswith("TIE")])
        self.assertIsNone(SL.kalshi_event(ev))

    def test_fair_adds_to_one(self):
        k = SL.kalshi_event(EV)
        f = SL.fair3(k["home"], k["draw"], k["away"])
        self.assertAlmostEqual(f["home"] + f["draw"] + f["away"], 1, places=3)
        self.assertGreater(f["home"], f["draw"])
        self.assertIsNone(SL.fair3(k["home"], {"bid": None, "ask": None}, k["away"]))

    def test_names_and_aliases(self):
        self.assertTrue(SL.same_team("Man City", ["Manchester City", "Man City"]))
        self.assertTrue(SL.same_team("FC København", ["FC Copenhagen", "Copenhagen"]))
        self.assertTrue(SL.same_team("D.C. United", ["DC United"]))
        self.assertFalse(SL.same_team("Manchester United", ["Manchester City", "Man City"]))

    def test_match_both_names_and_flipped(self):
        k = SL.kalshi_event(EV)
        g = espn("EVE", "COV", ["Everton"], ["Coventry City", "Coventry"])
        self.assertEqual(SL.match(k, [g]), (g, False))
        r = espn("COV", "EVE", ["Coventry City", "Coventry"], ["Everton"])
        self.assertEqual(SL.match(k, [r]), (r, True))
        self.assertEqual(SL.match(k, [espn("ARS", "CHE", ["Arsenal"], ["Chelsea"])]), (None, None))

    def test_league_games_writes_espn_codes_and_three_prices(self):
        g = espn("EVE", "COV", ["Everton"], ["Coventry City", "Coventry"])
        with mock.patch.object(SL.KG, "_events", return_value=[EV]), mock.patch.object(SL, "espn_day", return_value=[g]):
            games, unmatched = SL.league_games("EPL", NOW)
        self.assertEqual(unmatched, [])
        self.assertEqual(len(games), 1)
        x = games[0]
        self.assertEqual((x["sport"], x["home"], x["away"], x["espn_id"]), ("EPL", "EVE", "COV", "740001"))
        self.assertAlmostEqual(sum(x["fair"].values()), 1, places=3)
        self.assertEqual(x["tickers"]["draw"], "KXEPLGAME-26NOV08EVECOV-TIE")
        self.assertEqual(set(x["ml"]), {"home", "draw", "away"})

    def test_unmatched_is_listed_not_dropped_silently(self):
        with mock.patch.object(SL.KG, "_events", return_value=[EV]), mock.patch.object(SL, "espn_day", return_value=[]):
            games, unmatched = SL.league_games("EPL", NOW)
        self.assertEqual(games, [])
        self.assertEqual(unmatched[0]["event"], "KXEPLGAME-26NOV08EVECOV")

    def test_spread_total_btts_join_by_event_and_side(self):
        def strike(t, line, bid, ask):
            return dict(mkt(t, "", bid, ask), floor_strike=line)
        by = {
            "KXEPLGAME": [EV],
            "KXEPLSPREAD": [{"event_ticker": "KXEPLSPREAD-26NOV08EVECOV", "markets": [
                strike("KXEPLSPREAD-26NOV08EVECOV-EVE2", 1.5, "0.3000", "0.3200"),
                strike("KXEPLSPREAD-26NOV08EVECOV-COV2", 1.5, "0.0600", "0.0800")]}],
            "KXEPLTOTAL": [{"event_ticker": "KXEPLTOTAL-26NOV08EVECOV", "markets": [
                strike("KXEPLTOTAL-26NOV08EVECOV-3", 2.5, "0.5400", "0.5600"),
                strike("KXEPLTOTAL-26NOV08EVECOV-2", 1.5, "0.7800", "0.8000")]}],
            "KXEPLBTTS": [{"event_ticker": "KXEPLBTTS-26NOV08EVECOV", "markets": [
                mkt("KXEPLBTTS-26NOV08EVECOV-BTTS", "", "0.5500", "0.5700")]}],
        }
        g = espn("EVE", "COV", ["Everton"], ["Coventry City", "Coventry"])
        with mock.patch.object(SL.KG, "_events", side_effect=lambda s: by.get(s, [])), \
                mock.patch.object(SL, "espn_day", return_value=[g]):
            games, _ = SL.league_games("EPL", NOW)
        x = games[0]
        self.assertEqual([(s[0], s[1]) for s in x["spreads"]], [("away", 1.5), ("home", 1.5)])
        self.assertAlmostEqual(x["spreads"][1][2], 0.31)
        self.assertEqual([t[0] for t in x["totals"]], [1.5, 2.5])     # lowest line first
        self.assertAlmostEqual(x["btts"][0], 0.56)

    def test_more_markets_and_players_land_on_the_right_side(self):
        def strike(t, line, bid, ask, sub=""):
            return dict(mkt(t, sub, bid, ask), floor_strike=line)
        e = "26NOV08EVECOV"
        by = {
            "KXEPLGAME": [EV],
            "KXEPLSCORE": [{"event_ticker": f"KXEPLSCORE-{e}", "markets": [
                mkt(f"KXEPLSCORE-{e}-EVE2COV1", "Everton wins 2-1", "0.0900", "0.1100"),
                mkt(f"KXEPLSCORE-{e}-EVE0COV0", "Draw 0-0", "0.0400", "0.0600")]}],
            "KXEPL1H": [{"event_ticker": f"KXEPL1H-{e}", "markets": [
                mkt(f"KXEPL1H-{e}-EVE", "", "0.4200", "0.4400"), mkt(f"KXEPL1H-{e}-COV", "", "0.1900", "0.2000"),
                mkt(f"KXEPL1H-{e}-TIE", "", "0.3800", "0.4000")]}],
            "KXEPL1HTOTAL": [{"event_ticker": f"KXEPL1HTOTAL-{e}", "markets": [
                strike(f"KXEPL1HTOTAL-{e}-1", 0.5, "0.7200", "0.7400")]}],
            "KXEPLTEAMTOTAL": [{"event_ticker": f"KXEPLTEAMTOTAL-{e}", "markets": [
                strike(f"KXEPLTEAMTOTAL-{e}-COV1", 0.5, "0.6400", "0.6600")]}],
            "KXEPLFTTS": [{"event_ticker": f"KXEPLFTTS-{e}", "markets": [
                mkt(f"KXEPLFTTS-{e}-EVE", "", "0.5000", "0.5200"), mkt(f"KXEPLFTTS-{e}-NONE", "", "0.0700", "0.0900")]}],
            "KXEPLGOAL": [{"event_ticker": f"KXEPLGOAL-{e}", "markets": [
                strike(f"KXEPLGOAL-{e}-EVEBETO9-1", 0.5, "0.3800", "0.4000", "Beto: 1+"),
                strike(f"KXEPLGOAL-{e}-EVEBETO9-2", 1.5, "0.0800", "0.1000", "Beto: 2+"),
                strike(f"KXEPLGOAL-{e}-COVHWRIG9-1", 0.5, "0.2400", "0.2600", "Haji Wright: 1+")]}],
            "KXEPLFIRSTGOAL": [{"event_ticker": f"KXEPLFIRSTGOAL-{e}", "markets": [
                mkt(f"KXEPLFIRSTGOAL-{e}-EVEBETO9", "Beto", "0.1400", "0.1600"),
                mkt(f"KXEPLFIRSTGOAL-{e}-NOGOAL", "No goal", "0.0700", "0.0900")]}],
        }
        g = espn("EVE", "COV", ["Everton"], ["Coventry City", "Coventry"])
        with mock.patch.object(SL.KG, "_events", side_effect=lambda s: by.get(s, [])), \
                mock.patch.object(SL, "espn_day", return_value=[g]):
            games, _ = SL.league_games("EPL", NOW)
        m = games[0]["more"]
        self.assertEqual([s[:2] for s in m["scores"]], [[0, 0], [2, 1]])            # home goals first
        self.assertAlmostEqual(m["halves"]["1"]["win"]["draw"][0], 0.39)
        self.assertEqual(m["halves"]["1"]["totals"][0][0], 0.5)
        self.assertIsNone(m["halves"]["2"]["win"])                                  # no 2H market: nothing made up
        self.assertEqual(m["team_totals"][0][:2], ["away", 0.5])
        self.assertEqual([f[0] for f in m["first"]], ["home", "none"])
        goal = [p for p in m["players"] if p[2] == "goal"]
        self.assertEqual([(p[0], p[1], p[3]) for p in goal], [("home", "Beto", 1), ("away", "Haji Wright", 1), ("home", "Beto", 2)])
        self.assertEqual([(p[0], p[1]) for p in m["players"] if p[2] == "firstgoal"], [("home", "Beto")])

    def test_extras_missing_series_leaves_game_alone(self):
        g = espn("EVE", "COV", ["Everton"], ["Coventry City", "Coventry"])

        def events(s):
            if s == "KXEPLGAME":
                return [EV]
            raise RuntimeError("no series")
        with mock.patch.object(SL.KG, "_events", side_effect=events), mock.patch.object(SL, "espn_day", return_value=[g]):
            games, _ = SL.league_games("EPL", NOW)
        self.assertEqual(len(games), 1)
        self.assertEqual((games[0]["spreads"], games[0]["totals"], games[0]["btts"]), ([], [], None))


if __name__ == "__main__":
    unittest.main()
