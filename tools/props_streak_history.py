#!/usr/bin/env python3
"""
props_streak_history.py -- did past player-prop streaks hit more often than Kalshi's price said?

For every settled Kalshi prop rung the history bots saved ({nba,nhl}/props_history/kalshi/*.csv, nfl/props_history/kalshi_props_history_v1.csv: the price shortly
before the game and how it settled), look up the player's games before that day in the stats bot's logs
(stats/<sport>/team_*.json, this season and last) and count how many games in a row, from the latest back, the
player reached that line. A rung is "on a streak" when that run is at least MIN_RUN games (10). For each player,
stat and game only the hardest such rung counts (the one the app shows). Then: how often those rungs hit, against
Kalshi's middle price and the price to buy, with a 95% interval for the difference from resampling games (all of a game's lines together).

Writes stats/props_streaks.json for the app's Streaks section. Descriptive only, like props_ladder_history.py: it is
not a pre-registered test and the app never calls it an edge. Rerun daily by .github/workflows/props_ladder.yml.
Run from the repo root:  python3 tools/props_streak_history.py
"""
import collections
import csv
import glob
import json
import os
import random
import re
import unicodedata
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "stats", "props_streaks.json")
SPORTS = ["nba", "nhl", "nfl"]
MIN_RUN = 10
MAX_SPREAD = 0.06
PLAYED = {"nba": "min", "nhl": "toi"}       # a game only counts if the player was on the floor / ice (NFL logs: played only)
SEED, DRAWS = 7, 2000


def norm(name):
    n = unicodedata.normalize("NFKD", str(name)).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]", "", n)


def season_label(sport, y):
    """'2025-26'. The NBA history labels a season by the year it ends, the NHL one by the year it starts; NFL is '2026'."""
    y = int(y)
    if sport == "nfl":
        return str(y)
    start = y - 1 if sport == "nba" else y
    return f"{start}-{(start + 1) % 100:02d}"


def ok_price(b, a):
    return 0 < b <= a < 1 and a - b <= MAX_SPREAD


def load(path):
    with open(path) as f:
        return json.load(f)


def logs(sport):
    """{normalized name: [(date, row), ...] oldest first}, played games only; plus the column index and hit stats."""
    idx = load(os.path.join(ROOT, "stats", sport, "index.json"))
    L = {c: i for i, c in enumerate(idx["log_cols"])}
    hit = {k: cols for k, _, cols in idx.get("hit_stats") or []}
    out = collections.defaultdict(dict)
    for f in glob.glob(os.path.join(ROOT, "stats", sport, "team_*.json")):
        for p in load(f).get("players") or []:
            for g in p.get("log") or []:
                pc = PLAYED.get(sport)
                played = g[L[pc]] if pc in L else 1
                if played:
                    out[norm(p["name"])][g[L["date"]]] = g
    return {k: sorted(v.items()) for k, v in out.items()}, L, hit


def value(g, L, cols):
    v = 0
    for c in cols:
        x = g[L[c]]
        if x is None:
            return None
        v += x
    return v


def run_length(games, L, cols, need):
    n = 0
    for _, g in reversed(games):
        v = value(g, L, cols)
        if v is None or v < need:
            break
        n += 1
    return n


def history_files(sport):
    h = os.path.join(ROOT, sport, "props_history")
    return sorted(glob.glob(os.path.join(h, "kalshi", "*.csv"))) + sorted(glob.glob(os.path.join(h, "kalshi_props_history_v1.csv")))


def rungs(sport):
    lg, L, hit = logs(sport)
    best, seasons = {}, collections.Counter()
    for f in history_files(sport):
        with open(f, newline="") as fh:
            for r in csv.DictReader(fh):
                if r.get("result") not in ("yes", "no") or r.get("stat") not in hit:
                    continue
                try:
                    b, a, line = float(r["yes_bid"]), float(r["yes_ask"]), float(r["line"])
                except (TypeError, ValueError):
                    continue
                games = lg.get(norm(r["player"]))
                if not ok_price(b, a) or not games:
                    continue
                before = [x for x in games if x[0] < r["game_date"]]
                if len(before) < MIN_RUN or run_length(before[-MIN_RUN:], L, hit[r["stat"]], line + 0.5) < MIN_RUN:
                    continue
                key = (r["event_ticker"], norm(r["player"]), r["stat"])
                if key not in best or line > best[key]["line"]:
                    # Kalshi opens one event per stat, so the resampling unit is the game (date and teams)
                    game = "|".join([r["game_date"], r.get("away_team") or "", r.get("home_team") or ""]) \
                        if r.get("away_team") else r["event_ticker"]
                    best[key] = {"ev": game, "line": line, "mid": (a + b) / 2, "ask": a,
                                 "yes": r["result"] == "yes", "season": season_label(sport, r["season"])}
    for x in best.values():
        seasons[x["season"]] += 1
    return list(best.values()), sorted(seasons)


def summary(rows):
    if not rows:
        return None
    n = len(rows)
    by_game = collections.defaultdict(list)
    for r in rows:
        by_game[r["ev"]].append(r["yes"] - r["mid"])
    keys, rng, diffs = list(by_game), random.Random(SEED), []
    for _ in range(DRAWS):
        s = [d for k in rng.choices(keys, k=len(keys)) for d in by_game[k]]
        diffs.append(sum(s) / len(s))
    diffs.sort()
    hit = sum(r["yes"] for r in rows) / n
    mid = sum(r["mid"] for r in rows) / n
    return {"rungs": n, "games": len(keys), "hit": round(hit, 4), "kalshi": round(mid, 4),
            "cost": round(sum(r["ask"] for r in rows) / n, 4), "diff": round(hit - mid, 4),
            "diff_95": [round(diffs[int(0.025 * DRAWS)], 4), round(diffs[int(0.975 * DRAWS) - 1], 4)]}


def main():
    out = {"generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "min_run": MIN_RUN,
           "note": "Settled Kalshi prop lines a player had reached in each of the player's last 10+ games (the hardest such "
                   "line per player, stat and game), against Kalshi's middle price shortly before the game. "
                   "Descriptive, not a pre-registered test; nothing here is a pick.",
           "sports": {}}
    for sport in SPORTS:
        rows, seasons = rungs(sport)
        s = summary(rows)
        if s:
            s["seasons"] = seasons
            out["sports"][sport.upper()] = s
        print(sport, s)
    with open(OUT, "w") as f:
        json.dump(out, f, indent=1)
        f.write("\n")


if __name__ == "__main__":
    main()
