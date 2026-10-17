"""Coverage gate (DATA_HANDOFF section 3): what share of S&P 500 member-days have a usable price?
Above 5% missing, the data isn't trustworthy enough and the owner gets asked about the paid fallback."""
from __future__ import annotations

import pandas as pd
import pandas_market_calendars as mcal

MAX_MISSING = 0.05


def member_days(prices: pd.DataFrame, member_table: pd.DataFrame, start, end,
                exclusions: pd.DataFrame | None = None) -> dict:
    sessions = mcal.get_calendar("XNYS").valid_days(start, end).tz_localize(None)
    have = prices[prices["source"] != "delisting_rule"]
    pres = pd.DataFrame(True, index=pd.MultiIndex.from_frame(have[["date", "symbol"]]), columns=["x"])
    pres = pres[~pres.index.duplicated()]["x"].unstack("symbol").reindex(sessions).notna()
    if exclusions is not None and len(exclusions):
        for s, a, b in zip(exclusions["symbol"], exclusions["start"], exclusions["end"]):
            if s in pres.columns:
                pres.loc[pd.Timestamp(a):pd.Timestamp(b), s] = False
    t = member_table.sort_values("date").reset_index(drop=True)
    rows = []
    for i, (d, tickers) in enumerate(zip(t["date"], t["tickers"])):
        nxt = t["date"].iloc[i + 1] if i + 1 < len(t) else pd.Timestamp(end) + pd.Timedelta(days=1)
        days = sessions[(sessions >= max(d, pd.Timestamp(start))) & (sessions < nxt)]
        if len(days) == 0:
            continue
        sub = pres.reindex(index=days, columns=sorted(tickers), fill_value=False)
        for day, n in sub.sum(axis=1).items():
            rows.append((day, len(tickers), int(n)))
    df = pd.DataFrame(rows, columns=["date", "members", "priced"])
    total, priced = int(df["members"].sum()), int(df["priced"].sum())
    by_year = df.groupby(df["date"].dt.year)[["members", "priced"]].sum()
    by_year["missing"] = 1 - by_year["priced"] / by_year["members"]
    missing = 1 - priced / total if total else 1.0
    return {"member_days": total, "priced": priced, "missing": missing, "by_year": by_year,
            "passes": missing <= MAX_MISSING}
