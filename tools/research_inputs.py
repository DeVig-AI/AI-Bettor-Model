#!/usr/bin/env python3
"""
research_inputs.py -- free, public box-score inputs for the Research Lab's NBA, NHL and MLB chambers (and WNBA, for
later), collected by GitHub Actions into research/inputs/<sport>/. Nothing here reads a price or a line, and the lab
does not read these files until a Constitution version lists them (A3.3e: a new input is a version change).

Sources (no keys):
  NBA, WNBA  ESPN box scores as published by sportsdataverse (github.com/sportsdataverse/sportsdataverse-data releases):
             team_games_<season>.csv.gz   one row per team per game: score, shooting, rebounds, turnovers, fouls
             player_games_<season>.csv.gz one row per player per game: minutes, starter, played or not, and why not
  NHL        the NHL's public API (api-web.nhle.com): goalie_games_<season>.csv.gz, one row per goalie per game:
             started, time on ice, shots against, saves, goals against, decision. Skaters are already collected in
             nhl/data/ (the props model's history).
  MLB        Retrosheet game logs (retrosheet.org): games_<season>.csv.gz, one row per game: teams, score, park,
             day or night, and both starting pitchers. Umpires are not kept (A3.5: referee crews are a known angle).
             "The information used here was obtained free of charge from and is copyrighted by Retrosheet.
              Interested parties may contact Retrosheet at www.retrosheet.org."

<season> is the year the season starts (NBA/NHL 2016 = 2016-17), as in the lab. The sealed exam season of each Part D
sport (2021, Constitution D1) is never fetched or stored; nor is anything before 2011 (the lab's first season).
Resumable: a past season already written is not fetched again (research/inputs/<sport>/DONE.txt); the season in
progress is refreshed each run.

  python3 tools/research_inputs.py --sport NBA [--seasons 2015,2016]
"""
import argparse
import csv
import gzip
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "research", "inputs")
UA = "devig-research-inputs/1.0 (personal research; read-only)"
FIRST = 2011
SEALED = {"NBA": 2021, "NHL": 2021, "MLB": 2021}         # Constitution D1-D2: never stored
SDV = "https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_{lg}_{kind}_boxscores/{kind}_box_{y}.csv"
NHL_API = "https://api-web.nhle.com/v1"
RETRO = "https://www.retrosheet.org/gamelogs/gl{y}.zip"
MAX_MINUTES = float(os.getenv("MAX_MINUTES", "300"))
T0 = time.time()
log = []

TEAM_COLS = ["game_id", "season", "game_type", "game_date", "start_utc", "team", "team_name", "opp", "home", "points",
             "opp_points", "fgm", "fga", "fg3m", "fg3a", "ftm", "fta", "oreb", "dreb", "ast", "stl", "blk", "tov", "pf"]
PLAYER_COLS = ["game_id", "season", "game_date", "team", "player_id", "name", "position", "starter", "played",
               "minutes", "points", "reason"]
GOALIE_COLS = ["game_id", "season", "game_type", "game_date", "start_utc", "team", "opp", "home", "player_id", "name",
               "starter", "toi_s", "shots_against", "saves", "goals_against", "decision"]
MLB_COLS = ["game_id", "season", "game_date", "game_number", "day_night", "away", "home", "away_score", "home_score",
            "outs", "park", "away_sp_id", "away_sp_name", "home_sp_id", "home_sp_name"]


def get(url, tries=4, pause=0.1, binary=False):
    for i in range(tries):
        time.sleep(pause)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=120) as r:
                b = r.read()
                return b if binary else json.loads(b.decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if e.code in (429, 500, 502, 503) and i < tries - 1:
                time.sleep(2 ** (i + 2)); continue
            log.append(f"HTTP {e.code} {url}")
            return None
        except Exception as e:                    # network hiccup: back off and retry
            if i < tries - 1:
                time.sleep(2 ** i); continue
            log.append(f"{type(e).__name__} {url}")
            return None


def current_start(sport, now=None):
    now = now or datetime.now(timezone.utc)
    if sport in ("MLB", "WNBA"):
        return now.year
    return now.year if now.month >= 9 else now.year - 1


def seasons_for(sport, only=None):
    out = [s for s in range(FIRST, current_start(sport) + 1) if s != SEALED.get(sport)]
    if only:
        bad = [s for s in only if s == SEALED.get(sport)]
        if bad:
            raise SystemExit(f"{sport} {bad[0]} is the sealed exam season (Constitution D1): never collected")
        out = [s for s in out if s in only]
    return out


def sport_dir(sport):
    return os.path.join(OUT, sport.lower())


def path_of(sport, kind, season):
    return os.path.join(sport_dir(sport), f"{kind}_{season}.csv.gz")


def write_gz(path, cols, rows, key):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    rows = sorted(rows, key=key)
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=cols, lineterminator="\n", extrasaction="ignore")
    w.writeheader()
    for r in rows:
        w.writerow({k: r.get(k, "") for k in cols})
    with open(path, "wb") as raw, gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0) as f:
        f.write(buf.getvalue().encode())        # mtime 0: the same rows always give the same bytes


def read_gz(path):
    if not os.path.exists(path):
        return []
    with gzip.open(path, "rt", newline="") as f:
        return list(csv.DictReader(f))


def done_set(sport):
    p = os.path.join(sport_dir(sport), "DONE.txt")
    return set(open(p).read().split()) if os.path.exists(p) else set()


def mark_done(sport, season):
    d = done_set(sport) | {str(season)}
    with open(os.path.join(sport_dir(sport), "DONE.txt"), "w") as f:
        f.write("\n".join(sorted(d)) + "\n")


def out_of_time():
    return (time.time() - T0) / 60 > MAX_MINUTES


# ---- NBA / WNBA: sportsdataverse's ESPN box scores --------------------------------------------------------------------
def _int(x):
    try:
        return int(float(x))
    except (TypeError, ValueError):
        return ""


def _yes(x):
    return 1 if str(x).strip().upper() in ("TRUE", "1", "T", "YES") else 0


def sdv_year(sport, season):
    """sportsdataverse files are named by the year a season ends (NBA 2016 = 2015-16); WNBA by its calendar year."""
    return season + 1 if sport == "NBA" else season


def basketball(sport, season):
    lg = sport.lower()
    y = sdv_year(sport, season)
    raw = get(SDV.format(lg=lg, kind="team", y=y), binary=True)
    if raw is None:
        log.append(f"{sport} {season}: no team box file")
        return None
    team = []
    for r in csv.DictReader(io.StringIO(raw.decode("utf-8", "replace"))):
        team.append({"game_id": r["game_id"], "season": season, "game_type": r.get("season_type"),
                     "game_date": r.get("game_date"), "start_utc": r.get("game_date_time"),
                     "team": r.get("team_abbreviation"), "team_name": r.get("team_name"),
                     "opp": r.get("opponent_team_abbreviation"), "home": 1 if r.get("team_home_away") == "home" else 0,
                     "points": _int(r.get("team_score")), "opp_points": _int(r.get("opponent_team_score")),
                     "fgm": _int(r.get("field_goals_made")), "fga": _int(r.get("field_goals_attempted")),
                     "fg3m": _int(r.get("three_point_field_goals_made")), "fg3a": _int(r.get("three_point_field_goals_attempted")),
                     "ftm": _int(r.get("free_throws_made")), "fta": _int(r.get("free_throws_attempted")),
                     "oreb": _int(r.get("offensive_rebounds")), "dreb": _int(r.get("defensive_rebounds")),
                     "ast": _int(r.get("assists")), "stl": _int(r.get("steals")), "blk": _int(r.get("blocks")),
                     "tov": _int(r.get("total_turnovers") or r.get("turnovers")), "pf": _int(r.get("fouls"))})
    raw = get(SDV.format(lg=lg, kind="player", y=y), binary=True)
    players = []
    for r in csv.DictReader(io.StringIO((raw or b"").decode("utf-8", "replace"))):
        dnp = _yes(r.get("did_not_play"))
        players.append({"game_id": r["game_id"], "season": season, "game_date": r.get("game_date"),
                        "team": r.get("team_abbreviation"), "player_id": r.get("athlete_id"),
                        "name": r.get("athlete_display_name"), "position": r.get("athlete_position_abbreviation"),
                        "starter": _yes(r.get("starter")), "played": 0 if dnp else 1,
                        "minutes": _int(r.get("minutes")), "points": _int(r.get("points")),
                        "reason": "" if not dnp else (r.get("reason") or "").strip()[:60]})   # ESPN fills it for players who played too
    if raw is None:
        log.append(f"{sport} {season}: no player box file")
    write_gz(path_of(sport, "team_games", season), TEAM_COLS, team, key=lambda r: (r["game_date"] or "", r["game_id"], r["team"] or ""))
    write_gz(path_of(sport, "player_games", season), PLAYER_COLS, players,
             key=lambda r: (r["game_date"] or "", r["game_id"], r["team"] or "", str(r["player_id"])))
    return len(team) // 2, len(players)


# ---- NHL: goalies from the NHL's public API ---------------------------------------------------------------------------
def nhl_game_ids(start):
    ids = [f"{start}02{n:04d}" for n in range(1, 1400)]
    for rnd, series in ((1, 8), (2, 4), (3, 2), (4, 1)):
        ids += [f"{start}03{rnd:02d}{s}{g}" for s in range(1, series + 1) for g in range(1, 8)]
    return ids


def toi_seconds(s):
    try:
        m, sec = str(s).split(":")
        return int(m) * 60 + int(sec)
    except (ValueError, AttributeError):
        return ""


def goalie_rows(box):
    """One row per goalie who played; `starter` from the box score (or, when it is missing, the most time on ice)."""
    if not box or str(box.get("gameState") or "").upper() not in ("OFF", "FINAL"):
        return []
    home, away = box.get("homeTeam") or {}, box.get("awayTeam") or {}
    out = []
    for side, team, opp in (("homeTeam", home, away), ("awayTeam", away, home)):
        gs = [g for g in ((box.get("playerByGameStats") or {}).get(side) or {}).get("goalies") or []
              if toi_seconds(g.get("toi")) not in ("", 0)]
        top = max(gs, key=lambda g: toi_seconds(g.get("toi")) or 0, default=None)
        for g in gs:
            sa, sv = g.get("shotsAgainst"), g.get("saves")
            if sa is None and isinstance(g.get("saveShotsAgainst"), str) and "/" in g["saveShotsAgainst"]:
                sv, sa = (int(x) for x in g["saveShotsAgainst"].split("/"))
            started = g.get("starter")
            out.append({"game_id": box["id"], "season": int(str(box.get("season"))[:4]), "game_type": box.get("gameType"),
                        "game_date": box.get("gameDate"), "start_utc": box.get("startTimeUTC"),
                        "team": team.get("abbrev"), "opp": opp.get("abbrev"), "home": int(side == "homeTeam"),
                        "player_id": g.get("playerId"), "name": (g.get("name") or {}).get("default"),
                        "starter": int(bool(started)) if started is not None else int(g is top),
                        "toi_s": toi_seconds(g.get("toi")), "shots_against": sa if sa is not None else "",
                        "saves": sv if sv is not None else "", "goals_against": g.get("goalsAgainst", ""),
                        "decision": g.get("decision", "")})
    return out


def nhl(season):
    path = path_of("NHL", "goalie_games", season)
    have = read_gz(path)
    seen = {str(r["game_id"]) for r in have}
    ids = [g for g in nhl_game_ids(season) if g not in seen]
    new, misses = [], 0
    reg = [g for g in ids if g[4:6] == "02"]
    with ThreadPoolExecutor(4) as pool:
        for i in range(0, len(reg), 40):                # regular season in batches until a long run of missing games
            if out_of_time():
                break
            boxes = list(pool.map(lambda g: get(f"{NHL_API}/gamecenter/{g}/boxscore"), reg[i:i + 40]))
            got = [b for b in boxes if b]
            misses = 0 if got else misses + 40
            for b in got:
                new += goalie_rows(b)
            if misses >= 80:
                break
        po = [g for g in ids if g[4:6] == "03"]
        if not out_of_time():
            for b in pool.map(lambda g: get(f"{NHL_API}/gamecenter/{g}/boxscore"), po):
                new += goalie_rows(b)
    rows = have + new
    write_gz(path, GOALIE_COLS, rows, key=lambda r: (str(r["game_date"]), str(r["game_id"]), str(r["team"]), str(r["player_id"])))
    return len({str(r["game_id"]) for r in rows}), len(rows)


# ---- MLB: Retrosheet game logs ----------------------------------------------------------------------------------------
# Game log fields (1-based, retrosheet.org/gamelogs/glfields.txt): 1 date, 2 game number, 4 visiting team, 7 home team,
# 10 visiting score, 11 home score, 12 length in outs, 13 day/night, 17 park id, 102-103 visiting starting pitcher id
# and name, 104-105 home starting pitcher id and name. Fields 78-89 (umpires) are not read.
def mlb_rows(text, season):
    out = []
    for f in csv.reader(io.StringIO(text)):
        if len(f) < 105:
            continue
        d = f[0]
        date = f"{d[:4]}-{d[4:6]}-{d[6:8]}" if len(d) == 8 else d
        out.append({"game_id": f"{d}{f[6]}{f[1]}", "season": season, "game_date": date, "game_number": f[1],
                    "day_night": f[12], "away": f[3], "home": f[6], "away_score": _int(f[9]), "home_score": _int(f[10]),
                    "outs": _int(f[11]), "park": f[16], "away_sp_id": f[101], "away_sp_name": f[102],
                    "home_sp_id": f[103], "home_sp_name": f[104]})
    return out


def mlb(season):
    raw = get(RETRO.format(y=season), binary=True)
    if raw is None:
        log.append(f"MLB {season}: no Retrosheet game log yet")
        return None
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        name = next((n for n in z.namelist() if n.upper().endswith(".TXT")), None)
        text = z.read(name).decode("latin-1") if name else ""
    rows = mlb_rows(text, season)
    if rows and sum(1 for r in rows if r["home_sp_name"] and r["away_sp_name"]) < 0.9 * len(rows):
        raise RuntimeError(f"MLB {season}: starting pitchers missing in most games; the game log layout may have changed")
    write_gz(path_of("MLB", "games", season), MLB_COLS, rows, key=lambda r: (r["game_date"], r["game_id"]))
    return len(rows), len(rows)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sport", choices=["NBA", "WNBA", "NHL", "MLB"], required=True)
    ap.add_argument("--seasons", default="", help="comma-separated start years (default: all from 2011)")
    a = ap.parse_args(argv)
    only = [int(x) for x in a.seasons.split(",") if x.strip()] or None
    os.makedirs(sport_dir(a.sport), exist_ok=True)
    done, cur = done_set(a.sport), current_start(a.sport)
    summary = {}
    for s in seasons_for(a.sport, only):
        if str(s) in done or out_of_time():
            continue
        if a.sport in ("NBA", "WNBA"):
            got = basketball(a.sport, s)
        elif a.sport == "NHL":
            got = nhl(s)
        else:
            got = mlb(s)
        if got is None:
            continue
        summary[s] = {"games": got[0], "rows": got[1]}
        print(f"{a.sport} {s}: {got[0]} games, {got[1]} rows", flush=True)
        if s < cur and not out_of_time():
            mark_done(a.sport, s)
    man = os.path.join(sport_dir(a.sport), "MANIFEST.json")
    old = json.load(open(man)) if os.path.exists(man) else {}
    seasons = dict(old.get("seasons", {}), **{str(k): v for k, v in summary.items()})
    with open(man, "w") as f:
        json.dump({"sport": a.sport, "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                   "sealed_season_never_stored": SEALED.get(a.sport), "seasons": dict(sorted(seasons.items())),
                   "notes": log[:20]}, f, indent=1)
        f.write("\n")
    if log:
        print("notes:", log[:10])
    return 0


if __name__ == "__main__":
    sys.exit(main())
