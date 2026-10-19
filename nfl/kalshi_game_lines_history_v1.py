#!/usr/bin/env python3
"""
kalshi_game_lines_history_v1.py -- collects Kalshi's PRE-GAME NFL game markets (total ladder, spread ladders,
moneyline) for the games in the props history, for NFL_PROPS_DIAGNOSIS_V1 (nfl/NFL_PROPS_DIAGNOSIS_V1_PLAN.md).
Read-only public market data: no key, no account, nothing bet.

Same snapshot rule as the props history: the last hourly candle closing at least 40 minutes before kickoff (kickoff
from the nflverse schedule). Settled events are read from Kalshi's live and historical endpoints with the props
collector's helpers; team codes are canonicalised with kalshi_games_v1.ALIASES. One output row per market:
  nfl/props_history/kalshi_game_lines_history_v1.csv
Run from the repo root:  python3 nfl/kalshi_game_lines_history_v1.py
"""
import csv, json, os, re, sys
from datetime import timedelta, timezone, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))
import kalshi_props_history_v1 as H  # noqa: E402  (helpers only; its main() is not run)
import kalshi_games_v1 as KG  # noqa: E402

PROPS = os.path.join(HERE, "props_history", "kalshi_props_history_v1.csv")
OUT = os.path.join(HERE, "props_history", "kalshi_game_lines_history_v1.csv")
SUMMARY = os.path.join(HERE, "props_history", "kalshi_game_lines_history_v1_summary.json")
SERIES = {"KXNFLGAME": "moneyline", "KXNFLSPREAD": "spread", "KXNFLTOTAL": "total"}
COLS = ["kind", "series", "event_ticker", "ticker", "game_date", "away_team", "home_team", "kickoff_utc", "team",
        "line", "snap_end_utc", "yes_bid", "yes_ask", "last_price", "open_interest", "result", "source"]


def canon(code):
    return KG.canon("NFL", code)


def game_for(event_ticker, title, wanted):
    """(date, away, home) of a wanted props game for this event, from the title or else the ticker's team codes."""
    date = H.date_from_ticker(event_ticker)
    t = H.teams_from_title(title)
    if t:
        for a, h in (t, t[::-1]):
            if (date, a, h) in wanted:
                return (date, a, h)
    suffix = re.sub(r"^\d+", "", event_ticker.split("-", 1)[1][7:]) if "-" in event_ticker else ""
    for (d, a, h) in wanted:
        if d != date:
            continue
        for ca in {a, *[k for k, v in KG.ALIASES["NFL"].items() if v == a]}:
            for ch in {h, *[k for k, v in KG.ALIASES["NFL"].items() if v == h]}:
                if suffix in (ca + ch, ch + ca):
                    return (d, a, h)
    return None


def team_of(ticker, kind, game):
    """Team a moneyline / spread market is about: the leading letters of the ticker's last part."""
    if kind == "total":
        return ""
    m = re.match(r"[A-Z]+", str(ticker).rsplit("-", 1)[-1])
    c = canon(m.group(0)) if m else ""
    return c if c in game[1:] else ""


def main():
    props = list(csv.DictReader(open(PROPS)))
    wanted = {(r["game_date"], r["away_team"], r["home_team"]): r["kickoff_utc"] for r in props}
    rows, seen, stats = [], set(), {"events": 0, "matched": 0, "markets": 0, "no_candle": 0, "unmatched_events": []}
    for series, kind in SERIES.items():
        for ev, base in H.settled_events(series):
            et = ev.get("event_ticker") or ""
            if et in seen:
                continue
            seen.add(et)
            stats["events"] += 1
            g = game_for(et, ev.get("title"), wanted)
            if not g:
                if len(stats["unmatched_events"]) < 50 and (H.date_from_ticker(et) or "") >= "2026-09-01":
                    stats["unmatched_events"].append(f"{et} {ev.get('title')!r}")
                continue
            stats["matched"] += 1
            kick = datetime.strptime(wanted[g], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
            end_ts = int((kick - H.SNAP_BEFORE).timestamp())
            start_ts = int((kick - timedelta(hours=8)).timestamp())
            ms = [m for m in H.markets_for_event(ev, base) if m.get("ticker")]
            if kind != "moneyline":
                ms = [m for m in ms if m.get("strike_type") in (None, "greater") and m.get("floor_strike") is not None]
            cs = H.candles(series, [m["ticker"] for m in ms], start_ts, end_ts)
            for m in ms:
                best = None
                for c in cs.get(m["ticker"]) or []:
                    e = c.get("end_period_ts")
                    if e is not None and e <= end_ts and (best is None or e > best["end_period_ts"]):
                        best = c
                if not best:
                    stats["no_candle"] += 1
                rows.append([kind, series, et, m["ticker"], g[0], g[1], g[2], wanted[g], team_of(m["ticker"], kind, g),
                             m.get("floor_strike") if kind != "moneyline" else "",
                             datetime.fromtimestamp(best["end_period_ts"], timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if best else "",
                             H.ohlc_close(best, "yes_bid") if best else "", H.ohlc_close(best, "yes_ask") if best else "",
                             H.ohlc_close(best, "price") if best else "",
                             (best.get("open_interest_fp") or best.get("open_interest")) if best else "",
                             m.get("result"), base])
                stats["markets"] += 1
    with open(OUT, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(COLS)
        w.writerows(sorted(rows, key=lambda r: (r[4], r[2], r[3])))
    stats["games_with_any"] = len({(r[4], r[5], r[6]) for r in rows})
    stats["props_games"] = len(wanted)
    json.dump({"stats": stats, "errors": H.log[:100], "candle_endpoint": H.stats.get("candle_endpoint")},
              open(SUMMARY, "w"), indent=1)
    print(json.dumps(stats, indent=1))


if __name__ == "__main__":
    main()
