#!/usr/bin/env python3
"""
nba_roster_changes_v1.py -- how each NBA roster changed since last season, for the app (nba/roster_changes.json).

Per team: the share of the minutes in its last 10 games of last season played by players still on the roster (those
10 games are what Model C's form numbers are built on), plus the main arrivals and departures against the roster it
ended last season with (12+ minutes a game last season, with points per game and where they went / came from).
Model C (nba/nba_live_tracker_lock.py, frozen) still judges a team's first 10 games partly on last season's games;
this file is how the app says so, next to each early-season pick. Display only: it changes no pick, lock or grade.
research/nba_roster/roster_backtest_v1.py tested feeding it into the model: no clear gain on 2022-23..2025-26.

Data: ESPN's public team rosters (keyless) and sportsdataverse's ESPN player box scores for last season.
Usage: python3 nba/nba_roster_changes_v1.py
"""
import json, os, sys, time, urllib.request
from datetime import datetime, timezone
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "roster_changes.json")
CACHE = os.path.join(HERE, ".cache")
BOX_URL = "https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_nba_player_boxscores/player_box_{y}.csv"
ESPN = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba"
UA = "nba-roster-changes/1.0 (personal research; read-only)"
STD = {"GS": "GSW", "NO": "NOP", "NY": "NYK", "SA": "SAS", "UTAH": "UTA", "WSH": "WAS"}
KEY_MPG, N_KEY, LAST_N = 12.0, 4, 10
TEAMS = {"ATL", "BOS", "BKN", "CHA", "CHI", "CLE", "DAL", "DEN", "DET", "GSW", "HOU", "IND", "LAC", "LAL", "MEM", "MIA",
         "MIL", "MIN", "NOP", "NYK", "OKC", "ORL", "PHI", "PHX", "POR", "SAC", "SAS", "TOR", "UTA", "WAS"}


def get_json(url, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30) as r:
                return json.load(r)
        except Exception as e:
            err = e
            time.sleep(2 * (i + 1))
    raise RuntimeError(f"{url}: {err}")


def last_season_box(season_end):
    """Last season's regular-season player games (season named by the year it ends)."""
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, f"player_box_{season_end}.csv")
    if not os.path.exists(p) or time.time() - os.path.getmtime(p) > 7 * 86400:
        req = urllib.request.Request(BOX_URL.format(y=season_end), headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=300) as r, open(p, "wb") as f:
            f.write(r.read())
    b = pd.read_csv(p, low_memory=False, usecols=["game_id", "game_date", "season_type", "athlete_id", "athlete_display_name",
                                                  "team_abbreviation", "minutes", "points", "did_not_play"])
    b = b[(b["season_type"] == 2) & (b["did_not_play"] != True)].copy()  # noqa: E712
    for c in ("minutes", "points"):
        b[c] = pd.to_numeric(b[c], errors="coerce").fillna(0)
    b = b[b["minutes"] > 0].dropna(subset=["athlete_id"])
    b["pid"] = b["athlete_id"].astype("int64").astype(str)
    b["team"] = b["team_abbreviation"].replace(STD)
    return b[b["team"].isin(TEAMS)]


def current_rosters():
    """{team code: {player id: name}} from ESPN's public team rosters."""
    teams = get_json(f"{ESPN}/teams")["sports"][0]["leagues"][0]["teams"]
    out = {}
    for t in teams:
        t = t["team"]
        r = get_json(f"{ESPN}/teams/{t['id']}/roster")
        code = STD.get(t["abbreviation"], t["abbreviation"])
        if code not in TEAMS:
            continue
        out[code] = {str(a["id"]): a.get("displayName") for a in r.get("athletes") or []}
        time.sleep(0.3)
    return out


def changes(box, rosters):
    """{team: {returning_min_pct, arrivals, departures}} from last season's box and today's rosters."""
    pt = box.groupby(["pid", "team"]).agg(min=("minutes", "sum"), pts=("points", "sum"), gp=("minutes", "size"),
                                          name=("athlete_display_name", "last")).reset_index()
    tot = pt.groupby("pid").agg(min=("min", "sum"), pts=("pts", "sum"), gp=("gp", "sum"), name=("name", "last"))
    main_team = pt.sort_values("min").groupby("pid")["team"].last()            # where he played most last season
    now_team = {pid: t for t, ps in rosters.items() for pid in ps}

    def who(pid, other):
        r = tot.loc[pid]
        return {"name": r["name"], "mpg": round(r["min"] / r["gp"], 1), "ppg": round(r["pts"] / r["gp"], 1), "team": other}

    out = {}
    for team, players in sorted(rosters.items()):
        tb = box[box["team"] == team].sort_values("game_date")
        games = list(dict.fromkeys(tb["game_id"]))
        end = tb[tb["game_id"].isin(games[-LAST_N:])]                       # how the team finished last season
        tm = end["minutes"].sum()
        stay = end[end["pid"].isin(players)]["minutes"].sum()
        ended = set(tb[tb["game_id"].isin(games[-25:])]["pid"])            # on the team at the end of last season
        gone = sorted((p for p in ended if p not in players), key=lambda p: -tot.loc[p, "min"])
        dep = [who(p, now_team.get(p)) for p in gone if tot.loc[p, "min"] / tot.loc[p, "gp"] >= KEY_MPG][:N_KEY]
        new = [p for p in players if p in tot.index and p not in ended]
        new.sort(key=lambda p: -tot.loc[p, "min"])
        arr = [who(p, main_team.get(p)) for p in new if tot.loc[p, "min"] / tot.loc[p, "gp"] >= KEY_MPG][:N_KEY]
        out[team] = {"returning_min_pct": round(100 * stay / tm, 1) if tm else None, "arrivals": arr, "departures": dep}
    return out


def main():
    now = datetime.now(timezone.utc)
    season_end = now.year + 1 if now.month >= 9 else now.year             # 2026-27 is named 2027
    box = last_season_box(season_end - 1)
    rosters = current_rosters()
    if len(rosters) < 28:
        sys.exit(f"only {len(rosters)} ESPN rosters; not writing")
    teams = changes(box, rosters)
    out = {"generated_at": now.isoformat(timespec="seconds").replace("+00:00", "Z"),
           "season": f"{season_end - 1}-{str(season_end)[2:]}", "last_season": f"{season_end - 2}-{str(season_end - 1)[2:]}",
           "note": "Share of the minutes in each team's last 10 games of last season played by players on today's "
                   "roster, and the main arrivals and departures (12+ minutes a game last season). ESPN rosters and "
                   "box scores; display only.",
           "teams": teams}
    try:
        if json.load(open(OUT)).get("teams") == teams:
            print("no roster changes since the last run"); return
    except Exception:
        pass
    with open(OUT, "w") as f:
        json.dump(out, f, indent=1, ensure_ascii=False)
    print(f"wrote {OUT}: {len(teams)} teams")


if __name__ == "__main__":
    main()
