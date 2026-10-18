#!/usr/bin/env python3
"""
nba_fetch_odds_kalshi.py -- free replacement for nba_fetch_odds.py (kept unmodified). Same arguments and the same
CSV columns, so nba_live_tracker_lock.py reads it unchanged:
    join_key, bookmaker, kickoff_time, snapshot_time, home_team, away_team, home_team_full, away_team_full,
    home_moneyline, away_moneyline

Prices come from Kalshi's public market data (no key, no account; see ../kalshi_games_v1.py) with bookmaker
"kalshi". Tip-off times come from ESPN. Hard Rock prices are no longer fetched: they needed a paid key.

Usage (unchanged):
    python3 nba_fetch_odds_kalshi.py --out live/NBA_ODDS_LIVE.csv --hours-ahead 72
"""
import argparse
import csv
import datetime as dt
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import kalshi_games_v1 as K  # noqa: E402
from nba_fetch_odds import resolve_code  # noqa: E402  same team codes as before


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--hours-ahead", type=float, default=72.0)
    args = ap.parse_args()

    games = K.kalshi_games("NBA")
    print(f"Kalshi lists {len(games)} open NBA games.", file=sys.stderr)
    now = dt.datetime.now(dt.timezone.utc)
    horizon = now + dt.timedelta(hours=args.hours_ahead)
    snapshot = K.now_iso()
    rows, unmatched = [], []
    for key, g in sorted(games.items()):
        e = K.match_espn("NBA", g)
        if not e:
            unmatched.append((key, "no ESPN game")); continue
        kickoff = dt.datetime.fromisoformat(e["kickoff"].replace("Z", "+00:00"))
        if not (now <= kickoff <= horizon):
            continue
        a, h = (g["home_code"], g["away_code"]) if e.get("swapped") else (g["away_code"], g["home_code"])
        away_code, home_code = resolve_code(e["away_name"] or ""), resolve_code(e["home_name"] or "")
        if not away_code or not home_code:
            unmatched.append((key, f"team name not resolved: {e['away_name']} @ {e['home_name']}")); continue
        hml, aml = K.moneylines(g, a, h)
        if hml is None or aml is None:
            unmatched.append((key, "no two-sided moneyline")); continue
        kickoff_iso = kickoff.strftime("%Y-%m-%dT%H:%M:%SZ")
        rows.append({"join_key": f"{away_code}_{home_code}_{re.sub(r'[:-]', '', kickoff_iso)}", "bookmaker": "kalshi",
                     "kickoff_time": kickoff_iso, "snapshot_time": snapshot, "home_team": home_code,
                     "away_team": away_code, "home_team_full": e["home_name"], "away_team_full": e["away_name"],
                     "home_moneyline": hml, "away_moneyline": aml})

    if not rows:
        raise SystemExit(f"No odds rows in the next {args.hours_ahead}h. Unmatched sample: {unmatched[:10]} Log: {K.log[:5]}")
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f"Wrote {len(rows)} Kalshi odds rows (next {args.hours_ahead}h) to {args.out}")
    if unmatched:
        print(f"NOTE: {len(unmatched)} Kalshi games skipped. Sample: {unmatched[:5]}", file=sys.stderr)


if __name__ == "__main__":
    main()
