#!/usr/bin/env python3
"""
explore_limit_orders_v1.py -- EXPLORATORY, not a test: would v1's back-test bets (data/backtest_bets.csv) have done
better as limit orders resting at our side's yes bid instead of buying at the ask? Rules fixed before running:

  * order placed at the buy moment's candle (d6 or d1) at that side's yes bid, good until 40 minutes before kickoff;
  * filled only if a later hourly candle traded BELOW the limit or had its yes ask BELOW it (a price equal to ours
    could have filled others ahead of us in the queue, so it does not count);
  * CLV = that side's market chance at `close` - limit - maker fee, maker fee = 0.0175 * P * (1 - P) (Kalshi's maker
    rate on markets that charge one -- an assumption to check against the fee schedule).

v1 stays a failed model whatever this shows; this only says whether resting orders are worth testing in v2.
Writes data/explore_limit_orders_v1.csv and prints a summary.
Run from the repo root:  python3 nfl/handicapper/explore_limit_orders_v1.py
"""
import os
import sys
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import kalshi_history as KH  # noqa: E402

H = KH.H
MAKER = 0.0175


def low(c, key):
    v = c.get(key)
    if isinstance(v, dict):
        x = v.get("low_dollars") if v.get("low_dollars") not in (None, "") else v.get("low")
        return H.num(x) if x not in (None, "") else None
    return None


def main():
    bets = pd.read_csv(os.path.join(HERE, "data", "backtest_bets.csv"))
    hist = pd.read_csv(os.path.join(HERE, "data", "kalshi_moneyline_history.csv"))
    snap_end = hist.set_index(["game_id", "side", "snap"])
    rows = []
    for b in bets.itertuples():
        buy = {"A": "d6", "B": "d1"}[b.test]
        r0 = snap_end.loc[(b.game_id, b.side, buy)]
        bid = float(r0.yes_bid)
        kick = datetime.strptime(r0.kickoff_utc, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        t0 = datetime.strptime(r0.snap_end_utc, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        end = kick - timedelta(minutes=40)
        cs = KH.candles(r0.ticker, int(t0.timestamp()), int(end.timestamp()))
        fill = None
        for c in sorted(cs, key=lambda c: c["end_period_ts"]):
            if c["end_period_ts"] <= t0.timestamp() or c["end_period_ts"] > end.timestamp():
                continue
            tl, al = low(c, "price"), low(c, "yes_ask")
            if (tl is not None and tl < bid - 1e-9) or (al is not None and al < bid - 1e-9):
                fill = datetime.fromtimestamp(c["end_period_ts"], timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                break
        fee = MAKER * bid * (1 - bid)
        rows.append(dict(test=b.test, game_id=b.game_id, season=b.season, side=b.side, limit=bid, ask=b.ask,
                         filled=fill is not None, fill_utc=fill, close=b.close, won=b.won,
                         clv_maker=b.close - bid - fee, profit_maker=b.won - bid - fee, clv_taker=b.clv,
                         candles=len(cs)))
    df = pd.DataFrame(rows)
    df.to_csv(os.path.join(HERE, "data", "explore_limit_orders_v1.csv"), index=False)
    for t, g in df.groupby("test"):
        f = g[g.filled]
        se = lambda x: x.std(ddof=1) / np.sqrt(len(x)) if len(x) > 1 else float("nan")
        print(f"test {t}: {len(g)} orders, filled {len(f)} ({len(f) / len(g):.0%}); "
              f"filled CLV {f.clv_maker.mean():+.4f} (t {f.clv_maker.mean() / se(f.clv_maker):.2f}), "
              f"unfilled would-be CLV {g[~g.filled].clv_maker.mean():+.4f}; taker CLV {g.clv_taker.mean():+.4f}; "
              f"filled ROI {f.profit_maker.sum() / (f.limit.sum() + (MAKER * f.limit * (1 - f.limit)).sum()):+.1%}; "
              f"no candles {int((g.candles == 0).sum())}")


if __name__ == "__main__":
    main()
