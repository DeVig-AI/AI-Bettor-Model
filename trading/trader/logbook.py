"""Append-only decision log. Every decision and its reason, never deleted.

Each line is JSON and carries the hash of the line before it, so a deleted or
edited line breaks the chain and `verify()` reports where.
"""
from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from .config import ROOT

LOG_DIR = ROOT / "logs"
DEFAULT_LOG = LOG_DIR / "decisions.jsonl"
GENESIS = "0" * 64


def _hash(line: str) -> str:
    return hashlib.sha256(line.encode()).hexdigest()


def _last_hash(path: Path) -> str:
    if not path.exists() or path.stat().st_size == 0:
        return GENESIS
    with path.open("rb") as f:
        f.seek(0, os.SEEK_END)
        pos = f.tell() - 1
        # skip trailing newline, then walk back to the start of the last line
        while pos > 0:
            f.seek(pos - 1)
            if f.read(1) == b"\n":
                break
            pos -= 1
        f.seek(pos)
        last = f.read().decode().strip()
    return _hash(last)


class Logbook:
    def __init__(self, path: Path = DEFAULT_LOG):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def record(self, actor: str, action: str, reason: str, **details) -> dict:
        if not reason or not reason.strip():
            raise ValueError("every decision needs a reason")
        entry = {
            "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "actor": actor,
            "action": action,
            "reason": reason,
            "details": details,
            "prev": _last_hash(self.path),
        }
        line = json.dumps(entry, sort_keys=True, default=str)
        # "a" mode: the log is only ever appended to
        with self.path.open("a") as f:
            f.write(line + "\n")
            f.flush()
            os.fsync(f.fileno())
        return entry

    def entries(self) -> list[dict]:
        if not self.path.exists():
            return []
        return [json.loads(x) for x in self.path.read_text().splitlines() if x.strip()]

    def verify(self) -> tuple[bool, str]:
        prev = GENESIS
        if not self.path.exists():
            return True, "empty log"
        for n, line in enumerate(self.path.read_text().splitlines(), 1):
            if not line.strip():
                continue
            if json.loads(line).get("prev") != prev:
                return False, f"log chain broken at line {n}: a line was edited or deleted"
            prev = _hash(line)
        return True, "log intact"
