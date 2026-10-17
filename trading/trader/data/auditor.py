"""The data auditor. Runs on every download. Writes a plain report and an exclusion list.

It never fixes data. A bad stock-date gets excluded (skipped) and logged.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

import pandas as pd
import pandas_market_calendars as mcal
import pandera.pandas as pa

from .store import DATA

REPORT = DATA / "AUDIT_REPORT.md"
JUMP = 0.5      # a daily move above 50% gets looked at
SPIKE = 0.4     # ...and is excluded as bad data if it reverses by 40%+ the next day
GAP_DAYS = 5    # more than 5 missing trading days in a row is a gap

PRICE_SCHEMA = pa.DataFrameSchema({
    "symbol": pa.Column(str),
    "date": pa.Column("datetime64[ns]"),
    "adj_close": pa.Column(float, pa.Check.gt(0)),
    "adj_open": pa.Column(float, pa.Check.gt(0), nullable=True),
    "volume": pa.Column(float, pa.Check.ge(0), nullable=True),
}, unique=["symbol", "date"], strict=False, coerce=True)

FUND_SCHEMA = pa.DataFrameSchema({
    "symbol": pa.Column(str),
    "period_end": pa.Column("datetime64[ns]"),
    "filing_date": pa.Column("datetime64[ns]"),
}, strict=False, coerce=True)


@dataclass
class AuditResult:
    lines: list[str] = field(default_factory=list)
    exclusions: list[dict] = field(default_factory=list)   # symbol, start, end, reason
    fatal: bool = False

    def say(self, s: str) -> None:
        self.lines.append(s)

    def exclude(self, symbol, start, end, reason) -> None:
        self.exclusions.append({"symbol": symbol, "start": pd.Timestamp(start),
                                "end": pd.Timestamp(end), "reason": reason})

    def exclusion_frame(self) -> pd.DataFrame:
        return pd.DataFrame(self.exclusions, columns=["symbol", "start", "end", "reason"])


def _schema_rows(df: pd.DataFrame, schema: pa.DataFrameSchema, res: AuditResult, what: str) -> pd.DataFrame:
    """Drop rows failing the schema, and say how many."""
    try:
        return schema.validate(df, lazy=True)
    except pa.errors.SchemaErrors as e:
        bad = e.failure_cases["index"].dropna().unique()
        res.say(f"- {what}: {len(bad)} rows failed basic checks (bad or duplicate values) and were dropped.")
        return schema.validate(df.drop(index=bad, errors="ignore"), lazy=False)


def audit_prices(px: pd.DataFrame, today: date, res: AuditResult) -> pd.DataFrame:
    n0 = len(px)
    future = px["date"] > pd.Timestamp(today)
    if future.any():
        res.say(f"- Prices: {int(future.sum())} rows dated in the future. Dropped.")
        px = px[~future]
    px = _schema_rows(px.reset_index(drop=True), PRICE_SCHEMA, res, "Prices")
    cal = mcal.get_calendar("XNYS")
    jumps = gaps = 0
    for sym, g in px.groupby("symbol"):
        g = g.sort_values("date")
        r = g["adj_close"].pct_change()
        nxt = r.shift(-1)
        spike = (r.abs() > JUMP) & ((1 + r) * (1 + nxt) - 1).abs().lt(r.abs() - SPIKE)
        for d in g.loc[spike, "date"]:
            res.exclude(sym, d, d, f"price spike of over {JUMP:.0%} that reversed next day")
        jumps += int((r.abs() > JUMP).sum())
        sessions = cal.valid_days(g["date"].iloc[0], g["date"].iloc[-1]).tz_localize(None)
        have = pd.DatetimeIndex(g["date"])
        missing = sessions.difference(have)
        if len(missing):
            pos = sessions.get_indexer(missing)
            runs = (pd.Series(pos).diff() != 1).cumsum()
            for _, run in pd.Series(missing).groupby(runs.values):
                if len(run) > GAP_DAYS:
                    gaps += 1
                    res.exclude(sym, run.iloc[0], run.iloc[-1], f"{len(run)}-day gap in prices")
    res.say(f"- Prices: {len(px):,} rows kept of {n0:,}, {px['symbol'].nunique()} symbols, "
            f"{jumps} daily moves over {JUMP:.0%} (spikes that reversed were excluded), {gaps} long gaps excluded.")
    return px


def audit_coverage(px: pd.DataFrame, spells: pd.DataFrame, start: str, res: AuditResult) -> None:
    """The survivorship check: do we have prices for the names that LEFT the index?"""
    spells = spells[(spells["end"].isna()) | (spells["end"] > pd.Timestamp(start))]
    span = px.groupby("symbol")["date"].agg(["min", "max"])
    left = spells[spells["end"].notna()]
    stay = spells[spells["end"].isna()]

    def covered(sp):
        ok = 0
        for t, s, e in zip(sp["ticker"], sp["start"], sp["end"]):
            s = max(s, pd.Timestamp(start))
            if t in span.index and span.at[t, "min"] <= s + pd.Timedelta(days=10):
                ok += 1
            else:
                e = e if pd.notna(e) else pd.Timestamp.today()
                why = "no prices downloaded" if t not in span.index else \
                    f"prices only start {span.at[t, 'min'].date()} (ticker reused or history cut off)"
                first = span.at[t, "min"] if t in span.index else e
                res.exclude(t, s, min(e, first), f"index member but {why}")
        return ok

    ok_left, ok_stay = covered(left), covered(stay)
    pct_left = ok_left / max(1, len(left))
    pct_stay = ok_stay / max(1, len(stay))
    res.say(f"- Survivorship: prices cover {ok_left}/{len(left)} ({pct_left:.0%}) of index spells that ENDED "
            f"(removed, delisted, bankrupt, acquired) and {ok_stay}/{len(stay)} ({pct_stay:.0%}) of current members.")
    if pct_left < 0.9:
        res.say(f"  - BAD: {1 - pct_left:.0%} of departed names are missing. Backtests on this data will look "
                "better than reality (survivorship bias). Results must say so.")
        res.fatal = pct_left < 0.5


def audit_fundamentals(fd: pd.DataFrame, today: date, res: AuditResult) -> pd.DataFrame:
    if fd.empty:
        res.say("- Fundamentals: none downloaded yet.")
        return fd
    n0 = len(fd)
    fd = fd.dropna(subset=["filing_date", "period_end"])
    fd = _schema_rows(fd.reset_index(drop=True), FUND_SCHEMA, res, "Fundamentals")
    bad = (fd["filing_date"] < fd["period_end"]) | (fd["filing_date"] > pd.Timestamp(today))
    late = (fd["filing_date"] - fd["period_end"]).dt.days > 180
    fd = fd[~bad]
    res.say(f"- Fundamentals: {len(fd):,} of {n0:,} quarterly rows usable; {int(bad.sum())} dropped for "
            f"impossible filing dates; {int(late.sum())} filed 180+ days after quarter end (kept, flagged).")
    return fd


def audit_insider(ins: pd.DataFrame, profiles: pd.DataFrame, today: date, res: AuditResult) -> pd.DataFrame:
    if ins.empty:
        res.say("- Insider: none downloaded yet.")
        return ins
    n0 = len(ins)
    bad = ins["filing_date"].isna() | (ins["filing_date"] > pd.Timestamp(today)) | \
        (ins["trans_date"] > ins["filing_date"])
    ins = ins[~bad]
    # EDGAR trap: a Form 4 whose ticker doesn't match the issuer's CIK (wrong company).
    mism = 0
    if not profiles.empty and profiles["cik"].notna().any():
        cik_of = profiles.dropna(subset=["cik"]).assign(cik=lambda d: pd.to_numeric(d["cik"], errors="coerce"))
        cik_of = dict(zip(cik_of["symbol"], cik_of["cik"]))
        known = ins["ticker"].map(cik_of)
        wrong = known.notna() & (known != ins["issuer_cik"])
        mism = int(wrong.sum())
        ins = ins[~wrong]
    multi = ins.groupby("issuer_cik")["ticker"].nunique()
    res.say(f"- Insider: {len(ins):,} of {n0:,} purchase rows usable; {int(bad.sum())} had impossible dates; "
            f"{mism} named a ticker that belongs to a different company (dropped); "
            f"{int((multi > 1).sum())} companies filed under more than one ticker (normal after renames).")
    return ins


def write_report(res: AuditResult, path: Path = REPORT, title_extra: str = "") -> Path:
    head = [f"# Data audit {date.today().isoformat()} {title_extra}".rstrip(), ""]
    verdict = "RED: data not fit for backtests" if res.fatal else "GREEN: usable, with the caveats below"
    body = head + [f"**{verdict}**", ""] + res.lines + [
        "", f"{len(res.exclusions)} stock-date ranges excluded (skipped, never filled in). "
        "Full list: data/cache/tables/exclusions.parquet"]
    path.write_text("\n".join(body) + "\n")
    return path
