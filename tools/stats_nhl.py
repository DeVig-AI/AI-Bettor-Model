#!/usr/bin/env python3
"""
stats_nhl.py -- the Research section's NHL files: DeVig's power rankings, team stats and every skater's averages and
game log, this season and last. Skater lines come from the NHL box scores the props model already collects
(nhl/data/player_games_<start year>.csv.gz); final scores (with overtime and shootouts) from the NHL's public API team
schedules. Display only: nothing here feeds a model, a pick or a test.

Output (stats/nhl/): index.json and team_<CODE>.json, the same layout as stats/nba/ (tools/stats_nba.py). Team codes
are the app's (Kalshi / ESPN style: LA, NJ, SJ, TB). Goalies are not in the box score files, so rosters are skaters.
Run twice a day by .github/workflows/stats.yml.
"""
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timezone

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import stats_common as S  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "nhl", "data")
LINES = os.path.join(HERE, "..", "live", "game_lines.json")
OUT = os.path.join(HERE, "..", "stats", "nhl")
API = "https://api-web.nhle.com/v1"
UA = "devig-research/1.0 (read-only)"
TYPES = {2: "R", 3: "P"}
CODES = {"LAK": "LA", "NJD": "NJ", "SJS": "SJ", "TBL": "TB"}            # NHL API -> the app's codes
NAMES = {"ANA": "Anaheim Ducks", "BOS": "Boston Bruins", "BUF": "Buffalo Sabres", "CAR": "Carolina Hurricanes",
         "CBJ": "Columbus Blue Jackets", "CGY": "Calgary Flames", "CHI": "Chicago Blackhawks", "COL": "Colorado Avalanche",
         "DAL": "Dallas Stars", "DET": "Detroit Red Wings", "EDM": "Edmonton Oilers", "FLA": "Florida Panthers",
         "LA": "Los Angeles Kings", "MIN": "Minnesota Wild", "MTL": "Montreal Canadiens", "NJ": "New Jersey Devils",
         "NSH": "Nashville Predators", "NYI": "New York Islanders", "NYR": "New York Rangers", "OTT": "Ottawa Senators",
         "PHI": "Philadelphia Flyers", "PIT": "Pittsburgh Penguins", "SEA": "Seattle Kraken", "SJ": "San Jose Sharks",
         "STL": "St. Louis Blues", "TB": "Tampa Bay Lightning", "TOR": "Toronto Maple Leafs", "UTA": "Utah Mammoth",
         "VAN": "Vancouver Canucks", "VGK": "Vegas Golden Knights", "WPG": "Winnipeg Jets", "WSH": "Washington Capitals"}
API_CODE = {v: k for k, v in CODES.items()}                        # the app's -> NHL API codes
TEAMS = set(NAMES)
STATS = ["toi", "g", "a", "p", "sog", "ppg"]
CONFIG = {
    "rating_unit": "goals",
    "search_cols": ["G", "A", "P"],
    "rank_low": ["ga", "sa"], "rank_skip": [],                    # league ranks: lower is better / no better direction
    "team_rows": [["Record (W–L–OT)", "record"], ["Standings points", "pts", 0], ["Goals per game", "gf", 2],
                  ["Allowed per game", "ga", 2], ["Average margin", "margin", 2, True], ["Shots per game", "sf", 1],
                  ["Shots allowed per game", "sa", 1], ["Shooting %", "sh_pct", 1], ["Power-play goals per game", "ppg", 2],
                  ["Home", "home"], ["Away", "away"], ["Last 10", "last10"]],
    "roster_cols": [["GP", "gp", 0], ["G", "g_tot", 0], ["A", "a_tot", 0], ["P", "p_tot", 0], ["TOI", "toi", 1]],
    "player_cols": [["GP", "gp", 0], ["G", "g_tot", 0], ["A", "a_tot", 0], ["P", "p_tot", 0], ["P/GP", "p", 2],
                    ["SOG/GP", "sog", 1], ["PPG", "ppg_tot", 0], ["TOI", "toi", 1]],
    "player_note": "Regular season: totals, per game (P/GP, SOG/GP) and average minutes on ice (TOI).",
    "log_show": [["TOI", "toi"], ["G", "g"], ["A", "a"], ["P", "p"], ["SOG", "sog"]],
    "hit_stats": [["goals", "Goals", ["g"]], ["assists", "Assists", ["a"]], ["points", "Points", ["p"]], ["shots", "Shots on goal", ["sog"]]],
}


def code(a):
    return CODES.get(a, a)


def start_of(now):
    """The NHL files name a season by the year it starts: 2026 = 2026-27 (it starts in late September)."""
    return now.year if now.month >= 9 else now.year - 1


def label(start):
    return f"{start}-{str(start + 1)[2:]}"


def get(path, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(API + path, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:
            if i == tries - 1:
                print(f"{path}: {type(e).__name__}: {e}")
                return None
            time.sleep(1 + i)


def results(start):
    """{game_id: {date, type, home, away, hs, as, last}} for finished regular-season and playoff games, from each team's
    season schedule (scores include the shootout goal; last = REG / OT / SO)."""
    out = {}
    for team in sorted(TEAMS):
        d = get(f"/club-schedule-season/{API_CODE.get(team, team)}/{start}{start + 1}") or {}
        for g in d.get("games") or []:
            if g.get("gameType") not in TYPES or g.get("gameState") not in ("OFF", "FINAL"):
                continue
            h, a = g.get("homeTeam") or {}, g.get("awayTeam") or {}
            if h.get("score") is None or a.get("score") is None:
                continue
            out[int(g["id"])] = {"date": g.get("gameDate"), "type": int(g["gameType"]), "home": code(h.get("abbrev")),
                                 "away": code(a.get("abbrev")), "hs": int(h["score"]), "as": int(a["score"]),
                                 "last": ((g.get("gameOutcome") or {}).get("lastPeriodType") or "REG")}
    return out


def sweaters():
    """{player id: sweater number} from each team's current NHL roster (empty when the API can't be read)."""
    out = {}
    for team in sorted(TEAMS):
        d = get(f"/roster/{API_CODE.get(team, team)}/current") or {}
        for grp in ("forwards", "defensemen", "goalies"):
            for p in d.get(grp) or []:
                if p.get("id") is not None and p.get("sweaterNumber") is not None:
                    out[int(p["id"])] = int(p["sweaterNumber"])
    return out


def skaters(start):
    path = os.path.join(DATA, f"player_games_{start}.csv.gz")
    if not os.path.exists(path):
        return pd.DataFrame()
    d = pd.read_csv(path)
    d = d[d.game_type.isin(TYPES)].copy()
    d["team"], d["opp"] = d.team.map(code), d.opp.map(code)
    d = d[d.team.isin(TEAMS) & d.opp.isin(TEAMS)]
    d = d.rename(columns={"goals": "g", "assists": "a", "points": "p", "pp_goals": "ppg"})
    d["toi"] = d.toi_s / 60.0
    d["season"] = start + 1                                     # the year the season ends, as for the NBA files
    full = (d.first_name.fillna("") + " " + d.last_name.fillna("")).str.strip()
    d["full"] = full.where(full != "", d.name)
    return d


def team_season(games, sk):
    """{team: summary} from one season's finished games (and its skater lines for shots and power-play goals)."""
    rows = {}
    for gid, g in sorted(games.items(), key=lambda kv: (kv[1]["date"], kv[0])):
        for t, o, ha, f, a in ((g["home"], g["away"], "H", g["hs"], g["as"]), (g["away"], g["home"], "A", g["as"], g["hs"])):
            rows.setdefault(t, []).append((gid, g, o, ha, f, a))
    shots = sk.groupby(["game_id", "team"]).agg(sog=("sog", "sum"), ppg=("ppg", "sum")).to_dict("index") if len(sk) else {}
    out = {}
    for t, gs in rows.items():
        reg = [x for x in gs if x[1]["type"] == 2]
        res = ["W" if f > a else "L" for _, _, _, _, f, a in reg]
        w, l_all, l10, streak = S.record(res)
        otl = sum(1 for _, g, _, _, f, a in reg if f < a and g["last"] in ("OT", "SO"))
        n = len(reg)
        sf = [shots.get((gid, t), {}).get("sog") for gid, *_ in reg]
        sa = [shots.get((gid, o), {}).get("sog") for gid, _, o, *_ in reg]
        pp = [shots.get((gid, t), {}).get("ppg") for gid, *_ in reg]
        gf, ga = sum(f for *_, f, a in reg), sum(a for *_, f, a in reg)

        def rec(side):
            x = [(f, a, g) for _, g, _, ha, f, a in reg if ha == side]
            return f"{sum(f > a for f, a, _ in x)}-{sum(f < a and g['last'] == 'REG' for f, a, g in x)}-" \
                   f"{sum(f < a and g['last'] != 'REG' for f, a, g in x)}"
        sfv, sav = [x for x in sf if x is not None], [x for x in sa if x is not None]
        out[t] = {"gp": n, "w": w, "l": l_all - otl, "otl": otl, "record": f"{w}-{l_all - otl}-{otl}", "pts": 2 * w + otl,
                  "last10": l10, "streak": streak, "home": rec("H"), "away": rec("A"),
                  "gf": S.r1(gf / n, 2) if n else None, "ga": S.r1(ga / n, 2) if n else None,
                  "margin": S.r1((gf - ga) / n, 2) if n else None,
                  "sf": S.r1(sum(sfv) / len(sfv)) if sfv else None, "sa": S.r1(sum(sav) / len(sav)) if sav else None,
                  "sh_pct": S.r1(100 * gf / sum(sfv)) if sfv and sum(sfv) else None,
                  "ppg": S.r1(sum(x for x in pp if x is not None) / n, 2) if n else None,
                  "games": [[g["date"], o, ha, f, a, "W" if f > a else "L", TYPES[g["type"]], g["season"],
                             "" if g["last"] == "REG" else g["last"]] for gid, g, o, ha, f, a in gs][::-1]}
    return out


def player_season(x):
    reg = x[x.game_type == 2]
    n = len(reg)
    if not n:
        return None
    out = {"gp": n, "toi": S.r1(reg.toi.mean())}
    for s in ("g", "a", "p", "sog", "ppg"):
        out[s] = S.r1(reg[s].mean(), 2)
        out[s + "_tot"] = int(reg[s].sum())
    return out


def colors():
    """The app's NHL team colours (ESPN's), from the lines file when it has them."""
    try:
        with open(LINES) as f:
            d = json.load(f)
    except (OSError, ValueError):
        return {}
    out = {}
    for g in d.get("games") or []:
        if g.get("sport") == "NHL":
            for k in ("away", "home"):
                c = (g.get("colors") or {}).get(k)
                if c:
                    out[g[k]] = c
    return out


def build(now, fetch_results=results):
    st = start_of(now)
    res = {st: fetch_results(st), st - 1: fetch_results(st - 1)}
    if not res[st] and not res[st - 1]:                          # the API answered nothing: keep the files we have
        raise RuntimeError("no NHL scores from the API")
    for s, gs in res.items():
        for g in gs.values():
            g["season"] = s + 1
    sk = {s: skaters(s) for s in res}
    ts = {s: team_season(res[s], sk[s]) for s in res}
    ratings, gp_this = {}, {}
    for s, gs in res.items():
        games = [(g["home"], g["away"], g["hs"] - g["as"]) for g in gs.values() if g["type"] == 2]
        ratings[s], _ = S.srs(games, sorted(TEAMS))
    for g in res[st].values():
        if g["type"] == 2:
            for t in (g["home"], g["away"]):
                gp_this[t] = gp_this.get(t, 0) + 1
    rating = {k: S.blend(ratings[st].get(k, 0.0), ratings[st - 1].get(k, 0.0), gp_this.get(k, 0)) for k in TEAMS}
    order = sorted(TEAMS, key=lambda k: -rating[k])
    rank = {k: i + 1 for i, k in enumerate(order)}
    col = colors()

    players = pd.concat([d for d in sk.values() if len(d)], ignore_index=True) if any(len(d) for d in sk.values()) else pd.DataFrame()
    roster, search = {k: [] for k in TEAMS}, []
    shirts = sweaters() if len(players) else {}
    if len(players):
        players = players.sort_values(["game_date", "game_id"])
        for pid, x in players.groupby("player_id"):
            latest = x.iloc[-1]
            this, last = player_season(x[x.season == st + 1]), player_season(x[x.season == st])
            log = [[str(r.game_date)[:10], r.opp, "H" if r.home else "A", int(round(r.toi)), int(r.g), int(r.a), int(r.p),
                    int(r.sog), int(r.ppg), TYPES[int(r.game_type)], int(r.season)] for r in x.itertuples()][::-1]
            pl = {"id": int(pid), "name": latest.full, "pos": latest.position if isinstance(latest.position, str) else "",
                  "this": this, "last": last, "log": log}
            if int(pid) in shirts:
                pl["num"] = shirts[int(pid)]
            if this or gp_this.get(latest.team, 0) < S.PRIOR_GAMES:
                roster[latest.team].append(pl)
            cur = this or last or {}
            search.append([int(pid), pl["name"], latest.team, pl["pos"], cur.get("gp"), cur.get("g_tot"), cur.get("a_tot"),
                           cur.get("p_tot"), st + 1 if this else st])
    stamp = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    this_ts, last_ts = ts[st], ts[st - 1]
    teams = []
    for k in order:
        s = this_ts.get(k) or {}
        teams.append({"code": k, "name": NAMES[k], "color": col.get(k), "rank": rank[k], "rating": S.r1(rating[k], 2),
                      "rating_this": S.r1(ratings[st].get(k), 2) if gp_this.get(k) else None,
                      "rating_last": S.r1(ratings[st - 1].get(k), 2),
                      **{f: s.get(f) for f in ("gp", "w", "l", "otl", "record", "pts", "last10", "streak", "gf", "ga", "margin")}})
    ranks = S.league_ranks(this_ts, CONFIG["team_rows"], CONFIG["rank_low"], CONFIG["rank_skip"])
    for k in TEAMS:
        roster[k].sort(key=lambda pl: -((pl["this"] or {}).get("toi") or (pl["last"] or {}).get("toi") or 0))
        this, last = this_ts.get(k), last_ts.get(k)
        S.write(os.path.join(OUT, f"team_{k}.json"), {
            "generated_at": stamp, "code": k, "name": NAMES[k], "color": col.get(k), "rank": rank[k],
            "rating": S.r1(rating[k], 2), "season": label(st), "last_season": label(st - 1), "season_year": st + 1,
            "this": {f: v for f, v in (this or {}).items() if f != "games"} or None, "ranks": ranks.get(k) or None,
            "last": {f: v for f, v in (last or {}).items() if f != "games"} or None,
            "games": (this or {}).get("games", []) + (last or {}).get("games", []),
            "players": roster[k]})
    search.sort(key=lambda r: -(r[7] or 0))
    S.write(os.path.join(OUT, "index.json"), {
        "generated_at": stamp, "sport": "NHL", "season": label(st), "last_season": label(st - 1), "season_year": st + 1,
        "rating_note": (f"Goals per game better than an average team, adjusted for who each team played (SRS, shootout "
                        f"goal included). Early in the season last season's rating counts as {S.PRIOR_GAMES} games, "
                        f"pulled {round((1 - S.CARRY) * 100)}% toward average."),
        "source": "NHL box scores (skaters only; no goalies) and final scores from the NHL's public API. Unofficial; "
                  "regular season and playoffs only.",
        "log_cols": ["date", "opp", "ha"] + STATS + ["type", "season"], **CONFIG,
        "teams": teams, "players": search})
    return len(search), sum(len(v) for v in res.values())


def main():
    n, g = build(datetime.now(timezone.utc))
    print(f"NHL research files: {n} skaters, {g} finished games")
    return 0


if __name__ == "__main__":
    sys.exit(main())
