"""NFL data for the Research Lab (Constitution Part B1).

Two ways in, kept apart on purpose:
  * the lab's cache, research/data/nfl/ -- seasons 2002-2024 only. `fetch_lab_cache` builds it (once; later runs only
    fill missing seasons) and `load_lab` reads it, refusing any row from 2025 on;
  * `fetch_live` -- used only by the Inspector General (sealed exam, paper season). It downloads straight into memory
    and never writes to the cache or anywhere else in the repo.

Sources: nflverse/nfldata games.csv (schedule, final scores, closing spread_line / total_line) and nflverse-data
play-by-play, reduced to team-game rows (offensive plays, EPA) and quarterback-game rows (the box-score numbers 538's
QB VALUE needs). Columns that carry known angles or other prices (weather, roof, surface, moneylines, juice) are
dropped (B1).
"""
import hashlib
import io
import json
import os
import sys
import tempfile
import time
import urllib.request

import pandas as pd

from . import config as C

GAME_COLS = ["game_id", "season", "game_type", "week", "gameday", "gametime", "away_team", "home_team", "away_score",
             "home_score", "location", "away_rest", "home_rest", "spread_line", "total_line", "div_game",
             "away_qb_id", "home_qb_id", "away_qb_name", "home_qb_name", "stadium_id", "stadium"]
PBP_COLS = ["game_id", "season", "posteam", "defteam", "play_type", "epa", "qb_kneel", "qb_spike", "two_point_attempt",
            "pass_attempt", "complete_pass", "passing_yards", "pass_touchdown", "interception", "sack",
            "passer_player_id", "rusher_player_id", "rushing_yards", "rush_touchdown", "qb_dropback", "down", "wp",
            "success", "fumble_lost", "fixed_drive", "drive_time_of_possession"]
TEAM_COLS = ["season", "game_id", "team", "plays", "epa", "pass_plays", "pass_epa", "early_plays", "early_epa", "succ",
             "noto_plays", "noto_epa", "comp_plays", "comp_epa", "top_seconds"]
QB_COLS = ["season", "game_id", "team", "qb_id", "att", "cmp", "yds", "td", "int", "sacks", "ratt", "ryds", "rtd"]
INJURY_COLS = ["season", "game_id", "d_qb", "d_out", "d_q"]     # v12: home minus away, research/injuries study code
INJURY_REL = "https://github.com/nflverse/nflverse-data/releases/download/"
UA = "devig-research-lab/1.0 (personal research; read-only)"


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


def prepare_games(raw, first=C.FIRST_SEASON, last=C.LAB_MAX_SEASON):
    g = raw[(raw.season >= first) & (raw.season <= last)]
    return g[GAME_COLS].sort_values(["gameday", "gametime", "game_id"], na_position="last").reset_index(drop=True)


def aggregate_pbp(pbp):
    """(team_games, qb_games) from one season of play-by-play."""
    p = pbp.copy()
    for c in ["qb_kneel", "qb_spike", "two_point_attempt", "pass_attempt", "complete_pass", "passing_yards",
              "pass_touchdown", "interception", "sack", "rushing_yards", "rush_touchdown", "qb_dropback", "success",
              "fumble_lost"]:
        p[c] = pd.to_numeric(p[c], errors="coerce").fillna(0)
    p = p[p.posteam.notna() & (p.two_point_attempt == 0)]
    scrim = p[p.play_type.isin(["pass", "run"]) & (p.qb_kneel == 0) & (p.qb_spike == 0)]
    sc = scrim.assign(
        e=scrim.epa.fillna(0),
        pp=scrim.qb_dropback == 1, ep=(scrim.down == 1) | (scrim.down == 2),
        nt=(scrim.interception == 0) & (scrim.fumble_lost == 0), cp=scrim.wp.between(0.1, 0.9))
    for k, m in (("pass", "pp"), ("early", "ep"), ("noto", "nt"), ("comp", "cp")):
        sc[k + "_n"] = sc[m].astype(int)
        sc[k + "_e"] = sc.e.where(sc[m], 0.0)
    team = (sc.groupby(["season", "game_id", "posteam"])
            .agg(plays=("play_type", "size"), epa=("e", "sum"), pass_plays=("pass_n", "sum"), pass_epa=("pass_e", "sum"),
                 early_plays=("early_n", "sum"), early_epa=("early_e", "sum"), succ=("success", "sum"),
                 noto_plays=("noto_n", "sum"), noto_epa=("noto_e", "sum"), comp_plays=("comp_n", "sum"),
                 comp_epa=("comp_e", "sum"))
            .reset_index().rename(columns={"posteam": "team"}))
    drv = p[p.fixed_drive.notna()].drop_duplicates(["game_id", "posteam", "fixed_drive"])
    mmss = drv.drive_time_of_possession.astype(str).str.extract(r"^(\d+):(\d+)$").astype(float)
    drv = drv.assign(sec=(mmss[0] * 60 + mmss[1]).fillna(0))
    top = drv.groupby(["season", "game_id", "posteam"]).sec.sum().rename("top_seconds").reset_index()
    team = team.merge(top.rename(columns={"posteam": "team"}), on=["season", "game_id", "team"], how="left")
    team["top_seconds"] = team.top_seconds.fillna(0).astype(int)
    drop = p[p.passer_player_id.notna() & (p.play_type == "pass")]
    pas = (drop.assign(att=((drop.pass_attempt == 1) & (drop.sack == 0)).astype(int))
           .groupby(["season", "game_id", "posteam", "passer_player_id"])
           .agg(att=("att", "sum"), cmp=("complete_pass", "sum"), yds=("passing_yards", "sum"),
                td=("pass_touchdown", "sum"), int=("interception", "sum"), sacks=("sack", "sum"))
           .reset_index().rename(columns={"posteam": "team", "passer_player_id": "qb_id"}))
    run = p[p.rusher_player_id.notna() & (p.play_type == "run")]
    rus = (run.groupby(["season", "game_id", "posteam", "rusher_player_id"])
           .agg(ratt=("play_type", "size"), ryds=("rushing_yards", "sum"), rtd=("rush_touchdown", "sum"))
           .reset_index().rename(columns={"posteam": "team", "rusher_player_id": "qb_id"}))
    qb = pas.merge(rus, on=["season", "game_id", "team", "qb_id"], how="left").fillna({"ratt": 0, "ryds": 0, "rtd": 0})
    for c in ("epa", "pass_epa", "early_epa", "noto_epa", "comp_epa"):
        team[c] = team[c].round(4)
    for c in ("succ",):
        team[c] = team[c].astype(int)
    for c in ["att", "cmp", "yds", "td", "int", "sacks", "ratt", "ryds", "rtd"]:
        qb[c] = qb[c].astype(int)
    return team[TEAM_COLS], qb[QB_COLS]


def _pbp_season(season):
    with tempfile.TemporaryDirectory() as d:          # downloads land in their own empty folder
        path = os.path.join(d, f"pbp_{season}.csv.gz")
        with open(path, "wb") as f:
            f.write(_get(C.PBP_URL.format(season=season)))
        pbp = pd.read_csv(path, usecols=lambda c: c in PBP_COLS, low_memory=False)
    return aggregate_pbp(pbp)


def injury_rows(seasons, log=print):
    """Per game, home minus away: last game's QB unavailable (d_qb), regulars unavailable (d_out), regulars
    questionable (d_q) -- built by the locked injury study's own code (research/injuries/nfl_injury_study_v1.py,
    definitions in NFL_INJURY_STUDY_V1_PREREG.md) from nflverse injury reports, weekly rosters and snap counts, all
    published before kickoff. Seasons before C.INJURY_FIRST have no snap counts and get no rows (feature 0)."""
    sys.path.insert(0, os.path.join(C.RESEARCH, "injuries"))
    import nfl_injury_study_v1 as INJ                  # locked; read-only use
    seasons = [s for s in seasons if s >= C.INJURY_FIRST]
    if not seasons:
        return pd.DataFrame(columns=INJURY_COLS)

    def csv(name):
        with tempfile.TemporaryDirectory() as d:          # downloads land in their own empty folder
            path = os.path.join(d, "f.csv")
            with open(path, "wb") as f:
                f.write(_get(INJURY_REL + name))
            return pd.read_csv(path, low_memory=False)
    g = csv("schedules/games.csv")
    g = g[g.season.isin(seasons)].copy()
    g["home"], g["away"] = g.home_team.map(INJ.fr), g.away_team.map(INJ.fr)
    g = g.sort_values(["season", "week", "gameday", "game_id"]).reset_index(drop=True)
    out = []
    players = csv("players/players.csv")
    for s in seasons:                                    # regulars are same-season only, so seasons are independent
        part = [csv(f"snap_counts/snap_counts_{s}.csv"), csv(f"injuries/injuries_{s}.csv"), players,
                csv(f"weekly_rosters/roster_weekly_{s}.csv")]
        feats, cover = INJ.build(g[g.season == s], part[0], part[1], part[2], part[3])
        log(f"injuries {s}: {len(feats)} games, {cover['report_rows_matched_to_snap_counts']} of "
            f"{cover['report_rows_with_status']} report rows matched")
        out.append(feats[INJURY_COLS])
    return pd.concat(out, ignore_index=True)


def _paths(data_dir):
    return {k: os.path.join(data_dir, f"{k}.csv") for k in ("games", "team_games", "qb_games", "injury_games")}


def sha_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        h.update(f.read())
    return h.hexdigest()


def fetch_lab_cache(data_dir=None, log=print):
    data_dir = data_dir or C.DATA_DIR
    """Build or complete the lab cache (2002-2024). Returns True when anything was downloaded."""
    os.makedirs(data_dir, exist_ok=True)
    P = _paths(data_dir)
    want = list(range(C.FIRST_SEASON, C.LAB_MAX_SEASON + 1))
    changed = False
    if os.path.exists(P["games"]):
        games = pd.read_csv(P["games"], low_memory=False)
    else:
        games = None
    if games is None or sorted(games.season.unique()) != want:
        raw = pd.read_csv(io.BytesIO(_get(C.GAMES_URL)), low_memory=False)
        games = prepare_games(raw)
        games.to_csv(P["games"], index=False)
        log(f"schedule: {len(games)} games, {games.season.min()}-{games.season.max()}")
        changed = True
    team = pd.read_csv(P["team_games"]) if os.path.exists(P["team_games"]) else pd.DataFrame(columns=TEAM_COLS)
    qb = pd.read_csv(P["qb_games"]) if os.path.exists(P["qb_games"]) else pd.DataFrame(columns=QB_COLS)
    have = set(team.season.unique()) & set(qb.season.unique()) if set(TEAM_COLS) <= set(team.columns) else set()
    for s in want:
        if s in have:
            continue
        t, q = _pbp_season(s)
        team = pd.concat([team[team.season != s].reindex(columns=TEAM_COLS), t], ignore_index=True)
        qb = pd.concat([qb[qb.season != s], q], ignore_index=True)
        log(f"play-by-play {s}: {len(t)} team-games, {len(q)} QB-games")
        changed = True
    if not os.path.exists(P["injury_games"]):             # v12: built once, from the locked study code
        injury_rows(want, log).sort_values(["season", "game_id"]).to_csv(P["injury_games"], index=False)
        changed = True
    if changed:
        team.sort_values(["season", "game_id", "team"]).to_csv(P["team_games"], index=False)
        qb.sort_values(["season", "game_id", "team", "qb_id"]).to_csv(P["qb_games"], index=False)
        manifest = {"sources": {"games": C.GAMES_URL, "pbp": C.PBP_URL,
                                "injuries": INJURY_REL + "{injuries,weekly_rosters,snap_counts,players,schedules}"},
                    "seasons": [want[0], want[-1]],
                    "sha256": {k: sha_file(v) for k, v in P.items()},
                    "note": "Lab cache (Constitution B1). Seasons 2002-2024 only; 2025 is sealed and never stored here."}
        with open(os.path.join(data_dir, "MANIFEST.json"), "w") as f:
            json.dump(manifest, f, indent=2)
    return changed


def _guard(df, name, last):
    if len(df) and int(df.season.max()) > last:
        raise SealedDataError(f"{name}: rows from season {int(df.season.max())} reached the lab (max {last})")
    return df


def load_lab(data_dir=None):
    """The lab's data: {games, team_games, qb_games, injury_games}, seasons 2002-2024 (injury_games from 2013).
    Raises SealedDataError on anything later."""
    P = _paths(data_dir or C.DATA_DIR)
    out = {}
    for k, p in P.items():
        if not os.path.exists(p):
            raise FileNotFoundError(f"lab cache missing {p}; run: python3 -m research.lab.data fetch")
        out[k] = _guard(pd.read_csv(p, low_memory=False), k, C.LAB_MAX_SEASON)
    return out


def data_fingerprint(data_dir=None):
    h = hashlib.sha256()
    for p in _paths(data_dir or C.DATA_DIR).values():
        h.update(sha_file(p).encode())
    return h.hexdigest()


def fetch_live(seasons, log=print):
    """Inspector General only: schedule + play-by-play aggregates for `seasons` (e.g. [2025] or [2025, 2026]),
    straight into memory. Never writes into the repo."""
    raw = pd.read_csv(io.BytesIO(_get(C.GAMES_URL)), low_memory=False)
    games = prepare_games(raw, first=min(seasons), last=max(seasons))
    teams, qbs = [], []
    for s in seasons:
        try:
            t, q = _pbp_season(s)
        except RuntimeError as e:                   # the current season's file can lag; the model then uses what it has
            log(f"play-by-play {s} unavailable: {e}")
            continue
        teams.append(t); qbs.append(q)
    team = pd.concat(teams, ignore_index=True) if teams else pd.DataFrame(columns=TEAM_COLS)
    qb = pd.concat(qbs, ignore_index=True) if qbs else pd.DataFrame(columns=QB_COLS)
    try:
        inj = injury_rows(seasons, log)
    except RuntimeError as e:                           # a lagging current-season file: injury features are then 0
        log(f"injury data unavailable: {e}")
        inj = pd.DataFrame(columns=INJURY_COLS)
    return {"games": games, "team_games": team, "qb_games": qb, "injury_games": inj}


if __name__ == "__main__":
    if sys.argv[1:] == ["fetch"]:
        fetch_lab_cache()
    elif sys.argv[1:] == ["check"]:
        d = load_lab()
        print({k: (len(v), int(v.season.min()), int(v.season.max())) for k, v in d.items()})
    else:
        sys.exit("usage: python3 -m research.lab.data fetch|check")
