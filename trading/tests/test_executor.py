from types import SimpleNamespace

import pytest
from conftest import prop

from trader.executor import Executor, ExecutorRefused, plan_orders
from trader.logbook import Logbook


class FakeBroker:
    def __init__(self, equity=100.0, positions=None, fail=False):
        self.equity, self.positions, self.fail, self.sent, self.closed = equity, positions or {}, fail, [], []

    def get_account(self):
        return SimpleNamespace(equity=str(self.equity))

    def get_all_positions(self):
        return [SimpleNamespace(symbol=s, market_value=str(v)) for s, v in self.positions.items()]

    def submit_order(self, req):
        if self.fail:
            raise RuntimeError("broker down")
        self.sent.append(req)

    def close_position(self, sym):
        self.closed.append(sym)


@pytest.fixture
def plan(officer, acct):
    return officer.review(acct(), [prop({"AAPL": 0.05, "MSFT": 0.05})]).plan


def test_refuses_without_paper_flag(monkeypatch, tmp_path):
    monkeypatch.delenv("ALPACA_PAPER", raising=False)
    with pytest.raises(ExecutorRefused):
        Executor(Logbook(tmp_path / "l"), FakeBroker())
    monkeypatch.setenv("ALPACA_PAPER", "false")
    with pytest.raises(ExecutorRefused):
        Executor(Logbook(tmp_path / "l"), FakeBroker())


def test_refuses_fake_plans(monkeypatch, tmp_path):
    monkeypatch.setenv("ALPACA_PAPER", "true")
    ex = Executor(Logbook(tmp_path / "l"), FakeBroker())
    fake = SimpleNamespace(targets={"AAPL": 1.0}, reasons=(), asof=None)
    with pytest.raises(ExecutorRefused):
        ex.execute(fake)
    with pytest.raises(ExecutorRefused):
        plan_orders(fake, 100, {})


def test_orders_sells_first_and_skip_dust(plan):
    orders = plan_orders(plan, 1000.0, {"OLD": 30.0, "AAPL": 49.5})
    assert [o.side for o in orders] == ["sell", "buy"]       # AAPL diff $0.50 skipped
    assert orders[0].symbol == "OLD" and orders[1].notional == 50.0


def test_execute_logs_and_closes_full_exits(monkeypatch, tmp_path, plan):
    monkeypatch.setenv("ALPACA_PAPER", "true")
    b = FakeBroker(1000.0, {"OLD": 30.0})
    lb = Logbook(tmp_path / "l")
    Executor(lb, b).execute(plan)
    assert b.closed == ["OLD"] and len(b.sent) == 2
    assert lb.verify()[0] and len(lb.entries()) == 3


def test_broker_error_stops(monkeypatch, tmp_path, plan):
    monkeypatch.setenv("ALPACA_PAPER", "true")
    lb = Logbook(tmp_path / "l")
    with pytest.raises(RuntimeError):
        Executor(lb, FakeBroker(fail=True)).execute(plan)
    assert lb.entries()[-1]["action"] == "halt_on_error"


def test_dry_run_sends_nothing(monkeypatch, tmp_path, plan):
    monkeypatch.setenv("ALPACA_PAPER", "true")
    b = FakeBroker()
    Executor(Logbook(tmp_path / "l"), b).execute(plan, dry_run=True)
    assert b.sent == []
