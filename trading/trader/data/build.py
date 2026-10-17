"""Turn cached raw downloads into clean tables. Bad rows are dropped and counted, never fixed."""
from __future__ import annotations

import pandas as pd

from . import fmp as F
from .membership import to_fmp


def _num(df: pd.DataFrame, col: str) -> pd.Series:
    return pd.to_numeric(df[col], errors="coerce") if col in df else pd.Series(float("nan"), index=df.index)


def _first(df: pd.DataFrame, *names: str) -> pd.Series:
    for n in names:
        if n in df:
            return df[n]
    return pd.Series(pd.NA, index=df.index)


def prices(client: F.FMP, tickers: list[str]) -> pd.DataFrame:
    """Adjusted OHLCV (+ raw close when downloaded). One row per symbol-date."""
    out = []
    for t in tickers:
        adj = pd.DataFrame(F.rows(client.cached("historical-price-eod/dividend-adjusted", to_fmp(t))))
        if adj.empty:
            continue
        df = pd.DataFrame({
            "symbol": t,
            "date": pd.to_datetime(adj["date"], errors="coerce"),
            "adj_open": _num(adj, "adjOpen"), "adj_high": _num(adj, "adjHigh"),
            "adj_low": _num(adj, "adjLow"), "adj_close": _num(adj, "adjClose"),
            "volume": _num(adj, "volume"),
        })
        raw = pd.DataFrame(F.rows(client.cached("historical-price-eod/full", to_fmp(t))))
        if not raw.empty:
            r = pd.DataFrame({"date": pd.to_datetime(raw["date"], errors="coerce"), "close": _num(raw, "close")})
            df = df.merge(r.drop_duplicates("date"), on="date", how="left")
        else:
            df["close"] = float("nan")
        out.append(df)
    if not out:
        return pd.DataFrame(columns=["symbol", "date", "adj_open", "adj_high", "adj_low",
                                     "adj_close", "volume", "close"])
    return pd.concat(out, ignore_index=True).sort_values(["symbol", "date"])


def profiles(client: F.FMP, tickers: list[str]) -> pd.DataFrame:
    out = []
    for t in tickers:
        r = F.rows(client.cached("profile", to_fmp(t)))
        if r:
            p = r[0]
            out.append({"symbol": t, "sector": p.get("sector") or None, "cik": p.get("cik"),
                        "name": p.get("companyName"), "ipo_date": p.get("ipoDate")})
    return pd.DataFrame(out, columns=["symbol", "sector", "cik", "name", "ipo_date"])


def fundamentals(client: F.FMP, tickers: list[str]) -> pd.DataFrame:
    """Quarterly net income, equity, shares, keyed by the date the public could know them.

    available_date = filing date + 1 calendar day (a filing late in the day can't be traded on that day).
    """
    out = []
    for t in tickers:
        inc = pd.DataFrame(F.rows(client.cached("income-statement", to_fmp(t))))
        bal = pd.DataFrame(F.rows(client.cached("balance-sheet-statement", to_fmp(t))))
        if inc.empty:
            continue
        i = pd.DataFrame({
            "period_end": pd.to_datetime(inc["date"], errors="coerce"),
            "filing_date": pd.to_datetime(_first(inc, "filingDate", "fillingDate"), errors="coerce"),
            "net_income": _num(inc, "netIncome"),
            "shares": _num(inc, "weightedAverageShsOut"),
        })
        if not bal.empty:
            b = pd.DataFrame({
                "period_end": pd.to_datetime(bal["date"], errors="coerce"),
                "equity": _num(bal, "totalStockholdersEquity"),
            })
            i = i.merge(b.drop_duplicates("period_end"), on="period_end", how="left")
        else:
            i["equity"] = float("nan")
        i["symbol"] = t
        out.append(i)
    if not out:
        return pd.DataFrame(columns=["symbol", "period_end", "filing_date", "available_date",
                                     "net_income", "shares", "equity"])
    df = pd.concat(out, ignore_index=True)
    df["available_date"] = df["filing_date"] + pd.Timedelta(days=1)
    return df.sort_values(["symbol", "available_date"])
