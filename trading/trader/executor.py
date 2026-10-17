"""Executor: places Alpaca PAPER orders for an ApprovedPlan. It cannot change rules.

Refuses to run unless ALPACA_PAPER=true. Uses notional (dollar) market orders,
so $100 works with fractional shares. Orders sent after the close queue for the
next open. Any broker error stops the run: no partial guessing.
"""
from __future__ import annotations

import os
from dataclasses import dataclass

from .logbook import Logbook
from .risk_officer import ApprovedPlan, is_genuine

MIN_ORDER = 1.00  # Alpaca's minimum notional for fractional orders


class ExecutorRefused(RuntimeError):
    pass


@dataclass(frozen=True)
class Order:
    symbol: str
    side: str        # "buy" or "sell"
    notional: float  # dollars


def plan_orders(plan: ApprovedPlan, equity: float, holdings: dict[str, float]) -> list[Order]:
    """Dollar orders that move current holdings (symbol -> $ value) to the plan's targets.
    Sells first, so buys never need borrowed cash."""
    if not is_genuine(plan):
        raise ExecutorRefused("not an ApprovedPlan from the risk officer")
    sells, buys = [], []
    for sym in sorted(set(plan.targets) | set(holdings)):
        diff = plan.targets.get(sym, 0.0) * equity - holdings.get(sym, 0.0)
        if abs(diff) < MIN_ORDER:
            continue
        (buys if diff > 0 else sells).append(Order(sym, "buy" if diff > 0 else "sell", round(abs(diff), 2)))
    return sells + buys


class Executor:
    def __init__(self, log: Logbook | None = None, client=None):
        if os.environ.get("ALPACA_PAPER", "").lower() != "true":
            raise ExecutorRefused("ALPACA_PAPER is not 'true'. Real money is not allowed.")
        self.log = log or Logbook()
        self.client = client or self._connect()

    @staticmethod
    def _connect():
        from alpaca.trading.client import TradingClient
        key, secret = os.environ.get("ALPACA_API_KEY"), os.environ.get("ALPACA_SECRET_KEY")
        if not key or not secret:
            raise ExecutorRefused("Alpaca keys missing from .env")
        return TradingClient(key, secret, paper=True)  # paper=True is hard-coded on purpose

    def account(self) -> tuple[float, dict[str, float]]:
        acct = self.client.get_account()
        pos = {p.symbol: float(p.market_value) for p in self.client.get_all_positions()}
        return float(acct.equity), pos

    def execute(self, plan: ApprovedPlan, dry_run: bool = False) -> list[Order]:
        if not is_genuine(plan):
            raise ExecutorRefused("not an ApprovedPlan from the risk officer")
        equity, holdings = self.account()
        orders = plan_orders(plan, equity, holdings)
        for o in orders:
            self.log.record("executor", f"{'DRY ' if dry_run else ''}{o.side}", "; ".join(plan.reasons) or "rebalance",
                            symbol=o.symbol, notional=o.notional, plan_day=str(plan.asof))
            if dry_run:
                continue
            from alpaca.trading.enums import OrderSide, TimeInForce
            from alpaca.trading.requests import MarketOrderRequest
            try:
                if o.side == "sell" and o.notional >= holdings.get(o.symbol, 0) - MIN_ORDER:
                    self.client.close_position(o.symbol)  # full exit: avoid dust
                else:
                    self.client.submit_order(MarketOrderRequest(
                        symbol=o.symbol, notional=o.notional, time_in_force=TimeInForce.DAY,
                        side=OrderSide.BUY if o.side == "buy" else OrderSide.SELL))
            except Exception as e:
                self.log.record("executor", "halt_on_error", f"broker error, stopping: {e}", symbol=o.symbol)
                raise
        return orders
