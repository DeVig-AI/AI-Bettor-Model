"""Daily data download batch. Safe to run every day; resumes where it stopped.

    python scripts/download.py            # spend today's FMP budget, then rebuild tables + audit
    python scripts/download.py --status   # how far along are we

FMP order (most useful first): delisted list, adjusted prices, sector profiles,
raw prices, income statements, balance sheets. SEC insider zips have no daily cap.
"""
from __future__ import annotations

import os
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv  # noqa: E402

from trader.config import ROOT, load_pass_bar  # noqa: E402
from trader.data import auditor, build, membership, sec_insider  # noqa: E402
from trader.data import fmp as F  # noqa: E402
from trader.data.store import write_table  # noqa: E402
from trader.logbook import Logbook  # noqa: E402

BENCH = ["SPY"]


def universe() -> list[str]:
    return BENCH + membership.all_tickers_since(load_pass_bar().splits.data_start)


def phases(client: F.FMP, tickers: list[str]):
    """(name, list of (endpoint, key, call)) in priority order."""
    m = membership.to_fmp
    return [
        ("adjusted prices", [("historical-price-eod/dividend-adjusted", m(t), lambda t=t: client.prices_adjusted(m(t)))
                             for t in tickers]),
        ("sector profiles", [("profile", m(t), lambda t=t: client.profile(m(t))) for t in tickers]),
        ("raw prices", [("historical-price-eod/full", m(t), lambda t=t: client.prices_raw(m(t))) for t in tickers]),
        ("income statements", [("income-statement", m(t), lambda t=t: client.income(m(t))) for t in tickers]),
        ("balance sheets", [("balance-sheet-statement", m(t), lambda t=t: client.balance(m(t))) for t in tickers]),
    ]


def status(client: F.FMP, tickers: list[str]) -> list[str]:
    out, left = [], 0
    for name, jobs in phases(client, tickers):
        done = sum(client.cached(ep, k) is not None for ep, k, _ in jobs)
        left += len(jobs) - done
        out.append(f"{name}: {done}/{len(jobs)}")
    days = -(-left // F.DAILY_BUDGET)
    out.append(f"{left} FMP requests left, about {days} more days at {F.DAILY_BUDGET}/day")
    return out


def fetch_delisted(client: F.FMP) -> None:
    for page in range(100):
        rec = client.delisted(page)
        if not F.rows(rec):
            break


def run() -> int:
    load_dotenv(ROOT / ".env")
    log = Logbook()
    client = F.FMP(os.environ.get("FMP_API_KEY", ""))
    tickers = universe()
    if "--status" in sys.argv:
        print("\n".join(status(client, tickers)))
        return 0

    problems = []
    try:
        fetch_delisted(client)
        for _name, jobs in phases(client, tickers):
            for _, _, call in jobs:
                call()
    except F.BudgetExhausted as e:
        problems.append(str(e))
    except Exception as e:  # network down etc: stop cleanly, keep what we have
        problems.append(f"FMP download stopped: {e}")

    try:
        problems += sec_insider.download(os.environ.get("SEC_USER_AGENT", ""))
    except Exception as e:
        problems.append(f"SEC download stopped: {e}")

    # rebuild tables from everything cached so far, then audit
    res = auditor.AuditResult()
    today = date.today()
    px = auditor.audit_prices(build.prices(client, tickers), today, res)
    auditor.audit_coverage(px, membership.intervals(), load_pass_bar().splits.data_start, res)
    prof = build.profiles(client, tickers)
    fd = auditor.audit_fundamentals(build.fundamentals(client, tickers), today, res)
    ins, ins_problems = sec_insider.build_table()
    ins = auditor.audit_insider(ins, prof, today, res)
    restricted = sum(F.restricted(client.cached(ep, k)) for _, jobs in phases(client, tickers) for ep, k, _ in jobs)
    if restricted:
        res.say(f"- FMP refused {restricted} requests as not in the free plan.")
    for p in problems + ins_problems:
        res.say(f"- Note: {p}")
    res.say("")
    res.say("Progress: " + "; ".join(status(client, tickers)))

    for name, df in [("prices", px), ("profiles", prof), ("fundamentals", fd), ("insider", ins),
                     ("exclusions", res.exclusion_frame())]:
        write_table(name, df)
    report = auditor.write_report(res)
    log.record("data", "download_batch", "daily data batch + audit", problems=problems,
               fatal=res.fatal, report=str(report))
    print(report.read_text())
    return 0


if __name__ == "__main__":
    sys.exit(run())
