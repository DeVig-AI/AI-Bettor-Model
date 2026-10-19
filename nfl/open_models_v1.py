#!/usr/bin/env python3
"""
open_models_v1.py -- DeVig's NFL picks next to open-source models other people have published, all graded here on
the same games with the same rules. Display and comparison only: nothing here feeds a DeVig pick, a test or a bet.

Models (credits and licenses are also in the app's About page):
  devig    DeVig's frozen Model 1.0 locks, read from nfl/PROSPECTIVE_TRACKER_V1_1.sqlite3 (read-only)
  nfelo    nfelo by greerreNFL (github.com/greerreNFL/nfelo). The repo has NO license, so none of its code is
           copied or run; only the picks it publishes (output_data/prediction_tracker.csv) are read and compared.
  elo538   FiveThirtyEight's NFL Elo game model (github.com/fivethirtyeight/nfl-elo-game, MIT). Their code is
           vendored unchanged in nfl/open_models/elo538/ and re-run here: their 1920-2020 results, then nflverse
           results from 2021 on. Their spread rule: Elo difference / 25 (65 Elo of home field is about 2.6 points).
  kalshi   the market baseline: Kalshi's main spread (the line closest to even money) and its win price.

Every run (GitHub Actions, nfl_open_models.yml):
  1. snapshot: for each NFL game kicking off in the next 8 days, append each model's current home line and home win
     chance to nfl/open_models/snapshots.jsonl -- only when the numbers changed, and never once the game has started.
  2. export: grade from nflverse final scores and write nfl/open_models_export.json for the app.

Grading rules (the same for every model; self-reported records are never used):
  - a model's pick for a game is its LAST snapshot taken before kickoff; games with no such snapshot don't count;
  - winner: the side its win chance favours (or its line when it has no win chance); ties don't count;
  - spread: against Kalshi's last pre-kickoff main line. Model line below Kalshi's = home side, above = away side,
    equal = no spread pick. Landing on the line is a push (not counted). Kalshi itself has no spread record;
  - Brier score on the home win chance where a model gives one (lower is better).

Usage:  python3 nfl/open_models_v1.py [snapshot] [export] [--games path/to/games.csv] [--no-kalshi] [--no-nfelo]
"""
import argparse
import csv
import io
import json
import math
import os
import sqlite3
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

HERE = Path(__file__).resolve().parent                      # repo/nfl
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
ELO_DIR = HERE / "open_models" / "elo538"
STORE = HERE / "open_models" / "snapshots.jsonl"
EXPORT = HERE / "open_models_export.json"
TRACKER = HERE / "PROSPECTIVE_TRACKER_V1_1.sqlite3"
DEVIG_DECIDER = "OLD_LAB28_43_HYBRID"                       # the decider the app shows (export_lineboard_nfl_v7.py)
GAMES_URL = "https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv"  # same as the grader
NFELO_URL = "https://raw.githubusercontent.com/greerreNFL/nfelo/main/output_data/prediction_tracker.csv"
UA = "devig-open-models/1.0 (personal research; read-only)"
AHEAD = timedelta(days=8)
RECENT = timedelta(days=21)                                  # finished games kept in the export's game list
ET = ZoneInfo("America/New_York")

MODELS = [
    {"key": "devig", "name": "DeVig", "author": "DeVig.AI (this project)",
     "url": "https://github.com/DeVig-AI/AI-Bettor-Model", "license": "this repo",
     "note": "Frozen Model 1.0 weekly lock (Wednesday)."},
    {"key": "nfelo", "name": "nfelo", "author": "Robby Greer (@greerreNFL)", "url": "https://github.com/greerreNFL/nfelo",
     "license": "none stated -- only its published picks are compared; no code copied",
     "note": "Picks as published in its repo's output_data/prediction_tracker.csv."},
    {"key": "elo538", "name": "538 Elo", "author": "FiveThirtyEight (ABC News)",
     "url": "https://github.com/fivethirtyeight/nfl-elo-game", "license": "MIT",
     "note": "Their open game model (no QB adjustment), re-run here on nflverse results; spread = Elo gap / 25."},
    {"key": "kalshi", "name": "Market", "author": "Kalshi prices", "url": "https://kalshi.com", "license": "public prices",
     "note": "Kalshi's main spread and win price: the baseline every model is graded against."},
]
KEYS = [m["key"] for m in MODELS]
TO_538 = {"LV": "OAK", "WAS": "WSH", "LA": "LAR"}            # nflverse code -> 538 franchise code (2021 on)
FROM_NFELO = {"LAR": "LA", "OAK": "LV", "WSH": "WAS", "JAC": "JAX"}


def now_utc():
    return datetime.now(timezone.utc)


def iso(t):
    return t.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_t(s):
    return datetime.fromisoformat(str(s).replace("Z", "+00:00")) if s else None


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8")


def num(x):
    try:
        v = float(x)
        return v if v == v else None
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------- schedule and results (nflverse)

def load_games(path=None):
    text = Path(path).read_text() if path else fetch(GAMES_URL)
    out = []
    for r in csv.DictReader(io.StringIO(text)):
        if not r.get("gameday"):
            continue
        hhmm = r.get("gametime") or "13:00"
        kick = datetime.fromisoformat(f"{r['gameday']}T{hhmm}").replace(tzinfo=ET).astimezone(timezone.utc)
        hs, as_ = num(r.get("home_score")), num(r.get("away_score"))
        out.append({"game_id": r["game_id"], "season": int(r["season"]), "week": int(r["week"]),
                    "game_type": r.get("game_type") or "REG", "home": r["home_team"], "away": r["away_team"],
                    "neutral": (r.get("location") or "") == "Neutral", "kickoff": kick, "gameday": r["gameday"],
                    "home_score": None if hs is None else int(hs), "away_score": None if as_ is None else int(as_)})
    out.sort(key=lambda g: (g["kickoff"], g["game_id"]))
    return out


# ---------------------------------------------------------------- 538 Elo, their code unchanged

def elo538(games):
    """{game_id: home win chance} for every nflverse game from 2021 on, from FiveThirtyEight's Forecast.forecast run
    over their own 1920-2020 file followed by nflverse's 2021+ games."""
    sys.path.insert(0, str(ELO_DIR))
    from util import Util            # noqa: E402  (vendored, MIT)
    from forecast import Forecast    # noqa: E402
    cwd = os.getcwd()
    os.chdir(ELO_DIR)                # their code opens data/initial_elos.csv relative to its folder
    try:
        rows = Util.read_games("data/nfl_games.csv")
        ids = []
        for g in games:
            if g["season"] < 2021:
                continue
            played = g["home_score"] is not None and g["away_score"] is not None
            res = None if not played else (1.0 if g["home_score"] > g["away_score"] else 0.0 if g["home_score"] < g["away_score"] else 0.5)
            rows.append({"date": g["gameday"], "season": g["season"], "neutral": 1 if g["neutral"] else 0,
                         "playoff": 0 if g["game_type"] == "REG" else 1,
                         "team1": TO_538.get(g["home"], g["home"]), "team2": TO_538.get(g["away"], g["away"]),
                         # their loop only fills my_prob1 when elo_prob1 is set; this marks "not 538's own number"
                         "elo_prob1": -1.0, "score1": g["home_score"] if played else None,
                         "score2": g["away_score"] if played else None, "result1": res})
            ids.append(g["game_id"])
        Forecast.forecast(rows)
    finally:
        os.chdir(cwd)
    probs = [r["my_prob1"] for r in rows if r.get("elo_prob1") == -1.0]
    return dict(zip(ids, probs))


def elo_line(p):
    """538's spread rule of thumb: home line = -(Elo difference incl. home field) / 25."""
    p = min(max(p, 1e-9), 1 - 1e-9)
    return -(-400 * math.log10(1 / p - 1)) / 25


# ---------------------------------------------------------------- the other sources

def nfelo_picks(upcoming):
    """[(game, home_line, home_wp)] from nfelo's published prediction_tracker.csv, matched to upcoming games."""
    out = []
    for r in csv.DictReader(io.StringIO(fetch(NFELO_URL))):
        h, a = FROM_NFELO.get(r.get("home_team"), r.get("home_team")), FROM_NFELO.get(r.get("away_team"), r.get("away_team"))
        g = next((x for x in upcoming if x["home"] == h and x["away"] == a), None)
        line, wp = num(r.get("nfelo_projected_home_spread")), num(r.get("nfelo_projected_home_win_probability"))
        if g and (line is not None or wp is not None):
            out.append((g, line, wp))
    return out


def devig_picks(games_by_id):
    """{game_id: (lock time, home_line, home_wp)}: the latest DeVig lock per game, as the app shows it."""
    if not TRACKER.exists():
        return {}
    c = sqlite3.connect(f"file:{TRACKER}?mode=ro", uri=True)
    c.row_factory = sqlite3.Row
    cols = {r[1] for r in c.execute("PRAGMA table_info(picks)")}
    out = {}
    for r in c.execute("SELECT * FROM picks WHERE decider_version = ? ORDER BY lock_timestamp_utc", (DEVIG_DECIDER,)):
        if r["game_id"] not in games_by_id:
            continue
        line = None
        fixed = "spread_input_convention" in cols and r["spread_input_convention"] is not None
        if fixed and num(r["spread_edge"]) is not None and num(r["market_home_margin"]) is not None:
            line = num(r["market_home_margin"]) - num(r["spread_edge"])     # same as the app's pred_home_margin
        out[r["game_id"]] = (iso(parse_t(r["lock_timestamp_utc"])), line, num(r["winner_p_home"]))
    c.close()
    return out


def kalshi_picks(upcoming):
    """[(game, home_line, home_wp)] from Kalshi's open NFL markets."""
    import kalshi_games_v1 as KG     # noqa: E402  (frozen; read-only use)
    out = []
    for g in KG.kalshi_games("NFL").values():
        a, h = KG.canon("NFL", g["away_code"]), KG.canon("NFL", g["home_code"])
        d = g.get("date")
        game = next((x for x in upcoming if x["home"] == h and x["away"] == a and (not d or abs(
            (datetime.fromisoformat(x["gameday"]) - datetime.fromisoformat(d)).days) <= 1)), None)
        if not game:
            continue
        ms = KG.main_spread(g, g["away_code"], g["home_code"])
        th, ta = g["teams"][g["home_code"]], g["teams"][g["away_code"]]
        mh, ma = KG._mid(th), KG._mid(ta)
        wp = mh / (mh + ma) if mh is not None and ma is not None and mh + ma > 0 else None
        if ms or wp is not None:
            out.append((game, ms[0] if ms else None, wp))
    return out, KG.log[:10]


# ---------------------------------------------------------------- the snapshot store (append-only JSONL)

def read_store():
    if not STORE.exists():
        return []
    return [json.loads(l) for l in STORE.read_text().splitlines() if l.strip()]


def r4(x):
    return None if x is None else round(float(x), 4)


def snapshot(games, use_kalshi=True, use_nfelo=True):
    now = now_utc()
    upcoming = [g for g in games if now < g["kickoff"] <= now + AHEAD]
    by_id = {g["game_id"]: g for g in upcoming}
    rows, errors = [], []
    seen = iso(now)
    try:
        probs = elo538(games)
        for g in upcoming:
            if g["game_id"] in probs:
                p = probs[g["game_id"]]
                rows.append(("elo538", g, seen, elo_line(p), p))
    except Exception as e:
        errors.append(f"elo538: {type(e).__name__}: {e}")
    if use_nfelo:
        try:
            rows += [("nfelo", g, seen, line, wp) for g, line, wp in nfelo_picks(upcoming)]
        except Exception as e:
            errors.append(f"nfelo: {type(e).__name__}: {e}")
    try:
        for gid, (at, line, wp) in devig_picks(by_id).items():
            rows.append(("devig", by_id[gid], at, line, wp))
    except Exception as e:
        errors.append(f"devig: {type(e).__name__}: {e}")
    if use_kalshi:
        try:
            kp, klog = kalshi_picks(upcoming)
            rows += [("kalshi", g, seen, line, wp) for g, line, wp in kp]
            errors += [f"kalshi: {x}" for x in klog]
        except Exception as e:
            errors.append(f"kalshi: {type(e).__name__}: {e}")

    last = {}
    for s in read_store():
        last[(s["game_id"], s["model"])] = (s.get("home_line"), s.get("home_wp"), s.get("at"))
    new = []
    for model, g, at, line, wp in rows:
        line, wp = r4(line), r4(wp)
        if parse_t(at) >= g["kickoff"] or now >= g["kickoff"]:
            continue                                   # never record anything once the game has started
        prev = last.get((g["game_id"], model))
        if prev and prev[0] == line and prev[1] == wp and (model != "devig" or prev[2] == at):
            continue
        new.append({"at": at, "seen": seen, "model": model, "game_id": g["game_id"], "kickoff": iso(g["kickoff"]),
                    "home_line": line, "home_wp": wp})
    if new:
        STORE.parent.mkdir(parents=True, exist_ok=True)
        with STORE.open("a") as f:
            for s in new:
                f.write(json.dumps(s, separators=(",", ":")) + "\n")
    print(f"snapshot: {len(upcoming)} upcoming games, {len(rows)} readings, {len(new)} new rows")
    for e in errors:
        print("  " + e)
    return errors


# ---------------------------------------------------------------- grading and export

def picks_before_kickoff(store):
    """{game_id: {model: snapshot}}: each model's last snapshot taken before kickoff."""
    out = {}
    for s in sorted(store, key=lambda s: s["at"]):
        if parse_t(s["at"]) < parse_t(s["kickoff"]) and parse_t(s["seen"]) < parse_t(s["kickoff"]):
            out.setdefault(s["game_id"], {})[s["model"]] = s
    return out


def winner_side(p):
    if p.get("home_wp") is not None and p["home_wp"] != 0.5:
        return "home" if p["home_wp"] > 0.5 else "away"
    if p.get("home_wp") is None and p.get("home_line"):
        return "home" if p["home_line"] < 0 else "away"
    return None


def grade(p, market_line, margin):
    """{'su': True/False/None, 'ats': True/False/None, 'ats_side': ..., 'brier': ...} for one model in one game.
    margin = home score - away score, or None while unplayed."""
    out = {"su_side": winner_side(p), "ats_side": None, "su": None, "ats": None, "brier": None}
    ml = p.get("home_line")
    if ml is not None and market_line is not None and p["model"] != "kalshi" and round(ml, 4) != round(market_line, 4):
        out["ats_side"] = "home" if ml < market_line else "away"
    if margin is None:
        return out
    if out["su_side"] and margin != 0:
        out["su"] = (margin > 0) == (out["su_side"] == "home")
    if out["ats_side"]:
        cover = margin + market_line
        if cover != 0:
            out["ats"] = (cover > 0) == (out["ats_side"] == "home")
    if p.get("home_wp") is not None and margin != 0:
        out["brier"] = round((p["home_wp"] - (1.0 if margin > 0 else 0.0)) ** 2, 4)
    return out


def export(games, errors=()):
    now = now_utc()
    store = read_store()
    picks = picks_before_kickoff(store)
    by_id = {g["game_id"]: g for g in games}
    season = max((g["season"] for g in games if g["kickoff"] <= now + AHEAD), default=now.year)
    tally = {k: {"su_w": 0, "su_l": 0, "ats_w": 0, "ats_l": 0, "ats_push": 0, "brier_sum": 0.0, "brier_n": 0, "n": 0}
             for k in KEYS}
    docs = []
    for gid, ps in sorted(picks.items(), key=lambda kv: by_id[kv[0]]["kickoff"] if kv[0] in by_id else now):
        g = by_id.get(gid)
        if not g or g["season"] != season:
            continue
        final = g["home_score"] is not None and g["away_score"] is not None and g["kickoff"] < now
        margin = g["home_score"] - g["away_score"] if final else None
        mkt = (ps.get("kalshi") or {}).get("home_line")
        out = {}
        for k in KEYS:
            p = ps.get(k)
            if not p:
                continue
            gr = grade(p, mkt, margin)
            out[k] = {"home_line": p["home_line"], "home_wp": p["home_wp"], "at": p["at"], **gr}
            if final:
                t = tally[k]
                t["n"] += 1
                if gr["su"] is not None:
                    t["su_w" if gr["su"] else "su_l"] += 1
                if gr["ats_side"] and gr["ats"] is None:
                    t["ats_push"] += 1
                elif gr["ats"] is not None:
                    t["ats_w" if gr["ats"] else "ats_l"] += 1
                if gr["brier"] is not None:
                    t["brier_sum"] += gr["brier"]
                    t["brier_n"] += 1
        if final and g["kickoff"] < now - RECENT:
            continue
        docs.append({"collection": "open_models", "doc_id": gid, "data": {
            "game_id": gid, "season": g["season"], "week": g["week"], "kickoff_time": iso(g["kickoff"]),
            "home_team": g["home"], "away_team": g["away"], "final": final,
            "home_score": g["home_score"] if final else None, "away_score": g["away_score"] if final else None,
            "market_line": mkt, "picks": out}})
    rows = []
    for m in MODELS:
        t = tally[m["key"]]
        su, ats = t["su_w"] + t["su_l"], t["ats_w"] + t["ats_l"]
        rows.append(dict(m, games=t["n"], su_w=t["su_w"], su_l=t["su_l"], su_pct=round(t["su_w"] / su, 4) if su else None,
                         ats_w=t["ats_w"], ats_l=t["ats_l"], ats_push=t["ats_push"],
                         ats_pct=None if m["key"] == "kalshi" else (round(t["ats_w"] / ats, 4) if ats else None),
                         brier=round(t["brier_sum"] / t["brier_n"], 4) if t["brier_n"] else None))
    first = min((s["seen"] for s in store), default=None)
    docs.append({"collection": "open_models_report", "doc_id": "NFL_OPEN_MODELS_V1", "data": {
        "doc": "NFL_OPEN_MODELS_V1", "sport": "NFL", "season": season, "tracking_since": first, "models": rows,
        "generated_at": iso(now), "errors": list(errors)[:20],
        "rules": ("Each model's last pick published before kickoff, graded here on nflverse final scores. Winner: the "
                  "side its win chance favours; ties don't count. Spread: against Kalshi's last pre-kickoff main line; "
                  "a model line equal to Kalshi's is no pick, landing on the line is a push. Brier: home win chance "
                  "vs result, lower is better. Comparison only -- not a test of any model and not a betting record.")}})
    def timeless(ds):
        return [dict(d, data={k: v for k, v in d["data"].items() if k != "generated_at"}) for d in ds]
    try:                                               # only the clock changed: keep the old file (no hourly commits)
        if timeless(json.loads(EXPORT.read_text()).get("docs", [])) == timeless(docs):
            print("export: unchanged")
            return
    except (OSError, ValueError):
        pass
    EXPORT.write_text(json.dumps({"generated_at": iso(now), "sport": "NFL", "n_docs": len(docs), "docs": docs},
                                 separators=(",", ":")))
    print(f"export: {len(docs) - 1} games, season {season}, tracking since {first}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("steps", nargs="*", default=["snapshot", "export"])
    ap.add_argument("--games", help="a local nflverse games.csv instead of downloading it")
    ap.add_argument("--no-kalshi", action="store_true")
    ap.add_argument("--no-nfelo", action="store_true")
    a = ap.parse_args()
    games = load_games(a.games)
    errors = []
    if "snapshot" in a.steps:
        errors = snapshot(games, use_kalshi=not a.no_kalshi, use_nfelo=not a.no_nfelo)
    if "export" in a.steps:
        export(games, errors)
    return 0


if __name__ == "__main__":
    sys.exit(main())
