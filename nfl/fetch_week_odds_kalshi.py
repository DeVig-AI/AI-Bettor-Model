#!/usr/bin/env python3
"""
fetch_week_odds_kalshi.py -- free replacement for fetch_week_odds_v2.py (kept unmodified). Same arguments, same
output columns, so PROSPECTIVE_TRACKER_V1_5_LOG_PICKS.py reads it unchanged:
    game_id, bookmaker, kickoff_time, snapshot_time, home_team, away_team, market_home_margin,
    home_moneyline, away_moneyline, home_spread_odds, away_spread_odds

Prices come from Kalshi's public market data (no key, no account; see ../kalshi_games_v1.py) with bookmaker
"kalshi" -- the same key the Odds API used for Kalshi, so the lock treats it exactly as before. Hard Rock prices
are no longer fetched: they needed a paid key. Kickoff times come from ESPN; game_id from the nflverse schedule.

Usage (unchanged):
    python3 fetch_week_odds_kalshi.py --week 7 --season 2026 --out WEEK_ODDS_LIVE.csv
"""
import argparse
import datetime as dt
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import kalshi_games_v1 as K  # noqa: E402


def annotate(level, msg):
    msg = str(msg).replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
    print(f"::{level} title=NFL odds fetch (Kalshi)::{msg}", flush=True)


def fail(msg):
    annotate("error", msg)
    raise SystemExit(1)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--week", type=int, required=True)
    ap.add_argument("--season", type=int, required=True)
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args()

    import nflreadpy as nfl
    sched = nfl.load_schedules([args.season])
    if hasattr(sched, "to_pandas"):
        sched = sched.to_pandas()
    wk = sched[sched.week == args.week]
    if wk.empty:
        fail(f"No games for season {args.season} week {args.week} in the nflverse schedule.")
    week_ids = {(K.canon("NFL", r.away_team), K.canon("NFL", r.home_team)): r.game_id for r in wk.itertuples()}

    games = K.kalshi_games("NFL")
    print(f"Kalshi lists {len(games)} open NFL games.", file=sys.stderr)
    snapshot = K.now_iso()
    rows, skipped = [], []
    for key, g in sorted(games.items()):
        e = K.match_espn("NFL", g)
        if not e:
            skipped.append((key, "no ESPN game")); continue
        a, h = (g["home_code"], g["away_code"]) if e.get("swapped") else (g["away_code"], g["home_code"])
        game_id = week_ids.get((e["away"], e["home"]))
        if not game_id:
            continue                      # another week
        kickoff = dt.datetime.fromisoformat(e["kickoff"].replace("Z", "+00:00"))
        if kickoff <= dt.datetime.now(dt.timezone.utc):
            skipped.append((key, "already started")); continue
        hml, aml = K.moneylines(g, a, h)
        if hml is None or aml is None:
            skipped.append((key, "no two-sided moneyline")); continue
        sp = K.main_spread(g, a, h)
        rows.append({"game_id": game_id, "bookmaker": "kalshi",
                     "kickoff_time": kickoff.strftime("%Y-%m-%dT%H:%M:%SZ"), "snapshot_time": snapshot,
                     "home_team": e["home_name"], "away_team": e["away_name"],
                     "market_home_margin": sp[0] if sp else None,
                     "home_moneyline": hml, "away_moneyline": aml,
                     "home_spread_odds": sp[1] if sp else None, "away_spread_odds": sp[2] if sp else None})

    if not rows:
        fail(f"No Kalshi odds matched week {args.week} games ({len(games)} open Kalshi games). "
             f"Skipped: {skipped[:10]} Log: {K.log[:5]}")
    out = pd.DataFrame(rows)
    if out.duplicated(subset=["game_id", "bookmaker"]).any():
        fail("Duplicate game_id/bookmaker rows produced -- refusing to write.")
    args.out.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(args.out, index=False)
    print(f"Wrote {len(out)} Kalshi odds rows for week {args.week} to {args.out}")
    annotate("notice", f"Kalshi odds for {len(out)} of {len(week_ids)} week-{args.week} games (free, no key).")
    if skipped:
        print(f"NOTE: skipped {skipped[:8]}", file=sys.stderr)


if __name__ == "__main__":
    main()
