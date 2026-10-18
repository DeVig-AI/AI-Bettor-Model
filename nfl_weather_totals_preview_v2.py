#!/usr/bin/env python3
"""nfl_weather_totals_preview_v2.py -- PREVIEW of the weather over/under for upcoming NFL games, at Kalshi's price.

NOT part of the NFL_WEATHER_TOTALS_LIVE_V2 test and never counted: same frozen model and pick rule, on games more
than 3.5h away, with today's forecast and today's Kalshi total. The official live-test pick (made <= 3.5h before
kickoff) replaces it. Never writes the live-test database. Output: WEATHER_TOTALS_PREVIEW_V2.json. Free, no key.

Usage: python nfl_weather_totals_preview_v2.py [--hours 36]
"""
import argparse, datetime as dt, json, os, sqlite3

import nfl_weather_totals_live_v2 as L2
W = L2.W

OUT = os.path.join(W.HERE, "WEATHER_TOTALS_PREVIEW_V2.json")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--hours", type=float, default=36.0)
    a = ap.parse_args()
    m = W.load_model()
    now = W.utcnow()
    start, end = now + dt.timedelta(hours=W.WINDOW_H), now + dt.timedelta(hours=a.hours)
    dates = sorted({(now + dt.timedelta(hours=h)).strftime("%Y%m%d") for h in range(0, int(a.hours) + 7, 6)})
    games = [g for g in (W.espn_info(e) for e in W.espn_events(dates)) if start < g["kickoff"] <= end]
    out = {"generated_utc": W.iso(now), "model_sha": W.file_sha(W.MODEL_PATH), "counted": False, "book": "kalshi",
           "games": []}
    if games:
        totals = L2.kalshi_totals()
        cache = sqlite3.connect(":memory:")
        cache.executescript(W.SCHEMA)
        for g in games:
            rec = {"game_id": g["game_id"], "kickoff_utc": W.iso(g["kickoff"]), "home": g["home"], "away": g["away"],
                   "venue": g["venue"], "indoor": None if g["indoor"] is None else bool(g["indoor"])}
            r = L2.price_game(m, g, totals.get(str(g["game_id"])), cache)
            r.pop("lat", None); r.pop("lon", None); r.pop("q_over", None); r.pop("user_books_json", None)
            if "skip_reason" in r:
                r["reason"] = r.pop("skip_reason")
            rec.update(r)
            out["games"].append(rec)
    with open(OUT, "w") as f:
        json.dump(out, f, indent=1, sort_keys=True)
    tally = {}
    for r in out["games"]:
        tally[r["pick"]] = tally.get(r["pick"], 0) + 1
    print("preview (not counted):", len(out["games"]), "game(s)", tally)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
