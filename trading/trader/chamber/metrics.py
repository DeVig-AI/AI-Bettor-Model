"""Performance numbers the pass bar is judged on. Our own small functions, tested,
so a library update can never quietly move the bar.
"""
from __future__ import annotations

import math
from statistics import NormalDist

import numpy as np
import pandas as pd

DAYS = 252
EULER = 0.5772156649015329
_N = NormalDist()


def total_return(r: pd.Series) -> float:
    return float((1 + r.fillna(0)).prod() - 1)


def cagr(r: pd.Series) -> float:
    years = len(r) / DAYS
    return float((1 + total_return(r)) ** (1 / years) - 1) if years > 0 else float("nan")


def sharpe(r: pd.Series) -> float:
    """Annualized, risk-free rate 0 (same for strategy and benchmark, so the comparison is fair)."""
    sd = r.std()
    return float(r.mean() / sd * math.sqrt(DAYS)) if sd and sd > 0 else float("nan")


def max_drawdown(r: pd.Series) -> float:
    """As a negative number, e.g. -0.55 for a 55% fall from the peak."""
    eq = (1 + r.fillna(0)).cumprod()
    return float((eq / eq.cummax() - 1).min()) if len(eq) else 0.0


def window(r: pd.Series, start, end) -> pd.Series:
    return r.loc[pd.Timestamp(start):pd.Timestamp(end)]


def summary(r: pd.Series) -> dict:
    return {"total_return": total_return(r), "cagr": cagr(r), "sharpe": sharpe(r),
            "max_drawdown": max_drawdown(r), "vol": float(r.std() * math.sqrt(DAYS)), "days": int(len(r))}


def yearly_excess(r: pd.Series, bench: pd.Series) -> pd.DataFrame:
    """Walk-forward view: each calendar year is its own out-of-sample fold."""
    rows = []
    for y in sorted(set(r.index.year)):
        a, b = r[r.index.year == y], bench[bench.index.year == y]
        rows.append({"year": y, "strategy": total_return(a), "benchmark": total_return(b),
                     "excess": total_return(a) - total_return(b)})
    return pd.DataFrame(rows)


def stress_triggers(r: pd.Series, daily_loss: float, kill_dd: float) -> dict:
    """How often the live daily-loss pause and kill switch would have fired."""
    eq = (1 + r.fillna(0)).cumprod()
    dd = eq / eq.cummax() - 1
    first_kill = dd[dd <= -kill_dd].index.min()
    return {"daily_loss_pauses": int((r <= -daily_loss).sum()),
            "kill_switch_first_day": None if pd.isna(first_kill) else str(first_kill.date())}


# --- deflated Sharpe ratio (Bailey & Lopez de Prado, 2014) -------------------

def _moments(r: pd.Series) -> tuple[float, float, float, int]:
    x = r.dropna().to_numpy()
    sr = x.mean() / x.std(ddof=1)
    z = (x - x.mean()) / x.std(ddof=0)
    return float(sr), float((z ** 3).mean()), float((z ** 4).mean()), len(x)


def expected_max_sharpe(n_trials: int, var_sr: float) -> float:
    """Sharpe (per period) the best of n useless strategies would show by luck."""
    if n_trials <= 1:
        return 0.0
    a = _N.inv_cdf(1 - 1 / n_trials)
    b = _N.inv_cdf(1 - 1 / (n_trials * math.e))
    return math.sqrt(var_sr) * ((1 - EULER) * a + EULER * b)


def probabilistic_sharpe(r: pd.Series, sr_benchmark: float = 0.0) -> float:
    sr, skew, kurt, t = _moments(r)
    denom = 1 - skew * sr + (kurt - 1) / 4 * sr ** 2
    if t < 3 or denom <= 0:
        return float("nan")
    return _N.cdf((sr - sr_benchmark) * math.sqrt(t - 1) / math.sqrt(denom))


def deflated_sharpe(r: pd.Series, n_trials: int, trial_sharpes: list[float] | None = None) -> float:
    """Probability the true Sharpe is above zero after accounting for n_trials tries.

    `r` should be ACTIVE returns (strategy minus benchmark) so it tests the edge,
    not just "stocks went up". Variance of trial Sharpes: the larger of the
    observed spread across trials and the sampling variance, to stay conservative.
    """
    sr, skew, kurt, t = _moments(r)
    sampling_var = (1 - skew * sr + (kurt - 1) / 4 * sr ** 2) / (t - 1)
    var = sampling_var
    if trial_sharpes and len(trial_sharpes) >= 2:
        var = max(var, float(np.var(trial_sharpes, ddof=1)))
    return probabilistic_sharpe(r, expected_max_sharpe(n_trials, var))
