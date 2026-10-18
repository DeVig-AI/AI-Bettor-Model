#!/usr/bin/env python3
"""
nfl_props_exchanges_v1.py -- pull this week's NFL player-prop prices from the PUBLIC Kalshi and
Polymarket market-data APIs and write one app-ready export file.

* Read-only. No keys, no account, no trading endpoints. Nothing is bet.
* Output: nfl/props_exchanges_export.json in the same {"sport","generated_at","docs":[...]} format
  as the other Lineboard exports (collection "props", one doc per game, upsert by doc_id).
* Prices are exchange prices (0-1 = the market's implied chance), NOT sportsbook odds. Kalshi charges
  a trading fee and both have a bid/ask gap; thin Polymarket books can show stale prices. The app
  labels all of this. No pick is made here -- this file is market prices only.

Each game doc holds rows keyed by (player, stat, line). A row can have a Kalshi quote, a Polymarket
quote, or both. "line" is an Over line: Kalshi "15+ receiving yards" (floor_strike 14.5) == Over 14.5.
"""
import hashlib, json, os, re, sys, time, unicodedata, urllib.parse, urllib.request, urllib.error
from datetime import datetime, timezone

KALSHI = "https://api.elections.kalshi.com/trade-api/v2"
POLY = "https://gamma-api.polymarket.com"
POLY_NFL_SERIES = "12185"            # from GET /sports (sport "nfl"), seen 2026-10-18
UA = "nfl-props-exchanges/1.0 (personal research; read-only)"
PAUSE = 0.3
OUT = os.path.join("nfl", "props_exchanges_export.json")

# Kalshi per-game player series -> canonical stat
KALSHI_SERIES = {
    "KXNFLPASSYDS": "passing_yards", "KXNFLPASSTDS": "passing_tds", "KXNFLPASSATT": "passing_attempts",
    "KXNFLPASSCOMP": "passing_completions", "KXNFLPASSINT": "interceptions", "KXNFLRSHYDS": "rushing_yards",
    "KXNFLRSHATT": "rushing_attempts", "KXNFLRECYDS": "receiving_yards", "KXNFLREC": "receptions",
    "KXNFLRRYDS": "rush_rec_yards", "KXNFLTD": "touchdowns", "KXNFLFFPTS": "fantasy_points",
}
# Polymarket sportsMarketType -> canonical stat (and fixed line where the market has none)
POLY_TYPES = {
    "passing_yards": ("passing_yards", None), "passing_touchdowns": ("passing_tds", None),
    "passing_attempts": ("passing_attempts", None), "passing_completions": ("passing_completions", None),
    "rushing_yards": ("rushing_yards", None), "receiving_yards": ("receiving_yards", None),
    "receptions": ("receptions", None), "anytime_touchdowns": ("touchdowns", 0.5),
    "two_plus_touchdowns": ("touchdowns", 1.5), "longest_reception": ("longest_reception", None),
}
KALSHI_CITY = {
    "arizona": "ARI", "atlanta": "ATL", "baltimore": "BAL", "buffalo": "BUF", "carolina": "CAR", "chicago": "CHI",
    "cincinnati": "CIN", "cleveland": "CLE", "dallas": "DAL", "denver": "DEN", "detroit": "DET", "green bay": "GB",
    "houston": "HOU", "indianapolis": "IND", "jacksonville": "JAX", "kansas city": "KC", "las vegas": "LV",
    "los angeles c": "LAC", "los angeles r": "LA", "miami": "MIA", "minnesota": "MIN", "new england": "NE",
    "new orleans": "NO", "new york g": "NYG", "new york j": "NYJ", "philadelphia": "PHI", "pittsburgh": "PIT",
    "san francisco": "SF", "seattle": "SEA", "tampa bay": "TB", "tennessee": "TEN", "washington": "WAS",
}
POLY_ABBR = {"jac": "JAX", "lar": "LA", "wsh": "WAS", "la": "LA"}
log = []


def get(url, params=None, tries=4):
    if params:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
    for i in range(tries):
        time.sleep(PAUSE)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429 and i < tries - 1:
                time.sleep(2 ** (i + 1)); continue
            log.append(f"HTTP {e.code} {url[:180]}"); return None
        except Exception as e:
            if i < tries - 1:
                time.sleep(2 ** i); continue
            log.append(f"ERR {type(e).__name__} {url[:180]}"); return None


def fnum(x):
    try:
        v = float(x)
        return v if v == v else None
    except (TypeError, ValueError):
        return None


def norm_name(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z ]", "", s.replace("-", " "))
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", s)
    return re.sub(r"\s+", " ", s).strip()


def kalshi_game(event_title):
    # "Houston vs Jacksonville: Receiving Yards" -> ("HOU", "JAX")  (away first, as Kalshi lists it)
    head = str(event_title or "").split(":")[0]
    parts = [p.strip().lower() for p in re.split(r"\s+(?:vs\.?|at|@)\s+", head)]
    if len(parts) != 2:
        return None
    a, h = KALSHI_CITY.get(parts[0]), KALSHI_CITY.get(parts[1])
    return (a, h) if a and h else None


def poly_game(slug):
    # "nfl-hou-jax-2026-10-18-player-props" -> ("HOU", "JAX", "2026-10-18")
    m = re.match(r"^nfl-([a-z]+)-([a-z]+)-(\d{4}-\d{2}-\d{2})", str(slug or ""))
    if not m:
        return None
    f = lambda x: POLY_ABBR.get(x, x.upper())
    return f(m.group(1)), f(m.group(2)), m.group(3)


games = {}   # key "YYYY-MM-DD_AWAY_HOME" -> {"meta":..., "rows": {(player_norm, stat, line): row}}


def kickoff_ok(kickoff, date):
    # a kickoff must fall on the game's local date or, for night games, the next UTC day; anything else is a
    # close/expiration time or junk, and a late kickoff would let the model lock after the game has started
    try:
        k = datetime.fromisoformat(str(kickoff).replace("Z", "+00:00")).astimezone(timezone.utc)
        d = datetime.fromisoformat(date).date()
    except (TypeError, ValueError):
        return False
    return 0 <= (k.date() - d).days <= 1


def game_slot(date, away, home, kickoff=None):
    key = f"{date}_{away}_{home}"
    g = games.setdefault(key, {"meta": {"game_key": key, "game_date": date, "away_team": away, "home_team": home,
                                        "kickoff_time": None}, "rows": {}})
    if kickoff and not kickoff_ok(kickoff, date):
        log.append(f"bad kickoff {kickoff} for {key}"); kickoff = None
    if kickoff and (not g["meta"]["kickoff_time"] or kickoff < g["meta"]["kickoff_time"]):
        g["meta"]["kickoff_time"] = kickoff
    return g


def row_slot(g, player, stat, line):
    k = (norm_name(player), stat, round(float(line), 1))
    r = g["rows"].get(k)
    if not r:
        r = g["rows"][k] = {"player": player.strip(), "stat": stat, "line": round(float(line), 1)}
    return r


def pull_kalshi():
    n = 0
    for tk, stat in KALSHI_SERIES.items():
        cursor, pages = None, 0
        while pages < 5:
            d = get(f"{KALSHI}/events", {"series_ticker": tk, "status": "open", "with_nested_markets": "true",
                                         "limit": 100, "cursor": cursor})
            pages += 1
            if not d:
                break
            for ev in d.get("events") or []:
                teams = kalshi_game(ev.get("title"))
                if not teams:
                    continue
                for m in ev.get("markets") or []:
                    if m.get("status") not in (None, "active", "open"):
                        continue
                    if m.get("strike_type") not in (None, "greater"):
                        continue
                    line = fnum(m.get("floor_strike"))
                    title = str(m.get("title") or "")
                    player = title.split(":")[0].strip() if ":" in title else None
                    if line is None or not player:
                        continue
                    # kickoff only from occurrence_datetime (expiration fields are settlement times, not kickoff);
                    # a missing kickoff means the game is skipped rather than locked late
                    kick = m.get("occurrence_datetime")
                    date = str(kick or "")[:10]
                    # Kalshi event date is the local game date; night games roll past midnight UTC. Use the ticker date.
                    mt = re.search(r"-(\d{2})([A-Z]{3})(\d{2})", str(m.get("event_ticker") or ""))
                    if mt:
                        months = "JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split()
                        date = f"20{mt.group(1)}-{months.index(mt.group(2)) + 1:02d}-{mt.group(3)}"
                    g = game_slot(date, teams[0], teams[1], kick)
                    r = row_slot(g, player, stat, line)
                    r["k"] = {"bid": fnum(m.get("yes_bid_dollars")), "ask": fnum(m.get("yes_ask_dollars")),
                              "last": fnum(m.get("last_price_dollars")), "oi": fnum(m.get("open_interest_fp")),
                              "vol": fnum(m.get("volume_fp")), "t": m.get("ticker")}
                    n += 1
            cursor = d.get("cursor")
            if not cursor:
                break
    return n


def pull_poly():
    n, seen = 0, set()
    for page in range(8):
        d = get(f"{POLY}/events", {"series_id": POLY_NFL_SERIES, "closed": "false", "limit": 100, "offset": page * 100})
        evs = d if isinstance(d, list) else ((d or {}).get("data") or [])
        if not evs:
            break
        for ev in evs:
            slug = str(ev.get("slug") or "")
            if not slug.endswith("-player-props") or ev.get("id") in seen:
                continue
            seen.add(ev.get("id"))
            gm = poly_game(slug)
            if not gm:
                continue
            # startTime is kickoff; endDate is resolution time, never a kickoff
            g = game_slot(gm[2], gm[0], gm[1], ev.get("startTime"))
            for m in ev.get("markets") or []:
                if m.get("closed") is True:
                    continue
                spec = POLY_TYPES.get(m.get("sportsMarketType"))
                if not spec:
                    continue
                stat, fixed_line = spec
                line = fnum(m.get("line")) if fixed_line is None else fixed_line
                q = str(m.get("question") or "")
                player = q.split(":")[0].strip() if ":" in q else None
                if line is None or not player:
                    continue
                try:
                    outs = json.loads(m.get("outcomes") or "[]")
                    prices = [fnum(x) for x in json.loads(m.get("outcomePrices") or "[]")]
                except (TypeError, ValueError):
                    continue
                if len(outs) != 2 or len(prices) != 2:
                    continue
                over_i = 0 if str(outs[0]).lower() in ("over", "yes") else 1
                r = row_slot(g, player, stat, line)
                bb, ba = fnum(m.get("bestBid")), fnum(m.get("bestAsk"))
                if over_i == 1 and bb is not None and ba is not None:   # book quotes are for the first outcome
                    bb, ba = 1 - ba, 1 - bb
                r["p"] = {"price": prices[over_i], "bid": bb, "ask": ba, "liq": fnum(m.get("liquidity")),
                          "vol": fnum(m.get("volume")), "slug": slug}
                n += 1
        if len(evs) < 100:
            break
    return n


def main():
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    nk = pull_kalshi()
    npl = pull_poly()
    docs = []
    for key, g in sorted(games.items()):
        rows = sorted(g["rows"].values(), key=lambda r: (r["stat"], r["player"], r["line"]))
        data = dict(g["meta"], sport="NFL", source="kalshi+polymarket public market data", fetched_at=now,
                    note="Exchange prices = market's implied chance (0-1). Not sportsbook odds, not picks. "
                         "Kalshi charges a trading fee; thin Polymarket books can be stale.",
                    n_rows=len(rows), rows=rows)
        data["export_hash"] = hashlib.sha256(json.dumps({k: v for k, v in data.items() if k != "fetched_at"},
                                                        sort_keys=True).encode()).hexdigest()
        docs.append({"collection": "props", "doc_id": key, "data": data})
    os.makedirs("nfl", exist_ok=True)
    out = {"sport": "NFL_PROPS", "generated_at": now, "n_docs": len(docs),
           "counts": {"kalshi_quotes": nk, "polymarket_quotes": npl,
                      "rows": sum(d["data"]["n_rows"] for d in docs),
                      "rows_both_sources": sum(1 for d in docs for r in d["data"]["rows"] if "k" in r and "p" in r)},
           "errors": log[:50], "docs": docs}
    with open(OUT, "w") as f:
        json.dump(out, f, separators=(",", ":"), allow_nan=False)
    print(json.dumps({k: v for k, v in out.items() if k != "docs"}, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
