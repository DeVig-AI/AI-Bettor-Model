#!/usr/bin/env python3
"""Diagnostic only (not part of the pre-registered pipeline): which public Kalshi endpoint, if any, still lists the
markets of an older settled NBA prop event (before mid-January 2026) that /markets and /historical/markets?event_ticker
returned empty. Writes response shapes and counts to nba/props_history/probe/probe_v1.json -- no prices."""
import json, os, urllib.parse, urllib.request, urllib.error, collections, re
K = "https://api.elections.kalshi.com/trade-api/v2"
OLD, NEW = "KXNBA3PT-25DEC15MEMLAC", "KXNBA3PT-26JAN16CHIBKN"
out = {}


def get(path, params=None):
    url = K + path + ("?" + urllib.parse.urlencode(params) if params else "")
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"Accept": "application/json"}), timeout=40) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:300]
    except Exception as e:
        return None, repr(e)[:300]


def shape(code, d):
    if not isinstance(d, dict):
        return {"status": code, "body": d}
    s = {"status": code, "keys": sorted(d)}
    for k in ("markets", "events"):
        if isinstance(d.get(k), list):
            s[k + "_n"] = len(d[k])
            if d[k]:
                s[k + "_first_keys"] = sorted(d[k][0])
                s[k + "_tickers"] = [m.get("ticker") or m.get("event_ticker") for m in d[k][:3]]
    if isinstance(d.get("event"), dict):
        s["event_markets_n"] = len(d["event"].get("markets") or [])
    s["cursor"] = bool(d.get("cursor"))
    return s


for name, et in (("old", OLD), ("new", NEW)):
    for label, path, p in (("events_one", f"/events/{et}", {"with_nested_markets": "true"}),
                           ("hist_events_one", f"/historical/events/{et}", {"with_nested_markets": "true"}),
                           ("markets_by_event", "/markets", {"event_ticker": et, "limit": 1000}),
                           ("markets_by_event_settled", "/markets", {"event_ticker": et, "status": "settled", "limit": 1000}),
                           ("hist_markets_by_event", "/historical/markets", {"event_ticker": et, "limit": 1000}),
                           ("hist_markets_by_tickers", "/historical/markets", {"tickers": et + "-x", "limit": 10})):
        out[f"{name}:{label}"] = shape(*get(path, p))
out["historical_cutoff"] = get("/historical/cutoff")
# months covered by the series-wide historical listing (event tickers only)
months, cursor, pages = collections.Counter(), None, 0
while pages < 400:
    code, d = get("/historical/markets", {"series_ticker": "KXNBA3PT", "limit": 1000, **({"cursor": cursor} if cursor else {})})
    pages += 1
    if not isinstance(d, dict):
        out["hist_series_scan_error"] = [code, d]; break
    for m in d.get("markets") or []:
        mm = re.search(r"-(\d\d[A-Z]{3})", m.get("event_ticker") or "")
        months[mm.group(1) if mm else "?"] += 1
    cursor = d.get("cursor")
    if not cursor or not d.get("markets"):
        break
out["hist_series_scan_KXNBA3PT_markets_by_month"] = dict(months); out["hist_series_scan_pages"] = pages
months, cursor, pages = collections.Counter(), None, 0
while pages < 400:
    code, d = get("/markets", {"series_ticker": "KXNBA3PT", "status": "settled", "limit": 1000, **({"cursor": cursor} if cursor else {})})
    pages += 1
    if not isinstance(d, dict):
        break
    for m in d.get("markets") or []:
        mm = re.search(r"-(\d\d[A-Z]{3})", m.get("event_ticker") or "")
        months[mm.group(1) if mm else "?"] += 1
    cursor = d.get("cursor")
    if not cursor or not d.get("markets"):
        break
out["live_series_scan_KXNBA3PT_settled_by_month"] = dict(months)
LABEL = ("ticker", "title", "yes_sub_title", "no_sub_title", "strike_type", "floor_strike", "cap_strike", "custom_strike",
         "functional_strike", "market_type", "result", "status")
for name, et in (("old", OLD), ("new", NEW)):
    code, d = get("/historical/markets", {"event_ticker": et, "limit": 1000})
    out[name + ":labels"] = [{k: m.get(k) for k in LABEL} for m in (d.get("markets") or [])[:6]] if isinstance(d, dict) else [code, d]
os.makedirs("nba/props_history/probe", exist_ok=True)
json.dump(out, open("nba/props_history/probe/probe_v1.json", "w"), indent=1, default=str)
print(json.dumps(out, indent=1, default=str)[:6000])
