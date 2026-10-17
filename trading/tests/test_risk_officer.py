"""The most heavily tested file in the repo. Every hard limit has a test."""
import math
from datetime import timedelta

import pytest
from conftest import DAY, pos, prop

from trader import risk_officer as ro
from trader.risk_officer import ApprovedPlan, HaltState, is_genuine


def many(n, w, sector=lambda i: f"S{i}"):
    weights = {f"T{chr(65 + i // 26)}{chr(65 + i % 26)}": w for i in range(n)}
    sectors = {s: sector(i) for i, s in enumerate(weights)}
    return weights, sectors


# --- separation of powers ---------------------------------------------------

def test_nobody_else_can_mint_a_plan():
    with pytest.raises(PermissionError):
        ApprovedPlan(object(), DAY, {"AAPL": 0.01}, "x", ())
    with pytest.raises(PermissionError):
        ApprovedPlan(None, DAY, {"AAPL": 0.01}, "x", ())


def test_plan_targets_are_read_only(officer, acct):
    r = officer.review(acct(), [prop({"AAPL": 0.05})])
    with pytest.raises(TypeError):
        r.plan.targets["AAPL"] = 0.5
    assert is_genuine(r.plan)


def test_plan_records_constitution_hash(officer, acct):
    assert officer.review(acct(), [prop({"AAPL": 0.05})]).plan.constitution_sha == "test"


# --- per stock / sector / strategy limits -----------------------------------

def test_stock_clipped_to_5pct(officer, acct):
    r = officer.review(acct(), [prop({"AAPL": 0.20})])
    assert r.plan.targets["AAPL"] == pytest.approx(0.05)


def test_clipped_weight_is_not_redistributed(officer, acct):
    r = officer.review(acct(), [prop({"AAPL": 0.20, "MSFT": 0.01}, {"AAPL": "Tech", "MSFT": "Soft"})])
    assert r.plan.targets["MSFT"] == pytest.approx(0.01)
    assert sum(r.plan.targets.values()) <= 0.30 + 1e-12


def test_strategy_capped_at_30pct(officer, acct):
    w, s = many(100, 0.01)  # 100% invested, 100 sectors
    r = officer.review(acct(), [prop(w, s)])
    assert sum(r.plan.targets.values()) == pytest.approx(0.30)
    assert all(v == pytest.approx(0.003) for v in r.plan.targets.values())


def test_sector_capped_at_25pct(officer, constitution, acct):
    # two strategies, each 30%, all in one sector -> sector capped at 25%
    w1, s1 = many(6, 0.05, lambda i: "Energy")
    w2 = {"XOM": 0.05, "CVX": 0.05}
    r = officer.review(acct(), [prop(w1, s1), prop(w2, {"XOM": "Energy", "CVX": "Energy"}, strategy="value")])
    assert sum(r.plan.targets.values()) == pytest.approx(0.25)


def test_two_strategies_on_same_stock_still_capped(officer, acct):
    r = officer.review(acct(), [prop({"AAPL": 0.05}), prop({"AAPL": 0.05}, strategy="value")])
    assert r.plan.targets["AAPL"] == pytest.approx(0.05)


def test_sector_disagreement_drops_stock(officer, acct):
    r = officer.review(acct(), [prop({"AAPL": 0.03}, {"AAPL": "Tech"}),
                                prop({"AAPL": 0.03}, {"AAPL": "Retail"}, strategy="value"),
                                prop({"AAPL": 0.03}, {"AAPL": "Tech"}, strategy="lowvol")])
    assert "AAPL" not in r.plan.targets


def test_many_strategies_never_exceed_100pct(constitution, tmp_path, acct):
    officer = ro.RiskOfficer(constitution, HaltState(tmp_path), "t")
    props = []
    for k in range(5):  # 5 strategies x 30% = 150% before the final check
        w, s = many(30, 0.01, lambda i: f"S{i}")
        w = {f"{x}{chr(65 + k)}"[:5]: v for x, v in w.items()}
        s = {f"{x}{chr(65 + k)}"[:5]: v for x, v in s.items()}
        props.append(prop(w, s, strategy=f"st{k}"))
    r = officer.review(acct(), props)
    assert sum(r.plan.targets.values()) <= 1 + 1e-9


# --- forbidden instruments ---------------------------------------------------

def test_negative_weight_refuses_whole_proposal(officer, acct):
    r = officer.review(acct(), [prop({"AAPL": 0.05, "MSFT": -0.01})])
    assert r.plan.targets == {}
    assert any("shorting" in n for n in r.notes)


def test_leverage_refuses_whole_proposal(officer, acct):
    w, s = many(30, 0.05)  # 150%
    r = officer.review(acct(), [prop(w, s)])
    assert r.plan.targets == {}
    assert any("leverage" in n for n in r.notes)


@pytest.mark.parametrize("sym", ["AAPL  240119C00150000", "SPY240119P00400000", "aapl", "TOOLONG", "AB1", ""])
def test_non_stock_symbols_dropped(officer, acct, sym):
    r = officer.review(acct(), [prop({sym: 0.01, "MSFT": 0.01})])
    assert sym not in r.plan.targets
    assert "MSFT" in r.plan.targets


@pytest.mark.parametrize("sym", ["BRK.B", "BF-B", "A", "GOOGL"])
def test_class_share_tickers_allowed(officer, acct, sym):
    assert sym in officer.review(acct(), [prop({sym: 0.01})]).plan.targets


@pytest.mark.parametrize("bad", [math.nan, math.inf, -math.inf, "0.01", None, True])
def test_bad_weights_refuse_proposal(officer, acct, bad):
    r = officer.review(acct(), [prop({"AAPL": bad, "MSFT": 0.01})])
    assert r.plan.targets == {}


def test_missing_reason_refused(officer, acct):
    r = officer.review(acct(), [prop({"AAPL": 0.01}, reason="  ")])
    assert r.plan.targets == {}


def test_missing_sector_drops_stock(officer, acct):
    r = officer.review(acct(), [prop({"AAPL": 0.01, "MSFT": 0.01}, {"MSFT": "Tech"})])
    assert set(r.plan.targets) == {"MSFT"}


def test_zero_weights_ignored(officer, acct):
    assert officer.review(acct(), [prop({"AAPL": 0.0})]).plan.targets == {}


def test_one_bad_strategy_does_not_block_another(officer, acct):
    r = officer.review(acct(), [prop({"AAPL": -0.1}), prop({"MSFT": 0.02}, strategy="value")])
    assert dict(r.plan.targets) == {"MSFT": pytest.approx(0.02)}


# --- kill switch and pause ---------------------------------------------------

def test_15pct_drawdown_triggers_kill(officer, acct):
    r = officer.review(acct(equity=85.0, peak=100.0, sod=85.0), [prop({"AAPL": 0.01})])
    assert r.halted and r.plan is None
    assert officer.halt.killed()


def test_just_under_15pct_does_not_kill(officer, acct):
    r = officer.review(acct(equity=85.01, peak=100.0, sod=85.01), [prop({"AAPL": 0.01})])
    assert not r.halted and r.plan is not None


def test_kill_switch_survives_restart(constitution, tmp_path, acct):
    a = ro.RiskOfficer(constitution, HaltState(tmp_path), "t")
    a.review(acct(equity=80.0, peak=100.0, sod=80.0), [])
    b = ro.RiskOfficer(constitution, HaltState(tmp_path), "t")  # fresh process
    r = b.review(acct(equity=200.0, peak=200.0), [prop({"AAPL": 0.01})])
    assert r.halted and r.plan is None


def test_kill_switch_blocks_even_stop_loss_exits(officer, acct):
    officer.halt.kill("owner", "manual stop")
    r = officer.review(acct(positions={"AAPL": pos("AAPL", 100, 50)}), [])
    assert r.plan is None  # "stop everything" means no orders at all


def test_only_owner_phrase_restarts(officer, acct):
    officer.halt.kill("risk_officer", "dd")
    with pytest.raises(PermissionError):
        officer.halt.owner_restart("yes")
    assert officer.halt.killed()
    officer.halt.owner_restart("I AM THE OWNER AND I RESTART TRADING")
    assert not officer.halt.killed()


def test_risk_officer_has_no_restart_method(officer):
    assert not any("restart" in n or "unkill" in n for n in dir(ro.RiskOfficer))


def test_2pct_daily_loss_pauses_for_the_day(officer, acct):
    r = officer.review(acct(equity=98.0, sod=100.0, peak=100.0), [prop({"AAPL": 0.01})])
    assert r.paused and r.plan is None
    # later the same day, even after recovering: still paused
    assert officer.review(acct(equity=100.0, sod=100.0), [prop({"AAPL": 0.01})]).paused


def test_pause_lifts_next_day(officer, acct):
    officer.review(acct(equity=98.0, sod=100.0, peak=100.0), [])
    nxt = ro.AccountState(DAY + timedelta(days=1), 98.0, 98.0, 100.0)
    assert officer.review(nxt, [prop({"AAPL": 0.01})]).plan is not None


def test_small_daily_loss_ok(officer, acct):
    assert officer.review(acct(equity=98.5, sod=100.0, peak=100.0), [prop({"AAPL": 0.01})]).plan


# --- fail safe ---------------------------------------------------------------

def test_bad_data_means_no_trades(officer, acct):
    r = officer.review(acct(data_ok=False), [prop({"AAPL": 0.01})])
    assert r.plan is None


def test_broker_error_means_no_trades(officer, acct):
    r = officer.review(acct(broker_ok=False), [prop({"AAPL": 0.01})])
    assert r.plan is None


def test_kill_check_runs_even_when_data_bad(officer, acct):
    officer.review(acct(equity=80.0, peak=100.0, sod=80.0, data_ok=False), [])
    assert officer.halt.killed()


# --- stop-loss and time limit ------------------------------------------------

def test_stop_loss_forces_exit_and_blocks_rebuy(officer, acct):
    r = officer.review(acct(positions={"AAPL": pos("AAPL", 100, 85)}), [prop({"AAPL": 0.05})])
    assert "AAPL" not in r.plan.targets
    assert any("STOP-LOSS" in n for n in r.notes)


def test_no_stop_just_above_threshold(officer, acct):
    r = officer.review(acct(positions={"AAPL": pos("AAPL", 100, 85.01)}), [prop({"AAPL": 0.05})])
    assert "AAPL" in r.plan.targets


def test_unapproved_holdings_are_sold(officer, acct):
    r = officer.review(acct(positions={"OLD": pos("OLD")}), [prop({"AAPL": 0.05})])
    assert "OLD" not in r.plan.targets
    assert any("OLD" in n and "sell" in n for n in r.notes)


def test_overdue_positions_reported(officer, acct):
    a = acct(positions={"AAPL": pos("AAPL", approved=DAY - timedelta(days=46)),
                        "MSFT": pos("MSFT", approved=DAY - timedelta(days=45))})
    assert officer.overdue_positions(a) == ["AAPL"]


# --- invariants over random proposals ---------------------------------------

def test_random_proposals_never_break_limits(constitution, tmp_path):
    import random
    rng = random.Random(7)
    L = constitution.limits
    for trial in range(300):
        officer = ro.RiskOfficer(constitution, HaltState(tmp_path / str(trial)), "t")
        props = []
        for k in range(rng.randint(1, 4)):
            n = rng.randint(1, 40)
            syms = [rng.choice(["AAPL", "MSFT", "XOM", "JPM", "KO", "PG", "T", "GE", "F", "BRK.B"])
                    + "" for _ in range(n)]
            w = {s: rng.uniform(0, 1.0 / n) for s in syms}
            sec = {s: rng.choice(["A", "B", "C"]) for s in w}
            props.append(ro.Proposal(f"s{k}", DAY, w, sec, "r"))
        r = officer.review(ro.AccountState(DAY, 100, 100, 100), props)
        t = r.plan.targets
        assert all(0 < v <= L.max_weight_per_stock + 1e-12 for v in t.values())
        assert sum(t.values()) <= 1 + 1e-9
        sectors = {}
        for p in props:
            sectors.update(p.sectors)
        for sec in "ABC":
            assert sum(v for s, v in t.items() if sectors[s] == sec) <= L.max_weight_per_sector + 1e-9
