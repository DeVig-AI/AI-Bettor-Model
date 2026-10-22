#!/usr/bin/env python3
"""Diagnostic only (not part of the pre-registered pipeline): how Kalshi worded NHL prop markets for games from
December 2025 to early February 2026, which the collector reads as having no "N+" markets. Saves label fields of a few
markets per event (title, sub-titles, strike type, strikes; never a price) to nhl/props_history/probe/probe_v1.json."""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import nhl_kalshi_common_v1 as K  # noqa: E402

_SUM = os.path.join(HERE, "props_history", "kalshi_props_history_v1_summary.json")
_LEFT = [e.split()[-1] for e in json.load(open(_SUM)).get("errors", []) if e.startswith("no markets")][:6] \
    if os.path.exists(_SUM) else []             # the events the collector still reads as "no markets"
EVENTS = _LEFT + ["KXNHLGOAL-26JAN15TORCHI", "KXNHLGOAL-26FEB05PITBUF", "KXNHLGOAL-25DEC20BOSMTL", "KXNHLPTS-26JAN15TORCHI",
          "KXNHLGOAL-26FEB28PITNYR", "KXNHLGOAL-26MAR10TORBOS"]
LABEL = ("ticker", "title", "yes_sub_title", "no_sub_title", "strike_type", "floor_strike", "cap_strike", "custom_strike",
         "functional_strike", "market_type", "result", "status")
out = {}
d = K.get(K.KALSHI + "/events", {"series_ticker": "KXNHLGOAL", "status": "settled", "limit": 200})
evs = [e["event_ticker"] for e in (d or {}).get("events") or []]
out["settled_events_sample"] = [e for e in evs if "26JAN" in e or "25DEC" in e][:5]
for et in EVENTS + out["settled_events_sample"][:3]:
    for path in ("/historical/markets", "/markets"):
        r = K.get(K.KALSHI + path, {"event_ticker": et, "limit": 1000}) or {}
        ms = r.get("markets") or []
        out[f"{et} {path}"] = {"n": len(ms), "labels": [{k: m.get(k) for k in LABEL} for m in ms[:4]],
                               "parsed_over": sum(K.is_over_market(m) for m in ms)}
    e = K.get(K.KALSHI + f"/events/{et}", {"with_nested_markets": "true"}) or {}
    ev = e.get("event") or {}
    out[f"{et} /events"] = {"title": ev.get("title"), "sub_title": ev.get("sub_title"),
                            "n_markets": len(ev.get("markets") or e.get("markets") or [])}
os.makedirs(os.path.join(HERE, "props_history", "probe"), exist_ok=True)
json.dump(out, open(os.path.join(HERE, "props_history", "probe", "probe_v1.json"), "w"), indent=1, default=str)
print(json.dumps(out, indent=1, default=str)[:5000])
