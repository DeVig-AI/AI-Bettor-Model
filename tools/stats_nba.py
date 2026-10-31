#!/usr/bin/env python3
"""
stats_nba.py -- the Research section's NBA files: DeVig's power rankings, team stats and every player's averages and
game log, this season and last, from ESPN's box scores as published by sportsdataverse (the same source as the NBA
props model). Display only: nothing here feeds a model, a pick or a test.

Output (stats/nba/):
  index.json       {generated_at, season, last_season, rating_note, teams: [ranked summaries], players: [search rows]}
  team_<CODE>.json {code, name, color, this, last, games, players: [{id, name, pos, this, last, log}]}
Team codes are the app's (KG.canon: NYK, GSW, SAS, NOP, UTA, WAS). A player's team is the team of his latest game.
Regular season and playoffs only (no preseason, play-in or All-Star). Run daily by .github/workflows/stats.yml.
"""
import os
import sys
import tempfile
import urllib.request
from datetime import datetime, timezone

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kalshi_games_v1 as KG  # noqa: E402  (team codes only)
import stats_common as S  # noqa: E402

SPORT = "NBA"                                   # tools/stats_wnba.py swaps these module settings for the WNBA
OUT = os.path.join(os.path.dirname(__file__), "..", "stats", "nba")
URL = "https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_nba_{kind}_boxscores/{kind}_box_{y}.csv"
TYPES = {2: "R", 3: "P"}                       # regular season, playoffs
STATS = ["min", "pts", "reb", "ast", "fg3m", "stl", "blk", "tov"]
COLS = {"minutes": "min", "points": "pts", "rebounds": "reb", "assists": "ast", "three_point_field_goals_made": "fg3m",
        "steals": "stl", "blocks": "blk", "turnovers": "tov", "field_goals_made": "fgm", "field_goals_attempted": "fga",
        "three_point_field_goals_attempted": "fg3a", "free_throws_made": "ftm", "free_throws_attempted": "fta"}


# What the app's Research pages show for this sport (they read it from index.json, so each sport is just data).
CONFIG = {
    "rating_unit": "points",
    "search_cols": ["PTS", "REB", "AST"],
    "rank_low": ["oppg", "drtg"], "rank_skip": ["pace"],          # league ranks: lower is better / no better direction
    "team_rows": [["Record", "record"], ["Points per game", "ppg", 1], ["Allowed per game", "oppg", 1],
                  ["Average margin", "margin", 1, True], ["Points per 100 possessions", "ortg", 1],
                  ["Allowed per 100 possessions", "drtg", 1], ["Possessions per game", "pace", 1], ["Field goal %", "fg_pct", 1],
                  ["3-point %", "fg3_pct", 1], ["Free throw %", "ft_pct", 1], ["Home", "home"], ["Away", "away"],
                  ["Last 10", "last10"]],
    "roster_cols": [["GP", "gp", 0], ["MIN", "min", 0], ["PTS", "pts", 1], ["REB", "reb", 1], ["AST", "ast", 1]],
    "player_cols": [["GP", "gp", 0], ["MIN", "min", 1], ["PTS", "pts", 1], ["REB", "reb", 1], ["AST", "ast", 1], ["3PM", "fg3m", 1],
                    ["STL", "stl", 1], ["BLK", "blk", 1], ["TOV", "tov", 1], ["FG%", "fg_pct", 1], ["3P%", "fg3_pct", 1],
                    ["FT%", "ft_pct", 1]],
    "player_note": "Per game, regular season.",
    "log_show": [["MIN", "min"], ["PTS", "pts"], ["REB", "reb"], ["AST", "ast"], ["3PM", "fg3m"]],
    "hit_stats": [["points", "Points", ["pts"]], ["rebounds", "Rebounds", ["reb"]], ["assists", "Assists", ["ast"]],
                  ["threes", "3-pointers", ["fg3m"]], ["pts_reb_ast", "Pts + Reb + Ast", ["pts", "reb", "ast"]],
                  ["pts_reb", "Pts + Reb", ["pts", "reb"]], ["pts_ast", "Pts + Ast", ["pts", "ast"]],
                  ["reb_ast", "Reb + Ast", ["reb", "ast"]], ["steals", "Steals", ["stl"]], ["blocks", "Blocks", ["blk"]],
                  ["stl_blk", "Steals + Blocks", ["stl", "blk"]], ["turnovers", "Turnovers", ["tov"]]],
}


def season_of(now):
    """sportsdataverse names a season by the year it ends: 2026-27 is 2027."""
    return now.year + 1 if now.month >= 8 else now.year


def label(y):
    return f"{y - 1}-{str(y)[2:]}"


def fetch(kind, y, cache):
    path = os.path.join(cache, f"{kind}_box_{y}.csv")
    if not os.path.exists(path):
        try:
            urllib.request.urlretrieve(URL.format(kind=kind, y=y), path)
        except Exception as e:                  # a season not published yet (before opening night): no file
            print(f"{kind} {y}: {type(e).__name__}: {e}")
            return None
    return path


def code(a):
    return KG.canon("NBA", a)


def load(cache, y):
    """(players, teams) DataFrames for season y, regular season and playoffs, NBA teams only (or empty frames)."""
    pp, tp = fetch("player", y, cache), fetch("team", y, cache)
    p = pd.read_csv(pp, low_memory=False) if pp else pd.DataFrame()
    t = pd.read_csv(tp, low_memory=False) if tp else pd.DataFrame()
    if len(p):
        p = p[p.season_type.isin(TYPES)].copy()
        p["team"], p["opp"] = p.team_abbreviation.map(code), p.opponent_team_abbreviation.map(code)
        p = p[p.team.isin(TEAMS) & p.opp.isin(TEAMS)]
        p = p[(p.did_not_play != True) & (p.minutes.fillna(0) > 0)].rename(columns=COLS)  # noqa: E712
        p["season"] = y
    if len(t):
        t = t[t.season_type.isin(TYPES)].copy()
        t["team"], t["opp"] = t.team_abbreviation.map(code), t.opponent_team_abbreviation.map(code)
        t = t[t.team.isin(TEAMS) & t.opp.isin(TEAMS)]
        t["tov_all"] = t["total_turnovers"].fillna(t["turnovers"]) if "total_turnovers" in t else t["turnovers"]
        t["season"] = y
    return p, t


TEAMS = set(KG.canon("NBA", c) for c in (
    "ATL BKN BOS CHA CHI CLE DAL DEN DET GS HOU IND LAC LAL MEM MIA MIL MIN NO NY OKC ORL PHI PHX POR SAC SA TOR UTAH "
    "WSH").split())


def team_season(t):
    """{team: summary} for one season's team box rows."""
    out = {}
    if not len(t):
        return out
    opp = t[["game_id", "team", "team_score", "field_goals_attempted", "offensive_rebounds", "tov_all",
             "free_throws_attempted"]].rename(columns=lambda c: "o_" + c if c != "game_id" else c)
    g = t.merge(opp, on="game_id")
    g = g[g.team != g.o_team].sort_values("game_date")
    for team, x in g.groupby("team"):
        reg = x[x.season_type == 2]
        res = ["W" if a > b else "L" for a, b in zip(reg.team_score, reg.o_team_score)]
        w, l, l10, streak = S.record(res)
        poss = 0.5 * ((reg.field_goals_attempted - reg.offensive_rebounds + reg.tov_all + 0.44 * reg.free_throws_attempted)
                      + (reg.o_field_goals_attempted - reg.o_offensive_rebounds + reg.o_tov_all + 0.44 * reg.o_free_throws_attempted))
        n = len(reg)
        home, away = reg[reg.team_home_away == "home"], reg[reg.team_home_away == "away"]

        def rec(d):
            return f"{int((d.team_score > d.o_team_score).sum())}-{int((d.team_score < d.o_team_score).sum())}"
        out[team] = {
            "gp": n, "w": w, "l": l, "record": f"{w}-{l}", "last10": l10, "streak": streak, "home": rec(home), "away": rec(away),
            "ppg": S.r1(reg.team_score.mean()) if n else None, "oppg": S.r1(reg.o_team_score.mean()) if n else None,
            "margin": S.r1((reg.team_score - reg.o_team_score).mean()) if n else None,
            "ortg": S.r1(100 * reg.team_score.sum() / poss.sum()) if n and poss.sum() else None,
            "drtg": S.r1(100 * reg.o_team_score.sum() / poss.sum()) if n and poss.sum() else None,
            "pace": S.r1(poss.mean()) if n else None,
            "fg_pct": S.r1(100 * reg.field_goals_made.sum() / reg.field_goals_attempted.sum()) if n else None,
            "fg3_pct": S.r1(100 * reg.three_point_field_goals_made.sum() / reg.three_point_field_goals_attempted.sum()) if n else None,
            "ft_pct": S.r1(100 * reg.free_throws_made.sum() / reg.free_throws_attempted.sum()) if n else None,
            "games": [[str(r.game_date)[:10], r.o_team, "H" if r.team_home_away == "home" else "A", int(r.team_score),
                       int(r.o_team_score), "W" if r.team_score > r.o_team_score else "L", TYPES[int(r.season_type)],
                       int(r.season)] for r in x.itertuples()][::-1]}
    return out


def ratings(t):
    """SRS for one season's regular-season games: {team: rating}, and games per team."""
    if not len(t):
        return {}, {}
    h = t[(t.season_type == 2) & (t.team_home_away == "home")]
    games = [(r.team, r.opp, r.team_score - r.opponent_team_score) for r in h.itertuples()]
    r, _ = S.srs(games, sorted(TEAMS))
    gp = t[t.season_type == 2].groupby("team").size().to_dict()
    return r, gp


def player_season(x):
    """Season averages from one player's regular-season rows."""
    reg = x[x.season_type == 2]
    n = len(reg)
    if not n:
        return None
    out = {"gp": n}
    for s in STATS:
        out[s] = S.r1(reg[s].mean())
    for name, m, a in (("fg_pct", "fgm", "fga"), ("fg3_pct", "fg3m", "fg3a"), ("ft_pct", "ftm", "fta")):
        out[name] = S.r1(100 * reg[m].sum() / reg[a].sum()) if reg[a].sum() else None
    return out


def build(now, cache):
    y = season_of(now)
    p_this, t_this = load(cache, y)
    p_last, t_last = load(cache, y - 1)
    ts_this, ts_last = team_season(t_this), team_season(t_last)
    r_this, gp_this = ratings(t_this)
    r_last, _ = ratings(t_last)
    names, colors = {}, {}
    for t in (t_last, t_this):
        for r in t.itertuples() if len(t) else []:
            names[r.team], colors[r.team] = r.team_display_name, "#" + str(r.team_color)
    rating = {k: S.blend(r_this.get(k, 0.0), r_last.get(k, 0.0), gp_this.get(k, 0)) for k in TEAMS}
    order = sorted(TEAMS, key=lambda k: -rating[k])
    rank = {k: i + 1 for i, k in enumerate(order)}

    players = pd.concat([d for d in (p_last, p_this) if len(d)], ignore_index=True) if len(p_last) or len(p_this) else pd.DataFrame()
    roster, search = {k: [] for k in TEAMS}, []
    if len(players):
        players = players.sort_values(["game_date", "game_id"])
        for pid, x in players.groupby("athlete_id"):
            latest = x.iloc[-1]
            this, last = player_season(x[x.season == y]), player_season(x[x.season == y - 1])
            log = [[str(r.game_date)[:10], r.opp, "H" if r.home_away == "home" else "A"]
                   + [None if getattr(r, s) != getattr(r, s) else int(round(getattr(r, s))) for s in STATS]
                   + [1 if r.starter else 0, TYPES[int(r.season_type)], int(r.season)]
                   for r in x.itertuples()][::-1]
            pl = {"id": int(pid), "name": latest.athlete_display_name, "pos": latest.athlete_position_abbreviation
                  if isinstance(latest.athlete_position_abbreviation, str) else "", "this": this, "last": last, "log": log}
            shirt = pd.to_numeric(getattr(latest, "athlete_jersey", None), errors="coerce")   # his latest game's number
            if shirt == shirt and shirt is not None:
                pl["num"] = int(shirt)
            if this or gp_this.get(latest.team, 0) < S.PRIOR_GAMES:   # gone since last season: off the roster by game 10
                roster[latest.team].append(pl)
            cur = this or last or {}
            search.append([int(pid), pl["name"], latest.team, pl["pos"], cur.get("gp"), cur.get("pts"), cur.get("reb"),
                           cur.get("ast"), y if this else y - 1])
    stamp = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    teams = []
    for k in order:
        s = ts_this.get(k) or {}
        teams.append({"code": k, "name": names.get(k, k), "color": colors.get(k), "rank": rank[k], "rating": S.r1(rating[k]),
                      "rating_this": S.r1(r_this.get(k)) if gp_this.get(k) else None, "rating_last": S.r1(r_last.get(k)),
                      **{f: s.get(f) for f in ("gp", "w", "l", "record", "last10", "streak", "ppg", "oppg", "margin", "ortg", "drtg")}})
    ranks = S.league_ranks(ts_this, CONFIG["team_rows"], CONFIG["rank_low"], CONFIG["rank_skip"])
    for k in TEAMS:
        roster[k].sort(key=lambda pl: -((pl["this"] or {}).get("min") or (pl["last"] or {}).get("min") or 0))
        this, last = ts_this.get(k), ts_last.get(k)
        S.write(os.path.join(OUT, f"team_{k}.json"), {
            "generated_at": stamp, "code": k, "name": names.get(k, k), "color": colors.get(k), "rank": rank[k],
            "rating": S.r1(rating[k]), "season": label(y), "last_season": label(y - 1), "season_year": y,
            "this": {f: v for f, v in (this or {}).items() if f != "games"} or None, "ranks": ranks.get(k) or None,
            "last": {f: v for f, v in (last or {}).items() if f != "games"} or None,
            "games": (this or {}).get("games", []) + (last or {}).get("games", []),
            "players": roster[k]})
    search.sort(key=lambda r: -(r[5] or 0))
    S.write(os.path.join(OUT, "index.json"), {
        "generated_at": stamp, "sport": SPORT, "season": label(y), "last_season": label(y - 1), "season_year": y,
        "rating_note": (f"Points per game better than an average team, adjusted for who each team played (SRS). Early in "
                        f"the season last season's rating counts as {S.PRIOR_GAMES} games, pulled "
                        f"{round((1 - S.CARRY) * 100)}% toward average."),
        "source": "ESPN box scores (via sportsdataverse). Unofficial; regular season and playoffs only.",
        "log_cols": ["date", "opp", "ha"] + STATS + ["starter", "type", "season"], **CONFIG,
        "teams": teams, "players": search})
    return len(search)


def main():
    cache = os.getenv("STATS_CACHE") or tempfile.mkdtemp()
    n = build(datetime.now(timezone.utc), cache)
    print(f"{SPORT} research files: {n} players")
    return 0


if __name__ == "__main__":
    sys.exit(main())
