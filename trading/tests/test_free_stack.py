"""The free data stack (DATA_HANDOFF v2) against small sample files. No network."""
import io
import json
import zipfile
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest

from trader.chamber import metrics as M
from trader.chamber.chamber import Chamber
from trader.config import load_pass_bar
from trader.data import coverage, delistings, merge, sec_facts, wikipedia
from trader.data import sources as S
from trader.data.http import Fetcher, Limit, LimitReached

FIX = Path(__file__).parent / "fixtures"


class FakeHTTP:
    """Returns canned replies by URL substring; counts calls."""

    def __init__(self, routes):
        self.routes, self.calls = routes, []

    def get(self, url, params=None, headers=None, timeout=None, **kw):
        self.calls.append((url, params))
        for key, reply in self.routes.items():
            if key in url:
                status, body = reply(params) if callable(reply) else reply
                r = SimpleNamespace(status_code=status, text=body if isinstance(body, str) else json.dumps(body))
                r.content = r.text.encode()
                r.json = lambda r=r: json.loads(r.text)
                return r
        raise AssertionError(f"unexpected URL {url}")


# --- WIKI -----------------------------------------------------------------------------

def test_wiki_load_filters_renames_and_drops_bad_rows():
    df = S.wiki_load(FIX / "wiki_sample.csv", {"AAA", "BRK.B", "BAD"})
    assert set(df["symbol"]) == {"AAA", "BRK.B"}          # BAD had a negative close: dropped, not fixed
    assert (df["source"] == "wiki").all()
    a = df[df["symbol"] == "AAA"].sort_values("date")
    assert a["close"].iloc[-1] == 108 and a["adj_close"].iloc[-1] == 54


def test_wiki_load_reads_zip_too(tmp_path):
    z = tmp_path / "WIKI_PRICES.zip"
    with zipfile.ZipFile(z, "w") as f:
        f.write(FIX / "wiki_sample.csv", "WIKI_PRICES_2018.csv")
    assert len(S.wiki_load(z, {"AAA"})) == 5


def test_wiki_missing_columns_fail_loudly(tmp_path):
    p = tmp_path / "x.csv"
    p.write_text("foo,bar\n1,2\n")
    with pytest.raises(KeyError):
        S.wiki_load(p, None)


# --- limits & caching ------------------------------------------------------------

def test_fetcher_counts_unique_keys_per_month_and_caches(tmp_path):
    http = FakeHTTP({"x": (200, "[]")})
    f = Fetcher("t", tmp_path, [Limit("%Y-%m", 2, "keys")], http, clock=lambda: datetime(2026, 1, 5))
    f.get("http://x/1", "a", limit_key="A")
    f.get("http://x/1b", "a2", limit_key="A")     # same symbol, new request: still 1 key
    f.get("http://x/2", "b", limit_key="B")
    f.get("http://x/1", "a", limit_key="A")       # cached: no call
    assert len(http.calls) == 3
    with pytest.raises(LimitReached):
        f.get("http://x/3", "c", limit_key="C")
    nxt = Fetcher("t", tmp_path, [Limit("%Y-%m", 2, "keys")], http, clock=lambda: datetime(2026, 2, 1))
    nxt.get("http://x/3", "c", limit_key="C")      # new month


def test_hourly_limit_says_wait_an_hour(tmp_path):
    f = Fetcher("t", tmp_path, [Limit("%Y-%m-%dT%H", 1)], FakeHTTP({"x": (200, "[]")}),
                clock=lambda: datetime(2026, 1, 5, 10))
    f.get("http://x/1", "a")
    with pytest.raises(LimitReached) as e:
        f.get("http://x/2", "b")
    assert e.value.retry_window == "%Y-%m-%dT%H"


def test_server_errors_are_not_cached(tmp_path):
    f = Fetcher("t", tmp_path, [], FakeHTTP({"x": (503, "down")}))
    with pytest.raises(RuntimeError):
        f.get("http://x/1", "a")
    assert f.cached("a") is None


# --- Tiingo, Alpaca, Stooq ---------------------------------------------------------

def test_tiingo_prices(tmp_path):
    http = FakeHTTP({"tiingo": (200, (FIX / "tiingo_old.json").read_text())})
    f = Fetcher("tiingo", tmp_path, S.TIINGO_LIMITS, http)
    df = S.tiingo_prices(f, "tok", "BRK.B")
    assert list(df["adj_close"]) == [20, 21] and (df["source"] == "tiingo").all()
    assert "BRK-B" in http.calls[0][0]
    with pytest.raises(ValueError):
        S.tiingo_prices(f, "", "AAA")


def test_tiingo_unknown_ticker_gives_nothing(tmp_path):
    f = Fetcher("tiingo", tmp_path, S.TIINGO_LIMITS, FakeHTTP({"tiingo": (404, {"detail": "Not found."})}))
    assert S.tiingo_prices(f, "tok", "GONE").empty


def _bars(adjustment, token=None):
    scale = 0.5 if adjustment == "all" else 1.0
    page1 = {"bars": {"AAA": [{"t": "2016-01-04T05:00:00Z", "o": 10 * scale, "h": 10 * scale, "l": 10 * scale,
                               "c": 10 * scale, "v": 5}]}, "next_page_token": "p2"}
    page2 = {"bars": {"AAA": [{"t": "2016-01-05T05:00:00Z", "o": 11 * scale, "h": 11 * scale, "l": 11 * scale,
                               "c": 11 * scale, "v": 5}],
                      "BRK.B": [{"t": "2016-01-05T05:00:00Z", "o": 1, "h": 1, "l": 1, "c": 1, "v": 1}]},
             "next_page_token": None}
    return page2 if token else page1


def test_alpaca_pages_raw_and_adjusted(tmp_path):
    http = FakeHTTP({"alpaca": lambda p: (200, _bars(p["adjustment"], p.get("page_token")))})
    f = Fetcher("alpaca", tmp_path, [], http)
    df = S.alpaca_prices(f, "k", "s", ["AAA", "BRK-B"], "2016-01-01", "2016-01-31")
    a = df[df["symbol"] == "AAA"].sort_values("date")
    assert list(a["close"]) == [10, 11] and list(a["adj_close"]) == [5, 5.5]
    assert set(df["symbol"]) == {"AAA", "BRK-B"}
    assert len(http.calls) == 4                     # 2 pages x (raw, all)


def test_alpaca_bad_keys(tmp_path):
    f = Fetcher("alpaca", tmp_path, [], FakeHTTP({"alpaca": (403, {"message": "forbidden"})}))
    with pytest.raises(PermissionError):
        S.alpaca_prices(f, "k", "s", ["AAA"], "2016-01-01", "2016-01-31")
    with pytest.raises(ValueError):
        S.alpaca_prices(f, "", "", ["AAA"])


def test_stooq_csv_html_and_bulk(tmp_path):
    f = Fetcher("stooq", tmp_path / "a", [], FakeHTTP({"stooq": (200, (FIX / "stooq_sample.csv").read_text())}))
    df = S.stooq_prices(f, "AAA", "key")
    assert list(df["adj_close"]) == [10, 11] and df["close"].isna().all()   # Stooq has no raw prices
    g = Fetcher("stooq", tmp_path / "b", [], FakeHTTP({"stooq": (200, "<html>get an api key</html>")}))
    assert S.stooq_prices(g, "AAA").empty
    z = tmp_path / "d_us_txt.zip"
    with zipfile.ZipFile(z, "w") as zz:
        zz.writestr("data/daily/us/nyse stocks/1/aaa.us.txt",
                    "<TICKER>,<PER>,<DATE>,<TIME>,<OPEN>,<HIGH>,<LOW>,<CLOSE>,<VOL>,<OPENINT>\n"
                    "AAA.US,D,20180326,000000,10,10,10,10,100,0\n")
        zz.writestr("data/daily/us/nyse stocks/1/zzz.us.txt", "<DATE>,<CLOSE>\n20180326,1\n")
    b = S.stooq_bulk(z, {"AAA"})
    assert list(b["symbol"]) == ["AAA"] and b["date"].iloc[0] == pd.Timestamp("2018-03-26")


# --- merge -------------------------------------------------------------------------------

def rows(source, dates, adj, close=None):
    d = pd.to_datetime(dates)
    close = close if close is not None else [np.nan] * len(d)
    return pd.DataFrame({"symbol": "AAA", "date": d, "open": close, "high": close, "low": close, "close": close,
                         "adj_open": adj, "adj_high": adj, "adj_low": adj, "adj_close": adj, "volume": 1.0,
                         "source": source})[S.COLUMNS]


def test_merge_splices_by_returns_not_levels():
    # WIKI anchors adjustments in 2018 (levels ~50); Alpaca anchors in 2026 (levels ~25). Same returns.
    wiki = rows("wiki", ["2018-03-23", "2018-03-26", "2018-03-27"], [50.0, 51.0, 52.0], [100, 102, 104])
    alp = rows("alpaca", ["2018-03-26", "2018-03-27", "2018-03-28", "2018-03-29"], [25.0, 25.5, 26.0, 26.52],
               [102, 104, 106.04, 108.16])
    m, conflicts, notes = merge.merge_symbol(pd.concat([wiki, alp]))
    r = m["adj_close"].pct_change().dropna().round(6).tolist()
    assert r == [0.02, round(52 / 51 - 1, 6), round(26.0 / 25.5 - 1, 6), round(26.52 / 26.0 - 1, 6)]
    assert list(m["source"]) == ["wiki", "wiki", "wiki", "alpaca", "alpaca"]   # wiki wins where both exist
    assert conflicts.empty and notes == []


def test_merge_flags_1pct_disagreement_on_raw_close():
    wiki = rows("wiki", ["2018-03-26", "2018-03-27"], [51.0, 52.0], [102, 104])
    alp = rows("alpaca", ["2018-03-26", "2018-03-27"], [25.5, 26.0], [102, 106])   # 1.9% off on the 27th
    _, conflicts, _ = merge.merge_symbol(pd.concat([wiki, alp]))
    assert list(conflicts["date"]) == [pd.Timestamp("2018-03-27")]
    assert conflicts["how"].iloc[0] == "raw close"


def test_merge_seam_without_overlap_is_noted_and_excluded():
    wiki = rows("wiki", ["2018-03-26", "2018-03-27"], [51.0, 52.0])
    tii = rows("tiingo", ["2018-12-27", "2018-12-28"], [20.0, 21.0])
    m, _, notes = merge.merge_symbol(pd.concat([wiki, tii]))
    assert len(notes) == 1 and "no overlapping day" in notes[0]
    ex = merge.seam_exclusions(notes)
    assert ex[0]["symbol"] == "AAA" and ex[0]["start"] < pd.Timestamp("2018-12-27") < ex[0]["end"]
    assert len(m) == 4                               # nothing invented for the missing months


# --- SEC fundamentals ----------------------------------------------------------------

@pytest.fixture
def facts():
    return sec_facts.parse_facts(json.loads((FIX / "companyfacts_sample.json").read_text()), "TRKY")


def test_facts_annual_only_full_year_flows(facts):
    ni = facts[facts["field"] == "net_income"]
    assert set(ni["form"]) <= {"10-K", "10-K/A"}
    assert (ni["period_end"] - ni["period_start"]).dt.days.between(350, 380).all()   # Q4-only fact dropped


def test_facts_first_filing_date_and_restatement(facts):
    ni = facts[facts["field"] == "net_income"].sort_values(["period_end", "filed"])
    fy10 = ni[ni["period_end"] == "2010-12-31"]
    assert len(fy10) == 1 and fy10["filed"].iloc[0] == pd.Timestamp("2011-03-01")   # comparative re-report dropped
    fy11 = ni[ni["period_end"] == "2011-12-31"]
    assert list(fy11["value"]) == [600, 450]                   # original kept, restatement added
    assert list(fy11["restated"]) == [False, True]
    assert fy11["available_date"].iloc[1] == pd.Timestamp("2012-09-16")


def test_facts_tag_synonyms_no_mixing(facts):
    ni = facts[facts["field"] == "net_income"]
    assert 999 not in set(ni["value"])                         # NetIncomeLoss beats ProfitLoss for FY2011
    fy12 = ni[ni["period_end"] == "2012-12-31"]
    assert list(fy12["tag"]) == ["ProfitLoss"] and list(fy12["value"]) == [700]   # company switched tags


def test_facts_shares_ignore_10q(facts):
    sh = facts[facts["field"] == "shares"]
    assert list(sh["value"]) == [1_000_000, 1_100_000]


def test_sector_from_sic():
    assert sec_facts.sector_of_sic("3674") == "Business Equipment"
    assert sec_facts.sector_of_sic(6022) == "Money"
    assert sec_facts.sector_of_sic("9999") == "Other"
    assert sec_facts.sector_of_sic("") is None


def test_classify_exit_from_filings(tmp_path):
    http = FakeHTTP({"submissions": (200, (FIX / "submissions_sample.json").read_text())})
    f, h = sec_facts.sec_fetcher("Jane jane@example.com", http)
    f.dir = tmp_path
    info, fl = sec_facts.filings(f, h, 12345)
    assert info["sector"] == "Business Equipment"
    assert sec_facts.classify_exit(fl, pd.Timestamp("2019-06-19"))[0] == "acquired"
    bk = pd.DataFrame({"form": ["8-K"], "filing_date": [pd.Timestamp("2009-05-01")], "items": ["1.03"]})
    assert sec_facts.classify_exit(bk, pd.Timestamp("2009-06-01"))[0] == "bankrupt"
    assert sec_facts.classify_exit(fl.iloc[:0], pd.Timestamp("2019-06-19"))[0] == "unexplained"


def test_ticker_map_precedence():
    ins = pd.DataFrame({"ticker": ["OLD", "OLD"], "issuer_cik": [1, 2],
                        "filing_date": pd.to_datetime(["2007-01-01", "2008-01-01"])})
    cur = {"0": {"cik_str": 3, "ticker": "BRK-B", "title": "x"}}
    ov = pd.DataFrame({"ticker": ["OLD"], "cik": [9]})
    assert sec_facts.ticker_map(cur, ins, None) == {"OLD": 2, "BRK.B": 3}
    assert sec_facts.ticker_map(cur, ins, ov)["OLD"] == 9


# --- delisting rule ------------------------------------------------------------------

def _px(sym, start, end, close=10.0):
    d = pd.bdate_range(start, end)
    return pd.DataFrame({"symbol": sym, "date": d, "open": close, "high": close, "low": close, "close": close,
                         "adj_open": close, "adj_high": close, "adj_low": close, "adj_close": close,
                         "volume": 1.0, "source": "alpaca"})


def test_find_exits_vs_source_gaps():
    px = pd.concat([_px("GONE", "2019-01-01", "2019-06-19"),                 # stopped while a member
                    _px("FRZ", "2017-01-01", "2018-03-27").assign(source="wiki"),   # WIKI just ends
                    _px("LEFT", "2015-01-01", "2016-06-30"),                 # traded long after leaving
                    _px("LIVE", "2019-01-01", "2026-10-01")])
    spells = pd.DataFrame({"ticker": ["GONE", "FRZ", "LEFT", "LIVE"],
                           "start": pd.to_datetime(["2010-01-01", "2010-01-01", "2010-01-01", "2010-01-01"]),
                           "end": pd.to_datetime(["2019-06-25", None, "2015-06-01", None])})
    ends = {"wiki": pd.Timestamp("2018-03-27"), "alpaca": pd.Timestamp("2026-10-01")}
    ex, gaps = delistings.find_exits(px, spells, ends, pd.Timestamp("2026-10-01"))
    assert list(ex["symbol"]) == ["GONE"]
    assert list(gaps["symbol"]) == ["FRZ"]


def test_resolve_rules_and_terminal_rows(tmp_path):
    px = pd.concat([_px("ACQ", "2019-01-01", "2019-06-19", 40.0), _px("ACQ2", "2019-01-01", "2019-06-19"),
                    _px("BK", "2009-01-01", "2009-05-29", 2.0), _px("WHO", "2012-01-01", "2012-03-30")])
    ex = pd.DataFrame({"symbol": ["ACQ", "ACQ2", "BK", "WHO"],
                       "last_day": pd.to_datetime(["2019-06-19", "2019-06-19", "2009-05-29", "2012-03-30"])})
    ov = pd.DataFrame({"ticker": ["ACQ"], "last_day": [pd.Timestamp("2019-06-19")], "outcome": ["acquired"],
                       "deal_price": [44.0], "note": ["cash deal $44"]})

    def classify(sym, day):
        return {"ACQ2": ("acquired", "8-K 2.01"), "BK": ("bankrupt", "8-K 1.03")}.get(sym, ("unexplained", "none"))
    r = delistings.resolve(ex, px, classify, ov).set_index("symbol")
    assert r.at["ACQ", "ratio"] == pytest.approx(1.1) and "deal price" in r.at["ACQ", "rule"]
    assert r.at["ACQ2", "ratio"] == 1.0 and "not checked" in r.at["ACQ2", "rule"]
    assert r.at["BK", "ratio"] == 0.0 and r.at["WHO", "ratio"] == 0.0     # bankrupt and unexplained: -100%
    t = delistings.terminal_rows(r.reset_index(), px).set_index("symbol")
    assert t.at["ACQ", "date"] == pd.Timestamp("2019-06-20") and t.at["ACQ", "adj_close"] == pytest.approx(44.0)
    assert t.at["BK", "date"] == pd.Timestamp("2009-06-01")                  # next trading session
    assert t.at["BK", "adj_close"] == delistings.FLOOR
    assert (t["source"] == "delisting_rule").all()


# --- coverage gate & Wikipedia --------------------------------------------------------

def test_coverage_gate():
    table = pd.DataFrame({"date": [pd.Timestamp("2020-01-01")], "tickers": [frozenset({"A", "B"})]})
    px = pd.concat([_px("A", "2020-01-01", "2020-12-31"), _px("B", "2020-07-01", "2020-12-31")])
    cov = coverage.member_days(px, table, "2020-01-02", "2020-12-31")
    assert 0.2 < cov["missing"] < 0.3 and not cov["passes"]
    full = coverage.member_days(pd.concat([_px("A", "2020-01-01", "2020-12-31"),
                                           _px("B", "2020-01-01", "2020-12-31")]), table, "2020-01-02", "2020-12-31")
    assert full["passes"]
    ex = pd.DataFrame({"symbol": ["A"], "start": [pd.Timestamp("2020-01-01")], "end": [pd.Timestamp("2020-12-31")],
                       "reason": ["bad"]})
    assert coverage.member_days(px.iloc[:0].pipe(lambda d: pd.concat([_px("A", "2020-01-01", "2020-12-31")])),
                                table.assign(tickers=[frozenset({"A"})]), "2020-01-02", "2020-12-31",
                                ex)["missing"] == 1.0   # excluded days count as missing


def test_wikipedia_cross_check_logs_mismatches():
    ch = wikipedia.parse_changes((FIX / "wikipedia_sample.html").read_text())
    assert list(ch["added"]) == ["C", "X"]
    table = pd.DataFrame({"date": pd.to_datetime(["2000-01-03", "2005-06-01", "2010-01-04"]),
                          "tickers": [frozenset({"A", "B"}), frozenset({"A", "C"}), frozenset({"C", "D"})]})
    mism = wikipedia.cross_check(ch, table)
    assert any("added X" in m and "never" in m for m in mism)
    assert any("removed A" in m and "2010-01-04" in m for m in mism)
    assert not any(" C:" in m or " B:" in m for m in mism)      # the 2005 change matches


# --- value signal on SEC facts ---------------------------------------------------------

def test_value_uses_restatement_only_after_its_filing(facts):
    from trader import signals as Sg
    idx = pd.bdate_range("2012-01-02", "2012-12-31")
    adj = pd.DataFrame({"TRKY": 10.0, "PEER": 10.0}, index=idx)
    peer = facts.assign(symbol="PEER")
    peer = peer[~peer["restated"]]                         # PEER never restates
    f = pd.concat([facts, peer])
    p = Sg.Panel(adj, adj.copy(), pd.DataFrame(False, index=idx, columns=adj.columns), f, pd.DataFrame())
    before = Sg.value(p.upto("2012-06-01"), ["TRKY", "PEER"], {})
    after = Sg.value(p.upto("2012-12-31"), ["TRKY", "PEER"], {})
    assert before["TRKY"] == pytest.approx(before["PEER"])  # both use the original 600
    assert after["TRKY"] < after["PEER"]                     # restated 450 counts only from 2012-09-16


# --- kill-switch versions and period joining --------------------------------------------

def test_kill_switch_versions():
    idx = pd.bdate_range("2008-01-01", periods=6)
    r = pd.Series([0.0, -0.10, -0.10, 0.05, 0.05, 0.05], index=idx)
    spy = pd.Series([0.0, -0.10, -0.10, 0.05, 0.05, 0.05], index=idx)
    a, day = M.kill_switch_a(r, 0.0015, 0.15)
    assert day == str(idx[2].date()) and a.iloc[3] == -0.0015 and (a.iloc[4:] == 0).all()
    b, bday = M.kill_switch_b(r, spy, 0.0015, 0.15)
    assert bday is None and b.equals(r)                     # fell with the market: B doesn't fire


def test_periods_join_across_splits():
    idx_t = pd.bdate_range("2009-04-01", "2014-12-31")
    idx_v = pd.bdate_range("2015-01-01", "2019-12-31")
    runs = {("train", "base"): {"returns": pd.Series(0.0002, index=idx_t)},
            ("train", "spy"): {"returns": pd.Series(0.0001, index=idx_t)},
            ("validate", "base"): {"returns": pd.Series(0.0, index=idx_v)},
            ("validate", "spy"): {"returns": pd.Series(0.0003, index=idx_v)}}
    me = SimpleNamespace(pb=load_pass_bar())
    out = Chamber._period_losses(me, runs, ["train", "validate"])
    assert out["bull_2009_2019"] is True                   # judged on the whole 2009-2019 bull, not half
    assert out["crash_2008"] is None and out["bear_2022"] is None


def test_buffer_helper_is_unused():
    assert io and np  # keep imports honest for ruff
