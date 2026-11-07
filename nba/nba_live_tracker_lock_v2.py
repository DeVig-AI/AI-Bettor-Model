#!/usr/bin/env python3
"""
nba_live_tracker_lock_v2.py -- the app's NBA pick since 2026-11-06 (owner's decision, CHAMPION_CHALLENGER_V5_PREREG.md):
"Model C + injuries". Model C (nba_live_tracker_lock.py, frozen and unchanged; this file imports its code read-only)
plus three features from the NBA's official injury report, exactly as tested in
research/injuries/NBA_MODELC_PLUS_INJURIES_V1_PREREG.md (results: research/injuries/nba_modelc_plus_injuries_v1_results.md):

  d_out  home minus away: minutes share (last 10 games, x5) of players listed Out or Doubtful
  d_q    the same for Questionable
  d_top  home minus away: the team's top-minutes player is Out or Doubtful

Fit on 2022-23 .. 2025-26 (the tested seasons; their injury features are nba/nba_injury_features_train.csv, built by
research/injuries/nba_modelc_plus_injuries_v1_build.py). Same pipeline as Model C. Not proven: more accurate than
Model C on past seasons, never shown to beat the price.

Live inputs at lock time: the latest official report (read by tools/injuries_export.py's PDF reader) and each team's
last 10 games' minutes from ESPN box scores (the same ESPN numbers the test's box scores come from). A game is locked
only on its own day (Eastern time), after that day's report is out; a game with no readable report gets 0s, as tested.
Picks go to the same tracker table as Model C's (NBA_PROSPECTIVE_TRACKER_V1.sqlite3, model_version
NBA_MODEL_C_INJ_V1_LIVE), so grading, the app and the Models page read them unchanged; the injury inputs of each lock
are kept in that database's injury_inputs table.

Usage (from nba/, with ../data -> nba as in grade_nba.yml): python3 nba_live_tracker_lock_v2.py --odds live/NBA_ODDS_LIVE.csv
"""
import argparse
import datetime as dt
import hashlib
import json
import sqlite3
import sys
import time
import urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "research" / "injuries"))
import nba_live_tracker_lock as C  # noqa: E402  Model C's frozen code, read-only
import nba_modelc_plus_injuries_v1 as T  # noqa: E402  the tested feature code (names, minutes shares, statuses)

MODEL_VERSION = "NBA_MODEL_C_INJ_V1_LIVE"
TRAIN_SEASONS = [2023, 2024, 2025, 2026]
TRAIN_FEATURES = HERE / "nba_injury_features_train.csv"
INJ = ["d_out", "d_q", "d_top"]
FEATURES = list(C.FEATURES_C) + INJ
ET = ZoneInfo("America/New_York")
SUMMARY = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event={}"
UA = "devig-nba-tracker/2 (personal research; read-only)"


def fit(feat):
    tr = pd.read_csv(TRAIN_FEATURES, dtype={"event_id": str}).set_index("event_id")
    f = feat[feat["season"].isin(TRAIN_SEASONS)].copy()
    f.index = f.index.astype(str)
    f = f.join(tr[INJ], how="inner")
    ok = (f["played"] == True) & (f["home_prior_count"] >= C.MIN_HISTORY) & (f["away_prior_count"] >= C.MIN_HISTORY) & f["home_win"].notna()  # noqa: E712
    tr = f[ok]
    if len(tr) < 4000:
        sys.exit(f"only {len(tr)} training games with injury features; expected about 4,700")
    pipe = Pipeline([("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler()),
                     ("clf", LogisticRegression(C=0.2, max_iter=2000))])
    return pipe.fit(tr[FEATURES], tr["home_win"]), len(tr)


def get_json(url, cache=None):
    if cache is not None and cache.exists():
        return json.loads(cache.read_text())
    for k in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30) as r:
                d = json.load(r)
            if cache is not None:
                cache.parent.mkdir(parents=True, exist_ok=True)
                cache.write_text(json.dumps(d))
            time.sleep(C.REQUEST_DELAY_SECONDS)
            return d
        except Exception:
            if k == 2:
                raise
            time.sleep(2 * (k + 1))


def game_minutes(event_id):
    """{team code: {normalized name: minutes}} from ESPN's box score of a finished game (cached: it never changes)."""
    d = get_json(SUMMARY.format(event_id), C.CACHE_DIR / "summary" / f"{event_id}.json")
    out = {}
    for t in (d.get("boxscore") or {}).get("players") or []:
        code = C.resolve_code((t.get("team") or {}).get("displayName") or "")
        mins = out.setdefault(code, {})
        for s in t.get("statistics") or []:
            i = (s.get("keys") or []).index("minutes") if "minutes" in (s.get("keys") or []) else None
            for a in s.get("athletes") or []:
                if i is None or a.get("didNotPlay") or not a.get("stats"):
                    continue
                try:
                    m = float(a["stats"][i])
                except (ValueError, IndexError):
                    continue
                k = T.norm((a.get("athlete") or {}).get("displayName") or "")
                mins[k] = mins.get(k, 0.0) + m
    return out


def shares(team_code, prior_ids):
    """The test's minutes share: minutes in the team's previous 10 games / the team's total, x5."""
    tot = {}
    for eid in prior_ids[-T.WINDOW:]:
        for k, v in game_minutes(eid).get(team_code, {}).items():
            tot[k] = tot.get(k, 0.0) + v
    s = sum(tot.values())
    return {k: 5 * v / s for k, v in tot.items()} if s else {}


def report_by_day(rows):
    """{report date MM/DD/YYYY: {team code: {normalized name: status}}} from tools/injuries_export.parse_report rows."""
    out = {}
    for r in rows:
        if r.get("not_submitted") or not r.get("player") or "," not in r["player"]:
            continue
        code = C.resolve_code(r.get("team") or "")
        if code:
            out.setdefault(r.get("date", ""), {}).setdefault(code, {})[T.report_name(r["player"])] = r.get("status", "")
    return out


def fingerprint(by_team):
    """A short hash of {team code: {name: status}} (used by the parser cross-check; no names are stored)."""
    flat = sorted(f"{t}|{k}|{st}" for t, d in by_team.items() for k, st in d.items())
    return hashlib.sha256("\n".join(flat).encode()).hexdigest()[:16], len(flat)


def todays_report(now):
    """(url, report_by_day(...)) from the latest official report, or (None, {}) when none can be read."""
    sys.path.insert(0, str(ROOT / "tools"))
    import injuries_export as IE
    try:
        url, _, pdf = IE.latest_report(now.astimezone(ET))
        return url, report_by_day(IE.parse_report(pdf))
    except Exception as e:  # noqa: BLE001 -- no readable report: the features are 0, as tested
        print(f"No readable injury report ({type(e).__name__}: {e}); injury features are 0.")
        return None, {}


def init_inputs(conn):
    conn.execute("""CREATE TABLE IF NOT EXISTS injury_inputs (
        event_id TEXT PRIMARY KEY, lock_timestamp_utc TEXT, report_url TEXT,
        d_out REAL, d_q REAL, d_top REAL,
        home_out REAL, home_q REAL, home_top_out INTEGER, away_out REAL, away_q REAL, away_top_out INTEGER,
        home_listed TEXT, away_listed TEXT)""")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--odds", type=Path, required=True)
    a = ap.parse_args()
    if not a.odds.exists():
        raise SystemExit(f"Odds CSV not found: {a.odds}")
    odds_sha256 = hashlib.sha256(a.odds.read_bytes()).hexdigest()
    lock_time = dt.datetime.now(dt.timezone.utc)
    today = lock_time.date()
    today_et = lock_time.astimezone(ET).date()
    season_end_year = C.current_season_end_year(today)
    odds_by_key = C.load_odds(a.odds)
    far = 0
    for rows in odds_by_key.values():
        for br in rows:
            try:
                far = max(far, (dt.datetime.fromisoformat(br["kickoff_time"].replace("Z", "+00:00")).date() - today).days)
            except ValueError:
                continue
    current_csv, _ = C.fetch_current_season(today, season_end_year, lookahead_days=max(C.LOOKAHEAD_DAYS, far + C.LOOKAHEAD_BUFFER_DAYS))

    frames = []
    for season in C.HISTORICAL_SEASONS:
        df = pd.read_csv(C.DATA_DIR / f"nba_games_raw_season{season}.csv")
        df["season"] = season
        frames.append(df)
    cur = pd.read_csv(current_csv)
    cur["season"] = season_end_year
    if season_end_year in C.HISTORICAL_SEASONS:
        frames[-1] = cur
    else:
        frames.append(cur)
    games = pd.concat(frames, ignore_index=True)
    games = games[games["season_type"] == 2].copy()
    games["date_utc"] = pd.to_datetime(games["date_utc"], utc=True)
    games["played"] = games["played"].astype(str).str.strip().str.lower().isin(["true", "1"])
    full = {}
    for col in ("home_team", "away_team"):
        for n in games[col].unique():
            full.setdefault(C.resolve_code(n) or n, n)
        games[col] = games[col].map(lambda n: C.resolve_code(n) or n)
    feat = C.build_features(games)
    model, n_train = fit(feat)
    print(f"Model C + injuries fit on {n_train} games of 2022-23 .. 2025-26")

    played = feat[feat["played"] == True].sort_values("date_utc")  # noqa: E712
    report_url, report = todays_report(lock_time)
    print(f"Injury report: {report_url}")

    conn = sqlite3.connect(C.DB_PATH)
    C.init_db(conn)
    init_inputs(conn)
    n_logged, skips = 0, []
    for key, book_rows in sorted(odds_by_key.items()):
        home_code, away_code, kickoff_time = book_rows[0]["home_team"], book_rows[0]["away_team"], book_rows[0]["kickoff_time"]
        kickoff_dt = dt.datetime.fromisoformat(kickoff_time.replace("Z", "+00:00"))
        if kickoff_dt.astimezone(ET).date() != today_et:
            skips.append((key, "locks on game day, after that day's injury report"))
            continue
        cand = feat[(feat["home_team"] == home_code) & (feat["away_team"] == away_code)].copy()
        if cand.empty:
            skips.append((key, "no ESPN schedule row for this team pair (yet)"))
            continue
        cand["kdist"] = (cand["date_utc"] - pd.Timestamp(kickoff_dt)).abs().dt.total_seconds()
        eid = cand["kdist"].idxmin()
        if cand.loc[eid, "kdist"] > C.KICKOFF_MATCH_TOLERANCE_SECONDS:
            skips.append((key, "closest ESPN kickoff is over the tolerance"))
            continue
        row = feat.loc[eid]
        if row["home_prior_count"] < C.MIN_HISTORY or row["away_prior_count"] < C.MIN_HISTORY:
            skips.append((key, "insufficient history"))
            continue
        if row[C.FEATURES_C].isna().any():
            skips.append((key, "a required live feature came back NaN -- refusing to impute/fabricate"))
            continue
        try:
            C._require_pregame(lock_time, kickoff_time)
        except ValueError as e:
            skips.append((key, str(e)))
            continue

        day = kickoff_dt.astimezone(ET).strftime("%m/%d/%Y")
        vals, listed = {}, {}
        for side, code in (("home", home_code), ("away", away_code)):
            prior = played[((played["home_team"] == code) | (played["away_team"] == code)) & (played["date_utc"] < row["date_utc"])]
            sh = shares(code, [str(x) for x in prior.index])
            rep = report.get(day, {}).get(code, {})
            vals[side] = T.side_feats(rep, sh)
            listed[side] = [[k, st, round(sh.get(k, 0.0), 3)] for k, st in sorted(rep.items()) if st not in ("Probable", "Available")]
        inj = {"d_out": vals["home"][0] - vals["away"][0], "d_q": vals["home"][1] - vals["away"][1],
               "d_top": vals["home"][2] - vals["away"][2]}
        x = pd.DataFrame([{**row[C.FEATURES_C].to_dict(), **inj}])[FEATURES]
        p_home = float(model.predict_proba(x)[0, 1])

        book_ml, devig = {"hardrockbet_fl": {}, "kalshi": {}}, []
        for br in book_rows:
            if br["bookmaker"] not in book_ml:
                continue
            hm, am = float(br["home_moneyline"]), float(br["away_moneyline"])
            book_ml[br["bookmaker"]] = {"home": hm, "away": am}
            ph, pa = C.implied_prob(hm), C.implied_prob(am)
            devig.append(ph / (ph + pa))
        if not devig:
            skips.append((key, "no usable book odds"))
            continue
        mkt = sum(devig) / len(devig)
        db = {"event_id": str(eid), "season": int(row["season"]), "kickoff_time": kickoff_time,
              "home_team": full.get(home_code, home_code), "away_team": full.get(away_code, away_code),
              "model_version": MODEL_VERSION, "model_prob_home": p_home,
              **{c: row[c] for c in ("home_trail10_ppg", "home_trail10_papg", "away_trail10_ppg", "away_trail10_papg",
                                     "home_trail10_winpct", "away_trail10_winpct", "home_rest_days", "away_rest_days")},
              "home_b2b": int(row["home_b2b"]), "away_b2b": int(row["away_b2b"]),
              "home_prior_count": int(row["home_prior_count"]), "away_prior_count": int(row["away_prior_count"]),
              "home_moneyline_hardrockbet_fl": book_ml["hardrockbet_fl"].get("home"),
              "away_moneyline_hardrockbet_fl": book_ml["hardrockbet_fl"].get("away"),
              "home_moneyline_kalshi": book_ml["kalshi"].get("home"), "away_moneyline_kalshi": book_ml["kalshi"].get("away"),
              "market_prob_home_devigged": mkt, "n_books_used": len(devig), "edge_home": p_home - mkt,
              "home_favored_by_model": int(p_home - mkt > 0), "lock_timestamp_utc": lock_time.isoformat(),
              "features_sha256": hashlib.sha256(x.to_csv(index=False).encode()).hexdigest(),
              "odds_sha256": odds_sha256, "odds_csv_path": str(a.odds), "graded": 0, "note": None}
        try:
            conn.execute(f"INSERT INTO picks ({','.join(db)}) VALUES ({','.join('?' for _ in db)})", list(db.values()))
            conn.execute("INSERT OR REPLACE INTO injury_inputs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                         (str(eid), lock_time.isoformat(), report_url, inj["d_out"], inj["d_q"], inj["d_top"],
                          vals["home"][0], vals["home"][1], int(vals["home"][2]),
                          vals["away"][0], vals["away"][1], int(vals["away"][2]),
                          json.dumps(listed["home"]), json.dumps(listed["away"])))
            conn.commit()
            n_logged += 1
            print(f"  LOGGED {eid}: {away_code} @ {home_code} p_home={p_home:.3f} market={mkt:.3f} "
                  f"d_out={inj['d_out']:+.2f} d_q={inj['d_q']:+.2f} d_top={inj['d_top']:+.0f}")
        except sqlite3.IntegrityError as e:
            skips.append((key, f"already logged: {e}"))
    conn.close()
    print(f"\nDONE. Logged {n_logged} game(s), skipped {len(skips)}.")
    for k, why in skips:
        print(f"  {k}: {why}")


if __name__ == "__main__":
    main()
