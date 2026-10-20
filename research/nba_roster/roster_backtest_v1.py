#!/usr/bin/env python3
"""
roster_backtest_v1.py -- does knowing how a roster changed over the summer make the NBA moneyline model (Model C,
nba/nba_live_tracker_lock.py) more accurate early in a season? Research only: reads data, changes nothing.

Model C's form numbers (points scored/allowed over the last 10 games) roll straight across seasons, so a team's first
games are judged on last April's games, even if half the roster left. This tests two fixes on 2022-23 .. 2025-26,
walk-forward (each season scored by a model trained only on the seasons before it):

  shrink    the part of the 10-game window that comes from last season is pulled toward the league average in
            proportion to how much of last season's minutes left the team (returning-minutes share).
  talent    shrink, plus (as two extra model features) each team's summer talent change: the opening roster's last-season plus/minus per minute,
            weighted by last-season minutes, minus the same for last season's roster (players who changed teams count
            with their own numbers).

  talent_adj  shrink, with the talent change added straight into the form numbers (half to points scored, half to
            points allowed), so nothing new is fitted.

Opening roster (backtest) = players who played for the team in its first 5 regular-season games. Live, the same
numbers come from ESPN's current team rosters (nba/nba_roster_changes_v1.py).

Usage: python3 roster_backtest_v1.py <dir with sportsdataverse player_box_YYYY.csv>
"""
import json, sys
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "nba"))
import nba_live_tracker_lock as C  # noqa: E402  the frozen model's own feature code (read-only use)

SEASONS = [2022, 2023, 2024, 2025, 2026]
TEST = [2023, 2024, 2025, 2026]
STD = {"GS": "GSW", "NO": "NOP", "NY": "NYK", "SA": "SAS", "UTAH": "UTA", "WSH": "WAS"}


def load_box(d, y):
    b = pd.read_csv(Path(d) / f"player_box_{y}.csv", low_memory=False,
                    usecols=["game_id", "season_type", "game_date", "athlete_id", "team_abbreviation", "minutes", "plus_minus", "did_not_play"])
    b = b[(b["season_type"] == 2) & (b["did_not_play"] != True)].copy()  # noqa: E712
    b["minutes"] = pd.to_numeric(b["minutes"], errors="coerce").fillna(0)
    b["plus_minus"] = pd.to_numeric(b["plus_minus"], errors="coerce").fillna(0)
    b = b[b["minutes"] > 0].dropna(subset=["athlete_id"])
    b["pid"] = b["athlete_id"].astype("int64")
    b["team"] = b["team_abbreviation"].replace(STD)
    b["game_date"] = pd.to_datetime(b["game_date"])
    return b


def player_season(b):
    """Per player: last-season minutes by team, and plus/minus per minute (all teams, shrunk toward 0 by 500 minutes)."""
    by_team = b.groupby(["pid", "team"])["minutes"].sum().rename("min").reset_index()
    tot = b.groupby("pid").agg(min=("minutes", "sum"), pm=("plus_minus", "sum"))
    tot["pm_per_min"] = tot["pm"] / (tot["min"] + 500.0)
    return by_team, tot


def opening_roster(b, first_n=5):
    b = b.sort_values("game_date")
    firsts = b.groupby("team")["game_id"].apply(lambda s: list(dict.fromkeys(s))[:first_n])
    keep = b[b.apply(lambda r: r["game_id"] in set(firsts[r["team"]]), axis=1)]
    return keep.groupby("team")["pid"].apply(set).to_dict()


def roster_numbers(prev_box, roster):
    """{team: (returning minutes share, talent change)} for a season, from last season's box and this season's roster."""
    by_team, tot = player_season(prev_box)
    out = {}
    for team, pids in roster.items():
        last = by_team[by_team["team"] == team]
        tm = last["min"].sum()
        ret = last[last["pid"].isin(pids)]["min"].sum() / tm if tm else np.nan
        def strength(players):                       # minutes-weighted impact, scaled to a 240-minute game
            t = tot.reindex(list(players)).dropna()
            return float((t["pm_per_min"] * t["min"]).sum() / max(t["min"].sum(), 1) * 240) if len(t) else 0.0
        new = strength(pids)
        old = float((tot.reindex(last["pid"])["pm_per_min"].fillna(0).values * last["min"].values).sum() / max(tm, 1) * 240)
        out[team] = (ret, new - old)
    return out


def main(box_dir):
    boxes = {y: load_box(box_dir, y) for y in SEASONS}
    code = {}
    games = []
    for y in SEASONS:
        g = pd.read_csv(ROOT / "nba" / f"nba_games_raw_season{y}.csv")
        g["season"] = y
        games.append(g)
    games = pd.concat(games, ignore_index=True)
    games = games[games["season_type"] == 2].copy()
    games["date_utc"] = pd.to_datetime(games["date_utc"], utc=True)
    games["played"] = games["played"].astype(str).str.lower() == "true"
    for col in ("home_team", "away_team"):
        games[col] = games[col].map(lambda n: C.resolve_code(n) or n)
    feat = C.build_features(games)

    # how much of each team's 10-game window is from last season, and that team-season's roster numbers
    rn = {y: roster_numbers(boxes[y - 1], opening_roster(boxes[y])) for y in SEASONS[1:]}
    long = []
    for side in ("home", "away"):
        t = feat[[f"{side}_team", "season", "date_utc"]].copy()
        t.columns = ["team", "season", "date_utc"]
        t["eid"] = feat.index
        long.append(t)
    long = pd.concat(long).sort_values("date_utc")
    long["n_cur"] = long.groupby(["team", "season"]).cumcount()
    ncur = long.set_index(["eid", "team"])["n_cur"]
    for side in ("home", "away"):
        n = np.array([ncur[(e, t)] for e, t in zip(feat.index, feat[f"{side}_team"])])
        feat[f"{side}_w_old"] = np.clip(10 - n, 0, 10) / 10.0
        ret = [rn.get(s, {}).get(t, (np.nan, 0))[0] for s, t in zip(feat["season"], feat[f"{side}_team"])]
        tal = [rn.get(s, {}).get(t, (np.nan, 0))[1] for s, t in zip(feat["season"], feat[f"{side}_team"])]
        feat[f"{side}_ret"] = pd.Series(ret, index=feat.index).fillna(1.0)
        feat[f"{side}_talent"] = pd.Series(tal, index=feat.index).fillna(0.0) * feat[f"{side}_w_old"]
    lg_ppg = feat.groupby("season")["home_trail10_ppg"].transform("mean")
    for side in ("home", "away"):
        k = feat[f"{side}_w_old"] * (1 - feat[f"{side}_ret"])
        for s in ("ppg", "papg"):
            feat[f"{side}_trail10_{s}_shrunk"] = feat[f"{side}_trail10_{s}"] - k * (feat[f"{side}_trail10_{s}"] - lg_ppg)
        # talent change in points per game: half to offense, half to defense, only for the last-season part of the window
        feat[f"{side}_trail10_ppg_adj"] = feat[f"{side}_trail10_ppg_shrunk"] + feat[f"{side}_talent"] / 2
        feat[f"{side}_trail10_papg_adj"] = feat[f"{side}_trail10_papg_shrunk"] - feat[f"{side}_talent"] / 2

    F0 = C.FEATURES_C
    F1 = [f.replace("_ppg", "_ppg_shrunk").replace("_papg", "_papg_shrunk") if "trail10" in f else f for f in F0]
    F2 = F1 + ["home_talent", "away_talent"]
    F3 = [f.replace("_shrunk", "_adj") for f in F1]
    ok = (feat["played"] == True) & (feat["home_prior_count"] >= C.MIN_HISTORY) & (feat["away_prior_count"] >= C.MIN_HISTORY) & feat["home_win"].notna()  # noqa: E712
    res = {}
    rows = []
    for y in TEST:
        tr, te = feat[ok & (feat["season"] < y)], feat[ok & (feat["season"] == y)]
        early = te[(te["home_w_old"] > 0) | (te["away_w_old"] > 0)]
        for name, F in (("model_c", F0), ("shrink", F1), ("talent", F2), ("talent_adj", F3)):
            pipe = Pipeline([("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler()),
                             ("clf", LogisticRegression(C=0.2, max_iter=2000))]).fit(tr[F], tr["home_win"])
            for part, d in (("early", early), ("all", te)):
                p = np.clip(pipe.predict_proba(d[F])[:, 1], 1e-6, 1 - 1e-6)
                rows.append(pd.DataFrame({"season": y, "model": name, "part": part, "eid": d.index, "y": d["home_win"].values, "p": p}))
    r = pd.concat(rows)
    r["ll"] = -(r["y"] * np.log(r["p"]) + (1 - r["y"]) * np.log(1 - r["p"]))
    r["hit"] = ((r["p"] > 0.5) == (r["y"] == 1)).astype(float)
    rng = np.random.default_rng(7)
    for part in ("early", "all"):
        base = r[(r["model"] == "model_c") & (r["part"] == part)].set_index(["season", "eid"])
        res[part] = {"n_games": int(len(base)), "model_c": {"log_loss": round(base["ll"].mean(), 4), "accuracy": round(base["hit"].mean(), 4)}}
        for m in ("shrink", "talent", "talent_adj"):
            x = r[(r["model"] == m) & (r["part"] == part)].set_index(["season", "eid"]).loc[base.index]
            diff = (x["ll"] - base["ll"]).values
            boots = [rng.choice(diff, len(diff)).mean() for _ in range(2000)]
            res[part][m] = {"log_loss": round(x["ll"].mean(), 4), "accuracy": round(x["hit"].mean(), 4),
                            "ll_diff_vs_c": round(float(diff.mean()), 4),
                            "ll_diff_95ci": [round(float(np.percentile(boots, 2.5)), 4), round(float(np.percentile(boots, 97.5)), 4)]}
    res["by_season_early"] = {str(y): {m: round(r[(r["season"] == y) & (r["model"] == m) & (r["part"] == "early")]["ll"].mean(), 4)
                                        for m in ("model_c", "shrink", "talent", "talent_adj")} for y in TEST}
    res["roster_2026_example"] = {t: [round(v[0], 3), round(v[1], 2)] for t, v in sorted(rn[2026].items())}
    print(json.dumps(res, indent=1))
    (Path(__file__).parent / "roster_backtest_v1_results.json").write_text(json.dumps(res, indent=1))


if __name__ == "__main__":
    main(sys.argv[1])
