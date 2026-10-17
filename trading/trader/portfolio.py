"""Portfolio build: long-only, equal weight, top 20% by signal, then constitution limits.

The same `apply_limits` is used by the chamber and the live risk officer's rules,
so a backtest can't quietly run under looser limits than live trading.
"""
from __future__ import annotations

import math

import pandas as pd

TOP_FRACTION = 0.20


def top_fraction(scores: pd.Series, eligible: int, frac: float = TOP_FRACTION) -> list[str]:
    """Top `frac` of the eligible universe. Ties broken by ticker so runs are repeatable.

    Only positive-information scores count; for insider buying most stocks have no
    score, so the portfolio can hold fewer names than 20% of the universe.
    """
    n = math.ceil(frac * eligible)
    if n == 0 or scores.empty:
        return []
    s = scores.dropna()
    order = sorted(s.index, key=lambda k: (-s[k], k))
    return order[:n]


def equal_weight(names: list[str]) -> dict[str, float]:
    return {s: 1.0 / len(names) for s in names} if names else {}


def apply_limits(weights: dict[str, float], sectors: dict[str, str],
                 stock_cap: float, sector_cap: float) -> tuple[dict[str, float], list[str]]:
    """Drop names with no sector, clip stocks, scale sectors down. Excess goes to cash."""
    notes = []
    w = {}
    for s, v in weights.items():
        if not sectors.get(s):
            notes.append(f"{s}: skipped, no sector")
        else:
            w[s] = min(v, stock_cap)
    by = {}
    for s, v in w.items():
        by[sectors[s]] = by.get(sectors[s], 0.0) + v
    for sec, tot in by.items():
        if tot > sector_cap:
            for s in w:
                if sectors[s] == sec:
                    w[s] *= sector_cap / tot
            notes.append(f"sector {sec} scaled {tot:.0%} -> {sector_cap:.0%}")
    return w, notes
