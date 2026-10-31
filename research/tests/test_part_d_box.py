"""Constitution v14 (D1a, D1b): sportsdataverse box scores, the COVID-era date fix, the NHL goalie signal and the MLB
suspension, on SYNTHETIC data only (no network).

    python3 -m unittest discover -s research/tests -t .
"""
import datetime as dt
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
from research.lab import sbr_data as SD     # noqa: E402
from research.lab import sdv_data as SDV    # noqa: E402
from research.lab import signals as SG      # noqa: E402

TEAMS = ["Bruins", "Rangers", "Flyers", "Penguins"]
FULL = {t: f"City {t}" for t in TEAMS}


def nhl_archive(first=2011, last=2012, year_early=()):
    """Archive rows; seasons in `year_early` are dated a year too early, as the real archive's COVID seasons are."""
    rows, k = [], 0
    for s in range(first, last + 1):
        day = dt.date(s, 10, 5)
        for i in range(30):
            h, a = TEAMS[i % 4], TEAMS[(i + 1 + i // 4) % 4]
            if h == a:
                a = TEAMS[(i + 2) % 4]
            shown = day - dt.timedelta(days=365) if s in year_early else day
            rows.append({"season": s, "date": float(shown.strftime("%Y%m%d")), "home_team": h, "away_team": a,
                         "home_final": str(3 + k % 2), "away_final": str(2 - k % 2), "home_close_ml": -130,
                         "away_close_ml": 110, "close_over_under": 5.5})
            day += dt.timedelta(days=2)
            k += 1
    return rows


def nhl_files(rows):
    """sportsdataverse-shaped files for those games (real dates), goalie A{team} starting, B{team} in relief."""
    out = {}
    for r in rows:
        s = r["season"]
        day = dt.datetime.strptime(str(int(r["date"])), "%Y%m%d").date()
        if day.year < s:                              # the archive's year-early date: the real one is a year later
            day += dt.timedelta(days=365)
        gid = f"{s}{len(out.get(s, {'schedule': []})['schedule']):04d}"
        f = out.setdefault(s, {"schedule": [], "goalie_box": []})
        f["schedule"].append({"game_id": gid, "game_date": day.isoformat(), "home_team_name": FULL[r["home_team"]],
                              "away_team_name": FULL[r["away_team"]]})
        for side, team in (("home", r["home_team"]), ("away", r["away_team"])):
            sv = 0.95 if team == "Bruins" else 0.89          # Bruins' starter is the good one
            f["goalie_box"].append({"game_id": gid, "home_away": side, "player_id": 100 + TEAMS.index(team),
                                    "starter": True, "shots_against": 30, "saves": int(30 * sv),
                                    "even_strength_shots_against": f"{int(24 * sv)}/24",
                                    "power_play_shots_against": f"{int(6 * sv)}/6", "power_play_goals_against": 1})
    return {s: {k: pd.DataFrame(v) for k, v in f.items()} for s, f in out.items()}


class Box(unittest.TestCase):
    def setUp(self):
        C.use("NHL")
        self.orig = SD.BOX_FILES

    def tearDown(self):
        SD.BOX_FILES = self.orig
        C.use("NFL")

    def test_matcher_keeps_archive_dates_and_fixes_year_early_ones(self):
        sched = [("g1", "2015-10-11", "Bruins", "Rangers"), ("g2", "2021-02-19", "Flyers", "Penguins")]
        fix = SDV.matcher(sched)
        self.assertEqual(fix(dt.date(2015, 10, 10), "Bruins", "Rangers"), ("g1", dt.date(2015, 10, 10)),
                         "a one-day difference keeps the archive's date")
        self.assertEqual(fix(dt.date(2020, 2, 19), "Flyers", "Penguins"), ("g2", dt.date(2021, 2, 19)),
                         "a year-early date takes the real one")
        self.assertIsNone(fix(dt.date(2015, 10, 10), "Bruins", "Rangers"), "each game is matched once")
        self.assertIsNone(fix(dt.date(2015, 10, 10), "Rangers", "Bruins"), "home and away must match")

    def test_nhl_shots_come_from_the_other_teams_goalies(self):
        rows = nhl_archive()
        files = nhl_files(rows)
        t = SDV.team_rows("NHL", files[2011])
        gid = sorted(t)[0]
        self.assertEqual(t[gid]["home"]["shots"], 30)
        self.assertEqual((t[gid]["home"]["es_shots"], t[gid]["home"]["pp_shots"]), (24, 6), "'saves/shots' text")
        self.assertEqual(t[gid]["home"]["pp_goals"], 1)

    def test_cache_gets_box_columns_goalies_and_fixed_dates(self):
        rows = nhl_archive(2011, 2020, year_early=(2020,))
        files = nhl_files(rows)
        SD.BOX_FILES = lambda sport, s: files[s]
        orig_dl = SD.download
        SD.download = lambda: rows
        try:
            d = tempfile.mkdtemp()
            SD.fetch_lab_cache(d, log=lambda *a: None)
            data = SD.load_lab(d)
        finally:
            SD.download = orig_dl
        g = data["games"]
        self.assertTrue((g[g.season == 2020].gameday >= "2020-10-01").all(), "the year-early season is moved back")
        self.assertTrue(data["team_games"].shots.notna().all())
        self.assertEqual(len(data["goalie_games"]), 2 * len(g))
        self.assertTrue(set(g.game_id) >= set(data["goalie_games"].game_id))

    def test_goalie_signal_reads_only_earlier_games(self):
        rows = nhl_archive(2011, 2013)
        files = nhl_files(rows)
        SD.BOX_FILES = lambda sport, s: files[s]
        g, _, box, goalies = SD.load_box("NHL", [2011, 2012, 2013], rows)
        data = {"games": g, "team_games": SD.team_games(g, box), "goalie_games": goalies}
        sig = SG.validate({"id": "gs", "kind": "goalie", "field": "save_pct", "halflife": 40, "carry": 0.7,
                           "prior_shots": 300, "markets": ["moneyline", "total"], "reason": "t"})
        F = SG.features([sig], data, "moneyline")
        first = g.sort_values("gameday").iloc[0]
        self.assertEqual(F[first.game_id], [0.0], "no earlier games: no information")
        bru = g[(g.home_team == "Bruins") & (g.season == 2013)]
        self.assertTrue(all(F[x][0] > 0 for x in bru.game_id), "the Bruins' better starter shows, home minus away")

    def test_columns_and_kinds_are_checked_per_sport(self):
        with self.assertRaises(SG.SignalError):
            SG.validate({"id": "x", "kind": "team", "side": "offense", "num": {"poss": 1}, "reason": "NBA column"})
        SG.validate({"id": "x", "kind": "team", "side": "offense", "num": {"shots": 1}, "halflife": 20, "reason": "ok"})
        C.use("NBA")
        with self.assertRaises(SG.SignalError):
            SG.validate({"id": "g", "kind": "goalie", "field": "save_pct", "halflife": 40, "reason": "NHL only"})
        SG.validate({"id": "x", "kind": "team", "side": "offense", "num": {"points": 1}, "den": "poss", "halflife": 10, "reason": "ok"})


class Suspended(unittest.TestCase):
    def tearDown(self):
        C.use("NFL")

    def test_mlb_is_suspended_and_nothing_runs(self):
        C.use("MLB")
        self.assertTrue(C.SUSPENDED)
        with self.assertRaises(SystemExit) as e:
            C.refuse_if_suspended()
        self.assertEqual(e.exception.code, 0)
        self.assertEqual(L.main(["pending", "--sport", "MLB"]), 0)
        for sp in ("NFL", "CFB", "NBA", "NHL"):
            C.use(sp)
            self.assertIsNone(C.SUSPENDED, sp)
            C.refuse_if_suspended()

    def test_pins_cover_every_lab_season(self):
        for sp in ("NBA", "NHL"):
            self.assertEqual(sorted(C.SDV_SHA[sp]), list(range(2011, 2021)), sp)
        self.assertNotIn(2021, C.SDV_SHA["NBA"], "the sealed season is never fingerprinted before its exam")


if __name__ == "__main__":
    unittest.main()
