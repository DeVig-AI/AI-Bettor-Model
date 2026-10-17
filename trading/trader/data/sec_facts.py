"""SEC EDGAR: tickers -> CIK, sectors (from SIC codes), fundamentals (XBRL companyfacts),
and how a company left (from its filing history). All free; SEC asks for <= 10 requests/second
and a User-Agent with contact info.

Fundamentals rules (DATA_HANDOFF section 2):
* annual reports only: 10-K and 10-K/A
* flow items (earnings) only for ~365-day periods
* an ordered list of tag synonyms per field, because companies rename tags
* every value is stamped with the date it was FIRST filed; a later restatement is kept as
  its own row, flagged, usable only from its own filing date
"""
from __future__ import annotations

import pandas as pd

from .http import Fetcher, Limit, json_of
from .store import RAW

FACTS = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json"
SUBMISSIONS = "https://data.sec.gov/submissions/CIK{cik:010d}.json"
SUBMISSIONS_PAGE = "https://data.sec.gov/submissions/{name}"
TICKERS = "https://www.sec.gov/files/company_tickers.json"

FIELDS = {  # field -> (kind, [(taxonomy, tag, unit), ...] in order of preference)
    "net_income": ("flow", [("us-gaap", "NetIncomeLoss", "USD"),
                            ("us-gaap", "NetIncomeLossAvailableToCommonStockholdersBasic", "USD"),
                            ("us-gaap", "ProfitLoss", "USD"),
                            ("us-gaap", "IncomeLossFromContinuingOperations", "USD")]),
    "equity": ("instant", [("us-gaap", "StockholdersEquity", "USD"),
                           ("us-gaap", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
                            "USD")]),
    "shares": ("instant", [("dei", "EntityCommonStockSharesOutstanding", "shares"),
                           ("us-gaap", "CommonStockSharesOutstanding", "shares"),
                           ("us-gaap", "WeightedAverageNumberOfSharesOutstandingBasic", "shares")]),
}
ANNUAL_FORMS = {"10-K", "10-K/A", "10-K405", "10-KT", "10-KT/A"}
FLOW_DAYS = (350, 380)


def sec_fetcher(user_agent: str, session=None, **kw) -> tuple[Fetcher, dict]:
    if not user_agent or "@" not in user_agent:
        raise ValueError("SEC_USER_AGENT must include a contact email")
    f = Fetcher("sec", RAW / "sec", [Limit("%Y-%m-%dT%H:%M:%S", 9)], session, min_interval=0.12, **kw)
    return f, {"User-Agent": user_agent, "Accept-Encoding": "gzip, deflate"}


# --- fundamentals -----------------------------------------------------------------

def parse_facts(doc: dict, symbol: str) -> pd.DataFrame:
    """Long table: symbol, field, tag, period_start, period_end, value, filed, available_date, form,
    accn, restated."""
    facts = doc.get("facts", {})
    rows = []
    for field, (kind, tags) in FIELDS.items():
        for rank, (tax, tag, unit) in enumerate(tags):
            for x in facts.get(tax, {}).get(tag, {}).get("units", {}).get(unit, []):
                if x.get("form") not in ANNUAL_FORMS or x.get("val") is None or not x.get("filed"):
                    continue
                end = pd.Timestamp(x["end"])
                start = pd.Timestamp(x["start"]) if x.get("start") else pd.NaT
                if kind == "flow" and (pd.isna(start) or not FLOW_DAYS[0] <= (end - start).days <= FLOW_DAYS[1]):
                    continue
                if kind == "instant":
                    start = pd.NaT
                rows.append({"symbol": symbol, "field": field, "tag": tag, "rank": rank,
                             "period_start": start, "period_end": end, "value": float(x["val"]),
                             "filed": pd.Timestamp(x["filed"]), "form": x["form"], "accn": x.get("accn")})
    df = pd.DataFrame(rows)
    if df.empty:
        return pd.DataFrame(columns=["symbol", "field", "tag", "period_start", "period_end", "value", "filed",
                                     "available_date", "form", "accn", "restated"])
    # for each period, use only the most-preferred tag that reports it (no mixing of synonyms)
    best = df.groupby(["field", "period_start", "period_end"], dropna=False)["rank"].transform("min")
    df = df[df["rank"] == best].sort_values(["field", "period_end", "period_start", "filed"])
    # Same number re-reported in a later filing (e.g. as a prior-year comparative) adds nothing:
    # keep the first filing of each distinct value. A changed value is a restatement.
    df = df.drop_duplicates(["field", "period_start", "period_end", "value"], keep="first")
    first = df.groupby(["field", "period_start", "period_end"], dropna=False)["filed"].transform("min")
    df["restated"] = df["filed"] > first
    df["available_date"] = df["filed"] + pd.Timedelta(days=1)
    return df.drop(columns="rank").reset_index(drop=True)


def fetch_facts(f: Fetcher, headers: dict, cik: int, symbol: str) -> pd.DataFrame:
    rec = f.get(FACTS.format(cik=int(cik)), f"facts_{int(cik)}", headers=headers)
    doc = json_of(rec)
    return parse_facts(doc, symbol) if doc else parse_facts({}, symbol)


# --- tickers, sectors, filing history ----------------------------------------------

def ticker_map(current: dict | None, insider: pd.DataFrame | None, overrides: pd.DataFrame | None) -> dict:
    """ticker -> CIK. Overrides win, then SEC's current list, then tickers seen on Form 4 filings."""
    out: dict[str, int] = {}
    if insider is not None and len(insider):
        seen = insider.dropna(subset=["issuer_cik"]).sort_values("filing_date")
        for t, c in zip(seen["ticker"], seen["issuer_cik"]):  # latest filing wins
            if t:
                out[t.replace("-", ".")] = int(c)
    for v in (current or {}).values():
        out[str(v["ticker"]).upper().replace("-", ".")] = int(v["cik_str"])
    if overrides is not None and len(overrides):
        for t, c in zip(overrides["ticker"], overrides["cik"]):
            out[str(t).upper()] = int(c)
    return out


# Fama-French 12 industries by SIC code: a published, fixed mapping.
_FF12 = [
    ("Consumer NonDurables", [(100, 999), (2000, 2399), (2700, 2749), (2770, 2799), (3100, 3199), (3940, 3989)]),
    ("Consumer Durables", [(2500, 2519), (2590, 2599), (3630, 3659), (3710, 3711), (3714, 3714), (3716, 3716),
                           (3750, 3751), (3792, 3792), (3900, 3939), (3990, 3999)]),
    ("Manufacturing", [(2520, 2589), (2600, 2699), (2750, 2769), (3000, 3099), (3200, 3569), (3580, 3629),
                       (3700, 3709), (3712, 3713), (3715, 3715), (3717, 3749), (3752, 3791), (3793, 3799),
                       (3830, 3839), (3860, 3899)]),
    ("Energy", [(1200, 1399), (2900, 2999)]),
    ("Chemicals", [(2800, 2829), (2840, 2899)]),
    ("Business Equipment", [(3570, 3579), (3660, 3692), (3694, 3699), (3810, 3829), (7370, 7379)]),
    ("Telecom", [(4800, 4899)]),
    ("Utilities", [(4900, 4949)]),
    ("Shops", [(5000, 5999), (7200, 7299), (7600, 7699)]),
    ("Health", [(2830, 2839), (3693, 3693), (3840, 3859), (8000, 8099)]),
    ("Money", [(6000, 6999)]),
]


def sector_of_sic(sic) -> str | None:
    try:
        s = int(sic)
    except (TypeError, ValueError):
        return None
    if s <= 0:
        return None
    for name, ranges in _FF12:
        if any(a <= s <= b for a, b in ranges):
            return name
    return "Other"


def filings(f: Fetcher, headers: dict, cik: int) -> tuple[dict, pd.DataFrame]:
    """Company info (name, SIC) and its full filing list: form, filing_date, items."""
    doc = json_of(f.get(SUBMISSIONS.format(cik=int(cik)), f"subs_{int(cik)}", headers=headers)) or {}
    tables = [doc.get("filings", {}).get("recent", {})]
    for extra in doc.get("filings", {}).get("files", []):
        page = json_of(f.get(SUBMISSIONS_PAGE.format(name=extra["name"]), f"subs_{extra['name']}",
                             headers=headers))
        if page:
            tables.append(page)
    rows = []
    for t in tables:
        n = len(t.get("form", []))
        items = t.get("items", [""] * n)
        for i in range(n):
            rows.append({"form": t["form"][i], "filing_date": pd.Timestamp(t["filingDate"][i]),
                         "items": items[i] if i < len(items) else ""})
    info = {"cik": int(cik), "name": doc.get("name"), "sic": doc.get("sic"),
            "sector": sector_of_sic(doc.get("sic")), "tickers": doc.get("tickers", [])}
    return info, pd.DataFrame(rows, columns=["form", "filing_date", "items"])


ACQUISITION_FORMS = {"DEFM14A", "DEFM14C", "PREM14A", "SC TO-T", "SC 14D9", "S-4", "425", "SC 13E3"}


def classify_exit(fl: pd.DataFrame, last_day: pd.Timestamp) -> tuple[str, str]:
    """How did the company stop trading around `last_day`? -> (outcome, evidence).
    outcome: "bankrupt", "acquired", or "unexplained"."""
    if fl is None or fl.empty:
        return "unexplained", "no SEC filing history found"
    w = fl[(fl["filing_date"] >= last_day - pd.Timedelta(days=400)) &
           (fl["filing_date"] <= last_day + pd.Timedelta(days=60))]
    items = w["items"].fillna("").astype(str)
    if ((w["form"].str.startswith("8-K")) & items.str.contains("1.03")).any():
        return "bankrupt", "8-K item 1.03 (bankruptcy)"
    near = w[w["filing_date"] >= last_day - pd.Timedelta(days=200)]
    if ((near["form"].str.startswith("8-K")) & near["items"].fillna("").str.contains("2.01")).any() or \
            near["form"].isin(ACQUISITION_FORMS).any():
        forms = sorted(set(near["form"]) & (ACQUISITION_FORMS | {"8-K"}))
        return "acquired", "merger filings: " + ", ".join(forms)
    return "unexplained", "no bankruptcy or merger filing near the last trade"
