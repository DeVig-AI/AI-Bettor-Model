#!/usr/bin/env python3
"""
kalshi_props_history_v1.py -- collects PAST (settled) Kalshi NHL player-prop markets (goals, points, assists) with the
price shortly before puck drop and how each settled, for the pre-registered back-test NHL_PROPS_KALSHI_BACKTEST_V1
(nhl/NHL_PROPS_KALSHI_BACKTEST_V1_PREREG.md). Read-only public market data: no key, no account, nothing bet.
Same design as nba/kalshi_props_history_v1.py, with its fixes built in (markets of settled events read from
/historical/markets; Kalshi's historical "structured" copies of N+ markets; both wordings of the market title; an
event is never marked done when nothing was written).

For every settled market in KXNHLGOAL, KXNHLPTS, KXNHLAST for NHL regular-season and playoff games (NHL API game type
2 or 3) that started BEFORE 2026-10-21 00:00 UTC (the live paper test starts after that, so they never overlap):
  * price  = the last hourly candle closing at least 40 minutes before puck drop, searched in the 8 hours before that
             (yes bid / yes ask / last trade / open interest);
  * result = Kalshi's own settlement ("yes" / "no"; anything else is kept but flagged).
Puck drop, teams, game id and game type come from the NHL API schedule.

Resumable: appends to nhl/props_history/kalshi/<YYYY-MM>.csv, remembers finished events in done_events.txt, stops
after MAX_MINUTES. Run from the repo root:  python3 nhl/kalshi_props_history_v1.py
"""
import csv, json, os, sys, time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import nhl_kalshi_common_v1 as K  # noqa: E402

MAX_MINUTES = float(os.getenv("MAX_MINUTES", "300"))
CUTOFF = datetime(2026, 10, 21, tzinfo=timezone.utc)
SNAP_BEFORE, SNAP_SEARCH = timedelta(minutes=40), timedelta(hours=8)
GAME_TYPES = {2, 3}
THREADS = 6                                             # with K.MIN_GAP below: ~8 requests/s (16 and 12/s drew 429s)
K.MIN_GAP = 1 / 8.0
OUT_DIR = os.path.join(HERE, "props_history")
CSV_DIR = os.path.join(OUT_DIR, "kalshi")
DONE = os.path.join(OUT_DIR, "done_events.txt")
SUMMARY = os.path.join(OUT_DIR, "kalshi_props_history_v1_summary.json")
COLS = ["series", "stat", "event_ticker", "ticker", "game_date", "season", "game_type", "game_id", "away_team",
        "home_team", "start_utc", "player", "line", "snap_end_utc", "yes_bid", "yes_ask", "last_price", "open_interest",
        "volume", "result", "settlement_value", "source"]
stats = {"events_seen": 0, "events_done_now": 0, "markets_written_now": 0, "no_candle": 0, "no_game": 0,
         "not_nhl_game_type": 0, "after_cutoff": 0, "no_markets": 0, "markets_from": {}, "candles_by_endpoint": {}}
raw_samples = {}
T0 = time.time()


def anytime(m):
    """Before about February 2026 Kalshi worded the 1+ goal market "Name: Anytime Goalscorer" (structured,
    floor_strike 0.5): the same Over 0.5 goals market as the later "Name: 1+ goals". Returns the player or None."""
    t = str(m.get("title") or "")
    try:
        ok = m.get("strike_type") == "structured" and abs(float(m.get("floor_strike")) - 0.5) < 1e-9
    except (TypeError, ValueError):
        ok = False
    if ok and t.lower().endswith(": anytime goalscorer"):
        return t[: -len(": anytime goalscorer")].strip()
    return None


def label_line(m, series):
    """(player, Over line, wording) for an "N+" market, or an old "Anytime Goalscorer" goals market as 1+ goals."""
    if K.is_over_market(m):
        return K.label(m)[0], K.line_of(m), "N+"
    if series == "KXNHLGOAL" and anytime(m):
        return anytime(m), 0.5, "anytime"
    return None, None, None


def settled_events(series):
    seen = set()
    cursor = None
    for _ in range(200):
        d = K.get(K.KALSHI + "/events", {"series_ticker": series, "status": "settled", "limit": 200, "cursor": cursor})
        if not d:
            break
        evs = d.get("events") or []
        for ev in evs:
            if ev.get("event_ticker") not in seen:
                seen.add(ev.get("event_ticker"))
                yield ev
        cursor = d.get("cursor")
        if not cursor or not evs:
            break
    groups, cursor = {}, None                           # markets only on /historical (events not listed above)
    for _ in range(500):
        d = K.get(K.KALSHI + "/historical/markets", {"series_ticker": series, "limit": 1000, "cursor": cursor})
        if not d:
            break
        ms = d.get("markets") or []
        for m in ms:
            if m.get("event_ticker") and m["event_ticker"] not in seen:
                groups.setdefault(m["event_ticker"], []).append(m)
        cursor = d.get("cursor")
        if not cursor or not ms:
            break
    for et, ms in groups.items():
        yield {"event_ticker": et, "markets": ms, "_historical": True}


def markets_for_event(ev):
    """(markets, where from): nested, else the live list, else the historical list."""
    if ev.get("markets"):
        return ev["markets"], ("/historical/markets" if ev.get("_historical") else "nested")
    answered = 0
    for path in ("/historical/markets", "/markets"):
        d = K.get(K.KALSHI + path, {"event_ticker": ev.get("event_ticker"), "limit": 1000})
        answered += d is not None
        ms = (d or {}).get("markets") or []
        if ms:
            raw_samples.setdefault("market_" + path, ms[0])
            return ms, path
    return [], ("empty" if answered == 2 else None)     # "empty": both lists answered and Kalshi has no market


def one_market_candles(series, t, start_ts, end_ts, historical):
    paths = ((f"/historical/markets/{t}/candlesticks", "historical"),
             (f"/series/{series}/markets/{t}/candlesticks", "per_market"))
    answered = False
    for path, name in (paths if historical else paths[::-1]):
        d = K.get(K.KALSHI + path, {"start_ts": start_ts, "end_ts": end_ts, "period_interval": 60})
        answered = answered or d is not None
        if d and d.get("candlesticks"):
            raw_samples.setdefault(name, d if len(json.dumps(d)) < 20000 else {"truncated": True})
            return name, d["candlesticks"]
    return (None if answered else "failed"), []        # "failed": no endpoint answered (e.g. rate limit) -- retry later


def candles(series, tickers, start_ts, end_ts, pool, historical):
    out = {}
    if not historical:
        for i in range(0, len(tickers), 50):
            d = K.get(K.KALSHI + "/markets/candlesticks", {"market_tickers": ",".join(tickers[i:i + 50]),
                                                           "start_ts": start_ts, "end_ts": end_ts, "period_interval": 60})
            for m in (d or {}).get("markets") or []:
                if m.get("candlesticks"):
                    out[m.get("market_ticker") or m.get("ticker")] = m["candlesticks"]
    ce = stats["candles_by_endpoint"]
    ce["batch"] = ce.get("batch", 0) + len(out)
    rest = [t for t in tickers if t not in out]
    failed = False
    for t, (name, cs) in zip(rest, pool.map(lambda t: one_market_candles(series, t, start_ts, end_ts, historical), rest)):
        out[t] = cs
        failed = failed or name == "failed"
        if name and name != "failed":
            ce[name] = ce.get(name, 0) + 1
    return None if failed else out


def main():
    os.makedirs(CSV_DIR, exist_ok=True)
    done = set(open(DONE).read().split()) if os.path.exists(DONE) else set()
    files, writers = {}, {}

    def writer(month):
        if month not in writers:
            p = os.path.join(CSV_DIR, f"{month}.csv")
            new = not os.path.exists(p)
            files[month] = open(p, "a", newline="")
            writers[month] = csv.writer(files[month])
            if new:
                writers[month].writerow(COLS)
        return writers[month]

    stopped = False
    pool = ThreadPoolExecutor(THREADS)
    for series, stat in K.SERIES.items():
        if stopped:
            break
        for ev in settled_events(series):
            stats["events_seen"] += 1
            et = ev.get("event_ticker")
            if not et or et in done:
                continue
            if (time.time() - T0) / 60 > MAX_MINUTES:
                stopped = True; break
            g = K.game_of(et)
            if not g:                               # not marked done: retried next run
                stats["no_game"] += 1; K.log.append(f"no game {et}"); continue
            if g["start"] >= CUTOFF:
                stats["after_cutoff"] += 1; continue
            if g["game_type"] not in GAME_TYPES:
                stats["not_nhl_game_type"] += 1; done.add(et); continue
            all_ms, src = markets_for_event(ev)
            if not all_ms and src == "empty":           # an event Kalshi lists with no market at all: nothing to price
                stats["empty_at_kalshi"] = stats.get("empty_at_kalshi", 0) + 1
                K.log.append(f"empty at Kalshi {et}"); done.add(et); continue
            ms = [m for m in all_ms if label_line(m, series)[0]]
            if not ms:
                stats["no_markets"] += 1; K.log.append(f"no markets {et}"); continue
            stats["markets_from"][src] = stats["markets_from"].get(src, 0) + 1
            snap = g["start"] - SNAP_BEFORE
            start_ts, end_ts = int((snap - SNAP_SEARCH).timestamp()), int(snap.timestamp())
            cs = candles(series, [m["ticker"] for m in ms if m.get("ticker")], start_ts, end_ts, pool,
                         historical=src == "/historical/markets")
            if cs is None:                              # a price request was refused: not written, retried next run
                stats["candles_failed"] = stats.get("candles_failed", 0) + 1; continue
            w = writer(g["date"][:7])
            n_written = 0
            for m in ms:
                player, line, wording = label_line(m, series)
                if not player or line is None:
                    continue
                if wording == "anytime":
                    stats["anytime_goalscorer_markets"] = stats.get("anytime_goalscorer_markets", 0) + 1
                best = None
                for c in cs.get(m["ticker"]) or []:
                    end = c.get("end_period_ts")
                    if end is not None and end <= end_ts and (best is None or end > best["end_period_ts"]):
                        best = c
                if not best:
                    stats["no_candle"] += 1
                w.writerow([series, stat, et, m["ticker"], g["date"], g["season"], g["game_type"], g["game_id"],
                            g["away"], g["home"], K.iso(g["start"]), player, line,
                            K.iso(datetime.fromtimestamp(best["end_period_ts"], timezone.utc)) if best else "",
                            K.ohlc_close(best, "yes_bid") if best else "", K.ohlc_close(best, "yes_ask") if best else "",
                            K.ohlc_close(best, "price") if best else "",
                            (best.get("open_interest_fp") or best.get("open_interest")) if best else "",
                            (best.get("volume_fp") or best.get("volume")) if best else "",
                            m.get("result"), m.get("settlement_value_dollars") or m.get("settlement_value"), src])
                stats["markets_written_now"] += 1
                n_written += 1
            files[g["date"][:7]].flush()
            if not n_written:
                stats["no_markets"] += 1; K.log.append(f"no player markets {et}")
                raw_samples.setdefault("unparsed_market", ms[0]); continue
            done.add(et)
            stats["events_done_now"] += 1
            with open(DONE, "w") as f:
                f.write("\n".join(sorted(done)) + "\n")
    pool.shutdown()
    for f in files.values():
        f.close()
    stats["minutes"] = round((time.time() - T0) / 60, 1)
    stats["complete"] = not stopped
    stats["events_done_total"] = len(done)
    json.dump({"generated_at": K.iso(K.now_utc()), "stats": stats, "errors": K.log[:300], "raw_candle_samples": raw_samples},
              open(SUMMARY, "w"), indent=1, default=str)
    print(json.dumps(stats, indent=1))


if __name__ == "__main__":
    sys.exit(main())
