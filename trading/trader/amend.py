"""Constitution amendments: owner only, 24-hour wait, no loosening during a drawdown.

    python -m trader.amend status
    python -m trader.amend propose     # after the owner edits config/constitution.toml
    python -m trader.amend approve     # owner, at least 24h after propose

The risk officer only loads a constitution whose hash matches the approved lock.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .config import CONFIG_DIR, CONSTITUTION_PATH, Constitution, file_sha256, parse_constitution
from .logbook import Logbook

LOCK_PATH = CONFIG_DIR / "constitution.lock.json"
PENDING_PATH = CONFIG_DIR / "constitution.pending.json"
OWNER_PHRASE = "I AM THE OWNER AND I APPROVE THIS AMENDMENT"

# For each limit: is a bigger number looser? (True = bigger is riskier)
_LOOSER_IF_BIGGER = {
    "max_weight_per_stock": True, "max_weight_per_sector": True,
    "max_weight_per_strategy": True, "daily_loss_pause": True, "drawdown_kill": True,
    "stop_loss": True, "max_days_without_reapproval": True,
}


class ConstitutionError(RuntimeError):
    pass


def loosened(old: Constitution, new: Constitution) -> list[str]:
    out = []
    for k, bigger_is_looser in _LOOSER_IF_BIGGER.items():
        a, b = getattr(old.limits, k), getattr(new.limits, k)
        if (b > a) if bigger_is_looser else (b < a):
            out.append(f"{k}: {a} -> {b}")
    if old.mode.paper_only and not new.mode.paper_only:
        out.append("mode.paper_only: true -> false")
    if new.mode.min_paper_months < old.mode.min_paper_months:
        out.append("mode.min_paper_months lowered")
    return out


def load_verified(path: Path = CONSTITUTION_PATH, lock: Path = LOCK_PATH) -> tuple[Constitution, str]:
    """Return the constitution only if it is the approved one. Otherwise refuse."""
    c = parse_constitution(Path(path).read_text())
    sha = file_sha256(path)
    if not Path(lock).exists():
        raise ConstitutionError("No approved constitution lock. Owner: run `python -m trader.amend approve-initial`.")
    if json.loads(Path(lock).read_text())["sha256"] != sha:
        raise ConstitutionError("Constitution file changed without an approved amendment. Trading refused.")
    return c, sha


def propose(path: Path = CONSTITUTION_PATH, pending: Path = PENDING_PATH,
            now: datetime | None = None) -> dict:
    parse_constitution(Path(path).read_text())  # must at least be valid
    rec = {"sha256": file_sha256(path), "text": Path(path).read_text(),
           "proposed_at": (now or datetime.now(timezone.utc)).isoformat()}
    Path(pending).write_text(json.dumps(rec, indent=1))
    return rec


def approve(typed: str, in_drawdown: bool, path: Path = CONSTITUTION_PATH,
            lock: Path = LOCK_PATH, pending: Path = PENDING_PATH,
            now: datetime | None = None, log: Logbook | None = None) -> None:
    if typed != OWNER_PHRASE:
        raise PermissionError("approval refused: wrong confirmation phrase")
    if not Path(pending).exists():
        raise ConstitutionError("nothing proposed")
    rec = json.loads(Path(pending).read_text())
    if rec["sha256"] != file_sha256(path):
        raise ConstitutionError("file changed after it was proposed; propose again (restarts the 24h wait)")
    new = parse_constitution(rec["text"])
    old_text = json.loads(Path(lock).read_text())["text"] if Path(lock).exists() else None
    wait = timedelta(hours=new.amendments.wait_hours)
    if old_text is not None:
        old = parse_constitution(old_text)
        wait = max(wait, timedelta(hours=old.amendments.wait_hours))
        loose = loosened(old, new)
        if loose and in_drawdown:
            raise ConstitutionError("limits can't be loosened during a drawdown: " + "; ".join(loose))
    now = now or datetime.now(timezone.utc)
    if now - datetime.fromisoformat(rec["proposed_at"]) < wait:
        raise ConstitutionError(f"must wait {wait} after proposing")
    Path(lock).write_text(json.dumps({"sha256": rec["sha256"], "text": rec["text"],
                                      "approved_at": now.isoformat()}, indent=1))
    Path(pending).unlink()
    (log or Logbook()).record("owner", "amend_constitution", "owner approved amendment",
                              sha256=rec["sha256"])


def approve_initial(typed: str, path: Path = CONSTITUTION_PATH, lock: Path = LOCK_PATH,
                    log: Logbook | None = None) -> None:
    """First-ever lock. No wait, because there is nothing to loosen yet."""
    if typed != OWNER_PHRASE:
        raise PermissionError("approval refused: wrong confirmation phrase")
    if Path(lock).exists():
        raise ConstitutionError("already locked; use propose + approve")
    parse_constitution(Path(path).read_text())
    Path(lock).write_text(json.dumps({"sha256": file_sha256(path), "text": Path(path).read_text(),
                                      "approved_at": datetime.now(timezone.utc).isoformat()}, indent=1))
    (log or Logbook()).record("owner", "lock_constitution", "initial constitution approved")


def _in_drawdown() -> bool:
    from .risk_officer import STATE_DIR
    f = STATE_DIR / "account.json"
    if not f.exists():
        return True  # unknown: assume the worst
    a = json.loads(f.read_text())
    return a["equity"] < a["peak_equity"]


def main(argv: list[str]) -> int:
    cmd = argv[0] if argv else "status"
    if cmd == "status":
        try:
            load_verified()
            print("Constitution is approved and unchanged.")
        except ConstitutionError as e:
            print(e)
        if PENDING_PATH.exists():
            print("Pending amendment proposed at", json.loads(PENDING_PATH.read_text())["proposed_at"])
        return 0
    if cmd == "propose":
        print("Proposed. Approve no sooner than 24h from now:", propose()["proposed_at"])
        return 0
    if cmd in ("approve", "approve-initial"):
        typed = input(f'Type exactly: {OWNER_PHRASE}\n> ')
        if cmd == "approve":
            approve(typed, in_drawdown=_in_drawdown())
        else:
            approve_initial(typed)
        print("Approved.")
        return 0
    print(__doc__)
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
