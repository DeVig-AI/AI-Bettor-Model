"""Price sources, one job each (DATA_HANDOFF section 2). Every one returns the same columns:

    symbol, date, open, high, low, close   raw (unadjusted) prices; NaN if the source has none
    adj_open, adj_high, adj_low, adj_close  split- and dividend-adjusted
    volume, source

Rows a source can't vouch for (missing or non-positive close) are dropped, never repaired.
"""
from __future__ import annotations

import io
import zipfile
from pathlib import Path

import pandas as pd

from .http import Fetcher, Limit, LimitReached, json_of
from .store import RAW

COLUMNS = ["symbol", "date", "open", "high", "low", "close", "adj_open", "adj_high", "adj_low",
           "adj_close", "volume", "source"]


def _frame(symbol, date, o, h, low, c, ao, ah, al, ac, v, source) -> pd.DataFrame:
    df = pd.DataFrame({"symbol": symbol, "date": pd.to_datetime(date, errors="coerce"),
                       "open": o, "high": h, "low": low, "close": c, "adj_open": ao, "adj_high": ah,
                       "adj_low": al, "adj_close": ac, "volume": v, "source": source})
    for col in COLUMNS[2:-1]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.dropna(subset=["date", "adj_close"])
    return df[df["adj_close"] > 0][COLUMNS]


def empty() -> pd.DataFrame:
    return pd.DataFrame(columns=COLUMNS)


# --- Quandl/Nasdaq WIKI Prices (frozen 2018-03-27) ------------------------------

WIKI_END = pd.Timestamp("2018-03-27")
WIKI_EXPORT = "https://data.nasdaq.com/api/v3/datatables/WIKI/PRICES"

_WIKI_ALIASES = {"adj_close": ["adj_close", "adj. close"], "close": ["close"], "open": ["open"],
                 "high": ["high"], "low": ["low"], "adj_open": ["adj_open", "adj. open"],
                 "adj_high": ["adj_high", "adj. high"], "adj_low": ["adj_low", "adj. low"],
                 "volume": ["adj_volume", "adj. volume", "volume"], "ticker": ["ticker", "symbol"],
                 "date": ["date"]}


def wiki_export_link(api_key: str, session=None) -> dict:
    """Ask Nasdaq Data Link for the bulk file. Returns {"status": "fresh"|"creating"|..., "link": url}."""
    http = session or Fetcher("wiki", RAW / "wiki").http
    r = http.get(f"{WIKI_EXPORT}.json", params={"qopts.export": "true", "api_key": api_key}, timeout=60)
    if r.status_code != 200:
        return {"status": f"HTTP {r.status_code}", "link": None, "detail": r.text[:300]}
    f = r.json().get("datatable_bulk_download", {}).get("file", {})
    return {"status": f.get("status", "unknown"), "link": f.get("link")}


def wiki_download(api_key: str, dest: Path = RAW / "wiki" / "WIKI_PRICES.zip", session=None,
                  sleep=None, log=print) -> Path:
    """Download the bulk zip once (~0.5 GB). If a file already exists (e.g. a Kaggle copy), keep it."""
    import time
    dest = Path(dest)
    if dest.exists():
        return dest
    sleep = sleep or time.sleep
    for _ in range(30):  # Nasdaq builds the file on request; poll for up to ~15 minutes
        info = wiki_export_link(api_key, session)
        if info["status"] == "fresh" and info["link"]:
            break
        if info["link"] is None and not info["status"].startswith(("creating", "regenerating")):
            raise RuntimeError(f"WIKI export not available: {info}")
        sleep(30)
    else:
        raise RuntimeError("WIKI export still being prepared after 15 minutes; try again later")
    http = session or Fetcher("wiki", RAW / "wiki").http
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".part")
    with http.get(info["link"], stream=True, timeout=600) as r:
        r.raise_for_status()
        with tmp.open("wb") as f:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)
    tmp.replace(dest)
    log(f"WIKI prices: {dest.stat().st_size // (1 << 20)} MB downloaded")
    return dest


def _open_csv(path: Path):
    path = Path(path)
    if path.suffix == ".zip":
        z = zipfile.ZipFile(path)
        name = next(n for n in z.namelist() if n.lower().endswith(".csv"))
        return z.open(name)
    return path.open("rb")


def wiki_load(path: Path, tickers: set[str] | None = None, chunksize: int = 1_000_000) -> pd.DataFrame:
    """Read the WIKI CSV (Nasdaq export or Kaggle mirror), keeping only `tickers`."""
    out = []
    with _open_csv(path) as fh:
        for chunk in pd.read_csv(fh, chunksize=chunksize, low_memory=False):
            cols = {c.lower().strip(): c for c in chunk.columns}
            pick = {}
            for want, names in _WIKI_ALIASES.items():
                hit = next((cols[n] for n in names if n in cols), None)
                if hit is None and want in ("ticker", "date", "adj_close"):
                    raise KeyError(f"WIKI file has no {want} column; columns: {list(chunk.columns)[:20]}")
                pick[want] = hit
            sym = chunk[pick["ticker"]].astype(str).str.upper().str.replace("_", ".", regex=False)
            keep = sym.isin(tickers) if tickers is not None else slice(None)
            c = chunk[keep]

            def g(k, c=c, pick=pick):
                return c[pick[k]] if pick.get(k) else float("nan")
            out.append(_frame(sym[keep], c[pick["date"]], g("open"), g("high"), g("low"), g("close"),
                              g("adj_open"), g("adj_high"), g("adj_low"), g("adj_close"), g("volume"), "wiki"))
    return pd.concat(out, ignore_index=True) if out else empty()


# --- Tiingo free tier (only for names missing elsewhere) ------------------------

TIINGO = "https://api.tiingo.com/tiingo/daily"
TIINGO_TICKERS = "https://apimedia.tiingo.com/docs/tiingo/daily/supported_tickers.zip"
# Reported free limits: 500 unique symbols/month, 50 requests/hour, 1,000/day. Keep a margin.
TIINGO_LIMITS = [Limit("%Y-%m", 480, "keys"), Limit("%Y-%m-%dT%H", 45), Limit("%Y-%m-%d", 950)]


def tiingo_fetcher(session=None, **kw) -> Fetcher:
    return Fetcher("tiingo", RAW / "tiingo", TIINGO_LIMITS, session, **kw)


def tiingo_prices(f: Fetcher, token: str, symbol: str, start: str = "2000-01-01") -> pd.DataFrame:
    if not token:
        raise ValueError("TIINGO_API_KEY missing from .env")
    t = symbol.replace(".", "-")
    rec = f.get(f"{TIINGO}/{t}/prices", f"prices_{t}", params={"startDate": start, "token": token},
                headers={"Content-Type": "application/json"}, limit_key=t)
    data = json_of(rec)
    if not isinstance(data, list) or not data:
        return empty()
    d = pd.DataFrame(data)
    return _frame(symbol, d["date"].str[:10], d.get("open"), d.get("high"), d.get("low"), d.get("close"),
                  d.get("adjOpen"), d.get("adjHigh"), d.get("adjLow"), d.get("adjClose"),
                  d.get("adjVolume", d.get("volume")), "tiingo")


def tiingo_supported(path: Path) -> pd.DataFrame:
    """Tiingo's free ticker list (ticker, exchange, assetType, startDate, endDate): who it has, delisted too."""
    with _open_csv(path) as fh:
        df = pd.read_csv(fh)
    df["ticker"] = df["ticker"].astype(str).str.upper()
    for c in ("startDate", "endDate"):
        df[c] = pd.to_datetime(df[c], errors="coerce")
    return df


# --- Alpaca historical bars (free with the account, 2016 onward) ----------------

ALPACA_BARS = "https://data.alpaca.markets/v2/stocks/bars"


def alpaca_fetcher(session=None, **kw) -> Fetcher:
    return Fetcher("alpaca", RAW / "alpaca", [Limit("%Y-%m-%dT%H:%M", 180)], session, min_interval=0.35, **kw)


def _alpaca_pages(f: Fetcher, key: str, secret: str, symbols: list[str], adjustment: str,
                  start: str, end: str | None) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    token, page = None, 0
    tag = f"{adjustment}_{start}_{end}_{'-'.join(symbols)[:80]}_{len(symbols)}"
    while True:
        params = {"symbols": ",".join(symbols), "timeframe": "1Day", "start": start, "adjustment": adjustment,
                  "feed": "sip", "limit": 10000}
        if end:
            params["end"] = end
        if token:
            params["page_token"] = token
        # pages aren't cached when the range is open-ended (data still growing)
        rec = f.get(ALPACA_BARS, f"bars_{tag}_p{page}", params=params, cache=end is not None,
                    headers={"APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret})
        if rec["status"] in (401, 403):
            raise PermissionError(f"Alpaca refused the keys (HTTP {rec['status']})")
        data = json_of(rec) or {}
        for s, bars in (data.get("bars") or {}).items():
            out.setdefault(s, []).extend(bars)
        token = data.get("next_page_token")
        page += 1
        if not token:
            return out


def alpaca_prices(f: Fetcher, key: str, secret: str, symbols: list[str], start: str = "2016-01-01",
                  end: str | None = None) -> pd.DataFrame:
    """Raw and fully adjusted daily bars, merged into one frame. Up to ~100 symbols per call."""
    if not key or not secret:
        raise ValueError("ALPACA_API_KEY / ALPACA_SECRET_KEY missing from .env")
    to_alp = {s: s.replace("-", ".") for s in symbols}
    raw = _alpaca_pages(f, key, secret, list(to_alp.values()), "raw", start, end)
    adj = _alpaca_pages(f, key, secret, list(to_alp.values()), "all", start, end)
    frames = []
    for s, a in to_alp.items():
        if a not in adj:
            continue
        ad = pd.DataFrame(adj[a])
        ad["d"] = ad["t"].str[:10]
        rw = pd.DataFrame(raw.get(a, [])) if raw.get(a) else pd.DataFrame(columns=["t", "o", "h", "l", "c"])
        rw["d"] = rw["t"].str[:10]
        m = ad.merge(rw[["d", "o", "h", "l", "c"]], on="d", how="left", suffixes=("", "_raw"))
        frames.append(_frame(s, m["d"], m["o_raw"], m["h_raw"], m["l_raw"], m["c_raw"],
                             m["o"], m["h"], m["l"], m["c"], m["v"], "alpaca"))
    return pd.concat(frames, ignore_index=True) if frames else empty()


# --- Stooq (backup; since 2026 needs a free API key from a captcha page) ---------

STOOQ = "https://stooq.com/q/d/l/"


def stooq_fetcher(session=None, **kw) -> Fetcher:
    return Fetcher("stooq", RAW / "stooq", [Limit("%Y-%m-%d", 400)], session, min_interval=1.0, **kw)


def _stooq_frame(symbol: str, text: str) -> pd.DataFrame:
    df = pd.read_csv(io.StringIO(text))
    df.columns = [c.strip("<>").lower() for c in df.columns]
    if "date" not in df or "close" not in df:
        return empty()
    d = pd.to_datetime(df["date"].astype(str), format="mixed", errors="coerce")
    nan = float("nan")
    # Stooq prices are adjusted; it publishes no raw close
    return _frame(symbol, d, nan, nan, nan, nan, df.get("open"), df.get("high"), df.get("low"),
                  df["close"], df.get("volume", df.get("vol")), "stooq")


def stooq_prices(f: Fetcher, symbol: str, api_key: str = "") -> pd.DataFrame:
    s = symbol.replace(".", "-").lower() + ".us"
    params = {"s": s, "i": "d"}
    if api_key:
        params["apikey"] = api_key
    rec = f.get(STOOQ, f"daily_{s}", params=params)
    if rec["status"] != 200 or rec["text"].lstrip().startswith("<"):
        return empty()  # HTML page = no key / captcha
    return _stooq_frame(symbol, rec["text"])


def stooq_bulk(path: Path, tickers: set[str]) -> pd.DataFrame:
    """Read a manually downloaded Stooq bulk zip (d_us_txt.zip from stooq.com/db/h/)."""
    want = {t.replace(".", "-").lower() + ".us": t for t in tickers}
    out = []
    with zipfile.ZipFile(path) as z:
        for n in z.namelist():
            base = n.rsplit("/", 1)[-1].removesuffix(".txt")
            if base in want:
                out.append(_stooq_frame(want[base], z.read(n).decode("latin-1")))
    return pd.concat(out, ignore_index=True) if out else empty()


# --- FMP (kept only if the probe shows it's useful) -----------------------------

def fmp_prices(client, tickers: list[str]) -> pd.DataFrame:
    from . import fmp as F
    from .membership import to_fmp
    out = []
    for t in tickers:
        adj = pd.DataFrame(F.rows(client.cached("historical-price-eod/dividend-adjusted", to_fmp(t))))
        if adj.empty:
            continue
        raw = pd.DataFrame(F.rows(client.cached("historical-price-eod/full", to_fmp(t))))
        if not raw.empty:
            adj = adj.merge(raw[["date", "open", "high", "low", "close"]], on="date", how="left")
        g = adj.get
        out.append(_frame(t, adj["date"], g("open"), g("high"), g("low"), g("close"), g("adjOpen"),
                          g("adjHigh"), g("adjLow"), g("adjClose"), g("volume"), "fmp"))
    return pd.concat(out, ignore_index=True) if out else empty()


__all__ = ["COLUMNS", "LimitReached", "WIKI_END", "alpaca_fetcher", "alpaca_prices", "empty", "fmp_prices",
           "stooq_bulk", "stooq_fetcher", "stooq_prices", "tiingo_fetcher", "tiingo_prices",
           "tiingo_supported", "wiki_download", "wiki_load"]
