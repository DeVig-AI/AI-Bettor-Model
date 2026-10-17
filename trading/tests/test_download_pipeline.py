"""The daily download batch end to end, with a fake FMP and no network."""
import importlib.util
import json

import pandas as pd
import pandas_market_calendars as mcal

from trader.config import ROOT
from trader.data import auditor, fmp, sec_insider, store
from trader.logbook import Logbook

DAYS = [d.strftime("%Y-%m-%d") for d in mcal.get_calendar("XNYS").valid_days("2001-01-02", "2001-03-30")]


class FakeFMP:
    def __init__(self):
        self.calls = 0

    def get(self, url, params=None, timeout=None):
        self.calls += 1
        ep = url.split("/stable/")[1]
        sym = params.get("symbol", "")
        if ep == "delisted-companies":
            body = [{"symbol": "OLDCO"}] if params["page"] == 0 else []
        elif ep == "profile":
            body = [{"symbol": sym, "sector": "Tech", "cik": "1"}]
        elif ep.startswith("historical-price-eod"):
            body = [] if sym == "GONE" else [{"date": d, "adjOpen": 10, "adjHigh": 10, "adjLow": 10, "adjClose": 10,
                                               "close": 10, "volume": 5} for d in DAYS]
        else:
            body = []
        r = type("R", (), {})()
        r.status_code, r.content, r.text = 200, json.dumps(body).encode(), json.dumps(body)
        r.json = lambda: body
        return r


def test_download_batch(tmp_path, monkeypatch):
    spec = importlib.util.spec_from_file_location("download", ROOT / "scripts" / "download.py")
    dl = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(dl)

    fake = FakeFMP()
    real_init = fmp.FMP.__init__

    def init(self, key, *a, **k):
        real_init(self, "test-key", tmp_path / "fmp", fake, daily_budget=12)
    monkeypatch.setattr(fmp.FMP, "__init__", init)
    monkeypatch.setattr(dl, "universe", lambda: ["SPY", "AAA", "GONE"])
    monkeypatch.setattr(sec_insider, "download", lambda ua: ["SEC skipped in test"])
    monkeypatch.setattr(sec_insider, "build_table", lambda: (pd.DataFrame(), []))
    monkeypatch.setattr(store, "TABLES", tmp_path / "tables")
    monkeypatch.setattr(auditor, "REPORT", tmp_path / "AUDIT.md")
    monkeypatch.setattr(dl, "write_table", lambda n, df: df.to_parquet(tmp_path / f"{n}.parquet"))
    original_write = auditor.write_report
    monkeypatch.setattr(auditor, "write_report", lambda res: original_write(res, tmp_path / "AUDIT.md"))
    monkeypatch.setattr(dl, "Logbook", lambda: Logbook(tmp_path / "l"))
    monkeypatch.setattr(dl.sys, "argv", ["download.py"])

    assert dl.run() == 0
    assert fake.calls == 12                      # stopped at the daily budget
    px = pd.read_parquet(tmp_path / "prices.parquet")
    assert set(px["symbol"]) == {"SPY", "AAA"}   # GONE had no prices: skipped, not invented
    text = (tmp_path / "AUDIT.md").read_text()
    assert "budget" in text.lower() or "requests today" in text
    assert "SEC skipped in test" in text
