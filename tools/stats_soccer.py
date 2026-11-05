#!/usr/bin/env python3
"""
stats_soccer.py -- each soccer player's latest matches (goals, assists) for the app's Streaks section, so Kalshi's
goalscorer / assist markets on a match can show which players reached that line in each of their last 10 matches.

Source: ESPN's public match summaries (the box score's per-player stats) for every finished match in the leagues the
soccer board covers (tools/soccer_lines.py LEAGUES), from START on. A player's matches from every league and European
cup are combined, keyed by ESPN's player id. Only matches the player got on the pitch in are kept (ESPN "appearances"
1: started or came on), newest first, at most KEEP of them per player.

Writes stats/soccer/index.json (columns, stats, matches read) and stats/soccer/team_<ESPN team id>.json (each club's
players, by the club they last played for), the shape the other sports' stats files have. Display only: this is app data, separate from the Research Lab (Part F's lab data is
research/soccer/data/, seasons 2013-2025, never committed, and the lab never reads this file). Nothing here feeds a
model, a pick or a test. Incremental: matches already read are listed in index.json ("done"), so a daily run only reads
the newest summaries; the first run (no index) reads every month from START. Run from the repo root:
    python3 tools/stats_soccer.py
"""
import glob
import json
import os
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from soccer_lines import ESPN_SITE, LEAGUES  # noqa: E402

ROOT = os.path.dirname(HERE)
DIR = os.path.join(ROOT, "stats", "soccer")
START = (2025, 7)          # a full season back, so every regular has 10+ matches before this season's first
RECENT_MONTHS = 2          # after the first run, only this month and the one before are scanned
KEEP = 12
THREADS = 6
LOG_COLS = ["date", "g", "a", "league"]
HIT_STATS = [["goal", "Goals", ["g"]], ["ast", "Assists", ["a"]], ["soa", "Goal or assist", ["g", "a"]]]


def get(url, tries=3):
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "devig-stats/1"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except Exception:
            if k == tries - 1:
                raise
            time.sleep(2 * (k + 1))


def months(now, full):
    y, m = START if full else (now.year, now.month)
    if not full:
        for _ in range(RECENT_MONTHS - 1):
            y, m = (y, m - 1) if m > 1 else (y - 1, 12)
        y, m = max((y, m), START)
    out = []
    while (y, m) <= (now.year, now.month):
        out.append(f"{y}{m:02d}")
        y, m = (y, m + 1) if m < 12 else (y + 1, 1)
    return out


def finished(code, slug, month):
    d = get(f"{ESPN_SITE}{slug}/scoreboard?dates={month}&limit=500")
    return [(code, slug, str(e["id"]), e["date"][:10]) for e in d.get("events") or []
            if ((e.get("status") or {}).get("type") or {}).get("state") == "post"]


def appearances(code, slug, eid, date):
    """[(player id, name, team id, team abbreviation, goals, assists)] for everyone who got on the pitch."""
    d = get(f"{ESPN_SITE}{slug}/summary?event={eid}")
    out = []
    for t in d.get("rosters") or []:
        team = t.get("team") or {}
        for p in t.get("roster") or []:
            s = {x.get("name"): x.get("value") for x in p.get("stats") or []}
            a = p.get("athlete") or {}
            if not s.get("appearances") or not a.get("id"):
                continue
            out.append((str(a["id"]), a.get("displayName") or "", str(team.get("id") or ""),
                        team.get("abbreviation") or "", int(s.get("totalGoals") or 0), int(s.get("goalAssists") or 0)))
    return out


def merge(state, match, rows):
    code, _, eid, date = match
    for pid, name, tid, abbr, g, a in rows:
        p = state["players"].setdefault(pid, {"id": pid, "name": name, "team_id": tid, "team": abbr, "log": []})
        if all(date >= r[0] for r in p["log"]):
            p.update(name=name, team_id=tid, team=abbr)          # the club the player last played for
        p["log"].append([date, g, a, code])
    state["done"].append(eid)


def trim(state):
    for p in state["players"].values():
        p["log"] = sorted(p["log"], key=lambda r: r[0], reverse=True)[:KEEP]


def main():
    now = datetime.now(timezone.utc)
    state = {"done": [], "players": {}}
    idx = os.path.join(DIR, "index.json")
    if os.path.exists(idx):
        with open(idx) as f:
            state["done"] = json.load(f).get("done") or []
        for fn in glob.glob(os.path.join(DIR, "team_*.json")):
            with open(fn) as f:
                for p in json.load(f).get("players") or []:
                    state["players"][p["id"]] = p
    full = not state["done"]
    done = set(state["done"])
    todo, errors = [], []
    for code, (_, slug, _) in LEAGUES.items():
        for m in months(now, full):
            try:
                todo += [x for x in finished(code, slug, m) if x[2] not in done]
            except Exception as e:  # noqa: BLE001 -- one league's month failing is reported, not fatal
                errors.append(f"{code} {m}: {e}")
    todo = list({x[2]: x for x in todo}.values())          # a match listed twice (two months' pages) is read once
    print(f"{'full' if full else 'recent'} run: {len(todo)} new matches")

    def one(x):
        try:
            return x, appearances(*x), None
        except Exception as e:  # noqa: BLE001
            return x, None, f"{x[0]} {x[2]}: {e}"

    with ThreadPoolExecutor(THREADS) as ex:
        for x, rows, err in ex.map(one, sorted(todo, key=lambda x: x[3])):
            if err:
                errors.append(err)               # not marked done: the next run tries it again
            elif rows:
                merge(state, x, rows)
    trim(state)
    write(state, now, errors)


def write(state, now, errors):
    os.makedirs(DIR, exist_ok=True)
    teams = {}
    for p in state["players"].values():
        if p.get("team_id"):
            teams.setdefault(p["team_id"], []).append(p)
    for fn in glob.glob(os.path.join(DIR, "team_*.json")):
        os.remove(fn)                                          # a club nobody plays for any more is dropped
    for tid, ps in teams.items():
        with open(os.path.join(DIR, f"team_{tid}.json"), "w") as f:
            json.dump({"id": tid, "players": sorted(ps, key=lambda p: p["name"])}, f, separators=(",", ":"))
            f.write("\n")
    idx = {"generated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "sport": "SOCCER", "source": "ESPN match summaries",
           "note": "Each player's latest matches they got on the pitch in (every league and cup on the soccer board), "
                   "newest first, in the file of the club they last played for. Display only.",
           "log_cols": LOG_COLS, "hit_stats": HIT_STATS, "keep": KEEP, "teams": len(teams),
           "players": len(state["players"]), "errors": errors[:50], "done": sorted(set(state["done"]))}
    with open(os.path.join(DIR, "index.json"), "w") as f:
        json.dump(idx, f, separators=(",", ":"))
        f.write("\n")
    print(f"{idx['players']} players in {len(teams)} clubs, {len(idx['done'])} matches, {len(errors)} errors")


if __name__ == "__main__":
    main()
