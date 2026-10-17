import sys
from datetime import date
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from trader.config import load_constitution  # noqa: E402
from trader.risk_officer import AccountState, HaltState, Position, Proposal, RiskOfficer  # noqa: E402

DAY = date(2026, 10, 16)


@pytest.fixture
def constitution():
    return load_constitution()


@pytest.fixture
def officer(constitution, tmp_path):
    return RiskOfficer(constitution, HaltState(tmp_path / "state"), constitution_sha="test")


@pytest.fixture
def acct():
    def make(equity=100.0, sod=None, peak=None, positions=None, **kw):
        return AccountState(DAY, equity, sod if sod is not None else equity,
                            peak if peak is not None else equity, positions or {}, **kw)
    return make


def prop(weights, sectors=None, strategy="momentum", reason="top 20% by 12-1 momentum"):
    sectors = sectors if sectors is not None else {s: "Tech" for s in weights}
    return Proposal(strategy, DAY, weights, sectors, reason)


def pos(sym, entry=100.0, price=100.0, approved=DAY, qty=1.0):
    return Position(sym, qty, entry, price, approved)
