"""The daily download batch end to end on sample files, no network."""
import importlib.util
import json
from pathlib import Path

import pandas as pd

from trader.config import ROOT
from trader.data import auditor, sec_facts, sec_insider, store
from trader.logbook import Logbook

FIX = Path(__file__).parent / "fixtures"


def test_download_batch_on_sample_files(tmp_path, monkeypatch):
    spec = importlib.util.spec_from_file_location("download", ROOT / "scripts" / "download.py")
    dl = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(dl)

    monkeypatch.setenv("WIKI_PRICES_FILE", str(FIX / "wiki_sample.csv"))
    for k in ("ALPACA_API_KEY", "TIINGO_API_KEY", "STOOQ_API_KEY", "STOOQ_BULK_FILE", "NASDAQ_DATA_LINK_API_KEY"):
        monkeypatch.setenv(k, "")
    monkeypatch.setattr(dl, "load_dotenv", lambda *a, **k: None)
    monkeypatch.setattr(dl, "universe", lambda: ["SPY", "AAA", "BRK.B"])
    monkeypatch.setattr(store, "TABLES", tmp_path / "tables")
    monkeypatch.setattr(dl, "TABLES", tmp_path / "tables")
    tables = {}

    def write(name, df):
        tables[name] = df
        (tmp_path / "tables").mkdir(exist_ok=True)
        df.to_parquet(tmp_path / "tables" / f"{name}.parquet")
    monkeypatch.setattr(dl, "write_table", write)
    monkeypatch.setattr(dl, "has_table", lambda n: (tmp_path / "tables" / f"{n}.parquet").exists())
    monkeypatch.setattr(dl, "read_table", lambda n: pd.read_parquet(tmp_path / "tables" / f"{n}.parquet"))
    monkeypatch.setattr(sec_insider, "download", lambda ua: ["SEC insider skipped in test"])
    monkeypatch.setattr(sec_insider, "build_table", lambda: (pd.DataFrame(), []))
    facts = sec_facts.parse_facts(json.loads((FIX / "companyfacts_sample.json").read_text()), "AAA")
    monkeypatch.setattr(dl, "get_sec", lambda t, i, n: (
        pd.DataFrame({"symbol": t, "cik": [None, 1, None], "sector": [None, "Shops", None], "name": None}), facts, {}))
    monkeypatch.setattr(dl, "wiki_check", lambda n: ["2009-03-01 added X: membership file starts it never"])
    original_write = auditor.write_report
    monkeypatch.setattr(auditor, "write_report", lambda res: original_write(res, tmp_path / "AUDIT.md"))
    monkeypatch.setattr(auditor, "DATA", tmp_path)
    monkeypatch.setattr(dl, "Logbook", lambda: Logbook(tmp_path / "l"))
    monkeypatch.setattr(dl.sys, "argv", ["download.py"])

    assert dl.run() == 0
    px = tables["prices"]
    assert set(px["symbol"]) == {"AAA", "BRK.B"} and set(px["source"]) == {"wiki"}
    assert set(tables["fundamentals"]["field"]) == {"net_income", "equity", "shares"}
    text = (tmp_path / "AUDIT.md").read_text()
    assert "COVERAGE GATE" in text and "FAILED" in text        # 2 stocks can't cover the S&P 500
    assert "Owner decision needed" in text
    assert "Alpaca: no keys" in text and "Wikipedia cross-check" in text
