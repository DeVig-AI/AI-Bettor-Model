#!/usr/bin/env python3
"""
stats_nfl.py -- the Research section's NFL files: DeVig's power rankings, team stats with league ranks, and every
offensive (QB, RB, WR, TE) and defensive (DL, LB, DB) player's averages and game log, this season and last, from nflverse's public weekly stats and schedule (the
same family of data as the NFL models). Display only: nothing here feeds a model, a pick or a test.

Output (stats/nfl/): index.json and team_<CODE>.json, the same layout as stats/nba/ (tools/stats_nba.py). nflverse's
team codes are the app's (LA = Rams, LAC, LV, JAX, WAS). Run twice a day by .github/workflows/stats.yml.
"""
import os
import sys
import tempfile
import urllib.request
from datetime import datetime, timezone

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import stats_common as S  # noqa: E402

OUT = os.path.join(os.path.dirname(__file__), "..", "stats", "nfl")
REL = "https://github.com/nflverse/nflverse-data/releases/download/"
URLS = {"games": REL + "schedules/games.csv", "player": REL + "stats_player/stats_player_week_{y}.csv",
        "team": REL + "stats_team/stats_team_week_{y}.csv", "roster": REL + "rosters/roster_{y}.csv"}
PRIOR = 4                                       # a 17-game season: last season's rating counts as 4 games
OFFENSE, DEFENSE = ["QB", "RB", "WR", "TE"], ["DL", "LB", "DB"]   # nflverse position groups, in roster order
GROUPS = set(OFFENSE + DEFENSE)
TYPES = {"REG": "R", "WC": "P", "DIV": "P", "CON": "P", "SB": "P"}
LOG = ["cmp", "att", "pass_yds", "pass_td", "int", "car", "rush_yds", "rush_td", "rec", "tgt", "rec_yds", "rec_td"]
DLOG = ["tkl", "sk", "int_d", "pd", "tfl", "qbh", "ff"]        # defense: tackles (solo + assists), sacks, INT, ...
DCOLS = {"def_sacks": "sk", "def_interceptions": "int_d", "def_pass_defended": "pd", "def_tackles_for_loss": "tfl",
         "def_qb_hits": "qbh", "def_fumbles_forced": "ff"}
COLS = {"completions": "cmp", "attempts": "att", "passing_yards": "pass_yds", "passing_tds": "pass_td",
        "passing_interceptions": "int", "carries": "car", "rushing_yards": "rush_yds", "rushing_tds": "rush_td",
        "receptions": "rec", "targets": "tgt", "receiving_yards": "rec_yds", "receiving_tds": "rec_td"}
NAMES = {"ARI": "Arizona Cardinals", "ATL": "Atlanta Falcons", "BAL": "Baltimore Ravens", "BUF": "Buffalo Bills",
         "CAR": "Carolina Panthers", "CHI": "Chicago Bears", "CIN": "Cincinnati Bengals", "CLE": "Cleveland Browns",
         "DAL": "Dallas Cowboys", "DEN": "Denver Broncos", "DET": "Detroit Lions", "GB": "Green Bay Packers",
         "HOU": "Houston Texans", "IND": "Indianapolis Colts", "JAX": "Jacksonville Jaguars", "KC": "Kansas City Chiefs",
         "LA": "Los Angeles Rams", "LAC": "Los Angeles Chargers", "LV": "Las Vegas Raiders", "MIA": "Miami Dolphins",
         "MIN": "Minnesota Vikings", "NE": "New England Patriots", "NO": "New Orleans Saints", "NYG": "New York Giants",
         "NYJ": "New York Jets", "PHI": "Philadelphia Eagles", "PIT": "Pittsburgh Steelers", "SEA": "Seattle Seahawks",
         "SF": "San Francisco 49ers", "TB": "Tampa Bay Buccaneers", "TEN": "Tennessee Titans", "WAS": "Washington Commanders"}
TEAMS = set(NAMES)
POS_COLS = {
    "QB": [["GP", "gp", 0], ["PASS", "pass_yds", 1], ["TD", "pass_td", 2], ["INT", "int", 2], ["RUSH", "rush_yds", 1]],
    "RB": [["GP", "gp", 0], ["CAR", "car", 1], ["RUSH", "rush_yds", 1], ["REC", "rec", 1], ["TD", "td_tot", 0]],
    "WR": [["GP", "gp", 0], ["TGT", "tgt", 1], ["REC", "rec", 1], ["REC YDS", "rec_yds", 1], ["TD", "td_tot", 0]],
    "DL": [["GP", "gp", 0], ["TKL", "tkl", 1], ["SACK", "sk", 2], ["TFL", "tfl", 2], ["QB HIT", "qbh", 2]],
    "LB": [["GP", "gp", 0], ["TKL", "tkl", 1], ["SACK", "sk", 2], ["TFL", "tfl", 2], ["PD", "pd", 2]],
    "DB": [["GP", "gp", 0], ["TKL", "tkl", 1], ["INT", "int_d", 2], ["PD", "pd", 2], ["TFL", "tfl", 2]],
}
POS_COLS["TE"] = POS_COLS["WR"]
CONFIG = {
    "rating_unit": "points",
    "rank_low": ["oppg", "oypg", "give"], "rank_skip": [],        # league ranks: lower is better / no better direction
    # the team page: Offense and Defense tabs, a section per position group with its own columns
    "roster_units": [["Offense", OFFENSE], ["Defense", DEFENSE]],
    "group_names": {"QB": "Quarterbacks", "RB": "Running backs", "WR": "Wide receivers", "TE": "Tight ends",
                    "DL": "Defensive line", "LB": "Linebackers", "DB": "Secondary"},
    "group_cols": POS_COLS,
    # a defensive player's own page
    "player_cols_def": [["GP", "gp", 0], ["TKL", "tkl", 1], ["SACK", "sk", 2], ["TFL", "tfl", 2], ["QB HIT", "qbh", 2],
                        ["INT", "int_d", 2], ["PD", "pd", 2], ["FF", "ff", 2]],
    "player_note_def": "Per game, regular season (TKL: solo tackles plus assists).",
    "log_show_def": [["TKL", "tkl"], ["SACK", "sk"], ["TFL", "tfl"], ["INT", "int_d"], ["PD", "pd"]],
    "hit_stats_def": [["tackles", "Tackles + assists", ["tkl"]], ["sacks", "Sacks", ["sk"]],
                      ["def_interceptions", "Interceptions", ["int_d"]], ["passes_defended", "Passes defended", ["pd"]]],
    "search_cols": ["PASS", "RUSH", "REC YDS"],
    "team_rows": [["Record", "record"], ["Points per game", "ppg", 1], ["Allowed per game", "oppg", 1],
                  ["Average margin", "margin", 1, True], ["Yards per game", "ypg", 1], ["Passing yards per game", "pypg", 1],
                  ["Rushing yards per game", "rypg", 1], ["Yards allowed per game", "oypg", 1], ["Giveaways per game", "give", 2],
                  ["Takeaways per game", "take", 2], ["Sacks per game", "sacks", 2], ["Home", "home"], ["Away", "away"],
                  ["Last 5", "last5"]],
    "roster_cols": [["GP", "gp", 0], ["PASS", "pass_yds", 1], ["RUSH", "rush_yds", 1], ["REC YDS", "rec_yds", 1], ["TD", "td_tot", 0]],
    "player_cols": [["GP", "gp", 0], ["CMP", "cmp", 1], ["ATT", "att", 1], ["PASS YDS", "pass_yds", 1], ["PASS TD", "pass_td", 2],
                    ["INT", "int", 2], ["CAR", "car", 1], ["RUSH YDS", "rush_yds", 1], ["TGT", "tgt", 1], ["REC", "rec", 1],
                    ["REC YDS", "rec_yds", 1], ["TD", "td_tot", 0]],
    "player_note": "Per game, regular season (TD: total rushing and receiving touchdowns).",
    "log_show": [["PASS", "pass_yds"], ["CAR", "car"], ["RUSH", "rush_yds"], ["REC", "rec"], ["REC YDS", "rec_yds"]],
    "hit_stats": [["passing_yards", "Passing yards", ["pass_yds"]], ["passing_tds", "Passing TDs", ["pass_td"]],
                  ["passing_completions", "Completions", ["cmp"]], ["passing_attempts", "Pass attempts", ["att"]],
                  ["interceptions", "Interceptions thrown", ["int"]], ["rushing_yards", "Rushing yards", ["rush_yds"]],
                  ["rushing_attempts", "Rush attempts", ["car"]], ["receptions", "Receptions", ["rec"]],
                  ["receiving_yards", "Receiving yards", ["rec_yds"]], ["rush_rec_yards", "Rush + rec yards", ["rush_yds", "rec_yds"]],
                  ["touchdowns", "Rush + rec TDs", ["rush_td", "rec_td"]]],
}


def season_of(now):
    """nflverse names a season by the year it starts (the 2026 season ends in February 2027)."""
    return now.year if now.month >= 8 else now.year - 1


def fetch(kind, cache, y=None):
    path = os.path.join(cache, f"nfl_{kind}_{y}.csv" if y else f"nfl_{kind}.csv")
    if not os.path.exists(path):
        try:
            urllib.request.urlretrieve(URLS[kind].format(y=y), path)
        except Exception as e:                  # a season not published yet: no file
            print(f"{kind} {y}: {type(e).__name__}: {e}")
            return None
    return path


def results(sched, y):
    """Finished games of season y: one row per team and game, oldest first."""
    g = sched[(sched.season == y) & sched.game_type.isin(TYPES) & sched.home_score.notna() & sched.away_score.notna()]
    rows = []
    for r in g.itertuples():
        for t, o, ha, f, a in ((r.home_team, r.away_team, "H", r.home_score, r.away_score),
                               (r.away_team, r.home_team, "A", r.away_score, r.home_score)):
            rows.append({"game_id": r.game_id, "date": r.gameday, "type": TYPES[r.game_type], "team": t, "opp": o, "ha": ha,
                         "f": int(f), "a": int(a), "ot": "OT" if r.overtime == 1 else "", "season": y + 1})
    return pd.DataFrame(rows).sort_values(["date", "game_id"]) if rows else pd.DataFrame()


def wlt(x):
    w, l = int((x.f > x.a).sum()), int((x.f < x.a).sum())
    t = int((x.f == x.a).sum())
    return f"{w}-{l}" + (f"-{t}" if t else "")


def team_season(res, tw):
    out = {}
    if not len(res):
        return out
    yards = {}
    if len(tw):
        for r in tw.itertuples():
            yards[(r.game_id, r.team)] = r
    for team, x in res.groupby("team"):
        reg = x[x.type == "R"]
        n = len(reg)
        res_l = ["W" if f > a else "L" if f < a else "T" for f, a in zip(reg.f, reg.a)]
        w, l, t = res_l.count("W"), res_l.count("L"), res_l.count("T")
        last5 = res_l[-5:]
        streak = ""
        if res_l:
            k = 0
            for v in reversed(res_l):
                if v != res_l[-1]:
                    break
                k += 1
            streak = f"{res_l[-1]}{k}"
        own = [yards.get((gid, team)) for gid in reg.game_id]
        opp = [yards.get((gid, o)) for gid, o in zip(reg.game_id, reg.opp)]

        def avg(rows, fn):
            v = [fn(r) for r in rows if r is not None]
            return S.r1(sum(v) / len(v), 2) if v else None
        out[team] = {
            "gp": n, "w": w, "l": l, "t": t, "record": f"{w}-{l}" + (f"-{t}" if t else ""),
            "last5": f"{last5.count('W')}-{last5.count('L')}" + (f"-{last5.count('T')}" if "T" in last5 else ""),
            "streak": streak, "home": wlt(reg[reg.ha == "H"]), "away": wlt(reg[reg.ha == "A"]),
            "ppg": S.r1(reg.f.mean()) if n else None, "oppg": S.r1(reg.a.mean()) if n else None,
            "margin": S.r1((reg.f - reg.a).mean()) if n else None,
            "ypg": avg(own, lambda r: r.passing_yards + r.rushing_yards), "pypg": avg(own, lambda r: r.passing_yards),
            "rypg": avg(own, lambda r: r.rushing_yards), "oypg": avg(opp, lambda r: r.passing_yards + r.rushing_yards),
            "give": avg(own, lambda r: r.passing_interceptions + r.sack_fumbles_lost + r.rushing_fumbles_lost + r.receiving_fumbles_lost),
            "take": avg(opp, lambda r: r.passing_interceptions + r.sack_fumbles_lost + r.rushing_fumbles_lost + r.receiving_fumbles_lost),
            "sacks": avg(own, lambda r: r.def_sacks),
            "games": [[str(r.date), r.opp, r.ha, r.f, r.a, "W" if r.f > r.a else "L" if r.f < r.a else "T", r.type, r.season, r.ot]
                      for r in x.itertuples()][::-1]}
    return out


def player_season(x, defense=False):
    reg = x[x.season_type == "REG"]
    n = len(reg)
    if not n:
        return None
    if defense:
        return {"gp": n, **{s: S.r1(reg[s].mean(), 1 if s == "tkl" else 2) for s in DLOG}}
    out = {"gp": n, "td_tot": int(reg.rush_td.sum() + reg.rec_td.sum())}
    for s in LOG:
        out[s] = S.r1(reg[s].mean(), 2 if s in ("pass_td", "int", "rush_td", "rec_td") else 1)
    return out


def num(v):
    """A game-log value: whole numbers as ints (half sacks stay 0.5)."""
    v = float(v)
    return int(v) if v == int(v) else v


def load_players(cache, y, sched):
    path = fetch("player", cache, y)
    if not path:
        return pd.DataFrame()
    p = pd.read_csv(path, low_memory=False)
    p = p[p.position_group.isin(GROUPS) & p.team.isin(TEAMS)].rename(columns=COLS).rename(columns=DCOLS).copy()
    for c in ("def_tackles_solo", "def_tackle_assists"):
        if c not in p:
            p[c] = 0
    p["tkl"] = p.def_tackles_solo.fillna(0) + p.def_tackle_assists.fillna(0)
    for c in LOG + DLOG:
        p[c] = p[c].fillna(0) if c in p else 0
    meta = sched.set_index("game_id")[["gameday", "home_team", "game_type"]]
    p = p.join(meta, on="game_id")
    p = p[p.gameday.notna()]
    p["season"] = y + 1                         # by the year it ends, like the NBA and NHL files (the app's season_year)
    return p


def jerseys(cache, years):
    """{gsis id: (jersey number or None, ESPN id or None)} from nflverse's rosters, the latest season and week winning.
    The app draws the number on a jersey, and an ESPN id lets signed-in accounts see the player's photo."""
    out = {}
    for y in years:                             # oldest first, so the latest season overwrites
        path = fetch("roster", cache, y)
        if not path:
            continue
        r = pd.read_csv(path, low_memory=False)
        if "week" in r:
            r = r.sort_values("week")
        for x in r.itertuples():
            if isinstance(x.gsis_id, str):
                n, e = (pd.to_numeric(getattr(x, c, None), errors="coerce") for c in ("jersey_number", "espn_id"))
                out[x.gsis_id] = (int(n) if n == n and n is not None else None, int(e) if e == e and e is not None else None)
    return out


def build(now, cache):
    y = season_of(now)
    sched = pd.read_csv(fetch("games", cache), low_memory=False)
    res = {s: results(sched, s) for s in (y, y - 1)}
    tw = {}
    for s in (y, y - 1):
        path = fetch("team", cache, s)
        tw[s] = pd.read_csv(path, low_memory=False) if path else pd.DataFrame()
    ts = {s: team_season(res[s], tw[s]) for s in (y, y - 1)}
    ratings, gp = {}, {}
    for s in (y, y - 1):
        r = res[s]
        h = r[(r.type == "R") & (r.ha == "H")] if len(r) else r
        ratings[s], _ = S.srs([(x.team, x.opp, x.f - x.a) for x in h.itertuples()] if len(h) else [], sorted(TEAMS))
    if len(res[y]):
        gp = res[y][res[y].type == "R"].groupby("team").size().to_dict()
    rating = {k: S.blend(ratings[y].get(k, 0.0), ratings[y - 1].get(k, 0.0), gp.get(k, 0), PRIOR) for k in TEAMS}
    order = sorted(TEAMS, key=lambda k: -rating[k])
    rank = {k: i + 1 for i, k in enumerate(order)}

    frames = [d for d in (load_players(cache, y - 1, sched), load_players(cache, y, sched)) if len(d)]
    players = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
    roster, search = {k: [] for k in TEAMS}, []
    shirts = jerseys(cache, (y - 1, y))
    if len(players):
        players = players.sort_values(["gameday", "game_id"])
        for pid, x in players.groupby("player_id"):
            latest = x.iloc[-1]
            grp, d = latest.position_group, latest.position_group in DEFENSE
            this, last = player_season(x[x.season == y + 1], d), player_season(x[x.season == y], d)
            log = [[str(r.gameday), r.opponent_team, "H" if r.home_team == r.team else "A"] + [num(getattr(r, c)) for c in LOG + DLOG]
                   + [TYPES.get(r.game_type, "R"), int(r.season)] for r in x.itertuples()][::-1]
            pl = {"id": str(pid), "name": latest.player_display_name, "pos": latest.position if isinstance(latest.position, str) else "",
                  "grp": grp, "this": this, "last": last, "log": log}
            n, espn = shirts.get(str(pid), (None, None))
            if n is not None:
                pl["num"] = n
            if espn is not None:
                pl["espn"] = espn
            if this or gp.get(latest.team, 0) < PRIOR:
                roster[latest.team].append(pl)
            cur = this or last or {}
            search.append([str(pid), pl["name"], latest.team, pl["pos"], cur.get("gp"), cur.get("pass_yds"), cur.get("rush_yds"),
                           cur.get("rec_yds"), y + 1 if this else y])
    stamp = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    label = str                                                        # NFL seasons go by their first year: "2026"
    teams = []
    for k in order:
        s = ts[y].get(k) or {}
        teams.append({"code": k, "name": NAMES[k], "rank": rank[k], "rating": S.r1(rating[k]),
                      "rating_this": S.r1(ratings[y].get(k)) if gp.get(k) else None, "rating_last": S.r1(ratings[y - 1].get(k)),
                      "last10": s.get("last5"), **{f: s.get(f) for f in ("gp", "w", "l", "t", "record", "streak", "ppg", "oppg", "margin")}})
    order_grp = {g: i for i, g in enumerate(OFFENSE + DEFENSE)}

    def depth(pl):                                  # within a position: who plays most (defense: who makes most tackles)
        s = pl["this"] or pl["last"] or {}
        return -(s.get("tkl") or 0) if pl["grp"] in DEFENSE else -(s.get("gp") or 0)
    ranks = S.league_ranks(ts[y], CONFIG["team_rows"], CONFIG["rank_low"], CONFIG["rank_skip"])
    for k in TEAMS:
        roster[k].sort(key=lambda pl: (order_grp.get(pl["grp"], 9), depth(pl)))
        this, last = ts[y].get(k), ts[y - 1].get(k)
        S.write(os.path.join(OUT, f"team_{k}.json"), {
            "generated_at": stamp, "code": k, "name": NAMES[k], "rank": rank[k], "rating": S.r1(rating[k]),
            "season": label(y), "last_season": label(y - 1), "season_year": y + 1,
            "this": {f: v for f, v in (this or {}).items() if f != "games"} or None, "ranks": ranks.get(k) or None,
            "last": {f: v for f, v in (last or {}).items() if f != "games"} or None,
            "games": (this or {}).get("games", []) + (last or {}).get("games", []),
            "players": roster[k]})
    search.sort(key=lambda r: -max(r[5] or 0, r[6] or 0, r[7] or 0))
    S.write(os.path.join(OUT, "index.json"), {
        "generated_at": stamp, "sport": "NFL", "season": label(y), "last_season": label(y - 1), "season_year": y + 1,
        "rank_last": "Last 5",
        "rating_note": (f"Points per game better than an average team, adjusted for who each team played (SRS). Early in "
                        f"the season last season's rating counts as {PRIOR} games, pulled {round((1 - S.CARRY) * 100)}% "
                        f"toward average."),
        "source": "nflverse weekly stats and schedule. Regular season and playoffs.",
        "log_cols": ["date", "opp", "ha"] + LOG + DLOG + ["type", "season"], **CONFIG,
        "teams": teams, "players": search})
    return len(search)


def main():
    cache = os.getenv("STATS_CACHE") or tempfile.mkdtemp()
    n = build(datetime.now(timezone.utc), cache)
    print(f"NFL research files: {n} players")
    return 0


if __name__ == "__main__":
    sys.exit(main())
