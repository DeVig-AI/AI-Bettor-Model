"""Cross-check the membership file against Wikipedia's "Selected changes to the list of
S&P 500 components". Mismatches are logged for a person to look at; neither side is picked."""
from __future__ import annotations

import io

import pandas as pd

from . import membership

URL = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
TOLERANCE_DAYS = 7


def parse_changes(html: str) -> pd.DataFrame:
    for t in pd.read_html(io.StringIO(html)):
        cols = [" ".join(str(x) for x in (c if isinstance(c, tuple) else (c,))).lower() for c in t.columns]
        if any("added" in c for c in cols) and any("removed" in c for c in cols):
            t.columns = cols
            date_col = next(c for c in cols if "date" in c)
            add_col = next(c for c in cols if "added" in c and ("ticker" in c or "symbol" in c))
            rem_col = next(c for c in cols if "removed" in c and ("ticker" in c or "symbol" in c))
            out = pd.DataFrame({"date": pd.to_datetime(t[date_col], errors="coerce", format="mixed"),
                                "added": t[add_col], "removed": t[rem_col]})
            for c in ("added", "removed"):
                out[c] = out[c].astype(str).str.strip().str.upper().replace({"NAN": None, "": None})
            return out.dropna(subset=["date"]).reset_index(drop=True)
    raise ValueError("no 'Selected changes' table found on the page")


def cross_check(changes: pd.DataFrame, member_table: pd.DataFrame | None = None) -> list[str]:
    spells = membership.intervals(member_table)
    tol = pd.Timedelta(days=TOLERANCE_DAYS)
    out = []
    for d, add, rem in zip(changes["date"], changes["added"], changes["removed"]):
        if add:
            sp = spells[spells["ticker"] == add]
            if not ((sp["start"] - d).abs() <= tol).any():
                near = sp["start"].iloc[(sp["start"] - d).abs().argmin()].date() if len(sp) else "never"
                out.append(f"{d.date()} added {add}: membership file starts it {near}")
        if rem:
            sp = spells[spells["ticker"] == rem].dropna(subset=["end"])
            if not ((sp["end"] - d).abs() <= tol).any():
                near = sp["end"].iloc[(sp["end"] - d).abs().argmin()].date() if len(sp) else "never"
                out.append(f"{d.date()} removed {rem}: membership file ends it {near}")
    return out
