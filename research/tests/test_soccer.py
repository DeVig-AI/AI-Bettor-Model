"""Research Lab tests for soccer (Constitution Part F), on SYNTHETIC data only.

    python3 -m unittest discover -s research/tests -t .
"""
import datetime as dt
import json
import math
import os
import shutil
import sys
import tempfile
import unittest

import numpy as np
import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, ROOT)
from research.lab import config as C        # noqa: E402
from research.lab import lab as L           # noqa: E402
from research.lab import models             # noqa: E402
from research.lab import soccer_data as SD  # noqa: E402
from research.lab.data import SealedDataError   # noqa: E402

TEAMS = [str(300 + i) for i in range(20)]


def american(p):
    return round(-100 * p / (1 - p)) if p >= 0.5 else round(100 * (1 - p) / p)


def three_way(lh, la):
    """(home win, draw, away win) chances of two Poisson scores."""
    ph = [math.exp(-lh) * lh ** k / math.factorial(k) for k in range(11)]
    pa = [math.exp(-la) * la ** k / math.factorial(k) for k in range(11)]
    h = sum(ph[i] * pa[j] for i in range(11) for j in range(11) if i > j)
    d = sum(ph[i] * pa[i] for i in range(11))
    return h, d, 1 - h - d


def synthetic(first=2013, last=2025, seed=5):
    """(games, odds) in the cache files' columns: one 20-team league, a double round robin each season, goals drawn
    from known strengths; book prices only from 2019 (as on ESPN)."""
    rng = np.random.default_rng(seed)
    strength = {t: rng.normal(0, 0.35) for t in TEAMS}
    games, odds, gid = [], [], 1
    for s in range(first, last + 1):
        day = pd.Timestamp(f"{s}-08-10 15:00", tz="Europe/London")
        pairs = [(h, a) for h in TEAMS for a in TEAMS if h != a]
        rng.shuffle(pairs)
        for k in range(0, len(pairs), 10):
            for i, (h, a) in enumerate(pairs[k:k + 10]):
                lh, la = math.exp(0.25 + strength[h] - strength[a]), math.exp(0.05 + strength[a] - strength[h])
                hs, as_ = int(rng.poisson(lh)), int(rng.poisson(la))
                games.append({"game_id": str(gid), "season": s, "league": "eng.1", "season_type": "regular",
                              "start": (day + pd.Timedelta(minutes=15 * i)).tz_convert("UTC").isoformat(),
                              "neutral": False, "home_id": h, "away_id": a, "home_score": float(hs),
                              "away_score": float(as_), "completed": True})
                if s >= SD.ODDS_FIRST:
                    p = three_way(lh, la)
                    for prov, vig in (("Book A", 1.05), ("Book B", 1.07)):
                        odds.append({"game_id": str(gid), "season": s, "provider": prov,
                                     **{f"{x}_ml": american(min(0.95, q * vig)) for x, q in zip(("home", "draw", "away"), p)}})
                gid += 1
            day += pd.Timedelta(days=7)
    return pd.DataFrame(games, columns=SD.GAMES_FILE_COLS), pd.DataFrame(odds, columns=SD.ODDS_FILE_COLS)


ELO = {"mean": 1505, "playoff_mult": 1.0, "bye_rest_days": 13, "hfa_seasons": 3, "qb": "none", "qb_alpha": 0.1,
       "qb_elo_per_value": 3.3, "qb_new_below_avg": 10, "nfelo_log_base": 10, "bye_elo": 0,
       "travel_elo_per_1000mi": 0, "market_resist": 0.0, "revert_center": "none", "elo_per_point": 100, "k": 20,
       "hfa_elo": 60, "revert": 0.2, "mov": "none", "hfa_mode": "fixed", "market_blend": 0.0, "prob": "fit"}


class Reduce(unittest.TestCase):
    def test_event_fields(self):
        e = {"id": 7, "date": "2021-01-15T20:00Z", "season": {"year": 2020, "type": 1},
             "competitions": [{"startDate": "2021-01-15T20:00Z", "neutralSite": False, "attendance": 0,
                               "status": {"type": {"completed": True}}, "venue": {"fullName": "x"},
                               "competitors": [{"homeAway": "home", "score": "2", "team": {"id": "1"}, "form": "WWD"},
                                               {"homeAway": "away", "score": "2", "team": {"id": "2"}}]}]}
        r = SD.reduce_event(e, 2020, "eng.1")
        self.assertEqual(set(r), set(SD.GAMES_FILE_COLS), "only F1's fields are kept")
        self.assertEqual((r["game_id"], r["league"], r["season_type"], r["home_score"], r["away_score"]),
                         ("7", "eng.1", "regular", 2.0, 2.0))
        self.assertIsNone(SD.reduce_event(e, 2021, "eng.1"), "a season is named by the year it starts (F1)")

    def test_season_days(self):
        d = list(SD.season_days(2019))
        self.assertEqual((d[0], d[-1]), (dt.date(2019, 7, 15), dt.date(2020, 8, 15)), "2019-20 ran into August 2020")
        self.assertEqual(list(SD.season_days(2026, until=dt.date(2026, 7, 20)))[-1], dt.date(2026, 7, 20))

    def test_books_only_with_all_three_prices(self):
        full = {"homeTeamOdds": {"moneyLine": 150}, "drawOdds": {"moneyLine": 230}, "awayTeamOdds": {"moneyLine": 190}}
        items = [dict(full, provider={"name": n}, spread=-0.5, overUnder=2.5)
                 for n in ("Bet365", "DraftKings", "bloomberg", "Bet 365", "Opening", "ESPN BET - Live Odds", "numberfire")]
        items.append({"provider": {"name": "Caesars"}, "homeTeamOdds": {"moneyLine": -150},
                      "awayTeamOdds": {"moneyLine": 130}})                          # no draw price: not a three-way book
        items.append({"provider": {"name": "Unibet"}, "homeTeamOdds": {"odds": {"value": "301/1"}},
                      "drawOdds": {"odds": {"value": "1/22"}}, "awayTeamOdds": {"odds": {"value": "25/1"}}})
        rows = SD.reduce_odds({"items": items}, 7, 2021)
        self.assertEqual([r["provider"] for r in rows], ["Bet365", "DraftKings"])
        self.assertEqual(set(rows[0]), set(SD.ODDS_FILE_COLS), "spreads and totals are dropped")

    def test_three_way_price_and_leak_guards(self):
        q = SD.ml3_line(150, 230, 190)
        ph, pd_, pa = 100 / 250, 100 / 330, 100 / 290
        self.assertAlmostEqual(q, 100 * ph / (ph + pd_ + pa), 9)
        self.assertIsNone(SD.ml3_line(30000, -2200, 2500), "an outcome under 1%: in-play or after the whistle")
        self.assertIsNone(SD.ml3_line(-2400, 1200, 3000), "an outcome over 95%")
        self.assertIsNone(SD.ml3_line(400, -110, 450), "a draw likelier than not is not a pre-match price")
        self.assertIsNone(SD.ml3_line(-150, -150, -150), "three prices adding to over 1.20")
        self.assertIsNone(SD.ml3_line(-150, None, 130), "a book without a draw price")

    def test_closing_price_is_median_of_checked_books(self):
        odds = pd.DataFrame([{"game_id": "1", "season": 2021, "provider": "a", "home_ml": 150, "draw_ml": 230, "away_ml": 190},
                             {"game_id": "1", "season": 2021, "provider": "b", "home_ml": 120, "draw_ml": 240, "away_ml": 230},
                             {"game_id": "1", "season": 2021, "provider": "c", "home_ml": 110, "draw_ml": 250, "away_ml": 250},
                             {"game_id": "1", "season": 2021, "provider": "d", "home_ml": 30000, "draw_ml": -2200, "away_ml": 2500},
                             {"game_id": "2", "season": 2021, "provider": "a", "home_ml": -150, "draw_ml": -150, "away_ml": -150}])
        q = SD.closing_ml(odds)
        self.assertAlmostEqual(q["1"], float(np.median([SD.ml3_line(150, 230, 190), SD.ml3_line(120, 240, 230),
                                                        SD.ml3_line(110, 250, 250)])), 9)
        self.assertNotIn("2", q)


class Soccer(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        C.use("SOCCER")
        cls.games, cls.odds = synthetic()
        cls.data = SD.assemble(cls.games, cls.odds)

    @classmethod
    def tearDownClass(cls):
        C.use("NFL")

    def setUp(self):
        C.use("SOCCER")

    def test_config(self):
        self.assertEqual(C.MARKETS, ("moneyline",))
        self.assertEqual((C.FIRST_SEASON, C.TRAIN, C.SEARCH_PERIODS, C.SKIP_SEASONS, C.LAB_MAX_SEASON, C.SEALED_SEASON),
                         (2013, (2019, 2019), [(2020, 2020), (2021, 2021), (2022, 2022)], (), 2025, 2026))
        self.assertEqual([g[0] for g in C.GATES], ["2023-24", "2024-25", "2025-26"])
        self.assertTrue(C.DRAW_LOSES)
        self.assertTrue(C.DATA_DIR.endswith(os.path.join("research", "soccer", "data")))
        self.assertTrue(C.QUEUE.endswith(os.path.join("research", "soccer", "queue")))
        self.assertIs(L.dm(), SD)
        C.use("NHL")
        self.assertFalse(C.DRAW_LOSES, "only soccer settles a draw as a home loss")

    def test_schedule_columns(self):
        g = self.data["games"]
        self.assertEqual(set(g.location), {"Home"})
        self.assertTrue(g[g.season < 2019].ml_line.isna().all(), "no prices before 2019 (F1)")
        q = g[g.season >= 2019].ml_line
        self.assertGreater(float(q.notna().mean()), 0.97)
        self.assertTrue(q.dropna().between(0, 100).all())
        self.assertTrue(g.spread_line.isna().all() and g.total_line.isna().all())
        self.assertEqual(int(g.week.min()), 1)

    def test_draws_settle_as_home_losses(self):
        c = {"market": "moneyline", "model": {"type": "elo_ml", "params": ELO}}
        out, fit = models.run(c, self.data)
        g = self.data["games"].set_index("game_id")
        m = out.set_index("game_id")
        draw = (g.home_score == g.away_score).reindex(m.index)
        self.assertGreater(int(draw.sum()), 500)
        self.assertTrue((m.actual[draw] == 0).all(), "a draw: the home team did not win (F3)")
        self.assertTrue(m.actual.notna().all(), "no game is dropped for ending level")
        self.assertEqual(fit["fit_seasons"], "2019-2019")
        with self.assertRaises(ValueError):
            models.run({"market": "moneyline", "model": {"type": "elo_ml", "params": dict(ELO, prob="elo")}}, self.data)

    def test_families_and_gates(self):
        cands = [{"market": "moneyline", "model": {"type": "elo_ml", "params": ELO}},
                 {"market": "moneyline", "model": {"type": "srs_ml", "params": {"hfa_pts": 0.3, "carry": 0.5,
                                                                                "prior_w": 4, "margin_cap": 3}}},
                 {"market": "moneyline", "model": {"type": "rating_ml", "params": {
                     "metric": "points", "pace": "none", "league_window": 400, "halflife": 20, "def_weight": 1.0,
                     "season_carry": 0.5}}}]
        for c in cands:
            e = L.score(models.run(c, self.data)[0])
            self.assertTrue(((e.forecast > 0) & (e.forecast < 100)).all(), c["model"]["type"])
            self.assertEqual(int(e.season.min()), 2019, "the warm-up seasons are never scored")
            self.assertAlmostEqual(float(e.forecast.mean()), float(e.line.mean()), delta=6, msg=c["model"]["type"])
            self.assertGreater(float(np.corrcoef(e.forecast, e.line)[0, 1]), 0.6, c["model"]["type"])
        res = L.evaluate_candidate(dict(cands[0], id="t", name="t", family="t", parent=None, reason="t"), self.data)
        self.assertEqual([g["name"] for g in res["gates"]], ["2023-24", "2024-25", "2025-26"])

    def test_coverage_gate(self):
        self.assertEqual(SD.blocked_markets(self.data), set())
        thin = {k: v.copy() for k, v in self.data.items()}
        g = thin["games"]
        thin["games"].loc[g.index[(g.season == 2019)][: int((g.season == 2019).sum() * 0.4)], "ml_line"] = np.nan
        self.assertEqual(SD.blocked_markets(thin), {"moneyline"})

    def test_menu_and_signals(self):
        from research.lab import search as SR
        from research.lab import signals as SG
        menu = SR.load_menu(os.path.join(C.SEARCH_DIR, "MENU.yaml"))
        self.assertEqual({f["market"] for f in menu["families"]}, {"moneyline"})
        self.assertGreater(len(SR.grid(menu)), 100)
        self.assertFalse(any(f["type"] == "elo_ml" and "elo" in f["grid"].get("prob", []) for f in menu["families"]))
        self.assertEqual(SG.load_library(auto=False), [], "F6: the soccer signal library starts empty")
        SG.validate({"id": "goals", "kind": "team", "reason": "r", "num": {"points": 1}, "side": "offense",
                     "halflife": 8, "markets": ["moneyline"]})
        with self.assertRaises(SG.SignalError):
            SG.validate({"id": "x", "kind": "team", "reason": "r", "num": {"epa": 1}, "side": "offense", "halflife": 8})

    def test_cache_round_trip_and_sealed_guard(self):
        tmp = tempfile.mkdtemp()
        saved = SD.fetch_season
        quiet = lambda *_: None   # noqa: E731
        try:
            SD.fetch_season = lambda s, log=print, until=None: (self.games[self.games.season == s].copy(),
                                                                self.odds[self.odds.season == s].copy())
            self.assertTrue(SD.fetch_lab_cache(tmp, log=quiet))
            self.assertFalse(SD.fetch_lab_cache(tmp, log=quiet), "a cached season is never fetched again")
            man = SD.manifest(tmp)
            self.assertEqual(man["complete"], list(range(2013, 2026)))
            self.assertNotIn("2026", man["sha256"])
            self.assertEqual(man["counts"]["2015"]["with_line"], 0)
            d = SD.load_lab(tmp)
            self.assertEqual(len(d["games"]), len(self.data["games"]))
            # an evicted cache is refetched and must match the committed fingerprints
            os.remove(SD._path(tmp, "odds", 2021))
            changed = self.odds.copy()
            changed.loc[changed.season == 2021, "home_ml"] = 105
            SD.fetch_season = lambda s, log=print, until=None: (self.games[self.games.season == s].copy(),
                                                                changed[changed.season == s].copy())
            SD.fetch_lab_cache(tmp, log=quiet)
            with self.assertRaises(RuntimeError):
                SD.load_lab(tmp)
            # a sealed row reaching the lab is refused
            shutil.rmtree(tmp)
            tmp = tempfile.mkdtemp()
            SD.fetch_season = saved
            for s in range(2013, 2026):
                rows = self.games[self.games.season == s].copy()
                if s == 2025:
                    rows.loc[rows.index[:3], "season"] = 2026
                rows.to_csv(SD._path(tmp, "games", s), index=False)
                self.odds[self.odds.season == s].to_csv(SD._path(tmp, "odds", s), index=False)
            with open(os.path.join(tmp, "MANIFEST.json"), "w") as f:
                json.dump({"complete": list(range(2013, 2026)), "sha256": {}}, f)
            with self.assertRaises(SealedDataError):
                SD.load_lab(tmp)
        finally:
            SD.fetch_season = saved
            shutil.rmtree(tmp, ignore_errors=True)

    def test_refuses_to_cache_sealed(self):
        saved = SD.fetch_season
        tmp = tempfile.mkdtemp()
        try:
            seen = []
            SD.fetch_season = lambda s, log=print, until=None: (seen.append(s), (
                self.games[self.games.season == s].copy(), self.odds[self.odds.season == s].copy()))[1]
            SD.fetch_lab_cache(tmp, log=lambda *_: None)
            self.assertNotIn(2026, seen)
            self.assertEqual(max(seen), 2025)
        finally:
            SD.fetch_season = saved
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
