"""College football data for the Research Lab (Constitution Part C1), from CollegeFootballData (CFBD).

Three ways in, kept apart on purpose:
  * the lab's cache, research/cfb/data/ -- seasons 2009-2024 only. `fetch_lab_cache` fills only the seasons it does
    not have yet (a cached season is never fetched again) and `load_lab` reads it, refusing any row from 2025 on;
  * `refresh_current` -- the weekly in-season refresh of the current season (2026) into research/cfb/current/, which
    the lab never reads (its loader only opens research/cfb/data/);
  * `fetch_live` -- used only by the Inspector General (sealed exam, paper season): straight into memory, never written.

The cache is never committed (Constitution C1a: the provider's terms forbid publishing stored raw API responses):
the CSVs live in the private GitHub Actions cache; only MANIFEST.json (seasons held, SHA-256 of each file) and
CALLS.csv are committed. If the Actions cache was evicted, the seasons are fetched once more and must match the
committed fingerprints, or the lab refuses to run.

Every request is season-level, needs CFB_API_KEY (GitHub Actions only; the key is never printed or written) and is
logged in research/cfb/data/CALLS.csv with what the provider says is left this month. A run stops at 150 calls, or
early when fewer than 100 are left (C1).

Per season: games (seasonType=both, FBS teams), closing lines, team-game advanced stats with and without garbage time,
and returning production. Moneylines, opening lines, weather, attendance, excitement index and CFBD's own Elo / win
probabilities are dropped before anything is stored (C1).
"""
import datetime as dt
import hashlib
import io
import json
import os
import statistics
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

import pandas as pd

from . import config as C
from .data import SealedDataError, sha_file      # one error type for every sport

API = "https://api.collegefootballdata.com"
UA = "devig-research-lab/1.0 (personal research; read-only)"
ET = ZoneInfo("America/New_York")
RUN_CALL_CAP = 150
MIN_LEFT = 100
COVERAGE_MIN = 0.70
KINDS = ("games", "lines", "advanced", "advanced_ngt", "returning")
COLS = {
    "games": ["game_id", "season", "week", "season_type", "start", "gameday", "gametime", "neutral", "home_team",
              "away_team", "home_id", "away_id", "home_class", "away_class", "home_conf", "away_conf", "home_score",
              "away_score", "completed"],
    "lines": ["game_id", "season", "spread_line", "total_line", "spread_provider", "total_provider", "providers"],
    "advanced": ["season", "game_id", "team", "opponent", "plays", "ppa", "total_ppa", "d_plays", "d_ppa"],
    "advanced_ngt": ["season", "game_id", "team", "opponent", "plays", "ppa", "total_ppa", "d_plays", "d_ppa"],
    "returning": ["season", "team", "percent_ppa", "usage"],
}
CALL_COLS = ["at", "run_url", "endpoint", "season", "status", "rows", "calls_this_run", "remaining"]


class Budget(RuntimeError):
    """The run's call cap or the month's floor was reached; the rest waits for the next run."""


class Client:
    def __init__(self, log_path=None, log=print):
        self.key = os.environ.get("CFB_API_KEY", "").strip()
        if not self.key:
            raise SystemExit("CFB_API_KEY is not set (it lives only in GitHub Actions)")
        self.calls, self.remaining, self.log_path, self.log = 0, None, log_path, log
        rid = os.environ.get("GITHUB_RUN_ID")
        self.run_url = f"https://github.com/{C.REPO}/actions/runs/{rid}" if rid else ""

    def get(self, path, season=None, **params):
        if self.calls >= RUN_CALL_CAP:
            raise Budget(f"call cap of {RUN_CALL_CAP} for one run reached")
        if self.remaining is not None and self.remaining < MIN_LEFT:
            raise Budget(f"provider reports {self.remaining} calls left this month (floor {MIN_LEFT})")
        q = urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
        url = f"{API}{path}" + (f"?{q}" if q else "")
        status, rows, body = None, None, None
        for i in range(3):
            req = urllib.request.Request(url, headers={"Authorization": "Bearer " + self.key, "User-Agent": UA,
                                                       "Accept": "application/json"})
            self.calls += 1
            try:
                with urllib.request.urlopen(req, timeout=120) as r:
                    status = r.status
                    left = r.headers.get("X-CallLimit-Remaining")
                    self.remaining = int(left) if left and left.isdigit() else self.remaining
                    body = json.loads(r.read().decode("utf-8"))
                    break
            except urllib.error.HTTPError as e:
                status = e.code
                if e.code in (429, 500, 502, 503, 504) and i < 2:
                    time.sleep(5 * (i + 1)); continue
                break
            except Exception as e:                   # network hiccup: one short retry
                status = type(e).__name__
                if i < 2:
                    time.sleep(5 * (i + 1)); continue
                break
        rows = len(body) if isinstance(body, list) else None
        self._log(path + (f"?{q}" if q else ""), season, status, rows)
        if status != 200 or not isinstance(body, (list, dict)):
            raise RuntimeError(f"CFBD {path} season {season}: HTTP {status}")
        return body

    def info(self):
        d = self.get("/info")
        self.remaining = d.get("remainingCalls", self.remaining)
        return d

    def _log(self, endpoint, season, status, rows):
        self.log(f"CFBD {endpoint}: {status}, {rows} rows, {self.calls} call(s) this run, {self.remaining} left")
        if not self.log_path:
            return
        os.makedirs(os.path.dirname(self.log_path), exist_ok=True)
        new = not os.path.exists(self.log_path)
        with open(self.log_path, "a") as f:
            if new:
                f.write(",".join(CALL_COLS) + "\n")
            vals = [dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), self.run_url, endpoint,
                    season or "", status, "" if rows is None else rows, self.calls,
                    "" if self.remaining is None else self.remaining]
            f.write(",".join(str(v).replace(",", ";") for v in vals) + "\n")


# ---- reducing the provider's rows to what the lab may see (C1) ------------------------------------------------------
def g(d, *names):
    for n in names:
        if isinstance(d, dict) and d.get(n) is not None:
            return d[n]
    return None


def reduce_games(rows):
    out = []
    for r in rows:
        start = g(r, "startDate", "start_date")
        t = pd.Timestamp(start).tz_convert(ET) if start else None
        out.append({"game_id": g(r, "id"), "season": g(r, "season"), "week": g(r, "week"),
                    "season_type": g(r, "seasonType", "season_type"), "start": start,
                    "gameday": t.strftime("%Y-%m-%d") if t is not None else None,
                    "gametime": t.strftime("%H:%M") if t is not None else None,
                    "neutral": bool(g(r, "neutralSite", "neutral_site")),
                    "home_team": g(r, "homeTeam", "home_team"), "away_team": g(r, "awayTeam", "away_team"),
                    "home_id": g(r, "homeId", "home_id"), "away_id": g(r, "awayId", "away_id"),
                    "home_class": g(r, "homeClassification", "home_division"),
                    "away_class": g(r, "awayClassification", "away_division"),
                    "home_conf": g(r, "homeConference", "home_conference"),
                    "away_conf": g(r, "awayConference", "away_conference"),
                    "home_score": g(r, "homePoints", "home_points"), "away_score": g(r, "awayPoints", "away_points"),
                    "completed": bool(g(r, "completed"))})
    return pd.DataFrame(out, columns=COLS["games"])


def closing(lines, field):
    """C1: the `consensus` provider's number when present, otherwise the median over every provider listed."""
    vals = [(x.get("provider"), x.get(field)) for x in lines or [] if x.get(field) is not None]
    cons = [v for p, v in vals if str(p).lower() == "consensus"]
    if cons:
        return float(cons[0]), "consensus"
    if vals:
        return float(statistics.median(v for _, v in vals)), "median"
    return None, None


def reduce_lines(rows):
    out = []
    for r in rows:
        ls = g(r, "lines") or []
        sp, sprov = closing(ls, "spread")
        tot, tprov = closing(ls, "overUnder")
        out.append({"game_id": g(r, "id"), "season": g(r, "season"),
                    "spread_line": None if sp is None else -sp,          # CFBD spread is the home line
                    "total_line": tot, "spread_provider": sprov, "total_provider": tprov,
                    "providers": "|".join(sorted({str(x.get("provider")) for x in ls}))})
    return pd.DataFrame(out, columns=COLS["lines"])


def reduce_advanced(rows):
    out = []
    for r in rows:
        o, d = g(r, "offense") or {}, g(r, "defense") or {}
        out.append({"season": g(r, "season"), "game_id": g(r, "gameId", "game_id"), "team": g(r, "team"),
                    "opponent": g(r, "opponent"), "plays": g(o, "plays"), "ppa": g(o, "ppa"),
                    "total_ppa": g(o, "totalPPA", "total_ppa"), "d_plays": g(d, "plays"), "d_ppa": g(d, "ppa")})
    return pd.DataFrame(out, columns=COLS["advanced"])


def reduce_returning(rows):
    return pd.DataFrame([{"season": g(r, "season"), "team": g(r, "team"), "percent_ppa": g(r, "percentPPA", "percent_ppa"),
                          "usage": g(r, "usage")} for r in rows], columns=COLS["returning"])


def fetch_season(cli, season, kinds=KINDS):
    """{kind: DataFrame} for one season, season-level requests only."""
    out = {}
    for kind in kinds:
        if kind == "games":
            rows = cli.get("/games", season, year=season, seasonType="both", classification="fbs")
            if rows and not any(g(r, "seasonType", "season_type") == "postseason" for r in rows):
                rows += cli.get("/games", season, year=season, seasonType="postseason", classification="fbs")
            out[kind] = reduce_games(rows)
        elif kind == "lines":
            rows = cli.get("/lines", season, year=season, seasonType="both")
            if rows and not any(g(r, "seasonType", "season_type") == "postseason" for r in rows):
                rows += cli.get("/lines", season, year=season, seasonType="postseason")
            out[kind] = reduce_lines(rows)
        elif kind in ("advanced", "advanced_ngt"):
            ngt = "true" if kind == "advanced_ngt" else None
            rows = cli.get("/stats/game/advanced", season, year=season, seasonType="both", excludeGarbageTime=ngt)
            if rows and not any(g(r, "seasonType", "season_type") == "postseason" for r in rows):
                rows += cli.get("/stats/game/advanced", season, year=season, seasonType="postseason",
                                excludeGarbageTime=ngt)
            out[kind] = reduce_advanced(rows)
        elif kind == "returning":
            out[kind] = reduce_returning(cli.get("/player/returning", season, year=season))
    return out


# ---- the cache ------------------------------------------------------------------------------------------------------
def _path(data_dir, kind):
    return os.path.join(data_dir, f"{kind}.csv")


def _read(data_dir, kind):
    p = _path(data_dir, kind)
    return pd.read_csv(p, low_memory=False) if os.path.exists(p) else pd.DataFrame(columns=COLS[kind])


def manifest(data_dir):
    p = os.path.join(data_dir, "MANIFEST.json")
    if os.path.exists(p):
        with open(p) as f:
            return json.load(f)
    return {"complete": {k: [] for k in KINDS}}


def _write(data_dir, tables, man, note):
    os.makedirs(data_dir, exist_ok=True)
    for kind, df in tables.items():
        key = ["season", "game_id", "team"] if "team" in df.columns and "game_id" in df.columns else \
            ["season", "team"] if "team" in df.columns else ["season", "game_id"]
        df.sort_values(key).to_csv(_path(data_dir, kind), index=False)
    man["sha256"] = {k: sha_file(_path(data_dir, k)) for k in KINDS if os.path.exists(_path(data_dir, k))}
    man["source"] = API + " (CollegeFootballData; season-level requests)"
    man["note"] = note
    with open(os.path.join(data_dir, "MANIFEST.json"), "w") as f:
        json.dump(man, f, indent=1)
        f.write("\n")


def fetch_lab_cache(data_dir=None, log=print):
    """Fill missing (kind, season) pairs for 2009-2024. Returns True when anything was added."""
    data_dir = data_dir or C.DATA_DIR
    man = manifest(data_dir)
    old_sha = dict(man.get("sha256") or {})
    if not all(os.path.exists(_path(data_dir, k)) for k in KINDS):
        if any(man["complete"].values()):
            log("::warning title=CFB data::cache files missing (Actions cache evicted?): fetching again; they must "
                "match the committed fingerprints (C1a)")
        man["complete"] = {k: [] for k in KINDS}
    done = {k: set(man["complete"].get(k, [])) for k in KINDS}
    want = [(k, s) for s in range(C.FIRST_SEASON, C.LAB_MAX_SEASON + 1) for k in KINDS if s not in done[k]]
    if not want:
        log("lab cache complete: nothing fetched")
        return False
    cli = Client(os.path.join(C.DATA_DIR, "CALLS.csv"), log)
    info = cli.info()
    log(f"provider: tier {info.get('tierName')}, monthly limit {info.get('monthlyLimit')}, "
        f"{info.get('remainingCalls')} left, resets {info.get('resetAt')}")
    tables = {k: _read(data_dir, k) for k in KINDS}
    changed = False
    try:
        for kind, s in want:
            if s > C.LAB_MAX_SEASON:
                raise SealedDataError(f"refusing to cache season {s}")
            df = fetch_season(cli, s, (kind,))[kind]
            tables[kind] = pd.concat([tables[kind][tables[kind].season != s], df], ignore_index=True)
            man["complete"].setdefault(kind, []).append(s)
            man["complete"][kind] = sorted(set(man["complete"][kind]))
            changed = True
    except Budget as e:
        log(f"::notice title=CFB data::stopped early: {e}; the rest is fetched on the next run")
    finally:
        if changed:
            _write(data_dir, tables, man, "Lab cache (Constitution C1, C1a). Seasons 2009-2024 only; 2025 is sealed "
                                          "and never stored here. The CSVs live in the private Actions cache, never in "
                                          "git. A season listed under `complete` is never fetched again.")
            full = all(len(man["complete"].get(k, [])) == C.LAB_MAX_SEASON - C.FIRST_SEASON + 1 for k in KINDS)
            if full and old_sha and any(old_sha.get(k) != man["sha256"].get(k) for k in KINDS):
                man["fingerprint_mismatch"] = {"was": old_sha, "now": man["sha256"]}   # C1a: the lab refuses
                man["sha256"] = old_sha
                with open(os.path.join(data_dir, "MANIFEST.json"), "w") as f:
                    json.dump(man, f, indent=1)
                    f.write("\n")
                log("::error title=CFB data::re-fetched data differs from the committed fingerprints; the lab "
                    "refuses to run until a new Constitution version says what to do (C1a)")
    log(f"CFBD calls this run: {cli.calls}; left this month: {cli.remaining}")
    return changed


def current_season(today=None):
    today = today or dt.date.today()
    return today.year if today.month >= 7 else today.year - 1


def refresh_current(log=print):
    """Weekly in-season refresh of the current season into research/cfb/current/<season>/ (never read by the lab)."""
    s = current_season()
    if s <= C.SEALED_SEASON:
        log(f"current season {s} is not after the sealed season: nothing refreshed")
        return False
    cli = Client(os.path.join(C.DATA_DIR, "CALLS.csv"), log)
    tables = fetch_season(cli, s)
    out = os.path.join(C.CFB_DIR, "current", str(s))
    _write(out, tables, {"complete": {}, "season": s, "refreshed_at": dt.datetime.now(dt.timezone.utc).isoformat()},
           f"Current season {s}, refreshed weekly in season (C1). The lab never reads this folder.")
    log(f"current season {s} refreshed; CFBD calls this run: {cli.calls}; left this month: {cli.remaining}")
    return True


# ---- what the models see ----------------------------------------------------------------------------------------------
def assemble(t):
    """The model families' input from reduced tables: games (FBS vs FBS only; same columns the NFL families read),
    team_games (plays and PPA per team-game), team_games_ngt (garbage time excluded) and returning."""
    gm = t["games"].copy()
    fbs = (gm.home_class.astype(str).str.lower() == "fbs") & (gm.away_class.astype(str).str.lower() == "fbs")
    gm = gm[fbs].drop_duplicates("game_id")                                      # C1: FBS vs FBS only
    ln = t["lines"].drop_duplicates("game_id")[["game_id", "spread_line", "total_line"]]
    gm = gm.merge(ln, on="game_id", how="left")
    played = gm.completed.astype(str).str.lower().isin(["true", "1"])
    gm.loc[~played, ["home_score", "away_score"]] = None
    games = pd.DataFrame({
        "game_id": gm.game_id.astype(str), "season": gm.season.astype(int),
        "game_type": gm.season_type.map(lambda x: "REG" if x == "regular" else "POST"),
        "week": pd.to_numeric(gm.week, errors="coerce"), "gameday": gm.gameday, "gametime": gm.gametime,
        "away_team": gm.away_team, "home_team": gm.home_team,
        "away_score": pd.to_numeric(gm.away_score, errors="coerce"),
        "home_score": pd.to_numeric(gm.home_score, errors="coerce"),
        "location": gm.neutral.astype(str).str.lower().isin(["true", "1"]).map({True: "Neutral", False: "Home"}),
        "home_conf": gm.home_conf, "away_conf": gm.away_conf,
        "spread_line": gm.spread_line, "total_line": gm.total_line,
    })
    ids = set(games.game_id)

    def team_rows(df):
        df = df.copy()
        df["game_id"] = df.game_id.astype(str)
        df = df[df.game_id.isin(ids)]
        return pd.DataFrame({"season": df.season.astype(int), "game_id": df.game_id, "team": df.team,
                             "plays": pd.to_numeric(df.plays, errors="coerce"),
                             "epa": pd.to_numeric(df.total_ppa, errors="coerce")}).dropna(subset=["plays", "epa"])

    ret = t["returning"].copy()
    return {"games": games.reset_index(drop=True), "team_games": team_rows(t["advanced"]),
            "team_games_ngt": team_rows(t["advanced_ngt"]),
            "returning": pd.DataFrame({"season": ret.season.astype(int), "team": ret.team,
                                       "percent_ppa": pd.to_numeric(ret.percent_ppa, errors="coerce")})}


def _guard(df, name, last):
    if len(df) and int(df.season.max()) > last:
        raise SealedDataError(f"{name}: rows from season {int(df.season.max())} reached the lab (max {last})")
    return df


def load_lab(data_dir=None):
    data_dir = data_dir or C.DATA_DIR
    man = manifest(data_dir)
    if man.get("fingerprint_mismatch"):
        raise RuntimeError("CFB cache does not match its committed fingerprints (Constitution C1a): refusing to run")
    for k, want in (man.get("sha256") or {}).items():
        if os.path.exists(_path(data_dir, k)) and sha_file(_path(data_dir, k)) != want:
            raise RuntimeError(f"CFB cache {k}.csv does not match MANIFEST.json (Constitution C1a): refusing to run")
    t = {}
    for k in KINDS:
        p = _path(data_dir, k)
        if not os.path.exists(p):
            raise FileNotFoundError(f"lab cache missing {p}; run: python3 -m research.lab.cfb_data fetch")
        t[k] = _guard(pd.read_csv(p, low_memory=False), k, C.LAB_MAX_SEASON)
    return {k: _guard(v, k, C.LAB_MAX_SEASON) for k, v in assemble(t).items()}


def data_fingerprint(data_dir=None):
    h = hashlib.sha256()
    for k in KINDS:
        h.update(sha_file(_path(data_dir or C.DATA_DIR, k)).encode())
    return h.hexdigest()


def coverage(data):
    """{market: {season: share of eligible games with a closing line}} over the training and gate seasons."""
    g = data["games"]
    seasons = [s for s in range(C.TRAIN[0], C.LAB_MAX_SEASON + 1) if s not in C.SKIP_SEASONS]
    out = {}
    for market, col in (("spread", "spread_line"), ("total", "total_line")):
        out[market] = {s: round(float(g[g.season == s][col].notna().mean()), 4) if (g.season == s).any() else 0.0
                       for s in seasons}
    return out


def blocked_markets(data):
    """C1 line-coverage gate: markets with any training or gate season under 70% coverage."""
    return {m for m, by in coverage(data).items() if any(v < COVERAGE_MIN for v in by.values())}


def fetch_live(seasons, log=print):
    """Inspector General only: the reduced tables for `seasons` straight into memory, assembled; never written.
    The current season is read from the weekly refresh when it is there, to spare calls."""
    cli = None
    parts = {k: [] for k in KINDS}
    for s in seasons:
        cur = os.path.join(C.CFB_DIR, "current", str(s))
        if s > C.SEALED_SEASON and os.path.exists(_path(cur, "games")):
            for k in KINDS:
                parts[k].append(_read(cur, k))
            continue
        cli = cli or Client(None, log)
        for k, df in fetch_season(cli, s).items():
            parts[k].append(df)
    if cli:
        log(f"CFBD calls (in memory, not logged to the repo): {cli.calls}; left this month: {cli.remaining}")
    return assemble({k: pd.concat(v, ignore_index=True) if v else pd.DataFrame(columns=COLS[k])
                     for k, v in parts.items()})


if __name__ == "__main__":
    C.use("CFB")
    cmd = sys.argv[1:]
    if cmd == ["fetch"]:
        fetch_lab_cache()
    elif cmd == ["refresh"]:
        refresh_current()
    elif cmd == ["check"]:
        d = load_lab()
        print({k: (len(v), int(v.season.min()), int(v.season.max())) for k, v in d.items() if len(v)})
        print("coverage:", coverage(d), "blocked:", blocked_markets(d))
    else:
        sys.exit("usage: python3 -m research.lab.cfb_data fetch|refresh|check")
