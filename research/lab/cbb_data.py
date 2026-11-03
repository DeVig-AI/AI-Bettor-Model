"""Men's college basketball data for the Research Lab (Constitution Part E1), from ESPN's public sports data (no key).

Two ways in, kept apart on purpose:
  * the lab's cache, research/cbb/data/ -- seasons 2015-2025 only, one games file and one odds file per season.
    `fetch_lab_cache` fills only the seasons it does not have yet (a cached season is never fetched again) and
    `load_lab` reads it, refusing any row from 2026 on;
  * `fetch_live` -- used only by the Inspector General (sealed exam): straight into memory, never written.

The cache is never committed (E1: ESPN's data is not republished here). The CSVs live in the private GitHub Actions
cache; only MANIFEST.json (seasons held, each file's SHA-256, game and line counts) is committed. If the Actions cache
was evicted, the missing seasons are fetched once more and must match the committed fingerprints, or the lab refuses.

Per season: the Division I scoreboard of every day from November 1 to April 15, then each game's odds list, fetched
only for games between two Division I teams (a team with at least 15 games on that season's scoreboard). Only the
fields E1 names are kept: game id, date and start time, season type, neutral site, ESPN team ids, final scores, and
each sportsbook's home and away moneyline. Spreads, totals, opening lines, rankings, records, venues, attendance and
the feed's own win flags are dropped before anything is stored. Nothing here prints a row.
"""
import concurrent.futures as cf
import datetime as dt
import hashlib
import json
import os
import statistics
import sys
import time
import urllib.error
import urllib.request
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

from . import config as C
from .data import SealedDataError, sha_file      # one error type for every sport
from .sbr_data import GAME_COLS, ml_line, team_games

SCOREBOARD = ("https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard"
              "?dates={day}&groups=50&limit=500")
ODDS = ("https://sports.core.api.espn.com/v2/sports/basketball/leagues/mens-college-basketball/events/{id}/"
        "competitions/{id}/odds?limit=100")
UA = "devig-research-lab/1.0 (personal research; read-only)"
ET = ZoneInfo("America/New_York")
WORKERS = 8
D1_MIN_GAMES = 15                                 # E1
COVERAGE_MIN = 0.70
NOT_BOOKS = ("teamrankings", "numberfire", "accuscore")   # projection sites (E1)
GAMES_FILE_COLS = ["game_id", "season", "season_type", "start", "neutral", "home_id", "away_id", "home_score",
                   "away_score", "completed"]
ODDS_FILE_COLS = ["game_id", "season", "provider", "home_ml", "away_ml"]


class Fetch404(RuntimeError):
    pass


def _get(url, tries=5):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise Fetch404(url) from e
            if i == tries - 1:
                raise RuntimeError(f"ESPN HTTP {e.code}: {url}") from e
        except Exception as e:                    # network hiccup: back off and retry
            if i == tries - 1:
                raise RuntimeError(f"ESPN fetch failed: {url}: {type(e).__name__}") from e
        time.sleep(2 ** i)


# ---- reducing ESPN's data to what the lab may see (E1) ---------------------------------------------------------------
def season_days(season):
    d, end = dt.date(season - 1, 11, 1), dt.date(season, 4, 15)
    while d <= end:
        yield d
        d += dt.timedelta(days=1)


def reduce_event(e, season):
    """One scoreboard event as a games-file row, or None when it is not this season's or lacks two teams."""
    if (e.get("season") or {}).get("year") != season:
        return None
    comp = (e.get("competitions") or [{}])[0]
    teams = {c.get("homeAway"): c for c in comp.get("competitors") or []}
    if "home" not in teams or "away" not in teams:
        return None
    done = bool(((comp.get("status") or {}).get("type") or {}).get("completed"))

    def score(c):
        try:
            return float(c.get("score")) if done else None
        except (TypeError, ValueError):
            return None
    return {"game_id": str(e.get("id")), "season": season,
            "season_type": "post" if (e.get("season") or {}).get("type") == 3 else "regular",
            "start": comp.get("startDate") or comp.get("date") or e.get("date"),
            "neutral": bool(comp.get("neutralSite")),
            "home_id": str((teams["home"].get("team") or {}).get("id") or teams["home"].get("id")),
            "away_id": str((teams["away"].get("team") or {}).get("id") or teams["away"].get("id")),
            "home_score": score(teams["home"]), "away_score": score(teams["away"]), "completed": done}


def is_book(name):
    n = str(name or "").strip()
    low = n.lower()
    return bool(n) and n != "Opening" and "live" not in low and not any(x in low for x in NOT_BOOKS)


def _ml(side):
    v = (side or {}).get("moneyLine")
    if isinstance(v, dict):                       # some feeds nest the price
        v = v.get("american") or v.get("value")
    try:
        v = float(str(v).replace("+", ""))
    except (TypeError, ValueError):
        return None
    return v if np.isfinite(v) else None


def reduce_odds(body, game_id, season):
    out = []
    for it in (body or {}).get("items") or []:
        name = (it.get("provider") or {}).get("name")
        if not is_book(name):
            continue
        out.append({"game_id": str(game_id), "season": season, "provider": str(name),
                    "home_ml": _ml(it.get("homeTeamOdds")), "away_ml": _ml(it.get("awayTeamOdds"))})
    return out


def d1_teams(games):
    """E1: the teams with at least 15 games on the season's Division I scoreboard."""
    n = pd.concat([games.home_id, games.away_id]).value_counts()
    return set(n[n >= D1_MIN_GAMES].index)


def eligible(games):
    """E1: both teams Division I that season."""
    d1 = d1_teams(games)
    return games[games.home_id.isin(d1) & games.away_id.isin(d1)]


def fetch_season(season, log=print):
    """(games, odds) DataFrames for one season, straight from ESPN."""
    days = list(season_days(season))
    rows = {}
    with cf.ThreadPoolExecutor(WORKERS) as ex:
        for body in ex.map(lambda d: _get(SCOREBOARD.format(day=d.strftime("%Y%m%d"))), days):
            for e in body.get("events") or []:
                r = reduce_event(e, season)
                if r:
                    rows[r["game_id"]] = r               # a game listed twice keeps its last listing
    games = pd.DataFrame(list(rows.values()), columns=GAMES_FILE_COLS)
    want = eligible(games)
    want = want[want.completed]

    def odds(gid):
        try:
            return reduce_odds(_get(ODDS.format(id=gid)), gid, season)
        except Fetch404:
            return []
    out = []
    with cf.ThreadPoolExecutor(WORKERS) as ex:
        for rows_ in ex.map(odds, list(want.game_id)):
            out += rows_
    odds_df = pd.DataFrame(out, columns=ODDS_FILE_COLS)
    log(f"CBB {season}: {len(days)} scoreboard days, {len(games)} games, {len(want)} odds lists fetched")
    return games, odds_df


# ---- the cache ------------------------------------------------------------------------------------------------------
def _path(data_dir, kind, season):
    return os.path.join(data_dir, f"{kind}_{season}.csv")


def manifest(data_dir):
    p = os.path.join(data_dir, "MANIFEST.json")
    if os.path.exists(p):
        with open(p) as f:
            return json.load(f)
    return {"complete": [], "sha256": {}, "counts": {}}


def _save_manifest(data_dir, man):
    os.makedirs(data_dir, exist_ok=True)
    man["source"] = "ESPN public scoreboard (groups=50) and per-game odds lists; no key"
    man["note"] = ("Lab cache (Constitution E1). Seasons 2015-2025 only; 2026 is sealed and never stored here. The CSVs "
                   "live in the private Actions cache, never in git. A season listed under `complete` is never fetched "
                   "again; a refetched season must match its fingerprint here.")
    with open(os.path.join(data_dir, "MANIFEST.json"), "w") as f:
        json.dump(man, f, indent=1, sort_keys=True)
        f.write("\n")


def counts(games, odds):
    a = assemble(games, odds)["games"]
    played = a[a.home_score.notna() & a.away_score.notna()]
    return {"scoreboard_games": int(len(games)), "eligible_played": int(len(played)),
            "with_line": int(played.ml_line.notna().sum())}


def fetch_lab_cache(data_dir=None, log=print, minutes=None):
    """Fetch the seasons 2015-2025 the cache does not hold. Stops starting new seasons after `minutes`
    (env CBB_FETCH_MINUTES, default 300); the rest waits for the next run. Returns True when anything was added."""
    data_dir = data_dir or C.DATA_DIR
    minutes = float(minutes or os.environ.get("CBB_FETCH_MINUTES") or 300)
    t0 = time.time()
    man = manifest(data_dir)
    man.setdefault("sha256", {})
    man.setdefault("counts", {})
    have = [s for s in man.get("complete", [])
            if os.path.exists(_path(data_dir, "games", s)) and os.path.exists(_path(data_dir, "odds", s))]
    if len(have) < len(man.get("complete", [])):
        log("::warning title=CBB data::cache files missing (Actions cache evicted?): fetching again; they must match "
            "the committed fingerprints (E1)")
    man["complete"] = sorted(have)
    want = [s for s in range(C.FIRST_SEASON, C.LAB_MAX_SEASON + 1) if s not in have]
    if not want:
        log("lab cache complete: nothing fetched")
        return False
    changed = False
    for s in want:
        if s > C.LAB_MAX_SEASON:
            raise SealedDataError(f"refusing to cache season {s}")
        if (time.time() - t0) / 60 > minutes:
            log(f"::notice title=CBB data::time budget reached; seasons from {s} wait for the next run")
            break
        games, odds = fetch_season(s, log)
        os.makedirs(data_dir, exist_ok=True)
        games.sort_values("game_id").to_csv(_path(data_dir, "games", s), index=False)
        odds.sort_values(["game_id", "provider"]).to_csv(_path(data_dir, "odds", s), index=False)
        sha = {k: sha_file(_path(data_dir, k, s)) for k in ("games", "odds")}
        old = man["sha256"].get(str(s))
        if old and old != sha:
            man.setdefault("fingerprint_mismatch", {})[str(s)] = {"was": old, "now": sha}
            log(f"::error title=CBB data::re-fetched season {s} differs from its committed fingerprint; the lab refuses "
                "to run until a new Constitution version says what to do (E1)")
        else:
            man["sha256"][str(s)] = sha
        man["counts"][str(s)] = counts(games, odds)
        man["complete"] = sorted(set(man["complete"]) | {s})
        _save_manifest(data_dir, man)              # after every season: a stopped run keeps what it finished
        changed = True
    return changed


# ---- what the models see ----------------------------------------------------------------------------------------------
def closing_ml(odds):
    """{game_id: E1 closing price} = the median over books (each passing D1's check) of 100 x the vig-free home
    win probability."""
    by = {}
    for r in odds.itertuples():
        q = ml_line(None if pd.isna(r.home_ml) else float(r.home_ml), None if pd.isna(r.away_ml) else float(r.away_ml))
        if q is not None:
            by.setdefault(str(r.game_id), []).append(q)
    return {k: float(statistics.median(v)) for k, v in by.items()}


def assemble(games, odds):
    """{games, team_games}: Division I vs Division I games only (E1), in the columns every Lab family reads."""
    parts = []
    for s, g in games.groupby("season"):
        g = g.copy()
        for c in ("game_id", "home_id", "away_id"):
            g[c] = g[c].astype(str)
        done = g.completed.astype(str).str.lower().isin(["true", "1"])
        t = pd.to_datetime(g.start, utc=True, errors="coerce").dt.tz_convert(ET)
        g["gameday"], g["gametime"] = t.dt.strftime("%Y-%m-%d"), t.dt.strftime("%H:%M")
        g = g[t.notna()]
        # rest from every game the team played on the scoreboard (a schedule fact, no result used)
        last, rest = {}, {}
        for r in g[done.loc[g.index]].sort_values(["start", "game_id"]).itertuples():
            day = dt.date.fromisoformat(r.gameday)
            rest[r.game_id] = tuple((day - last[x]).days if x in last else np.nan for x in (r.home_id, r.away_id))
            last[r.home_id] = last[r.away_id] = day
        e = eligible(g)
        first = pd.to_datetime(e.gameday).min()
        parts.append(pd.DataFrame({
            "game_id": e.game_id, "season": int(s),
            "game_type": e.season_type.map(lambda x: "POST" if x == "post" else "REG"),
            "week": ((pd.to_datetime(e.gameday) - first).dt.days // 7 + 1).astype(int),
            "gameday": e.gameday, "gametime": e.gametime, "away_team": e.away_id, "home_team": e.home_id,
            "away_score": pd.to_numeric(e.away_score, errors="coerce").where(done.loc[e.index]),
            "home_score": pd.to_numeric(e.home_score, errors="coerce").where(done.loc[e.index]),
            "location": e.neutral.astype(str).str.lower().isin(["true", "1"]).map({True: "Neutral", False: "Home"}),
            "away_rest": [rest.get(x, (np.nan, np.nan))[1] for x in e.game_id],
            "home_rest": [rest.get(x, (np.nan, np.nan))[0] for x in e.game_id],
            "spread_line": np.nan, "total_line": np.nan}))
    out = pd.concat(parts, ignore_index=True) if parts else pd.DataFrame(columns=GAME_COLS)
    q = closing_ml(odds)
    out["ml_line"] = out.game_id.map(q)
    out = out.sort_values(["gameday", "gametime", "game_id"], kind="stable").reset_index(drop=True)[GAME_COLS]
    return {"games": out, "team_games": team_games(out)}


def _guard(df, name, last):
    if len(df) and int(df.season.max()) > last:
        raise SealedDataError(f"{name}: rows from season {int(df.season.max())} reached the lab (max {last})")
    return df


def _read(p, cols):
    return pd.read_csv(p, low_memory=False, dtype={"game_id": str, "home_id": str, "away_id": str}) \
        if os.path.exists(p) else pd.DataFrame(columns=cols)


def load_lab(data_dir=None):
    """The lab's data: {games, team_games}, seasons FIRST_SEASON-LAB_MAX_SEASON. Raises SealedDataError on later rows."""
    data_dir = data_dir or C.DATA_DIR
    man = manifest(data_dir)
    if man.get("fingerprint_mismatch"):
        raise RuntimeError("CBB cache does not match its committed fingerprints (Constitution E1): refusing to run")
    games, odds = [], []
    for s in range(C.FIRST_SEASON, C.LAB_MAX_SEASON + 1):
        want = (man.get("sha256") or {}).get(str(s)) or {}
        for k, acc, cols in (("games", games, GAMES_FILE_COLS), ("odds", odds, ODDS_FILE_COLS)):
            p = _path(data_dir, k, s)
            if not os.path.exists(p):
                raise FileNotFoundError(f"lab cache missing {p}; run: python3 -m research.lab.cbb_data fetch")
            if want.get(k) and sha_file(p) != want[k]:
                raise RuntimeError(f"CBB cache {os.path.basename(p)} does not match MANIFEST.json (E1): refusing to run")
            acc.append(_guard(_read(p, cols), os.path.basename(p), C.LAB_MAX_SEASON))
    out = assemble(pd.concat(games, ignore_index=True), pd.concat(odds, ignore_index=True))
    return {k: _guard(v, k, C.LAB_MAX_SEASON) for k, v in out.items()}


def data_fingerprint(data_dir=None):
    h = hashlib.sha256()
    for s in range(C.FIRST_SEASON, C.LAB_MAX_SEASON + 1):
        for k in ("games", "odds"):
            h.update(sha_file(_path(data_dir or C.DATA_DIR, k, s)).encode())
    return h.hexdigest()


def coverage(data):
    """{season: share of eligible played games with a closing line} over the training and gate seasons."""
    g = data["games"]
    g = g[g.home_score.notna() & g.away_score.notna()]
    seasons = list(range(C.TRAIN[0], C.TRAIN[1] + 1)) + [s for _, a, b in C.GATES for s in range(a, b + 1)]
    return {s: round(float(g[g.season == s].ml_line.notna().mean()), 4) if (g.season == s).any() else 0.0
            for s in seasons}


def blocked_markets(data):
    """E1 line-coverage gate: the moneyline is blocked when any training or gate season is under 70%."""
    return {"moneyline"} if any(v < COVERAGE_MIN for v in coverage(data).values()) else set()


def fetch_live(seasons, log=print):
    """Inspector General only: `seasons` (the sealed 2026) straight into memory, assembled; never written. Logs each
    season's in-memory fingerprint so a second exam can be checked against the first."""
    games, odds = [], []
    for s in seasons:
        g, o = fetch_season(s, log)
        games.append(g)
        odds.append(o)
        h = hashlib.sha256((g.sort_values("game_id").to_csv(index=False) +
                            o.sort_values(["game_id", "provider"]).to_csv(index=False)).encode()).hexdigest()
        log(f"CBB sealed season {s}: fingerprint {h[:12]} (in memory, not stored)")
    return assemble(pd.concat(games, ignore_index=True), pd.concat(odds, ignore_index=True))


if __name__ == "__main__":
    C.use("CBB")
    cmd = sys.argv[1:]
    if cmd == ["fetch"]:
        fetch_lab_cache()
    elif cmd == ["check"]:
        d = load_lab()
        print({k: (len(v), int(v.season.min()), int(v.season.max())) for k, v in d.items() if len(v)})
        print("coverage:", coverage(d), "blocked:", sorted(blocked_markets(d)) or "none")
    else:
        sys.exit("usage: python3 -m research.lab.cbb_data fetch|check")
