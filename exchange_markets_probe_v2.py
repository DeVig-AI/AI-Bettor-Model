#!/usr/bin/env python3
"""
exchange_markets_probe_v2.py -- NFL-only follow-up to v1 (v1 is left unchanged).

Fixes found in the v1 run (2026-10-18):
  * v1 stopped after 120 sports series, so many NFL series (e.g. player yards / TD markets) may
    have been skipped. v2 pages through ALL Kalshi sports series and keeps every NFL one.
  * v1 saved yes_bid/yes_ask as empty -- Kalshi's field names differ. v2 saves two COMPLETE raw
    market objects per series so the real price fields can be read, plus every key it finds
    that looks like a price.
  * v1's Polymarket filter used a catch-all tag (100639), which pulled in non-NFL events. v2 uses
    only the NFL-specific tag and the NFL series id from /sports, and checks each event's title.

Read-only, public endpoints, no keys, no account, nothing bet. Output:
  odds_probe/exchange_markets_probe_v2.json and odds_probe/exchange_markets_probe_v2.md
"""
import json, os, re, sys, time, urllib.parse, urllib.request, urllib.error
from datetime import datetime, timezone

KALSHI = "https://api.elections.kalshi.com/trade-api/v2"
POLY = "https://gamma-api.polymarket.com"
UA = "exchange-markets-probe/2.0 (personal research; read-only)"
PAUSE = 0.3
OUT_DIR = "odds_probe"
NFL_RX = re.compile(r"\b(nfl|pro football)\b", re.I)
NFL_TEAM_RX = re.compile(r"\b(cardinals|falcons|ravens|bills|panthers|bears|bengals|browns|cowboys|broncos|lions|packers|"
                         r"texans|colts|jaguars|chiefs|raiders|chargers|rams|dolphins|vikings|patriots|saints|giants|jets|"
                         r"eagles|steelers|49ers|seahawks|buccaneers|titans|commanders|nfl)\b", re.I)
PLAYER_RX = re.compile(r"(player|receptions?|receiving|rushing|passing|yards|touchdowns?|\btd\b|tackles?|interceptions?|"
                       r"fantasy|sacks?|completions?|attempts?|longest|kicking|field goals?)", re.I)
PRICE_KEY_RX = re.compile(r"(bid|ask|price|last|prob|volume|open_interest|liquidity)", re.I)
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
            log.append(f"HTTP {e.code} {url[:180]}")
            return None
        except Exception as e:
            if i < tries - 1:
                time.sleep(2 ** i); continue
            log.append(f"ERR {type(e).__name__} {url[:180]}")
            return None


def price_fields(m):
    return {k: v for k, v in m.items() if PRICE_KEY_RX.search(k) and not isinstance(v, (dict, list))}


def probe_kalshi():
    res = {"series_total_sports": 0, "nfl_series": [], "notes": []}
    series, cursor, pages = [], None, 0
    while pages < 60:
        d = get(f"{KALSHI}/series", {"category": "Sports", "cursor": cursor})
        pages += 1
        if not d:
            break
        series += d.get("series") or []
        cursor = d.get("cursor")
        if not cursor:
            break
    res["series_total_sports"] = len(series)
    res["series_pages"] = pages
    nfl = [s for s in series if NFL_RX.search(" ".join([str(s.get("title") or ""), str(s.get("ticker") or "")]))]
    res["nfl_series_total"] = len(nfl)
    for s in nfl:
        tk = s.get("ticker")
        row = {"ticker": tk, "title": s.get("title"), "is_player_type": bool(PLAYER_RX.search(str(s.get("title") or ""))),
               "open_events": 0, "open_markets": 0, "event_titles": [], "raw_market_examples": [], "price_keys_seen": {}}
        ecur, epages = None, 0
        while epages < 4:
            d = get(f"{KALSHI}/events", {"series_ticker": tk, "status": "open", "with_nested_markets": "true",
                                         "limit": 100, "cursor": ecur})
            epages += 1
            if not d:
                break
            for ev in d.get("events") or []:
                row["open_events"] += 1
                if len(row["event_titles"]) < 6:
                    row["event_titles"].append(ev.get("title"))
                for m in ev.get("markets") or []:
                    row["open_markets"] += 1
                    for k, v in price_fields(m).items():
                        row["price_keys_seen"].setdefault(k, v)
                    if len(row["raw_market_examples"]) < 2:
                        row["raw_market_examples"].append(m)
            ecur = d.get("cursor")
            if not ecur:
                break
        if row["open_events"]:
            res["nfl_series"].append(row)
    return res


def probe_polymarket():
    res = {"nfl_tag": None, "nfl_series_id": None, "events": 0, "game_events": 0, "player_prop_events": 0,
           "market_types": {}, "examples": [], "notes": []}
    sports = get(f"{POLY}/sports")
    if sports is None:
        res["notes"].append("unreachable"); return res
    if isinstance(sports, dict):
        sports = sports.get("data") or sports.get("sports") or []
    nfl = next((s for s in sports if str(s.get("sport", "")).lower() == "nfl"), None)
    if not nfl:
        res["notes"].append("no 'nfl' entry in /sports"); return res
    res["sports_entry"] = nfl
    tags = [t.strip() for t in str(nfl.get("tags") or "").split(",") if t.strip()]
    # keep only tags that are specific (not the generic Sports=1 or the cross-sport 100639 seen in v1)
    specific = [t for t in tags if t not in ("1", "100639")]
    res["nfl_tag"] = specific[0] if specific else None
    res["nfl_series_id"] = nfl.get("series")
    seen = set()
    queries = []
    if res["nfl_series_id"]:
        queries.append({"series_id": res["nfl_series_id"]})
    if res["nfl_tag"]:
        queries.append({"tag_id": res["nfl_tag"]})
    for q in queries:
        for page in range(6):
            params = dict(q, closed="false", limit=100, offset=page * 100)
            d = get(f"{POLY}/events", params)
            evs = d if isinstance(d, list) else ((d or {}).get("data") or (d or {}).get("events") or [])
            if not evs:
                break
            for ev in evs:
                if ev.get("id") in seen:
                    continue
                title = str(ev.get("title") or "")
                slug = str(ev.get("slug") or "")
                if not (NFL_TEAM_RX.search(title) or slug.startswith("nfl-")):
                    continue
                seen.add(ev.get("id"))
                res["events"] += 1
                is_game = slug.startswith("nfl-")
                is_props = slug.endswith("-player-props") or "player prop" in title.lower()
                res["game_events"] += int(is_game and not is_props)
                res["player_prop_events"] += int(is_props)
                for m in ev.get("markets") or []:
                    mt = m.get("sportsMarketType") or ("player_prop" if is_props else "untyped")
                    res["market_types"][mt] = res["market_types"].get(mt, 0) + 1
                if len(res["examples"]) < 8 and (is_props or len(res["examples"]) < 4):
                    ms = ev.get("markets") or []
                    res["examples"].append({"title": title, "slug": slug, "n_markets": len(ms),
                                            "first_markets": [{"question": m.get("question"), "outcomes": m.get("outcomes"),
                                                               "prices": m.get("outcomePrices"), "type": m.get("sportsMarketType"),
                                                               "line": m.get("line"), "liquidity": m.get("liquidity")} for m in ms[:4]]})
            if len(evs) < 100:
                break
    return res


def md(out):
    k, p = out["kalshi"], out["polymarket"]
    L = [f"# Exchange markets probe v2 -- NFL only ({out['generated_at']})", "",
         "Read-only, public APIs, no keys, nothing bet.", "",
         f"## Kalshi: {k.get('series_total_sports')} sports series scanned, {k.get('nfl_series_total')} NFL series, "
         f"{len(k.get('nfl_series', []))} with open events", ""]
    for r in sorted(k.get("nfl_series", []), key=lambda r: (not r["is_player_type"], -r["open_markets"])):
        tag = "PLAYER" if r["is_player_type"] else "game/other"
        L.append(f"- [{tag}] **{r['ticker']}** {r['title']}: {r['open_events']} events, {r['open_markets']} markets")
        if r["event_titles"]:
            L.append(f"  - e.g. {r['event_titles'][0]}")
        if r["raw_market_examples"]:
            m = r["raw_market_examples"][0]
            pk = ", ".join(f"{a}={b}" for a, b in list(price_fields(m).items())[:8])
            L.append(f"  - market: {m.get('title') or m.get('yes_sub_title')} | {pk}")
    L += ["", f"## Polymarket NFL: tag {p.get('nfl_tag')}, series {p.get('nfl_series_id')}", "",
          f"- events {p.get('events')}, game events {p.get('game_events')}, player-prop events {p.get('player_prop_events')}",
          f"- market types: {p.get('market_types')}"]
    for e in p.get("examples", []):
        L.append(f"- {e['title']} ({e['slug']}, {e['n_markets']} markets)")
        for m in e["first_markets"][:2]:
            L.append(f"  - {m['question']} | {m['outcomes']} {m['prices']} | type {m['type']} line {m['line']}")
    if p.get("notes"):
        L += [f"- note: {n}" for n in p["notes"]]
    if out["errors"]:
        L += ["", "## Errors", *[f"- {e}" for e in out["errors"][:30]]]
    return "\n".join(L) + "\n"


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    out = {"generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
           "kalshi": probe_kalshi(), "polymarket": probe_polymarket()}
    out["errors"] = log
    with open(os.path.join(OUT_DIR, "exchange_markets_probe_v2.json"), "w") as f:
        json.dump(out, f, indent=1, default=str)
    text = md(out)
    with open(os.path.join(OUT_DIR, "exchange_markets_probe_v2.md"), "w") as f:
        f.write(text)
    print(text)


if __name__ == "__main__":
    sys.exit(main())
