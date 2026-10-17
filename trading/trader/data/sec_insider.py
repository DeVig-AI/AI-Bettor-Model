"""Insider buying from the SEC's official quarterly Form 3/4/5 data sets (free, 2006 onward).

One zip per quarter instead of one request per filing, so the whole history is
~80 downloads. SEC requires a User-Agent with contact info (SEC_USER_AGENT in .env)
and asks for at most 10 requests/second.

We keep only: Form 4, transaction code "P" (open-market purchase), acquired,
filed by an officer or director. Option exercises (code "M") and sales ("S") are ignored.
The date that counts is the FILING date, because that's when the public knew.
"""
from __future__ import annotations

import io
import time
import zipfile
from pathlib import Path

import pandas as pd
import requests

from .store import RAW

URL = "https://www.sec.gov/files/structureddata/data/insider-transactions-data-sets/{q}_form345.zip"
FIRST_QUARTER = (2006, 1)


def quarters(first=FIRST_QUARTER, last: tuple[int, int] | None = None) -> list[str]:
    ts = pd.Timestamp.today()
    last = last or (ts.year, (ts.month - 1) // 3 + 1)
    out, (y, q) = [], first
    while (y, q) < last:  # current quarter isn't published yet
        out.append(f"{y}q{q}")
        y, q = (y + 1, 1) if q == 4 else (y, q + 1)
    return out


def download(user_agent: str, cache_dir: Path = RAW / "sec_form345", session=None, log=print) -> list[str]:
    """Download missing quarters. Returns a list of plain-English problems."""
    if not user_agent or "@" not in user_agent:
        raise ValueError("SEC_USER_AGENT must include a contact email, e.g. 'Jane Doe jane@example.com'")
    http = session or requests.Session()
    cache_dir = Path(cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    problems = []
    for q in quarters():
        dest = cache_dir / f"{q}_form345.zip"
        if dest.exists():
            continue
        r = http.get(URL.format(q=q), headers={"User-Agent": user_agent}, timeout=120)
        time.sleep(0.2)
        if r.status_code != 200 or not r.content.startswith(b"PK"):
            problems.append(f"SEC insider data {q}: HTTP {r.status_code}, skipped")
            continue
        dest.write_bytes(r.content)
        log(f"SEC insider data {q}: {len(r.content) // 1024} KB")
    return problems


def _tsv(z: zipfile.ZipFile, name: str, cols: list[str]) -> pd.DataFrame:
    match = [n for n in z.namelist() if n.upper().endswith(name)]
    if not match:
        raise KeyError(f"{name} missing from zip")
    with z.open(match[0]) as f:
        df = pd.read_csv(io.TextIOWrapper(f, encoding="latin-1"), sep="\t", dtype=str,
                         usecols=lambda c: c.upper() in cols, quoting=3, on_bad_lines="skip")
    df.columns = [c.upper() for c in df.columns]
    missing = set(cols) - set(df.columns)
    if missing:
        raise KeyError(f"{name} lacks columns {sorted(missing)}")
    return df


def parse_quarter(zip_bytes_or_path) -> pd.DataFrame:
    """Officer/director open-market purchases in one quarterly zip."""
    src = zip_bytes_or_path
    z = zipfile.ZipFile(io.BytesIO(src) if isinstance(src, bytes) else src)
    sub = _tsv(z, "SUBMISSION.TSV", ["ACCESSION_NUMBER", "FILING_DATE", "ISSUERCIK",
                                     "ISSUERTRADINGSYMBOL", "DOCUMENT_TYPE"])
    own = _tsv(z, "REPORTINGOWNER.TSV", ["ACCESSION_NUMBER", "RPTOWNERCIK", "RPTOWNER_RELATIONSHIP"])
    tx = _tsv(z, "NONDERIV_TRANS.TSV", ["ACCESSION_NUMBER", "TRANS_DATE", "TRANS_CODE",
                                        "TRANS_ACQUIRED_DISP_CD", "TRANS_SHARES",
                                        "TRANS_PRICEPERSHARE"])
    sub = sub[sub["DOCUMENT_TYPE"].str.strip().isin(["4", "4/A"])]
    tx = tx[(tx["TRANS_CODE"].str.strip() == "P") & (tx["TRANS_ACQUIRED_DISP_CD"].str.strip() == "A")]
    rel = own["RPTOWNER_RELATIONSHIP"].fillna("").str.lower()
    own = own[rel.str.contains("officer") | rel.str.contains("director")]
    df = tx.merge(sub, on="ACCESSION_NUMBER").merge(own, on="ACCESSION_NUMBER")
    out = pd.DataFrame({
        "accession": df["ACCESSION_NUMBER"],
        "filing_date": pd.to_datetime(df["FILING_DATE"], format="mixed", errors="coerce"),
        "trans_date": pd.to_datetime(df["TRANS_DATE"], format="mixed", errors="coerce"),
        "issuer_cik": pd.to_numeric(df["ISSUERCIK"], errors="coerce"),
        "ticker": df["ISSUERTRADINGSYMBOL"].fillna("").str.strip().str.upper(),
        "owner_cik": pd.to_numeric(df["RPTOWNERCIK"], errors="coerce"),
        "shares": pd.to_numeric(df["TRANS_SHARES"], errors="coerce"),
        "price": pd.to_numeric(df["TRANS_PRICEPERSHARE"], errors="coerce"),
    })
    return out.drop_duplicates()


def build_table(cache_dir: Path = RAW / "sec_form345") -> tuple[pd.DataFrame, list[str]]:
    frames, problems = [], []
    for p in sorted(Path(cache_dir).glob("*_form345.zip")):
        try:
            frames.append(parse_quarter(p).assign(quarter=p.name[:6]))
        except (KeyError, zipfile.BadZipFile, ValueError) as e:
            problems.append(f"{p.name}: {e}; quarter skipped")
    if not frames:
        return pd.DataFrame(columns=["accession", "filing_date", "trans_date", "issuer_cik", "ticker",
                                     "owner_cik", "shares", "price", "quarter"]), problems
    return pd.concat(frames, ignore_index=True), problems
