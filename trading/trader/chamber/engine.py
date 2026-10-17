"""Backtest engine: Zipline Reloaded does the accounting (fills, cash, costs, delistings).

We hand it a schedule of target weights decided from data known at each
month-end close. Orders go in on the decision day's bar and Zipline (daily mode)
fills them at the NEXT session's close,
so every trade happens one day after the decision: no look-ahead, slightly
pessimistic versus the live plan of trading at the next open.

Prices fed in are split- and dividend-adjusted, so returns include dividends.
A day with no price is stored as 0 (Zipline's "no data"), never filled in.
A stock that delists is closed by Zipline at its last price.
"""
from __future__ import annotations

import hashlib
import logging
import os
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

from ..data.store import CACHE

ZIPLINE_ROOT = CACHE / "zipline"
CAPITAL = 10_000_000  # realistic size for judging the edge; live size is separate
logging.getLogger("zipline").setLevel(logging.ERROR)


@dataclass
class RunResult:
    returns: pd.Series
    turnover: float                       # average one-way turnover per rebalance
    stop_losses: int
    rebalances: int
    notes: list[str] = field(default_factory=list)


def snapshot_id(prices: pd.DataFrame) -> str:
    h = hashlib.sha256(pd.util.hash_pandas_object(prices[["symbol", "date", "adj_close"]], index=False).values)
    return h.hexdigest()[:16]


def _ingest(bundle: str, prices: pd.DataFrame, calendar: str = "XNYS") -> None:
    from zipline.data.bundles import ingest, register
    from zipline.utils.calendar_utils import get_calendar

    def writer(environ, asset_db_writer, minute_bar_writer, daily_bar_writer, adjustment_writer,
               calendar, start_session, end_session, cache, show_progress, output_dir):
        sessions = calendar.sessions_in_range(start_session, end_session)
        meta, frames = [], []
        for sid, (sym, g) in enumerate(sorted(prices.groupby("symbol"), key=lambda x: x[0])):
            g = g.set_index("date").sort_index()
            span = sessions[(sessions >= g.index[0]) & (sessions <= g.index[-1])]
            if len(span) == 0:
                continue
            bars = pd.DataFrame({
                "open": g["adj_open"].fillna(g["adj_close"]), "high": g["adj_high"].fillna(g["adj_close"]),
                "low": g["adj_low"].fillna(g["adj_close"]), "close": g["adj_close"],
                "volume": g["volume"].fillna(0)}).reindex(span).fillna(0)
            frames.append((sid, bars))
            meta.append({"symbol": sym, "start_date": span[0], "end_date": span[-1],
                         "auto_close_date": span[-1] + pd.Timedelta(days=1), "exchange": "NYSE"})
        daily_bar_writer.write(frames, show_progress=False)
        asset_db_writer.write(equities=pd.DataFrame(meta),
                              exchanges=pd.DataFrame({"exchange": ["NYSE"], "country_code": ["US"]}))
        adjustment_writer.write()

    cal = get_calendar(calendar)
    first = cal.date_to_session(prices["date"].min(), direction="next")
    last = cal.date_to_session(prices["date"].max(), direction="previous")
    register(bundle, writer, calendar_name=calendar, start_session=first, end_session=last)
    ingest(bundle, show_progress=False)


def ensure_bundle(prices: pd.DataFrame) -> str:
    os.environ["ZIPLINE_ROOT"] = str(ZIPLINE_ROOT)
    ZIPLINE_ROOT.mkdir(parents=True, exist_ok=True)
    name = f"chamber_{snapshot_id(prices)}"
    marker = ZIPLINE_ROOT / f"{name}.done"
    if not marker.exists():
        _ingest(name, prices)
        marker.write_text("ok")
    else:
        from zipline.data.bundles import register
        register(name, lambda *a, **k: None, calendar_name="XNYS")
    return name


def run(prices: pd.DataFrame, schedule: dict[pd.Timestamp, dict[str, float]], start, end,
        cost_per_side: float, stop_loss: float | None, capital: float = CAPITAL,
        freeze_after=None) -> RunResult:
    """Trade toward each schedule entry the session after its date. Returns daily returns.
    freeze_after: from the next day on, place no orders at all (kill-switch version C: pause,
    keep positions). Delisted stocks are still closed out by Zipline at their final price."""
    from zipline import run_algorithm
    from zipline.api import (
        commission,
        order_target,
        order_target_percent,
        set_commission,
        set_slippage,
        slippage,
        symbol,
    )

    bundle = ensure_bundle(prices)
    closes = {}
    if stop_loss:
        win = prices[(prices["date"] >= pd.Timestamp(start)) & (prices["date"] <= pd.Timestamp(end))]
        for d, g in win.groupby("date"):
            closes[pd.Timestamp(d)] = dict(zip(g["symbol"], g["adj_close"]))
    keys = sorted(pd.Timestamp(k) for k in schedule)
    state = {"applied": None, "stopped": set(), "turn": [], "stops": 0, "rebal": 0, "deleverage": 0, "notes": []}

    def initialize(ctx):
        set_commission(commission.PerDollar(cost=cost_per_side))
        set_slippage(slippage.FixedBasisPointsSlippage(basis_points=0.0, volume_limit=0.1))

    def handle_data(ctx, data):
        today = ctx.get_datetime().tz_localize(None).normalize()
        if freeze_after is not None and today > pd.Timestamp(freeze_after):
            return
        # latest decision made at or before today's close; orders placed now fill
        # at the next session's close
        i = pd.Index(keys).searchsorted(today, side="right") - 1
        key = keys[i] if i >= 0 else None
        if key is not None and key != state["applied"]:
            state["applied"], state["stopped"] = key, set()
            targets = schedule[key]
            pv = ctx.portfolio.portfolio_value
            held = {a.symbol: p.amount * p.last_sale_price / pv for a, p in ctx.portfolio.positions.items()}
            state["turn"].append(sum(abs(targets.get(s, 0) - held.get(s, 0))
                                     for s in set(targets) | set(held)) / 2)
            state["rebal"] += 1
            for a in list(ctx.portfolio.positions):
                if a.symbol not in targets and data.can_trade(a):
                    order_target(a, 0)
            for s, w in targets.items():
                try:
                    a = symbol(s)
                except Exception:
                    state["notes"].append(f"{key.date()} {s}: not in price data, skipped")
                    continue
                if data.can_trade(a):
                    order_target_percent(a, w)
                else:
                    state["notes"].append(f"{key.date()} {s}: no price that day, skipped")
            return
        # Orders are sized at the decision close but fill a day later; if prices rose in
        # between we end up slightly over 100% invested. Sell back down the next day
        # (paying costs) so the backtest never runs on borrowed money.
        pv = ctx.portfolio.portfolio_value
        if ctx.portfolio.cash < -0.001 * pv and pv > 0:
            scale = pv / (pv - ctx.portfolio.cash)
            for a, p in ctx.portfolio.positions.items():
                if data.can_trade(a):
                    order_target(a, int(p.amount * scale))
            state["deleverage"] += 1
        if stop_loss:
            # read closes from our own table: much faster than Zipline's data portal
            row = closes.get(today)
            for a, p in ctx.portfolio.positions.items():
                if a in state["stopped"] or p.amount <= 0 or row is None:
                    continue
                px = row.get(a.symbol)
                if px is not None and px == px and px <= p.cost_basis * (1 - stop_loss) and data.can_trade(a):
                    order_target(a, 0)
                    state["stopped"].add(a)
                    state["stops"] += 1

    perf = run_algorithm(start=pd.Timestamp(start), end=pd.Timestamp(end), initialize=initialize,
                         handle_data=handle_data, capital_base=capital, bundle=bundle,
                         data_frequency="daily")
    r = perf["returns"].copy()
    r.index = pd.DatetimeIndex(r.index).tz_localize(None).normalize()
    turn = sum(state["turn"]) / len(state["turn"]) if state["turn"] else 0.0
    notes = state["notes"] + ([f"sold back to 100% invested {state['deleverage']} times after overnight price moves"]
                              if state["deleverage"] else [])
    return RunResult(r, turn, state["stops"], state["rebal"], notes)


def bundle_dir() -> Path:
    return ZIPLINE_ROOT
