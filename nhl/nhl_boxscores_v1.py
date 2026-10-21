#!/usr/bin/env python3
"""
nhl_boxscores_v1.py -- every NHL player's box score line for every regular-season and playoff game since 2010-11,
from the NHL's public API (api-web.nhle.com; no key, read-only). This is the history the NHL player-prop model is
fit on. No prices of any kind are read here.

One gzipped CSV per season, nhl/data/player_games_<start year>.csv.gz (2010 = 2010-11), one row per player per
finished game: game_id, season, game_type (2 regular, 3 playoffs), game_date, start_utc, team, opp, home, player_id,
name, position, goals, assists, points, sog, toi_s, pp_goals, plus full first / last names from the team's season
roster (box scores only give "C. Glass"; Kalshi uses full names).

Resumable: a finished past season is never fetched again (nhl/data/DONE.txt); the season in progress is refreshed
every run, adding only games not already in its file. Run from the repo root:
  python3 nhl/nhl_boxscores_v1.py            # every season from 2010 to the current one
  SEASONS=2025,2026 python3 nhl/nhl_boxscores_v1.py
"""
import csv, gzip, io, json, os, sys, time, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

API = "https://api-web.nhle.com/v1"
UA = "nhl-boxscores/1.0 (personal research; read-only)"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "data")
DONE = os.path.join(OUT, "DONE.txt")
FIRST = 2010
THREADS, PAUSE = 4, 0.1
MAX_MINUTES = float(os.getenv("MAX_MINUTES", "300"))
COLS = ["game_id", "season", "game_type", "game_date", "start_utc", "team", "opp", "home", "player_id", "name",
        "first_name", "last_name", "position", "goals", "assists", "points", "sog", "toi_s", "pp_goals"]
T0 = time.time()
log = []


def get(path, tries=4):
    for i in range(tries):
        time.sleep(PAUSE)
        try:
            req = urllib.request.Request(API + path, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if e.code == 429 and i < tries - 1:
                time.sleep(2 ** (i + 2)); continue
            log.append(f"HTTP {e.code} {path}")
            return None
        except Exception as e:
            if i < tries - 1:
                time.sleep(2 ** i); continue
            log.append(f"ERR {type(e).__name__} {path}"); return None


def current_start(now=None):
    now = now or datetime.now(timezone.utc)
    return now.year if now.month >= 9 else now.year - 1


def toi_seconds(s):
    try:
        m, sec = str(s).split(":")
        return int(m) * 60 + int(sec)
    except (ValueError, AttributeError):
        return ""


def rows_of(box):
    """One row per skater (goalies are left out: the props are goals, assists and points)."""
    if str(box.get("gameState") or "").upper() not in ("OFF", "FINAL"):
        return []
    home, away = box.get("homeTeam") or {}, box.get("awayTeam") or {}
    out = []
    for side, team, opp in (("homeTeam", home, away), ("awayTeam", away, home)):
        groups = (box.get("playerByGameStats") or {}).get(side) or {}
        for g in ("forwards", "defense"):
            for p in groups.get(g) or []:
                out.append({"game_id": box["id"], "season": int(str(box.get("season"))[:4]), "game_type": box.get("gameType"),
                            "game_date": box.get("gameDate"), "start_utc": box.get("startTimeUTC"),
                            "team": team.get("abbrev"), "opp": opp.get("abbrev"), "home": int(side == "homeTeam"),
                            "player_id": p.get("playerId"), "name": (p.get("name") or {}).get("default"),
                            "position": p.get("position"), "goals": p.get("goals", 0), "assists": p.get("assists", 0),
                            "points": p.get("points", 0), "sog": p.get("sog", ""), "toi_s": toi_seconds(p.get("toi")),
                            "pp_goals": p.get("powerPlayGoals", "")})
    return out


def game_ids(start):
    """Regular season: <start>020001 upward until a long run of missing games; playoffs: every round / series / game."""
    ids = []
    for n in range(1, 1400):
        ids.append(f"{start}02{n:04d}")
    for rnd, series in ((1, 8), (2, 4), (3, 2), (4, 1)):
        for s in range(1, series + 1):
            for g in range(1, 8):
                ids.append(f"{start}03{rnd:02d}{s}{g}")
    return ids


def rosters(start, teams):
    """{player_id: (first, last)} from each team's season roster."""
    out = {}
    season = f"{start}{start + 1}"
    for t in sorted(teams):
        d = get(f"/roster/{t}/{season}") or {}
        for grp in ("forwards", "defensemen", "goalies"):
            for p in d.get(grp) or []:
                out[p.get("id")] = ((p.get("firstName") or {}).get("default"), (p.get("lastName") or {}).get("default"))
    return out


def season_file(start):
    return os.path.join(OUT, f"player_games_{start}.csv.gz")


def read_season(start):
    p = season_file(start)
    if not os.path.exists(p):
        return []
    with gzip.open(p, "rt", newline="") as f:
        return list(csv.DictReader(f))


def write_season(start, rows):
    rows = sorted(rows, key=lambda r: (str(r["game_date"]), str(r["game_id"]), str(r["team"]), str(r["player_id"])))
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=COLS, lineterminator="\n")
    w.writeheader()
    for r in rows:
        w.writerow({k: r.get(k, "") for k in COLS})
    with open(season_file(start), "wb") as raw, gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0) as f:
        f.write(buf.getvalue().encode())


def collect(start, pool, final):
    have = read_season(start)
    have_games = {str(r["game_id"]) for r in have}
    ids = [g for g in game_ids(start) if g not in have_games]
    new, misses = [], 0
    reg = [g for g in ids if g[4:6] == "02"]
    po = [g for g in ids if g[4:6] == "03"]
    for i in range(0, len(reg), 40):                     # regular season in blocks; stop after 40 missing in a row
        if (time.time() - T0) / 60 > MAX_MINUTES:
            return None
        got = list(pool.map(lambda g: get(f"/gamecenter/{g}/boxscore"), reg[i:i + 40]))
        for b in got:
            rs = rows_of(b) if b else []
            if rs:
                misses = 0
                new += rs
            else:                                        # missing or not finished: the season in progress ends here
                misses += 1
        if misses >= 40 and (not final or int(reg[i][-4:]) > 600):   # past seasons: not before game 600 (lockouts)
            break
    for b in pool.map(lambda g: get(f"/gamecenter/{g}/boxscore"), po):
        if b is not None:
            new += rows_of(b)
    if not new and not final:
        return have, 0
    names = rosters(start, {r["team"] for r in have + new if r.get("team")})
    for r in new:
        first, last = names.get(r["player_id"], (None, None))
        r["first_name"], r["last_name"] = first or "", last or ""
    return have + new, len({r["game_id"] for r in new})


def main():
    os.makedirs(OUT, exist_ok=True)
    done = set(open(DONE).read().split()) if os.path.exists(DONE) else set()
    cur = current_start()
    seasons = [int(x) for x in os.getenv("SEASONS", "").split(",") if x] or list(range(FIRST, cur + 1))
    summary = {}
    with ThreadPoolExecutor(THREADS) as pool:
        for start in seasons:
            if str(start) in done and start != cur:
                continue
            res = collect(start, pool, final=start != cur)
            if res is None:
                summary[start] = "stopped (time limit)"; break
            rows, n_new = res
            if n_new:
                write_season(start, rows)
            games = len({r["game_id"] for r in rows})
            summary[start] = {"games": games, "new_games": n_new, "rows": len(rows)}
            if start != cur and games:
                done.add(str(start))
                open(DONE, "w").write("\n".join(sorted(done)) + "\n")
            print(start, summary[start], flush=True)
    json.dump({"generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "seasons": summary,
               "errors": log[:200]}, open(os.path.join(OUT, "collect_summary.json"), "w"), indent=1, default=str)


if __name__ == "__main__":
    sys.exit(main())
