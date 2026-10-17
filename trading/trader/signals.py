"""The four first signals. Each takes data known on `day` (after the close) and returns
a score per stock; higher = more wanted. A stock with missing or bad data gets no
score (skipped) and the reason goes to `skipped`.

Definitions are fixed by HANDOFF section 6. Do not tune them.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

MOM_LOOKBACK, MOM_SKIP = 252, 21     # 12 months, skipping the most recent month
VOL_LOOKBACK, VOL_MIN_OBS = 252, 240
INSIDER_DAYS = 90
STALE_DAYS = 548   # 18 months


@dataclass
class Panel:
    """Everything the signals may look at, already cut so nothing is after `asof`."""
    adj_close: pd.DataFrame                 # dates x symbols
    close: pd.DataFrame                     # raw (unadjusted) close, dates x symbols
    excluded: pd.DataFrame                  # dates x symbols, True = bad data that day
    fundamentals: pd.DataFrame = field(default_factory=pd.DataFrame)
    insider: pd.DataFrame = field(default_factory=pd.DataFrame)

    def upto(self, day) -> "Panel":
        day = pd.Timestamp(day)
        f = self.fundamentals
        i = self.insider
        return Panel(self.adj_close.loc[:day], self.close.loc[:day], self.excluded.loc[:day],
                     f[f["available_date"] <= day] if len(f) else f,
                     i[i["filing_date"] <= day] if len(i) else i)


def _window_ok(p: Panel, syms, n: int) -> pd.Series:
    """True for symbols with no excluded day and no missing price in the last n rows."""
    win = p.adj_close[syms].iloc[-n:]
    bad = p.excluded.reindex(columns=syms, fill_value=False).iloc[-n:].any()
    return (len(win) >= n) & win.notna().all() & ~bad


def momentum(p: Panel, members, skipped: dict) -> pd.Series:
    syms = [s for s in members if s in p.adj_close]
    n = MOM_LOOKBACK + 1
    ok = _window_ok(p, syms, n) if len(p.adj_close) >= n else pd.Series(False, index=syms)
    px = p.adj_close[syms]
    score = px.iloc[-1 - MOM_SKIP] / px.iloc[-n] - 1 if len(px) >= n else pd.Series(np.nan, index=syms)
    _skip(skipped, "momentum", ok[~ok].index, "under 12 months of clean prices")
    return score[ok].dropna()


def low_volatility(p: Panel, members, skipped: dict) -> pd.Series:
    syms = [s for s in members if s in p.adj_close]
    rets = p.adj_close[syms].iloc[-(VOL_LOOKBACK + 1):].pct_change().iloc[1:]
    bad = p.excluded.reindex(columns=syms, fill_value=False).iloc[-VOL_LOOKBACK:].any()
    ok = (rets.notna().sum() >= VOL_MIN_OBS) & ~bad & p.adj_close[syms].iloc[-1].notna()
    _skip(skipped, "low_vol", ok[~ok].index, f"under {VOL_MIN_OBS} clean daily returns in the last year")
    return -rets.std()[ok]  # lower vol = higher score


def value(p: Panel, members, skipped: dict) -> pd.Series:
    """Average rank of earnings yield (annual net income / market cap) and book-to-market.

    Fundamentals are SEC 10-K facts in long form (field, period_end, value, available_date),
    already cut to what was filed by `day`. For each field the latest period is used, in its
    latest version filed by then (a restatement counts only from its own filing date).
    Market cap = shares from the filing x today's price, carried forward with the
    price-adjustment factor so a split after the filing doesn't distort it.
    """
    f = p.fundamentals
    if f.empty:
        _skip(skipped, "value", members, "no fundamentals")
        return pd.Series(dtype=float)
    day = p.adj_close.index[-1]
    ep, bm = {}, {}
    for sym, g in f[f["symbol"].isin(members)].groupby("symbol"):
        latest = {}
        for fld in ("net_income", "equity", "shares"):
            gf = g[g["field"] == fld]
            if gf.empty:
                continue
            last = gf[gf["period_end"] == gf["period_end"].max()].sort_values("available_date").iloc[-1]
            latest[fld] = last
        if "net_income" not in latest or "shares" not in latest:
            _skip(skipped, "value", [sym], "no annual earnings or share count filed yet")
            continue
        if (day - latest["net_income"]["period_end"]).days > STALE_DAYS:
            _skip(skipped, "value", [sym], "latest annual report is over 18 months old")
            continue
        sh = latest["shares"]
        try:
            filed = p.adj_close.index[p.adj_close.index.searchsorted(sh["available_date"]) - 1]
            f_then = p.adj_close.at[filed, sym] / p.close.at[filed, sym]
            mcap = p.adj_close.at[day, sym] * sh["value"] / f_then
        except (KeyError, IndexError, ZeroDivisionError):
            mcap = np.nan
        if not np.isfinite(mcap) or mcap <= 0 or p.excluded.get(sym, pd.Series(dtype=bool)).iloc[-1:].any():
            _skip(skipped, "value", [sym], "no market cap (missing raw price or shares)")
            continue
        ep[sym] = latest["net_income"]["value"] / mcap
        eq = latest.get("equity")
        if eq is not None and eq["value"] > 0:
            bm[sym] = eq["value"] / mcap
        else:
            _skip(skipped, "value", [sym], "book equity missing or negative")
    both = pd.DataFrame({"ep": pd.Series(ep, dtype=float), "bm": pd.Series(bm, dtype=float)}).dropna()
    return both.rank(pct=True).mean(axis=1)


def insider_buying(p: Panel, members, skipped: dict) -> pd.Series:
    """Distinct officers/directors with open-market buys filed in the last 90 days. Zero = no score."""
    i = p.insider
    if i.empty:
        return pd.Series(dtype=float)
    day = p.adj_close.index[-1]
    recent = i[(i["filing_date"] > day - pd.Timedelta(days=INSIDER_DAYS)) & i["ticker"].isin(members)]
    score = recent.groupby("ticker")["owner_cik"].nunique().astype(float)
    have_px = [s for s in score.index if s in p.adj_close and pd.notna(p.adj_close[s].iloc[-1])]
    return score[have_px]


SIGNALS = {"momentum": momentum, "value": value, "insider": insider_buying, "low_vol": low_volatility}


def _skip(skipped: dict, sig: str, syms, why: str) -> None:
    for s in syms:
        skipped.setdefault(sig, []).append((s, why))
