"""End-to-end chamber on synthetic data: splits, vault lock, counting, no peeking."""
import numpy as np
import pandas as pd
import pandas_market_calendars as mcal
import pytest

from trader.chamber import chamber as chamber_mod
from trader.chamber import engine
from trader.chamber.chamber import SINGLE, Candidate, Chamber, combine, month_ends
from trader.chamber.registry import Registry, VaultLocked

N = 40


@pytest.fixture(scope="module")
def data():
    days = mcal.get_calendar("XNYS").valid_days("2001-01-02", "2022-06-30").tz_localize(None)
    rng = np.random.default_rng(11)
    rows = []
    syms = [f"S{chr(65 + i // 26)}{chr(65 + i % 26)}" for i in range(N)]
    for i, s in enumerate(syms + ["SPY"]):
        drift = 0.0003 + (0.0002 if s == "SPY" else 0.00001 * i)
        p = 50 * np.exp(np.cumsum(rng.normal(drift, 0.015, len(days))))
        rows.append(pd.DataFrame({"symbol": s, "date": days, "adj_open": p, "adj_high": p, "adj_low": p,
                                  "adj_close": p, "close": p, "volume": 1e9}))
    prices = pd.concat(rows, ignore_index=True)
    prof = pd.DataFrame({"symbol": syms, "sector": [f"Sec{i % 8}" for i in range(N)]})
    members = pd.DataFrame({"date": [pd.Timestamp("1996-01-02")], "tickers": [frozenset(syms)]})
    return prices, prof, members


@pytest.fixture
def chamber(data, tmp_path, monkeypatch):
    monkeypatch.setattr(engine, "ZIPLINE_ROOT", tmp_path.parent / "zroot_shared")
    monkeypatch.setattr(chamber_mod, "BENCH_CACHE", tmp_path / "bench")
    prices, prof, members = data
    return Chamber(prices, prof, member_table=members, registry=Registry(tmp_path / "reg.jsonl"),
                   synthetic=True, reports=tmp_path / "reports")


def test_month_ends_include_day_before_start():
    idx = pd.bdate_range("2020-01-01", "2020-04-30")
    m = month_ends(idx, "2020-02-01", "2020-04-30")
    assert m[0] == pd.Timestamp("2020-01-31")
    assert pd.Timestamp("2020-04-30") not in m


def test_panel_cut_at_split_end(chamber):
    p = chamber.panel("2014-12-31")
    assert p.adj_close.index.max() <= pd.Timestamp("2014-12-31")


def test_signals_only_see_the_past(chamber):
    seen = []

    def spy_on(p, members, skipped):
        seen.append(p.adj_close.index[-1])
        return SINGLE["momentum"].score(p, members, skipped)
    cand = Candidate("peek_check", spy_on, "test")
    panel = chamber.panel("2014-12-31")
    sched, _ = chamber.schedule(cand, panel, "2010-01-01", "2010-12-31")
    assert seen == sorted(sched)  # each decision saw data exactly up to its own date


def test_vault_refused_without_validation(chamber):
    with pytest.raises(VaultLocked):
        chamber.vault_test(SINGLE["momentum"])
    with pytest.raises(VaultLocked):
        chamber._run(SINGLE["momentum"], "vault", 0.0015)


def test_full_evaluation_and_one_vault_run(chamber):
    out = chamber.evaluate(SINGLE["momentum"])
    v = out["verdict"]
    assert set(v["periods"]) == {"crash_2008", "bull_2009_2019", "crash_2020", "bear_2022"}
    assert v["periods"]["bear_2022"] is None          # vault period not seen yet
    assert v["periods"]["crash_2008"] is not None
    assert ("validate", "stress") in out["runs"]
    base = out["runs"][("validate", "base")]["returns"]
    stress = out["runs"][("validate", "stress")]["returns"]
    assert (1 + base).prod() > (1 + stress).prod()     # harsher costs cost more
    assert base.index.max() <= pd.Timestamp("2020-12-31")
    runs = chamber.reg.runs()
    assert len(runs) == 8                              # 2 splits x (SPY, EW, base, stress)
    assert (chamber.reports / "momentum_validation.md").exists()
    assert "SYNTHETIC" in (chamber.reports / "momentum_validation.md").read_text()

    # force the gate open to test the vault mechanics: one run, then locked forever
    chamber.reg.mark_passed_validation("momentum", {"forced": "test"})
    res = chamber.vault_test(SINGLE["momentum"])
    assert res["verdict"]["periods"]["bear_2022"] is not None
    assert res["runs"][("vault", "base")]["returns"].index.min() >= pd.Timestamp("2021-01-01")
    with pytest.raises(VaultLocked):
        chamber.vault_test(SINGLE["momentum"])


def test_synthetic_runs_do_not_count(chamber):
    chamber.evaluate(SINGLE["low_vol"])
    assert chamber.reg.total_runs() == 0 and chamber.reg.candidates_tried() == []


def test_combination_needs_reason():
    with pytest.raises(ValueError):
        combine("x", " ", SINGLE["momentum"], SINGLE["value"])


def test_portfolio_respects_limits(chamber):
    panel = chamber.panel("2014-12-31")
    sched, _ = chamber.schedule(SINGLE["momentum"], panel, "2005-01-01", "2005-12-31")
    for w in sched.values():
        assert len(w) == 8                       # top 20% of 40
        assert max(w.values()) <= 0.05 + 1e-12   # 1/8 = 12.5% clipped to 5%
        assert sum(w.values()) <= 1
