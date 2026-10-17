from datetime import datetime, timedelta, timezone

import pytest
from pydantic import ValidationError

from trader import amend
from trader.config import CONSTITUTION_PATH, load_pass_bar, parse_constitution
from trader.logbook import Logbook

BASE = CONSTITUTION_PATH.read_text()


def test_real_files_load(constitution):
    assert constitution.limits.max_weight_per_stock == 0.05
    pb = load_pass_bar()
    assert pb.costs.base_per_side == 0.0015 and pb.costs.stress_per_side == 0.0030
    assert pb.splits.vault_start == "2021-01-01"


@pytest.mark.parametrize("old,new", [
    ("max_weight_per_stock = 0.05", "max_weight_per_stok = 0.05"),     # typo
    ("max_weight_per_stock = 0.05", "max_weight_per_stock = 0.5"),     # looser than the handoff
    ("drawdown_kill = 0.15", "drawdown_kill = 0.30"),
    ("daily_loss_pause = 0.02", "daily_loss_pause = 0.10"),
    ("shorting = true", "shorting = false"),
    ("wait_hours = 24", "wait_hours = 1"),
    ("no_loosening_during_drawdown = true", "no_loosening_during_drawdown = false"),
    ("stop_loss = 0.15", 'stop_loss = "15%"'),
])
def test_bad_constitution_fails_loudly(old, new):
    with pytest.raises(ValidationError):
        parse_constitution(BASE.replace(old, new))


def test_logbook_append_and_verify(tmp_path):
    lb = Logbook(tmp_path / "d.jsonl")
    for i in range(5):
        lb.record("risk_officer", "approve", f"reason {i}", n=i)
    assert lb.verify() == (True, "log intact")
    assert [e["details"]["n"] for e in lb.entries()] == list(range(5))


def test_logbook_detects_deleted_line(tmp_path):
    lb = Logbook(tmp_path / "d.jsonl")
    for i in range(4):
        lb.record("x", "y", f"r{i}")
    lines = lb.path.read_text().splitlines()
    lb.path.write_text("\n".join(lines[:1] + lines[2:]) + "\n")
    ok, msg = lb.verify()
    assert not ok and "line 2" in msg


def test_logbook_detects_edit(tmp_path):
    lb = Logbook(tmp_path / "d.jsonl")
    lb.record("x", "y", "first")
    lb.record("x", "y", "second")
    lb.path.write_text(lb.path.read_text().replace("first", "FIRST"))
    assert not lb.verify()[0]


def test_logbook_requires_reason(tmp_path):
    with pytest.raises(ValueError):
        Logbook(tmp_path / "d.jsonl").record("x", "y", "")


# --- amendments ---------------------------------------------------------------

@pytest.fixture
def paths(tmp_path):
    c = tmp_path / "constitution.toml"
    c.write_text(BASE)
    lb = Logbook(tmp_path / "log.jsonl")
    p = dict(path=c, lock=tmp_path / "lock.json")
    amend.approve_initial(amend.OWNER_PHRASE, log=lb, **p)
    return c, p, tmp_path / "pending.json", lb


def test_locked_file_loads(paths):
    c, p, _, _ = paths
    amend.load_verified(**p)


def test_silent_edit_refused(paths):
    c, p, _, _ = paths
    c.write_text(BASE.replace("stop_loss = 0.15", "stop_loss = 0.10"))
    with pytest.raises(amend.ConstitutionError):
        amend.load_verified(**p)


def test_amendment_needs_24h(paths):
    c, p, pend, lb = paths
    c.write_text(BASE.replace("stop_loss = 0.15", "stop_loss = 0.10"))
    t0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
    amend.propose(c, pend, now=t0)
    with pytest.raises(amend.ConstitutionError):
        amend.approve(amend.OWNER_PHRASE, False, pending=pend, now=t0 + timedelta(hours=23), log=lb, **p)
    amend.approve(amend.OWNER_PHRASE, False, pending=pend, now=t0 + timedelta(hours=24), log=lb, **p)
    amend.load_verified(**p)


def test_no_loosening_in_drawdown(paths):
    c, p, pend, lb = paths
    c.write_text(BASE.replace("stop_loss = 0.15", "stop_loss = 0.20"))  # looser
    t0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
    amend.propose(c, pend, now=t0)
    with pytest.raises(amend.ConstitutionError, match="drawdown"):
        amend.approve(amend.OWNER_PHRASE, True, pending=pend, now=t0 + timedelta(days=2), log=lb, **p)


def test_tightening_allowed_in_drawdown(paths):
    c, p, pend, lb = paths
    c.write_text(BASE.replace("stop_loss = 0.15", "stop_loss = 0.10"))
    t0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
    amend.propose(c, pend, now=t0)
    amend.approve(amend.OWNER_PHRASE, True, pending=pend, now=t0 + timedelta(days=2), log=lb, **p)


def test_edit_after_propose_restarts_wait(paths):
    c, p, pend, lb = paths
    t0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
    c.write_text(BASE.replace("stop_loss = 0.15", "stop_loss = 0.10"))
    amend.propose(c, pend, now=t0)
    c.write_text(BASE.replace("stop_loss = 0.15", "stop_loss = 0.12"))
    with pytest.raises(amend.ConstitutionError, match="propose again"):
        amend.approve(amend.OWNER_PHRASE, False, pending=pend, now=t0 + timedelta(days=2), log=lb, **p)


def test_wrong_phrase_refused(paths):
    c, p, pend, lb = paths
    amend.propose(c, pend)
    with pytest.raises(PermissionError):
        amend.approve("yes", False, pending=pend, log=lb, **p)


def test_going_live_counts_as_loosening():
    old = parse_constitution(BASE)
    new = parse_constitution(BASE.replace("paper_only = true", "paper_only = false"))
    assert amend.loosened(old, new)
