#!/usr/bin/env python3
"""
game_lines.py -- every Kalshi spread line for both teams of every open NFL, NBA, MLB, NHL, WNBA and college football game, for
the app's spread wheel and its college football board. Display only: nothing here feeds a model, a pick or a test.

Kalshi lists "TEAM wins by over X" markets. Buying YES is TEAM -X; buying NO is the other team +X. Both are written,
as fee-included American odds, so each team gets its whole ladder of lines.

Output: live/game_lines.json
  {generated_at, games: [{sport, date, away, home, event, home_ticker, spreads: {TEAM: [[point, odds], ...]},
                          kickoff, espn_id, home_wp, ml, spread, total}]}
  The last six let the app show a game the model has no pick on (e.g. MLB postseason games skipped for an
  unannounced starter) with Kalshi's prices.
home_ticker is the home team's Kalshi win market, which the app's win-chance graph reads (functions/api/winline.js).

College football (sport "CFB", Kalshi series KXNCAAFGAME / KXNCAAFSPREAD / KXNCAAFTOTAL): Kalshi's school codes are
its own (MOSU, MTU), so each Kalshi game is matched to ESPN's FBS scoreboard by team names (tools/cfb_teams.py) and
written in ESPN's codes, with what the app's CFB board needs: kickoff, ESPN ids (logos for signed-in users), names,
colours, ranks, the score when this ran, Kalshi's win chance, moneylines, main spread and main total.
live/cfb_history.json keeps each CFB game's last Kalshi numbers before kickoff and its final score (History tab).
Keyless: Kalshi and ESPN public endpoints only.
"""
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
import kalshi_games_v1 as KG  # noqa: E402
import cfb_teams  # noqa: E402

# kalshi_games_v1.py is a locked paper-test file (FROZEN.sha256) that knows ESPN's NFL, NBA and MLB scoreboards only.
# This display-only script adds NHL and WNBA here, so the locked file and the tests that use it stay as they are.
KG.ESPN.setdefault("NHL", "hockey/nhl")
KG.ESPN.setdefault("WNBA", "basketball/wnba")

OUT = os.path.join(os.path.dirname(__file__), "..", "live", "game_lines.json")
CFB_HISTORY = os.path.join(os.path.dirname(__file__), "..", "live", "cfb_history.json")
SPORTS = ("NFL", "NBA", "MLB", "NHL", "WNBA")
ET = ZoneInfo("America/New_York")
ESPN_CFB = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard"
HISTORY_DAYS = 120


def ladders(g):
    """{team code: [[point, odds], ...]} sorted from most points given to most points taken."""
    a, h = g["away_code"], g["home_code"]
    best = {}
    for q in g["spreads"]:
        t = q["team"]
        other = h if t == a else a
        for team, point, price in ((t, -q["line"], q["ask"]), (other, q["line"], None if q["bid"] is None else round(1 - q["bid"], 4))):
            odds = KG.american(price)
            if odds is None:
                continue
            k = (team, point)
            if k not in best or odds > best[k]:   # the same line from two markets: keep the better price
                best[k] = odds
    out = {}
    for (team, point), odds in best.items():
        out.setdefault(team, []).append([point, round(odds)])
    return {t: sorted(v) for t, v in out.items()}


def board_fields(sport, g):
    """What the app needs to show a game the model has no pick on: ESPN's start time and Kalshi's win chance,
    moneylines, main spread (MLB / NHL: the 1.5 run / puck line) and main total. Any part that can't be read is left out."""
    a, h = g["away_code"], g["home_code"]
    th, ta = g["teams"][h], g["teams"][a]
    out = {}
    try:
        e = KG.match_espn(sport, g)
        if e and e.get("kickoff"):
            out.update(kickoff=e["kickoff"], espn_id=e.get("espn_id"))
        if e and e.get("teams"):                  # ESPN's team colours, for sports the app has no colour table for
            ea, eh = e["teams"]["away"], e["teams"]["home"]
            if e.get("swapped"):
                ea, eh = eh, ea
            col = {k: "#" + t["color"] for k, t in (("away", ea), ("home", eh)) if t.get("color")}
            if col:
                out["colors"] = col
    except Exception as ex:                       # no start time: the app just won't show this game on its own
        KG.log.append(f"{sport} {g.get('event')}: ESPN {type(ex).__name__}")
    mh, ma = KG._mid(th), KG._mid(ta)
    if mh is not None and ma is not None and mh + ma > 0:
        out["home_wp"] = round(mh / (mh + ma), 4)
    out["ml"] = {"home": KG.american(th["ask"]), "away": KG.american(ta["ask"])}
    ms = KG.spread_at(g, a, h, 1.5) if sport in ("MLB", "NHL") else KG.main_spread(g, a, h)   # run line / puck line
    if ms:
        out["spread"] = {"home_point": ms[0], "home": ms[1], "away": ms[2]}
    mt = KG.main_total(g)
    if mt:
        out["total"] = {"line": mt[0], "over": mt[1], "under": mt[2]}
    return out


def espn_cfb(now):
    """ESPN's FBS games from 3 days ago to 9 days ahead: {espn_id: game}. One request per day: ESPN answers HTTP 400
    to this 13-day range (every run from 2026-10-20 on matched no CFB game), while single days are what the app's
    live feed and the coverage probe read."""
    events = []
    for i in range(-3, 10):
        d = KG.get(ESPN_CFB, {"groups": 80, "limit": 500, "dates": (now + timedelta(days=i)).strftime("%Y%m%d")}) or {}
        events += d.get("events") or []
    out = {}
    for ev in events:
        comp = (ev.get("competitions") or [{}])[0]
        side = {c.get("homeAway"): c for c in comp.get("competitors") or []}
        if "home" not in side or "away" not in side:
            continue
        st = ((ev.get("status") or comp.get("status") or {}).get("type")) or {}
        g = {"espn_id": str(ev.get("id")), "kickoff": ev.get("date"), "neutral": bool(comp.get("neutralSite")),
             "state": st.get("state") or "pre", "detail": st.get("shortDetail") or st.get("detail") or ""}
        for k in ("away", "home"):
            c, t = side[k], side[k].get("team") or {}
            g[k] = str(t.get("abbreviation") or "").upper()
            g[k + "_id"] = str(t.get("id") or "")
            g[k + "_names"] = [t.get("location"), t.get("shortDisplayName"), t.get("displayName"), t.get("name")]
            g[k + "_name"] = t.get("location") or t.get("shortDisplayName") or g[k]
            g[k + "_color"] = ("#" + t["color"]) if t.get("color") else None
            g[k + "_rank"] = (c.get("curatedRank") or {}).get("current")
            g[k + "_score"] = KG.fnum(c.get("score")) if g["state"] != "pre" else None
        if g["kickoff"]:
            g["date"] = datetime.fromisoformat(g["kickoff"].replace("Z", "+00:00")).astimezone(ET).strftime("%Y-%m-%d")
            out[g["espn_id"]] = g
    return out


def match_cfb(kg, espn):
    """The ESPN game for one Kalshi game, by both teams' names within a day; (game, {kalshi code: ESPN code})."""
    a, h = kg["away_code"], kg["home_code"]
    na, nh = kg["teams"][a]["name"], kg["teams"][h]["name"]
    for e in espn.values():
        if kg.get("date") and e.get("date") and abs((datetime.fromisoformat(e["date"]) - datetime.fromisoformat(kg["date"])).days) > 1:
            continue
        if cfb_teams.matches_any(na, e["away_names"]) and cfb_teams.matches_any(nh, e["home_names"]):
            return e, {a: e["away"], h: e["home"]}
        if cfb_teams.matches_any(na, e["home_names"]) and cfb_teams.matches_any(nh, e["away_names"]):
            return e, {a: e["home"], h: e["away"]}       # Kalshi lists a neutral-site game the other way round
    return None, None


def cfb_games(now):
    kal = KG.kalshi_games("NCAAF")
    espn = espn_cfb(now)
    out, unmatched = [], 0
    for kg in kal.values():
        e, codes = match_cfb(kg, espn)
        if not e:
            unmatched += 1
            continue
        k_home = next(k for k, v in codes.items() if v == e["home"])
        k_away = next(k for k, v in codes.items() if v == e["away"])
        th, ta = kg["teams"][k_home], kg["teams"][k_away]
        mh, ma = KG._mid(th), KG._mid(ta)
        ms = KG.main_spread(kg, k_away, k_home)
        mt = KG.main_total(kg)
        out.append({"sport": "CFB", "date": e["date"], "event": kg.get("event"), "home_ticker": th.get("ticker"),
                    "away": e["away"], "home": e["home"],
                    "spreads": {codes[t]: v for t, v in ladders(kg).items()},
                    "espn_id": e["espn_id"], "kickoff": e["kickoff"], "neutral": e["neutral"],
                    "names": {"away": e["away_name"], "home": e["home_name"]},
                    "ids": {"away": e["away_id"], "home": e["home_id"]},
                    "colors": {"away": e["away_color"], "home": e["home_color"]},
                    "rank": {"away": e["away_rank"] if e["away_rank"] and e["away_rank"] <= 25 else None,
                             "home": e["home_rank"] if e["home_rank"] and e["home_rank"] <= 25 else None},
                    "state": e["state"], "detail": e["detail"],
                    "away_score": e["away_score"], "home_score": e["home_score"],
                    "home_wp": round(mh / (mh + ma), 4) if mh is not None and ma is not None and mh + ma > 0 else None,
                    "ml": {"home": KG.american(th["ask"]), "away": KG.american(ta["ask"])},
                    "spread": {"home_point": ms[0], "home": ms[1], "away": ms[2]} if ms else None,
                    "total": {"line": mt[0], "over": mt[1], "under": mt[2]} if mt else None})
    if unmatched:
        KG.log.append(f"CFB: {unmatched} Kalshi games with no FBS match on ESPN in the window (FCS, or a name to add)")
    return out, espn


def update_history(now, cfb, espn):
    """Per CFB game: the last Kalshi numbers seen before kickoff, then ESPN's final score. Old games drop off."""
    try:
        with open(CFB_HISTORY) as f:
            hist = json.load(f)
    except (OSError, ValueError):
        hist = {"games": {}}
    games = hist.setdefault("games", {})
    for g in cfb:
        ko = datetime.fromisoformat(g["kickoff"].replace("Z", "+00:00"))
        h = games.setdefault(g["espn_id"], {})
        h.update({k: g[k] for k in ("date", "kickoff", "away", "home", "names", "ids", "neutral")})
        if now < ko and g.get("home_wp") is not None:         # never written after kickoff
            h["pre"] = {"home_wp": g["home_wp"], "ml": g["ml"], "spread": g["spread"], "total": g["total"],
                        "at": now.strftime("%Y-%m-%dT%H:%M:%SZ")}
    for gid, h in games.items():
        e = espn.get(gid)
        if e and e["state"] == "post" and e["home_score"] is not None and "final" not in h:
            h["final"] = {"away": e["away_score"], "home": e["home_score"]}
    cut = (now - timedelta(days=HISTORY_DAYS)).strftime("%Y-%m-%d")
    hist["games"] = {k: v for k, v in sorted(games.items(), key=lambda x: x[1].get("kickoff") or "")
                     if (v.get("date") or "9") >= cut}
    hist["generated_at"] = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    hist["note"] = ("College football games with Kalshi prices: the last Kalshi win chance, moneyline, main spread "
                    "and total seen before kickoff (tools/game_lines.py, every 30 minutes), then ESPN's final score.")
    with open(CFB_HISTORY, "w") as f:
        json.dump(hist, f, separators=(",", ":"))


def main():
    games = []
    for sport in SPORTS:
        try:
            kg = KG.kalshi_games(sport)
        except Exception as e:                    # one sport failing must not drop the others
            KG.log.append(f"{sport}: {type(e).__name__}: {e}")
            continue
        for g in kg.values():
            lad = ladders(g)
            a, h = g["away_code"], g["home_code"]
            games.append(dict({"sport": sport, "date": g["date"], "event": g.get("event"),
                               "home_ticker": (g["teams"].get(h) or {}).get("ticker"),
                               "away": KG.canon(sport, a), "home": KG.canon(sport, h),
                               "spreads": {KG.canon(sport, t): v for t, v in lad.items()}}, **board_fields(sport, g)))
    now = datetime.now(timezone.utc)
    try:
        cfb, espn = cfb_games(now)
        games += cfb
        update_history(now, cfb, espn)
    except Exception as e:                        # college football failing must not drop the other sports
        KG.log.append(f"CFB: {type(e).__name__}: {e}")
    games.sort(key=lambda x: (x["sport"], x["date"] or "", x["away"]))
    out = {"generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "games": games,
           "errors": KG.log[:20]}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"{len(games)} games, {sum(len(v) for g in games for v in g['spreads'].values())} lines")
    return 0


if __name__ == "__main__":
    sys.exit(main())
