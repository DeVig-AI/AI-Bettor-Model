import io
import json
import zipfile
from datetime import date

import numpy as np
import pandas as pd
import pytest

from trader import signals as S
from trader.data import auditor, fmp, membership, sec_insider
from trader.portfolio import apply_limits, top_fraction

# --- membership ---------------------------------------------------------------

TABLE = pd.DataFrame({"date": pd.to_datetime(["2000-01-03", "2005-06-01", "2010-01-04"]),
                      "tickers": [frozenset({"A", "B"}), frozenset({"A", "C"}), frozenset({"C", "D"})]})


def test_members_point_in_time():
    assert membership.members_on("1999-12-31", TABLE) == frozenset()
    assert membership.members_on("2005-05-31", TABLE) == {"A", "B"}
    assert membership.members_on("2005-06-01", TABLE) == {"A", "C"}
    assert membership.all_tickers_since("2001-01-01", TABLE) == ["A", "B", "C", "D"]


def test_membership_intervals():
    iv = membership.intervals(TABLE).set_index("ticker")
    assert iv.at["B", "end"] == pd.Timestamp("2005-06-01")
    assert pd.isna(iv.at["D", "end"])


def test_real_membership_file_has_bankrupt_names():
    assert "LEHMQ" in membership.members_on("2008-09-12")
    assert 480 < len(membership.members_on("2008-09-12")) < 520
    assert membership.to_fmp("BRK.B") == "BRK-B"


# --- FMP client -----------------------------------------------------------------

class FakeHTTP:
    def __init__(self, status=200, body=None):
        self.calls, self.status, self.body = 0, status, body if body is not None else [{"date": "2020-01-02"}]

    def get(self, url, params=None, timeout=None):
        self.calls += 1
        r = type("R", (), {})()
        r.status_code, r.content = self.status, json.dumps(self.body).encode()
        r.json = lambda: self.body
        r.text = json.dumps(self.body)
        return r


def test_fmp_caches_and_never_refetches(tmp_path):
    http = FakeHTTP()
    c = fmp.FMP("k", tmp_path, http, daily_budget=5, today=date(2026, 1, 1))
    c.prices_adjusted("AAPL")
    c.prices_adjusted("AAPL")
    assert http.calls == 1 and c.used_today() == 1


def test_fmp_budget_stops(tmp_path):
    c = fmp.FMP("k", tmp_path, FakeHTTP(), daily_budget=2, today=date(2026, 1, 1))
    c.profile("A")
    c.profile("B")
    with pytest.raises(fmp.BudgetExhausted):
        c.profile("C")
    # tomorrow the budget resets, and the cached ones are still free
    c2 = fmp.FMP("k", tmp_path, FakeHTTP(), daily_budget=2, today=date(2026, 1, 2))
    c2.profile("A")
    assert c2.used_today() == 0


def test_fmp_plan_restriction_detected(tmp_path):
    c = fmp.FMP("k", tmp_path, FakeHTTP(402, {"Error Message": "Premium endpoint"}), today=date(2026, 1, 1))
    rec = c.delisted(0)
    assert fmp.restricted(rec) and fmp.rows(rec) == []


def test_fmp_needs_key(tmp_path):
    with pytest.raises(ValueError):
        fmp.FMP("", tmp_path)


# --- SEC insider ------------------------------------------------------------------

def _zip(sub, own, tx):
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w") as z:
        for name, rows in (("SUBMISSION.tsv", sub), ("REPORTINGOWNER.tsv", own), ("NONDERIV_TRANS.tsv", tx)):
            z.writestr(name, "\n".join("\t".join(r) for r in rows))
    return b.getvalue()


def test_sec_parse_keeps_only_officer_director_open_market_buys():
    sub = [["ACCESSION_NUMBER", "FILING_DATE", "ISSUERCIK", "ISSUERTRADINGSYMBOL", "DOCUMENT_TYPE"],
           ["a1", "15-MAR-2010", "320193", "aapl", "4"], ["a2", "16-MAR-2010", "320193", "AAPL", "4"],
           ["a3", "17-MAR-2010", "320193", "AAPL", "4"], ["a4", "18-MAR-2010", "320193", "AAPL", "3"]]
    own = [["ACCESSION_NUMBER", "RPTOWNERCIK", "RPTOWNER_RELATIONSHIP"],
           ["a1", "1", "Director"], ["a2", "2", "TenPercentOwner"], ["a3", "3", "Officer"], ["a4", "4", "Officer"]]
    tx = [["ACCESSION_NUMBER", "TRANS_DATE", "TRANS_CODE", "TRANS_ACQUIRED_DISP_CD", "TRANS_SHARES",
           "TRANS_PRICEPERSHARE"],
          ["a1", "12-MAR-2010", "P", "A", "100", "200"],    # director buy: keep
          ["a2", "12-MAR-2010", "P", "A", "100", "200"],    # 10% owner, not officer/director: drop
          ["a3", "12-MAR-2010", "M", "A", "100", "0"],      # option exercise: drop
          ["a3", "12-MAR-2010", "S", "D", "100", "200"],    # sale: drop
          ["a4", "12-MAR-2010", "P", "A", "100", "200"]]    # Form 3, not 4: drop
    df = sec_insider.parse_quarter(_zip(sub, own, tx))
    assert list(df["owner_cik"]) == [1]
    assert df["ticker"].iloc[0] == "AAPL"
    assert df["filing_date"].iloc[0] == pd.Timestamp("2010-03-15")


def test_sec_quarters_and_user_agent():
    q = sec_insider.quarters(last=(2007, 2))
    assert q[0] == "2006q1" and q[-1] == "2007q1"
    with pytest.raises(ValueError):
        sec_insider.download("no email here")


# --- auditor ------------------------------------------------------------------------

def _px(sym, vals, start="2020-01-02"):
    import pandas_market_calendars as mcal
    d = mcal.get_calendar("XNYS").valid_days(start, "2021-12-31").tz_localize(None)[:len(vals)]
    return pd.DataFrame({"symbol": sym, "date": d, "adj_close": vals, "adj_open": vals, "volume": 1.0})


def test_auditor_flags_spike_gap_future_and_bad_rows():
    v = [10.0] * 60
    v[30] = 30.0                                     # spike that reverses
    a = _px("AAA", v)
    a = a.drop(index=range(40, 48))                 # 8-day gap
    bad = pd.DataFrame({"symbol": ["AAA", "AAA"], "date": [pd.Timestamp("2099-01-01"), pd.Timestamp("2020-06-01")],
                        "adj_close": [10.0, -5.0], "adj_open": [10.0, 1.0], "volume": [1.0, 1.0]})
    res = auditor.AuditResult()
    out = auditor.audit_prices(pd.concat([a, bad], ignore_index=True), date(2026, 1, 1), res)
    assert out["date"].max() < pd.Timestamp("2099-01-01")
    assert (out["adj_close"] > 0).all()
    reasons = " ".join(e["reason"] for e in res.exclusions)
    assert "spike" in reasons and "gap" in reasons


def test_auditor_survivorship_check_goes_red():
    spells = pd.DataFrame({"ticker": ["OLD1", "OLD2", "OLD3", "NOW"],
                           "start": pd.to_datetime(["2001-01-02"] * 4),
                           "end": pd.to_datetime(["2005-01-03", "2006-01-03", "2007-01-03", None])})
    px = _px("NOW", [1.0] * 5, start="2001-01-02")
    res = auditor.AuditResult()
    auditor.audit_coverage(px, spells, "2001-01-01", res)
    assert res.fatal
    assert {e["symbol"] for e in res.exclusions} == {"OLD1", "OLD2", "OLD3"}


def test_auditor_drops_insider_rows_for_wrong_company():
    ins = pd.DataFrame({"filing_date": pd.to_datetime(["2020-01-05", "2020-01-05"]),
                        "trans_date": pd.to_datetime(["2020-01-02", "2020-01-02"]),
                        "issuer_cik": [111, 999], "ticker": ["AAA", "AAA"], "owner_cik": [1, 2]})
    prof = pd.DataFrame({"symbol": ["AAA"], "cik": ["0000000111"]})
    res = auditor.AuditResult()
    out = auditor.audit_insider(ins, prof, date(2026, 1, 1), res)
    assert list(out["issuer_cik"]) == [111]


def test_auditor_fundamentals_impossible_dates():
    fd = pd.DataFrame({"symbol": ["A", "A"], "period_end": pd.to_datetime(["2020-03-31", "2020-06-30"]),
                       "filing_date": pd.to_datetime(["2020-02-01", "2020-08-01"])})
    out = auditor.audit_fundamentals(fd, date(2026, 1, 1), auditor.AuditResult())
    assert len(out) == 1


# --- signals ---------------------------------------------------------------------------

def panel(adj, close=None, excluded=None, fund=None, ins=None):
    adj = pd.DataFrame(adj)
    return S.Panel(adj, close if close is not None else adj.copy(),
                   excluded if excluded is not None else pd.DataFrame(False, index=adj.index, columns=adj.columns),
                   fund if fund is not None else pd.DataFrame(), ins if ins is not None else pd.DataFrame())


IDX = pd.bdate_range("2018-01-01", periods=300)


def test_momentum_skips_last_month():
    a = np.r_[np.full(300 - 21, 100.0), np.full(21, 50.0)]   # crash in the last month only
    b = np.linspace(100, 120, 300)
    p = panel(pd.DataFrame({"A": a, "B": b}, index=IDX))
    sk = {}
    m = S.momentum(p, ["A", "B"], sk)
    assert m["A"] == pytest.approx(0.0)                    # the recent crash is ignored
    assert m["B"] > 0


def test_momentum_skips_short_history_and_excluded():
    df = pd.DataFrame({"A": np.linspace(1, 2, 300), "B": np.r_[np.full(100, np.nan), np.linspace(1, 2, 200)],
                       "C": np.linspace(1, 2, 300)}, index=IDX)
    ex = pd.DataFrame(False, index=IDX, columns=df.columns)
    ex.iloc[200, 2] = True
    sk = {}
    m = S.momentum(panel(df, excluded=ex), ["A", "B", "C"], sk)
    assert list(m.index) == ["A"]
    assert {s for s, _ in sk["momentum"]} == {"B", "C"}


def test_low_vol_ranks_calm_higher():
    rng = np.random.default_rng(0)
    df = pd.DataFrame({"CALM": 100 * np.exp(np.cumsum(rng.normal(0, 0.005, 300))),
                       "WILD": 100 * np.exp(np.cumsum(rng.normal(0, 0.03, 300)))}, index=IDX)
    v = S.low_volatility(panel(df), ["CALM", "WILD"], {})
    assert v["CALM"] > v["WILD"]


def test_value_uses_only_filed_data_and_split_adjusts():
    idx = pd.bdate_range("2019-01-01", periods=300)
    adj = pd.DataFrame({"CHP": 10.0, "EXP": 10.0}, index=idx)
    raw = adj.copy()
    raw.loc[:idx[289], "CHP"] = 20.0       # 2:1 split on day 290, after the last filing
    rows = []
    for sym, ni, eq in (("CHP", 10.0, 100.0), ("EXP", 1.0, 50.0)):
        for pe in pd.date_range("2019-03-31", periods=4, freq="QE"):
            rows.append({"symbol": sym, "period_end": pe, "available_date": pe + pd.Timedelta(days=30),
                         "net_income": ni, "shares": 10.0, "equity": eq})
    fund = pd.DataFrame(rows)
    assert fund["available_date"].max() < idx[290]
    v = S.value(panel(adj, close=raw, fund=fund).upto(idx[-1]), ["CHP", "EXP"], {})
    # CHP truly has 20 shares x $10 = $200 cap -> B/M 0.5, same as EXP (50/100): tied B/M rank.
    # Without the split fix CHP's cap would be $100 and its B/M would rank alone at the top (score 1.0).
    assert v["CHP"] == pytest.approx(0.875) and v["EXP"] == pytest.approx(0.625)
    early = panel(adj, close=raw, fund=fund).upto(pd.Timestamp("2019-06-01"))
    assert S.value(early, ["CHP", "EXP"], {}).empty   # 4 quarters not yet filed


def test_insider_counts_distinct_buyers_last_90_days():
    idx = pd.bdate_range("2020-01-01", periods=200)
    adj = pd.DataFrame({"A": 1.0, "B": 1.0}, index=idx)
    ins = pd.DataFrame({"ticker": ["A", "A", "A", "B"], "owner_cik": [1, 1, 2, 3],
                        "filing_date": [idx[-5], idx[-10], idx[-20], idx[-150]]})
    s = S.insider_buying(panel(adj, ins=ins).upto(idx[-1]), ["A", "B"], {})
    assert dict(s) == {"A": 2.0}


def test_top_fraction_and_limits():
    sc = pd.Series({"A": 3.0, "B": 2.0, "C": 2.0, "D": 1.0, "E": 0.5})
    assert top_fraction(sc, 10) == ["A", "B"]          # ceil(20% of 10) = 2; tie broken by name
    w, notes = apply_limits({"A": 0.2, "B": 0.2, "C": 0.2}, {"A": "X", "B": "X", "C": None}, 0.05, 0.08)
    assert "C" not in w and sum(w.values()) == pytest.approx(0.08)
