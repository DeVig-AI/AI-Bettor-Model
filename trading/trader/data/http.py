"""Shared download helper: cache every reply forever, and never break a source's free limits.

Limits are counted in a usage file per source, per window ("%Y-%m" = per month,
"%Y-%m-%dT%H" = per hour, ...). A limit can count requests or distinct keys
(Tiingo counts unique symbols per month).
"""
from __future__ import annotations

import json
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import requests


class LimitReached(RuntimeError):
    def __init__(self, msg: str, retry_window: str):
        super().__init__(msg)
        self.retry_window = retry_window   # e.g. "%Y-%m-%dT%H": waiting an hour helps


@dataclass(frozen=True)
class Limit:
    window: str          # strftime pattern naming the window
    max: int
    what: str = "requests"   # "requests" or "keys"


class Fetcher:
    def __init__(self, name: str, cache_dir: Path, limits: list[Limit] = (), session=None,
                 min_interval: float = 0.0, clock=datetime.now, sleep=time.sleep):
        self.name = name
        self.dir = Path(cache_dir)
        self.dir.mkdir(parents=True, exist_ok=True)
        self.limits = list(limits)
        self.http = session or requests.Session()
        self.min_interval = min_interval
        self.clock, self.sleep = clock, sleep
        self._last = 0.0
        self.usage_file = self.dir / "_usage.json"

    def _usage(self) -> dict:
        return json.loads(self.usage_file.read_text()) if self.usage_file.exists() else {}

    def _check(self, key: str) -> None:
        u, now = self._usage(), self.clock()
        for lim in self.limits:
            w = now.strftime(lim.window)
            slot = u.get(lim.window, {}).get(w, {"requests": 0, "keys": []})
            used = slot["requests"] if lim.what == "requests" else len(slot["keys"])
            new_key = lim.what == "keys" and key not in slot["keys"]
            if (lim.what == "requests" and used >= lim.max) or (new_key and used >= lim.max):
                raise LimitReached(f"{self.name}: {used}/{lim.max} {lim.what} used this window ({w})", lim.window)

    def _count(self, key: str) -> None:
        u, now = self._usage(), self.clock()
        for lim in self.limits:
            w = now.strftime(lim.window)
            slot = u.setdefault(lim.window, {}).setdefault(w, {"requests": 0, "keys": []})
            slot["requests"] += 1
            if key not in slot["keys"]:
                slot["keys"].append(key)
            # keep only recent windows so the file stays small
            if len(u[lim.window]) > 60:
                for old in sorted(u[lim.window])[:-60]:
                    del u[lim.window][old]
        self.usage_file.write_text(json.dumps(u))

    def path(self, key: str) -> Path:
        safe = "".join(c if c.isalnum() or c in "-_." else "_" for c in key)
        return self.dir / f"{safe}.json"

    def cached(self, key: str) -> dict | None:
        p = self.path(key)
        return json.loads(p.read_text()) if p.exists() else None

    def get(self, url: str, key: str, params: dict | None = None, headers: dict | None = None,
            limit_key: str | None = None, cache: bool = True) -> dict:
        """Returns {"status": int, "text": str}. Cached forever unless cache=False.
        Server errors (5xx) and network failures are not cached, so they retry next run."""
        if cache:
            hit = self.cached(key)
            if hit is not None:
                return hit
        self._check(limit_key or key)
        wait = self.min_interval - (time.monotonic() - self._last)
        if wait > 0:
            self.sleep(wait)
        r = self.http.get(url, params=params, headers=headers, timeout=120)
        self._last = time.monotonic()
        self._count(limit_key or key)
        rec = {"status": r.status_code, "text": r.text, "fetched": self.clock().isoformat(timespec="seconds")}
        if r.status_code == 429:
            raise LimitReached(f"{self.name}: server says too many requests (429)", "%Y-%m-%dT%H")
        if r.status_code >= 500:
            raise RuntimeError(f"{self.name}: server error {r.status_code}; will retry next run")
        if cache:
            self.path(key).write_text(json.dumps(rec))
        return rec


def json_of(rec: dict | None):
    if not rec or rec.get("status") != 200:
        return None
    try:
        return json.loads(rec["text"])
    except ValueError:
        return None
