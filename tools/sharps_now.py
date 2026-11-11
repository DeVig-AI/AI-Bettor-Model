#!/usr/bin/env python3
"""
sharps_now.py -- the game page's "Where the sharps are" card: Polymarket's top 20 sports earners' moneyline money on
each upcoming game, written to live/sharps/now.json.

Same counting as the quiet test (tools/sharps_log.py, SHARPS_LIVE_V1_PREREG.md): buys minus sells per team, only trades
made before the start, and a trader counts for a team with at least $1,000 more on it than on the other team. This file
only feeds the app; the test's locked log (live/sharps/LOCKS.csv) is written by sharps_log.py alone. Not a DeVig pick,
not proven.

Each run (twice an hour, after sharps_log.py in game_lines.yml) recounts every game in live/poly_lines.json that hasn't
started. A game that has started keeps its last count from before the start for 12 hours, so the card can say where the
money was at the start. If the top 20 or any trader's history can't be read, the old file is kept as it is.

Usage: python3 tools/sharps_now.py
"""
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sharps_log as L  # noqa: E402

OUT = L.DIR / "now.json"
KEEP = timedelta(hours=12)   # how long a started game's card stays


def count(games, board, now):
    """{key: card} for the games that haven't started, or None when a trader's history can't be read."""
    cids = {}
    for g in games:
        ml = L.moneyline(g["slug"])
        if ml:
            cids[L.key(g)] = (g, ml[0])
    if not cids:
        return {}
    history = {}
    for t in board:
        rows = L.trades(t["wallet"], {c for _, c in cids.values()})
        if rows is None:
            return None
        history[t["wallet"]] = rows
    out = {}
    for k, (g, cid) in cids.items():
        r = L.tally(g, cid, board, history)
        traders = sorted(({"rank": x["rank"], "name": x["name"], "pnl": x["pnl"], "side": x["counted"],
                           "usd": round(abs(x["away"] - x["home"]))} for x in json.loads(r["traders"]) if x["counted"]),
                         key=lambda x: -x["usd"])
        mid = None
        if g.get("away_bid") is not None and g.get("away_ask") is not None:
            mid = round((g["away_bid"] + g["away_ask"]) / 2, 4)
        out[k] = {"sport": g["sport"], "date": g["date"], "away": g["away"], "home": g["home"], "kickoff": g["kickoff"],
                  "at": L.iso(now), "usd_away": round(r["usd_away"]), "usd_home": round(r["usd_home"]),
                  "n_away": r["n_away"], "n_home": r["n_home"], "side": r["sharp_side"], "poly_away": mid,
                  "traders": traders}
    return out


def build(old, poly, board, now):
    """The new file, or None to keep the old one."""
    upcoming = [g for g in poly.get("games") or []
                if g.get("listed_first") in ("away", "home") and (L.parse_t(g.get("kickoff")) or now) > now]
    fresh = count(upcoming, board, now)
    if fresh is None:
        return None
    games = {k: g for k, g in (old.get("games") or {}).items()
             if k not in fresh and (s := L.parse_t(g.get("kickoff"))) and s <= now < s + KEEP}
    games.update(fresh)
    return {"generated_at": L.iso(now), "board_at": L.iso(now), "top": len(board), "min_usd": L.MIN_USD,
            "games": dict(sorted(games.items()))}


def main():
    now = datetime.now(timezone.utc)
    board = L.leaderboard()
    if not board:
        print("board unreadable; now.json kept")
        return
    new = build(L.load(OUT, {}), L.load(L.POLY, {}), board, now)
    if new is None:
        print("a trader's history couldn't be read; now.json kept")
    else:
        L.DIR.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(new, separators=(",", ":")))
        print(f"now.json: {len(new['games'])} games, {sum(1 for g in new['games'].values() if g['side'])} with a side")
    for line in L.KG.log[-5:]:
        print("  " + line)


if __name__ == "__main__":
    main()
