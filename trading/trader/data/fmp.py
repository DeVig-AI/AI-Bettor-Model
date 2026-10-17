"""Financial Modeling Prep client: free tier, strict daily budget, cache everything.

Free tier (verify on signup): ~250 requests/day and 500MB/30 days bandwidth.
We stop at DAILY_BUDGET to keep a margin. Every response, including errors like
"not in your plan", is saved, so nothing is requested twice.
"""
from __future__ import annotations

import json
import time
from datetime import date
from pathlib import Path

import requests

from .store import RAW

BASE = "https://financialmodelingprep.com/stable"
DAILY_BUDGET = 240


class BudgetExhausted(RuntimeError):
    pass


class FMP:
    def __init__(self, api_key: str, cache_dir: Path = RAW / "fmp", session=None,
                 daily_budget: int = DAILY_BUDGET, today: date | None = None):
        if not api_key:
            raise ValueError("FMP_API_KEY missing from .env")
        self.key = api_key
        self.dir = Path(cache_dir)
        self.dir.mkdir(parents=True, exist_ok=True)
        self.http = session or requests.Session()
        self.budget = daily_budget
        self.today = (today or date.today()).isoformat()
        self.usage_file = self.dir / "_usage.json"

    # -- budget -----------------------------------------------------------
    def _usage(self) -> dict:
        if self.usage_file.exists():
            return json.loads(self.usage_file.read_text())
        return {}

    def used_today(self) -> int:
        return self._usage().get(self.today, {}).get("requests", 0)

    def _count(self, nbytes: int) -> None:
        u = self._usage()
        d = u.setdefault(self.today, {"requests": 0, "bytes": 0})
        d["requests"] += 1
        d["bytes"] += nbytes
        self.usage_file.write_text(json.dumps(u, indent=1))

    def remaining(self) -> int:
        return max(0, self.budget - self.used_today())

    # -- requests ---------------------------------------------------------
    def cache_path(self, endpoint: str, key: str) -> Path:
        return self.dir / endpoint.replace("/", "_") / f"{key}.json"

    def cached(self, endpoint: str, key: str) -> dict | None:
        p = self.cache_path(endpoint, key)
        return json.loads(p.read_text()) if p.exists() else None

    def get(self, endpoint: str, key: str, **params) -> dict:
        """Returns {"status": int, "data": ..., "fetched": iso}. Cached forever."""
        hit = self.cached(endpoint, key)
        if hit is not None:
            return hit
        if self.remaining() <= 0:
            raise BudgetExhausted(f"used {self.used_today()} FMP requests today; resume tomorrow")
        r = self.http.get(f"{BASE}/{endpoint}", params={**params, "apikey": self.key}, timeout=60)
        self._count(len(r.content))
        if r.status_code == 429:
            raise BudgetExhausted("FMP says rate limit reached (429); resume tomorrow")
        if r.status_code >= 500:
            raise RuntimeError(f"FMP server error {r.status_code}; will retry next run")
        try:
            data = r.json()
        except ValueError:
            data = {"non_json": r.text[:500]}
        rec = {"status": r.status_code, "data": data, "fetched": time.strftime("%Y-%m-%dT%H:%M:%S")}
        p = self.cache_path(endpoint, key)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(rec))
        return rec

    # -- endpoints --------------------------------------------------------
    def delisted(self, page: int) -> dict:
        return self.get("delisted-companies", f"page{page}", page=page, limit=100)

    def prices_adjusted(self, symbol: str, start: str = "2000-01-01") -> dict:
        return self.get("historical-price-eod/dividend-adjusted", symbol, symbol=symbol, **{"from": start})

    def prices_raw(self, symbol: str, start: str = "2000-01-01") -> dict:
        return self.get("historical-price-eod/full", symbol, symbol=symbol, **{"from": start})

    def profile(self, symbol: str) -> dict:
        return self.get("profile", symbol, symbol=symbol)

    def income(self, symbol: str) -> dict:
        return self.get("income-statement", symbol, symbol=symbol, period="quarter", limit=120)

    def balance(self, symbol: str) -> dict:
        return self.get("balance-sheet-statement", symbol, symbol=symbol, period="quarter", limit=120)


def rows(rec: dict | None) -> list[dict]:
    """Normalize FMP shapes (list, {"historical": [...]}) to a list of dicts. Errors -> []."""
    if not rec or rec.get("status") != 200:
        return []
    d = rec["data"]
    if isinstance(d, dict):
        d = d.get("historical", [])
    return d if isinstance(d, list) else []


def restricted(rec: dict | None) -> bool:
    """True if FMP refused because of the plan (free tier), not because data is missing."""
    if not rec:
        return False
    if rec.get("status") in (401, 402, 403):
        return True
    d = rec.get("data")
    text = json.dumps(d).lower() if d is not None else ""
    return any(w in text for w in ("premium", "subscription", "upgrade", "not available under"))
