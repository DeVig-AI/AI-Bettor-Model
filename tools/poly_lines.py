#!/usr/bin/env python3
"""
poly_lines.py -- Polymarket's game moneylines for the app's games (display only: nothing here makes a pick or a bet).

The app shows Polymarket's win chance next to Kalshi's, and which of the two is cheaper for each team, so a user can
shop the better price and see when the two markets disagree. Public read-only endpoints (gamma-api.polymarket.com),
no key, no account.

For each league: the open game events (series from Polymarket's /sports list), their "moneyline" market, its best bid
and ask for the first-listed team. Polymarket lists the away team first (the league's "ordering"); each event's two
teams are checked against ESPN's names, so a game is kept only when both teams match the app's codes (the same
codes as live/game_lines.json) and the event title order agrees. Games already started are left out.

Usage: python3 tools/poly_lines.py [--hours 48]
Output: live/poly_lines.json
"""
import argparse
import json
import sys
import unicodedata
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import kalshi_games_v1 as KG  # noqa: E402

OUT = ROOT / "live" / "poly_lines.json"
GAMMA = "https://gamma-api.polymarket.com"
LEAGUES = {"NFL": "nfl", "NBA": "nba", "NHL": "nhl", "CFB": "cfb", "MLB": "mlb"}
ESPN_PATHS = {"NFL": "football/nfl", "NBA": "basketball/nba", "NHL": "hockey/nhl",
              "CFB": "football/college-football", "MLB": "baseball/mlb"}
ESPN_ALIASES = {"NHL": {"UTAH": "UTA"}}
ET = ZoneInfo("America/New_York")


def norm(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    return " ".join("".join(c if c.isalnum() else " " for c in s).split())


def code(sport, abbr):
    a = str(abbr or "").upper()
    return ESPN_ALIASES.get(sport, {}).get(a) or KG.canon(sport, a)


def num(x):
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v if 0 < v < 1 else None


def parse_t(s):
    s = str(s or "").strip().replace(" ", "T").replace("+00", "+00:00").replace("Z", "+00:00")
    if s.endswith("+00:00:00"):
        s = s[:-3]
    try:
        t = datetime.fromisoformat(s)
    except ValueError:
        return None
    return t if t.tzinfo else t.replace(tzinfo=timezone.utc)


def espn_teams(sport, days):
    """{US date: [(home code, away code, {normalised names of home}, {normalised names of away})]} from ESPN."""
    out = {}
    for day in days:
        params = {"dates": day.replace("-", "")}
        if sport == "CFB":
            params.update(groups="80", limit="300")
        d = KG.get(f"https://site.api.espn.com/apis/site/v2/sports/{ESPN_PATHS[sport]}/scoreboard", params) or {}
        for ev in d.get("events") or []:
            side = {c.get("homeAway"): c.get("team") or {} for c in ((ev.get("competitions") or [{}])[0].get("competitors") or [])}
            if "home" not in side or "away" not in side:
                continue
            names = lambda t: {norm(t.get(k)) for k in ("displayName", "shortDisplayName", "name", "location") if t.get(k)}  # noqa: E731
            out.setdefault(day, []).append((code(sport, side["home"].get("abbreviation")), code(sport, side["away"].get("abbreviation")),
                                            names(side["home"]), names(side["away"])))
    return out


def league_games(sport, series, now, until):
    events = KG.get(f"{GAMMA}/events", {"series_id": series, "closed": "false", "limit": 300,
                                        "end_date_min": now.strftime("%Y-%m-%dT%H:%M:%SZ")}) or []
    rows = []
    for e in events:
        m = next((m for m in e.get("markets") or [] if m.get("sportsMarketType") == "moneyline"), None)
        if not m:
            continue
        start = parse_t(m.get("gameStartTime") or e.get("startTime"))
        if not start or not (now < start <= until):
            continue
        try:
            teams = json.loads(m.get("outcomes") or "[]")
        except ValueError:
            continue
        bid, ask = num(m.get("bestBid")), num(m.get("bestAsk"))
        if len(teams) != 2 or bid is None or ask is None or ask < bid:
            continue
        rows.append({"start": start, "first": teams[0], "second": teams[1], "bid": bid, "ask": ask, "slug": e.get("slug"),
                     "liquidity": m.get("liquidityClob") or m.get("liquidityNum")})
    days = sorted({r["start"].astimezone(ET).strftime("%Y-%m-%d") for r in rows})
    espn = espn_teams(sport, days)
    games, unmatched = [], []
    for r in rows:
        day = r["start"].astimezone(ET).strftime("%Y-%m-%d")
        f, s = norm(r["first"]), norm(r["second"])
        hit = None
        for h, a, hn, an in espn.get(day, []):
            if f in an and s in hn:                  # first-listed team is the away team
                hit = (h, a, r["bid"], r["ask"])
            elif f in hn and s in an:                # listed home first: flip the price to the away team
                hit = (h, a, round(1 - r["ask"], 4), round(1 - r["bid"], 4))
            if hit:
                break
        if not hit:
            unmatched.append(f"{sport}: {r['first']} vs {r['second']} ({r['slug']})")
            continue
        h, a, abid, aask = hit
        liq = r["liquidity"]
        games.append({"sport": sport, "date": day, "kickoff": r["start"].strftime("%Y-%m-%dT%H:%M:%SZ"), "home": h, "away": a,
                      "away_bid": abid, "away_ask": aask, "home_bid": round(1 - aask, 4), "home_ask": round(1 - abid, 4),
                      "liquidity": round(float(liq)) if liq not in (None, "") else None, "slug": r["slug"]})
    return games, unmatched


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--hours", type=float, default=48)
    a = ap.parse_args()
    now = datetime.now(timezone.utc)
    until = now + timedelta(hours=a.hours)
    series = {s.get("sport"): s.get("series") for s in KG.get(f"{GAMMA}/sports", {}) or []}
    games, unmatched, errors = [], [], []
    for sport, league in LEAGUES.items():
        if not series.get(league):
            errors.append(f"{sport}: no Polymarket series")
            continue
        try:
            g, u = league_games(sport, series[league], now, until)
        except Exception as e:                       # one league failing never stops the others
            errors.append(f"{sport}: {type(e).__name__}")
            continue
        games += g
        unmatched += u
        print(f"{sport}: {len(g)} games, {len(u)} unmatched")
    games.sort(key=lambda g: (g["kickoff"], g["sport"], g["home"]))
    OUT.write_text(json.dumps({"doc": "POLY_LINES", "generated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "games": games,
                               "unmatched": unmatched[:40], "errors": errors}, separators=(",", ":")))
    print(f"wrote {OUT.relative_to(ROOT)}: {len(games)} games")


if __name__ == "__main__":
    main()
