#!/usr/bin/env python3
"""
mlb_bullpen_study_v1.py -- the MLB bullpen study, exactly as mlb/research/MLB_BULLPEN_STUDY_V1_PREREG.md says:
does adding the bullpen (relievers' recent ERA, recent workload) make MLB Model C a better forecaster?
Walk-forward 2015-2025. Writes mlb/research/bullpen_v1_results.json and .md. Nothing feeds a pick or the app.

Relief data: Retrosheet's parsed pitching.csv, downloaded into mlb/research/.cache/ (never committed). The link is
found from Retrosheet's download pages (this sandbox can't reach them); every link tried is written to the results.

Usage:  python3 mlb/research/mlb_bullpen_study_v1.py [--pitching path/to/full/pitching.csv]
"""
import argparse
import io
import json
import os
import re
import sys
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timezone

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
CACHE = os.path.join(HERE, ".cache")
sys.path.insert(0, os.path.join(ROOT, "mlb"))
import mlb_live_tracker_lock_v4 as MC  # noqa: E402  (locked: Model C's own feature code, read-only use)

SEASONS = range(2010, 2026)
TEST = range(2015, 2026)
SEED, B = 20261019, 10_000
BASE = ["home_trail15_rs", "home_trail15_ra", "away_trail15_rs", "away_trail15_ra",
        "home_sp_trail5_era", "home_sp_trail5_kbb", "away_sp_trail5_era", "away_sp_trail5_kbb",
        "home_rest_days", "away_rest_days"]
BULLPEN = ["home_bp_era15", "home_bp_outs3", "away_bp_era15", "away_bp_outs3"]
PAGES = ["https://www.retrosheet.org/downloads/csvdownloads.html", "https://www.retrosheet.org/downloads/othercsvs.html",
         "https://www.retrosheet.org/downloads/", "https://www.retrosheet.org/game.htm"]
UA = {"User-Agent": "devig-research/1.0 (personal research; one download per run)"}
tried = []


def fetch(url, binary=False):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300) as r:
        b = r.read()
    return b if binary else b.decode("utf-8", "replace")


def csv_from(blob, url):
    """pitching.csv rows from a .zip (any member named *pitching*.csv) or a plain .csv."""
    if url.lower().endswith(".zip") or blob[:2] == b"PK":
        z = zipfile.ZipFile(io.BytesIO(blob))
        names = [n for n in z.namelist() if re.search(r"(^|/)pitching[^/]*\.csv$", n, re.I)]
        if not names:
            return None
        return pd.concat([pd.read_csv(z.open(n), low_memory=False) for n in names], ignore_index=True)
    return pd.read_csv(io.BytesIO(blob), low_memory=False)


def download():
    """Retrosheet's per-pitcher-per-game file for 2010-2025, from links found on its download pages: a single
    all-years pitching file when there is one, else one file per season."""
    links = []
    for page in PAGES:
        try:
            html = fetch(page)
        except Exception as e:
            tried.append(f"{page}: {type(e).__name__}: {e}"[:200])
            continue
        for h in re.findall(r'href="([^"]+)"', html, re.I):
            u = urllib.parse.urljoin(page, h)
            if re.search(r"\.(zip|csv)$", u, re.I) and u not in links:
                links.append(u)
    tried.append(f"links found: {len(links)}")
    allyears = [u for u in links if re.search(r"pitching", u, re.I) and not re.search(r"(19|20)\d\d", os.path.basename(u))]
    per_year = {y: [u for u in links if str(y) in os.path.basename(u) and re.search(r"csv", os.path.basename(u), re.I)]
                for y in SEASONS}
    frames = []
    for u in allyears:
        try:
            df = csv_from(fetch(u, True), u)
            tried.append(f"{u}: {None if df is None else len(df)} rows")
            if df is not None and {"gid", "team", "p_gs", "p_ipouts", "p_er"} <= set(df.columns):
                return df
        except Exception as e:
            tried.append(f"{u}: {type(e).__name__}: {e}"[:200])
    for y in SEASONS:
        got = None
        for u in per_year[y]:
            try:
                got = csv_from(fetch(u, True), u)
                tried.append(f"{u}: {None if got is None else len(got)} rows")
                if got is not None:
                    break
            except Exception as e:
                tried.append(f"{u}: {type(e).__name__}: {e}"[:200])
        if got is None:
            raise RuntimeError(f"no pitching file found for {y}")
        frames.append(got)
    return pd.concat(frames, ignore_index=True)


def load_pitching(path=None):
    cached = os.path.join(CACHE, "pitching_2010_2025.csv")
    if path:
        return pd.read_csv(path, low_memory=False)
    if os.path.exists(cached):
        return pd.read_csv(cached, low_memory=False)
    df = download()
    os.makedirs(CACHE, exist_ok=True)
    df.to_csv(cached, index=False)
    return df


def bullpen_features(p):
    """Per (gid, team): bp_era15 (relievers' ER x 27 / outs over the team's previous 15 games) and bp_outs3 (relief
    outs in the previous 3 calendar days), from regular-season games before this one."""
    p = p.copy()
    for c in ("p_gs", "p_ipouts", "p_er", "number"):
        p[c] = pd.to_numeric(p[c], errors="coerce")
    p["date"] = pd.to_datetime(p["date"].astype(str), format="%Y%m%d", errors="coerce")
    p = p[p.date.dt.year.isin(list(SEASONS)) & p.gametype.isin(["regular", "R"])]
    games = p.groupby(["gid", "team"], as_index=False).agg(date=("date", "first"), number=("number", "first"))
    rel = p[p.p_gs == 0].groupby(["gid", "team"], as_index=False).agg(outs=("p_ipouts", "sum"), er=("p_er", "sum"))
    t = games.merge(rel, on=["gid", "team"], how="left").fillna({"outs": 0.0, "er": 0.0})
    t = t.sort_values(["team", "date", "number", "gid"]).reset_index(drop=True)
    out = []
    for team, x in t.groupby("team", sort=False):
        er = x.er.shift(1).rolling(15, min_periods=1).sum()
        outs = x.outs.shift(1).rolling(15, min_periods=1).sum()
        era = 27 * er / outs.replace(0, np.nan)
        daily = x.groupby("date").outs.sum()
        recent = []
        for d in x.date:
            recent.append(float(daily[(daily.index >= d - pd.Timedelta(days=3)) & (daily.index < d)].sum()))
        out.append(pd.DataFrame({"gid": x.gid.values, "team": team, "bp_era15": era.values, "bp_outs3": recent}))
    return pd.concat(out, ignore_index=True)


def pipeline():
    from sklearn.impute import SimpleImputer
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import StandardScaler
    return Pipeline([("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler()),
                     ("lr", LogisticRegression(C=0.2, max_iter=2000))])


def scores(y, p):
    p = np.clip(p, 1e-12, 1 - 1e-12)
    return {"games": int(len(y)), "log_loss": round(float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p))), 5),
            "brier": round(float(np.mean((p - y) ** 2)), 5), "accuracy": round(float(np.mean((p > 0.5) == (y == 1))), 4)}


def run(df):
    df = df.copy()
    df["season"] = pd.to_datetime(df["date"]).dt.year
    seasons, ys, pc, pb = {}, [], [], []
    for yr in TEST:
        fit, test = df[(df.season >= SEASONS.start) & (df.season < yr)], df[df.season == yr]
        if not len(test):
            continue
        y = test.home_win.values.astype(float)
        m1 = pipeline().fit(fit[BASE], fit.home_win.values)
        m2 = pipeline().fit(fit[BASE + BULLPEN], fit.home_win.values)
        p1, p2 = m1.predict_proba(test[BASE])[:, 1], m2.predict_proba(test[BASE + BULLPEN])[:, 1]
        seasons[str(yr)] = {"model_c": scores(y, p1), "c_plus_bullpen": scores(y, p2)}
        ys.append(y); pc.append(p1); pb.append(p2)
    y, p1, p2 = np.concatenate(ys), np.clip(np.concatenate(pc), 1e-12, 1 - 1e-12), np.clip(np.concatenate(pb), 1e-12, 1 - 1e-12)
    ll = lambda p: -(y * np.log(p) + (1 - y) * np.log(1 - p))
    diff = ll(p2) - ll(p1)
    idx = np.random.default_rng(SEED).integers(0, len(diff), size=(B, len(diff)))
    dist = diff[idx].mean(axis=1)
    ci = [round(float(np.percentile(dist, 2.5)), 5), round(float(np.percentile(dist, 97.5)), 5)]
    better = sum(1 for s in seasons.values() if s["c_plus_bullpen"]["log_loss"] < s["model_c"]["log_loss"])
    final = pipeline().fit(df[BASE + BULLPEN], df.home_win.values)
    return {"seasons": seasons, "pooled": {"model_c": scores(y, p1), "c_plus_bullpen": scores(y, p2)},
            "log_loss_change": round(float(diff.mean()), 5), "log_loss_change_ci95": ci,
            "seasons_better": better, "seasons_tested": len(seasons),
            "helps": bool(diff.mean() < 0 and ci[1] < 0 and better >= 7),
            "coef_all_years_scaled": dict(zip(BASE + BULLPEN, [round(float(c), 4) for c in final.named_steps["lr"].coef_[0]]))}


def report(res):
    r = res["results"]
    pct = lambda v: f"{v * 100:.1f}%"
    a, b = r["pooled"]["model_c"], r["pooled"]["c_plus_bullpen"]
    lines = ["# MLB bullpen study v1 -- results", "",
             f"Run {res['run_at']}, exactly as `MLB_BULLPEN_STUDY_V1_PREREG.md`: walk-forward, test seasons 2015-2025, "
             f"{a['games']:,} games. Relief rows read: {res['relief_rows']:,}; games with bullpen features: "
             f"{res['games_with_bullpen']:,} of {res['games']:,}.", "",
             "| Pooled 2015-2025 | Log loss | Brier | Accuracy |", "|---|---|---|---|",
             f"| Model C (10) | {a['log_loss']:.4f} | {a['brier']:.4f} | {pct(a['accuracy'])} |",
             f"| C + bullpen (14) | {b['log_loss']:.4f} | {b['brier']:.4f} | {pct(b['accuracy'])} |", "",
             f"Log-loss change {r['log_loss_change']:+.5f} (95% interval {r['log_loss_change_ci95'][0]:+.5f} to "
             f"{r['log_loss_change_ci95'][1]:+.5f}); better in {r['seasons_better']} of {r['seasons_tested']} seasons -> "
             f"**{'bullpen helps' if r['helps'] else 'no clear help'}**.", "",
             "| Season | C log loss | C+bullpen | C accuracy | C+bullpen |", "|---|---|---|---|---|"]
    for yr, s in r["seasons"].items():
        lines.append(f"| {yr} | {s['model_c']['log_loss']:.4f} | {s['c_plus_bullpen']['log_loss']:.4f} | "
                     f"{pct(s['model_c']['accuracy'])} | {pct(s['c_plus_bullpen']['accuracy'])} |")
    return "\n".join(lines) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pitching", help="a local copy of Retrosheet's full pitching.csv (2010-2025)")
    a = ap.parse_args()
    out = {"study": "MLB_BULLPEN_STUDY_V1", "run_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
    try:
        p = load_pitching(a.pitching)
        bp = bullpen_features(p)
        MC.TEAMSTATS_PATH, MC.PITCHING_PATH = os.path.join(ROOT, "mlb", "teamstats.csv"), os.path.join(ROOT, "mlb", "pitching.csv")
        df = MC.load_training_data()
        for side in ("home", "away"):
            df = df.merge(bp.rename(columns={"team": f"{side}_team", "bp_era15": f"{side}_bp_era15", "bp_outs3": f"{side}_bp_outs3"}),
                          on=["gid", f"{side}_team"], how="left")
        out.update(relief_rows=int((pd.to_numeric(p.p_gs, errors="coerce") == 0).sum()), games=int(len(df)),
                   games_with_bullpen=int(df.home_bp_outs3.notna().sum()))
        out["results"] = run(df)
    except Exception as e:
        out["error"] = f"{type(e).__name__}: {e}"[:500]
    out["download_log"] = tried
    with open(os.path.join(HERE, "bullpen_v1_results.json"), "w") as f:
        json.dump(out, f, indent=1)
    if "results" in out:
        md = report(out)
        with open(os.path.join(HERE, "bullpen_v1_results.md"), "w") as f:
            f.write(md)
        print(md)
        return 0
    print(json.dumps(out, indent=1))
    return 1


if __name__ == "__main__":
    sys.exit(main())
