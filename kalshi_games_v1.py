"""
kalshi_games_v1.py -- free, keyless game odds from Kalshi's public market data (no account, nothing bet), with
start times and team names from ESPN's public scoreboard. Replaces The Odds API for the pick trackers.

For each game Kalshi lists three event series (seen for NFL 2026-10-18; MLB and NBA follow the same naming):
  KX{SPORT}GAME    "<Team> wins"                    one market per team (ticker ends in the team code)
  KX{SPORT}SPREAD  "<Team> wins by over X points?"  a ladder of lines per team
  KX{SPORT}TOTAL   "over X points scored?"          a ladder of lines
Prices are turned into sportsbook-style American odds for what you would actually pay on Kalshi: the ask (or 1 -
bid for the other side) plus Kalshi's taker fee estimate 0.07 * P * (1 - P).

Kalshi's own event times are not kickoff times (NFL ones run about 3 hours late), so kickoff always comes from ESPN.
"""
import datetime as dt
import json
import re
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

KALSHI = "https://api.elections.kalshi.com/trade-api/v2"
ESPN = {"NFL": "football/nfl", "MLB": "baseball/mlb", "NBA": "basketball/nba"}
UA = "devig-kalshi-games/1.0 (personal research; read-only)"
MONTHS = "JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split()
FEE = 0.07
# code variants -> one canonical code per sport (Kalshi and ESPN do not always agree)
ALIASES = {
    "NFL": {"JAC": "JAX", "LAR": "LA", "WSH": "WAS"},
    "MLB": {"AZ": "ARI", "CWS": "CHW", "KCR": "KC", "SDP": "SD", "SFG": "SF", "TBR": "TB", "WAS": "WSH", "OAK": "ATH",
            "LAA": "LAA", "ANA": "LAA"},
    "NBA": {"GS": "GSW", "NO": "NOP", "NY": "NYK", "SA": "SAS", "UTAH": "UTA", "WSH": "WAS", "PHO": "PHX", "BRK": "BKN",
            "CHO": "CHA"},
}
log = []


def get(url, params=None, tries=4, pause=0.25):
    if params:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
    for i in range(tries):
        time.sleep(pause)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429 and i < tries - 1:
                time.sleep(2 ** (i + 1)); continue
            log.append(f"HTTP {e.code} {url[:160]}"); return None
        except Exception as e:
            if i < tries - 1:
                time.sleep(2 ** i); continue
            log.append(f"ERR {type(e).__name__} {url[:160]}"); return None


def fnum(x):
    try:
        v = float(x)
        return v if v == v else None
    except (TypeError, ValueError):
        return None


def canon(sport, code):
    c = str(code or "").upper()
    return ALIASES.get(sport, {}).get(c, c)


def norm(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", s)).strip()


def american(p):
    """American odds for paying price p (0-1) on Kalshi, fee included. None if there is no usable price."""
    if p is None or not (0 < p < 1):
        return None
    c = p + FEE * p * (1 - p)
    if c >= 1:
        return None
    return round(-100 * c / (1 - c), 1) if c >= 0.5 else round(100 * (1 - c) / c, 1)


def _date(event_ticker):
    m = re.search(r"-(\d{2})([A-Z]{3})(\d{2})", str(event_ticker or ""))
    return f"20{m.group(1)}-{MONTHS.index(m.group(2)) + 1:02d}-{m.group(3)}" if m else None


def _events(series):
    out, cursor = [], None
    for _ in range(10):
        d = get(f"{KALSHI}/events", {"series_ticker": series, "status": "open", "with_nested_markets": "true",
                                     "limit": 200, "cursor": cursor})
        if not d:
            break
        out += d.get("events") or []
        cursor = d.get("cursor")
        if not cursor or not d.get("events"):
            break
    return out


def _quote(m):
    return {"bid": fnum(m.get("yes_bid_dollars")), "ask": fnum(m.get("yes_ask_dollars")),
            "oi": fnum(m.get("open_interest_fp")), "ticker": m.get("ticker")}


def kalshi_games(sport):
    """{game_key: game} for every open Kalshi game in this sport. game_key is the event ticker without the series
    (e.g. 26OCT18HOUJAC); game = {date, away_code, home_code, teams: {code: {name, bid, ask, oi}},
    spreads: [{team, line, bid, ask, oi}], totals: [{line, bid, ask, oi}]}."""
    games = {}
    for ev in _events(f"KX{sport}GAME"):
        et = ev.get("event_ticker") or ""
        key = et.split("-", 1)[1] if "-" in et else et
        teams = {}
        for m in ev.get("markets") or []:
            code = str(m.get("ticker") or "").rsplit("-", 1)[-1]
            if code and m.get("status") in (None, "active", "open"):
                teams[code] = dict(_quote(m), name=m.get("yes_sub_title") or "")
        if len(teams) != 2:
            log.append(f"{et}: {len(teams)} team markets"); continue
        suffix = key[7:]                       # after YYMONDD
        order = next(((a, h) for a in teams for h in teams if a != h and a + h == suffix), None)
        if not order:
            log.append(f"{et}: could not tell away from home in {suffix!r}"); continue
        games[key] = {"date": _date(et), "away_code": order[0], "home_code": order[1], "teams": teams,
                      "spreads": [], "totals": [], "event": et}
    for kind in ("SPREAD", "TOTAL"):
        for ev in _events(f"KX{sport}{kind}"):
            et = ev.get("event_ticker") or ""
            g = games.get(et.split("-", 1)[1] if "-" in et else et)
            if not g:
                continue
            for m in ev.get("markets") or []:
                line = fnum(m.get("floor_strike"))
                if line is None or m.get("strike_type") not in (None, "greater") or m.get("status") not in (None, "active", "open"):
                    continue
                q = dict(_quote(m), line=line)
                if kind == "TOTAL":
                    g["totals"].append(q)
                else:
                    team = re.match(r"[A-Z]+", str(m.get("ticker") or "").rsplit("-", 1)[-1])
                    if team and team.group(0) in g["teams"]:
                        g["spreads"].append(dict(q, team=team.group(0)))
    return games


_sb = {}


def espn_games(sport, date):
    """ESPN's games on a US date (YYYY-MM-DD): [{away, home, away_name, home_name, kickoff, espn_id, teams}]."""
    if (sport, date) in _sb:
        return _sb[(sport, date)]
    d = get(f"https://site.api.espn.com/apis/site/v2/sports/{ESPN[sport]}/scoreboard", {"dates": date.replace("-", "")}) or {}
    out = []
    for ev in d.get("events") or []:
        comp = (ev.get("competitions") or [{}])[0]
        side = {c.get("homeAway"): c.get("team") or {} for c in comp.get("competitors") or []}
        if "away" not in side or "home" not in side:
            continue
        out.append({"away": canon(sport, side["away"].get("abbreviation")), "home": canon(sport, side["home"].get("abbreviation")),
                    "away_name": side["away"].get("displayName"), "home_name": side["home"].get("displayName"),
                    "kickoff": ev.get("date"), "espn_id": ev.get("id"), "teams": side,
                    "state": ((ev.get("status") or {}).get("type") or {}).get("state")})
    _sb[(sport, date)] = out
    return out


def _team_is(sport, code, name, espn_team):
    if canon(sport, code) == canon(sport, espn_team.get("abbreviation")):
        return True
    n = norm(name)
    if not n:
        return False
    full = norm(espn_team.get("displayName"))
    return n in (norm(espn_team.get("location")), full, norm(espn_team.get("shortDisplayName"))) and n != "" \
        or (len(n) >= 4 and full.startswith(n))


def match_espn(sport, game):
    """The ESPN game for a Kalshi game (same or next US date, both teams agreeing), or None."""
    if not game.get("date"):
        return None
    d0 = dt.date.fromisoformat(game["date"])
    a, h = game["away_code"], game["home_code"]
    for d in (d0, d0 + dt.timedelta(days=1), d0 - dt.timedelta(days=1)):
        for e in espn_games(sport, d.isoformat()):
            ta, th = game["teams"][a], game["teams"][h]
            if _team_is(sport, a, ta["name"], e["teams"]["away"]) and _team_is(sport, h, th["name"], e["teams"]["home"]):
                return e
            if _team_is(sport, a, ta["name"], e["teams"]["home"]) and _team_is(sport, h, th["name"], e["teams"]["away"]):
                return dict(e, swapped=True)       # Kalshi listed home first; ESPN's away/home win
    log.append(f"{game['event']}: no ESPN game for {a} @ {h} on {game['date']}")
    return None


def moneylines(game, away_code, home_code):
    t = game["teams"]
    return american(t[home_code]["ask"]), american(t[away_code]["ask"])


def _mid(q):
    return (q["bid"] + q["ask"]) / 2 if q["bid"] is not None and q["ask"] is not None else None


def main_spread(game, away_code, home_code):
    """The line closest to even money: (home_point, home_odds, away_odds), sportsbook convention (home -X when the
    home team is the favourite). None when Kalshi has no two-sided spread price."""
    best = None
    for q in game["spreads"]:
        m = _mid(q)
        if m is None or not (0 < q["bid"] < q["ask"] < 1):
            continue
        if best is None or abs(m - 0.5) < abs(_mid(best) - 0.5):
            best = q
    if not best:
        return None
    fav_odds, dog_odds = american(best["ask"]), american(round(1 - best["bid"], 4))   # "fav wins by > X" yes / no
    if best["team"] == home_code:
        return -best["line"], fav_odds, dog_odds
    return best["line"], dog_odds, fav_odds


def spread_at(game, away_code, home_code, line):
    """A fixed line (e.g. the MLB run line 1.5) laid by the moneyline favourite: (home_point, home_odds, away_odds).
    Kalshi lists "wins by over 1.5" for both teams; only the favourite's is the sportsbook run line."""
    t = game["teams"]
    fav_code = home_code if (t[home_code]["ask"] or 0) >= (t[away_code]["ask"] or 0) else away_code
    qs = [q for q in game["spreads"] if abs(q["line"] - line) < 1e-9 and q["bid"] is not None
          and q["ask"] is not None and 0 < q["bid"] < q["ask"] < 1]
    qs.sort(key=lambda q: q["team"] != fav_code)
    for q in qs:
        fav, dog = american(q["ask"]), american(round(1 - q["bid"], 4))
        return (-line, fav, dog) if q["team"] == home_code else (line, dog, fav)
    return None


def main_total(game):
    """(line, over_odds, under_odds) at the line closest to even money, or None."""
    best = None
    for q in game["totals"]:
        m = _mid(q)
        if m is None or not (0 < q["bid"] < q["ask"] < 1):
            continue
        if best is None or abs(m - 0.5) < abs(_mid(best) - 0.5):
            best = q
    if not best:
        return None
    return best["line"], american(best["ask"]), american(round(1 - best["bid"], 4))


def now_iso():
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
