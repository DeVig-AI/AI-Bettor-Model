"""What happened to a stock whose prices stop while we might hold it (DATA_HANDOFF delisting rule).

* acquired, deal price known -> final value = deal price
* acquired, deal price not known -> final value = last traded price (flagged for a manual check)
* bankrupt, or no explanation found -> final value = 0 (a -100% loss)

Each outcome becomes one extra price row tagged source="delisting_rule", the session after
the last real trade. Every case is listed in the audit report.
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd
import pandas_market_calendars as mcal

from .store import REFERENCE

OVERRIDES = REFERENCE / "delisting_outcomes.csv"   # ticker,last_day,outcome,deal_price,note
STILL_TRADING_DAYS = 10
AFTER_INDEX_DAYS = 35
FLOOR = 0.001  # Zipline can't store a price of exactly 0; this is a 99.99%+ loss


def find_exits(prices: pd.DataFrame, spells: pd.DataFrame, source_ends: dict[str, pd.Timestamp],
               data_end: pd.Timestamp) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Returns (exits needing an outcome, coverage gaps where only the SOURCE stopped)."""
    last = prices.sort_values("date").groupby("symbol").tail(1).set_index("symbol")
    exits, gaps = [], []
    for t, s, e in zip(spells["ticker"], spells["start"], spells["end"]):
        if t not in last.index:
            continue
        day, src = last.at[t, "date"], last.at[t, "source"]
        if day < s or day >= data_end - pd.Timedelta(days=STILL_TRADING_DAYS):
            continue
        spell_end = e if pd.notna(e) else data_end
        if day > spell_end + pd.Timedelta(days=AFTER_INDEX_DAYS):
            continue  # kept trading well after leaving the index; we'd have sold already
        frozen = source_ends.get(src)
        if frozen is not None and abs((day - frozen).days) <= STILL_TRADING_DAYS and frozen < data_end - pd.Timedelta(days=30):
            gaps.append({"symbol": t, "last_day": day, "source": src, "spell_end": spell_end})
            continue
        exits.append({"symbol": t, "last_day": day, "spell_end": spell_end})
    cols = ["symbol", "last_day", "spell_end"]
    ex = pd.DataFrame(exits, columns=cols).drop_duplicates(["symbol", "last_day"])
    return ex, pd.DataFrame(gaps, columns=["symbol", "last_day", "source", "spell_end"]).drop_duplicates()


def load_overrides(path: Path = OVERRIDES) -> pd.DataFrame:
    if not Path(path).exists():
        return pd.DataFrame(columns=["ticker", "last_day", "outcome", "deal_price", "note"])
    df = pd.read_csv(path, comment="#")
    df["ticker"] = df["ticker"].str.upper()
    df["last_day"] = pd.to_datetime(df["last_day"], errors="coerce")
    return df


def resolve(exits: pd.DataFrame, prices: pd.DataFrame, classify, overrides: pd.DataFrame) -> pd.DataFrame:
    """classify(symbol, last_day) -> (outcome, evidence). Adds outcome, ratio, rule, evidence."""
    out = []
    last_close = prices.sort_values("date").groupby("symbol").tail(1).set_index("symbol")["close"]
    for sym, day in zip(exits["symbol"], exits["last_day"]):
        ov = overrides[(overrides["ticker"] == sym) &
                       ((overrides["last_day"].isna()) | ((overrides["last_day"] - day).abs() <= pd.Timedelta(days=10)))]
        if len(ov):
            outcome, evidence = ov.iloc[0]["outcome"], f"manual: {ov.iloc[0].get('note', '')}"
            deal = ov.iloc[0].get("deal_price")
        else:
            outcome, evidence = classify(sym, day)
            deal = None
        raw = last_close.get(sym)
        if outcome == "acquired" and pd.notna(deal) and deal is not None and pd.notna(raw) and raw > 0:
            ratio, rule = float(deal) / float(raw), "acquired: deal price"
        elif outcome == "acquired":
            ratio, rule = 1.0, "acquired: last trade used, deal price not checked"
        else:
            ratio, rule = 0.0, f"{outcome}: -100%"
        out.append({"symbol": sym, "last_day": day, "outcome": outcome, "ratio": ratio, "rule": rule,
                    "evidence": evidence})
    return pd.DataFrame(out, columns=["symbol", "last_day", "outcome", "ratio", "rule", "evidence"])


def terminal_rows(resolved: pd.DataFrame, prices: pd.DataFrame) -> pd.DataFrame:
    if resolved.empty:
        return prices.iloc[:0]
    cal = mcal.get_calendar("XNYS")
    last = prices.sort_values("date").groupby("symbol").tail(1).set_index("symbol")
    rows = []
    for sym, day, ratio in zip(resolved["symbol"], resolved["last_day"], resolved["ratio"]):
        nxt = cal.valid_days(day + pd.Timedelta(days=1), day + pd.Timedelta(days=10)).tz_localize(None)[0]
        lr = last.loc[sym]
        adj = max(lr["adj_close"] * ratio, FLOOR)
        rows.append({"symbol": sym, "date": nxt, "open": float("nan"), "high": float("nan"),
                     "low": float("nan"), "close": lr["close"] * ratio if pd.notna(lr["close"]) else float("nan"),
                     "adj_open": adj, "adj_high": adj, "adj_low": adj, "adj_close": adj, "volume": 0.0,
                     "source": "delisting_rule"})
    return pd.DataFrame(rows, columns=prices.columns)
