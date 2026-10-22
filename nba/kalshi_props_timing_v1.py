#!/usr/bin/env python3
"""
kalshi_props_timing_v1.py -- collects EARLIER Kalshi prices for the NBA props already in the v2 back-test
(nba/props_history/backtest_v2_rows.csv), for the pre-registered study NBA_PROPS_TIMING_V1
(nba/NBA_PROPS_TIMING_V1_PREREG.md). Read-only public market data: no key, nothing bet.

For each market: hourly candles from 30 hours before tip-off to 40 minutes before; for each horizon H in HORIZONS,
the last candle closing at least H hours before tip-off (and within the 8 hours before that, as the original
snapshot rule): yes bid, yes ask, open interest. Output: nba/props_history/timing/early_prices.csv (one row per market
and horizon; missing price = empty). Resumable by event.

Run from the repo root (GitHub Actions):  python3 nba/kalshi_props_timing_v1.py
"""
import csv, glob, json, os, sys, time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import kalshi_props_history_v1 as K  # noqa: E402  (same API helpers, rate limit and candle parsing)

HORIZONS = [24, 12, 6, 3, 1.5]
SEARCH = timedelta(hours=8)
ROWS = os.path.join(HERE, "props_history", "backtest_v2_rows.csv")
OUT_DIR = os.path.join(HERE, "props_history", "timing")
OUT = os.path.join(OUT_DIR, "early_prices.csv")
DONE = os.path.join(OUT_DIR, "done_events.txt")
SUMMARY = os.path.join(OUT_DIR, "timing_collect_summary.json")
MAX_MINUTES = float(os.getenv("MAX_MINUTES", "320"))
COLS = ["ticker", "event_ticker", "horizon_h", "snap_end_utc", "yes_bid", "yes_ask", "open_interest"]


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    want = {r["ticker"] for r in csv.DictReader(open(ROWS))}
    meta = {}
    for p in sorted(glob.glob(os.path.join(HERE, "props_history", "kalshi", "*.csv"))):
        for r in csv.DictReader(open(p)):
            if r["ticker"] in want:
                meta[r["ticker"]] = (r["series"], r["event_ticker"], r["tipoff_utc"])
    events = {}
    for t, (series, et, tip) in meta.items():
        events.setdefault((series, et, tip), []).append(t)
    done = set(open(DONE).read().split()) if os.path.exists(DONE) else set()
    st = {"markets_wanted": len(want), "markets_found": len(meta), "events": len(events), "events_done_now": 0,
          "rows_written_now": 0, "priced_by_horizon": {str(h): 0 for h in HORIZONS}}
    new = not os.path.exists(OUT)
    f = open(OUT, "a", newline="")
    w = csv.writer(f)
    if new:
        w.writerow(COLS)
    pool = ThreadPoolExecutor(K.THREADS)
    t0 = time.time()
    stopped = False
    for (series, et, tip), tickers in sorted(events.items(), key=lambda kv: kv[0][2]):
        if et in done:
            continue
        if (time.time() - t0) / 60 > MAX_MINUTES:
            stopped = True; break
        tt = datetime.fromisoformat(tip.replace("Z", "+00:00"))
        start = int((tt - timedelta(hours=max(HORIZONS)) - SEARCH).timestamp())
        end = int((tt - timedelta(minutes=40)).timestamp())
        cs = K.candles(series, sorted(tickers), start, end, pool)
        for t in sorted(tickers):
            for h in HORIZONS:
                lim = int((tt - timedelta(hours=h)).timestamp())
                best = None
                for c in cs.get(t) or []:
                    e = c.get("end_period_ts")
                    if e is None or e > lim or e < lim - SEARCH.total_seconds():
                        continue
                    if best is None or e > best["end_period_ts"]:
                        best = c
                if best:
                    st["priced_by_horizon"][str(h)] += 1
                w.writerow([t, et, h,
                            datetime.fromtimestamp(best["end_period_ts"], timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if best else "",
                            K.ohlc_close(best, "yes_bid") if best else "", K.ohlc_close(best, "yes_ask") if best else "",
                            (best.get("open_interest_fp") or best.get("open_interest")) if best else ""])
                st["rows_written_now"] += 1
        f.flush()
        done.add(et)
        st["events_done_now"] += 1
        with open(DONE, "w") as g:
            g.write("\n".join(sorted(done)) + "\n")
    pool.shutdown()
    f.close()
    st.update(minutes=round((time.time() - t0) / 60, 1), complete=not stopped, events_done_total=len(done),
              candles_by_endpoint=K.stats["candles_by_endpoint"])
    json.dump({"generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "stats": st,
               "errors": K.log[:200]}, open(SUMMARY, "w"), indent=1)
    print(json.dumps(st, indent=1))


if __name__ == "__main__":
    main()
