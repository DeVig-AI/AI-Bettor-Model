"""Where data lives on disk. Raw downloads are cached forever and never re-downloaded."""
from __future__ import annotations

from pathlib import Path

import duckdb
import pandas as pd

from ..config import ROOT

DATA = ROOT / "data"
REFERENCE = DATA / "reference"
CACHE = DATA / "cache"
RAW = CACHE / "raw"
TABLES = CACHE / "tables"


def table_path(name: str) -> Path:
    return TABLES / f"{name}.parquet"


def write_table(name: str, df: pd.DataFrame) -> Path:
    TABLES.mkdir(parents=True, exist_ok=True)
    p = table_path(name)
    tmp = p.with_suffix(".tmp")
    df.to_parquet(tmp, index=False)
    tmp.replace(p)  # atomic: a crash never leaves half a table
    return p


def read_table(name: str) -> pd.DataFrame:
    return pd.read_parquet(table_path(name))


def has_table(name: str) -> bool:
    return table_path(name).exists()


def query(sql: str) -> pd.DataFrame:
    """DuckDB over the parquet tables, e.g. query("select * from prices where symbol='AAPL'")."""
    con = duckdb.connect()
    for p in TABLES.glob("*.parquet"):
        con.execute(f"create view {p.stem} as select * from read_parquet('{p.as_posix()}')")
    return con.execute(sql).df()
