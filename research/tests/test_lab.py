"""Research Lab tests on SYNTHETIC data only (no real results are ever computed by the tests).

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
import yaml

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, ROOT)
from research.lab import config as C          # noqa: E402
from research.lab import data as D            # noqa: E402
from research.lab import inspector as IG      # noqa: E402
from research.lab import lab as L             # noqa: E402
from research.lab import metrics as M         # noqa: E402
from research.lab import models               # noqa: E402
from research.lab import report               # noqa: E402

TEAMS = ["ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN", "DET", "GB", "HOU", "IND", "JAX", "KC",
         "STL", "SD", "OAK", "MIA", "MIN", "NE", "NO", "NYG", "NYJ", "PHI", "PIT", "SEA", "SF", "TB", "TEN", "WAS"]
HOME_STADIUM = {"ARI": "PHO00", "ATL": "ATL00", "BAL": "BAL00", "BUF": "BUF00", "CAR": "CAR00", "CHI": "CHI98",
                "CIN": "CIN00", "CLE": "CLE00", "DAL": "DAL00", "DEN": "DEN00", "DET": "DET00", "GB": "GNB00",
                "HOU": "HOU00", "IND": "IND00", "JAX": "JAX00", "KC": "KAN00", "STL": "STL00", "SD": "SDG00",
                "OAK": "OAK00", "MIA": "MIA00", "MIN": "MIN00", "NE": "BOS00", "NO": "NOR00", "NYG": "NYC00",
                "NYJ": "NYC01", "PHI": "PHI00", "PIT": "PIT00", "SEA": "SEA00", "SF": "SFO00", "TB": "TAM00",
                "TEN": "NAS00", "WAS": "WAS00"}


def synthetic(first=1999, last=2024, seed=7):
    """A fake league: hidden team strengths drift; lines = truth + noise; plays/EPA/QB rows consistent."""
    rng = np.random.default_rng(seed)
    strength = dict(zip(TEAMS, rng.normal(0, 4, len(TEAMS))))
    games, team, qb = [], [], []
    for s in range(first, last + 1):
        for t in TEAMS:
            strength[t] = 0.7 * strength[t] + rng.normal(0, 2.5)
        for w in range(1, 18):
            order = rng.permutation(TEAMS)
            for i in range(0, len(order), 2):
                h, a = order[i], order[i + 1]
                gid = f"{s}_{w:02d}_{a}_{h}"
                true = strength[h] - strength[a] + 2.0
                hs = max(0, int(round(22 + true / 2 + rng.normal(0, 7))))
                as_ = max(0, int(round(22 - true / 2 + rng.normal(0, 7))))
                neutral = (w == 8 and i == 0)
                games.append(dict(game_id=gid, season=s, game_type="REG", week=w,
                                  gameday=f"{s}-09-{(w % 28) + 1:02d}" if w < 17 else f"{s}-12-{w:02d}",
                                  gametime="13:00", away_team=a, home_team=h, away_score=as_, home_score=hs,
                                  location="Neutral" if neutral else "Home",
                                  away_rest=14 if w == 9 and i == 2 else 7, home_rest=7,
                                  spread_line=round((true + rng.normal(0, 1.5)) * 2) / 2,
                                  total_line=round((44 + rng.normal(0, 3)) * 2) / 2, div_game=0,
                                  away_qb_id=f"QB-{a}-{s % 3}", home_qb_id=f"QB-{h}-{s % 3}",
                                  away_qb_name="A", home_qb_name="H",
                                  stadium_id="LON00" if neutral else HOME_STADIUM[h], stadium="x"))
                for t, pts in ((h, hs), (a, as_)):
                    plays = int(rng.integers(55, 72))
                    epa = round(float(rng.normal((pts - 21) / 2, 4)), 4)
                    team.append(dict(season=s, game_id=gid, team=models.FRANCHISE.get(t, t), plays=plays, epa=epa,
                                     pass_plays=plays // 2 + 3, pass_epa=epa * 0.7, early_plays=plays - 15,
                                     early_epa=epa * 0.8, succ=int(plays * (0.42 + pts / 400)), noto_plays=plays - 2,
                                     noto_epa=epa + 2, comp_plays=plays - 6, comp_epa=epa * 0.9,
                                     top_seconds=int(plays * rng.normal(28, 2))))
                    qb.append(dict(season=s, game_id=gid, team=t, qb_id=f"QB-{t}-{s % 3}",
                                   att=int(rng.integers(25, 45)), cmp=int(rng.integers(15, 28)),
                                   yds=int(rng.integers(150, 350)), td=int(rng.integers(0, 4)), int=int(rng.integers(0, 3)),
                                   sacks=int(rng.integers(0, 5)), ratt=int(rng.integers(0, 6)),
                                   ryds=int(rng.integers(0, 40)), rtd=int(rng.integers(0, 2))))
    return {"games": pd.DataFrame(games), "team_games": pd.DataFrame(team), "qb_games": pd.DataFrame(qb)}


class Metrics(unittest.TestCase):
    def test_effect_by_hand(self):
        d = np.array([1.0, -2.0, 0.0, 3.0])
        r = np.array([4.0, -1.0, 5.0, -2.0])
        # s = [1, -1, 0, 1]; s0 = +1 -> (s - s0) * r = [0, 2, -5, 0]
        self.assertAlmostEqual(M.effect_parts(d, r, 1.0).mean(), -0.75)
        self.assertEqual(M.baseline_side(np.array([-1.0, 0.5])), -1.0)
        self.assertEqual(M.baseline_side(np.array([0.0])), 1.0)

    def test_pricing(self):
        self.assertAlmostEqual(C.FEE, 0.0175)
        self.assertAlmostEqual(C.COST, 0.5175)
        k = M.picks(np.array([1, 1, -1, 1, 0]), np.array([3, -2, -4, 0, 5]))
        self.assertEqual((k["picks"], k["wins"], k["pushes"]), (3, 2, 1))
        self.assertAlmostEqual(k["roi"], round((2 * 0.4825 - 0.5175) / (3 * 0.5175), 4))

    def test_bootstrap_is_deterministic_and_sane(self):
        rng = np.random.default_rng(1)
        r = rng.normal(0, 13, 900)
        d_skill = r + rng.normal(0, 30, 900)          # knows something about the result
        d_none = rng.normal(0, 3, 900)
        a, b = M.evaluate(d_skill, r, 1.0), M.evaluate(d_skill, r, 1.0)
        self.assertEqual(a, b)
        self.assertGreater(a["effect"], 0)
        self.assertLess(a["p"], 0.01)
        self.assertLess(a["ci"][0], a["effect"])
        self.assertGreater(a["ci"][1], a["effect"])
        self.assertGreater(M.evaluate(d_none, r, 1.0)["p"], 0.001)

    def test_holm(self):
        self.assertEqual(M.holm([0.01, 0.04, 0.03, None]), [0.04, 0.09, 0.09, 1.0])
        self.assertEqual(M.holm([0.5]), [0.5])


class Models(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = synthetic()
        cls.cands = L.load_candidates()

    def test_registry(self):
        self.assertGreaterEqual(len(self.cands), 18)
        banned = ("weather", "wind", "temp", "roof", "surface", "key_number", "teaser", "moneyline", "dog")
        for c in self.cands.values():
            blob = json.dumps(c["model"]).lower()
            self.assertFalse([b for b in banned if b in blob], c["id"])
            self.assertIn(c["model"]["type"], models.FAMILIES)

    def test_every_candidate_runs(self):
        for cid, c in self.cands.items():
            res = L.evaluate_candidate(c, self.data)
            self.assertEqual([g["name"] for g in res["gates"]], [g[0] for g in C.GATES], cid)
            for g in res["gates"] + [res["pooled"]]:
                self.assertGreater(g["games"], 100, cid)
                self.assertIsNotNone(g["effect"], cid)
                self.assertEqual(len(g["ci"]), 2, cid)

    def test_ideas_change_forecasts(self):
        base, _ = models.run(self.cands["elo-base"], self.data)
        for cid in ("elo-mov", "elo-bye", "elo-travel", "elo-qb", "elo-hfa-trend", "elo-revert", "elo-market",
                    "elo-resist", "elo-k10"):
            out, _ = models.run(self.cands[cid], self.data)
            self.assertFalse(np.allclose(out.forecast, base.forecast), cid)

    def test_no_peeking(self):
        """A forecast never changes when the game's own result (or any later result) changes."""
        g = self.data["games"]
        target = g.index[g.season == 2010][100]
        for cid in ("elo-nfelo", "elo-538", "tot-pe", "tot-epa"):
            a, _ = models.run(self.cands[cid], self.data)
            alt = {k: v.copy() for k, v in self.data.items()}
            later = alt["games"].index >= target
            alt["games"].loc[later, "home_score"] += 9
            gid = alt["games"].game_id[target]
            out, _ = models.run(self.cands[cid], alt)
            fa = a.set_index("game_id").forecast[gid]
            fb = out.set_index("game_id").forecast[gid]
            if self.cands[cid]["model"]["params"].get("calibrate"):
                continue                               # the calibration fit uses training outcomes by design
            self.assertAlmostEqual(fa, fb, places=9, msg=cid)

    def test_totals_forecast_scale(self):
        out, fit = models.run(self.cands["tot-pe"], self.data)
        self.assertTrue(30 < out.forecast.mean() < 60)
        self.assertEqual(fit["fit_seasons"], "1999-2005")


def tr(metric="epa", market="spread", **kw):
    p = dict(metric=metric, halflife=8, season_carry=0.6, def_weight=1.0, pace="none" if market == "spread" else "plays")
    p.update(kw)
    return {"id": f"t-{metric}-{market}", "name": "x", "market": market, "model": {"type": "team_rating", "params": p}}


class NewFamilies(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = synthetic()

    def test_every_metric_and_pace_runs(self):
        cands = [tr(m) for m in models.METRICS] + [tr(m, "total") for m in models.METRICS if m != "points"] + \
            [tr("points", "total", pace="none"), tr("epa", "total", pace="seconds")]
        for c in cands:
            res = L.evaluate_candidate(c, self.data)
            self.assertEqual([g["name"] for g in res["gates"]], ["2017–19", "2020–22", "2023–24"], c["id"])
            self.assertGreater(res["pooled"]["games"], 1000, c["id"])
            self.assertTrue(res["fit"], c["id"])

    def test_blend_inline_and_by_id(self):
        comp = {"market": "spread", "model": {"type": "team_rating", "params": tr()["model"]["params"]}}
        b = {"id": "b", "market": "spread", "model": {"type": "blend", "params": {
            "components": ["elo-base", comp], "weights": [0.5, 0.5]}}}
        out, fit = models.run(b, self.data)
        e1, _ = models.run(L.load_candidates()["elo-base"], self.data)
        e2, _ = models.run(tr(), self.data)
        self.assertTrue(np.allclose(out.forecast.values, (e1.forecast.values + e2.forecast.values) / 2))

    def test_relocated_teams_are_not_skipped(self):
        """Play-by-play uses today's codes (LV, LAC, LA) for OAK / SD / STL games: those games must still count."""
        g = self.data["games"]
        self.assertIn("OAK", set(g.home_team))
        self.assertNotIn("OAK", set(self.data["team_games"].team))
        oak_games = set(g.game_id[(g.home_team == "OAK") | (g.away_team == "OAK")])
        tgm = self.data["team_games"]
        oak = tgm.game_id.isin(g.game_id[(g.season == 2010) & g.game_id.isin(oak_games)]) & (tgm.team == "LV")
        alt = {k: v.copy() for k, v in self.data.items()}
        alt["team_games"].loc[oak, "epa"] += 30
        base, _ = models.run(tr("epa", "total"), self.data)
        out, _ = models.run(tr("epa", "total"), alt)
        later = ((out.season == 2011) & out.game_id.isin(oak_games)).values
        self.assertFalse(np.allclose(out.forecast[later], base.forecast[later]))
        alt2 = {k: v.copy() for k, v in self.data.items()}
        alt2["team_games"] = alt2["team_games"][~oak]
        o2, _ = models.run(L.load_candidates()["tot-pe"], alt2)
        b2, _ = models.run(L.load_candidates()["tot-pe"], self.data)
        self.assertFalse(np.allclose(o2.forecast[later], b2.forecast[later]))

    def test_no_peeking_team_rating(self):
        g = self.data["games"]
        target = g.index[g.season == 2010][100]
        for c in (tr("epa"), tr("epa", "total", pace="seconds"), tr("success", "total")):
            a, _ = models.run(c, self.data)
            alt = {k: v.copy() for k, v in self.data.items()}
            gid = alt["games"].game_id[target]
            slot = alt["games"].loc[target, ["gameday", "gametime"]]
            later = (alt["games"].gameday > slot.gameday) | ((alt["games"].gameday == slot.gameday))
            alt["games"].loc[later, "home_score"] += 9
            alt["team_games"].loc[alt["team_games"].game_id.isin(alt["games"].game_id[later]), "epa"] += 5
            out, _ = models.run(c, alt)
            self.assertAlmostEqual(a.set_index("game_id").forecast[gid], out.set_index("game_id").forecast[gid],
                                   places=9, msg=c["id"])


class Search(unittest.TestCase):
    def setUp(self):
        from research.lab import search as SR
        self.SR = SR
        self.tmp = tempfile.mkdtemp()
        self.saved = (C.SEARCH_DIR, C.CANDIDATES, SR.D.load_lab)
        self.real_menu = os.path.join(C.SEARCH_DIR, "MENU.yaml")
        C.SEARCH_DIR = os.path.join(self.tmp, "search")
        os.makedirs(C.SEARCH_DIR)
        shutil.copy(self.real_menu, C.SEARCH_DIR)
        C.CANDIDATES = os.path.join(self.tmp, "cands")
        shutil.copytree(self.saved[1], C.CANDIDATES)
        self.data = synthetic()
        SR.D.load_lab = lambda *a: {k: v.copy() for k, v in self.data.items()}

    def tearDown(self):
        SR = self.SR
        C.SEARCH_DIR, C.CANDIDATES, SR.D.load_lab = self.saved
        shutil.rmtree(self.tmp)

    def small_menu(self):
        m = self.SR.load_menu(self.real_menu)
        m["families"] = [
            {"name": "TR", "type": "team_rating", "market": "spread", "fixed": {"pace": "none", "def_weight": 1.0},
             "grid": {"metric": ["points", "epa"], "halflife": [4, 8], "season_carry": [0.6]}},
            {"name": "TT", "type": "team_rating", "market": "total", "fixed": {"def_weight": 1.0},
             "grid": {"metric": ["points", "epa"], "halflife": [8], "season_carry": [0.6], "pace": ["plays", "seconds"]},
             "rules": ["points_has_no_pace"]}]
        m["search"]["shortlist_min_t"] = -99          # synthetic data: let the shortlist rules be exercised
        m["search"].update(learned_samples=2, random_samples=1)   # keep the tests quick
        m["signal_bases"] = {}
        with open(os.path.join(C.SEARCH_DIR, "MENU.yaml"), "w") as f:
            yaml.safe_dump(m, f)

    def test_real_menu(self):
        g = self.SR.grid(self.SR.load_menu(self.real_menu))
        ids = [self.SR.config_id(c) for c in g]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(len(g), 2880 + 756 + 144 + 468 + 48)
        self.assertTrue(all(self.SR.label(c) for c in g))

    def test_search_never_sees_later_seasons(self):
        cfg = {"market": "spread", "type": "team_rating", "params": tr()["model"]["params"]}
        a = self.SR.score_out(self.SR.forecasts(cfg, self.SR.search_data()))
        d = self.data["games"]
        d.loc[d.season > C.SEARCH[1], "home_score"] += 30           # change every later result
        b = self.SR.score_out(self.SR.forecasts(cfg, self.SR.search_data()))
        self.assertEqual((a["effect"], a["t"]), (b["effect"], b["t"]))
        self.assertEqual(int(self.SR.search_data()["games"].season.max()), C.SEARCH[1])

    def test_rounds_shortlist_and_refine(self):
        self.small_menu()
        picks = self.SR.run_round(force=True, log=lambda *_: None)
        rows = self.SR.read_scores()
        singles = [r for r in rows if r["type"] != "blend"]
        self.assertEqual(len(singles), 4 + 3 + 3, "grid, then 2 learned and 1 random sample")
        self.assertTrue(any(r["type"] == "blend" for r in rows))
        self.assertLessEqual(len(picks), 4)
        for cid in picks:
            c = L.load_candidates()[cid]
            self.assertIn("search", c)
            self.assertTrue(c["reason"].startswith("Found by search round 1"))
            r = next(x for x in rows if x["id"] == cid)
            self.assertEqual(r["eligible"], "true")
        by_market = {}
        for cid in picks:
            by_market[L.load_candidates()[cid]["market"]] = by_market.get(L.load_candidates()[cid]["market"], 0) + 1
        self.assertTrue(all(v <= 2 for v in by_market.values()))
        m = self.SR.load_menu(); m["search"]["round_every_hours"] = 20
        with open(os.path.join(C.SEARCH_DIR, "MENU.yaml"), "w") as f:
            yaml.safe_dump(m, f)
        self.assertFalse(self.SR.run_round(log=lambda *_: None), "a menu gap between rounds is respected")
        self.SR.run_round(force=True, log=lambda *_: None)
        rows2 = self.SR.read_scores()
        ids = [r["id"] for r in rows2]
        self.assertEqual(len(ids), len(set(ids)), "nothing scored twice")
        self.assertGreater(len(rows2), len(rows), "round 2 adds neighbours")
        self.assertEqual([r["round"] for r in self.SR.read_csv(self.SR.path("ROUNDS.csv"))], ["1", "2"])

    def test_scores_one_file_per_round(self):
        self.small_menu()
        self.SR.run_round(force=True, log=lambda *_: None)
        self.SR.run_round(force=True, log=lambda *_: None)
        files = sorted(os.listdir(self.SR.scores_dir()))
        self.assertEqual(files, ["round-0001.csv.gz", "round-0002.csv.gz"])
        self.assertFalse(os.path.exists(self.SR.path("SCORES.csv")), "no single growing file")
        rows = self.SR.read_scores()
        self.assertEqual(sorted({r["round"] for r in rows}), ["1", "2"])
        with open(self.SR.round_scores_path(1), "rb") as f:
            first = f.read()
        self.SR.write_round_scores(1, [r for r in rows if r["round"] == "1"])
        with open(self.SR.round_scores_path(1), "rb") as f:
            self.assertEqual(f.read(), first, "same rows, same bytes")

    def test_migrate_scores(self):
        rows = [{"round": rd, "id": f"s-{i}", "market": "spread", "type": "srs", "label": "x", "games": 1,
                 "effect": 0.1, "t": 1.0, "p1": 1, "p2": 1, "p3": 1, "eligible": "true", "config": "{}"}
                for i, rd in enumerate([1, 1, 2, 3, 3])]
        self.SR.append_rows(self.SR.path("SCORES.csv"), self.SR.SCORE_COLS, rows)
        before = self.SR.read_scores()
        self.assertEqual(self.SR.migrate_scores(log=lambda *_: None), 5)
        self.assertFalse(os.path.exists(self.SR.path("SCORES.csv")))
        self.assertEqual(len(os.listdir(self.SR.scores_dir())), 3)
        self.assertEqual(self.SR.read_scores(), before, "same rows, same order")

    def test_exhausted_menu_stops_and_resumes(self):
        self.small_menu()
        m = self.SR.load_menu()
        m["search"].update(learned_samples=0, random_samples=0, neighbours_of_best=0)
        m["ladders"] = {}
        with open(os.path.join(C.SEARCH_DIR, "MENU.yaml"), "w") as f:
            yaml.safe_dump(m, f)
        self.SR.run_round(force=True, log=lambda *_: None)
        n_rows, n_rounds = len(self.SR.read_scores()), len(self.SR.read_csv(self.SR.path("ROUNDS.csv")))
        seen = []
        self.assertEqual(self.SR.run_round(force=True, log=lambda *_: None, progress=lambda *a: seen.append(a)), [])
        self.assertEqual(seen, [], "no progress post for a round that does not run")
        self.assertEqual(len(self.SR.read_scores()), n_rows)
        self.assertEqual(len(self.SR.read_csv(self.SR.path("ROUNDS.csv"))), n_rounds, "no empty round logged")
        st = self.SR.read_state()
        self.assertTrue(st["exhausted"])
        self.SR.run_round(force=True, log=lambda *_: None)
        self.assertEqual(self.SR.read_state()["since"], st["since"], "the date it stopped is kept")
        r = next(x for x in report.write_all()["runs"] if x["name"] == "Search paused: menu exhausted")
        self.assertIn("waiting for new menu values or signals", r["summary"])
        m["families"][0]["grid"]["halflife"].append(16)      # a new idea on the menu: the search resumes
        with open(os.path.join(C.SEARCH_DIR, "MENU.yaml"), "w") as f:
            yaml.safe_dump(m, f)
        self.SR.run_round(force=True, log=lambda *_: None)
        self.assertEqual(self.SR.read_state(), {})
        self.assertEqual(len(self.SR.read_csv(self.SR.path("ROUNDS.csv"))), n_rounds + 1)

    def test_short_menu_widens_instead_of_stopping(self):
        self.small_menu()
        m = self.SR.load_menu()
        m["search"].update(learned_samples=40, random_samples=0, neighbours_of_best=0, widen_below=1,
                           max_widenings_per_round=2)
        m["ladders"] = {"halflife": [4, 8]}
        with open(os.path.join(C.SEARCH_DIR, "MENU.yaml"), "w") as f:
            yaml.safe_dump(m, f)
        self.SR.run_round(force=True, log=lambda *_: None)   # the grid and the samples use up the whole menu
        self.assertFalse(os.path.exists(self.SR.path("AUTO.yaml")), "no widening while the menu has work")
        n1 = len(self.SR.read_scores())
        self.SR.run_round(force=True, log=lambda *_: None)
        auto = self.SR.read_auto()
        g = auto["generations"][0]
        self.assertEqual((g["generation"], g["round"]), (1, 2))
        self.assertTrue(set(g["ladders"]["halflife"]) <= {2, 6, 12} and g["ladders"]["halflife"])
        self.assertEqual(self.SR.read_state(), {}, "not paused")
        rows = self.SR.read_scores()
        self.assertGreater(len(rows), n1, "the widened menu was scored in the same round")
        self.assertEqual(len({r["id"] for r in rows}), len(rows), "nothing scored twice")
        self.assertEqual(self.SR.load_menu()["ladders"]["halflife"][:3], sorted(self.SR.load_menu()["ladders"]["halflife"])[:3])
        self.assertNotIn(2, self.SR.load_menu(auto=False)["ladders"]["halflife"], "MENU.yaml itself is never edited")

    def test_widen_ladders_and_signal_variants(self):
        rows = [{"id": f"s-{i}", "market": "spread", "type": "srs", "label": "x", "t": str(t),
                 "config": json.dumps({"params": {"carry": c, "prior_w": 3}})}
                for i, (c, t) in enumerate([(0.3, 1), (0.3, 1.1), (0.3, 0.9), (0.9, 3), (0.9, 2), (0.9, 2.5),
                                            (0.5, 0), (0.5, 0.1), (0.5, -1)])]
        got = self.SR.widen_ladders({"ladders": {"carry": [0.3, 0.5, 0.9], "prior_w": [1, 3]}}, rows)
        self.assertEqual(got["carry"], [0.1, 0.4, 0.7], "midpoints by the 2 best, one step past each end, within 0-1 (1.3 is not)")
        self.assertEqual(got["prior_w"], [2, 5], "whole-number ladders stay whole numbers")
        with open(os.path.join(C.SEARCH_DIR, "SIGNALS.yaml"), "w") as f:
            yaml.safe_dump({"signals": [{"id": "off-x", "kind": "team", "side": "offense", "num": {"epa": 1},
                                         "den": "plays", "halflife": 8, "carry": 0.5, "reason": "r"},
                                        {"id": "rest", "kind": "schedule", "field": "rest_diff", "reason": "r"}]}, f)
        sig = [{"id": "s-a", "market": "spread", "type": "signals", "label": "x", "t": "1.5",
                "config": json.dumps({"params": {"signals": [{"id": "off-x"}]}})}]
        v = self.SR.widen_signals(sig)
        self.assertEqual([x["id"] for x in v], ["off-x~h4", "off-x~h16", "off-x~c0.3", "off-x~c0.7"])
        self.assertTrue(all(x["num"] == {"epa": 1} and x["variant_of"] == "off-x" for x in v))
        with open(self.SR.path("AUTO.yaml"), "w") as f:
            yaml.safe_dump({"generations": [{"generation": 1, "signals": v}]}, f)
        from research.lab import signals as SG
        self.assertEqual(len(SG.load_library()), 6, "the library includes the variants")
        self.assertEqual(self.SR.widen_signals(sig), [], "a signal is varied once")

    def test_search_lessons_per_signal(self):
        base = {"type": "srs", "params": {"carry": 0.5}}
        bid = self.SR.config_id({"market": "spread", **base})
        row = lambda cid, typ, cfg, p, rnd: {"id": cid, "market": "spread", "type": typ, "label": "x", "round": rnd,
                                             "t": "1", "p1": p[0], "p2": p[1], "p3": p[2], "config": json.dumps(cfg)}
        sigcfg = lambda sid: {"params": {"base": base, "signals": [{"id": sid}], "ridge": 1.0}}
        rows = [row(bid, "srs", base, (0.1, 0.1, 0.1), "1"),
                row("s-a", "signals", sigcfg("good"), (0.3, 0.2, 0.4), "2"),
                row("s-b", "signals", sigcfg("fade"), (0.5, 0.1, 0.1), "2"),
                row("s-c", "signals", sigcfg("nil"), (0.0, 0.2, 0.1), "2")]
        self.SR.append_rows(self.SR.path("ROUNDS.csv"), self.SR.ROUND_COLS,
                            [{"round": 1, "at": "2026-10-01T00:00:00Z"}, {"round": 2, "at": "2026-10-02T00:00:00Z"}])
        got = {x["text"].split()[1]: x for x in report.search_lessons(rows)}
        self.assertEqual({k: v["kind"] for k, v in got.items()}, {"good": "helped", "fade": "faded", "nil": "no_effect"})
        self.assertIn("+0.20 / +0.10 / +0.30 pts", got["good"]["text"])
        self.assertEqual((got["good"]["at"], got["good"]["source"], got["good"]["candidates"]),
                         ("2026-10-02T00:00:00Z", "search", []))

    def test_a_crash_is_retried_once(self):
        self.small_menu()
        real = self.SR.forecasts
        cid = self.SR.config_id(self.SR.grid(self.SR.load_menu())[0])
        target = {"n": 0}

        def flaky(cfg, data):
            if self.SR.config_id(cfg) == cid:
                target["n"] += 1
                raise RuntimeError("a bug")
            return real(cfg, data)
        self.SR.forecasts = flaky
        try:
            for _ in range(3):
                self.SR.run_round(force=True, log=lambda *_: None)
        finally:
            self.SR.forecasts = real
        self.assertEqual(target["n"], 2, "tried, retried once, then final")
        self.SR.run_round(force=True, log=lambda *_: None)            # the bug fixed: still final after two
        self.assertEqual(sum(r["id"] == cid for r in self.SR.read_scores()), 2)

    def test_diverged_setting_logged_as_diverged(self):
        self.small_menu()
        real = self.SR.forecasts

        def boom(cfg, data):
            if cfg["params"].get("halflife") == 4:
                raise self.SR.models.Diverged("Elo ratings ran away to infinity in 2010 week 5")
            return real(cfg, data)
        self.SR.forecasts = boom
        try:
            self.SR.run_round(force=True, log=lambda *_: None)
        finally:
            self.SR.forecasts = real
        bad = [r for r in self.SR.read_scores() if r["label"].endswith("(diverged)")]
        self.assertTrue(bad)
        self.assertTrue(all(r["t"] == "-inf" and r["eligible"] == "false" for r in bad))

    def test_progress_callback(self):
        self.small_menu()
        seen = []
        self.SR.run_round(force=True, log=lambda *_: None, progress=lambda n, d, p: seen.append((n, d, p)))
        self.assertEqual(seen[0], (1, 0, 10), "posted once at the start (7 grid + 3 samples)")
        self.assertEqual(seen[-1][1:], (10, 10), "counts every model up to the planned total")

    def test_cap_resumes_and_window(self):
        self.small_menu()
        m = self.SR.load_menu()
        m["search"]["max_new_per_round"] = 3
        m["search"]["shortlist_per_market"] = 1
        with open(os.path.join(C.SEARCH_DIR, "MENU.yaml"), "w") as f:
            yaml.safe_dump(m, f)
        p1 = self.SR.run_round(force=True, log=lambda *_: None)
        r1 = [r for r in self.SR.read_scores() if r["type"] != "blend"]
        self.assertEqual(len(r1), 3, "the cap holds")
        p2 = self.SR.run_round(force=True, log=lambda *_: None)
        r2 = [r for r in self.SR.read_scores() if r["type"] != "blend"]
        grid_ids = [self.SR.config_id(c) for c in self.SR.grid(m)]
        self.assertEqual([r["id"] for r in r2][:len(grid_ids)], grid_ids[:len(r2)], "the grid resumes in order")
        by = {}
        for cid in p1 + p2:
            mk = L.load_candidates()[cid]["market"]
            by[mk] = by.get(mk, 0) + 1
        self.assertTrue(all(v <= 1 for v in by.values()), "at most shortlist_per_market per 7 days")

    def test_samples_learned_and_seeded(self):
        menu = {"families": [{"market": "spread", "type": "srs", "fixed": {"hfa_pts": 2.5},
                              "grid": {"carry": [0.4, 0.8], "prior_w": [1, 3]}}],
                "ladders": {"carry": [0.2, 0.4, 0.6, 0.8], "prior_w": [1, 3, 6]}}
        scored = []
        for carry, t in [(0.4, -3.0), (0.4, -2.5), (0.8, 3.0), (0.8, 2.8)]:
            cfg = {"market": "spread", "type": "srs", "params": {"hfa_pts": 2.5, "carry": carry, "prior_w": 1}}
            scored.append({"id": self.SR.config_id(cfg), "market": "spread", "type": "srs", "t": t,
                           "config": self.SR.config_key(cfg)})
        a = self.SR.samples(menu, scored, 6, seed=7)
        self.assertEqual([self.SR.config_id(c) for c in a], [self.SR.config_id(c) for c in self.SR.samples(menu, scored, 6, 7)])
        self.assertFalse({self.SR.config_id(c) for c in a} & {r["id"] for r in scored}, "never an already-scored model")
        many = self.SR.samples(menu, scored, 9, seed=1)
        carries = [c["params"]["carry"] for c in many]
        self.assertGreater(carries.count(0.8) + carries.count(0.6) + carries.count(0.2), carries.count(0.4),
                           "the setting that scored badly is drawn less often")

    def test_lookalikes_scored_once(self):
        self.small_menu()
        m = self.SR.load_menu()
        p = {"pace": "none", "def_weight": 1.0, "metric": "epa", "halflife": 4, "season_carry": 0.6}
        m["families"] = [{"name": "TR", "type": "team_rating", "market": "spread", "fixed": {"pace": "none", "def_weight": 1.0},
                          "grid": {"metric": ["epa"], "halflife": [4], "season_carry": [0.6], "league_window": [None, 544]}}]
        m["search"].update(learned_samples=0, random_samples=0)
        with open(os.path.join(C.SEARCH_DIR, "MENU.yaml"), "w") as f:
            yaml.safe_dump(m, f)
        self.SR.run_round(force=True, log=lambda *_: None)
        rows = [r for r in self.SR.read_scores() if r["type"] != "blend"]
        self.assertEqual(len(rows), 2)
        self.assertEqual(sum("(same as " in r["label"] for r in rows), 1, "the second is flagged as the same model")
        self.assertEqual([r["t"] for r in rows if "(same as " in r["label"]], ["-inf"])

    def test_fit_weights_and_neighbours(self):
        rng = np.random.default_rng(3)
        F = rng.normal(size=(500, 3))
        y = F @ np.array([0.7, 0.3, 0.0]) + rng.normal(0, 0.01, 500)
        w = self.SR.fit_weights(F, y)
        self.assertAlmostEqual(w.sum(), 1.0)
        self.assertTrue((w >= 0).all())
        self.assertAlmostEqual(w[0], 0.7, places=2)
        n = self.SR.neighbours({"market": "spread", "type": "team_rating", "params": {"halflife": 8, "metric": "epa"}},
                               {"halflife": [4, 6, 8, 12]})
        self.assertEqual(sorted(x["params"]["halflife"] for x in n), [6, 12])


class QueuePull(unittest.TestCase):
    def test_takes_next_up_to_batch_in_order(self):
        tmp = tempfile.mkdtemp()
        saved = (C.QUEUE, C.CANDIDATES)
        try:
            C.QUEUE, C.CANDIDATES = os.path.join(tmp, "q"), os.path.join(tmp, "c")
            os.makedirs(C.QUEUE); os.makedirs(C.CANDIDATES)
            for i in range(1, 21):
                with open(os.path.join(C.QUEUE, f"{i:03d}-x{i}.yaml"), "w") as f:
                    f.write("id: x%d\n" % i)
            with open(os.path.join(C.CANDIDATES, "old.yaml"), "w") as f:
                f.write("id: old\n")
            cands = {"old": {"id": "old"}}
            moved = L.take_from_queue(cands, [], log=lambda *_: None)
            self.assertEqual(moved, [f"x{i}" for i in range(1, 18)])      # 17 + the pending one = 18
            self.assertEqual(len(L.queued()), 3)
            self.assertTrue(os.path.exists(os.path.join(C.CANDIDATES, "x1.yaml")))
        finally:
            C.QUEUE, C.CANDIDATES = saved
            shutil.rmtree(tmp)


class Sealed(unittest.TestCase):
    def test_lab_refuses_2025(self):
        tmp = tempfile.mkdtemp()
        try:
            d = synthetic(2022, 2025)
            for k, v in d.items():
                v.to_csv(os.path.join(tmp, f"{k}.csv"), index=False)
            with self.assertRaises(D.SealedDataError):
                D.load_lab(tmp)
            for k, v in d.items():
                v[v.season <= 2024].to_csv(os.path.join(tmp, f"{k}.csv"), index=False)
            self.assertEqual(int(D.load_lab(tmp)["games"].season.max()), 2024)
        finally:
            shutil.rmtree(tmp)

    def test_repo_cache_has_no_sealed_rows(self):
        if os.path.exists(os.path.join(C.DATA_DIR, "games.csv")):
            for k, v in D.load_lab().items():
                self.assertLessEqual(int(v.season.max()), C.LAB_MAX_SEASON, k)


class Reports(unittest.TestCase):
    """Ledger -> Inspector General -> status.json, in a temp folder, with made-up ledger rows."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.saved = {k: getattr(C, k) for k in ("RESEARCH", "RESULTS", "LEDGER", "EXAMS", "PROMOTED", "STATUS_JSON")}
        C.RESEARCH = self.tmp
        C.RESULTS = os.path.join(self.tmp, "results")
        C.LEDGER = os.path.join(self.tmp, "LEDGER.csv")
        C.EXAMS = os.path.join(self.tmp, "exam", "EXAMS.csv")
        C.PROMOTED = os.path.join(self.tmp, "promoted.json")
        C.STATUS_JSON = os.path.join(self.tmp, "status.json")
        os.makedirs(C.RESULTS)
        from research.lab import search as SR
        self.SR, self.sr_saved = SR, C.SEARCH_DIR
        C.SEARCH_DIR = os.path.join(self.tmp, "search")

    def tearDown(self):
        for k, v in self.saved.items():
            setattr(C, k, v)
        C.SEARCH_DIR = self.sr_saved
        shutil.rmtree(self.tmp)

    def row(self, cid, p, g, status="done"):
        n = len(L.read_ledger()) + 1
        L.append_ledger(dict(attempt=n, sport="NFL", candidate_id=cid, market="spread", run_at="2026-10-20T07:00:00Z",
                             status=status, p_one_sided=p if status == "done" else None, effect_pooled=1.0,
                             g1_effect=g[0], g2_effect=g[1], g3_effect=g[2], error="boom" if status != "done" else None))

    def test_verdicts_and_status(self):
        self.row("elo-base", 0.0001, (1.0, 0.9, 0.8))      # passes
        self.row("elo-mov", 0.0001, (1.0, -0.1, 0.8))      # gate 2
        self.row("elo-bye", 0.0001, (1.0, 0.9, 0.3))       # faded
        self.row("elo-qb", 0.04, (1.0, 0.9, 0.8))          # not significant after Holm over 5
        self.row("elo-travel", None, (None, None, None), status="error")
        v = IG.verdicts()
        self.assertEqual(v["elo-base"]["state"], "lab_pass")
        self.assertEqual(v["elo-mov"]["fail_reason"], "gate_2")
        self.assertEqual(v["elo-bye"]["fail_reason"], "faded")
        self.assertEqual(v["elo-qb"]["fail_reason"], "not_significant")
        self.assertEqual(v["elo-travel"]["fail_reason"], "error")
        self.assertAlmostEqual(v["elo-base"]["adj_p"], 0.0005)
        self.assertEqual(IG.best_lab_pass(v, L.read_ledger()), "elo-base")
        s = report.write_all(running=["elo-k10", "elo-k30"], started_at="2026-10-20T07:00:00Z")
        self.assertEqual(s["counts"]["tried"], 5)
        self.assertEqual(s["counts"]["lab_pass"], 1)
        self.assertEqual(s["counts"]["running"], 1)
        self.assertEqual(s["counts"]["exam_budget_left"], 3)
        by = {c["id"]: c for c in s["candidates"]}
        self.assertEqual(by["elo-k10"]["state"], "running")
        self.assertEqual(by["elo-k30"]["state"], "queued")
        schema = {"id", "name", "market", "family", "reason", "state", "fail_reason", "gate_now", "started_at",
                  "eta_at", "gates", "pooled", "attempts", "p_bar", "fade_ratio", "fade_needed", "kalshi",
                  "rule_split", "exam", "verdict", "graded_at", "run_number", "run_url", "file_url", "updated_at"}
        self.assertEqual(set(by["elo-base"]), schema)
        for c in s["candidates"]:
            for u in (c["run_url"], c["file_url"]):
                self.assertTrue(u is None or u.startswith("https://github.com/"))
        json.dumps(s)
        self.assertTrue(os.path.exists(os.path.join(self.tmp, "LESSONS.md")))
        with open(os.path.join(self.tmp, "LESSONS.md")) as f:
            self.assertIn("EXPLORATORY", f.read())

    def test_run_timeline(self):
        for cid, p in (("elo-base", 0.4), ("elo-mov", 0.3)):
            L.append_ledger(dict(attempt=len(L.read_ledger()) + 1, sport="NFL", candidate_id=cid, market="spread",
                                 run_at="2026-10-20T07:00:0%dZ" % len(L.read_ledger()), status="done", run_number=7,
                                 run_url="https://github.com/x/actions/runs/1", p_one_sided=p, effect_pooled=0.1,
                                 ci_lo=-0.6, ci_hi=0.8, g1_effect=0.2, g2_effect=-0.8, g3_effect=0.9))
        s = report.write_all()
        r = s["runs"][0]
        self.assertEqual((r["name"], r["duration_s"], r["steps"]), ("Research Lab #7", 1, []))
        self.assertEqual(r["summary"], "2 tested → 2 past gate 1 → 0 past gate 2 → 0 passed the lab → "
                                       "0 passed the exam → 0 promoted")
        self.assertEqual([f["count"] for f in r["funnel"]], [2, 2, 0, 0, 0, 0])
        live = report.write_all(running=["elo-k10"], started_at="2026-10-20T08:00:00Z")["runs"][0]
        self.assertIsNone(live["finished_at"])
        self.assertEqual(live["summary"], "1 tested → running through the gates")

    def test_search_funnel_and_focus(self):
        from research.lab import search as SR
        os.makedirs(C.SEARCH_DIR, exist_ok=True)
        with open(SR.path("MENU.yaml"), "w") as f:
            yaml.safe_dump({"search": {"shortlist_min_t": 2.5}}, f)
        rows = [{"round": "1", "id": f"s-{i}", "market": "spread", "type": "srs", "label": "x", "games": 10,
                 "effect": 0.1, "t": t, "p1": 1, "p2": 1, "p3": 1, "eligible": e,
                 "config": SR.config_key({"market": "spread", "type": "srs", "params": {"carry": 0.1 * i}})}
                for i, (t, e) in enumerate([(3.0, "true"), (2.6, "true"), (1.0, "true"), (3.5, "false")])]
        SR.write_round_scores(1, rows)
        SR.append_rows(SR.path("ROUNDS.csv"), SR.ROUND_COLS, [{"round": 1, "at": "2026-10-20T06:00:00Z",
                                                               "scored_new": 4, "scored_total": 4, "shortlisted": "s-0"}])
        r = next(x for x in report.write_all()["runs"] if x["kind"] == "search")
        self.assertEqual([f["count"] for f in r["funnel"]], [4, 3, 2, 1])
        # focus: the 2 best values of each setting, combined
        menu = {"families": [{"market": "spread", "type": "srs", "fixed": {"hfa_pts": 2.5},
                              "grid": {"carry": [0.4, 0.6, 0.8], "prior_w": [1, 3]}}]}
        scored = []
        for carry, w, t in [(0.4, 1, 0.1), (0.4, 3, 0.2), (0.4, 1, 0.3), (0.6, 1, 2.0), (0.6, 3, 2.2), (0.6, 1, 2.1),
                            (0.8, 1, 1.0), (0.8, 3, 1.1), (0.8, 3, 1.2)]:
            cfg = {"market": "spread", "type": "srs", "params": {"hfa_pts": 2.5, "carry": carry, "prior_w": w}}
            scored.append({"market": "spread", "type": "srs", "t": t, "config": SR.config_key(cfg)})
        f = SR.focus(menu, scored)
        self.assertEqual(sorted((c["params"]["carry"], c["params"]["prior_w"]) for c in f),
                         [(0.6, 1), (0.6, 3), (0.8, 1), (0.8, 3)])

    def test_live_search_entry(self):
        live = {"kind": "search", "name": "Search round 1 (NFL, running)", "started_at": "2026-10-20T06:00:00Z",
                "finished_at": None, "duration_s": None, "run_number": 5, "run_url": None,
                "summary": "1,000 of 4,296 models scored", "funnel": [{"label": "models scored", "count": 1000}],
                "steps": []}
        r = report.write_all(live=live)["runs"][0]
        self.assertEqual((r["name"], r["finished_at"]), ("Search round 1 (NFL, running)", None))

    def test_stop_rule(self):
        log = [{"event": "pick", "game_id": f"g{i}", "cost": "0.52"} for i in range(50)]
        log += [{"event": "grade", "game_id": f"g{i}", "week": "10", "outcome": "win" if i < 18 else "loss"}
                for i in range(50)]
        self.assertTrue(IG.stop_rule(log, None))          # 36% over 50: clearly behind 52%
        log2 = [r if r["event"] == "pick" else dict(r, outcome="win" if int(r["game_id"][1:]) < 25 else "loss")
                for r in log]
        self.assertFalse(IG.stop_rule(log2, None))        # 50%: not clearly behind


class PaperGrading(unittest.TestCase):
    def test_kalshi_rules(self):
        game = {"spreads": [{"team": "KC", "line": 3.0, "bid": 0.47, "ask": 0.50}], "totals": []}
        line, side, text, price, strike, home_rung, bought = IG.kalshi_pick("spread", game, "KC", 5.0)
        self.assertEqual((line, side, bought, price), (3.0, "home", "YES", 0.50))
        pick = {"market": "spread", "strike": "3.0", "rung_is_home": "true", "bought": "YES"}
        self.assertTrue(IG.graded_win(pick, 4))
        self.assertFalse(IG.graded_win(pick, 3))                 # a tie on a whole-number strike goes to NO
        line, side, text, price, strike, home_rung, bought = IG.kalshi_pick("spread", game, "BUF", 1.0)
        self.assertEqual((line, side, bought, price), (-3.0, "home", "NO", 0.53))   # KC is away: BUF +3 side
        pick = {"market": "spread", "strike": "3.0", "rung_is_home": "false", "bought": "NO"}
        self.assertTrue(IG.graded_win(pick, -3))                 # KC won by exactly 3: NO wins
        self.assertFalse(IG.graded_win(pick, -4))
        tot = {"spreads": [], "totals": [{"line": 44.5, "bid": 0.49, "ask": 0.52}]}
        self.assertEqual(IG.kalshi_pick("total", tot, "KC", 41.0)[1:4], ("under", "over 44.5 points: NO", 0.51))


class Visibility(unittest.TestCase):
    """The owner's decision: the public app and the Ask AI chat never show, link or read research/."""

    def test_public_app_and_chat_never_touch_research(self):
        files = [os.path.join(ROOT, "functions", "api", f) for f in ("ask.js", "live.js", "me.js", "winline.js")]
        for d, _, names in os.walk(os.path.join(ROOT, "docs")):
            files += [os.path.join(d, n) for n in names if n.endswith((".html", ".js", ".json", ".webmanifest"))]
        for f in files:
            if not os.path.exists(f):
                continue
            with open(f, encoding="utf-8", errors="replace") as fh:
                text = fh.read()
            for bad in ("research/", "status.json", "/api/lab", 'href="/lab', "Research Lab", "Gauntlet-"):
                self.assertNotIn(bad, text, f"{os.path.relpath(f, ROOT)} mentions {bad!r}")


class Signals(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from research.lab import signals as SG
        cls.SG = SG
        cls.data = synthetic()
        cls.lib = {x["id"]: x for x in SG.load_library()}

    def cand(self, ids, market="spread"):
        base = {"type": "team_rating", "params": {"metric": "epa", "halflife": 8, "season_carry": 0.6, "def_weight": 1.0,
                                                  "pace": "none" if market == "spread" else "plays"}}
        return {"id": "x", "market": market, "model": {"type": "signals", "params": {
            "base": base, "signals": [self.lib[i] for i in ids], "ridge": 1.0}}}

    def test_library_and_rules(self):
        self.assertGreaterEqual(len(self.lib), 15)
        for bad in ({"id": "w", "kind": "team", "side": "offense", "num": {"temp": 1}, "halflife": 8, "reason": "r"},
                    {"id": "w", "kind": "schedule", "field": "kickoff_hour", "reason": "r"},
                    {"id": "w", "kind": "weather", "reason": "r"},
                    {"id": "w", "kind": "team", "side": "offense", "num": {"epa": 1}, "halflife": 8}):
            with self.assertRaises(self.SG.SignalError):
                self.SG.validate(dict(bad))
        C.use("CFB")
        try:
            self.assertGreaterEqual(len(self.SG.load_library()), 4)
        finally:
            C.use("NFL")

    def test_every_signal_runs_and_no_lookahead(self):
        g = self.data["games"]
        target = g.index[g.season == 2010][100]
        gid = g.game_id[target]
        for sid, sig in self.lib.items():
            market = sig["markets"][0]
            c = self.cand([sid], market)
            a, fit = models.run(c, self.data)
            self.assertTrue(np.isfinite(a.forecast).all(), sid)
            self.assertEqual(fit["fit_seasons"], f"{C.TRAIN[0]}-{C.TRAIN[1]}")
            alt = {k: v.copy() for k, v in self.data.items()}
            slot = alt["games"].loc[target, "gameday"]
            later = alt["games"].gameday >= slot
            alt["games"].loc[later, "home_score"] += 9
            alt["team_games"].loc[alt["team_games"].game_id.isin(alt["games"].game_id[later]), ["epa", "succ"]] += 3
            b, _ = models.run(c, alt)
            self.assertAlmostEqual(a.set_index("game_id").forecast[gid], b.set_index("game_id").forecast[gid],
                                   places=9, msg=sid)

    def test_team_signals_need_no_stadiums(self):
        # college football's schedule has no stadium_id: only the travel signal may need one
        data = {k: v.copy() for k, v in self.data.items()}
        data["games"] = data["games"].drop(columns=["stadium_id"])
        out, _ = models.run(self.cand(["off-success", "rest-diff"]), data)
        self.assertTrue(np.isfinite(out.forecast).all())

    def test_cfb_competitive_columns_from_no_garbage_time(self):
        from research.lab import signals as SG
        data = {k: v.copy() for k, v in self.data.items()}
        tg = data["team_games"].drop(columns=["comp_plays", "comp_epa"])
        data["team_games"] = tg
        ngt = tg[["season", "game_id", "team", "plays", "epa"]].copy()
        ngt["plays"], ngt["epa"] = ngt.plays * 0.8, ngt.epa - 1.0      # garbage time removed: different numbers
        data["team_games_ngt"] = ngt
        sig = lambda num, den: SG.validate({"id": "x", "kind": "team", "side": "offense", "num": num, "den": den,
                                             "halflife": 6, "carry": 0.4, "reason": "r"})
        comp = SG.features([sig({"comp_epa": 1}, "comp_plays")], data, "spread")
        full = SG.features([sig({"epa": 1}, "plays")], data, "spread")
        self.assertTrue(all(np.isfinite(v[0]) for v in comp.values()))
        self.assertNotEqual([v[0] for v in comp.values()], [v[0] for v in full.values()])
        rows = SG.team_frame(data)
        r = next(iter(rows.values()))
        self.assertEqual((r["comp_plays"], r["comp_epa"]), (r["plays"] * 0.8, r["epa"] - 1.0))

    def test_qb_change_and_combos(self):
        out, fit = models.run(self.cand(["qb-change", "rest-diff", "off-success"]), self.data)
        self.assertEqual(set(fit["beta"]), {"qb-change", "rest-diff", "off-success"})
        from research.lab import search as SR
        cs = SR.signal_configs(SR.load_menu(os.path.join(C.SEARCH_DIR, "MENU.yaml")), [])
        self.assertTrue(cs and all(SR.label(c).startswith("Signals (") for c in cs))


class NextRun(unittest.TestCase):
    def test_exam_first_when_a_sport_has_a_lab_pass(self):
        from research.lab import next_run as N
        nfl = {"sport": "NFL", "counts": {"exam_budget_left": 3}, "candidates": [{"state": "failed"}]}
        self.assertEqual(N.decide(dict(nfl, by_sport={})), "loop")
        cfb = {"counts": {"exam_budget_left": 3}, "candidates": [{"state": "lab_pass"}]}
        self.assertEqual(N.decide(dict(nfl, by_sport={"CFB": cfb})), "exam CFB")
        self.assertEqual(N.decide(dict(nfl, candidates=[{"state": "lab_pass"}], by_sport={"CFB": cfb})), "exam NFL")
        spent = dict(nfl, counts={"exam_budget_left": 0}, candidates=[{"state": "lab_pass"}], by_sport={})
        self.assertEqual(N.decide(spent), "loop", "no exam left: keep looping")


class FrozenGuardLog(unittest.TestCase):
    def test_append_only_log(self):
        sys.path.insert(0, os.path.join(ROOT, "tools"))
        import frozen_guard as FG
        self.assertEqual(FG.compare_log(b"a\nb\n", b"a\nb\nc\n"), [])
        self.assertTrue(FG.compare_log(b"a\nb\n", b"a\nX\nc\n"))
        self.assertTrue(FG.compare_log(b"a\nb\n", b"a\n"))


if __name__ == "__main__":
    unittest.main()
