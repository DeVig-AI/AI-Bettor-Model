#!/usr/bin/env python3
"""
kalshi_props_history_v1.py -- collects PAST (settled) Kalshi NBA player-prop markets with the price shortly before
tip-off and how each market settled, for the pre-registered back-test NBA_PROPS_KALSHI_BACKTEST_V1
(nba/NBA_PROPS_KALSHI_BACKTEST_V1_PREREG.md). Read-only public market data: no key, no account, nothing bet.
Same design as nfl/kalshi_props_history_v1.py.

For every settled market in the NBA player-prop series (found with nba_props_exchanges_v1's series filter), for
regular-season, play-in and playoff games that tipped off BEFORE 2026-10-18 00:00 UTC (never overlaps the live test):
  * price  = the last hourly candle closing at least 40 minutes before tip-off, searched in the 8 hours before that
             (yes bid / yes ask / last trade / open interest);
  * result = Kalshi's own settlement ("yes" / "no"; anything else is kept but flagged).
Tip-off time, ESPN season and season type come from ESPN's public NBA scoreboard.

Resumable: appends to nba/props_history/kalshi/<YYYY-MM>.csv (one file per month keeps each file small), remembers
finished events in nba/props_history/done_events.txt, and stops itself after MAX_MINUTES so a GitHub job never times out.
Run from the repo root:  python3 nba/kalshi_props_history_v1.py
"""
import csv, json, os, re, sys, threading, time, urllib.parse, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import nba_props_exchanges_v1 as X  # noqa: E402  (series filter, team / date parsing -- same as the live prices)

KALSHI = "https://api.elections.kalshi.com/trade-api/v2"
ESPN_SB = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard"
UA = "nba-props-history/1.0 (personal research; read-only)"
MIN_GAP = 1 / 15.0                                          # at most ~15 requests a second, all threads together
THREADS = 16
MAX_MINUTES = float(os.getenv("MAX_MINUTES", "300"))
CUTOFF = datetime(2026, 10, 18, tzinfo=timezone.utc)      # only games that tipped off before this
SNAP_BEFORE = timedelta(minutes=40)                         # candle must close >= 40 min before tip-off
SNAP_SEARCH = timedelta(hours=8)                            # ... and within the 8 hours before that
GAME_TYPES = {2, 3, 5}                                      # ESPN: regular season, playoffs, play-in
PICK_STATS = {"points", "rebounds", "assists", "threes", "pts_reb_ast", "pts_reb", "pts_ast", "reb_ast"}
OUT_DIR = os.path.join(HERE, "props_history")
CSV_DIR = os.path.join(OUT_DIR, "kalshi")
DONE = os.path.join(OUT_DIR, "done_events.txt")
SUMMARY = os.path.join(OUT_DIR, "kalshi_props_history_v1_summary.json")
COLS = ["series", "stat", "event_ticker", "ticker", "game_date", "season", "season_type", "away_team", "home_team",
        "tipoff_utc", "player", "line", "snap_end_utc", "yes_bid", "yes_ask", "last_price", "open_interest",
        "volume", "result", "settlement_value", "source"]
log, stats = [], {"series": {}, "events_seen": 0, "events_done_now": 0, "markets_written_now": 0, "no_candle": 0,
                  "no_tipoff": 0, "not_nba_game_type": 0, "after_cutoff": 0, "no_markets": 0, "events_by_endpoint": {},
                  "markets_from": {},
                  "candles_by_endpoint": {}}
raw_samples = {}
T0 = time.time()
_lock, _last = threading.Lock(), [0.0]


def get(url, params=None, tries=4):
    if params:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
    for i in range(tries):
        with _lock:                                         # shared rate limit
            wait = _last[0] + MIN_GAP - time.time()
            if wait > 0:
                time.sleep(wait)
            _last[0] = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429 and i < tries - 1:
                time.sleep(2 ** (i + 1)); continue
            if e.code != 404:
                log.append(f"HTTP {e.code} {url[:200]}")
            return None
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


_sb = {}


def espn_day(date):
    """{(away, home): (tip_utc, espn_season, season_type)} for one ESPN scoreboard date (YYYY-MM-DD, US date)."""
    if date not in _sb:
        out = {}
        d = get(ESPN_SB, {"dates": date.replace("-", ""), "limit": 100})
        for ev in (d or {}).get("events") or []:
            comp = (ev.get("competitions") or [{}])[0]
            t = {c.get("homeAway"): c.get("team", {}).get("abbreviation") for c in comp.get("competitors") or []}
            a, h = X.ALT.get(t.get("away"), t.get("away")), X.ALT.get(t.get("home"), t.get("home"))
            s = ev.get("season") or {}
            if a and h and ev.get("date"):
                tip = datetime.fromisoformat(ev["date"].replace("Z", "+00:00")).astimezone(timezone.utc)
                out[(a, h)] = (tip, s.get("year"), s.get("type"))
        if d is not None:
            _sb[date] = out
        return out
    return _sb[date]


def game_of(date, teams):
    """(away, home, tip, season, season_type) from ESPN, or None. Kalshi sometimes lists home first."""
    sb = espn_day(date)
    for a, h in (teams, teams[::-1]):
        if (a, h) in sb:
            return (a, h) + sb[(a, h)]
    return None


def settled_events(series):
    """Yield settled events (with nested markets) for one series from the live and the historical endpoints (Kalshi
    moves older settled markets to /historical), then any historical markets not inside those events, grouped by event."""
    seen = set()
    for base_path in ("/events", "/historical/events"):
        cursor, pages = None, 0
        while pages < 100:
            d = get(KALSHI + base_path, {"series_ticker": series, "status": "settled", "with_nested_markets": "true",
                                         "limit": 200, "cursor": cursor})
            pages += 1
            if not d:
                break
            evs = d.get("events") or []
            for ev in evs:
                if ev.get("event_ticker") in seen:
                    continue
                seen.add(ev.get("event_ticker"))
                stats["events_by_endpoint"][base_path] = stats["events_by_endpoint"].get(base_path, 0) + 1
                yield ev, base_path
            cursor = d.get("cursor")
            if not cursor or not evs:
                break
    groups, cursor, pages = {}, None, 0
    while pages < 500:
        d = get(KALSHI + "/historical/markets", {"series_ticker": series, "limit": 1000, "cursor": cursor})
        pages += 1
        if not d:
            break
        ms = d.get("markets") or []
        for m in ms:
            if m.get("event_ticker") and m["event_ticker"] not in seen:
                groups.setdefault(m["event_ticker"], []).append(m)
        cursor = d.get("cursor")
        if not cursor or not ms:
            break
    for et, ms in groups.items():
        stats["events_by_endpoint"]["/historical/markets"] = stats["events_by_endpoint"].get("/historical/markets", 0) + 1
        yield {"event_ticker": et, "title": None, "markets": ms}, "/historical/markets"


def markets_for_event(ev, base_path):
    """The event's markets: nested, else the live list, else the historical list (Kalshi keeps a settled event under
    /events but moves its markets to /historical/markets after its historical cutoff)."""
    ms = ev.get("markets")
    if ms:
        stats["markets_from"]["nested"] = stats["markets_from"].get("nested", 0) + 1
        return ms, base_path
    for path in ("/markets", "/historical/markets"):
        d = get(KALSHI + path, {"event_ticker": ev.get("event_ticker"), "limit": 1000})
        ms = (d or {}).get("markets") or []
        if ms:
            stats["markets_from"][path] = stats["markets_from"].get(path, 0) + 1
            raw_samples.setdefault("market_" + path, ms[0])
            return ms, path
    return [], None


def label(m):
    """(player, N) from an "N+" market's wording: "Name: N+ threes" (title), "Name: N+" (yes_sub_title) or, before
    mid-January 2026, "Name records N+ threes" (title). (None, None) if none fits."""
    for text, pat in ((m.get("title"), r"^(.+?):\s*(\d+)\+"), (m.get("yes_sub_title"), r"^(.+?):\s*(\d+)\+"),
                      (m.get("title"), r"^(.+?)\s+records\s+(\d+)\+")):
        mt = re.search(pat, str(text or "").strip())
        if mt:
            return mt.group(1).strip(), int(mt.group(2))
    return None, None


def is_over_market(m):
    """An "N+ <stat>" market (= Over N-0.5). Live markets say strike_type "greater"; Kalshi's historical copies of the
    same markets say "structured" (player in custom_strike), so those count only when the wording reads "N+" and
    floor_strike = N - 0.5."""
    st = m.get("strike_type")
    if st in (None, "greater"):
        return True
    _, n = label(m)
    try:
        return st == "structured" and n is not None and abs(float(m.get("floor_strike")) - (n - 0.5)) < 1e-9
    except (TypeError, ValueError):
        return False


def one_market_candles(series, t, start_ts, end_ts, historical=False):
    paths = ((f"/series/{series}/markets/{t}/candlesticks", "per_market"),
             (f"/historical/markets/{t}/candlesticks", "historical"))
    for path, name in (paths[1:] if historical else paths):
        d = get(KALSHI + path, {"start_ts": start_ts, "end_ts": end_ts, "period_interval": 60})
        if d and d.get("candlesticks"):
            raw_samples.setdefault(name, d if len(json.dumps(d)) < 20000 else {"truncated": True})
            return name, d["candlesticks"]
    return None, []


def candles(series, tickers, start_ts, end_ts, pool, historical=False):
    """{ticker: [candles]} for the snapshot window: the batch endpoint first, then per market (live, then historical)
    for any ticker the batch returned nothing for. Markets read from /historical/markets go straight to the historical
    candles (the live endpoints return nothing for them)."""
    out = {}
    for i in range(0, 0 if historical else len(tickers), 50):
        d = get(KALSHI + "/markets/candlesticks", {"market_tickers": ",".join(tickers[i:i + 50]), "start_ts": start_ts,
                                                   "end_ts": end_ts, "period_interval": 60})
        for m in (d or {}).get("markets") or []:
            if m.get("candlesticks"):
                out[m.get("market_ticker") or m.get("ticker")] = m["candlesticks"]
        if d:
            raw_samples.setdefault("batch", d if len(json.dumps(d)) < 20000 else {"truncated": True})
    ce = stats["candles_by_endpoint"]
    ce["batch"] = ce.get("batch", 0) + len(out)
    rest = [t for t in tickers if t not in out]
    for t, (name, cs) in zip(rest, pool.map(lambda t: one_market_candles(series, t, start_ts, end_ts, historical), rest)):
        out[t] = cs
        if name:
            ce[name] = ce.get(name, 0) + 1
    return out


def main():
    os.makedirs(CSV_DIR, exist_ok=True)
    done = set(open(DONE).read().split()) if os.path.exists(DONE) else set()
    series = X.discover_series()
    if not series:
        sys.exit("no NBA player-prop series found (Kalshi unreachable?)")
    stats["series"] = series
    order = sorted(series, key=lambda s: (series[s]["stat"] not in PICK_STATS, s))   # verdict stats first
    files, writers = {}, {}

    def writer(month):
        if month not in writers:
            p = os.path.join(CSV_DIR, f"{month}.csv")
            new = not os.path.exists(p)
            files[month] = open(p, "a", newline="")
            writers[month] = csv.writer(files[month])
            if new:
                writers[month].writerow(COLS)
        return writers[month]

    stopped = False
    pool = ThreadPoolExecutor(THREADS)
    for tk in order:
        if stopped:
            break
        stat = series[tk]["stat"]
        for ev, base_path in settled_events(tk):
            stats["events_seen"] += 1
            et = ev.get("event_ticker")
            if not et or et in done:
                continue
            if (time.time() - T0) / 60 > MAX_MINUTES:
                stopped = True; break
            date = X.date_from_ticker(et)
            teams = X.teams_from_title(ev.get("title")) or X.teams_from_ticker(et)
            g = game_of(date, teams) if (date and teams) else None
            if not g:   # not marked done: retried next run, so a naming mismatch never drops a game for good
                stats["no_tipoff"] += 1; log.append(f"no tip-off {et} {ev.get('title')!r}"); continue
            away, home, tip, season, stype = g
            if tip >= CUTOFF:
                stats["after_cutoff"] += 1; continue          # not done: never collected (live-test period)
            if stype not in GAME_TYPES:                        # preseason / All-Star: excluded by the prereg
                stats["not_nba_game_type"] += 1; done.add(et); continue
            raw_samples.setdefault("event", {k: v for k, v in ev.items() if k != "markets"})
            all_ms, ms_from = markets_for_event(ev, base_path)
            ms = [m for m in all_ms if is_over_market(m)]
            if not ms:  # not marked done: an event with no readable markets is retried, never dropped silently
                stats["no_markets"] += 1; log.append(f"no markets {et}"); continue
            snap_limit = tip - SNAP_BEFORE
            start_ts, end_ts = int((snap_limit - SNAP_SEARCH).timestamp()), int(snap_limit.timestamp())
            cs = candles(tk, [m["ticker"] for m in ms if m.get("ticker")], start_ts, end_ts, pool,
                         historical=ms_from in ("/historical/markets", "/historical/events"))
            w = writer(date[:7])
            n_written = 0
            for m in ms:
                player = label(m)[0]
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
                w.writerow([tk, stat, et, m["ticker"], date, season, stype, away, home,
                            tip.strftime("%Y-%m-%dT%H:%M:%SZ"), player, m.get("floor_strike"),
                            datetime.fromtimestamp(best["end_period_ts"], timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if best else "",
                            ohlc_close(best, "yes_bid") if best else "", ohlc_close(best, "yes_ask") if best else "",
                            ohlc_close(best, "price") if best else "",
                            (best.get("open_interest_fp") or best.get("open_interest")) if best else "",
                            (best.get("volume_fp") or best.get("volume")) if best else "",
                            m.get("result"), m.get("settlement_value_dollars") or m.get("settlement_value") or m.get("expiration_value"),
                            base_path])
                stats["markets_written_now"] += 1
                n_written += 1
            files[date[:7]].flush()
            if not n_written:
                stats["no_markets"] += 1; log.append(f"no player markets {et}")
                raw_samples.setdefault("unparsed_market", ms[0]); continue
            done.add(et)
            stats["events_done_now"] += 1
            with open(DONE, "w") as f:
                f.write("\n".join(sorted(done)) + "\n")
    pool.shutdown()
    for f in files.values():
        f.close()
    with open(DONE, "w") as f:
        f.write("\n".join(sorted(done)) + ("\n" if done else ""))
    stats["minutes"] = round((time.time() - T0) / 60, 1)
    stats["complete"] = not stopped
    stats["events_done_total"] = len(done)
    json.dump({"generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "stats": stats,
               "errors": log[:300], "raw_candle_samples": raw_samples}, open(SUMMARY, "w"), indent=1, default=str)
    print(json.dumps({k: v for k, v in stats.items() if k != "series"}, indent=1))


if __name__ == "__main__":
    sys.exit(main())
