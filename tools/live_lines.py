#!/usr/bin/env python3
"""
live_lines.py -- the live file for NBA, MLB, NHL, WNBA and college football, as nfl/nfl_props_live_v1.py is for
the NFL: for each game Kalshi lists (live/game_lines.json), ESPN's score and state, Kalshi's live moneyline, and the
win-chance line (Kalshi price history from 2 hours before the start) while the game is on. A finished game keeps its
line, so the app shows the graph after the final too, and in the apps that have no /api/live or /api/winline.

Output: live/live_lines.json
  {generated_at, active, errors, games: [{sport, away, home, kickoff, espn_id, home_ticker, state, detail,
                                          away_score, home_score, kalshi_game, kalshi_line, line_final}]}
  kalshi_line = {team: home, points: [[unix_ts, home win chance], ...]}, the same shape as the NFL live file.
  Finished games stay KEEP_DAYS after the start; upcoming ones are listed from a day ahead.

Display only: nothing here feeds a model, a pick or a test. Keyless: Kalshi and ESPN public endpoints only.
Run by .github/workflows/live_lines.yml in a loop (every 3 minutes while games are on); does nothing outside game
windows unless FORCE=1. The last line of output is {working, next_s, wrote} for that loop.
"""
import json
import os
import sys
import urllib.parse
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
import kalshi_games_v1 as KG  # noqa: E402  keyless get(), canon(), american()

HERE = os.path.dirname(os.path.abspath(__file__))
LINES = os.path.join(HERE, "..", "live", "game_lines.json")
OUT = os.path.join(HERE, "..", "live", "live_lines.json")
SPORTS = ("NBA", "MLB", "NHL", "WNBA", "CFB")
ESPN = {"NBA": "basketball/nba", "MLB": "baseball/mlb", "NHL": "hockey/nhl", "WNBA": "basketball/wnba",
        "CFB": "football/college-football"}
ESPN_Q = {"CFB": {"groups": 80, "limit": 500}}         # every FBS game, not just ESPN's featured ones
ET = ZoneInfo("America/New_York")
WINDOW_BEFORE, WINDOW_AFTER = timedelta(minutes=30), timedelta(hours=6)
AHEAD, KEEP_DAYS = timedelta(days=1), 3
LINE_END = timedelta(hours=8)                          # no game runs longer: later candles are flat


def parse_t(s):
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00")).astimezone(timezone.utc)
    except (TypeError, ValueError):
        return None


def iso(t):
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def scoreboard(sport, dates):
    """{espn_id: {state, detail, away_score, home_score}} from ESPN's scoreboard on these US dates."""
    out = {}
    for d in sorted(dates):
        q = dict(ESPN_Q.get(sport, {}), dates=d.replace("-", ""))
        j = KG.get(f"https://site.api.espn.com/apis/site/v2/sports/{ESPN[sport]}/scoreboard", q) or {}
        for ev in j.get("events") or []:
            comp = (ev.get("competitions") or [{}])[0]
            side = {c.get("homeAway"): c for c in comp.get("competitors") or []}
            ty = ((ev.get("status") or comp.get("status") or {}).get("type")) or {}
            st = ty.get("state") or "pre"
            out[str(ev.get("id"))] = {
                "state": st, "detail": ty.get("shortDetail") or ty.get("detail") or "",
                "away_score": KG.fnum((side.get("away") or {}).get("score")) if st != "pre" else None,
                "home_score": KG.fnum((side.get("home") or {}).get("score")) if st != "pre" else None}
    return out


def _close(c, key):
    """A candle's closing value in dollars; Kalshi sends {close_dollars} or whole-cent {close}."""
    v = c.get(key)
    if isinstance(v, dict):
        if v.get("close_dollars") not in (None, ""):
            return KG.fnum(v["close_dollars"])
        x = KG.fnum(v.get("close"))
        return x / 100.0 if x is not None and x > 1 else x
    return KG.fnum(c.get(key + "_close_dollars"))


def win_line(ticker, kickoff, end, max_points=150):
    """([[unix_ts, home win chance]], last {bid, ask}) from 2 hours before the start to `end` (1-minute candles,
    bid/ask midpoint), as in nfl/nfl_props_live_v1.py."""
    if not ticker or not kickoff:
        return None, None
    series, q = ticker.split("-", 1)[0], {"start_ts": int((kickoff - timedelta(hours=2)).timestamp()),
                                          "end_ts": int(end.timestamp()), "period_interval": 1}
    d = KG.get(f"{KG.KALSHI}/series/{series}/markets/{urllib.parse.quote(ticker)}/candlesticks", q) or {}
    if not d.get("candlesticks"):                  # Kalshi moves settled markets to /historical after a while
        d = KG.get(f"{KG.KALSHI}/historical/markets/{urllib.parse.quote(ticker)}/candlesticks", q) or {}
    pts, last = [], None
    for c in d.get("candlesticks") or []:
        b, a = _close(c, "yes_bid"), _close(c, "yes_ask")
        v = (b + a) / 2 if b is not None and a is not None and 0 < b <= a < 1 else _close(c, "price")
        if v is not None and 0 <= v <= 1 and c.get("end_period_ts"):
            pts.append([int(c["end_period_ts"]), round(v, 3)])
        if b is not None and a is not None:
            last = {"bid": b, "ask": a}
    if len(pts) > max_points:                      # keep the shape, drop the bulk; always keep the latest point
        step = len(pts) / max_points
        pts = [pts[int(i * step)] for i in range(max_points - 1)] + [pts[-1]]
    return pts or None, last


def load(path):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def candidates(now, lines, prev):
    """{(sport, espn_id): game} from the lines file (Kalshi's open games) and the last run (games whose Kalshi market
    has since closed). Only games from KEEP_DAYS ago to a day ahead."""
    out = {}
    for g in prev.get("games") or []:
        out[(g["sport"], str(g["espn_id"]))] = dict(g)
    for x in lines.get("games") or []:
        if x.get("sport") not in SPORTS or not x.get("espn_id") or not x.get("kickoff"):
            continue
        k = (x["sport"], str(x["espn_id"]))
        g = out.setdefault(k, {"state": "pre", "detail": "", "away_score": None, "home_score": None,
                               "kalshi_line": None, "line_final": False})
        g.update({"sport": x["sport"], "away": x["away"], "home": x["home"], "kickoff": x["kickoff"],
                  "espn_id": str(x["espn_id"]), "home_ticker": x.get("home_ticker") or g.get("home_ticker"),
                  "_ml": x.get("ml")})
    lo, hi = now - timedelta(days=KEEP_DAYS), now + AHEAD
    return {k: g for k, g in out.items() if (lambda t: t is not None and lo <= t <= hi)(parse_t(g.get("kickoff")))}


def needs_work(g, now):
    """A game under way (however late: a missed run must not leave it live for good), about to start, or finished
    without its full line yet."""
    k = parse_t(g["kickoff"])
    if g.get("state") == "post":
        return not g.get("line_final")
    return g.get("state") == "in" or k - WINDOW_BEFORE <= now <= k + WINDOW_AFTER


def next_window(games, now):
    """Seconds until the next game's window opens (None if no game is coming within the file's day ahead)."""
    ks = [parse_t(g["kickoff"]) - WINDOW_BEFORE for g in games.values() if g.get("state") == "pre"]
    ks = [k for k in ks if k > now]
    return int((min(ks) - now).total_seconds()) if ks else None


def summary(**kw):
    """The last line of output: what the workflow's loop reads to decide when to run again."""
    print(json.dumps(kw))


def main(now=None):
    now = now or datetime.now(timezone.utc)
    lines, prev = load(LINES), load(OUT)
    games = candidates(now, lines, prev)
    work = {k: g for k, g in games.items() if needs_work(g, now)}
    stale = len(games) < len(prev.get("games") or [])          # old games to drop: write the file anyway
    if not work and not stale and os.getenv("FORCE") != "1" and os.path.exists(OUT):
        summary(working=0, next_s=next_window(games, now), wrote=False)
        return 0
    for sport in SPORTS:
        mine = {k: g for k, g in work.items() if k[0] == sport}
        if not mine:
            continue
        dates = {parse_t(g["kickoff"]).astimezone(ET).date().isoformat() for g in mine.values()}
        try:
            sb = scoreboard(sport, dates)
        except Exception as e:                     # one sport failing must not drop the others
            KG.log.append(f"{sport} scoreboard: {type(e).__name__}: {e}")
            sb = {}
        for k, g in mine.items():
            live = sb.get(k[1])
            if live and not (g.get("state") == "post" and live["state"] != "post"):   # never step back from a final
                g.update(live)
            kick = parse_t(g["kickoff"])
            if g["state"] == "in" or (g["state"] == "post" and not g.get("line_final")):
                pts, last = win_line(g.get("home_ticker"), kick, min(now, kick + LINE_END))
                if pts:
                    g["kalshi_line"] = {"team": g["home"], "points": pts}
                if g["state"] == "post":           # one last read after the final, then the line is kept as is
                    g["line_final"] = bool(pts) or now > kick + LINE_END
                if g["state"] == "in" and last and 0 < last["bid"] <= last["ask"] < 1:
                    g["kalshi_game"] = {"moneyline": {"home": KG.american(last["ask"]),
                                                      "away": KG.american(round(1 - last["bid"], 4))}}
    for g in games.values():
        if g["state"] == "pre" and (g.get("_ml") or {}).get("home") is not None:
            g["kalshi_game"] = {"moneyline": g["_ml"]}
        if g["state"] == "post":
            g["kalshi_game"] = None
        g.pop("_ml", None)
    out = {"generated_at": iso(now), "active": bool(work), "errors": KG.log[:30],
           "note": "Scores are ESPN's, unofficial. Win-chance lines are Kalshi's price history. Display only.",
           "games": sorted(games.values(), key=lambda g: (g["kickoff"], g["sport"], g["away"]))}
    same = {k: v for k, v in out.items() if k != "generated_at"} == {k: v for k, v in prev.items() if k != "generated_at"}
    if not same:                                   # unchanged: no write, so no commit
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        with open(OUT, "w") as f:
            json.dump(out, f, separators=(",", ":"), allow_nan=False)
    print(json.dumps({"games": len(out["games"]), "with_line": sum(1 for g in out["games"] if g.get("kalshi_line")),
                      "errors": out["errors"][:5]}))
    summary(working=len(work), next_s=next_window(games, now), wrote=not same)
    return 0


if __name__ == "__main__":
    sys.exit(main())
