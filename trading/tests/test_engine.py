"""The chamber engine on synthetic prices with answers we can work out by hand."""
import numpy as np
import pandas as pd
import pandas_market_calendars as mcal
import pytest

from trader.chamber import engine

DAYS = mcal.get_calendar("XNYS").valid_days("2019-01-02", "2019-12-31").tz_localize(None)


def frame(sym, prices, days=DAYS):
    p = np.asarray(prices, dtype=float)
    return pd.DataFrame({"symbol": sym, "date": days[:len(p)], "adj_open": p, "adj_high": p,
                         "adj_low": p, "adj_close": p, "close": p, "volume": 1e9})


@pytest.fixture(scope="module", autouse=True)
def zroot(tmp_path_factory):
    engine.ZIPLINE_ROOT = tmp_path_factory.mktemp("zipline")


@pytest.fixture(scope="module")
def prices():
    n = len(DAYS)
    grow = 100 * 1.001 ** np.arange(n)                                 # +0.1% a day
    flat = np.full(n, 50.0)
    jump = np.r_[np.full(100, 20.0), np.full(n - 100, 30.0)]            # +50% on day 100
    fall = 100 * 0.99 ** np.arange(n)                                   # -1% a day
    gone = 40 * 1.002 ** np.arange(120)                                 # delists after 120 days
    return pd.concat([frame("GRW", grow), frame("FLT", flat), frame("JMP", jump),
                      frame("FAL", fall), frame("GON", gone)], ignore_index=True)


def test_buy_and_hold_matches_hand_calc(prices):
    res = engine.run(prices, {DAYS[0]: {"GRW": 1.0}}, DAYS[0], DAYS[-1], 0.0015, None)
    # decided after day 0 close, bought at day 1 close, held to the end. Shares are sized
    # at day 0's price, so we hold ~0.1% too much for a day before selling back: tolerance 1e-3.
    expected = (1 - 0.0015) * 1.001 ** (len(DAYS) - 2) - 1
    got = (1 + res.returns).prod() - 1
    assert got == pytest.approx(expected, abs=1e-3)


def test_costs_charged_per_side(prices):
    a = engine.run(prices, {DAYS[0]: {"FLT": 1.0}, DAYS[50]: {}}, DAYS[0], DAYS[-1], 0.0015, None)
    b = engine.run(prices, {DAYS[0]: {"FLT": 1.0}, DAYS[50]: {}}, DAYS[0], DAYS[-1], 0.0030, None)
    ra, rb = (1 + a.returns).prod() - 1, (1 + b.returns).prod() - 1
    assert ra == pytest.approx(-2 * 0.0015, abs=2e-4)   # flat stock: lose exactly the round trip
    assert rb == pytest.approx(-2 * 0.0030, abs=2e-4)


def test_no_lookahead_on_jump(prices):
    # decision on day 99's close; the +50% jump is at day 100's close; we fill at day 100's close
    res = engine.run(prices, {DAYS[99]: {"JMP": 1.0}}, DAYS[90], DAYS[110], 0.0015, None)
    total = (1 + res.returns).prod() - 1
    assert -0.01 < total < 0   # only costs; the jump was not captured
    assert any("100% invested" in n for n in res.notes)  # sized at 20, filled at 30 -> sold back


def test_decision_before_jump_day_captures_it(prices):
    # control for the test above: decided on day 98, bought day 99, holds through the jump
    res = engine.run(prices, {DAYS[98]: {"JMP": 1.0}}, DAYS[90], DAYS[110], 0.0015, None)
    assert (1 + res.returns).prod() - 1 == pytest.approx(0.5 * (1 - 0.0015) - 0.0015, abs=2e-3)


def test_stop_loss_exits(prices):
    res = engine.run(prices, {DAYS[0]: {"FAL": 1.0}}, DAYS[0], DAYS[-1], 0.0015, 0.15)
    assert res.stop_losses == 1
    total = (1 + res.returns).prod() - 1
    assert -0.20 < total < -0.14  # out near -15%, not the full-year -90%


def test_delisted_stock_closed_at_last_price(prices):
    res = engine.run(prices, {DAYS[0]: {"GON": 0.5, "FLT": 0.5}}, DAYS[0], DAYS[-1], 0.0, None)
    total = (1 + res.returns).prod() - 1
    gon = 1.002 ** (119 - 1) - 1
    assert total == pytest.approx(0.5 * gon, abs=3e-3)
    assert len(res.returns) == len(DAYS)   # run continues after the delisting


def test_turnover_reported(prices):
    res = engine.run(prices, {DAYS[0]: {"GRW": 0.5, "FLT": 0.5}, DAYS[60]: {"GRW": 0.5, "JMP": 0.5}},
                     DAYS[0], DAYS[-1], 0.0015, None)
    assert res.rebalances == 2
    assert res.turnover == pytest.approx(0.5, abs=0.01)  # cash->100%: 0.5; swap half: 0.5
