"""Point-in-time S&P 500 membership from fja05680/sp500 (MIT license, back to 1996).

A row lists the members on that date; the list holds until the next row.
"""
from __future__ import annotations

from functools import lru_cache

import pandas as pd

from .store import REFERENCE

MEMBERSHIP_CSV = REFERENCE / "sp500_membership.csv"


@lru_cache(maxsize=1)
def load(path: str = str(MEMBERSHIP_CSV)) -> pd.DataFrame:
    df = pd.read_csv(path, parse_dates=["date"]).sort_values("date")
    df["tickers"] = df["tickers"].map(lambda s: frozenset(t.strip() for t in s.split(",") if t.strip()))
    return df.reset_index(drop=True)


def members_on(day, table: pd.DataFrame | None = None) -> frozenset[str]:
    t = load() if table is None else table
    idx = t["date"].searchsorted(pd.Timestamp(day), side="right") - 1
    if idx < 0:
        return frozenset()
    return t["tickers"].iloc[idx]


def all_tickers_since(start, table: pd.DataFrame | None = None) -> list[str]:
    t = load() if table is None else table
    first = members_on(start, t)
    later = t[t["date"] > pd.Timestamp(start)]["tickers"]
    out = set(first)
    for s in later:
        out |= s
    return sorted(out)


def intervals(table: pd.DataFrame | None = None) -> pd.DataFrame:
    """One row per (ticker, continuous membership spell): ticker, start, end (end exclusive, NaT = still in)."""
    t = load() if table is None else table
    rows, open_ = [], {}
    prev: frozenset[str] = frozenset()
    for day, tick in zip(t["date"], t["tickers"]):
        for s in tick - prev:
            open_[s] = day
        for s in prev - tick:
            rows.append((s, open_.pop(s), day))
        prev = tick
    rows += [(s, d, pd.NaT) for s, d in open_.items()]
    return pd.DataFrame(rows, columns=["ticker", "start", "end"]).sort_values(["ticker", "start"])


def to_fmp(ticker: str) -> str:
    return ticker.replace(".", "-")
