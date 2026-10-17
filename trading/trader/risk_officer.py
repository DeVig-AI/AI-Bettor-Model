"""The risk officer. Plain code, no AI. Enforces the constitution.

Separation of powers:
  * strategies PROPOSE (Proposal) - they cannot approve
  * the risk officer APPROVES (ApprovedPlan) - it cannot place orders
  * the executor EXECUTES - it only accepts an ApprovedPlan and cannot change rules

The risk officer only ever reduces risk: it clips, drops or refuses. It never
adds weight a strategy did not ask for, and never redistributes clipped weight.
"""
from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path
from types import MappingProxyType

from .config import CONSTITUTION_PATH, ROOT, Constitution, file_sha256
from .portfolio import apply_limits

STATE_DIR = ROOT / "state"
_ISSUER = object()  # only this module can mint an ApprovedPlan

# OCC option symbols look like "AAPL  240119C00150000"; plain tickers are letters,
# optionally with a class suffix like BRK.B or BF-B.
_TICKER_RE = re.compile(r"^[A-Z]{1,5}([.\-][A-Z]{1,2})?$")


@dataclass(frozen=True)
class Proposal:
    strategy: str
    asof: date
    weights: dict[str, float]          # fraction of account equity, per symbol
    sectors: dict[str, str]            # symbol -> sector
    reason: str


@dataclass(frozen=True)
class Position:
    symbol: str
    qty: float
    entry_price: float
    current_price: float
    approved_on: date                  # last date the risk officer approved holding it


@dataclass(frozen=True)
class AccountState:
    asof: date
    equity: float
    start_of_day_equity: float
    peak_equity: float
    positions: dict[str, Position] = field(default_factory=dict)
    data_ok: bool = True
    broker_ok: bool = True


class ApprovedPlan:
    """Target weights the executor may trade toward. Only the risk officer makes these."""

    def __init__(self, token, asof: date, targets: dict[str, float], constitution_sha: str,
                 reasons: tuple[str, ...]):
        if token is not _ISSUER:
            raise PermissionError("only the risk officer can approve a plan")
        self.asof = asof
        self.targets = MappingProxyType(dict(targets))
        self.constitution_sha = constitution_sha
        self.reasons = reasons

    def __repr__(self):
        return f"ApprovedPlan({self.asof}, {len(self.targets)} targets)"


def is_genuine(plan) -> bool:
    return isinstance(plan, ApprovedPlan)


@dataclass
class Review:
    plan: ApprovedPlan | None          # None means: no trades today
    halted: bool
    paused: bool
    notes: list[str]                   # plain-English reasons for everything done


class HaltState:
    """Kill switch and daily pause, persisted to disk so a restart can't forget them."""

    def __init__(self, state_dir: Path = STATE_DIR):
        self.dir = Path(state_dir)
        self.dir.mkdir(parents=True, exist_ok=True)
        self.kill_file = self.dir / "KILL_SWITCH.json"
        self.pause_file = self.dir / "pause.json"

    def killed(self) -> bool:
        return self.kill_file.exists()

    def kill(self, who: str, reason: str) -> None:
        if not self.killed():
            self.kill_file.write_text(json.dumps({
                "by": who, "reason": reason,
                "at": datetime.now(timezone.utc).isoformat(timespec="seconds")}))

    def paused_on(self, day: date) -> bool:
        if not self.pause_file.exists():
            return False
        return json.loads(self.pause_file.read_text())["day"] == day.isoformat()

    def pause(self, day: date, reason: str) -> None:
        self.pause_file.write_text(json.dumps({"day": day.isoformat(), "reason": reason}))

    def owner_restart(self, typed_confirmation: str) -> None:
        # Only the owner restarts. The CLI makes them type this phrase.
        if typed_confirmation != "I AM THE OWNER AND I RESTART TRADING":
            raise PermissionError("restart refused: wrong confirmation phrase")
        self.kill_file.unlink(missing_ok=True)


class RiskOfficer:
    def __init__(self, constitution: Constitution, halt: HaltState | None = None,
                 constitution_sha: str | None = None):
        self.c = constitution
        self.L = constitution.limits
        self.halt = halt or HaltState()
        self.sha = constitution_sha or file_sha256(CONSTITUTION_PATH)

    # -- account-level triggers -------------------------------------------------
    def check_triggers(self, acct: AccountState, notes: list[str]) -> None:
        if acct.peak_equity > 0 and acct.equity / acct.peak_equity - 1 <= -self.L.drawdown_kill:
            dd = 1 - acct.equity / acct.peak_equity
            self.halt.kill("risk_officer",
                           f"drawdown {dd:.1%} reached the {self.L.drawdown_kill:.0%} limit")
            notes.append(f"KILL SWITCH: drawdown {dd:.1%}. All trading stopped until the owner restarts.")
        if (acct.start_of_day_equity > 0
                and acct.equity / acct.start_of_day_equity - 1 <= -self.L.daily_loss_pause):
            loss = 1 - acct.equity / acct.start_of_day_equity
            self.halt.pause(acct.asof, f"daily loss {loss:.1%}")
            notes.append(f"PAUSED: lost {loss:.1%} today (limit {self.L.daily_loss_pause:.0%}). "
                         "No trades until the next day.")

    # -- proposal checks --------------------------------------------------------
    def _clean(self, p: Proposal, notes: list[str]) -> dict[str, float] | None:
        """Validate one proposal. Returns None if the whole proposal is refused."""
        if not p.reason or not p.reason.strip():
            notes.append(f"{p.strategy}: refused, no reason given")
            return None
        out: dict[str, float] = {}
        for sym, w in p.weights.items():
            if not isinstance(w, (int, float)) or isinstance(w, bool) or not math.isfinite(w):
                notes.append(f"{p.strategy}: refused, weight for {sym} is not a number")
                return None
            if w < 0:
                notes.append(f"{p.strategy}: refused, negative weight for {sym} (shorting is forbidden)")
                return None
            if not _TICKER_RE.match(sym):
                notes.append(f"{p.strategy}: dropped {sym}, not a plain stock ticker (options are forbidden)")
                continue
            if w == 0:
                continue
            if not p.sectors.get(sym):
                notes.append(f"{p.strategy}: dropped {sym}, sector unknown")
                continue
            out[sym] = float(w)
        if sum(out.values()) > 1 + 1e-9:
            notes.append(f"{p.strategy}: refused, weights add to {sum(out.values()):.2f} (leverage is forbidden)")
            return None
        cap = self.L.max_weight_per_strategy
        total = sum(out.values())
        if total > cap:
            scale = cap / total
            out = {s: w * scale for s, w in out.items()}
            notes.append(f"{p.strategy}: scaled from {total:.0%} to the {cap:.0%} per-strategy limit")
        return out

    def _forced_exits(self, acct: AccountState, notes: list[str]) -> set[str]:
        exits = set()
        for sym, pos in acct.positions.items():
            if pos.entry_price > 0 and pos.current_price <= pos.entry_price * (1 - self.L.stop_loss):
                exits.add(sym)
                drop = 1 - pos.current_price / pos.entry_price
                notes.append(f"STOP-LOSS: selling {sym}, down {drop:.1%} from entry")
        return exits

    def review(self, acct: AccountState, proposals: list[Proposal]) -> Review:
        notes: list[str] = []
        self.check_triggers(acct, notes)

        if self.halt.killed():
            notes.append("Kill switch is on. No trades. Only the owner can restart.")
            return Review(None, halted=True, paused=False, notes=notes)
        if self.halt.paused_on(acct.asof):
            notes.append("Paused for today after a daily loss. No trades.")
            return Review(None, halted=False, paused=True, notes=notes)
        if not acct.data_ok:
            notes.append("Data missing or failed the audit. No trades (fail safe).")
            return Review(None, halted=False, paused=True, notes=notes)
        if not acct.broker_ok:
            notes.append("Broker error. No trades (fail safe).")
            return Review(None, halted=False, paused=True, notes=notes)

        combined: dict[str, float] = {}
        sectors: dict[str, str] = {}
        conflicted: set[str] = set()
        for p in proposals:
            clean = self._clean(p, notes)
            if clean is None:
                continue
            for sym, w in clean.items():
                if sym in conflicted:
                    continue
                prev = sectors.get(sym)
                if prev and prev != p.sectors[sym]:
                    notes.append(f"dropped {sym}: strategies disagree on its sector")
                    combined.pop(sym, None)
                    conflicted.add(sym)
                    continue
                sectors[sym] = p.sectors[sym]
                combined[sym] = combined.get(sym, 0.0) + w

        for sym in self._forced_exits(acct, notes):
            if combined.pop(sym, None) is not None:
                notes.append(f"{sym}: not re-bought today because it just hit its stop-loss")

        combined, clip_notes = apply_limits(combined, sectors, self.L.max_weight_per_stock,
                                            self.L.max_weight_per_sector)
        notes += clip_notes

        total = sum(combined.values())
        if total > 1:  # several strategies together can't add up to leverage
            combined = {s: w / total for s, w in combined.items()}
            notes.append(f"combined weights {total:.0%} scaled to 100% (no leverage)")

        # Held positions not approved today are sold; that is also the time limit:
        # approval lasts only until the next review, well inside the day limit.
        for sym, pos in acct.positions.items():
            if sym not in combined:
                age = (acct.asof - pos.approved_on).days
                notes.append(f"{sym}: sell, not re-approved today (held approval {age} days old)")

        plan = ApprovedPlan(_ISSUER, acct.asof, combined, self.sha,
                            tuple(p.reason for p in proposals))
        notes.append(f"Approved {len(combined)} positions, {sum(combined.values()):.0%} invested.")
        return Review(plan, halted=False, paused=False, notes=notes)

    def overdue_positions(self, acct: AccountState) -> list[str]:
        """Positions past the time limit. Reported in alerts when no review could run."""
        lim = self.L.max_days_without_reapproval
        return sorted(s for s, p in acct.positions.items() if (acct.asof - p.approved_on).days > lim)
