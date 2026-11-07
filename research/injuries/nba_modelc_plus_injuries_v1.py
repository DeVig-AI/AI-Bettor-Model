#!/usr/bin/env python3
"""
nba_modelc_plus_injuries_v1.py -- runs NBA_MODELC_PLUS_INJURIES_V1_PREREG.md: does adding the official injury report
(d_out, d_q, d_top) make NBA Model C (nba/nba_live_tracker_lock.py, used read-only) more accurate? Research only.

Inputs come from nba_injury_reports_fetch.py's cache (outside the repo, never committed).
Usage: python3 research/injuries/nba_modelc_plus_injuries_v1.py <cache dir>
"""
import json
import re
import sys
import unicodedata
from collections import defaultdict
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
sys.path.insert(0, str(Path(__file__).parent))
from nba_injury_reports_fetch import FIRST_HOUR  # noqa: E402

FORM_ONLY = [2022]                      # read only for Model C's 10-game window at the start of 2022-23
SEASONS = [2023, 2024, 2025, 2026]
TEST = [2024, 2025, 2026]
WINDOW = 10
SEED = 20261106
N_BOOT = 10_000
STD = {"GS": "GSW", "NO": "NOP", "NY": "NYK", "SA": "SAS", "UTAH": "UTA", "WSH": "WAS"}
STATUS = r"(Out|Doubtful|Questionable|Probable|Available)"
SUFFIX = {"jr", "sr", "ii", "iii", "iv", "v"}
ROW = re.compile(r"^(?P<name>[^,\d][^,]*?, [^,]+?) " + STATUS + r"(?: |$)")
# date, time and matchup each print only when they change, so any of them can be missing from a line
PREFIX = re.compile(r"^(\d\d/\d\d/\d{4} )?(\d\d:\d\d \(ET\) )?([A-Z]{2,4}@[A-Z]{2,4} )?")


def norm(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()
    parts = [re.sub(r"[^a-z]", "", w) for w in s.replace("-", " ").split()]
    return "".join(w for w in parts if w and w not in SUFFIX)


def report_name(last_first):
    last, first = last_first.split(", ", 1)
    return norm(f"{first} {last}")


def parse_report(text, teams):
    """{team code: {normalized name: status}} from one report's text. `teams` maps full team name -> code."""
    out = defaultdict(dict)
    names = sorted(teams, key=len, reverse=True)
    team = None
    for line in text.splitlines():
        line = PREFIX.sub("", line.strip())
        for n in names:
            if line.startswith(n + " ") or line == n:
                team, line = teams[n], line[len(n):].strip()
                break
        m = ROW.match(line)
        if team and m:
            out[team][report_name(m.group("name"))] = m.group(2)
    return out


def load_box(cache, y):
    b = pd.read_csv(Path(cache) / f"player_box_{y}.csv", low_memory=False,
                    usecols=["game_id", "season_type", "game_date", "athlete_display_name", "team_abbreviation", "minutes", "did_not_play"])
    b = b[b["season_type"] == 2].copy()
    b["minutes"] = pd.to_numeric(b["minutes"], errors="coerce").fillna(0)
    b.loc[b["did_not_play"] == True, "minutes"] = 0  # noqa: E712
    b["team"] = b["team_abbreviation"].replace(STD)
    b["key"] = b["athlete_display_name"].map(norm)
    b["game_date"] = pd.to_datetime(b["game_date"])
    return b


def shares_before(box):
    """{(event id, team): {player key: minutes share x5}} from the team's previous WINDOW games in the box scores."""
    per_game = box.groupby(["team", "game_id", "game_date"]).apply(
        lambda g: g.groupby("key")["minutes"].sum().to_dict(), include_groups=False).reset_index(name="mins")
    out = {}
    for team, g in per_game.sort_values("game_date").groupby("team"):
        rows = list(g.itertuples(index=False))
        for i, r in enumerate(rows):
            prev = rows[max(0, i - WINDOW):i]
            tot = defaultdict(float)
            for p in prev:
                for k, v in p.mins.items():
                    tot[k] += v
            all_min = sum(tot.values())
            out[(int(r.game_id), team)] = {k: 5 * v / all_min for k, v in tot.items()} if all_min else {}
    return out


def pick_report(cache, ts):
    et = (ts - pd.Timedelta(minutes=30)).tz_convert("America/New_York")
    d = et.strftime("%Y-%m-%d")
    for h in range(min(et.hour, 23), FIRST_HOUR - 1, -1):
        f = Path(cache) / "txt" / f"{d}_{h:02d}.txt"
        if f.exists() and f.stat().st_size > 100:
            return f
    return None


def side_feats(rep, share):
    """(out_share, q_share, top_out, players listed, players matched) for one team."""
    out = q = 0.0
    listed = matched = 0
    top = max(share, key=share.get) if share else None
    top_out = 0.0
    for k, st in rep.items():
        if st in ("Probable", "Available"):
            continue
        listed += 1
        s = share.get(k)
        if s is None:
            continue
        matched += 1
        if st in ("Out", "Doubtful"):
            out += s
            if k == top:
                top_out = 1.0
        else:
            q += s
    return out, q, top_out, listed, matched


def metrics(y, p):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    ll = -(y * np.log(p) + (1 - y) * np.log(1 - p))
    return ll, (p - y) ** 2, ((p > 0.5) == (y == 1)).astype(float)


def main(cache):
    games = []
    for y in FORM_ONLY + SEASONS:
        g = pd.read_csv(ROOT / "nba" / f"nba_games_raw_season{y}.csv")
        g["season"] = y
        games.append(g)
    games = pd.concat(games, ignore_index=True)
    games = games[games["season_type"] == 2].copy()
    games["date_utc"] = pd.to_datetime(games["date_utc"], utc=True)
    games["played"] = games["played"].astype(str).str.lower() == "true"
    full_names = sorted(set(games["home_team"]) | set(games["away_team"]))
    teams = {n: C.resolve_code(n) or n for n in full_names}
    for col in ("home_team", "away_team"):
        games[col] = games[col].map(teams)
    feat = C.build_features(games)
    feat = feat[feat["season"].isin(SEASONS)].copy()

    box = pd.concat([load_box(cache, y) for y in SEASONS], ignore_index=True)
    box = box[box["team"].isin(set(teams.values()))]          # drops All-Star and exhibition sides
    if box["team"].nunique() != 30:
        sys.exit(f"box scores cover {box['team'].nunique()} of Model C's 30 teams")
    share = shares_before(box)

    parsed = {}
    stats = defaultdict(int)
    cols = defaultdict(list)
    for eid, r in feat.iterrows():
        f = pick_report(cache, r["date_utc"])
        vals = {}
        if f is not None:
            if f not in parsed:
                parsed[f] = parse_report(f.read_text(errors="ignore"), teams)
            stats["with_report"] += 1
        for side in ("home", "away"):
            t = r[f"{side}_team"]
            rep = parsed[f].get(t, {}) if f is not None else {}
            o, q, top, listed, matched = side_feats(rep, share.get((int(eid), t), {}))
            stats["listed"] += listed
            stats["matched"] += matched
            vals[side] = (o, q, top)
        cols["d_out"].append(vals["home"][0] - vals["away"][0])
        cols["d_q"].append(vals["home"][1] - vals["away"][1])
        cols["d_top"].append(vals["home"][2] - vals["away"][2])
    for k, v in cols.items():
        feat[k] = v

    F0 = list(C.FEATURES_C)
    F1 = F0 + ["d_out", "d_q", "d_top"]
    ok = (feat["played"] == True) & (feat["home_prior_count"] >= C.MIN_HISTORY) & (feat["away_prior_count"] >= C.MIN_HISTORY) & feat["home_win"].notna()  # noqa: E712
    rows = []
    for y in TEST:
        tr, te = feat[ok & (feat["season"] < y)], feat[ok & (feat["season"] == y)]
        for name, F in (("model_c", F0), ("c_plus_injuries", F1)):
            pipe = Pipeline([("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler()),
                             ("clf", LogisticRegression(C=0.2, max_iter=2000))]).fit(tr[F], tr["home_win"])
            p = pipe.predict_proba(te[F])[:, 1]
            ll, br, hit = metrics(te["home_win"].values, p)
            rows.append(pd.DataFrame({"season": y, "model": name, "eid": te.index, "ll": ll, "brier": br, "hit": hit}))
            if y == TEST[-1] and name == "c_plus_injuries":
                coefs = dict(zip(F, np.round(pipe.named_steps["clf"].coef_[0], 4)))
    r = pd.concat(rows)
    base = r[r["model"] == "model_c"].set_index(["season", "eid"])
    inj = r[r["model"] == "c_plus_injuries"].set_index(["season", "eid"]).loc[base.index]
    diff = (inj["ll"] - base["ll"]).values
    rng = np.random.default_rng(SEED)
    boots = np.array([diff[rng.integers(0, len(diff), len(diff))].mean() for _ in range(N_BOOT)])
    lo, hi = np.percentile(boots, [2.5, 97.5])
    by = {}
    wins = 0
    for y in TEST:
        b, i = base.loc[y], inj.loc[y]
        by[str(y)] = {"games": int(len(b)),
                      "model_c": {"log_loss": round(b["ll"].mean(), 4), "brier": round(b["brier"].mean(), 4), "accuracy": round(b["hit"].mean(), 4)},
                      "c_plus_injuries": {"log_loss": round(i["ll"].mean(), 4), "brier": round(i["brier"].mean(), 4), "accuracy": round(i["hit"].mean(), 4)}}
        wins += int(i["ll"].mean() < b["ll"].mean())
    pooled_lower = inj["ll"].mean() < base["ll"].mean()
    better = bool(pooled_lower and hi < 0 and wins >= 2)
    test_games = feat.loc[ok & feat["season"].isin(TEST)]
    res = {
        "prereg": "research/injuries/NBA_MODELC_PLUS_INJURIES_V1_PREREG.md",
        "verdict": "better" if better else "not better",
        "pooled": {"games": int(len(diff)),
                   "model_c": {"log_loss": round(base["ll"].mean(), 4), "brier": round(base["brier"].mean(), 4), "accuracy": round(base["hit"].mean(), 4)},
                   "c_plus_injuries": {"log_loss": round(inj["ll"].mean(), 4), "brier": round(inj["brier"].mean(), 4), "accuracy": round(inj["hit"].mean(), 4)},
                   "ll_diff": round(float(diff.mean()), 5), "ll_diff_95": [round(float(lo), 5), round(float(hi), 5)]},
        "seasons_lower": f"{wins} of {len(TEST)}",
        "by_season": by,
        "coefficients_last_fit": {k: float(v) for k, v in coefs.items()},
        "coverage": {"games_all_seasons": int(len(feat)), "games_with_report": stats["with_report"],
                     "players_listed_not_probable": stats["listed"], "matched_to_box": stats["matched"],
                     "match_rate": round(stats["matched"] / max(stats["listed"], 1), 3),
                     "test_games_with_injury_diff": int((test_games[["d_out", "d_q", "d_top"]].abs().sum(axis=1) > 0).sum())},
    }
    print(json.dumps(res, indent=1))
    out = Path(__file__).parent / "nba_modelc_plus_injuries_v1_results.json"
    out.write_text(json.dumps(res, indent=1) + "\n")


if __name__ == "__main__":
    main(sys.argv[1])
