"""NBA, NHL and MLB data for the Research Lab (Constitution Part D1).

One public archive of closing lines and final scores (flancast90/sportsbookreview-scraper, pinned by commit and by
each file's SHA-256 in config.py), seasons 2011-2021. Two ways in, kept apart on purpose:
  * the lab's cache, research/<sport>/data/ -- seasons 2011-2020 only, built at the start of each lab job from the
    pinned file and never committed (git-ignored; D1). `fetch_lab_cache` builds it, `load_lab` reads it and refuses any
    row from 2021 on;
  * `fetch_live` -- used only by the Inspector General (sealed exam). It downloads into memory and returns only the
    seasons asked for; nothing is written.

Only the fields D1 names are kept: date, teams, final scores, the closing home spread (NBA), the closing total and the
closing moneylines (NHL, MLB), each checked before use. A value failing its check is "no closing line" for that market;
the game keeps its result and still updates ratings.

Since v14 (D1a), NBA and NHL also get box scores from sportsdataverse (sdv_data.py): each archive game is matched to
its sportsdataverse game, takes that game's date (the archive's COVID-era dates are a year early), and its team rows
gain box-score columns; NHL also gets goalie rows (goalie_games.csv). The derived files are pinned by fingerprint per
season (config.SDV_SHA). MLB is suspended (D1b): its archive rows pair teams that did not play each other.
"""
import datetime as dt
import hashlib
import json
import math
import os
import sys
import time
import urllib.request

import numpy as np
import pandas as pd

from . import config as C
from . import sdv_data as SDV

GAME_COLS = ["game_id", "season", "game_type", "week", "gameday", "gametime", "away_team", "home_team", "away_score",
             "home_score", "location", "away_rest", "home_rest", "spread_line", "total_line", "ml_line"]
TEAM_COLS = ["season", "game_id", "team", "points", "plays", "epa"]    # no play-by-play: plays and epa are empty
BOX_FILES = SDV.raw              # (sport, lab season) -> sportsdataverse files; tests replace it (None = no box scores)
UA = "devig-research-lab/1.0 (personal research; read-only)"
TOTAL_RANGE = {"NBA": (150, 280), "NHL": (4, 8), "MLB": (4, 16)}       # D1
MAX_SPREAD = 25

# One name per franchise: the archive spells some teams several ways (city, nickname, short code).
NAMES = {
    "NBA": {"Golden State": "Warriors", "LA Clippers": "Clippers", "NewJersey": "Nets", "Oklahoma City": "Thunder"},
    "NHL": {"Arizonas": "Coyotes", "Phoenix": "Coyotes", "NY Islanders": "Islanders", "SeattleKraken": "Kraken",
            "Tampa": "Lightning", "Tampa Bay": "Lightning", "WinnipegJets": "Jets", "St.Louis": "Blues"},
    "MLB": {"BRS": "Red Sox", "CUB": "Cubs", "KAN": "Royals", "LOS": "Dodgers", "SDG": "Padres", "SFG": "Giants",
            "SFO": "Giants", "TAM": "Rays"},
}


class SealedDataError(RuntimeError):
    """Raised when sealed (or future) seasons reach the lab."""


def _get(url, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read()
        except Exception as e:                     # network hiccup: back off and retry
            if i == tries - 1:
                raise RuntimeError(f"download failed: {url}: {e}") from e
            time.sleep(2 ** (i + 1))


def download():
    """The pinned archive file for the sport in use, checked against its fingerprint (D1)."""
    raw = _get(C.SBR_URL.format(name=C.SBR_FILE))
    got = hashlib.sha256(raw).hexdigest()
    if got != C.SBR_SHA:
        raise RuntimeError(f"{C.SBR_FILE}: fingerprint {got[:12]} is not the one Part D1 fixes ({C.SBR_SHA[:12]}); "
                           "refusing to use it")
    return json.loads(raw)


def _num(x):
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def _team(sport, name):
    if name is None or str(name).strip() in ("", "0", "None"):
        return None
    name = str(name).strip()
    return NAMES[sport].get(name, name)


def implied(ml):
    """Implied probability of an American price, or None unless it is a valid one (at most -100 or at least +100)."""
    if ml is None or -100 < ml < 100:
        return None
    return 100 / (ml + 100) if ml > 0 else -ml / (-ml + 100)


def ml_line(home_ml, away_ml):
    """D3: 100 x the home team's vig-free closing win probability, or None when the pair fails D1's check."""
    ph, pa = implied(home_ml), implied(away_ml)
    if ph is None or pa is None or not (1.0 <= ph + pa <= 1.15):
        return None
    return 100 * ph / (ph + pa)


def parse(rows, sport, fix=None):
    """(games, counts): the archive's rows as the lab's schedule, with each D1 check applied and counted. `fix`, when
    given, takes the games (before game ids, weeks and rest are set) and returns them with D1a's dates and an sdv_id
    column; the result then keeps sdv_id."""
    counts = {"rows": len(rows), "no_date_or_team": 0, "duplicate": 0, "no_score": 0}
    lo, hi = TOTAL_RANGE[sport]
    out, seen = [], set()
    for x in rows:
        d = _num(x.get("date"))
        h, a = _team(sport, x.get("home_team")), _team(sport, x.get("away_team"))
        season = _num(x.get("season"))
        if d is None or h is None or a is None or season is None or h == a:
            counts["no_date_or_team"] += 1
            continue
        try:
            day = dt.datetime.strptime(str(int(d)), "%Y%m%d").date()
        except ValueError:
            counts["no_date_or_team"] += 1
            continue
        key = (day, h, a)
        if key in seen:
            counts["duplicate"] += 1
            continue
        seen.add(key)
        hs, as_ = _num(x.get("home_final")), _num(x.get("away_final"))
        if hs is None or as_ is None:
            counts["no_score"] += 1
        spread = total = ml = None
        if sport == "NBA":
            hsp, asp = _num(x.get("home_close_spread")), _num(x.get("away_close_spread"))
            if hsp is not None and asp is not None and hsp == -asp and abs(hsp) <= MAX_SPREAD:
                spread = -hsp                      # expected home margin
        else:
            ml = ml_line(_num(x.get("home_close_ml")), _num(x.get("away_close_ml")))
        t = _num(x.get("close_over_under"))
        if t is not None and lo <= t <= hi:
            total = t
        out.append({"season": int(season), "gameday": day.isoformat(), "home_team": h, "away_team": a,
                    "home_score": hs, "away_score": as_, "spread_line": spread, "total_line": total, "ml_line": ml})
    g = pd.DataFrame(out)
    if fix is not None:
        g = fix(g)
        counts["box_matched"] = int(g.sdv_id.notna().sum())
        counts["box_unmatched"] = int(g.sdv_id.isna().sum())
    g = g.sort_values(["gameday", "home_team", "away_team"], kind="stable").reset_index(drop=True)
    g["game_id"] = [f"{s}_{d.replace('-', '')}_{a}_{h}".replace(" ", "") for s, d, a, h in
                    zip(g.season, g.gameday, g.away_team, g.home_team)]
    g["game_type"] = "REG"                         # the archive does not mark playoff games
    g["gametime"] = "19:00"                        # no start times: every game on a date is one slot (models.slots)
    g["location"] = "Home"                         # D3: no neutral sites are marked
    first = g.groupby("season").gameday.transform("min")
    g["week"] = ((pd.to_datetime(g.gameday) - pd.to_datetime(first)).dt.days // 7 + 1).astype(int)
    last = {}
    rest_h, rest_a = [], []
    for r in g.itertuples():
        day = dt.date.fromisoformat(r.gameday)
        for t, acc in ((r.home_team, rest_h), (r.away_team, rest_a)):
            acc.append((day - last[t]).days if t in last else np.nan)
        last[r.home_team] = last[r.away_team] = day
    g["home_rest"], g["away_rest"] = rest_h, rest_a
    played = g.home_score.notna() & g.away_score.notna()
    for m, col in (("spread", "spread_line"), ("total", "total_line"), ("moneyline", "ml_line")):
        if m in C.MARKETS:
            counts[f"{m}_lines"] = int((played & g[col].notna()).sum())
            counts[f"{m}_no_line"] = int((played & g[col].isna()).sum())
    return g[GAME_COLS + (["sdv_id"] if fix is not None else [])], counts


def team_games(games, box=None):
    """One row per team per played game: its points (goals, runs), plus D1a's box-score columns when `box` (rows of
    season, game_id, team, box columns) is given; a game with no box row has them empty. The rating families read
    points from the schedule."""
    p = games[games.home_score.notna() & games.away_score.notna()]
    rows = pd.concat([
        pd.DataFrame({"season": p.season, "game_id": p.game_id, "team": p.home_team, "points": p.home_score}),
        pd.DataFrame({"season": p.season, "game_id": p.game_id, "team": p.away_team, "points": p.away_score})])
    rows["plays"] = rows["epa"] = np.nan              # the points-only models never read them (pace off)
    cols = list(TEAM_COLS)
    if box is not None:
        extra = [c for c in box.columns if c not in ("season", "game_id", "team")]
        rows = rows.merge(box.drop(columns="season"), on=["game_id", "team"], how="left")
        cols += extra
    return rows.sort_values(["season", "game_id", "team"]).reset_index(drop=True)[cols]


def box_fix(sport, files_by_season):
    """parse's `fix` for D1a: each season's archive games matched to that season's sportsdataverse games."""
    def fix(g):
        parts = []
        for s, x in g.groupby("season", sort=True):
            if s in files_by_season:
                parts.append(SDV.season(sport, x, files_by_season[s]))
            else:
                parts.append(x.assign(sdv_id=None))
        return pd.concat(parts).sort_index()
    return fix


def load_box(sport, seasons, rows):
    """(games, counts, team box rows, goalie rows) for `seasons` with D1a applied, or (games, counts, None, None) when
    the sport has no box scores (MLB) or BOX_FILES is None (tests)."""
    if sport not in SDV.FILES or BOX_FILES is None:
        g, counts = parse(rows, sport)
        return g, counts, None, None
    files = {s: BOX_FILES(sport, s) for s in seasons}
    g, counts = parse(rows, sport, fix=box_fix(sport, files))
    g = g[g.season.isin(list(seasons))].reset_index(drop=True)
    teams, goalies = SDV.box_frames(sport, g, files)
    return g, counts, teams, goalies


def _paths(data_dir):
    names = ("games", "team_games") + (("goalie_games",) if C.SPORT == "NHL" else ())
    return {k: os.path.join(data_dir, f"{k}.csv") for k in names}


def sha_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        h.update(f.read())
    return h.hexdigest()


def fetch_lab_cache(data_dir=None, log=print):
    """Build the lab cache (seasons FIRST_SEASON..LAB_MAX_SEASON) from the pinned file, every time (a few seconds)."""
    data_dir = data_dir or C.DATA_DIR
    os.makedirs(data_dir, exist_ok=True)
    P = _paths(data_dir)
    man_path = os.path.join(data_dir, "MANIFEST.json")
    C.refuse_if_suspended()
    seasons = list(range(C.FIRST_SEASON, C.LAB_MAX_SEASON + 1))
    games, counts, box, goalies = load_box(C.SPORT, seasons, download())
    games = games[(games.season >= C.FIRST_SEASON) & (games.season <= C.LAB_MAX_SEASON)].reset_index(drop=True)
    if box is not None and BOX_FILES is SDV.raw:      # the real files: their fingerprints must be D1a's
        SDV.check_pinned(C.SPORT, seasons, games, box, goalies)
    games[GAME_COLS].to_csv(P["games"], index=False)
    team_games(games, box).to_csv(P["team_games"], index=False)
    if "goalie_games" in P:
        (goalies if goalies is not None else pd.DataFrame(columns=SDV.GOALIE_COLS)).to_csv(P["goalie_games"], index=False)
    sha = {k: sha_file(p) for k, p in P.items()}      # every ledger row carries these (data_sha256)
    by_season = {int(s): int(n) for s, n in games.groupby("season").size().items()}
    lines = {}
    for m, col in (("spread", "spread_line"), ("total", "total_line"), ("moneyline", "ml_line")):
        if m in C.MARKETS:
            pl = games[games.home_score.notna() & games.away_score.notna()]
            lines[m] = {int(s): int(n) for s, n in pl[pl[col].notna()].groupby("season").size().items()}
    manifest = {"source": C.SBR_URL.format(name=C.SBR_FILE), "commit": C.SBR_COMMIT, "file_sha256": C.SBR_SHA,
                "seasons": [C.FIRST_SEASON, C.LAB_MAX_SEASON], "sha256": sha, "games_by_season": by_season,
                "lines_by_season": lines, "checks_whole_file": counts,
                "box_scores": (None if box is None else
                               {"source": SDV.BASE, "files": SDV.FILES[C.SPORT], "pinned": C.SDV_SHA.get(C.SPORT, {}),
                                "team_rows_by_season": {int(s): int(n) for s, n in box.groupby("season").size().items()}}),
                "note": f"Lab cache (Constitution D1), seasons {C.FIRST_SEASON}-{C.LAB_MAX_SEASON} only. The csv files "
                        f"are never committed; {C.SEALED_SEASON} is sealed and never stored."}
    with open(man_path, "w") as f:
        json.dump(manifest, f, indent=1)
        f.write("\n")
    log(f"{C.SPORT} cache: {len(games)} games, {C.FIRST_SEASON}-{C.LAB_MAX_SEASON}")
    return True


def _guard(df, name, last):
    if len(df) and int(df.season.max()) > last:
        raise SealedDataError(f"{name}: rows from season {int(df.season.max())} reached the lab (max {last})")
    return df


def load_lab(data_dir=None):
    """The lab's data: {games, team_games}, seasons up to LAB_MAX_SEASON. Raises SealedDataError on anything later."""
    P = _paths(data_dir or C.DATA_DIR)
    out = {}
    for k, p in P.items():
        if not os.path.exists(p):
            raise FileNotFoundError(f"lab cache missing {p}; run: python3 -m research.lab.sbr_data fetch --sport {C.SPORT}")
        out[k] = _guard(pd.read_csv(p, low_memory=False), k, C.LAB_MAX_SEASON)
    return out


def data_fingerprint(data_dir=None):
    h = hashlib.sha256()
    for p in _paths(data_dir or C.DATA_DIR).values():
        h.update(sha_file(p).encode())
    return h.hexdigest()


def blocked_markets(data):
    """D1 line-coverage gate: markets with a closing line on fewer than 70% of a training or gate season's games."""
    g = data["games"]
    g = g[g.home_score.notna() & g.away_score.notna()]
    seasons = list(range(C.TRAIN[0], C.TRAIN[1] + 1)) + [s for _, a, b in C.GATES for s in range(a, b + 1)]
    col = {"spread": "spread_line", "total": "total_line", "moneyline": "ml_line"}
    out = set()
    for m in C.MARKETS:
        for s in seasons:
            x = g[g.season == s]
            if not len(x) or x[col[m]].notna().mean() < 0.70:
                out.add(m)
    return out


def fetch_live(seasons, log=print):
    """Inspector General only: the archive's games for `seasons` (the sealed 2021), straight into memory, with D1a's
    box scores (not fingerprint-pinned: the sealed season is never read before its exam; their fingerprint is logged)."""
    C.refuse_if_suspended()
    games, _, box, goalies = load_box(C.SPORT, list(seasons), download())
    games = games[games.season.isin(list(seasons))].reset_index(drop=True)
    out = {"games": games[GAME_COLS], "team_games": team_games(games, box)}
    if box is not None:
        out["goalie_games"] = goalies
        log(f"{C.SPORT} sealed box scores: " + ", ".join(
            f"{s} {SDV.season_fingerprint(C.SPORT, s, games, box, goalies)[:12]}" for s in seasons))
    return out


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="Part D lab cache: fetch | check")
    ap.add_argument("cmd", choices=["fetch", "check"])
    ap.add_argument("--sport", default=os.environ.get("LAB_SPORT", "NBA"))
    a = ap.parse_args()
    C.use(a.sport)
    C.refuse_if_suspended()                          # D1b
    if a.cmd == "fetch":
        fetch_lab_cache()
    else:
        d = load_lab()
        print({k: (len(v), int(v.season.min()), int(v.season.max())) for k, v in d.items()},
              "blocked:", sorted(blocked_markets(d)) or "none")
    sys.exit(0)
