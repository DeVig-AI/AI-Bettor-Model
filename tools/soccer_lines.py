#!/usr/bin/env python3
"""
soccer_lines.py -- Kalshi's win / draw / win prices for every open game in the soccer leagues below, matched to ESPN's
scoreboard for kickoff, team codes, names, logos (ESPN ids), colours, state and score. For the app's soccer boards.
Display only: nothing here feeds a model, a pick or a test.

A Kalshi soccer game is one event with three markets, "<Home> wins", "<Away> wins" and "Tie is the result" (after 90
minutes plus stoppage time: no extra time, no penalties). The fair chances take Kalshi's cut out of all three at once:
each market's mid price (between bid and ask), scaled so the three add to 100%.

Kalshi's codes are its own (ELC, RBB) and its team names are short ("Stade Rennais", "Coventry"), so games are matched
to ESPN's by team names on the same day (+-1), and written in ESPN's codes. A team plays at most once a day, so one
team's name is enough when the other is spelled too differently; both names are tried first.

Output: live/soccer_lines.json
  {generated_at, leagues: {code: label}, games: [{sport, date, event, kickoff, espn_id, state, detail, home, away,
   names, ids, colors, home_score, away_score, fair: {home, draw, away}, buy: {home, draw, away}, ml: {home, draw, away},
   tickers: {home, draw, away}, volume, spreads: [[side, line, mid, ask, ticker]], totals: [[line, mid, ask, ticker]],
   btts: [mid, ask, ticker] | null, more: {corners: [[n, ..p]], team_corners: [[side, n, ..p]],
   team_totals: [[side, line, ..p]], first: [[home|away|none, ..p]], scores: [[home goals, away goals, ..p]],
   scores_1h: [...], halves: {"1"|"2": {win: {home, draw, away: p} | null, totals, spreads, btts}},
   players: [[side, name, goal|firstgoal|ast|soa, n, ..p]]}}], unmatched: [...], errors: [...]}
  p = mid, ask, ticker. corners and team_corners are "n or more"; goal and ast are "n or more" for one player;
  firstgoal is the game's first goal; soa is a goal or an assist. Player markets open a day or two before kickoff.
  buy = Kalshi's ask (what YES costs now); ml = that as fee-included American odds.
  spreads: "<side> wins by more than <line> goals"; totals: "over <line> goals"; btts: both teams score. These come
  from the same game's spread, total and both-teams-to-score events (same event code after the series), as Kalshi's
  mid price (between bid and ask): a single yes/no market has no cut to take out the way the three-way one does.
Keyless: Kalshi and ESPN public endpoints only.
"""
import json
import os
import re
import sys
import unicodedata
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
import kalshi_games_v1 as KG  # noqa: E402

OUT = os.path.join(os.path.dirname(__file__), "..", "live", "soccer_lines.json")
ET = ZoneInfo("America/New_York")
ESPN_SITE = "https://site.api.espn.com/apis/site/v2/sports/soccer/"
# app code: (Kalshi game series, ESPN league slug, label). The app's sport code is the key (lower-cased for /api/live).
LEAGUES = {
    "EPL": ("KXEPLGAME", "eng.1", "Premier League"),
    "LALIGA": ("KXLALIGAGAME", "esp.1", "La Liga"),
    "SERIEA": ("KXSERIEAGAME", "ita.1", "Serie A"),
    "BUND": ("KXBUNDESLIGAGAME", "ger.1", "Bundesliga"),
    "LIGUE1": ("KXLIGUE1GAME", "fra.1", "Ligue 1"),
    "UCL": ("KXUCLGAME", "uefa.champions", "Champions League"),
    "UEL": ("KXUELGAME", "uefa.europa", "Europa League"),
    "UECL": ("KXUECLGAME", "uefa.europa.conf", "Conference League"),
    "MLS": ("KXMLSGAME", "usa.1", "MLS"),
    "LIGAMX": ("KXLIGAMXGAME", "mex.1", "Liga MX"),
}
# words that don't tell two clubs apart ("Real Betis Balompie" / "Real Betis", "AFC Bournemouth" / "Bournemouth")
FILLER = set("fc cf afc sc ac as ss ssc us rc cd ud sd fk sk bk if club de del la le the calcio balompie futbol football "
             "sporting cp sv vfl vfb tsg 1 fsv".split())
# names that share no word: Kalshi's or ESPN's spelling -> one key
ALIASES = {
    "man city": "manchester city", "man united": "manchester united", "man utd": "manchester united",
    "spurs": "tottenham hotspur", "tottenham": "tottenham hotspur", "wolves": "wolverhampton wanderers",
    "nottm forest": "nottingham forest", "forest": "nottingham forest", "brighton": "brighton hove albion",
    "inter": "internazionale", "inter milan": "internazionale", "milan": "ac milan", "psg": "paris saint germain",
    "paris sg": "paris saint germain", "bayern": "bayern munich", "bayern munchen": "bayern munich",
    "atletico": "atletico madrid", "atleti": "atletico madrid", "athletic": "athletic bilbao", "athletic club": "athletic bilbao",
    "stade rennais": "rennes", "olympique lyonnais": "lyon", "olympique de marseille": "marseille",
    "gladbach": "borussia monchengladbach", "m gladbach": "borussia monchengladbach", "leverkusen": "bayer leverkusen",
    "dortmund": "borussia dortmund", "crvena zvezda": "red star belgrade", "red star": "red star belgrade",
    "new york city": "nycfc", "new york rb": "red bull ny", "new york red bulls": "red bull ny", "saint louis": "st louis",
    "st louis city": "st louis", "los angeles g": "la galaxy", "los angeles f": "lafc", "los angeles fc": "lafc",
    "kobenhavn": "copenhagen", "fc kobenhavn": "copenhagen", "st truidense": "sint truidense", "enschede": "twente",
    "ferencvarosi": "ferencvaros", "nijmegen": "nec", "uni craiova": "csu craiova", "ic escaldes": "inter descaldes",
    "bodoe glimt": "bodo glimt", "be er sheva": "hapoel beer",
}


def norm(s):
    s = str(s or "").replace("æ", "ae").replace("Æ", "Ae").replace("ø", "o").replace("Ø", "O").replace("ß", "ss")
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = s.replace("&", " ").replace("'", "").replace(".", "").replace("-", " ")      # "D.C. United" -> "dc united"
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", s)).strip()


def words(s):
    n = norm(s)
    n = ALIASES.get(n, n)
    return {w for w in n.split() if w not in FILLER} or set(n.split())


def same_team(a, names):
    """True when Kalshi's name `a` is one of ESPN's `names` (display, short, location, name): equal after the filler
    words go, or one's words are all in the other's ("Coventry" / "Coventry City", "Real Betis" / "Real Betis Balompie")."""
    wa = words(a)
    for b in names:
        if not b:
            continue
        wb = words(b)
        if wa and wb and (wa <= wb or wb <= wa):
            return True
    return False


def espn_day(slug, day):
    """ESPN's games in one league on one day (ESPN answers 400 to a date range for soccer): [game]."""
    d = KG.get(ESPN_SITE + slug + "/scoreboard", {"dates": day.strftime("%Y%m%d"), "limit": 200}) or {}
    out = []
    for ev in d.get("events") or []:
        comp = (ev.get("competitions") or [{}])[0]
        side = {c.get("homeAway"): c for c in comp.get("competitors") or []}
        if "home" not in side or "away" not in side:
            continue
        st = ((ev.get("status") or comp.get("status") or {}).get("type")) or {}
        g = {"espn_id": str(ev.get("id")), "kickoff": ev.get("date"), "state": st.get("state") or "pre",
             "detail": st.get("shortDetail") or st.get("detail") or ""}
        for k in ("home", "away"):
            c, t = side[k], side[k].get("team") or {}
            g[k] = str(t.get("abbreviation") or "").upper()
            g[k + "_id"] = str(t.get("id") or "")
            g[k + "_names"] = [t.get("displayName"), t.get("shortDisplayName"), t.get("location"), t.get("name")]
            g[k + "_name"] = t.get("shortDisplayName") or t.get("displayName") or g[k]
            g[k + "_color"] = ("#" + t["color"]) if t.get("color") else None
            g[k + "_score"] = KG.fnum(c.get("score")) if g["state"] != "pre" else None
        if g["kickoff"]:
            g["date"] = datetime.fromisoformat(g["kickoff"].replace("Z", "+00:00")).astimezone(ET).strftime("%Y-%m-%d")
            out.append(g)
    return out


def kalshi_event(ev):
    """One Kalshi soccer event -> {event, date, home_name, away_name, home, away, draw} (each a quote), or None.
    Kalshi's title is "<Home> vs <Away>"; the tie market's ticker ends in TIE."""
    et = ev.get("event_ticker") or ""
    title = str(ev.get("title") or "")
    names = [x.strip() for x in re.split(r"\s+vs\.?\s+", title, maxsplit=1)] if " vs" in title else []
    teams, draw = [], None
    for m in ev.get("markets") or []:
        if m.get("status") not in (None, "active", "open"):
            continue
        q = dict(KG._quote(m), name=m.get("yes_sub_title") or "", vol=KG.fnum(m.get("volume_fp")) or 0)
        if str(m.get("ticker") or "").endswith("-TIE"):
            draw = q
        else:
            teams.append(q)
    if draw is None or len(teams) != 2:
        KG.log.append(f"{et}: {len(teams)} team markets, draw {'yes' if draw else 'no'}")
        return None
    home, away = teams
    if len(names) == 2 and same_team(names[1], [home["name"]]) and not same_team(names[0], [home["name"]]):
        home, away = away, home                       # put Kalshi's first-named team (the home side) first
    return {"event": et, "date": KG._date(et), "home": home, "away": away, "draw": draw}


def match(kg, espn):
    """The ESPN game for one Kalshi game: both names, else one name on the same day. (game, flipped)"""
    near = [e for e in espn if not kg["date"] or abs((datetime.fromisoformat(e["date"]) -
                                                       datetime.fromisoformat(kg["date"])).days) <= 1]
    hn, an = kg["home"]["name"], kg["away"]["name"]
    for e in near:
        if same_team(hn, e["home_names"]) and same_team(an, e["away_names"]):
            return e, False
        if same_team(hn, e["away_names"]) and same_team(an, e["home_names"]):
            return e, True
    one = [(e, same_team(hn, e["away_names"]) or same_team(an, e["home_names"])) for e in near
           if same_team(hn, e["home_names"]) or same_team(an, e["away_names"])
           or same_team(hn, e["away_names"]) or same_team(an, e["home_names"])]
    return one[0] if len(one) == 1 else (None, None)


def mid(q):
    b, a = q.get("bid"), q.get("ask")
    if b is not None and a is not None and a > 0:
        return (b + a) / 2
    return a if a else None


def fair3(home, draw, away):
    """Kalshi's cut taken out of all three: mids scaled to add to 1. None when a market has no price."""
    m = [mid(home), mid(draw), mid(away)]
    if any(x is None or x <= 0 for x in m):
        return None
    s = sum(m)
    return {"home": round(m[0] / s, 4), "draw": round(m[1] / s, 4), "away": round(m[2] / s, 4)}


def suffix(event_ticker):
    """An event ticker without its series: KXEPLSPREAD-26NOV06EVECOV -> 26NOV06EVECOV (shared by a game's events)."""
    return str(event_ticker or "").split("-", 1)[-1]


def side_code(ticker):
    """Kalshi's team code at the end of a market ticker: ...-EVE3 -> EVE, ...-EVE -> EVE."""
    return re.sub(r"\d+$", "", str(ticker or "").rsplit("-", 1)[-1])


# Kalshi's other series for one game, by league (one call each, so a league only asks for the ones Kalshi runs there).
# Every one shares the game's event code after the series name.
MATCH = ("SPREAD", "TOTAL", "BTTS", "CORNERS", "TCORNERS", "TEAMTOTAL", "FTTS", "1H", "1HTOTAL", "1HSPREAD", "1HBTTS",
         "2H", "2HTOTAL", "2HSPREAD", "2HBTTS", "SCORE", "1HSCORE")
PLAYER = ("GOAL", "FIRSTGOAL", "AST", "SOA")
SMALL = ("SPREAD", "TOTAL", "BTTS", "FTTS", "TEAMTOTAL", "1H", "1HTOTAL", "1HSPREAD", "1HBTTS", "SCORE", "GOAL")
KINDS = {code: (SMALL if code in ("UEL", "UECL") else
                MATCH + PLAYER if code in ("EPL", "UCL") else
                MATCH + ("GOAL", "FIRSTGOAL")) for code in LEAGUES}
SCORE_RE = re.compile(r"^([A-Z]+)(\d+)([A-Z]+)(\d+)$")


def blank():
    return {"spreads": [], "totals": [], "btts": None,
            "more": {"corners": [], "team_corners": [], "team_totals": [], "first": [], "scores": [], "scores_1h": [],
                     "halves": {"1": {"win": [], "totals": [], "spreads": [], "btts": None},
                                "2": {"win": [], "totals": [], "spreads": [], "btts": None}},
                     "players": []}}


def player_name(sub):
    """Kalshi's yes label for a player market -> the player: "Fabian Schar: 1+" -> "Fabian Schar"."""
    return re.sub(r":\s*\d+\+?\s*$", "", str(sub or "")).strip()


def extras(series_game, kinds=("SPREAD", "TOTAL", "BTTS")):
    """{event code: {spreads, totals, btts, more}} from the league's other series for each game. Team codes stay
    Kalshi's here (the game's own markets say which is home); a league without a series, or a Kalshi hiccup, just
    leaves it out. Each price is [.., mid, ask, ticker]: Kalshi's mid (between bid and ask) and what YES costs now."""
    base = series_game[:-4] if series_game.endswith("GAME") else series_game
    out = {}
    for kind in kinds:
        try:
            evs = KG._events(base + kind)
        except Exception as e:                        # extras must never cost the game itself
            KG.log.append(f"{base + kind}: {type(e).__name__}: {e}")
            continue
        for ev in evs:
            x = out.setdefault(suffix(ev.get("event_ticker")), blank())
            mo = x["more"]
            half = mo["halves"].get(kind[0]) if kind[:2] in ("1H", "2H") and kind != "1HSCORE" else None
            for m in ev.get("markets") or []:
                if m.get("status") not in (None, "active", "open"):
                    continue
                q = KG._quote(m)
                md = mid(q)
                if md is None:
                    continue
                p = [round(md, 4), q["ask"], q["ticker"]]
                line = KG.fnum(m.get("floor_strike"))
                tail = str(q["ticker"] or "").rsplit("-", 1)[-1]
                if kind == "SPREAD" and line is not None:
                    x["spreads"].append([side_code(q["ticker"]), line] + p)
                elif kind == "TOTAL" and line is not None:
                    x["totals"].append([line] + p)
                elif kind == "BTTS":
                    x["btts"] = p
                elif kind == "CORNERS" and line is not None:
                    mo["corners"].append([line] + p)
                elif kind == "TCORNERS" and line is not None:
                    mo["team_corners"].append([side_code(q["ticker"]), line] + p)
                elif kind == "TEAMTOTAL" and line is not None:
                    mo["team_totals"].append([side_code(q["ticker"]), line] + p)
                elif kind == "FTTS":
                    mo["first"].append([tail] + p)
                elif kind in ("SCORE", "1HSCORE"):
                    sm = SCORE_RE.match(tail)
                    if sm:
                        mo["scores" if kind == "SCORE" else "scores_1h"].append(
                            [sm.group(1), int(sm.group(2)), sm.group(3), int(sm.group(4))] + p)
                elif half is not None:
                    if kind.endswith("TOTAL") and line is not None:
                        half["totals"].append([line] + p)
                    elif kind.endswith("SPREAD") and line is not None:
                        half["spreads"].append([side_code(q["ticker"]), line] + p)
                    elif kind.endswith("BTTS"):
                        half["btts"] = p
                    elif kind in ("1H", "2H"):
                        half["win"].append([tail] + p)
                elif kind in PLAYER:
                    # GOAL/AST: ...-NEWFSCHAR5-1 (N+); FIRSTGOAL/SOA: ...-NEWFSCHAR5; the team code leads the player's
                    parts = str(q["ticker"] or "").split("-")
                    who = parts[2] if len(parts) > 2 else ""
                    if who in ("NOGOAL", "NONE") or not who:
                        continue
                    n = int(parts[3]) if kind in ("GOAL", "AST") and len(parts) > 3 and parts[3].isdigit() else 1
                    mo["players"].append([who, player_name(m.get("yes_sub_title")), kind.lower(), n] + p)
    for x in out.values():
        x["spreads"].sort(key=lambda v: (v[0], v[1]))
        x["totals"].sort(key=lambda v: v[0])
        mo = x["more"]
        for k in ("corners",):
            mo[k].sort(key=lambda v: v[0])
        for k in ("team_corners", "team_totals"):
            mo[k].sort(key=lambda v: (v[0], v[1]))
        for h in mo["halves"].values():
            h["totals"].sort(key=lambda v: v[0])
            h["spreads"].sort(key=lambda v: (v[0], v[1]))
    return out


def sided(more, who):
    """Kalshi's team codes in a game's extras -> home / away (via the game's own two markets). Player markets carry
    the team code in front of the player's ("NEWFSCHAR5"), so the longest code that leads it wins; unknown ones go."""
    def side(code):
        return who.get(code) or who.get(re.sub(r"\d+$", "", code or ""))

    def lead(code):
        hits = [k for k in who if code.startswith(k)]
        return who[max(hits, key=len)] if hits else None
    out = {"corners": more["corners"],
           "team_corners": [[side(v[0])] + v[1:] for v in more["team_corners"] if side(v[0])],
           "team_totals": [[side(v[0])] + v[1:] for v in more["team_totals"] if side(v[0])],
           "first": [["none" if v[0] in ("NONE", "NOGOAL") else side(v[0])] + v[1:] for v in more["first"]
                     if v[0] in ("NONE", "NOGOAL") or side(v[0])],
           "halves": {}, "scores": [], "scores_1h": [],
           "players": [[lead(v[0])] + v[1:] for v in more["players"] if lead(v[0])]}
    for k in ("scores", "scores_1h"):
        for a, na, b, nb, *p in more[k]:
            if side(a) == "home" and side(b) == "away":
                out[k].append([na, nb] + p)
            elif side(a) == "away" and side(b) == "home":
                out[k].append([nb, na] + p)
        out[k].sort(key=lambda v: (v[0], v[1]))
    for h, x in more["halves"].items():
        win = {("draw" if v[0] == "TIE" else side(v[0])): v[1:] for v in x["win"] if v[0] == "TIE" or side(v[0])}
        out["halves"][h] = {"win": win if len(win) == 3 else None, "totals": x["totals"],
                            "spreads": [[side(v[0])] + v[1:] for v in x["spreads"] if side(v[0])], "btts": x["btts"]}
    out["players"].sort(key=lambda v: (v[2], -v[4], v[1]))
    return out


def league_games(code, now):
    series, slug, _ = LEAGUES[code]
    kal = [k for k in (kalshi_event(ev) for ev in KG._events(series)) if k]
    more = extras(series, KINDS[code]) if kal else {}
    days = sorted({d for k in kal if k["date"] for d in (k["date"],)})
    want = set()
    for d in days:                                    # Kalshi's date can be a day off ESPN's (late kickoffs, time zones)
        base = datetime.fromisoformat(d)
        want |= {(base + timedelta(days=i)).date() for i in (-1, 0, 1)}
    espn = []
    for day in sorted(want):
        if day < (now - timedelta(days=2)).date():
            continue
        espn += espn_day(slug, day)
    games, unmatched = [], []
    for kg in kal:
        e, flipped = match(kg, espn)
        if not e:
            unmatched.append({"sport": code, "date": kg["date"], "event": kg["event"],
                              "home": kg["home"]["name"], "away": kg["away"]["name"]})
            continue
        h, a = (kg["away"], kg["home"]) if flipped else (kg["home"], kg["away"])
        x = more.get(suffix(kg["event"])) or blank()
        who = {side_code(h["ticker"]): "home", side_code(a["ticker"]): "away"}
        spreads = [[who[s[0]]] + s[1:] for s in x["spreads"] if s[0] in who]
        games.append({"sport": code, "date": e["date"], "event": kg["event"], "kickoff": e["kickoff"],
                      "espn_id": e["espn_id"], "state": e["state"], "detail": e["detail"],
                      "home": e["home"], "away": e["away"],
                      "names": {"home": e["home_name"], "away": e["away_name"]},
                      "ids": {"home": e["home_id"], "away": e["away_id"]},
                      "colors": {"home": e["home_color"], "away": e["away_color"]},
                      "home_score": e["home_score"], "away_score": e["away_score"],
                      "fair": fair3(h, kg["draw"], a),
                      "buy": {"home": h["ask"], "draw": kg["draw"]["ask"], "away": a["ask"]},
                      "ml": {"home": KG.american(h["ask"]), "draw": KG.american(kg["draw"]["ask"]), "away": KG.american(a["ask"])},
                      "tickers": {"home": h["ticker"], "draw": kg["draw"]["ticker"], "away": a["ticker"]},
                      "volume": round(h["vol"] + a["vol"] + kg["draw"]["vol"]),
                      "spreads": spreads, "totals": x["totals"], "btts": x["btts"], "more": sided(x["more"], who)})
    return games, unmatched


def main():
    now = datetime.now(timezone.utc)
    games, unmatched = [], []
    for code in LEAGUES:
        try:
            g, u = league_games(code, now)
            games += g
            unmatched += u
        except Exception as e:                        # one league failing must not drop the others
            KG.log.append(f"{code}: {type(e).__name__}: {e}")
    if unmatched:
        KG.log.append(f"{len(unmatched)} Kalshi soccer games not matched to ESPN (list: unmatched)")
    games.sort(key=lambda x: (x["kickoff"] or "", x["sport"], x["home"]))
    out = {"generated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
           "leagues": {k: v[2] for k, v in LEAGUES.items()}, "games": games,
           "unmatched": sorted(unmatched, key=lambda u: (u["sport"], u["date"] or "", u["home"])), "errors": KG.log[:20]}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"{len(games)} soccer games, {len(unmatched)} unmatched")
    return 0


if __name__ == "__main__":
    sys.exit(main())
