"""One run at home answers what the free data stack can do (DATA_HANDOFF section 4).

    trader probe            everything (downloads the ~0.5 GB WIKI file if it isn't cached yet)
    trader probe --quick    skip the WIKI download and the speed test

Writes data/PROBE.md and logs the real limits/coverage in DECISIONS.md style lines.
Uses: FMP ~8 requests, Tiingo 10 symbols (of 500/month), Alpaca ~3, Stooq 1, SEC ~10.
"""
from __future__ import annotations

import os
import sys
import time
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from dotenv import load_dotenv  # noqa: E402

from trader.config import ROOT, load_pass_bar  # noqa: E402
from trader.data import coverage, membership, sec_facts, sec_insider  # noqa: E402
from trader.data import sources as S  # noqa: E402
from trader.data.http import Fetcher, json_of  # noqa: E402
from trader.data.store import DATA, RAW  # noqa: E402

TIINGO_SAMPLE = {"LEHMQ": "bankrupt 2008", "WAMUQ": "bankrupt 2008", "SIVB": "bank failure 2023",
                 "FRC": "bank failure 2023", "SBNY": "bank failure 2023", "TWX": "acquired 2018",
                 "CELG": "acquired 2019", "RHT": "acquired 2019", "XLNX": "acquired 2022",
                 "ATVI": "acquired 2023"}
SEC_SAMPLE = {"AAPL": None, "JPM": None, "XOM": None, "GE": None, "RHT": 1087423}


def env(k):
    return os.environ.get(k, "").strip()


class Probe:
    def __init__(self):
        self.lines, self.summary, self.ok = ["# Free data probe", ""], [], {}

    def section(self, title, fn):
        self.lines += [f"## {title}", ""]
        try:
            fn()
        except Exception as e:
            self.say(f"FAILED: {e}")
            self.summary.append(f"{title}: FAILED ({str(e)[:120]})")
            self.lines.append("```\n" + traceback.format_exc(limit=3) + "```")
        self.lines.append("")

    def say(self, s):
        self.lines.append(f"- {s}")
        print(f"  {s}")


def fmp(p: Probe):
    if not env("FMP_API_KEY"):
        p.say("no FMP_API_KEY; skipped (FMP is optional in plan v2)")
        return
    from trader.data import fmp as F
    c = F.FMP(env("FMP_API_KEY"))
    d = c.delisted(0)
    p.say(f"delisted list: {'NOT in free plan' if F.restricted(d) else f'{len(F.rows(d))} rows'} (HTTP {d['status']})")
    oldest, delisted_ok = None, False
    for sym in ("AAPL", "LEHMQ", "TWX"):
        rows = F.rows(c.prices_adjusted(sym))
        if rows:
            ds = sorted(x["date"] for x in rows)
            oldest = ds[0] if sym == "AAPL" else oldest
            delisted_ok |= sym != "AAPL"
            p.say(f"{sym}: {len(rows)} days, {ds[0]} to {ds[-1]}")
        else:
            p.say(f"{sym}: no prices")
    useful = bool(oldest and oldest <= "2001-01-31") and delisted_ok
    p.summary.append(f"FMP: history from {oldest or 'n/a'}; delisted prices {'yes' if delisted_ok else 'no'}"
                     f" -> {'useful, add --fmp' if useful else 'not needed'}.")


def wiki(p: Probe, quick: bool):
    path = env("WIKI_PRICES_FILE")
    if not path and not env("NASDAQ_DATA_LINK_API_KEY"):
        p.say("no NASDAQ_DATA_LINK_API_KEY or WIKI_PRICES_FILE; skipped")
        p.summary.append("WIKI: not checked (no key).")
        return
    if not path:
        info = S.wiki_export_link(env("NASDAQ_DATA_LINK_API_KEY"))
        p.say(f"export status: {info['status']}" + (f" ({info.get('detail', '')})" if not info["link"] else ""))
        if quick:
            p.summary.append(f"WIKI: export {info['status']} (coverage not measured, --quick).")
            return
        print("  downloading WIKI bulk file (~0.5 GB, one time) ...")
        path = S.wiki_download(env("NASDAQ_DATA_LINK_API_KEY"))
    tickers = membership.all_tickers_since(load_pass_bar().splits.data_start)
    w = S.wiki_load(Path(path), set(tickers))
    spells = membership.intervals()
    spells = spells[(spells["end"].isna()) | (spells["end"] > pd.Timestamp("2001-01-01"))]
    have = set(w["symbol"])
    departed = spells[spells["end"].notna() & (spells["end"] <= S.WIKI_END)]
    p.say(f"{len(have)} of {len(tickers)} historical S&P 500 tickers (since 2001) have WIKI prices")
    p.say(f"departed before April 2018: {departed['ticker'].isin(have).sum()} of {len(departed)} covered")
    cov = coverage.member_days(w, membership.load(), "2001-01-02", S.WIKI_END)
    p.say(f"member-days 2001 to Mar 2018 with a WIKI price: {1 - cov['missing']:.1%}")
    p.ok["wiki"] = cov["missing"] <= 0.05
    p.summary.append(f"WIKI covers {1 - cov['missing']:.0%} of member-days 2001-2018; "
                     f"{departed['ticker'].isin(have).mean():.0%} of names that left the index before 2018.")


def tiingo(p: Probe):
    if not env("TIINGO_API_KEY"):
        p.say("no TIINGO_API_KEY; skipped")
        p.summary.append("Tiingo: not checked (no key).")
        return
    f, ok = S.tiingo_fetcher(), 0
    for sym, why in TIINGO_SAMPLE.items():
        df = S.tiingo_prices(f, env("TIINGO_API_KEY"), sym)
        if len(df):
            ok += 1
            p.say(f"{sym} ({why}): {len(df)} days, {df['date'].min().date()} to {df['date'].max().date()}")
        else:
            p.say(f"{sym} ({why}): no history")
    p.ok["tiingo"] = ok >= 7
    p.summary.append(f"Tiingo has history for {ok} of 10 sample delisted names.")


def alpaca(p: Probe):
    if not env("ALPACA_API_KEY"):
        p.say("no Alpaca keys; skipped")
        p.summary.append("Alpaca: not checked (no keys).")
        return
    from alpaca.trading.client import TradingClient
    acct = TradingClient(env("ALPACA_API_KEY"), env("ALPACA_SECRET_KEY"), paper=True).get_account()
    p.say(f"paper account reachable: status {acct.status}, equity ${float(acct.equity):,.2f}")
    f = Fetcher("alpaca_probe", RAW / "alpaca_probe", [])
    df = S.alpaca_prices(f, env("ALPACA_API_KEY"), env("ALPACA_SECRET_KEY"), ["SPY"], "2000-01-01", "2016-12-31")
    first = df["date"].min().date() if len(df) else None
    p.say(f"earliest SPY daily bar: {first}")
    p.ok["alpaca"] = first is not None and str(first) <= "2016-01-31"
    p.summary.append(f"Alpaca keys work; daily bars from {first}.")


def stooq(p: Probe):
    if env("STOOQ_BULK_FILE"):
        n = len(S.stooq_bulk(Path(env("STOOQ_BULK_FILE")), {"AAPL"}))
        p.say(f"bulk file readable: {n} AAPL rows")
        p.summary.append(f"Stooq bulk file works ({n} AAPL rows).")
        return
    df = S.stooq_prices(Fetcher("stooq_probe", RAW / "stooq_probe", []), "AAPL", env("STOOQ_API_KEY"))
    p.say(f"per-symbol download: {len(df)} AAPL rows" + ("" if len(df) else
          " (Stooq now asks for a free API key from a captcha page: stooq.com/q/d/?s=spy.us&get_apikey)"))
    p.summary.append(f"Stooq: {'works' if len(df) else 'blocked without an API key (backup only, not needed)'}.")


def sec(p: Probe):
    ua = env("SEC_USER_AGENT")
    q = "2020q1"
    probs = []
    dest = RAW / "sec_form345" / f"{q}_form345.zip"
    if not dest.exists():
        import requests
        r = requests.get(sec_insider.URL.format(q=q), headers={"User-Agent": ua}, timeout=120)
        if r.status_code == 200 and r.content.startswith(b"PK"):
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(r.content)
        else:
            probs.append(f"HTTP {r.status_code}")
    if dest.exists():
        df = sec_insider.parse_quarter(dest)
        p.say(f"Form 4 bulk layout matches the parser: {len(df)} officer/director buys in {q}")
    else:
        p.say(f"Form 4 bulk file {q} not downloadable: {probs}")
    f, h = sec_facts.sec_fetcher(ua)
    cur = json_of(f.get(sec_facts.TICKERS, "company_tickers", headers=h)) or {}
    cmap = sec_facts.ticker_map(cur, None, None)
    good = 0
    for t, cik in SEC_SAMPLE.items():
        cik = cik or cmap.get(t)
        facts = sec_facts.fetch_facts(f, h, cik, t) if cik else sec_facts.parse_facts({}, t)
        fields = sorted(set(facts["field"]))
        good += len(fields) == 3
        first = facts["filed"].min().date() if len(facts) else None
        p.say(f"{t} (CIK {cik}): fields {fields or 'none'}; earliest filing {first}; "
              f"{int(facts['restated'].sum()) if len(facts) else 0} restatements")
    p.ok["sec"] = dest.exists() and good >= 4
    p.summary.append(f"SEC: Form 4 layout {'OK' if dest.exists() else 'NOT checked'}; companyfacts complete for "
                     f"{good} of {len(SEC_SAMPLE)} sample companies.")


def speed(p: Probe):
    """Time one real-size backtest. Uses a synthetic universe the size of the real one, because
    the real data isn't downloaded yet; the first real chamber test records its own time too."""
    import pandas_market_calendars as mcal

    from trader.chamber import engine
    from trader.chamber.chamber import SINGLE, Chamber
    from trader.chamber.registry import Registry
    tickers = membership.all_tickers_since("2001-01-01")
    days = mcal.get_calendar("XNYS").valid_days("2001-01-02", "2014-12-31").tz_localize(None)
    rng = np.random.default_rng(0)
    rows = []
    for t in tickers + ["SPY"]:
        px = 50 * np.exp(np.cumsum(rng.normal(0.0003, 0.02, len(days))))
        rows.append(pd.DataFrame({"symbol": t, "date": days, "adj_open": px, "adj_high": px, "adj_low": px,
                                  "adj_close": px, "close": px, "volume": 1e9, "source": "synthetic"}))
    prices = pd.concat(rows, ignore_index=True)
    engine.ZIPLINE_ROOT = RAW.parent / "zipline_probe"
    import tempfile
    tmp = Path(tempfile.mkdtemp())
    ch = Chamber(prices, pd.DataFrame({"symbol": tickers, "sector": [f"S{i % 12}" for i in range(len(tickers))]}),
                 registry=Registry(tmp / "reg.jsonl"), synthetic=True, reports=tmp)
    t0 = time.monotonic()
    ch._run("SPY", "train", 0.0015)          # includes the one-time data ingest
    t1 = time.monotonic()
    ch._run(SINGLE["momentum"], "train", 0.0015)
    t2 = time.monotonic()
    one = (t2 - t1) / 60
    p.say(f"one-time data ingest + SPY run: {(t1 - t0) / 60:.1f} min")
    p.say(f"one momentum run, 2002-2014, {len(tickers)} stocks: {one:.1f} min")
    # evaluate() = 2 splits x (base + stress + version-C rerun) momentum-style runs + 2 equal-weight runs
    p.summary.append(f"Speed (measured on a synthetic universe of real size): {one:.1f} min per 13-year run; "
                     f"one full signal test is about {one * 8 / 60:.1f} hours.")


def main() -> int:
    load_dotenv(ROOT / ".env")
    quick = "--quick" in sys.argv
    p = Probe()
    for title, fn in [("FMP", lambda: fmp(p)), ("WIKI prices (to March 2018)", lambda: wiki(p, quick)),
                      ("Tiingo (delisted names)", lambda: tiingo(p)), ("Alpaca", lambda: alpaca(p)),
                      ("Stooq", lambda: stooq(p)), ("SEC", lambda: sec(p))] + \
            ([] if quick else [("Speed", lambda: speed(p))]):
        print(f"\n{title}")
        p.section(title, fn)
    weak = [k for k in ("wiki", "tiingo", "alpaca", "sec") if not p.ok.get(k)]
    p.summary.append("Verdict: " + ("the free stack looks sufficient. Value starts 2010 (no 2008 test). Next: "
                                    "`trader download`; its coverage gate is the final word."
                                    if not weak else f"not proven yet, weak or unchecked: {', '.join(weak)}. "
                                    "Run `trader download` anyway; if its coverage gate fails, the paid "
                                    "fallback (EODHD ~$20-40, owner's call) is the next question."))
    p.lines[2:2] = ["## Summary", ""] + [f"- {s}" for s in p.summary] + [""]
    out = DATA / "PROBE.md"
    out.write_text("\n".join(p.lines) + "\n")
    print("\nSummary:\n" + "\n".join(f"  {s}" for s in p.summary) + f"\n\nFull results: {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
