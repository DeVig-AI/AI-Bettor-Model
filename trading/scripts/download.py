"""Download batch for the free data stack (DATA_HANDOFF section 2). Safe to rerun; resumes.

    trader download            fetch what's missing, merge, audit, write data/AUDIT_REPORT.md
    trader download --status   what's done so far
    trader download --fmp      also use FMP (only if the probe showed it helps)
    trader download --no-wait  don't sleep through Tiingo's hourly limit

Order: membership -> WIKI (to 2018) -> Alpaca (2016+) -> Tiingo (only names still missing)
-> Stooq (backup) -> SEC (CIKs, sectors, filings, fundamentals, insider) -> merge -> audit.
"""
from __future__ import annotations

import os
import sys
import time
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pandas as pd  # noqa: E402
from dotenv import load_dotenv  # noqa: E402

from trader.config import ROOT, load_pass_bar  # noqa: E402
from trader.data import auditor, coverage, delistings, membership, merge, sec_facts, sec_insider  # noqa: E402
from trader.data import sources as S  # noqa: E402
from trader.data import wikipedia as W  # noqa: E402
from trader.data.http import Fetcher, LimitReached, json_of  # noqa: E402
from trader.data.store import RAW, REFERENCE, TABLES, has_table, read_table, write_table  # noqa: E402
from trader.logbook import Logbook  # noqa: E402

BENCH = ["SPY"]
MAX_WAIT_HOURS = 8


def universe() -> list[str]:
    return BENCH + membership.all_tickers_since(load_pass_bar().splits.data_start)


def env(k: str) -> str:
    return os.environ.get(k, "").strip()


def cached_table(name: str, build):
    """Parse a big source once; reuse the parsed table on later runs."""
    if has_table(name):
        return read_table(name)
    df = build()
    write_table(name, df)
    return df


# --- price sources -----------------------------------------------------------------

def get_wiki(tickers, notes) -> pd.DataFrame:
    path = env("WIKI_PRICES_FILE")
    if not path and not env("NASDAQ_DATA_LINK_API_KEY"):
        notes.append("WIKI: no NASDAQ_DATA_LINK_API_KEY or WIKI_PRICES_FILE in .env; skipped")
        return S.empty()
    try:
        p = Path(path) if path else S.wiki_download(env("NASDAQ_DATA_LINK_API_KEY"))
        return cached_table("src_wiki", lambda: S.wiki_load(p, set(tickers)))
    except Exception as e:
        notes.append(f"WIKI: {e}")
        return S.empty()


def month_end_before(today: date) -> str:
    return str((pd.Timestamp(today).replace(day=1) - pd.Timedelta(days=1)).date())


def get_alpaca(tickers, notes, today: date) -> pd.DataFrame:
    if not env("ALPACA_API_KEY"):
        notes.append("Alpaca: no keys in .env; skipped")
        return S.empty()
    end = month_end_before(today)  # a fixed end date keeps every page cacheable
    name = f"src_alpaca_{end}"
    if has_table(name):
        return read_table(name)
    f, frames = S.alpaca_fetcher(), []
    try:
        for i in range(0, len(tickers), 100):
            frames.append(S.alpaca_prices(f, env("ALPACA_API_KEY"), env("ALPACA_SECRET_KEY"),
                                          tickers[i:i + 100], "2016-01-01", end))
    except (LimitReached, RuntimeError, PermissionError) as e:
        notes.append(f"Alpaca stopped early: {e}")
        return pd.concat(frames, ignore_index=True) if frames else S.empty()
    df = pd.concat(frames, ignore_index=True) if frames else S.empty()
    write_table(name, df)
    return df


def missing_by_ticker(have: pd.DataFrame, spells: pd.DataFrame, after=None) -> pd.Series:
    """Member-days with no price, per ticker (rough: weekdays). Used to decide who needs Tiingo/Stooq."""
    span = have.groupby("symbol")["date"].agg(["min", "max"]) if len(have) else pd.DataFrame(columns=["min", "max"])
    today = pd.Timestamp.today().normalize()
    out = {}
    for t, s, e in zip(spells["ticker"], spells["start"], spells["end"]):
        s = max(s, pd.Timestamp(after or "1900-01-01"))
        e = e if pd.notna(e) else today
        if e <= s:
            continue
        total = len(pd.bdate_range(s, e))
        if t in span.index:
            lo, hi = span.at[t, "min"], span.at[t, "max"]
            got = len(pd.bdate_range(max(s, lo), min(e, hi))) if hi >= s and lo <= e else 0
        else:
            got = 0
        out[t] = out.get(t, 0) + max(0, total - got)
    return pd.Series(out, dtype=int).sort_values(ascending=False)


def get_tiingo(need: pd.Series, notes, wait: bool) -> pd.DataFrame:
    token = env("TIINGO_API_KEY")
    if not token:
        notes.append("Tiingo: no TIINGO_API_KEY in .env; skipped")
        return S.empty()
    f = S.tiingo_fetcher()
    listed = None
    try:  # Tiingo's free ticker list says who it has (delisted too), so the 480/month isn't wasted
        zp = RAW / "tiingo_list" / "supported_tickers.zip"
        if not zp.exists():
            import requests
            r = requests.get(S.TIINGO_TICKERS, timeout=120)
            if r.status_code == 200 and r.content.startswith(b"PK"):
                zp.parent.mkdir(parents=True, exist_ok=True)
                zp.write_bytes(r.content)
        if zp.exists():
            listed = set(S.tiingo_supported(zp)["ticker"])
    except Exception as e:
        notes.append(f"Tiingo ticker list unavailable ({e}); asking for every missing name")
    frames, skipped_unlisted, waited = [], 0, 0.0
    for t in need.index:
        tt = t.replace(".", "-")
        if listed is not None and tt not in listed:
            skipped_unlisted += 1
            continue
        while True:
            try:
                frames.append(S.tiingo_prices(f, token, t))
                break
            except LimitReached as e:
                if e.retry_window != "%Y-%m-%dT%H" or not wait or waited >= MAX_WAIT_HOURS * 3600:
                    notes.append(f"Tiingo: {e}; continuing next run")
                    return pd.concat(frames, ignore_index=True) if frames else S.empty()
                pause = 3600 - datetime.now().minute * 60 - datetime.now().second + 5
                print(f"Tiingo hourly limit; waiting {pause // 60} minutes ...")
                time.sleep(pause)
                waited += pause
    if skipped_unlisted:
        notes.append(f"Tiingo: {skipped_unlisted} missing names aren't in Tiingo's ticker list (not requested)")
    return pd.concat(frames, ignore_index=True) if frames else S.empty()


def get_stooq(need: pd.Series, notes) -> pd.DataFrame:
    bulk = env("STOOQ_BULK_FILE")
    if bulk:
        return S.stooq_bulk(Path(bulk), set(need.index))
    key = env("STOOQ_API_KEY")
    if not key:
        notes.append("Stooq: no STOOQ_API_KEY or STOOQ_BULK_FILE in .env; skipped")
        return S.empty()
    f, frames = S.stooq_fetcher(), []
    try:
        for t in need.index:
            frames.append(S.stooq_prices(f, t, key))
    except LimitReached as e:
        notes.append(f"Stooq: {e}")
    return pd.concat(frames, ignore_index=True) if frames else S.empty()


def get_fmp(tickers, notes) -> pd.DataFrame:
    from trader.data import fmp as F
    c = F.FMP(env("FMP_API_KEY"))
    try:
        for t in tickers:
            c.prices_adjusted(membership.to_fmp(t))
            c.prices_raw(membership.to_fmp(t))
    except F.BudgetExhausted as e:
        notes.append(f"FMP: {e}")
    return S.fmp_prices(c, tickers)


# --- SEC ---------------------------------------------------------------------------

def get_sec(tickers, insider, notes) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    """companies (symbol, cik, sector, name), fundamentals (long), filing histories."""
    ua = env("SEC_USER_AGENT")
    f, headers = sec_facts.sec_fetcher(ua)
    current = json_of(f.get(sec_facts.TICKERS, "company_tickers", headers=headers)) or {}
    ov_path = REFERENCE / "ticker_cik_overrides.csv"
    overrides = pd.read_csv(ov_path, comment="#") if ov_path.exists() else None
    cmap = sec_facts.ticker_map(current, insider, overrides)
    companies, facts, hist = [], [], {}
    for t in tickers:
        cik = cmap.get(t)
        if not cik:
            companies.append({"symbol": t, "cik": None, "sector": None, "name": None})
            continue
        info, fl = sec_facts.filings(f, headers, cik)
        hist[t] = fl
        companies.append({"symbol": t, "cik": cik, "sector": info["sector"], "name": info["name"]})
        facts.append(sec_facts.fetch_facts(f, headers, cik, t))
    unmapped = sum(c["cik"] is None for c in companies)
    if unmapped:
        notes.append(f"SEC: {unmapped} of {len(tickers)} tickers have no CIK on file (no sector, no "
                     "fundamentals, delisting reason unknown). Add any you know to data/reference/ticker_cik_overrides.csv")
    fund = pd.concat([x for x in facts if len(x)], ignore_index=True) if any(len(x) for x in facts) \
        else sec_facts.parse_facts({}, "")
    return pd.DataFrame(companies), fund, hist


def wiki_check(notes) -> list[str]:
    try:
        rec = Fetcher("wikipedia", RAW / "wikipedia").get(W.URL, f"sp500_{date.today():%Y-%m}",
                                                          headers={"User-Agent": env("SEC_USER_AGENT") or "research"})
        if rec["status"] != 200:
            notes.append(f"Wikipedia: HTTP {rec['status']}")
            return []
        return W.cross_check(W.parse_changes(rec["text"]))
    except Exception as e:
        notes.append(f"Wikipedia cross-check failed: {e}")
        return []


# --- status ------------------------------------------------------------------------

def status() -> int:
    print("Parsed sources:", ", ".join(p.stem for p in sorted(TABLES.glob("src_*.parquet"))) or "none yet")
    tu = RAW / "tiingo" / "_usage.json"
    if tu.exists():
        import json
        u = json.loads(tu.read_text()).get("%Y-%m", {}).get(f"{date.today():%Y-%m}", {"keys": []})
        print(f"Tiingo symbols used this month: {len(u['keys'])}/480")
    if has_table("prices"):
        px = read_table("prices")
        print(f"Merged prices: {px['symbol'].nunique()} symbols, {len(px):,} rows; by source: "
              + ", ".join(f"{k} {v:.0%}" for k, v in px['source'].value_counts(normalize=True).items()))
    rep = ROOT / "data" / "AUDIT_REPORT.md"
    print(f"Last audit: {rep}" if rep.exists() else "No audit yet.")
    return 0


# --- main --------------------------------------------------------------------------

def run() -> int:
    load_dotenv(ROOT / ".env")
    if "--status" in sys.argv:
        return status()
    log, notes, today = Logbook(), [], date.today()
    pb = load_pass_bar()
    tickers = universe()
    spells = membership.intervals()
    spells = spells[(spells["end"].isna()) | (spells["end"] > pd.Timestamp(pb.splits.data_start))]

    frames = [get_wiki(tickers, notes), get_alpaca(tickers, notes, today)]
    if "--fmp" in sys.argv:
        frames.append(get_fmp(tickers, notes))
    have = pd.concat([x for x in frames if len(x)], ignore_index=True) if any(len(x) for x in frames) else S.empty()
    need = missing_by_ticker(have, spells, pb.splits.data_start)
    need = need[need > 5]
    # post-2018 gaps first: that's what Tiingo is for
    late = missing_by_ticker(have, spells, "2018-03-28").reindex(need.index).fillna(0)
    need = need.loc[late.sort_values(ascending=False).index]
    frames.append(cached_table(f"src_tiingo_{today:%Y-%m-%d}", lambda: get_tiingo(need, notes, "--no-wait" not in sys.argv)))
    have = pd.concat([x for x in frames if len(x)], ignore_index=True) if any(len(x) for x in frames) else S.empty()
    still = missing_by_ticker(have, spells, pb.splits.data_start)
    frames.append(get_stooq(still[still > 5], notes))

    merged, conflicts, seam_notes = merge.merge_all(frames)

    insider = pd.DataFrame()
    try:
        notes += sec_insider.download(env("SEC_USER_AGENT"))
        insider, ins_problems = sec_insider.build_table()
        notes += ins_problems
    except Exception as e:
        notes.append(f"SEC insider: {e}")
    try:
        companies, fund, hist = get_sec(tickers, insider if len(insider) else None, notes)
    except Exception as e:
        notes.append(f"SEC companies/fundamentals: {e}")
        companies, fund, hist = pd.DataFrame({"symbol": tickers, "cik": None, "sector": None, "name": None}), \
            sec_facts.parse_facts({}, ""), {}

    res = auditor.AuditResult()
    px = auditor.audit_prices(merged, today, res) if len(merged) else merged
    for e in merge.seam_exclusions(seam_notes):
        res.exclude(e["symbol"], e["start"], e["end"], e["reason"])
    auditor.audit_coverage(px, spells, pb.splits.data_start, res)
    fund = auditor.audit_fundamentals_sec(fund, today, res)
    ins = auditor.audit_insider(insider, companies, today, res) if len(insider) else insider

    source_ends = {s: g["date"].max() for s, g in (pd.concat([x for x in frames if len(x)]).groupby("source")
                                                   if any(len(x) for x in frames) else [])}
    data_end = px["date"].max() if len(px) else pd.Timestamp(today)
    exits, gaps = delistings.find_exits(px, spells, source_ends, data_end)
    resolved = delistings.resolve(exits, px, lambda s, d: sec_facts.classify_exit(hist.get(s), d),
                                  delistings.load_overrides())
    terminal = delistings.terminal_rows(resolved, px)
    final = pd.concat([px, terminal], ignore_index=True).sort_values(["symbol", "date"]) if len(px) else px

    cov = coverage.member_days(final, membership.load(), pb.splits.data_start, data_end, res.exclusion_frame()) \
        if len(final) else None
    auditor.report_stack(res, final, conflicts, seam_notes, resolved, gaps, cov, wiki_check(notes), notes)

    for name, df in [("prices", final), ("companies", companies), ("fundamentals", fund), ("insider", ins),
                     ("exclusions", res.exclusion_frame()), ("conflicts", conflicts), ("delistings", resolved)]:
        write_table(name, df if df is not None else pd.DataFrame())
    report = auditor.write_report(res)
    log.record("data", "download_batch", "free-stack download + audit", notes=notes[:50], fatal=res.fatal,
               coverage_missing=None if cov is None else cov["missing"])
    print(report.read_text())
    return 0


if __name__ == "__main__":
    sys.exit(run())
