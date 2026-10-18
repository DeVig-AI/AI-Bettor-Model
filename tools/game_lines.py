#!/usr/bin/env python3
"""
game_lines.py -- every Kalshi spread line for both teams of every open NFL, NBA and MLB game, for the app's spread
wheel. Display only: nothing here feeds a model, a pick or a test.

Kalshi lists "TEAM wins by over X" markets. Buying YES is TEAM -X; buying NO is the other team +X. Both are written,
as fee-included American odds, so each team gets its whole ladder of lines.

Output: live/game_lines.json
  {generated_at, games: [{sport, date, away, home, event, spreads: {TEAM: [[point, odds], ...]}}]}
"""
import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
import kalshi_games_v1 as KG  # noqa: E402

OUT = os.path.join(os.path.dirname(__file__), "..", "live", "game_lines.json")
SPORTS = ("NFL", "NBA", "MLB")


def ladders(g):
    """{team code: [[point, odds], ...]} sorted from most points given to most points taken."""
    a, h = g["away_code"], g["home_code"]
    best = {}
    for q in g["spreads"]:
        t = q["team"]
        other = h if t == a else a
        for team, point, price in ((t, -q["line"], q["ask"]), (other, q["line"], None if q["bid"] is None else round(1 - q["bid"], 4))):
            odds = KG.american(price)
            if odds is None:
                continue
            k = (team, point)
            if k not in best or odds > best[k]:   # the same line from two markets: keep the better price
                best[k] = odds
    out = {}
    for (team, point), odds in best.items():
        out.setdefault(team, []).append([point, round(odds)])
    return {t: sorted(v) for t, v in out.items()}


def main():
    games = []
    for sport in SPORTS:
        try:
            kg = KG.kalshi_games(sport)
        except Exception as e:                    # one sport failing must not drop the others
            KG.log.append(f"{sport}: {type(e).__name__}: {e}")
            continue
        for g in kg.values():
            lad = ladders(g)
            if not lad:
                continue
            a, h = g["away_code"], g["home_code"]
            games.append({"sport": sport, "date": g["date"], "event": g.get("event"),
                          "away": KG.canon(sport, a), "home": KG.canon(sport, h),
                          "spreads": {KG.canon(sport, t): v for t, v in lad.items()}})
    games.sort(key=lambda x: (x["sport"], x["date"] or "", x["away"]))
    out = {"generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "games": games,
           "errors": KG.log[:20]}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"{len(games)} games, {sum(len(v) for g in games for v in g['spreads'].values())} lines")
    return 0


if __name__ == "__main__":
    sys.exit(main())
