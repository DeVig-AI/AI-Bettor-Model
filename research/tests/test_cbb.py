"""Research Lab tests for men's college basketball (Constitution Part E), on SYNTHETIC data only.

    python3 -m unittest discover -s research/tests -t .
"""
import json
import os
import shutil
import sys
import tempfile
import unittest

import numpy as np
import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, ROOT)
from research.lab import cbb_data as CB     # noqa: E402
from research.lab import config as C        # noqa: E402
from research.lab import lab as L           # noqa: E402
from research.lab import models             # noqa: E402
from research.lab.data import SealedDataError   # noqa: E402

TEAMS = [str(100 + i) for i in range(24)]
SMALL = "999"                                    # a non-Division-I school: a few games a season


def american(p):
    return round(-100 * p / (1 - p)) if p >= 0.5 else round(100 * (1 - p) / p)


def synthetic(first=2015, last=2025, seed=11):
    """(games, odds) in the cache files' columns, for a fake league with known strengths (points)."""
    rng = np.random.default_rng(seed)
    strength = {t: rng.normal(0, 6) for t in TEAMS}
    strength[SMALL] = -25.0
    games, odds, gid = [], [], 1
    for s in range(first, last + 1):
        day = pd.Timestamp(f"{s - 1}-11-08 19:00", tz="America/New_York")
        for k in range(22):
            order = rng.permutation(TEAMS)
            for i in range(0, len(order), 2):
                h, a = str(order[i]), str(order[i + 1])
                if k < 2 and i == 0:
                    a = SMALL                    # the small school visits twice a season
                neutral = k >= 20
                hfa = 0 if neutral else 3.0
                m = strength[h] - strength[a] + hfa + rng.normal(0, 10)
                if abs(m) < 0.5:
                    m = 1.0
                hs = 70 + round(m / 2)
                as_ = hs - round(m) if round(m) != 0 else hs - 1
                games.append({"game_id": str(gid), "season": s, "season_type": "post" if k >= 20 else "regular",
                              "start": (day + pd.Timedelta(minutes=30 * i)).tz_convert("UTC").isoformat(),
                              "neutral": neutral, "home_id": h, "away_id": a, "home_score": float(hs),
                              "away_score": float(as_), "completed": True})
                p = 1 / (1 + np.exp(-(strength[h] - strength[a] + hfa) / 6.5))
                p = min(0.97, max(0.03, p))
                for prov, vig in (("Book A", 1.04), ("Book B", 1.05), ("teamrankings", 1.0)):
                    odds.append({"game_id": str(gid), "season": s, "provider": prov,
                                 "home_ml": american(min(0.97, p * vig)), "away_ml": american(min(0.97, (1 - p) * vig))})
                gid += 1
            day += pd.Timedelta(days=4)
    return pd.DataFrame(games, columns=CB.GAMES_FILE_COLS), pd.DataFrame(odds, columns=CB.ODDS_FILE_COLS)


ELO = {"mean": 1505, "playoff_mult": 1.0, "bye_rest_days": 13, "hfa_seasons": 3, "qb": "none", "qb_alpha": 0.1,
       "qb_elo_per_value": 3.3, "qb_new_below_avg": 10, "nfelo_log_base": 10, "bye_elo": 0,
       "travel_elo_per_1000mi": 0, "market_resist": 0.0, "revert_center": "none", "elo_per_point": 28, "k": 20,
       "hfa_elo": 75, "revert": 0.3333, "mov": "none", "hfa_mode": "fixed", "market_blend": 0.0, "prob": "elo"}


class Reduce(unittest.TestCase):
    def test_event_fields(self):
        e = {"id": 7, "date": "2019-01-15T00:00Z", "season": {"year": 2019, "type": 3},
             "competitions": [{"startDate": "2019-01-15T00:00Z", "neutralSite": True, "attendance": 9000,
                               "status": {"type": {"completed": True}},
                               "competitors": [{"homeAway": "home", "score": "71", "team": {"id": "1"}, "records": []},
                                               {"homeAway": "away", "score": "65", "team": {"id": "2"}}]}]}
        r = CB.reduce_event(e, 2019)
        self.assertEqual(set(r), set(CB.GAMES_FILE_COLS), "only E1's fields are kept")
        self.assertEqual((r["game_id"], r["season_type"], r["neutral"], r["home_score"]), ("7", "post", True, 71.0))
        self.assertIsNone(CB.reduce_event(e, 2020), "another season's event is not this season's")

    def test_books_only(self):
        body = {"items": [{"provider": {"name": n}, "homeTeamOdds": {"moneyLine": -150}, "awayTeamOdds": {"moneyLine": 130},
                           "spread": -3.5, "overUnder": 140.5}
                          for n in ("ESPN BET", "teamrankings", "numberfire", "Accuscore", "Opening", "ESPN BET - Live Odds")]}
        rows = CB.reduce_odds(body, 7, 2019)
        self.assertEqual([r["provider"] for r in rows], ["ESPN BET"])
        self.assertEqual(set(rows[0]), set(CB.ODDS_FILE_COLS), "spreads and totals are dropped")

    def test_closing_price_is_median_of_checked_books(self):
        odds = pd.DataFrame([{"game_id": "1", "season": 2019, "provider": "a", "home_ml": -150, "away_ml": 130},
                             {"game_id": "1", "season": 2019, "provider": "b", "home_ml": -200, "away_ml": 170},
                             {"game_id": "1", "season": 2019, "provider": "c", "home_ml": -110, "away_ml": -110},
                             {"game_id": "1", "season": 2019, "provider": "d", "home_ml": 50, "away_ml": -300},
                             {"game_id": "2", "season": 2019, "provider": "a", "home_ml": -400, "away_ml": -400}])
        q = CB.closing_ml(odds)
        qa = (150 / 250) / (150 / 250 + 100 / 230)
        qb = (200 / 300) / (200 / 300 + 100 / 270)
        self.assertAlmostEqual(q["1"], 100 * float(np.median([qa, qb, 0.5])), 6)   # d fails D1's check (+50)
        self.assertNotIn("2", q, "implied probabilities summing over 1.15 are no closing line")


class CBB(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        C.use("CBB")
        cls.games, cls.odds = synthetic()
        cls.data = CB.assemble(cls.games, cls.odds)

    @classmethod
    def tearDownClass(cls):
        C.use("NFL")

    def setUp(self):
        C.use("CBB")

    def test_config(self):
        self.assertEqual(C.MARKETS, ("moneyline",))
        self.assertEqual((C.TRAIN, C.SEARCH_PERIODS, C.SKIP_SEASONS, C.LAB_MAX_SEASON, C.SEALED_SEASON, C.EXAM_MIN_GAMES),
                         ((2018, 2018), [(2019, 2019), (2020, 2020), (2022, 2022)], (2021,), 2025, 2026, 3000))
        self.assertEqual([g[0] for g in C.GATES], ["2023", "2024", "2025"])
        self.assertTrue(C.DATA_DIR.endswith(os.path.join("research", "cbb", "data")))
        self.assertTrue(C.QUEUE.endswith(os.path.join("research", "cbb", "queue")))
        self.assertIs(L.dm(), CB)

    def test_division_one_only(self):
        g = self.data["games"]
        self.assertFalse(((g.home_team == SMALL) | (g.away_team == SMALL)).any())
        self.assertFalse((self.data["team_games"].team == SMALL).any())

    def test_schedule_columns(self):
        g = self.data["games"]
        self.assertEqual(set(g.location), {"Home", "Neutral"})
        self.assertEqual(set(g.game_type), {"REG", "POST"})
        self.assertTrue(g.ml_line.between(0, 100).all())
        self.assertTrue(g.spread_line.isna().all() and g.total_line.isna().all())
        self.assertEqual(int(g.week.min()), 1)
        self.assertTrue((g.home_rest.dropna() >= 1).all())

    def test_families_and_gates(self):
        cands = [{"market": "moneyline", "model": {"type": "elo_ml", "params": ELO}},
                 {"market": "moneyline", "model": {"type": "srs_ml", "params": {"hfa_pts": 3.0, "carry": 0.5,
                                                                                "prior_w": 4, "margin_cap": 20}}},
                 {"market": "moneyline", "model": {"type": "rating_ml", "params": {
                     "metric": "points", "pace": "none", "league_window": 400, "halflife": 10, "def_weight": 1.0,
                     "season_carry": 0.5}}}]
        for c in cands:
            e = L.score(models.run(c, self.data)[0])
            self.assertTrue(((e.forecast > 0) & (e.forecast < 100)).all(), c["model"]["type"])
            self.assertFalse(e.season.isin([2021]).any(), "2021 is played through, never scored (E2)")
            self.assertGreater(np.mean(np.sign(e.forecast - 50) == np.sign(e.line - 50)), 0.6, c["model"]["type"])
        res = L.evaluate_candidate(dict(cands[0], id="t", name="t", family="t", parent=None, reason="t"), self.data)
        self.assertEqual([g["name"] for g in res["gates"]], ["2023", "2024", "2025"])
        self.assertIn("Postseason", [x["label"] for x in res["rule_split"]])

    def test_coverage_gate(self):
        self.assertEqual(CB.blocked_markets(self.data), set())
        thin = {k: v.copy() for k, v in self.data.items()}
        g = thin["games"]
        thin["games"].loc[g.index[(g.season == 2024)][: int((g.season == 2024).sum() * 0.4)], "ml_line"] = np.nan
        self.assertEqual(CB.blocked_markets(thin), {"moneyline"})

    def test_menu_and_signals(self):
        from research.lab import search as SR
        from research.lab import signals as SG
        menu = SR.load_menu(os.path.join(C.SEARCH_DIR, "MENU.yaml"))
        self.assertEqual({f["market"] for f in menu["families"]}, {"moneyline"})
        self.assertGreater(len(SR.grid(menu)), 100)
        self.assertEqual(SG.load_library(auto=False), [], "E6: the CBB signal library starts empty")
        SG.validate({"id": "pts", "kind": "team", "reason": "r", "num": {"points": 1}, "side": "offense",
                     "halflife": 8, "markets": ["moneyline"]})
        with self.assertRaises(SG.SignalError):
            SG.validate({"id": "x", "kind": "team", "reason": "r", "num": {"epa": 1}, "side": "offense", "halflife": 8})

    def test_cache_round_trip_and_sealed_guard(self):
        tmp = tempfile.mkdtemp()
        saved = CB.fetch_season
        try:
            CB.fetch_season = lambda s, log=print: (self.games[self.games.season == s].copy(),
                                                    self.odds[self.odds.season == s].copy())
            self.assertTrue(CB.fetch_lab_cache(tmp, log=lambda *_: None))
            self.assertFalse(CB.fetch_lab_cache(tmp, log=lambda *_: None), "a cached season is never fetched again")
            man = CB.manifest(tmp)
            self.assertEqual(man["complete"], list(range(2015, 2026)))
            self.assertNotIn("2026", man["sha256"])
            d = CB.load_lab(tmp)
            self.assertEqual(len(d["games"]), len(self.data["games"]))
            # an evicted cache is refetched and must match the committed fingerprints
            os.remove(CB._path(tmp, "odds", 2019))
            changed = self.odds.copy()
            changed.loc[changed.season == 2019, "home_ml"] = -105
            CB.fetch_season = lambda s, log=print: (self.games[self.games.season == s].copy(),
                                                    changed[changed.season == s].copy())
            CB.fetch_lab_cache(tmp, log=lambda *_: None)
            with self.assertRaises(RuntimeError):
                CB.load_lab(tmp)
            # a sealed row reaching the lab is refused
            shutil.rmtree(tmp)
            tmp = tempfile.mkdtemp()
            CB.fetch_season = saved
            for s in range(2015, 2026):
                rows = self.games[self.games.season == s].copy()
                if s == 2025:
                    rows.loc[rows.index[:3], "season"] = 2026
                rows.to_csv(CB._path(tmp, "games", s), index=False)
                self.odds[self.odds.season == s].to_csv(CB._path(tmp, "odds", s), index=False)
            with open(os.path.join(tmp, "MANIFEST.json"), "w") as f:
                json.dump({"complete": list(range(2015, 2026)), "sha256": {}}, f)
            with self.assertRaises(SealedDataError):
                CB.load_lab(tmp)
        finally:
            CB.fetch_season = saved
            shutil.rmtree(tmp, ignore_errors=True)

    def test_refuses_to_cache_sealed(self):
        saved = (C.LAB_MAX_SEASON, CB.fetch_season)
        tmp = tempfile.mkdtemp()
        try:
            seen = []
            CB.fetch_season = lambda s, log=print: (seen.append(s), (self.games[self.games.season == s].copy(),
                                                                     self.odds[self.odds.season == s].copy()))[1]
            CB.fetch_lab_cache(tmp, log=lambda *_: None)
            self.assertNotIn(2026, seen)
            self.assertEqual(max(seen), 2025)
        finally:
            C.LAB_MAX_SEASON, CB.fetch_season = saved
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
