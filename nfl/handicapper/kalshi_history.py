#!/usr/bin/env python3
"""
kalshi_history.py -- NFL Handicapper v1: how Kalshi's win price for every NFL game moved in the days before kickoff.
Read-only public market data: no key, no account, nothing bet.

For every settled Kalshi NFL moneyline event (series KXNFLGAME) matched to an nflverse game of the 2025 season on,
it keeps each team's yes bid and yes ask at four moments, from Kalshi's hourly candles:
  d6    = the last candle closing at least 6 days before kickoff (the early-week price),
  d3    = at least 3 days before,
  d1    = at least 1 day before (after the final injury report of a Sunday game),
  close = at least 40 minutes before kickoff (the closing price, as in kalshi_game_lines_history_v1.py).
A moment with no candle yet (the market opened later) is left blank. Kickoff is from the nflverse schedule.

Output (one row per team market per moment): nfl/handicapper/data/kalshi_moneyline_history.csv
Run from the repo root:  python3 nfl/handicapper/kalshi_history.py
"""
import csv
import json
import os
import sys
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import kalshi_props_history_v1 as H  # noqa: E402  (helpers only; its main() is not run)
sys.path.insert(0, os.path.dirname(os.path.dirname(HERE)))
import kalshi_games_v1 as KG  # noqa: E402

OUT = os.path.join(HERE, "data", "kalshi_moneyline_history.csv")
SUMMARY = os.path.join(HERE, "data", "kalshi_moneyline_history_summary.json")
FIRST_SEASON = 2025
SNAPS = {"d6": timedelta(days=6), "d3": timedelta(days=3), "d1": timedelta(days=1), "close": timedelta(minutes=40)}
COLS = ["game_id", "season", "week", "kickoff_utc", "event_ticker", "ticker", "team", "side", "snap", "snap_end_utc",
        "yes_bid", "yes_ask", "result"]


def schedule():
    """{(gameday, away, home): (game_id, season, week, kickoff)} for games from FIRST_SEASON on."""
    out = {}
    for (day, away, home), (kick, season) in H.load_schedule().items():
        if season >= FIRST_SEASON:
            out[(day, away, home)] = kick
    ids = {}
    for g in csv.DictReader(open(os.path.join(HERE, "data", "games.csv"))):
        ids[(g["gameday"], g["away_team"], g["home_team"])] = (g["game_id"], int(g["season"]), int(g["week"]))
    return {k: ids[k] + (v,) for k, v in out.items() if k in ids}


def match(event_ticker, title, games):
    """The (gameday, away, home) key of this event: teams from the title, else the ticker's team codes."""
    date = H.date_from_ticker(event_ticker)
    t = H.teams_from_title(title)
    if t:
        for a, h in (t, t[::-1]):
            if (date, a, h) in games:
                return (date, a, h)
    suffix = event_ticker.split("-", 1)[1][7:] if "-" in event_ticker else ""
    for (d, a, h) in games:
        if d != date:
            continue
        codes = lambda x: {x, *[k for k, v in KG.ALIASES["NFL"].items() if v == x]}
        if any(suffix in (ca + ch, ch + ca) for ca in codes(a) for ch in codes(h)):
            return (d, a, h)
    return None


def markets(event_ticker):
    for path in ("/markets", "/historical/markets"):
        d = H.get(H.KALSHI + path, {"event_ticker": event_ticker, "limit": 100})
        if d and d.get("markets"):
            return d["markets"]
    return []


def candles(ticker, start_ts, end_ts):
    for path in (f"/series/KXNFLGAME/markets/{ticker}/candlesticks", f"/historical/markets/{ticker}/candlesticks"):
        d = H.get(H.KALSHI + path, {"start_ts": start_ts, "end_ts": end_ts, "period_interval": 60})
        if d and d.get("candlesticks"):
            return d["candlesticks"]
    return []


def main():
    games = schedule()
    rows, stats, seen = [], {"events": 0, "matched": 0, "games": 0, "unmatched": []}, set()
    for ev, _ in H.settled_events("KXNFLGAME"):
        et = ev.get("event_ticker") or ""
        if et in seen or (H.date_from_ticker(et) or "") < f"{FIRST_SEASON}-08-01":
            continue
        seen.add(et)
        stats["events"] += 1
        key = match(et, ev.get("title"), games)
        if not key:
            stats["unmatched"].append(f"{et} {ev.get('title')!r}")     # mostly preseason games
            continue
        stats["matched"] += 1
        game_id, season, week, kick = games[key]
        ms = [m for m in markets(et) if m.get("ticker")]
        start = int((kick - timedelta(days=12)).timestamp())
        for m in ms:
            team = KG.canon("NFL", m["ticker"].rsplit("-", 1)[-1])
            side = "home" if team == key[2] else "away" if team == key[1] else ""
            cs = sorted(candles(m["ticker"], start, int(kick.timestamp())), key=lambda c: c["end_period_ts"])
            for snap, before in SNAPS.items():
                limit = int((kick - before).timestamp())
                best = [c for c in cs if c["end_period_ts"] <= limit]
                c = best[-1] if best else None
                rows.append([game_id, season, week, kick.strftime("%Y-%m-%dT%H:%M:%SZ"), et, m["ticker"], team, side,
                             snap,
                             datetime.fromtimestamp(c["end_period_ts"], timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                             if c else "",
                             H.ohlc_close(c, "yes_bid") if c else "", H.ohlc_close(c, "yes_ask") if c else "",
                             m.get("result")])
    stats["games"] = len({r[0] for r in rows})
    rows.sort(key=lambda r: (r[3], r[0], r[7], list(SNAPS).index(r[8])))
    with open(OUT, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(COLS)
        w.writerows(rows)
    stats["unmatched"] = stats["unmatched"][:60]
    json.dump({"generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "stats": stats,
               "errors": H.log[:50]}, open(SUMMARY, "w"), indent=1)
    print(json.dumps({k: v for k, v in stats.items() if k != "unmatched"}))


if __name__ == "__main__":
    main()
