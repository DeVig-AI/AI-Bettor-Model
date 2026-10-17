"""Load and validate the constitution and pass bar. A typo fails loudly."""
from __future__ import annotations

import hashlib
import tomllib
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, model_validator

ROOT = Path(__file__).resolve().parents[1]
CONFIG_DIR = ROOT / "config"
CONSTITUTION_PATH = CONFIG_DIR / "constitution.toml"
PASS_BAR_PATH = CONFIG_DIR / "pass_bar.toml"


class _Strict(BaseModel):
    # extra="forbid": a misspelled key is an error, not a silently ignored limit.
    model_config = ConfigDict(extra="forbid", frozen=True)


class Mode(_Strict):
    paper_only: bool
    min_paper_months: int = Field(ge=3)


class Limits(_Strict):
    max_weight_per_stock: float = Field(gt=0, le=0.05)
    max_weight_per_sector: float = Field(gt=0, le=0.25)
    max_weight_per_strategy: float = Field(gt=0, le=0.30)
    daily_loss_pause: float = Field(gt=0, le=0.02)
    drawdown_kill: float = Field(gt=0, le=0.15)
    stop_loss: float = Field(gt=0, lt=1)
    max_days_without_reapproval: int = Field(ge=1, le=366)


class Forbidden(_Strict):
    leverage: bool
    shorting: bool
    options: bool

    @model_validator(mode="after")
    def _all_forbidden(self):
        # Hard rule from the handoff: no leverage, shorting or options. Ever.
        if not (self.leverage and self.shorting and self.options):
            raise ValueError("leverage, shorting and options must all stay forbidden")
        return self


class Amendments(_Strict):
    wait_hours: int = Field(ge=24)
    no_loosening_during_drawdown: bool

    @model_validator(mode="after")
    def _locked(self):
        if not self.no_loosening_during_drawdown:
            raise ValueError("no_loosening_during_drawdown cannot be turned off")
        return self


class Constitution(_Strict):
    purpose: str
    mode: Mode
    limits: Limits
    forbidden: Forbidden
    amendments: Amendments


class Costs(_Strict):
    base_per_side: float = Field(ge=0.0015)
    stress_per_side: float = Field(ge=0.0030)


class Splits(_Strict):
    data_start: str
    train_start: str
    train_end: str
    validate_start: str
    validate_end: str
    vault_start: str


class Rules(_Strict):
    min_deflated_sharpe_prob: float = Field(gt=0, lt=1)
    max_period_losses_fraction: float = Field(gt=0, le=1)


class Hunt(_Strict):
    deadline_months: int = Field(ge=1, le=3)
    max_combinations: int = Field(ge=1, le=25)


class PassBar(_Strict):
    costs: Costs
    splits: Splits
    periods: dict[str, tuple[str, str]]
    rules: Rules
    hunt: Hunt


def file_sha256(path: Path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def parse_constitution(text: str) -> Constitution:
    return Constitution.model_validate(tomllib.loads(text))


def load_constitution(path: Path = CONSTITUTION_PATH) -> Constitution:
    return parse_constitution(Path(path).read_text())


def load_pass_bar(path: Path = PASS_BAR_PATH) -> PassBar:
    return PassBar.model_validate(tomllib.loads(Path(path).read_text()))
