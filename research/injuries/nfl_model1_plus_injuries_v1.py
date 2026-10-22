#!/usr/bin/env python3
"""
nfl_model1_plus_injuries_v1.py -- NFL Model 1.0 vs Model 1.0 + injuries, exactly as
research/injuries/NFL_MODEL1_PLUS_INJURIES_V1_PREREG.md says. Runs once; writes model1_plus_injuries_v1_results.*.

Model 1.0's features come from its own locked builder inside nfl/NFL_AI_MODEL_1_0_bundle.zip (read-only); the
injury features from the locked injury study code. Data: nflverse releases, cached in research/injuries/.cache/.

Usage:  python3 research/injuries/nfl_model1_plus_injuries_v1.py
"""
import io
import json
import os
import sys
import tempfile
import zipfile
from datetime import datetime, timezone

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import nfl_injury_study_v1 as INJ  # noqa: E402  (locked; read-only use)

BUNDLE = os.path.join(ROOT, "nfl", "NFL_AI_MODEL_1_0_bundle.zip")
SEASONS = range(2018, 2026)
TEST = range(2020, 2026)
SEED, B = 20261019, 10_000
INJURY = ["d_qb", "d_out", "d_q"]
PBP_COLS = ["season", "week", "posteam", "defteam", "epa", "success", "pass_attempt", "rush_attempt", "sack",
            "interception", "fumble_lost", "complete_pass", "qb_hit", "yardline_100", "yards_gained",
            "passer_player_id", "air_yards"]


def get_raw(name):
    """A local path to an nflverse release file (cached next to the injury study's downloads)."""
    import urllib.request
    path = os.path.join(INJ.CACHE, name.replace("/", "__"))
    if not os.path.exists(path):
        os.makedirs(INJ.CACHE, exist_ok=True)
        req = urllib.request.Request(INJ.REL + name, headers={"User-Agent": "devig-research/1.0"})
        with urllib.request.urlopen(req, timeout=300) as r, open(path + ".part", "wb") as f:
            f.write(r.read())
        os.replace(path + ".part", path)
    return path


def model1():
    """Model 1.0's builder module, feature list and frozen pipeline, from its bundle."""
    import importlib.util
    import joblib
    tmp = tempfile.mkdtemp()
    zipfile.ZipFile(BUNDLE).extractall(tmp)
    base = os.path.join(tmp, "NFL_AI_MODEL_1_0")
    spec = importlib.util.spec_from_file_location("w63", os.path.join(base, "live", "winner_builder", "live_winner_63_exact_v53.py"))
    w = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(w)
    art = joblib.load(os.path.join(base, "artifacts", "WINNER_EPA_CORE_LR_PRE2026.joblib"))
    return w, art


def model1_features(w, F):
    """Model 1.0's 63 features for every 2018-2025 game. Its builder keeps only the rows it labels season 2026, so
    it is run once per season with that season relabelled (nothing else changes; history stays in order by date)."""
    pb = pd.concat([pd.read_parquet(get_raw(f"pbp/play_by_play_{y}.parquet"), columns=PBP_COLS) for y in SEASONS],
                   ignore_index=True)
    s = INJ.get("schedules/games.csv")
    s = s[s.season.between(SEASONS.start, SEASONS.stop - 1)]
    out = []
    for y in SEASONS:
        sy, pby = s.copy(), pb.copy()
        sy.loc[sy.season == y, "season"] = 2026
        pby.loc[pby.season == y, "season"] = 2026
        o = w.build_exact_v53(sy.iloc[:0], pby.iloc[:0], sy, pby, F)
        o["season"] = y
        out.append(o)
    return pd.concat(out, ignore_index=True).dropna(subset=["home_score", "away_score"])


def scores(y, p):
    p = np.clip(p, 1e-12, 1 - 1e-12)
    return {"games": int(len(y)), "log_loss": round(float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p))), 5),
            "brier": round(float(np.mean((p - y) ** 2)), 5), "accuracy": round(float(np.mean((p > 0.5) == (y == 1))), 4)}


def main():
    from sklearn.base import clone
    w, art = model1()
    F = art["features"]
    d = model1_features(w, F)
    y_all = (d.home_score > d.away_score).astype(int)
    refit = clone(art["model"]).fit(d[F], y_all)
    repro = float(np.abs(refit.predict_proba(d[F])[:, 1] - art["model"].predict_proba(d[F])[:, 1]).max())

    INJ.SEASONS = range(2017, 2026)
    inj, cover = INJ.build(*INJ.load())
    d = d.merge(inj[["game_id"] + INJURY], on="game_id", how="left")
    matched = int(d[INJURY[0]].notna().sum())
    d[INJURY] = d[INJURY].fillna(0.0)

    seasons, ys, p1s, p2s = {}, [], [], []
    for yr in TEST:
        fit, test = d[d.season < yr], d[d.season == yr]
        yf, yt = (fit.home_score > fit.away_score).astype(int), (test.home_score > test.away_score).astype(float).values
        p1 = clone(art["model"]).fit(fit[F], yf).predict_proba(test[F])[:, 1]
        p2 = clone(art["model"]).fit(fit[F + INJURY], yf).predict_proba(test[F + INJURY])[:, 1]
        seasons[str(yr)] = {"model_1_0": scores(yt, p1), "plus_injuries": scores(yt, p2)}
        ys.append(yt); p1s.append(p1); p2s.append(p2)
    y = np.concatenate(ys)
    p1, p2 = np.clip(np.concatenate(p1s), 1e-12, 1 - 1e-12), np.clip(np.concatenate(p2s), 1e-12, 1 - 1e-12)
    ll = lambda p: -(y * np.log(p) + (1 - y) * np.log(1 - p))
    diff = ll(p2) - ll(p1)
    idx = np.random.default_rng(SEED).integers(0, len(diff), size=(B, len(diff)))
    dist = diff[idx].mean(axis=1)
    ci = [round(float(np.percentile(dist, 2.5)), 5), round(float(np.percentile(dist, 97.5)), 5)]
    better = sum(1 for s in seasons.values() if s["plus_injuries"]["log_loss"] < s["model_1_0"]["log_loss"])
    res = {"test": "NFL_MODEL1_PLUS_INJURIES_V1", "run_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
           "games": int(len(d)), "games_with_injury_features": matched, "model_1_0_refit_max_prob_diff": repro,
           "injury_coverage": cover, "seasons": seasons,
           "pooled": {"model_1_0": scores(y, p1), "plus_injuries": scores(y, p2)},
           "log_loss_change": round(float(diff.mean()), 5), "log_loss_change_ci95": ci,
           "seasons_better": better, "seasons_tested": len(seasons),
           "better": bool(diff.mean() < 0 and ci[1] < 0 and better >= 4)}
    with open(os.path.join(HERE, "model1_plus_injuries_v1_results.json"), "w") as f:
        json.dump(res, f, indent=1)
    pct = lambda v: f"{v * 100:.1f}%"
    a, b = res["pooled"]["model_1_0"], res["pooled"]["plus_injuries"]
    md = ["# NFL Model 1.0 vs 1.0 + injuries -- results", "",
          f"Run {res['run_at']}, exactly as `NFL_MODEL1_PLUS_INJURIES_V1_PREREG.md`. {res['games']:,} games "
          f"({matched:,} with injury features); Model 1.0 reproduced to {repro:.1e}.", "",
          "| Walk-forward 2020-2025 | Log loss | Brier | Accuracy |", "|---|---|---|---|",
          f"| Model 1.0 | {a['log_loss']:.4f} | {a['brier']:.4f} | {pct(a['accuracy'])} |",
          f"| 1.0 + injuries | {b['log_loss']:.4f} | {b['brier']:.4f} | {pct(b['accuracy'])} |", "",
          f"Log-loss change {res['log_loss_change']:+.5f} (95% interval {ci[0]:+.5f} to {ci[1]:+.5f}); better in "
          f"{better} of {len(seasons)} seasons -> **{'BETTER: build Model 2.0' if res['better'] else 'not better: scrap injuries'}**.", "",
          "| Season | 1.0 log loss | + injuries | 1.0 accuracy | + injuries |", "|---|---|---|---|---|"]
    for yr, s in seasons.items():
        md.append(f"| {yr} | {s['model_1_0']['log_loss']:.4f} | {s['plus_injuries']['log_loss']:.4f} | "
                  f"{pct(s['model_1_0']['accuracy'])} | {pct(s['plus_injuries']['accuracy'])} |")
    with open(os.path.join(HERE, "model1_plus_injuries_v1_results.md"), "w") as f:
        f.write("\n".join(md) + "\n")
    print("\n".join(md))
    return 0


if __name__ == "__main__":
    sys.exit(main())
