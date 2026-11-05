"""Soccer season markets in tools/soccer_futures.py: Kalshi's title, top-finish, relegation and award markets, each
team matched to ESPN's id from the tables file (2026-11-05).

    python3 -m unittest discover -s tests/tools
"""
import os
import sys
import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import soccer_futures as SF  # noqa: E402

TEAMS = [{"id": "160", "code": "PSG", "name": "PSG", "league": "LIGUE1"},
         {"id": "6851", "code": "PAR", "name": "Paris FC", "league": "LIGUE1"},
         {"id": "15", "code": "ASL", "name": "Atl. San Luis", "league": "LIGAMX"},
         {"id": "16", "code": "SAN", "name": "Santos", "league": "LIGAMX"}]


def mkt(t, sub, bid, ask):
    return {"ticker": t, "yes_sub_title": sub, "yes_bid_dollars": bid, "yes_ask_dollars": ask, "status": "active"}


class Futures(unittest.TestCase):
    def test_team_found_by_code_then_by_name(self):
        lg = [t for t in TEAMS if t["league"] == "LIGUE1"]
        self.assertEqual(SF.team_id("PSG", "PSG", lg), "160")
        self.assertEqual(SF.team_id("Paris", "PAR", lg), "6851")         # "Paris" alone fits both names: the code decides
        mx = [t for t in TEAMS if t["league"] == "LIGAMX"]
        self.assertEqual(SF.team_id("San Luis", "XXX", mx), "15")         # no code match: the only name it fits
        self.assertIsNone(SF.team_id("Nobody", "NOB", mx))

    def test_market_labels_and_order(self):
        ev = {"event_ticker": "KXLIGUE1TOP-27TOP4", "markets": [
            mkt("KXLIGUE1TOP-27TOP4-PAR", "Paris", "0.1000", "0.1400"),
            mkt("KXLIGUE1TOP-27TOP4-PSG", "PSG", "0.9200", "0.9800")]}
        m = SF.market("LIGUE1", "TOP", ev, TEAMS[:2])
        self.assertEqual((m["key"], m["label"], m["who"]), ("top4", "Top 4", "team"))
        self.assertEqual([r[0] for r in m["rows"]], ["160", "6851"])       # likeliest first
        apr = SF.label_of("LIGAMX", "TITLE", {"event_ticker": "KXLIGAMX-27APER"})
        self.assertEqual(apr[:2], ("apertura", "Wins the Apertura"))

    def test_player_season_goals_keep_the_count(self):
        ev = {"event_ticker": "KXEPLSEASONSTAT-27GOAL", "markets": [
            mkt("KXEPLSEASONSTAT-27GOAL-EHAALA9-25", "Erling Haaland: 25+", "0.6000", "0.6400"),
            mkt("KXEPLSEASONSTAT-27GOAL-EHAALA9-20", "Erling Haaland: 20+", "0.8000", "0.8400")]}
        m = SF.market("EPL", "SEASONSTAT", ev, [])
        self.assertEqual([(r[1], r[2]) for r in m["rows"]], [("Erling Haaland", 20), ("Erling Haaland", 25)])
        gb = SF.market("EPL", "LEADER", {"event_ticker": "KXEPLLEADER-27GOAL", "markets": [
            mkt("KXEPLLEADER-27GOAL-EHAALA9", "Erling Haaland", "0.5000", "0.7200")]}, [])
        self.assertEqual((gb["key"], gb["rows"][0][1]), ("goal", "Erling Haaland"))


if __name__ == "__main__":
    unittest.main()
