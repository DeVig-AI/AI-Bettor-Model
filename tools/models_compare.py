#!/usr/bin/env python3
"""
models_compare.py -- the app's Models page: DeVig's own models next to open-source models other people publish,
with Kalshi's price as the baseline, all graded here on the same games with the same rules. Display and comparison
only: nothing here feeds a DeVig pick, a test or a bet.

Models (credits and licenses are also on the app's Models and About pages):
  devig   DeVig's own locks, read-only from its trackers: NFL Model 1.0, NBA Model C, MLB Model C (winner and run
          line), and the NFL / NBA props models v1 (from their logs).
  devig2  NFL Model 2.0 (Model 1.0 + injuries), paper-tracked beside Model 1.0: its latest forecasts from
          nfl/model2/upcoming.json (nfl/model2/nfl_model2_v1.py).
  nfelo   NFL, by greerreNFL (github.com/greerreNFL/nfelo). The repo has NO license, so none of its code is copied or
          run; only the picks it publishes (output_data/prediction_tracker.csv) are read.
  elo538  NFL, FiveThirtyEight's NFL Elo game model (github.com/fivethirtyeight/nfl-elo-game, MIT). Their code is
          vendored unchanged in nfl/open_models/elo538/ and re-run here: their 1920-2020 results, then nflverse
          results from 2021 on. Their spread rule: Elo difference / 25.
  blotny  NBA, by Blotny (github.com/Blotny/nba-win-probability-predictor, MIT). The picks it publishes
          (data/processed/upcoming_predictions.csv, the "primary" model) are read; its code is not run.
  cfbelo  CFB, College FBS Elo by schwill2018 (github.com/schwill2018/college-football-elo). NO license, so none of
          its code is copied or run; only the predictions it publishes (historical_predictions.csv: home win chance
          and spread, with the time each was made) are read, the last one made before kickoff.
  cfbrank CFB, CFB Rankings by Brandon Keck (github.com/brandon-keck/cfb-rankings, MIT). Its published weekly Elo
          ratings (data/elo_full_field_weekly.csv) turned into a home win chance with its own documented formula
          (Elo 400 scale, +65 for the home team, none at a neutral site). Winner only: it publishes no spread.
  kalshi  the market baseline in every tab: Kalshi's win price, main spread, main total (MLB: the 1.5 run line).

Every run (GitHub Actions, models_compare.yml):
  1. read every model's current number for each game not yet started (NFL: next 8 days, NBA / MLB: next 36 hours)
     into live/models/latest.json -- overwritten each run, never touched for a game once it has started;
  2. once a game has started, its last pre-start numbers move from latest.json to live/models/picks.jsonl
     (append-only: one row per game and model, the pick that is graded);
  3. finals are appended to live/models/results.jsonl (NFL from nflverse, as the NFL grader does; NBA / MLB ESPN);
  4. live/models_export.json is written for the app.

Grading (the same rules for every model; nobody's self-reported record is used):
  - moneyline: the side the model's win chance favours, every game it has a number for (so DeVig's row is not its
    confident-picks Track record). Profit: 1 unit at Kalshi's last pre-start price for that side, fee included;
  - spread: a model's line against Kalshi's last pre-start main line (lower = home side, higher = away, equal = no
    pick); a model that picks a side at a stated line and price (DeVig's MLB run line) is graded at that line.
    Landing on the line is a push. Break-even shown is 52.4% (-110), or the average price for MLB run lines;
  - total: no model here makes totals yet, so only the market baseline (the over at Kalshi's main total) is shown;
  - props: DeVig's props models, graded from their own logs (Kalshi settlement / nflverse stats), profit after
    Kalshi's ask price and fee. The market bar is the average price paid: the win rate Kalshi's price implies.
  - market baselines: the Kalshi favourite (moneyline, spread), the over (total).
Pushes and ties aren't counted. Records start when tracking started; earlier games aren't counted (props: since
the props test began).

Beating the close (moneyline; the measure professional bettors use, because it needs no luck to read): for each
graded pick, Kalshi's win chance for the picked side when the pick was made against its last price before the game.
Both are Kalshi's two asks with the vig removed (ask ratio). "When the pick was made": DeVig's own trackers store the
Kalshi moneylines at lock; for the other models it is the Kalshi price this script saw the hour their number first
appeared. "Last price": this script's last hourly Kalshi reading before the game (so up to an hour early). A model
whose picks keep moving the price its way afterwards is ahead of the market; one that doesn't, isn't, whatever its
win-loss record says while the sample is small.

Usage:  python3 tools/models_compare.py [--nfl-games games.csv] [--offline] [--now ISO]
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

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))
import kalshi_games_v1 as KG  # noqa: E402  (frozen; read-only use)

DIR = ROOT / "live" / "models"
LATEST, PICKS, RESULTS = DIR / "latest.json", DIR / "picks.jsonl", DIR / "results.jsonl"
EXPORT = ROOT / "live" / "models_export.json"
ELO_DIR = ROOT / "nfl" / "open_models" / "elo538"
NFL_TRACKER = ROOT / "nfl" / "PROSPECTIVE_TRACKER_V1_1.sqlite3"
NFL_MODEL2 = ROOT / "nfl" / "model2" / "upcoming.json"
NBA_TRACKER = ROOT / "nba" / "NBA_PROSPECTIVE_TRACKER_V1.sqlite3"
MLB_TRACKER = ROOT / "mlb" / "MLB_PROSPECTIVE_TRACKER_V1.sqlite3"
NFL_PROPS = ROOT / "nfl" / "PROPS_MODEL_V1_LOG.sqlite3"
NBA_PROPS = ROOT / "nba" / "NBA_PROPS_MODEL_V2_LOG.sqlite3"   # the live NBA props model since 2026-10-22 (v1 stopped then)
NFL_DECIDER = "OLD_LAB28_43_HYBRID"                          # the decider the app shows (export_lineboard_nfl_v8.py)
NFL_GAMES_URL = "https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv"  # as the grader
NFELO_URL = "https://raw.githubusercontent.com/greerreNFL/nfelo/main/output_data/prediction_tracker.csv"
CFBELO_URL = "https://raw.githubusercontent.com/schwill2018/college-football-elo/main/historical_predictions.csv"
CFBRANK_URL = "https://raw.githubusercontent.com/brandon-keck/cfb-rankings/main/data/elo_full_field_weekly.csv"
BLOTNY_URL = "https://raw.githubusercontent.com/Blotny/nba-win-probability-predictor/main/data/processed/upcoming_predictions.csv"
ESPN = "https://site.api.espn.com/apis/site/v2/sports/{}/scoreboard"
UA = "devig-models-compare/1.0 (personal research; read-only)"
ET = ZoneInfo("America/New_York")
AHEAD = {"NFL": timedelta(days=8), "NBA": timedelta(hours=36), "MLB": timedelta(hours=36), "CFB": timedelta(days=8)}
SPORTS = ("NFL", "NBA", "MLB", "CFB")
RECENT = timedelta(days=4)                                    # finished games kept in the page's game list
BREAKEVEN_110 = 110 / 210

MODELS = [
    {"key": "devig", "name": "DeVig", "sports": ["NFL", "NBA", "MLB"], "author": "DeVig.AI (this project)",
     "url": "https://github.com/DeVig-AI/AI-Bettor-Model", "license": "this project",
     "note": "DeVig's own locked picks: NFL Model 1.0, NBA and MLB Model C, the props models v1."},
    {"key": "devig2", "name": "DeVig 2.0", "sports": ["NFL"], "author": "DeVig.AI (this project)",
     "url": "https://github.com/DeVig-AI/AI-Bettor-Model/blob/main/nfl/model2/NFL_MODEL_2_0_LIVE_PREREG.md",
     "license": "this project",
     "note": "NFL Model 1.0 plus who is out (injury reports and rosters). Paper test only: the app's picks stay on Model 1.0."},
    {"key": "nfelo", "name": "nfelo", "sports": ["NFL"], "author": "Robby Greer (@greerreNFL)",
     "url": "https://github.com/greerreNFL/nfelo", "license": "none stated: only its published picks are read, no code copied",
     "note": "Its weekly picks as published in output_data/prediction_tracker.csv."},
    {"key": "elo538", "name": "538 Elo", "sports": ["NFL"], "author": "FiveThirtyEight (ABC News)",
     "url": "https://github.com/fivethirtyeight/nfl-elo-game", "license": "MIT",
     "note": "Their open game model (no QB adjustment), re-run here on nflverse results; spread = Elo gap / 25."},
    {"key": "blotny", "name": "Blotny NBA", "sports": ["NBA"], "author": "Blotny",
     "url": "https://github.com/Blotny/nba-win-probability-predictor", "license": "MIT",
     "note": "Its published daily predictions (the primary model); a small hobby project."},
    {"key": "cfbelo", "name": "FBS Elo", "sports": ["CFB"], "author": "schwill2018",
     "url": "https://github.com/schwill2018/college-football-elo", "license": "none stated: only its published picks are read, no code copied",
     "note": "Its published predictions (historical_predictions.csv): the last one made before kickoff."},
    {"key": "cfbrank", "name": "CFB Rankings", "sports": ["CFB"], "author": "Brandon Keck",
     "url": "https://github.com/brandon-keck/cfb-rankings", "license": "MIT",
     "note": "Its weekly Elo ratings, turned into a win chance with its own formula (+65 home, 400 scale). Winner only."},
    {"key": "kalshi", "name": "Market", "sports": ["NFL", "NBA", "MLB", "CFB"], "author": "Kalshi prices",
     "url": "https://kalshi.com", "license": "public prices",
     "note": "The baseline: Kalshi's favourite (moneyline, spread) and the over (total), at Kalshi's price."},
]
# which model makes which kind of pick, per sport (anything else shows "—" on the page)
COVERS = {"NFL": {"ml": {"devig", "devig2", "nfelo", "elo538", "kalshi"}, "spread": {"devig", "nfelo", "elo538", "kalshi"}, "total": {"kalshi"}},
          "NBA": {"ml": {"devig", "blotny", "kalshi"}, "spread": {"blotny", "kalshi"}, "total": {"kalshi"}},
          "MLB": {"ml": {"devig", "kalshi"}, "spread": {"devig", "kalshi"}, "total": {"kalshi"}},
          "CFB": {"ml": {"cfbelo", "cfbrank", "kalshi"}, "spread": {"cfbelo", "kalshi"}, "total": {"kalshi"}}}
TO_538 = {"LV": "OAK", "WAS": "WSH", "LA": "LAR"}            # nflverse code -> 538 franchise code (2021 on)
FROM_NFELO = {"LAR": "LA", "OAK": "LV", "WSH": "WAS", "JAC": "JAX"}
errors = []


def iso(t):
    return t.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_t(s):
    return datetime.fromisoformat(str(s).replace("Z", "+00:00")) if s else None


def num(x):
    try:
        v = float(x)
        return v if v == v else None
    except (TypeError, ValueError):
        return None


def r4(x):
    return None if x is None else round(float(x), 4)


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8")


def note(where, e):
    errors.append(f"{where}: {type(e).__name__}: {e}"[:300])


def ro(path):
    c = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    c.row_factory = sqlite3.Row
    return c


def ml_payout(odds):
    """Profit on 1 unit at American odds."""
    return None if odds is None else (odds / 100 if odds > 0 else 100 / -odds)


def breakeven(odds):
    return None if odds is None else (100 / (odds + 100) if odds > 0 else -odds / (100 - odds))


def novig(home_ml, away_ml):
    """Home win chance from two American prices with the vig removed (each side's break-even over their sum)."""
    h, a = breakeven(num(home_ml)), breakeven(num(away_ml))
    return None if h is None or a is None or h + a <= 0 else h / (h + a)


# ================================================================ games: what is coming up, and finals

def nfl_games(path=None):
    text = Path(path).read_text() if path else fetch(NFL_GAMES_URL)
    out = []
    for r in csv.DictReader(io.StringIO(text)):
        if not r.get("gameday"):
            continue
        kick = datetime.fromisoformat(f"{r['gameday']}T{r.get('gametime') or '13:00'}").replace(tzinfo=ET).astimezone(timezone.utc)
        hs, as_ = num(r.get("home_score")), num(r.get("away_score"))
        out.append({"sport": "NFL", "game_id": r["game_id"], "season": int(r["season"]), "game_type": r.get("game_type") or "REG",
                    "home": r["home_team"], "away": r["away_team"], "neutral": (r.get("location") or "") == "Neutral",
                    "kickoff": kick, "date": r["gameday"],
                    "home_score": None if hs is None else int(hs), "away_score": None if as_ is None else int(as_)})
    out.sort(key=lambda g: (g["kickoff"], g["game_id"]))
    return out


def espn_day(sport, day):
    """ESPN's games on a US date: [{game_id (ESPN event id), kickoff, home, away, home_name, away_name, state, scores}]."""
    d = KG.get(ESPN.format(KG.ESPN[sport]), {"dates": day.replace("-", "")}) or {}
    out = []
    for ev in d.get("events") or []:
        comp = (ev.get("competitions") or [{}])[0]
        side = {c.get("homeAway"): c for c in comp.get("competitors") or []}
        if "home" not in side or "away" not in side:
            continue
        st = (ev.get("status") or {}).get("type") or {}
        h, a = side["home"], side["away"]
        out.append({"sport": sport, "game_id": str(ev.get("id")), "kickoff": parse_t(ev.get("date")), "date": day,
                    "home": KG.canon(sport, (h.get("team") or {}).get("abbreviation")),
                    "away": KG.canon(sport, (a.get("team") or {}).get("abbreviation")),
                    "home_name": (h.get("team") or {}).get("displayName"), "away_name": (a.get("team") or {}).get("displayName"),
                    "final": bool(st.get("completed")) and st.get("state") == "post",
                    "home_score": num(h.get("score")), "away_score": num(a.get("score"))})
    return out


def et_day(t):
    return t.astimezone(ET).strftime("%Y-%m-%d")


# ================================================================ the models

def elo538(games):
    """{game_id: home win chance} for every nflverse game from 2021 on, from FiveThirtyEight's Forecast.forecast run
    unchanged over their 1920-2020 file followed by nflverse's 2021+ games."""
    sys.path.insert(0, str(ELO_DIR))
    from util import Util            # noqa: E402  (vendored, MIT)
    from forecast import Forecast    # noqa: E402
    cwd = os.getcwd()
    os.chdir(ELO_DIR)                # their code opens data/initial_elos.csv relative to its folder
    try:
        rows, ids = Util.read_games("data/nfl_games.csv"), []
        for g in games:
            if g["season"] < 2021:
                continue
            played = g["home_score"] is not None and g["away_score"] is not None
            res = None if not played else (1.0 if g["home_score"] > g["away_score"] else 0.0 if g["home_score"] < g["away_score"] else 0.5)
            rows.append({"date": g["date"], "season": g["season"], "neutral": 1 if g["neutral"] else 0,
                         "playoff": 0 if g["game_type"] == "REG" else 1,
                         "team1": TO_538.get(g["home"], g["home"]), "team2": TO_538.get(g["away"], g["away"]),
                         # their loop only fills my_prob1 when elo_prob1 is set; -1 marks "not 538's own number"
                         "elo_prob1": -1.0, "score1": g["home_score"] if played else None,
                         "score2": g["away_score"] if played else None, "result1": res})
            ids.append(g["game_id"])
        Forecast.forecast(rows)
    finally:
        os.chdir(cwd)
    return dict(zip(ids, [r["my_prob1"] for r in rows if r.get("elo_prob1") == -1.0]))


def elo_line(p):
    """538's spread rule of thumb: home line = -(Elo difference incl. home field) / 25."""
    p = min(max(p, 1e-9), 1 - 1e-9)
    return 400 * math.log10(1 / p - 1) / 25


def read_nfelo(upcoming):
    out = {}
    for r in csv.DictReader(io.StringIO(fetch(NFELO_URL))):
        h, a = FROM_NFELO.get(r.get("home_team"), r.get("home_team")), FROM_NFELO.get(r.get("away_team"), r.get("away_team"))
        g = next((x for x in upcoming if x["home"] == h and x["away"] == a), None)
        line, wp = num(r.get("nfelo_projected_home_spread")), num(r.get("nfelo_projected_home_win_probability"))
        if g and (line is not None or wp is not None):
            out[g["game_id"]] = {"home_line": line, "home_wp": wp}
    return out


def read_blotny(upcoming):
    best = {}
    for r in csv.DictReader(io.StringIO(fetch(BLOTNY_URL))):
        if (r.get("role") or "").lower() != "primary":
            continue
        h, a = KG.canon("NBA", r.get("HOME_TEAM_ABBR")), KG.canon("NBA", r.get("AWAY_TEAM_ABBR"))
        g = next((x for x in upcoming if x["home"] == h and x["away"] == a and x["date"] == r.get("GAME_DATE")), None)
        wp, margin, at = num(r.get("home_win_prob")), num(r.get("pred_margin")), r.get("predicted_at")
        if not g or wp is None or not parse_t(at):
            continue
        if g["game_id"] not in best or at > best[g["game_id"]]["at"]:
            best[g["game_id"]] = {"home_wp": wp, "home_line": None if margin is None else -margin, "at": iso(parse_t(at))}
    return best


# ---- college football (keyless: ESPN's FBS scoreboard, Kalshi, the two open models' published files) ----
def cfb_upcoming(now):
    """ESPN's FBS games from 3 days ago to 9 days ahead, in this file's game shape (game_id = ESPN event id)."""
    import game_lines as GL
    out = []
    for e in GL.espn_cfb(now).values():
        out.append({"sport": "CFB", "game_id": e["espn_id"], "kickoff": parse_t(e["kickoff"]), "date": e["date"],
                    "home": e["home"], "away": e["away"], "home_names": e["home_names"], "away_names": e["away_names"],
                    "neutral": e["neutral"], "final": e["state"] == "post", "home_score": e["home_score"],
                    "away_score": e["away_score"]})
    return out


def read_cfbelo(upcoming):
    """schwill2018's published predictions: the last one made before each game's kickoff (no license: read only)."""
    by_id = {g["game_id"]: g for g in upcoming}
    best = {}
    for r in csv.DictReader(io.StringIO(fetch(CFBELO_URL))):
        g = by_id.get(str(r.get("game_id")))
        at, wp, line = parse_t(r.get("prediction_timestamp")), num(r.get("p_home")), num(r.get("model_home_spread"))
        if not g or not at or wp is None or at >= g["kickoff"]:
            continue
        if g["game_id"] not in best or at > parse_t(best[g["game_id"]]["at"]):
            best[g["game_id"]] = {"home_wp": wp, "home_line": line, "at": iso(at)}
    return best


def read_cfbrank(upcoming, season):
    """Brandon Keck's latest weekly Elo ratings (MIT) -> home win chance with its own formula."""
    rows = [r for r in csv.DictReader(io.StringIO(fetch(CFBRANK_URL))) if r.get("season") == str(season)]
    if not rows:
        return {}
    wk = max(int(r["week"]) for r in rows)
    rating = {r["team"]: num(r["rating"]) for r in rows if int(r["week"]) == wk}
    import cfb_teams
    def find(names):
        return next((v for t, v in rating.items() if v is not None and cfb_teams.matches_any(t, names)), None)
    out = {}
    for g in upcoming:
        rh, ra = find(g["home_names"]), find(g["away_names"])
        if rh is None or ra is None:
            continue
        d = rh - ra + (0 if g["neutral"] else 65.0)
        out[g["game_id"]] = {"home_wp": 1 / (1 + 10 ** (-d / 400))}
    return out


def read_kalshi_cfb(now, upcoming):
    import game_lines as GL
    ids = {g["game_id"] for g in upcoming}
    out = {}
    for x in GL.cfb_games(now)[0]:
        if x["espn_id"] not in ids:
            continue
        p = {"home_wp": x["home_wp"], "home_ml": x["ml"]["home"], "away_ml": x["ml"]["away"]}
        if x["spread"]:
            p.update(home_line=x["spread"]["home_point"], home_spread_odds=x["spread"]["home"], away_spread_odds=x["spread"]["away"])
        if x["total"]:
            p.update(total=x["total"]["line"], over_odds=x["total"]["over"], under_odds=x["total"]["under"])
        out[x["espn_id"]] = p
    return out


def latest_lock(rows, key):
    out = {}
    for r in rows:
        out[r[key]] = r                                       # rows come ordered by lock time: the last one wins
    return out


def devig_nfl(by_id):
    if not NFL_TRACKER.exists():
        return {}
    c = ro(NFL_TRACKER)
    cols = {r[1] for r in c.execute("PRAGMA table_info(picks)")}
    rows = [r for r in c.execute("SELECT * FROM picks WHERE decider_version = ? ORDER BY lock_timestamp_utc", (NFL_DECIDER,))
            if r["game_id"] in by_id and parse_t(r["lock_timestamp_utc"]) < by_id[r["game_id"]]["kickoff"]]
    out = {}
    for gid, r in latest_lock(rows, "game_id").items():
        line = None
        if "spread_input_convention" in cols and r["spread_input_convention"] is not None \
                and num(r["spread_edge"]) is not None and num(r["market_home_margin"]) is not None:
            line = num(r["market_home_margin"]) - num(r["spread_edge"])     # the app's pred_home_margin
        out[gid] = {"home_wp": num(r["winner_p_home"]), "home_line": line, "at": iso(parse_t(r["lock_timestamp_utc"])),
                    "mkt_wp": r4(novig(r["home_moneyline"], r["away_moneyline"]))}
    c.close()
    return out


def devig2_nfl(by_id):
    """NFL Model 2.0's latest forecasts (nfl/model2/upcoming.json, written by its own workflow)."""
    if not NFL_MODEL2.exists():
        return {}
    games = json.loads(NFL_MODEL2.read_text()).get("games") or {}
    return {gid: {"home_wp": num(v.get("home_wp"))} for gid, v in games.items() if gid in by_id and num(v.get("home_wp")) is not None}


def devig_nba(by_id):
    if not NBA_TRACKER.exists():
        return {}
    c = ro(NBA_TRACKER)
    rows = [r for r in c.execute("SELECT * FROM picks ORDER BY lock_timestamp_utc")
            if str(r["event_id"]) in by_id and parse_t(r["lock_timestamp_utc"]) < by_id[str(r["event_id"])]["kickoff"]]
    out = {str(k): {"home_wp": num(r["model_prob_home"]), "at": iso(parse_t(r["lock_timestamp_utc"])),
                    "mkt_wp": r4(novig(r["home_moneyline_kalshi"], r["away_moneyline_kalshi"]))}
           for k, r in latest_lock(rows, "event_id").items()}
    c.close()
    return out


def match_by_names(games, day, home_full, away_full):
    h, a = KG.norm(home_full), KG.norm(away_full)
    return next((g for g in games if g["date"] == day and KG.norm(g["home_name"]) == h and KG.norm(g["away_name"]) == a), None)


def devig_mlb(upcoming):
    if not MLB_TRACKER.exists():
        return {}
    c = ro(MLB_TRACKER)
    out = {}
    for r in c.execute("SELECT * FROM picks ORDER BY lock_timestamp_utc"):
        g = match_by_names(upcoming, r["game_date"], r["home_team_full"], r["away_team_full"])
        if g and parse_t(r["lock_timestamp_utc"]) < g["kickoff"]:
            out.setdefault(g["game_id"], {}).update(home_wp=num(r["model_prob_home"]), at=iso(parse_t(r["lock_timestamp_utc"])),
                                                    mkt_wp=r4(novig(r["home_moneyline_kalshi"], r["away_moneyline_kalshi"])))
    for r in c.execute("SELECT * FROM spread_picks ORDER BY lock_timestamp_utc"):
        g = match_by_names(upcoming, r["game_date"], r["home_team_full"], r["away_team_full"])
        if not g or parse_t(r["lock_timestamp_utc"]) >= g["kickoff"] or r["spread_side_team"] is None:
            continue
        side = "home" if r["spread_side_team"] == r["home_team"] else "away"
        point = num(r["home_spread_point"] if side == "home" else r["away_spread_point"])
        price = num(r["home_spread_price"] if side == "home" else r["away_spread_price"])
        if point is not None:
            p = out.setdefault(g["game_id"], {})
            p.update(spread_side=side, spread_point=point, spread_price=price)
            p["at"] = max(p.get("at") or "", iso(parse_t(r["lock_timestamp_utc"])))
    c.close()
    return out


def read_kalshi(sport, upcoming):
    out = {}
    for g in KG.kalshi_games(sport).values():
        a, h = KG.canon(sport, g["away_code"]), KG.canon(sport, g["home_code"])
        d = g.get("date")
        game = next((x for x in upcoming if x["home"] == h and x["away"] == a and (not d or abs(
            (datetime.fromisoformat(x["date"]) - datetime.fromisoformat(d)).days) <= 1)), None)
        if not game:
            continue
        th, ta = g["teams"][g["home_code"]], g["teams"][g["away_code"]]
        mh, ma = KG._mid(th), KG._mid(ta)
        p = {"home_wp": r4(mh / (mh + ma)) if mh is not None and ma is not None and mh + ma > 0 else None,
             "home_ml": KG.american(th["ask"]), "away_ml": KG.american(ta["ask"])}
        ms = KG.main_spread(g, g["away_code"], g["home_code"])
        if sport == "MLB":
            ms = KG.spread_at(g, g["away_code"], g["home_code"], 1.5)
        if ms:
            p.update(home_line=ms[0], home_spread_odds=ms[1], away_spread_odds=ms[2])
        mt = KG.main_total(g)
        if mt:
            p.update(total=mt[0], over_odds=mt[1], under_odds=mt[2])
        if any(v is not None for v in p.values()):
            out[game["game_id"]] = p
    return out


# ================================================================ the stores

def read_jsonl(path):
    return [json.loads(l) for l in path.read_text().splitlines() if l.strip()] if path.exists() else []


def append_jsonl(path, rows):
    if rows:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a") as f:
            for r in rows:
                f.write(json.dumps(r, separators=(",", ":"), sort_keys=True) + "\n")


def update(now, nfl_csv=None, offline=False):
    latest = json.loads(LATEST.read_text()) if LATEST.exists() else {"games": {}}
    games = latest.setdefault("games", {})
    seen = iso(now)

    # what is coming up, per sport
    upcoming, finals = {}, {}
    try:
        ng = nfl_games(nfl_csv)
        upcoming["NFL"] = [g for g in ng if now < g["kickoff"] <= now + AHEAD["NFL"]]
        finals["NFL"] = {g["game_id"]: g for g in ng if g["home_score"] is not None and g["away_score"] is not None}
    except Exception as e:
        ng = []
        note("nflverse", e)
    for sport in ("NBA", "MLB"):
        if offline:
            continue
        days = {et_day(now + timedelta(hours=h)) for h in (-24, 0, 24, 36)}
        days |= {v["date"] for v in games.values() if v["sport"] == sport}       # games waiting for a final
        days = sorted(days)[-10:]
        allg = []
        for d in days:
            try:
                allg += espn_day(sport, d)
            except Exception as e:
                note(f"espn {sport} {d}", e)
        upcoming[sport] = [g for g in allg if g["kickoff"] and now < g["kickoff"] <= now + AHEAD[sport]]
        finals[sport] = {g["game_id"]: g for g in allg if g["final"]}
    if not offline:
        try:
            allg = cfb_upcoming(now)
            upcoming["CFB"] = [g for g in allg if g["kickoff"] and now < g["kickoff"] <= now + AHEAD["CFB"]]
            finals["CFB"] = {g["game_id"]: g for g in allg if g["final"]}
        except Exception as e:
            note("espn CFB", e)

    # every model's current number for each game not started yet
    readings = []                                   # (sport, game, model, values)
    for sport, ups in upcoming.items():
        by_id = {g["game_id"]: g for g in ups}
        sources = []
        if sport == "NFL":
            def elo():
                probs = elo538(ng)
                return {gid: {"home_wp": probs[gid], "home_line": elo_line(probs[gid])} for gid in by_id if gid in probs}
            sources = [("elo538", elo), ("devig", lambda: devig_nfl(by_id)), ("devig2", lambda: devig2_nfl(by_id))]
            if not offline:
                sources.append(("nfelo", lambda: read_nfelo(ups)))
        elif sport == "NBA":
            sources = [("devig", lambda: devig_nba(by_id)), ("blotny", lambda: read_blotny(ups))]
        elif sport == "CFB":
            season = now.year if now.month >= 7 else now.year - 1
            sources = [("cfbelo", lambda: read_cfbelo(ups)), ("cfbrank", lambda: read_cfbrank(ups, season))]
        else:
            sources = [("devig", lambda: devig_mlb(ups))]
        if not offline:
            if sport == "CFB":
                sources.append(("kalshi", lambda u=ups: read_kalshi_cfb(now, u)))
            else:
                sources.append(("kalshi", lambda s=sport: read_kalshi(s, ups)))
        for model, fn in sources:
            try:
                for gid, vals in fn().items():
                    readings.append((sport, by_id[gid], model, vals))
            except Exception as e:
                note(f"{sport} {model}", e)
    errors.extend(f"kalshi: {x}" for x in KG.log[:10])

    kal_now = {(sport, g["game_id"]): novig(v.get("home_ml"), v.get("away_ml"))
               for sport, g, model, v in readings if model == "kalshi"}
    for sport, g, model, vals in readings:
        if now >= g["kickoff"]:
            continue
        key = f"{sport}:{g['game_id']}"
        e = games.setdefault(key, {"sport": sport, "game_id": g["game_id"], "kickoff": iso(g["kickoff"]), "date": g["date"],
                                   "home": g["home"], "away": g["away"], "picks": {}})
        e["kickoff"] = iso(g["kickoff"])                # a rescheduled game moves
        vals = {k: (r4(v) if isinstance(v, float) else v) for k, v in vals.items()}
        at = vals.pop("at", None) or seen
        old = e["picks"].get(model)
        if old and {k: v for k, v in old.items() if k not in ("at", "seen", "mkt_wp")} == {k: v for k, v in vals.items() if k != "mkt_wp"}:
            if old.get("mkt_wp") is None and vals.get("mkt_wp") is not None:
                old["mkt_wp"] = vals["mkt_wp"]          # a tracker's own lock price, for a pick stored before it was read
            continue                                    # unchanged: keep the time it was first seen (and its price)
        if model != "kalshi" and vals.get("mkt_wp") is None:   # Kalshi's price now, as this number first appears
            k = kal_now.get((sport, g["game_id"]))
            if k is None:
                k = novig((e["picks"].get("kalshi") or {}).get("home_ml"), (e["picks"].get("kalshi") or {}).get("away_ml"))
            vals["mkt_wp"] = r4(k)
        e["picks"][model] = dict(vals, at=at, seen=seen)

    # games that have started: their last pre-start numbers become the graded picks
    done = {(p["sport"], p["game_id"], p["model"]) for p in read_jsonl(PICKS)}
    new_picks = []
    for key, e in list(games.items()):
        kick = parse_t(e["kickoff"])
        if now < kick:
            continue
        for model, p in e["picks"].items():
            if parse_t(p["at"]) < kick and parse_t(p["seen"]) < kick and (e["sport"], e["game_id"], model) not in done:
                new_picks.append(dict(p, sport=e["sport"], game_id=e["game_id"], model=model, kickoff=e["kickoff"],
                                      home=e["home"], away=e["away"], date=e["date"]))
        e["started"] = True
    append_jsonl(PICKS, new_picks)

    # finals for games that have graded picks
    have = {(r["sport"], r["game_id"]) for r in read_jsonl(RESULTS)}
    new_results = []
    for key, e in list(games.items()):
        if not e.get("started"):
            continue
        f = finals.get(e["sport"], {}).get(e["game_id"])
        if f and f["home_score"] is not None and f["away_score"] is not None:
            if (e["sport"], e["game_id"]) not in have:
                new_results.append({"sport": e["sport"], "game_id": e["game_id"], "home_score": int(f["home_score"]),
                                    "away_score": int(f["away_score"]), "seen": seen})
            del games[key]                              # graded: it lives in picks.jsonl + results.jsonl now
        elif now - parse_t(e["kickoff"]) > timedelta(days=10):
            del games[key]                              # never finished (postponed): its picks stay ungraded
    append_jsonl(RESULTS, new_results)

    LATEST.parent.mkdir(parents=True, exist_ok=True)
    LATEST.write_text(json.dumps({"games": dict(sorted(games.items()))}, separators=(",", ":"), sort_keys=True))
    print(f"update: {sum(len(v) for v in upcoming.values())} upcoming, {len(readings)} readings, "
          f"{len(new_picks)} picks locked, {len(new_results)} finals")


# ================================================================ grading

def ml_side(p):
    wp = p.get("home_wp")
    if wp is not None:
        return None if wp == 0.5 else ("home" if wp > 0.5 else "away")
    line = p.get("home_line")
    return None if not line else ("home" if line < 0 else "away")


def grade_game(sport, picks, res):
    """{model: {bet type: (won True/False/None for push, profit or None, break-even or None)}} for one game."""
    k = picks.get("kalshi") or {}
    margin = None if res is None else res["home_score"] - res["away_score"]
    out = {}

    def won_side(side, point=0.0):
        m = margin if side == "home" else -margin
        return None if m + point == 0 else m + point > 0

    for model, p in picks.items():
        g = {}
        # moneyline
        side = ml_side(p)
        if side and margin is not None and margin != 0:
            w = (margin > 0) == (side == "home")
            odds = k.get("home_ml" if side == "home" else "away_ml")
            g["ml"] = (w, None if odds is None else (ml_payout(odds) if w else -1.0), breakeven(odds))
        # spread
        if margin is not None:
            if model == "kalshi":
                line = p.get("home_line")
                if line:
                    fav = "home" if line < 0 else "away"
                    pt = line if fav == "home" else -line
                    odds = p.get("home_spread_odds" if fav == "home" else "away_spread_odds")
                    g["spread"] = (won_side(fav, pt), None, breakeven(odds) if sport == "MLB" else BREAKEVEN_110)
            elif p.get("spread_side") and p.get("spread_point") is not None:
                g["spread"] = (won_side(p["spread_side"], p["spread_point"]), None,
                               breakeven(p.get("spread_price")) if sport == "MLB" else BREAKEVEN_110)
            elif p.get("home_line") is not None and k.get("home_line") is not None and sport != "MLB" \
                    and round(p["home_line"], 4) != round(k["home_line"], 4):
                side = "home" if p["home_line"] < k["home_line"] else "away"
                pt = k["home_line"] if side == "home" else -k["home_line"]
                g["spread"] = (won_side(side, pt), None, BREAKEVEN_110)
        # total (market baseline only: the over)
        if model == "kalshi" and res is not None and p.get("total") is not None:
            tot = res["home_score"] + res["away_score"] - p["total"]
            g["total"] = (None if tot == 0 else tot > 0, None, BREAKEVEN_110)
        out[model] = g
    return out


def clv(pick, close):
    """How far Kalshi's price moved toward the picked side between the pick and the last price before the game, in
    win-chance points (0.03 = 3 points), or None when either price or the side is missing."""
    side = ml_side(pick)
    if side is None or not close or pick.get("mkt_wp") is None:
        return None
    end = novig(close.get("home_ml"), close.get("away_ml"))
    if end is None:
        end = close.get("home_wp")
    if end is None:
        return None
    move = end - pick["mkt_wp"]
    return round(move if side == "home" else -move, 4)


def tracker_prices():
    """{(sport, game_id, lock time): Kalshi's no-vig home win chance at that lock}, from DeVig's NFL and NBA trackers:
    the price for DeVig picks logged before this page stored it (picks.jsonl is append-only, so it is looked up)."""
    out = {}
    for sport, path, sql in (("NFL", NFL_TRACKER, "SELECT game_id AS g, lock_timestamp_utc AS t, home_moneyline AS h, "
                                                 f"away_moneyline AS a FROM picks WHERE decider_version = '{NFL_DECIDER}'"),
                             ("NBA", NBA_TRACKER, "SELECT event_id AS g, lock_timestamp_utc AS t, home_moneyline_kalshi AS h, "
                                                 "away_moneyline_kalshi AS a FROM picks")):
        if not path.exists():
            continue
        c = ro(path)
        for r in c.execute(sql):
            out[(sport, str(r["g"]), iso(parse_t(r["t"])))] = r4(novig(r["h"], r["a"]))
        c.close()
    return out


def props_rows(sport):
    """DeVig props model v1 (its whole live record: props have no other model to compare on the same games) and the
    market bar (average price paid), graded from the model's own log."""
    path = NFL_PROPS if sport == "NFL" else NBA_PROPS
    if not path.exists():
        return None
    c = ro(path)
    if sport == "NFL":
        won = "(p.side='OVER' AND g.over_won=1) OR (p.side='UNDER' AND g.over_won=0)"
        join = "JOIN grades g ON g.game_key=p.game_key AND g.player_id=p.player_id AND g.stat=p.stat AND g.line=p.line WHERE g.over_won IN (0,1)"
    else:
        won = "(p.side='OVER' AND g.result='yes') OR (p.side='UNDER' AND g.result='no')"
        join = "JOIN grades g ON g.ticker=p.ticker WHERE g.result IN ('yes','no')"
    rows = c.execute(f"SELECT CASE WHEN {won} THEN 1 ELSE 0 END AS w, p.price + p.fee AS cost FROM picks p {join}").fetchall()
    c.close()
    n, w = len(rows), sum(r["w"] for r in rows)
    cost = sum(r["cost"] for r in rows)
    profit = sum((1 - r["cost"]) if r["w"] else -r["cost"] for r in rows)
    return {"n": n, "w": w, "l": n - w, "profit": round(profit, 2) if n else None,
            "roi": round(profit / cost, 4) if cost else None, "breakeven": round(cost / n, 4) if n else None}


CAL_BINS = ((0.5, 0.6), (0.6, 0.7), (0.7, 0.8), (0.8, 1.0001))


def cal_row(key, name, pairs):
    """One "do the percentages come true" row from (model chance, Kalshi chance, outcome 1/0) triples: how often the
    side the model favoured won per band of the chance it gave (50-60%, ... 80%+), and log loss and Brier score (lower
    = better) next to Kalshi's on the same rows."""
    def scores(i):
        ps = [min(max(t[i], 1e-4), 1 - 1e-4) for t in pairs]
        ys = [t[2] for t in pairs]
        ll = -sum(y * math.log(q) + (1 - y) * math.log(1 - q) for q, y in zip(ps, ys)) / len(ps)
        return round(ll, 4), round(sum((q - y) ** 2 for q, y in zip(ps, ys)) / len(ps), 4)
    bins = []
    for lo, hi in CAL_BINS:
        inside = [(max(t[0], 1 - t[0]), t[2] if t[0] >= 0.5 else 1 - t[2]) for t in pairs if lo <= max(t[0], 1 - t[0]) < hi]
        bins.append({"lo": lo, "hi": min(hi, 1.0), "n": len(inside),
                     "said": round(sum(a for a, _ in inside) / len(inside), 4) if inside else None,
                     "won": round(sum(b for _, b in inside) / len(inside), 4) if inside else None})
    ll, br = scores(0)
    mll, mbr = scores(1)
    return {"key": key, "name": name, "n": len(pairs), "logloss": ll, "brier": br, "mkt_logloss": mll, "mkt_brier": mbr,
            "bins": bins}


def calibration(sport, by_game, results):
    """Do a model's win chances come true? For each model with a win chance, on the graded games of this sport (a tie or
    a game without Kalshi's chance is left out), next to Kalshi on the same games."""
    rows = []
    for m in MODELS:
        if sport not in m["sports"] or m["key"] not in COVERS[sport]["ml"]:
            continue
        pairs = []
        for (sp, gid), x in by_game.items():
            res, p, k = results.get((sp, gid)), x["picks"].get(m["key"]), x["picks"].get("kalshi")
            if sp != sport or res is None or res["home_score"] == res["away_score"] or not p or not k \
                    or p.get("home_wp") is None or k.get("home_wp") is None:
                continue
            pairs.append((p["home_wp"], k["home_wp"], 1.0 if res["home_score"] > res["away_score"] else 0.0))
        if pairs:
            rows.append(cal_row(m["key"], m["name"], pairs))
    return rows


def props_calibration(sport):
    """The same check for DeVig's props model: every prop row it locked before a game (not only its picks), its chance of
    the over against Kalshi's mid price at that lock, graded from the model's own log. Market = Kalshi's mid."""
    path = NFL_PROPS if sport == "NFL" else NBA_PROPS
    if not path.exists():
        return []
    c = ro(path)
    if sport == "NFL":
        sql = ("SELECT r.model_p AS p, r.k_bid AS b, r.k_ask AS a, g.over_won AS y FROM locked_rows r JOIN grades g ON "
               "g.game_key=r.game_key AND g.player_id=r.player_id AND g.stat=r.stat AND g.line=r.line WHERE g.over_won IN (0,1)")
    else:
        sql = ("SELECT r.model_p AS p, r.k_bid AS b, r.k_ask AS a, CASE g.result WHEN 'yes' THEN 1 ELSE 0 END AS y "
               "FROM locked_rows r JOIN grades g ON g.ticker=r.ticker WHERE g.result IN ('yes','no')")
    pairs = [(r["p"], (r["b"] + r["a"]) / 2, float(r["y"])) for r in c.execute(sql)
             if r["p"] is not None and r["b"] is not None and r["a"] is not None and 0 <= r["b"] <= r["a"] <= 1]
    c.close()
    if not pairs:
        return []
    return [cal_row("devig", "DeVig props", pairs), cal_row("kalshi", "Market", [(k, k, y) for _, k, y in pairs])]


def export(now):
    picks = read_jsonl(PICKS)
    results = {(r["sport"], r["game_id"]): r for r in read_jsonl(RESULTS)}
    latest = (json.loads(LATEST.read_text()) if LATEST.exists() else {}).get("games", {})
    since = min((p["seen"] for p in picks), default=None)
    by_game = {}
    for p in picks:
        by_game.setdefault((p["sport"], p["game_id"]), {"meta": p, "picks": {}})["picks"][p["model"]] = p

    tally = {}                                     # (sport, bet, model) -> counts
    for (sport, gid), x in by_game.items():
        res = results.get((sport, gid))
        if res is None or len(set(x["picks"]) - {"kalshi"}) == 0:
            continue                                # ungraded, or only the market: nothing to compare
        for model, bets in grade_game(sport, x["picks"], res).items():
            for bet, (w, profit, be) in bets.items():
                t = tally.setdefault((sport, bet, model), {"w": 0, "l": 0, "push": 0, "profit": 0.0, "priced": 0, "be": []})
                if w is None:
                    t["push"] += 1
                    continue
                t["w" if w else "l"] += 1
                if profit is not None:
                    t["profit"] += profit
                    t["priced"] += 1
                if be is not None:
                    t["be"].append(be)

    moves, locks = {}, tracker_prices()            # (sport, model) -> [CLV per pick], every game that started
    for (sport, gid), x in by_game.items():
        for model, p in x["picks"].items():
            if model != "kalshi":
                if model == "devig" and p.get("mkt_wp") is None:
                    p = dict(p, mkt_wp=locks.get((sport, gid, p.get("at"))))
                c = clv(p, x["picks"].get("kalshi"))
                if c is not None:
                    moves.setdefault((sport, model), []).append(c)

    sports = {}
    for sport in SPORTS:
        tabs = {}
        for bet in ("ml", "spread", "total", "props"):
            rows = []
            for m in MODELS:
                if sport not in m["sports"]:
                    continue
                row = {"key": m["key"], "name": m["name"], "n": 0}
                if bet == "props":
                    pr = props_rows(sport) if sport in ("NFL", "NBA") else None
                    if m["key"] == "devig" and pr:
                        row.update(n=pr["n"], w=pr["w"], l=pr["l"], pct=round(pr["w"] / pr["n"], 4) if pr["n"] else None,
                                   profit=pr["profit"], roi=pr["roi"], breakeven=pr["breakeven"])
                    elif m["key"] == "kalshi" and pr:
                        row.update(n=pr["n"], breakeven=pr["breakeven"], bar_only=True)
                    else:
                        row["none"] = True
                    rows.append(row)
                    continue
                t = tally.get((sport, bet, m["key"]))
                if m["key"] not in COVERS[sport][bet]:
                    row["none"] = True
                elif t:
                    n = t["w"] + t["l"]
                    row.update(n=n, w=t["w"], l=t["l"], push=t["push"], pct=round(t["w"] / n, 4) if n else None)
                    if bet == "ml":
                        row.update(profit=round(t["profit"], 2) if t["priced"] else None, priced=t["priced"],
                                   roi=round(t["profit"] / t["priced"], 4) if t["priced"] else None)
                    if t["be"]:
                        row["breakeven"] = round(sum(t["be"]) / len(t["be"]), 4)
                rows.append(row)
            tabs[bet] = rows
        tabs["close"] = []
        for m in MODELS:
            mv = moves.get((sport, m["key"]))
            if sport in m["sports"] and m["key"] != "kalshi" and m["key"] in COVERS[sport]["ml"]:
                tabs["close"].append({"key": m["key"], "name": m["name"], "n": len(mv or []),
                                      "beat": sum(1 for c in mv or [] if c > 0), "same": sum(1 for c in mv or [] if c == 0),
                                      "avg": round(sum(mv) / len(mv), 4) if mv else None})
        tabs["calib"] = calibration(sport, by_game, results)
        if sport in ("NFL", "NBA"):
            tabs["props_calib"] = props_calibration(sport)
        sports[sport] = tabs

    # the page's game list: upcoming (latest.json) and the last few days (picks.jsonl)
    docs = []
    def game_doc(sport, gid, meta, ps, res):
        out = {}
        for model, p in ps.items():
            out[model] = {k: p.get(k) for k in ("home_wp", "home_line", "spread_side", "spread_point", "total", "home_ml", "away_ml") if p.get(k) is not None}
        docs.append({"collection": "models_games", "doc_id": f"{sport}_{gid}", "data": {
            "sport": sport, "game_id": gid, "kickoff_time": meta["kickoff"], "home_team": meta["home"], "away_team": meta["away"],
            "final": res is not None, "home_score": res and res["home_score"], "away_score": res and res["away_score"], "picks": out}})
    for (sport, gid), x in by_game.items():
        if now - parse_t(x["meta"]["kickoff"]) <= RECENT:
            game_doc(sport, gid, x["meta"], x["picks"], results.get((sport, gid)))
    for key, e in latest.items():
        if (e["sport"], e["game_id"]) not in by_game and set(e["picks"]) - {"kalshi"}:
            game_doc(e["sport"], e["game_id"], e, e["picks"], None)
    docs.sort(key=lambda d: d["data"]["kickoff_time"])
    docs.append({"collection": "models_report", "doc_id": "MODELS_V1", "data": {
        "doc": "MODELS_V1", "tracking_since": since, "sports": sports,
        "models": [{k: m[k] for k in ("key", "name", "sports", "author", "url", "license", "note")} for m in MODELS],
        "errors": errors[:20]}})

    try:                                           # unchanged (apart from the clock): keep the old file
        if json.loads(EXPORT.read_text())["docs"] == json.loads(json.dumps(docs)):
            print("export: unchanged")
            return
    except (OSError, ValueError, KeyError):
        pass
    EXPORT.write_text(json.dumps({"generated_at": iso(now), "n_docs": len(docs), "docs": docs}, separators=(",", ":")))
    print(f"export: {len(docs) - 1} games, tracking since {since}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--nfl-games", help="a local nflverse games.csv instead of downloading it")
    ap.add_argument("--offline", action="store_true", help="no Kalshi / ESPN / nfelo / Blotny (local testing)")
    ap.add_argument("--now", help="pretend it is this UTC time (local testing)")
    a = ap.parse_args()
    now = parse_t(a.now) if a.now else datetime.now(timezone.utc)
    update(now, a.nfl_games, a.offline)
    export(now)
    for e in errors:
        print("  " + e)
    return 0


if __name__ == "__main__":
    sys.exit(main())
