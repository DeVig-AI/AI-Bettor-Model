"""Box scores for the NBA and NHL chambers (Constitution v14 D1a), from sportsdataverse's public data releases.

Source: github.com/sportsdataverse/sportsdataverse-data releases (MIT-licensed tooling; ESPN / NHL box scores):
  NBA  espn_nba_team_boxscores/team_box_<Y>.csv       one row per team per game
  NHL  nhl_schedules/nhl_schedule_<Y>.csv             game id, date, home and away team
       nhl_goalie_boxscores/goalie_box_<Y>.csv        one row per goalie per game (starter flag, shots, saves)
<Y> is the year the season ENDS (2015 = the 2014-15 season); the lab's season is the year it starts (D1), so lab
season S reads file S + 1.

What this module gives the lab, per lab season:
  * a match and a date fix (D1a): each archive game is matched to the sportsdataverse game with the same home and away
    team on the archive's date, one day either side, or -- for the archive's COVID-era dates, which are a year early --
    one year later, one day either side. Only a game matched a year later takes sportsdataverse's date; every other
    game keeps the archive's date (a one-day difference is a time-zone convention, and keeping it leaves every season
    the search has scored unchanged).
  * per team per matched game, box-score columns (BOX_COLUMNS) that signals may read (signals.py, A3.3e);
  * NHL: per goalie per matched game, starter flag, shots against and saves (the `goalie` signal kind).
Only these derived columns are kept. Their fingerprint per lab season (sha256 of the derived csv) is fixed in
config.SDV_SHA for 2011-2020; the lab refuses to run on any other. The sealed season is never fingerprinted here: the
Inspector General reads it in memory only (D1a).
"""
import datetime as dt
import hashlib
import io
import os
import time
import urllib.request

import numpy as np
import pandas as pd

from . import config as C

BASE = "https://github.com/sportsdataverse/sportsdataverse-data/releases/download/"
UA = "devig-research-lab/1.0 (public research; read-only)"
FILES = {
    "NBA": {"team_box": "espn_nba_team_boxscores/team_box_{y}.csv"},
    "NHL": {"schedule": "nhl_schedules/nhl_schedule_{y}.csv", "goalie_box": "nhl_goalie_boxscores/goalie_box_{y}.csv"},
}
BOX_COLUMNS = {
    "NBA": ["poss", "fga", "fgm", "fg3a", "fg3m", "fta", "ftm", "oreb", "dreb", "tov", "ast"],
    "NHL": ["shots", "es_shots", "pp_shots", "pp_goals"],
}
GOALIE_COLS = ["season", "game_id", "team", "goalie_id", "starter", "shots_against", "saves"]

# ESPN's NBA team names -> the archive's (sbr_data keeps the archive's own names). By location first: the archive uses
# today's names, so the 2011-13 New Orleans Hornets are the Pelicans and the 2011-14 Charlotte Bobcats the Hornets.
NBA_BY_LOCATION = {"Charlotte": "Hornets", "New Orleans": "Pelicans", "Philadelphia": "Seventysixers",
                   "Portland": "Trailblazers", "New Jersey": "Nets", "Brooklyn": "Nets"}
# NHL: the archive's names are nicknames; sportsdataverse's are full names ("Boston Bruins"), matched by ending.


class BoxDataError(RuntimeError):
    pass


def _get(path, tries=4):
    url = BASE + path
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read()
        except Exception as e:                       # network hiccup: back off and retry
            if i == tries - 1:
                raise BoxDataError(f"download failed: {url}: {e}") from e
            time.sleep(2 ** (i + 1))


def _csv(path):
    return pd.read_csv(io.BytesIO(_get(path)), low_memory=False)


def raw(sport, season):
    """{name: DataFrame} of the sportsdataverse files for one lab season (file year = season + 1)."""
    return {k: _csv(p.format(y=season + 1)) for k, p in FILES[sport].items()}


def _nhl_name(full, nicks):
    s = str(full)
    for k in sorted(nicks, key=len, reverse=True):
        if s.endswith(k):
            return k
    return None


def schedule(sport, files, nicks):
    """[(sdv game id, date, home, away)] in the archive's team names; games whose teams cannot be named are left out."""
    out = []
    if sport == "NBA":
        d = files["team_box"]
        for r in d[d.team_home_away == "home"].itertuples():
            h = NBA_BY_LOCATION.get(r.team_location) or str(r.team_name).replace(" ", "")
            a = NBA_BY_LOCATION.get(r.opponent_team_location) or str(r.opponent_team_name).replace(" ", "")
            out.append((str(r.game_id), str(r.game_date)[:10], h, a))
    else:
        for r in files["schedule"].itertuples():
            h, a = _nhl_name(r.home_team_name, nicks), _nhl_name(r.away_team_name, nicks)
            if h and a:
                out.append((str(r.game_id), str(r.game_date)[:10], h, a))
    return [x for x in out if x[2] in nicks and x[3] in nicks]


def matcher(sched):
    """fix(day, home, away) -> (sdv game id, date to use) or None: same teams, the archive's date +-1 day (date kept),
    else one year later +-1 day (the archive's COVID-era dates: sdv's date). The closest wins; each sdv game is used
    once."""
    by_pair = {}
    for gid, day, h, a in sched:
        by_pair.setdefault((h, a), []).append((dt.date.fromisoformat(day), gid))
    used = set()

    def fix(day, h, a):
        cands = by_pair.get((h, a), [])
        for shift in (0, 365, 366):
            want = day + dt.timedelta(days=shift)
            best = sorted((abs((d - want).days), d, gid) for d, gid in cands
                          if abs((d - want).days) <= 1 and gid not in used)
            if best:
                _, d, gid = best[0]
                used.add(gid)
                return gid, (d if shift else day)
        return None
    return fix


def team_rows(sport, files):
    """{sdv game id: {home|away: {box column: value}}} for one season's files."""
    out = {}
    if sport == "NBA":
        d = files["team_box"]
        tov = d["turnovers"]          # the players' turnovers: complete every season (2017-18 lacks total_turnovers)
        poss = d.field_goals_attempted - d.offensive_rebounds + tov + 0.44 * d.free_throws_attempted
        vals = pd.DataFrame({"poss": poss, "fga": d.field_goals_attempted, "fgm": d.field_goals_made,
                             "fg3a": d.three_point_field_goals_attempted, "fg3m": d.three_point_field_goals_made,
                             "fta": d.free_throws_attempted, "ftm": d.free_throws_made,
                             "oreb": d.offensive_rebounds, "dreb": d.defensive_rebounds, "tov": tov,
                             "ast": d.assists})
        for gid, side, v in zip(d.game_id.astype(str), d.team_home_away, vals.to_dict("records")):
            out.setdefault(gid, {})[side] = v
    else:                                           # a team's shots = the shots the other team's goalies faced
        g = files["goalie_box"].copy()
        for c in ("even_strength_shots_against", "power_play_shots_against"):     # "saves/shots" text: the shots
            g[c] = pd.to_numeric(g[c].astype(str).str.split("/").str[-1], errors="coerce")
        agg = g.groupby([g.game_id.astype(str), "home_away"])[
            ["shots_against", "even_strength_shots_against", "power_play_shots_against",
             "power_play_goals_against"]].sum()
        for (gid, side), r in agg.iterrows():
            team = "away" if side == "home" else "home"
            out.setdefault(gid, {})[team] = {"shots": r.shots_against, "es_shots": r.even_strength_shots_against,
                                             "pp_shots": r.power_play_shots_against,
                                             "pp_goals": r.power_play_goals_against}
    return out


def goalie_rows(files):
    g = files["goalie_box"]
    return {gid: x for gid, x in g.assign(game_id=g.game_id.astype(str)).groupby("game_id")}


def season(sport, games, files):
    """(games with fixed dates and sdv ids, box rows, goalie rows) for one lab season of archive games (a DataFrame with
    season, gameday, home_team, away_team, ...). Box and goalie rows carry the archive's team names; game_id is filled
    in by sbr_data after the dates are fixed (it is built from the date)."""
    nicks = set(games.home_team) | set(games.away_team)
    fix = matcher(schedule(sport, files, nicks))
    sdv_id, days = [], []
    for r in games.itertuples():
        m = fix(dt.date.fromisoformat(r.gameday), r.home_team, r.away_team)
        sdv_id.append(m[0] if m else None)
        days.append(m[1].isoformat() if m else r.gameday)
    games = games.copy()
    games["sdv_id"], games["gameday"] = sdv_id, days
    return games


def box_frames(sport, games, files_by_season):
    """(team box rows, goalie rows) for games that have game_id and sdv_id, from {season: files}."""
    teams, goalies = [], []
    for s, files in files_by_season.items():
        tr = team_rows(sport, files)
        gr = goalie_rows(files) if sport == "NHL" else {}
        for r in games[(games.season == s) & games.sdv_id.notna()].itertuples():
            sides = tr.get(r.sdv_id, {})
            for side, team in (("home", r.home_team), ("away", r.away_team)):
                v = sides.get(side)
                if v:
                    teams.append(dict(season=s, game_id=r.game_id, team=team, **v))
            if sport == "NHL" and r.sdv_id in gr:
                for x in gr[r.sdv_id].itertuples():
                    goalies.append({"season": s, "game_id": r.game_id,
                                    "team": r.home_team if x.home_away == "home" else r.away_team,
                                    "goalie_id": int(x.player_id), "starter": bool(x.starter),
                                    "shots_against": int(x.shots_against), "saves": int(x.saves)})
    t = pd.DataFrame(teams, columns=["season", "game_id", "team"] + BOX_COLUMNS[sport])
    g = pd.DataFrame(goalies, columns=GOALIE_COLS)
    return (t.sort_values(["season", "game_id", "team"]).reset_index(drop=True),
            g.sort_values(["season", "game_id", "team", "goalie_id"]).reset_index(drop=True))


def fingerprint(df):
    """sha256 of a frame as the lab writes it (csv, no index, floats rounded to 6 places)."""
    return hashlib.sha256(df.round(6).to_csv(index=False).encode()).hexdigest()


def season_fingerprint(sport, s, games, teams, goalies):
    """One season's fingerprint: its date-fixed game keys, box rows and goalie rows."""
    keys = games[games.season == s][["game_id", "sdv_id"]].fillna("").sort_values("game_id").reset_index(drop=True)
    parts = [fingerprint(keys), fingerprint(teams[teams.season == s].reset_index(drop=True))]
    if sport == "NHL":
        parts.append(fingerprint(goalies[goalies.season == s].reset_index(drop=True)))
    return hashlib.sha256("|".join(parts).encode()).hexdigest()


def check_pinned(sport, seasons, games, teams, goalies):
    """Raise BoxDataError unless every season's fingerprint is the one config.SDV_SHA fixes (D1a)."""
    pins = C.SDV_SHA.get(sport, {})
    bad = []
    for s in seasons:
        got = season_fingerprint(sport, s, games, teams, goalies)
        if pins.get(s) != got:
            bad.append(f"{s}: {got[:12]} (fixed: {str(pins.get(s))[:12]})")
    if bad:
        raise BoxDataError(f"{sport} box scores differ from the ones Part D1a fixes: " + "; ".join(bad) +
                           ". Refusing to use them; a different file needs a new version.")
