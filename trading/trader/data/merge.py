"""Stitch several price sources into one series per stock (DATA_HANDOFF merge rules).

* Each date takes the highest-priority source that has it; the row keeps that source's tag.
* Adjusted prices are spliced by RETURNS, not by level: every source anchors its
  adjustments at a different date, so pasting levels would create fake jumps at the seams.
* Where two sources overlap, their closes are compared; a gap above 1% is logged.
* A missing day stays missing. Nothing is filled in.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .sources import COLUMNS

# Most complete adjustment history first: WIKI carries explicit split and dividend
# columns; Tiingo and Alpaca adjust for both; Stooq publishes no raw prices.
PRIORITY = ["wiki", "tiingo", "alpaca", "fmp", "stooq"]
CONFLICT = 0.01


def compare(a: pd.DataFrame, b: pd.DataFrame) -> pd.DataFrame:
    """Days where two sources disagree by more than 1% for one symbol.

    Raw closes are compared directly when both have them (raw is raw, whatever the
    anchor). Otherwise adjusted closes are compared after removing their ratio's
    20-day rolling median, so different adjustment anchors don't count as conflicts.
    """
    m = a.merge(b, on="date", suffixes=("_a", "_b"))
    if m.empty:
        return m.iloc[:0]
    raw = m["close_a"].notna() & m["close_b"].notna()
    diff = pd.Series(np.nan, index=m.index)
    diff[raw] = (m.loc[raw, "close_a"] / m.loc[raw, "close_b"] - 1).abs()
    ratio = m["adj_close_a"] / m["adj_close_b"]
    base = ratio.rolling(20, min_periods=5, center=True).median()
    diff[~raw] = (ratio[~raw] / base[~raw] - 1).abs()
    bad = m[diff > CONFLICT]
    return pd.DataFrame({"date": bad["date"], "source_a": bad["source_a"], "source_b": bad["source_b"],
                         "diff": diff[diff > CONFLICT].values,
                         "how": np.where(raw[diff > CONFLICT], "raw close", "adjusted close")})


def merge_symbol(rows: pd.DataFrame, priority=PRIORITY) -> tuple[pd.DataFrame, pd.DataFrame, list[str]]:
    """rows: all sources for ONE symbol. Returns (merged rows, conflicts, notes)."""
    sym = rows["symbol"].iloc[0]
    by = {s: g.drop_duplicates("date").set_index("date").sort_index() for s, g in rows.groupby("source")}
    order = [s for s in priority if s in by] + sorted(set(by) - set(priority))
    conflicts = []
    for i, a in enumerate(order):
        for b in order[i + 1:]:
            c = compare(by[a].reset_index(), by[b].reset_index())
            if len(c):
                conflicts.append(c.assign(symbol=sym))
    dates = sorted(set().union(*[set(g.index) for g in by.values()]))
    pick = {d: next(s for s in order if d in by[s].index) for d in dates}

    notes, out = [], []
    level = None
    prev_d, prev_s = None, None
    for d in dates:
        s = pick[d]
        row = by[s].loc[d]
        if level is None:
            scale = 1.0
        elif s == prev_s:
            scale = level / by[s].at[prev_d, "adj_close"]
        elif prev_d in by[s].index:           # new source also has yesterday: use its own return
            scale = level / by[s].at[prev_d, "adj_close"]
        elif d in by[prev_s].index:           # old source has today: carry its return across the seam
            scale = (level * by[prev_s].at[d, "adj_close"] / by[prev_s].at[prev_d, "adj_close"]) / row["adj_close"]
        else:
            # no source covers both days: the return across this seam is unknown
            scale = level / row["adj_close"]
            notes.append(f"{sym} {d.date()}: switched {prev_s}->{s} with no overlapping day; return across "
                         "the seam set to 0 and the days around it excluded")
        adj = {k: row[k] * scale for k in ("adj_open", "adj_high", "adj_low", "adj_close")}
        level = adj["adj_close"]
        out.append({"symbol": sym, "date": d, "open": row["open"], "high": row["high"], "low": row["low"],
                    "close": row["close"], **adj, "volume": row["volume"], "source": s})
        prev_d, prev_s = d, s
    merged = pd.DataFrame(out, columns=COLUMNS)
    return merged, (pd.concat(conflicts, ignore_index=True) if conflicts else pd.DataFrame()), notes


def merge_all(frames: list[pd.DataFrame]) -> tuple[pd.DataFrame, pd.DataFrame, list[str]]:
    allrows = pd.concat([f for f in frames if len(f)], ignore_index=True) if any(len(f) for f in frames) \
        else pd.DataFrame(columns=COLUMNS)
    merged, conflicts, notes = [], [], []
    for _, g in allrows.groupby("symbol"):
        m, c, n = merge_symbol(g)
        merged.append(m)
        if len(c):
            conflicts.append(c)
        notes += n
    return (pd.concat(merged, ignore_index=True) if merged else pd.DataFrame(columns=COLUMNS),
            pd.concat(conflicts, ignore_index=True) if conflicts else pd.DataFrame(),
            notes)


def seam_exclusions(notes: list[str]) -> list[dict]:
    """Exclude 5 days either side of a seam with no overlap (its return is unknown)."""
    out = []
    for n in notes:
        if "no overlapping day" in n:
            sym, day = n.split(" ")[0], pd.Timestamp(n.split(" ")[1].rstrip(":"))
            out.append({"symbol": sym, "start": day - pd.Timedelta(days=7), "end": day + pd.Timedelta(days=7),
                        "reason": "source switch with no overlapping day"})
    return out
