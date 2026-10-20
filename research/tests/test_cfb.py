"""Research Lab tests for college football (Constitution Part C), on SYNTHETIC data only.

    python3 -m unittest discover -s research/tests -t .
"""
import os
import shutil
import sys
import tempfile
import unittest

import numpy as np
import yaml
import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "tools"))
from research.lab import cfb_data as CD     # noqa: E402
from research.lab import config as C        # noqa: E402
from research.lab import lab as L           # noqa: E402
from research.lab import models             # noqa: E402
import cfb_teams                            # noqa: E402

CONFS = ["SEC", "Big Ten", "MAC", "Sun Belt"]


def synthetic_tables(first=2009, last=2024, seed=11, n_teams=32):
    """Reduced CFBD-shaped tables for a fake FBS (plus a few FCS opponents that must be ignored)."""
    rng = np.random.default_rng(seed)
    teams = [f"Team {i}" for i in range(n_teams)]
    conf = {t: CONFS[i % 4] for i, t in enumerate(teams)}
    level = {"SEC": 6, "Big Ten": 4, "MAC": -4, "Sun Belt": -6}
    strength = {t: level[conf[t]] + rng.normal(0, 6) for t in teams}
    tempo = {t: rng.normal(70, 6) for t in teams}
    G, LN, AD, RT = [], [], [], []
    gid = 1000
    for s in range(first, last + 1):
        ret = {}
        for t in teams:
            ret[t] = float(rng.uniform(0.2, 0.9))
            strength[t] = level[conf[t]] + (strength[t] - level[conf[t]]) * (0.4 + 0.5 * ret[t]) + rng.normal(0, 3)
            RT.append(dict(season=s, team=t, percent_ppa=ret[t], usage=ret[t]))
        weeks = 6 if s == 2020 else 12
        for w in range(1, weeks + 2):
            order = rng.permutation(teams)
            for i in range(0, len(order), 2):
                h, a = order[i], order[i + 1]
                post = w == weeks + 1
                if post and i > 6:
                    continue
                neutral = post or (w == 1 and i == 0)
                true = strength[h] - strength[a] + (0 if neutral else 2.5)
                plays = (tempo[h] + tempo[a]) / 2
                total = 52 + (plays - 70) * 0.5
                hs = max(0, int(round(total / 2 + true / 2 + rng.normal(0, 11))))
                as_ = max(0, int(round(total / 2 - true / 2 + rng.normal(0, 11))))
                gid += 1
                day = pd.Timestamp(f"{s}-09-01") + pd.Timedelta(days=7 * (w - 1) + (i % 3))
                G.append(dict(game_id=gid, season=s, week=w, season_type="postseason" if post else "regular",
                              start=day.isoformat() + "Z", gameday=day.strftime("%Y-%m-%d"), gametime="19:00",
                              neutral=neutral, home_team=h, away_team=a, home_id=1, away_id=2, home_class="fbs",
                              away_class="fbs", home_conf=conf[h], away_conf=conf[a], home_score=hs, away_score=as_,
                              completed=True))
                has_line = rng.random() < 0.95
                LN.append(dict(game_id=gid, season=s,
                               spread_line=round((true + rng.normal(0, 2)) * 2) / 2 if has_line else None,
                               total_line=round((total + rng.normal(0, 3)) * 2) / 2 if has_line else None,
                               spread_provider="consensus", total_provider="consensus", providers="consensus"))
                for o, d, pts in ((h, a, hs), (a, h, as_)):
                    pl = int(plays + rng.normal(0, 5))
                    AD.append(dict(season=s, game_id=gid, team=o, opponent=d, plays=pl, ppa=(pts - 24) / 60 / 1.0,
                                   total_ppa=(pts - 24) / 60 * pl, d_plays=pl, d_ppa=0.0))
        gid += 1                                        # an FBS-vs-FCS game: never scored, never learned from
        G.append(dict(game_id=gid, season=s, week=1, season_type="regular", start=f"{s}-08-30T23:00:00Z",
                      gameday=f"{s}-08-30", gametime="19:00", neutral=False, home_team=teams[0], away_team="FCS U",
                      home_id=1, away_id=9, home_class="fbs", away_class="fcs", home_conf=conf[teams[0]],
                      away_conf="Big Sky", home_score=70, away_score=0, completed=True))
        LN.append(dict(game_id=gid, season=s, spread_line=45.0, total_line=60.0, spread_provider="consensus",
                       total_provider="consensus", providers="consensus"))
    adv = pd.DataFrame(AD)
    return {"games": pd.DataFrame(G, columns=CD.COLS["games"]), "lines": pd.DataFrame(LN, columns=CD.COLS["lines"]),
            "advanced": adv, "advanced_ngt": adv.copy(), "returning": pd.DataFrame(RT)}


def seeds():
    """The 16 CFB seed ideas (v3), kept as reference copies since v5 made them points of the search menu."""
    out = {}
    folder = os.path.join(C.SEARCH_DIR, "seeds")
    for f in sorted(os.listdir(folder)):
        if f.endswith(".yaml"):
            with open(os.path.join(folder, f)) as fh:
                c = yaml.safe_load(fh)
            out[c["id"]] = c
    return out


class CFB(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        C.use("CFB")
        cls.tables = synthetic_tables()
        cls.data = CD.assemble(cls.tables)
        cls.cands = seeds()

    @classmethod
    def tearDownClass(cls):
        C.use("NFL")

    def setUp(self):
        C.use("CFB")

    def test_queue_is_per_sport(self):
        self.assertTrue(C.QUEUE.endswith(os.path.join("research", "cfb", "queue")))
        self.assertEqual(L.queued(), [])                    # the NFL queue is never read for CFB

    def test_fcs_games_excluded(self):
        self.assertFalse((self.data["games"].away_team == "FCS U").any())

    def test_candidates_registered(self):
        self.assertGreaterEqual(len(self.cands), 12)
        self.assertEqual({c["market"] for c in self.cands.values()}, {"spread", "total"})
        self.assertIn("cfb-elo-base", self.cands)

    def test_every_candidate_runs_and_skips_2020(self):
        for cid, c in self.cands.items():
            res = L.evaluate_candidate(c, self.data)
            self.assertEqual([g["name"] for g in res["gates"]], ["2022", "2023", "2024"], cid)
            self.assertGreater(res["pooled"]["games"], 300, cid)
            e = L.score(models.run(c, self.data)[0])
            self.assertNotIn(2020, set(e.season), cid)
            labels = [x["label"] for x in res["rule_split"]]
            self.assertIn("Lines > 14", labels, cid)

    def test_search_round(self):
        """CFB search (v5): its own files, data cut at 2021, 2020 never scored, the 16 seeds are grid points."""
        from research.lab import search as SR
        tmp = tempfile.mkdtemp()
        saved = (C.SEARCH_DIR, C.CANDIDATES, CD.load_lab)
        try:
            real = SR.load_menu(os.path.join(C.SEARCH_DIR, "MENU.yaml"))
            keys = {SR.config_key(c) for c in SR.grid(real)}
            for c in self.cands.values():
                self.assertIn(SR.config_key({"market": c["market"], "type": c["model"]["type"],
                                             "params": c["model"]["params"]}), keys, c["id"])
            C.SEARCH_DIR, C.CANDIDATES = os.path.join(tmp, "search"), os.path.join(tmp, "cands")
            os.makedirs(C.SEARCH_DIR)
            real["families"] = [f for f in real["families"] if f["type"] in ("srs", "pace_eff")]
            real["families"][0]["grid"] = {"carry": [0.6], "prior_w": [3], "margin_cap": [None, 28]}
            real["families"][1]["grid"] = {"halflife": [6], "season_carry": [0.5], "efficiency": ["points"],
                                           "pace": [True, False]}
            real["search"]["shortlist_min_t"] = -99
            real["search"].update(learned_samples=2, random_samples=1)
            real["signal_bases"] = {}
            with open(os.path.join(C.SEARCH_DIR, "MENU.yaml"), "w") as f:
                yaml.safe_dump(real, f)
            CD.load_lab = lambda *a: {k: v.copy() for k, v in self.data.items()}
            sd = SR.search_data()
            self.assertEqual(int(sd["games"].season.max()), 2021)
            out = SR.forecasts({"market": "spread", "type": "srs", "params": dict(hfa_pts=2.5, carry=0.6, prior_w=3,
                                                                                    margin_cap=None)}, sd)
            self.assertNotIn(2020, set(L.between(L.score(out), *C.SEARCH).season))
            picks = SR.run_round(force=True, log=lambda *_: None)
            self.assertTrue(os.path.exists(os.path.join(C.SEARCH_DIR, "scores", "round-0001.csv.gz")))
            self.assertLessEqual(len(picks), 4)
            for cid in picks:
                self.assertIn("search", L.load_candidates()[cid])
        finally:
            C.SEARCH_DIR, C.CANDIDATES, CD.load_lab = saved
            shutil.rmtree(tmp)

    def test_no_lookahead(self):
        """Changing a later result must not change any earlier forecast (fits use training seasons only)."""
        g = self.data["games"]
        cut = g[g.season == 2022].gameday.min()
        alt = {k: v.copy() for k, v in self.data.items()}
        late = alt["games"].gameday >= cut
        alt["games"].loc[late, "home_score"] = alt["games"].loc[late, "home_score"] + 17
        for cid in ("cfb-elo-mov", "cfb-elo-conf", "cfb-elo-returning", "cfb-srs-cap", "cfb-ppa", "cfb-tot-pe"):
            a = models.run(self.cands[cid], self.data)[0].set_index("game_id").forecast
            b = models.run(self.cands[cid], alt)[0].set_index("game_id").forecast
            early = g[g.gameday < cut].game_id
            self.assertTrue(np.allclose(a[early], b[early]), cid)

    def test_closing_line_rule(self):
        lines = [{"provider": "Bovada", "spread": -3.0, "overUnder": 50}, {"provider": "consensus", "spread": -3.5,
                                                                          "overUnder": 51}]
        self.assertEqual(CD.closing(lines, "spread"), (-3.5, "consensus"))
        self.assertEqual(CD.closing(lines[:1] + [{"provider": "x", "spread": -4.0}], "spread"), (-3.5, "median"))
        df = CD.reduce_lines([{"id": 1, "season": 2014, "lines": lines}])
        self.assertEqual(float(df.spread_line[0]), 3.5)                 # expected home margin = -spread

    def test_coverage_gate(self):
        self.assertEqual(CD.blocked_markets(self.data), set())
        alt = {k: v.copy() for k, v in self.data.items()}
        alt["games"].loc[alt["games"].season == 2015, "total_line"] = None
        self.assertEqual(CD.blocked_markets(alt), {"total"})

    def test_lab_refuses_2025(self):
        tmp = tempfile.mkdtemp()
        try:
            t = synthetic_tables(2023, 2025, n_teams=8)
            for k, v in t.items():
                v.to_csv(os.path.join(tmp, f"{k}.csv"), index=False)
            with self.assertRaises(CD.SealedDataError):
                CD.load_lab(tmp)
        finally:
            shutil.rmtree(tmp)

    def test_cache_has_no_sealed_rows(self):
        if os.path.exists(os.path.join(C.DATA_DIR, "games.csv")):
            for k, v in CD.load_lab().items():
                if len(v):
                    self.assertLessEqual(int(v.season.max()), C.LAB_MAX_SEASON, k)

    def test_team_names(self):
        self.assertTrue(cfb_teams.same_team("Missouri St.", "Missouri State"))
        self.assertTrue(cfb_teams.same_team("Miami (FL)", "Miami"))
        self.assertFalse(cfb_teams.same_team("Miami (OH)", "Miami"))
        self.assertTrue(cfb_teams.same_team("Hawai'i", "Hawaii"))
        self.assertFalse(cfb_teams.same_team("Texas", "Texas State"))


if __name__ == "__main__":
    unittest.main()
