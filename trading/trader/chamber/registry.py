"""Counter of every test run, and the vault lock. Append-only; nothing is ever removed.

The vault (2021 onward) opens once per candidate, only after it passed validation.
The "vault opened" entry is written BEFORE the run, so a crash still uses up the one try.
"""
from __future__ import annotations

from ..config import ROOT
from ..logbook import Logbook

REGISTRY = ROOT / "logs" / "chamber_registry.jsonl"
BENCHMARKS = {"SPY", "EQUAL_WEIGHT"}


class VaultLocked(PermissionError):
    pass


class Registry:
    def __init__(self, path=REGISTRY):
        self.book = Logbook(path)

    def runs(self) -> list[dict]:
        return [e["details"] for e in self.book.entries() if e["action"] == "run"]

    def record_run(self, **details) -> None:
        self.book.record("chamber", "run", f"test {details.get('candidate')} on {details.get('split')}",
                         **details)

    def candidates_tried(self) -> list[str]:
        """Distinct strategies tested (benchmarks don't count). This is N for the deflated Sharpe."""
        return sorted({r["candidate"] for r in self.runs() if r["candidate"] not in BENCHMARKS
                       and not r.get("synthetic")})

    def total_runs(self) -> int:
        return sum(1 for r in self.runs() if not r.get("synthetic"))

    def trial_sharpes(self, split: str = "validate") -> list[float]:
        return [r["active_sharpe_daily"] for r in self.runs()
                if r["split"] == split and r["candidate"] not in BENCHMARKS and not r.get("synthetic")
                and r.get("active_sharpe_daily") is not None]

    def first_real_run(self) -> str | None:
        ts = [e["ts"] for e in self.book.entries() if e["action"] == "run" and not e["details"].get("synthetic")]
        return min(ts) if ts else None

    def passed_validation(self, candidate: str) -> bool:
        return any(e["details"].get("candidate") == candidate for e in self.book.entries()
                   if e["action"] == "passed_validation")

    def mark_passed_validation(self, candidate: str, evidence: dict) -> None:
        self.book.record("chamber", "passed_validation", "met the pre-vault gate", candidate=candidate,
                         **evidence)

    def vault_used(self, candidate: str) -> bool:
        return any(e["details"].get("candidate") == candidate for e in self.book.entries()
                   if e["action"] == "vault_opened")

    def open_vault(self, candidate: str) -> None:
        if not self.passed_validation(candidate):
            raise VaultLocked(f"{candidate} has not passed validation; the vault stays shut")
        if self.vault_used(candidate):
            raise VaultLocked(f"{candidate} already had its one vault run; that result is final")
        self.book.record("chamber", "vault_opened", "one-time vault test", candidate=candidate)
