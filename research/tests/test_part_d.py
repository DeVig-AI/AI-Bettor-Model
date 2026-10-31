"""Research Lab tests for NBA, NHL and MLB (Constitution Part D), on SYNTHETIC data only.

    python3 -m unittest discover -s research/tests -t .
"""
import os
import sys
import tempfile
import unittest

import numpy as np
import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, ROOT)
from research.lab import config as C        # noqa: E402
from research.lab import lab as L           # noqa: E402
from research.lab import metrics as M       # noqa: E402
from research.lab import models             # noqa: E402
from research.lab import sbr_data as SD     # noqa: E402

SD.BOX_FILES = None                          # synthetic archive only: no sportsdataverse box scores (D1a)

TEAMS = ["Bruins", "Rangers", "Flyers", "Penguins", "Capitals", "Devils", "Sabres", "Senators"]


def american(p):
    """A fair price as an American moneyline (no vig)."""
    return round(-100 * p / (1 - p)) if p >= 0.5 else round(100 * (1 - p) / p)


def archive(sport="NHL", first=2011, last=2021, seed=5):
    """Archive-shaped rows (as the pinned JSON holds them) for a fake league with known team strengths."""
    rng = np.random.default_rng(seed)
    strength = {t: rng.normal(0, 0.4) for t in TEAMS}
    rows = []
    for s in range(first, last + 1):
        day = pd.Timestamp(f"{s}-10-05")
        for k in range(60):
            order = rng.permutation(TEAMS)
            for i in range(0, len(order), 2):
                h, a = order[i], order[i + 1]
                lam_h = np.exp(1.05 + strength[h] - strength[a] + 0.1)
                lam_a = np.exp(1.0 + strength[a] - strength[h])
                hs, as_ = rng.poisson(lam_h), rng.poisson(lam_a)
                if hs == as_:
                    hs += 1 if rng.random() < 0.55 else 0
                    as_ += 0 if hs > as_ else 1
                p = 1 / (1 + np.exp(-(strength[h] - strength[a] + 0.15) * 1.6))
                vig = 1.04
                hp, ap = p * vig, (1 - p) * vig
                row = {"season": s, "date": float(day.strftime("%Y%m%d")), "home_team": h, "away_team": a,
                       "home_final": str(hs), "away_final": str(as_),
                       "home_close_ml": american(min(0.97, hp)), "away_close_ml": american(min(0.97, ap)),
                       "close_over_under": 5.5, "home_close_spread": -1.5, "away_close_spread": 1.5,
                       "home_open_ml": 0, "open_over_under": 6.0}
                rows.append(row)
            day += pd.Timedelta(days=2)
    return rows


class Parse(unittest.TestCase):
    def setUp(self):
        C.use("NHL")

    def tearDown(self):
        C.use("NFL")

    def test_names_checks_and_duplicates(self):
        rows = [
            {"season": 2015, "date": 20151010.0, "home_team": "Tampa", "away_team": "St.Louis", "home_final": "3",
             "away_final": "2", "home_close_ml": -150, "away_close_ml": 130, "close_over_under": 5.5},
            {"season": 2015, "date": 20151010.0, "home_team": "Tampa Bay", "away_team": "St.Louis", "home_final": "3",
             "away_final": "2", "home_close_ml": -150, "away_close_ml": 130, "close_over_under": 5.5},     # duplicate
            {"season": 2015, "date": 20151011.0, "home_team": "Bruins", "away_team": "Sabres", "home_final": "1",
             "away_final": "4", "home_close_ml": 123, "away_close_ml": 170, "close_over_under": 12.0},     # bad pair
            {"season": 2015, "date": None, "home_team": "Bruins", "away_team": "Sabres"},
            {"season": 2015, "date": 20151012.0, "home_team": "0", "away_team": "Sabres"},
        ]
        g, counts = SD.parse(rows, "NHL")
        self.assertEqual(list(g.home_team), ["Lightning", "Bruins"])
        self.assertEqual(g.away_team.iloc[0], "Blues")
        self.assertEqual((counts["duplicate"], counts["no_date_or_team"]), (1, 2))
        q = (150 / 250) / (150 / 250 + 100 / 230)
        self.assertAlmostEqual(g.ml_line.iloc[0], 100 * q, places=6)
        self.assertTrue(np.isnan(g.ml_line.iloc[1]), "both sides as underdogs fails D1's check")
        self.assertTrue(np.isnan(g.total_line.iloc[1]), "12 goals is outside the NHL range")
        self.assertTrue(g.spread_line.isna().all(), "no spread for the NHL (D3)")

    def test_nba_spread_check(self):
        C.use("NBA")
        rows = [{"season": 2015, "date": 20151030.0 + i, "home_team": "Celtics", "away_team": "Knicks",
                 "home_final": "100", "away_final": "90", "home_close_spread": hs, "away_close_spread": as_,
                 "close_over_under": 205.0} for i, (hs, as_) in enumerate([(-4.5, 4.5), (-4.5, 3.5), (-30.0, 30.0)])]
        g, _ = SD.parse(rows, "NBA")
        self.assertEqual(g.spread_line.iloc[0], 4.5, "expected home margin = minus the home spread")
        self.assertTrue(g.spread_line.iloc[1:].isna().all())

    def test_sealed_season_never_reaches_the_lab(self):
        d = tempfile.mkdtemp()
        orig = SD.download
        SD.download = lambda: archive()
        try:
            SD.fetch_lab_cache(d, log=lambda *a: None)
            data = SD.load_lab(d)
            self.assertEqual(int(data["games"].season.max()), 2020)
            live = SD.fetch_live([2021])
            self.assertEqual(set(live["games"].season), {2021})
            g = data["games"].copy()
            g.loc[0, "season"] = 2021
            g.to_csv(os.path.join(d, "games.csv"), index=False)
            with self.assertRaises(SD.SealedDataError):
                SD.load_lab(d)
        finally:
            SD.download = orig


class Moneyline(unittest.TestCase):
    def setUp(self):
        C.use("NHL")
        orig = SD.download
        SD.download = lambda: archive()
        try:
            games, _ = SD.parse(SD.download(), "NHL")
        finally:
            SD.download = orig
        games = games[games.season <= C.LAB_MAX_SEASON].reset_index(drop=True)
        self.data = {"games": games, "team_games": SD.team_games(games)}

    def tearDown(self):
        C.use("NFL")

    def test_pricing_at_the_closing_price(self):
        d = np.array([5.0, -5.0, 0.0])
        r = np.array([40.0, 60.0, 40.0])             # home won game 1 (q 0.6); home lost game 2 (q 0.6)
        k = M.picks(d, r, price=np.array([0.6, 0.6, 0.6]))
        c_home = 0.6 + 0.07 * 0.6 * 0.4
        c_away = 0.4 + 0.07 * 0.4 * 0.6
        self.assertEqual((k["picks"], k["wins"]), (2, 1))
        self.assertAlmostEqual(k["roi"], round(((1 - c_home) - c_away) / (c_home + c_away), 4))
        self.assertAlmostEqual(k["break_even"], round((c_home + c_away) / 2, 4))
        flat = M.picks(np.array([1.0, -1.0]), np.array([2.0, 3.0]))
        self.assertEqual(flat["break_even"], round(C.COST, 4), "spreads and totals keep A4's pricing")

    def test_families_forecast_win_chances(self):
        base = {"mean": 1505, "playoff_mult": 1.0, "bye_rest_days": 13, "hfa_seasons": 3, "qb": "none",
                "qb_alpha": 0.1, "qb_elo_per_value": 3.3, "qb_new_below_avg": 10, "nfelo_log_base": 10, "bye_elo": 0,
                "travel_elo_per_1000mi": 0, "market_resist": 0.0, "revert_center": "none", "elo_per_point": 100,
                "k": 8, "hfa_elo": 35, "revert": 0.4, "mov": "none", "hfa_mode": "fixed", "market_blend": 0.0}
        cands = [
            {"market": "moneyline", "model": {"type": "elo_ml", "params": dict(base, prob="elo")}},
            {"market": "moneyline", "model": {"type": "elo_ml", "params": dict(base, prob="fit")}},
            {"market": "moneyline", "model": {"type": "srs_ml", "params": {"hfa_pts": 0.2, "carry": 0.5, "prior_w": 4,
                                                                           "margin_cap": None}}},
            {"market": "moneyline", "model": {"type": "rating_ml", "params": {
                "metric": "points", "pace": "none", "league_window": 400, "halflife": 20, "def_weight": 1.0,
                "season_carry": 0.5}}},
        ]
        for c in cands:
            out, fit = models.run(c, self.data)
            e = L.score(out)
            self.assertTrue(((e.forecast > 0) & (e.forecast < 100)).all(), c["model"]["type"])
            self.assertTrue(set(np.unique(e.actual)) <= {0.0, 100.0})
            self.assertTrue(((e.line > 0) & (e.line < 100)).all())
            self.assertFalse(e.season.isin([2020]).any(), "2020 is played through, never scored (D2)")
            # a model that knows the true strengths should mostly agree with the fair price on who is favoured
            agree = np.mean(np.sign(e.forecast - 50) == np.sign(e.line - 50))
            self.assertGreater(agree, 0.6, c["model"]["type"])
        res = L.evaluate_candidate(dict(cands[0], id="t", name="t", family="t", parent=None, reason="t"), self.data)
        self.assertEqual([g["name"] for g in res["gates"]], ["2017", "2018", "2019"])
        self.assertLess(res["pooled"]["kalshi"]["break_even"], 1.0)

    def test_market_families_are_checked(self):
        with self.assertRaises(ValueError):
            models.run({"market": "spread", "model": {"type": "elo_ml", "params": {}}}, self.data)


class Config(unittest.TestCase):
    def tearDown(self):
        C.use("NFL")

    def test_part_d_split(self):
        for sp, markets in (("NBA", ("spread", "total")), ("NHL", ("moneyline", "total")),
                            ("MLB", ("moneyline", "total"))):
            C.use(sp)
            self.assertEqual(C.MARKETS, markets)
            self.assertEqual((C.TRAIN, C.SEARCH, C.LAB_MAX_SEASON, C.SEALED_SEASON, C.SKIP_SEASONS),
                             ((2012, 2013), (2014, 2016), 2020, 2021, (2020,)))
            self.assertTrue(C.DATA_DIR.endswith(os.path.join("research", sp.lower(), "data")))
        C.use("NFL")
        self.assertEqual((C.MARKETS, C.SEALED_SEASON, C.SKIP_SEASONS), (("spread", "total"), 2025, ()))


if __name__ == "__main__":
    unittest.main()
