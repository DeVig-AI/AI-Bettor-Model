#!/usr/bin/env python3
"""
market_history_backfill.py -- one-time fill of live/market_history.json (the History tab's NHL and WNBA games) for
games played before tools/game_lines.py started recording them. Display only: nothing here feeds a model or a test.

For every finished game on ESPN's scoreboard between --since and today: the teams, start time and final score, and
Kalshi's home win chance from the last hourly candle before the start (the bid/ask midpoint of the home team's
"wins" market, from the settled Kalshi event). A game Kalshi didn't list, or whose candles can't be read, is kept with
its final score and no Kalshi number ("pre" left out). Games already in the file are never changed.

    python3 tools/market_history_backfill.py --sport NHL --since 2026-10-01
    python3 tools/market_history_backfill.py --sport WNBA --since 2026-05-01
"""
import argparse
import json
import os
import sys
from datetime import date, datetime, timedelta, timezone

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.dirname(__file__))
import kalshi_games_v1 as KG  # noqa: E402
import game_lines as GL  # noqa: E402

KG.ESPN.setdefault("NHL", "hockey/nhl")
KG.ESPN.setdefault("WNBA", "basketball/wnba")


def espn_day(sport, day):
    """ESPN's finished games on one US date: [{espn_id, kickoff, away, home, names, colors, final}]."""
    d = KG.get(f"https://site.api.espn.com/apis/site/v2/sports/{KG.ESPN[sport]}/scoreboard",
               {"dates": day.strftime("%Y%m%d")}) or {}
    out = []
    for ev in d.get("events") or []:
        comp = (ev.get("competitions") or [{}])[0]
        st = ((ev.get("status") or comp.get("status") or {}).get("type")) or {}
        side = {c.get("homeAway"): c for c in comp.get("competitors") or []}
        if st.get("state") != "post" or "home" not in side or "away" not in side:
            continue
        try:
            final = {k: int(float(side[k].get("score"))) for k in ("away", "home")}
        except (TypeError, ValueError):
            continue
        t = {k: side[k].get("team") or {} for k in ("away", "home")}
        out.append({"espn_id": str(ev.get("id")), "kickoff": ev.get("date"), "teams": t, "final": final,
                    "away": KG.canon(sport, t["away"].get("abbreviation")), "home": KG.canon(sport, t["home"].get("abbreviation")),
                    "colors": {k: "#" + t[k]["color"] for k in ("away", "home") if t[k].get("color")}})
    return out


def settled_events(sport):
    """Kalshi's settled game events for the sport: {date: [event]} (event dates as the ticker gives them)."""
    out, cursor = {}, None
    for _ in range(40):
        d = KG.get(f"{KG.KALSHI}/events", {"series_ticker": f"KX{sport}GAME", "status": "settled",
                                           "with_nested_markets": "true", "limit": 200, "cursor": cursor})
        if not d:
            break
        for ev in d.get("events") or []:
            out.setdefault(KG._date(ev.get("event_ticker")), []).append(ev)
        cursor = d.get("cursor")
        if not cursor or not d.get("events"):
            break
    return out


def home_market(sport, game, events):
    """The ticker of the home team's "wins" market in the Kalshi event for this ESPN game, or None."""
    day = date.fromisoformat(game["date"])
    for dd in (day, day - timedelta(days=1), day + timedelta(days=1)):
        for ev in events.get(dd.isoformat(), []):
            mk = {}
            for m in ev.get("markets") or []:
                code = str(m.get("ticker") or "").rsplit("-", 1)[-1]
                mk[code] = m
            if len(mk) != 2:
                continue
            match = {}
            for code, m in mk.items():
                for k in ("away", "home"):
                    if KG._team_is(sport, code, m.get("yes_sub_title") or "", game["teams"][k]):
                        match[k] = m.get("ticker")
            if match.get("home") and match.get("away") and match["home"] != match["away"]:
                return match["home"]
    return None


def candle_mid(c):
    def val(key):
        v = c.get(key)
        if isinstance(v, dict):
            x = KG.fnum(v.get("close_dollars"))
            if x is None:
                x = KG.fnum(v.get("close"))
                x = x / 100 if x is not None and x > 1 else x
            return x
        return KG.fnum(c.get(key + "_close_dollars"))
    b, a = val("yes_bid"), val("yes_ask")
    if b is not None and a is not None and 0 < b <= a < 1:
        return (b + a) / 2
    return None


def pre_kickoff_chance(sport, ticker, kickoff):
    """The home team's Kalshi win chance from the last hourly candle ending at or before the start, or None."""
    ko = int(datetime.fromisoformat(kickoff.replace("Z", "+00:00")).timestamp())
    params = {"start_ts": ko - 12 * 3600, "end_ts": ko, "period_interval": 60}
    for url in (f"{KG.KALSHI}/series/KX{sport}GAME/markets/{ticker}/candlesticks",
                f"{KG.KALSHI}/historical/markets/{ticker}/candlesticks"):       # older markets move to the archive
        d = KG.get(url, params) or {}
        mids = [(c.get("end_period_ts") or 0, candle_mid(c)) for c in d.get("candlesticks") or []]
        mids = [(t, m) for t, m in mids if m is not None and t <= ko]
        if mids:
            return round(max(mids)[1], 4)
    return None


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sport", choices=GL.HISTORY_SPORTS, required=True)
    ap.add_argument("--since", required=True, help="first US date, YYYY-MM-DD")
    a = ap.parse_args(argv)
    now = datetime.now(timezone.utc)
    try:
        with open(GL.MARKET_HISTORY) as f:
            hist = json.load(f)
    except (OSError, ValueError):
        hist = {"games": {}}
    store = hist.setdefault("games", {})
    cut = (now - timedelta(days=GL.MARKET_HISTORY_DAYS)).date()
    day, last = max(date.fromisoformat(a.since), cut), now.astimezone(GL.ET).date()
    events = settled_events(a.sport)
    added = priced = 0
    while day <= last:
        for g in espn_day(a.sport, day):
            key = f"{a.sport}:{g['espn_id']}"
            if key in store:
                continue
            g["date"] = day.isoformat()
            h = {"sport": a.sport, "espn_id": g["espn_id"], "kickoff": g["kickoff"], "away": g["away"],
                 "home": g["home"], "date": g["date"], "final": g["final"], "backfill": True}
            if g["colors"]:
                h["colors"] = g["colors"]
            ticker = home_market(a.sport, g, events)
            wp = pre_kickoff_chance(a.sport, ticker, g["kickoff"]) if ticker else None
            if wp is not None:
                h["pre"] = {"home_wp": wp, "at": "last hourly Kalshi candle before the start (backfill)"}
                priced += 1
            store[key] = h
            added += 1
        day += timedelta(days=1)
    hist["games"] = dict(sorted(store.items(), key=lambda x: x[1].get("kickoff") or ""))
    hist["generated_at"] = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    os.makedirs(os.path.dirname(GL.MARKET_HISTORY), exist_ok=True)
    with open(GL.MARKET_HISTORY, "w") as f:
        json.dump(hist, f, separators=(",", ":"))
    print(f"{a.sport}: {added} finished games added since {a.since}, {priced} with Kalshi's pre-game chance; "
          f"Kalshi events read: {sum(len(v) for v in events.values())}; notes: {KG.log[:5]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
