import math

import numpy as np
import pandas as pd
import pytest

from trader.chamber import metrics as M


def series(vals, start="2020-01-01"):
    return pd.Series(vals, index=pd.bdate_range(start, periods=len(vals)), dtype=float)


def test_total_return_and_drawdown():
    r = series([0.1, -0.5, 0.2])
    assert M.total_return(r) == pytest.approx(1.1 * 0.5 * 1.2 - 1)
    assert M.max_drawdown(r) == pytest.approx(-0.5)
    assert M.max_drawdown(series([0.01] * 5)) == 0


def test_sharpe_known_value():
    r = series([0.01, -0.01] * 50)
    assert M.sharpe(r) == pytest.approx(0.0)
    r = series([0.02, 0.0] * 50)
    assert M.sharpe(r) == pytest.approx(0.01 / r.std() * math.sqrt(252))


def test_cagr_one_year():
    r = series([0.0] * 251 + [0.1])
    assert M.cagr(r) == pytest.approx(0.1)


def test_expected_max_sharpe_grows_with_trials():
    v = 0.01 ** 2
    vals = [M.expected_max_sharpe(n, v) for n in (1, 2, 10, 100, 1000)]
    assert vals[0] == 0 and all(a < b for a, b in zip(vals, vals[1:]))


def test_expected_max_matches_simulation():
    # best of N pure-noise Sharpe estimates should be close to the formula
    rng = np.random.default_rng(0)
    T, N = 500, 50
    best = []
    for _ in range(200):
        x = rng.normal(0, 1, (N, T))
        best.append((x.mean(1) / x.std(1, ddof=1)).max())
    assert M.expected_max_sharpe(N, 1 / (T - 1)) == pytest.approx(np.mean(best), rel=0.1)


def test_deflated_sharpe_penalises_many_trials():
    rng = np.random.default_rng(1)
    r = pd.Series(rng.normal(0.0004, 0.01, 1500))
    one = M.deflated_sharpe(r, 1)
    many = M.deflated_sharpe(r, 500)
    assert one > many
    assert one == pytest.approx(M.probabilistic_sharpe(r), abs=1e-12)


def test_deflated_sharpe_noise_is_not_significant():
    rng = np.random.default_rng(2)
    r = pd.Series(rng.normal(0, 0.01, 2000))
    assert M.deflated_sharpe(r, 20) < 0.95


def test_deflated_sharpe_strong_edge_passes():
    rng = np.random.default_rng(3)
    r = pd.Series(rng.normal(0.002, 0.01, 2000))  # daily Sharpe 0.2: enormous
    assert M.deflated_sharpe(r, 100) > 0.99


def test_trial_spread_makes_it_stricter():
    rng = np.random.default_rng(4)
    r = pd.Series(rng.normal(0.0005, 0.01, 1500))
    assert M.deflated_sharpe(r, 30, [0.0, 0.2, -0.2, 0.1]) <= M.deflated_sharpe(r, 30)


def test_yearly_excess_and_triggers():
    idx = pd.bdate_range("2019-01-01", "2020-12-31")
    r = pd.Series(0.001, index=idx)
    b = pd.Series(0.0, index=idx)
    y = M.yearly_excess(r, b)
    assert list(y["year"]) == [2019, 2020] and (y["excess"] > 0).all()
    t = M.stress_triggers(series([-0.03, 0.0, -0.1, -0.1]), 0.02, 0.15)
    assert t["daily_loss_pauses"] == 3 and t["kill_switch_first_day"] is not None
