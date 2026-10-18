#!/usr/bin/env python3
"""
kalshi_props_history_v1.py -- collects PAST (settled) Kalshi NFL player-prop markets with the price shortly before
kickoff and how each market settled, for the pre-registered back-test NFL_PROPS_KALSHI_BACKTEST_V1
(nfl/NFL_PROPS_KALSHI_BACKTEST_V1_PREREG.md). Read-only public market data: no key, no account, nothing bet.

For every settled market in the series below, for games that kicked off BEFORE 2026-10-18 (so it never overlaps the
live paper test):
  * price  = the last hourly candle that closes at least 40 minutes before kickoff (yes bid / yes ask / last trade);
  * result = Kalshi's own settlement ("yes" / "no"; anything else is kept but flagged).
Kickoff times come from the nflverse schedule (nfldata games.csv, US Eastern).

Resumable: appends to nfl/props_history/kalshi_props_history_v1.csv, remembers finished events in
nfl/props_history/done_events.txt, and stops itself after MAX_MINUTES so a GitHub job never times out.
Run from the repo root:  python3 nfl/kalshi_props_history_v1.py
"""
import csv, io, json, os, re, sys, time, urllib.parse, urllib.request, urllib.error
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

KALSHI = "https://api.elections.kalshi.com/trade-api/v2"
SCHEDULE = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv"
ET = ZoneInfo("America/New_York")
UA = "nfl-props-history/1.0 (personal research; read-only)"
PAUSE = 0.12
MAX_MINUTES = float(os.getenv("MAX_MINUTES", "300"))
CUTOFF = datetime(2026, 10, 18, tzinfo=timezone.utc)      # only games that kicked off before this
SNAP_BEFORE = timedelta(minutes=40)                         # candle must close >= 40 min before kickoff
OUT_DIR = os.path.join("nfl", "props_history")
OUT_CSV = os.path.join(OUT_DIR, "kalshi_props_history_v1.csv")
DONE = os.path.join(OUT_DIR, "done_events.txt")
SUMMARY = os.path.join(OUT_DIR, "kalshi_props_history_v1_summary.json")
SERIES = {
    "KXNFLPASSYDS": "passing_yards", "KXNFLPASSTDS": "passing_tds", "KXNFLPASSATT": "passing_attempts",
    "KXNFLPASSCOMP": "passing_completions", "KXNFLPASSINT": "interceptions", "KXNFLRSHYDS": "rushing_yards",
    "KXNFLRSHATT": "rushing_attempts", "KXNFLRECYDS": "receiving_yards", "KXNFLREC": "receptions",
    "KXNFLRRYDS": "rush_rec_yards", "KXNFLTD": "touchdowns",
}
KALSHI_CITY = {
    "arizona": "ARI", "atlanta": "ATL", "baltimore": "BAL", "buffalo": "BUF", "carolina": "CAR", "chicago": "CHI",
    "cincinnati": "CIN", "cleveland": "CLE", "dallas": "DAL", "denver": "DEN", "detroit": "DET", "green bay": "GB",
    "houston": "HOU", "indianapolis": "IND", "jacksonville": "JAX", "kansas city": "KC", "las vegas": "LV",
    "los angeles c": "LAC", "los angeles r": "LA", "miami": "MIA", "minnesota": "MIN", "new england": "NE",
    "new orleans": "NO", "new york g": "NYG", "new york j": "NYJ", "philadelphia": "PHI", "pittsburgh": "PIT",
    "san francisco": "SF", "seattle": "SEA", "tampa bay": "TB", "tennessee": "TEN", "washington": "WAS",
}
MONTHS = "JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split()
COLS = ["series", "stat", "event_ticker", "ticker", "game_date", "season", "away_team", "home_team", "kickoff_utc",
        "player", "player_slug", "line", "snap_end_utc", "yes_bid", "yes_ask", "last_price", "open_interest",
        "volume", "result", "settlement_value", "source"]
log, stats = [], {"events_seen": 0, "events_done_now": 0, "markets_written_now": 0, "no_candle": 0,
                  "no_kickoff": 0, "after_cutoff": 0, "candle_endpoint": None, "market_list_endpoint": None}
raw_samples = {}
T0 = time.time()


def get(url, params=None, tries=4):
    if params:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
    for i in range(tries):
        time.sleep(PAUSE)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429 and i < tries - 1:
                time.sleep(2 ** (i + 1)); continue
            log.append(f"HTTP {e.code} {url[:200]}"); return None
        except Exception as e:
            if i < tries - 1:
                time.sleep(2 ** i); continue
            log.append(f"ERR {type(e).__name__} {url[:200]}"); return None


def num(x):
    """Kalshi gives prices as dollar strings ('0.2600') or integer cents; return dollars 0-1 or None."""
    if x is None or x == "":
        return None
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v / 100.0 if v > 1.0 else v


def cents(x):
    """A cents-or-dollars field: a whole number is cents (so 1 = $0.01, which num() reads as $1), a decimal is dollars."""
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    if v != v:
        return None
    return v if ("." in str(x) and v != int(v)) else v / 100.0


def ohlc_close(c, key):
    v = c.get(key)
    if isinstance(v, dict):
        if v.get("close_dollars") not in (None, ""):
            return num(v["close_dollars"])
        return cents(v["close"]) if v.get("close") not in (None, "") else None
    if c.get(key + "_close_dollars") not in (None, ""):
        return num(c[key + "_close_dollars"])
    return cents(c.get(key + "_close"))


def load_schedule():
    req = urllib.request.Request(SCHEDULE, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        text = r.read().decode("utf-8")
    out = {}
    for row in csv.DictReader(io.StringIO(text)):
        try:
            t = datetime.strptime(f"{row['gameday']} {row['gametime']}", "%Y-%m-%d %H:%M").replace(tzinfo=ET)
        except (KeyError, TypeError, ValueError):
            continue
        out[(row["gameday"], row["away_team"], row["home_team"])] = (t.astimezone(timezone.utc), int(row["season"]))
    return out


def teams_from_title(title):
    head = str(title or "").split(":")[0]
    parts = [p.strip().lower() for p in re.split(r"\s+(?:vs\.?|at|@)\s+", head)]
    if len(parts) != 2:
        return None
    a, h = KALSHI_CITY.get(parts[0]), KALSHI_CITY.get(parts[1])
    return (a, h) if a and h else None


def date_from_ticker(event_ticker):
    m = re.search(r"-(\d{2})([A-Z]{3})(\d{2})", str(event_ticker or ""))
    return f"20{m.group(1)}-{MONTHS.index(m.group(2)) + 1:02d}-{m.group(3)}" if m else None


def settled_events(series):
    """Yield settled events (with nested markets) for one series from BOTH the live and the historical endpoints:
    Kalshi moves older settled markets to /historical, so stopping at the first endpoint with data would miss them.
    An event seen on both is processed once (done_events)."""
    for base_path in ("/events", "/historical/events"):
        cursor, pages, n = None, 0, 0
        while pages < 50:
            d = get(KALSHI + base_path, {"series_ticker": series, "status": "settled", "with_nested_markets": "true",
                                         "limit": 200, "cursor": cursor})
            pages += 1
            if not d:
                break
            evs = d.get("events") or []
            for ev in evs:
                n += 1
                yield ev, base_path
            cursor = d.get("cursor")
            if not cursor or not evs:
                break
        if n:
            ebe = stats.setdefault("events_by_endpoint", {})
            ebe[base_path] = ebe.get(base_path, 0) + n
            stats["market_list_endpoint"] = stats["market_list_endpoint"] or base_path


def markets_for_event(ev, base_path):
    ms = ev.get("markets")
    if ms:
        return ms
    d = get(KALSHI + ("/markets" if base_path == "/events" else "/historical/markets"),
            {"event_ticker": ev.get("event_ticker"), "limit": 1000})
    return (d or {}).get("markets") or []


def candles(series, tickers, start_ts, end_ts):
    """{ticker: [candles]} for an hourly window. Tries the batch endpoint, then per-market live, then historical."""
    out = {}
    if stats["candle_endpoint"] in (None, "batch"):
        for i in range(0, len(tickers), 50):
            chunk = tickers[i:i + 50]
            d = get(KALSHI + "/markets/candlesticks", {"market_tickers": ",".join(chunk), "start_ts": start_ts,
                                                       "end_ts": end_ts, "period_interval": 60})
            if not d:
                break
            for m in d.get("markets") or []:
                out[m.get("market_ticker") or m.get("ticker")] = m.get("candlesticks") or []
            raw_samples.setdefault("batch", d if len(json.dumps(d)) < 20000 else {"truncated": True})
        if any(out.values()):         # empty candle lists (e.g. archived markets) fall through to per-market
            stats["candle_endpoint"] = "batch"
            return out
        out = {}
    for t in tickers:
        got = None
        for path, name in ((f"/series/{series}/markets/{t}/candlesticks", "per_market"),
                           (f"/historical/markets/{t}/candlesticks", "historical")):
            if stats["candle_endpoint"] not in (None, "batch", name):
                continue
            d = get(KALSHI + path, {"start_ts": start_ts, "end_ts": end_ts, "period_interval": 60})
            if d and d.get("candlesticks") is not None:
                got = d["candlesticks"]
                raw_samples.setdefault(name, d if len(json.dumps(d)) < 20000 else {"truncated": True})
                if stats["candle_endpoint"] in (None, "batch"):
                    stats["candle_endpoint"] = name
                break
        out[t] = got or []
    return out


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    sched = load_schedule()
    done = set(open(DONE).read().split()) if os.path.exists(DONE) else set()
    new_file = not os.path.exists(OUT_CSV)
    fout = open(OUT_CSV, "a", newline="")
    w = csv.writer(fout)
    if new_file:
        w.writerow(COLS)
    stopped = False
    for series, stat in SERIES.items():
        if stopped:
            break
        for ev, base_path in settled_events(series):
            stats["events_seen"] += 1
            et = ev.get("event_ticker")
            if not et or et in done:
                continue
            if (time.time() - T0) / 60 > MAX_MINUTES:
                stopped = True; break
            date = date_from_ticker(et)
            teams = teams_from_title(ev.get("title"))
            k = (sched.get((date, teams[0], teams[1])) or sched.get((date, teams[1], teams[0]))) if (date and teams) else None
            if not k:   # not marked done: retried next run, so a naming mismatch never drops a game for good
                stats["no_kickoff"] += 1; log.append(f"no kickoff {et} {ev.get('title')!r}"); continue
            kick, season = k
            if kick >= CUTOFF:
                stats["after_cutoff"] += 1; continue          # not done: never collected (live-test period)
            ms = [m for m in markets_for_event(ev, base_path) if m.get("strike_type") in (None, "greater")]
            snap_limit = kick - SNAP_BEFORE
            start_ts, end_ts = int((kick - timedelta(hours=8)).timestamp()), int(snap_limit.timestamp())
            cs = candles(series, [m["ticker"] for m in ms if m.get("ticker")], start_ts, end_ts)
            for m in ms:
                title = str(m.get("title") or "")
                player = title.split(":")[0].strip() if ":" in title else None
                if not player or m.get("floor_strike") is None:
                    continue
                best = None
                for c in cs.get(m["ticker"]) or []:
                    end = c.get("end_period_ts")
                    if end is None or end > end_ts:
                        continue
                    if best is None or end > best.get("end_period_ts"):
                        best = c
                if not best:
                    stats["no_candle"] += 1
                parts = str(m["ticker"]).split("-")
                slug = parts[-2] if len(parts) >= 4 else ""      # e.g. JACNBOERKIRCHER87 = team + name + jersey
                w.writerow([series, stat, et, m["ticker"], date, season, teams[0], teams[1],
                            kick.strftime("%Y-%m-%dT%H:%M:%SZ"), player, slug, m.get("floor_strike"),
                            datetime.fromtimestamp(best["end_period_ts"], timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if best else "",
                            ohlc_close(best, "yes_bid") if best else "", ohlc_close(best, "yes_ask") if best else "",
                            ohlc_close(best, "price") if best else "",
                            (best.get("open_interest_fp") or best.get("open_interest")) if best else "",
                            (best.get("volume_fp") or best.get("volume")) if best else "",
                            m.get("result"), m.get("settlement_value_dollars") or m.get("settlement_value") or m.get("expiration_value"),
                            base_path])
                stats["markets_written_now"] += 1
            fout.flush()
            done.add(et)
            stats["events_done_now"] += 1
            with open(DONE, "w") as f:
                f.write("\n".join(sorted(done)) + "\n")
    fout.close()
    stats["minutes"] = round((time.time() - T0) / 60, 1)
    stats["complete"] = not stopped
    json.dump({"generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "stats": stats,
               "errors": log[:200], "raw_candle_samples": raw_samples}, open(SUMMARY, "w"), indent=1, default=str)
    print(json.dumps(stats, indent=1))


if __name__ == "__main__":
    sys.exit(main())
