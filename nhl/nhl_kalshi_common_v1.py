"""
nhl_kalshi_common_v1.py -- shared, read-only helpers for the NHL player-prop code: public Kalshi and NHL API requests,
the prop series, matching a Kalshi event to an NHL game (puck drop, teams, season, game type), and reading a market.
Public endpoints only: no key, no account, nothing bet.
"""
import json, re, threading, time, unicodedata, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone

KALSHI = "https://api.elections.kalshi.com/trade-api/v2"
NHLAPI = "https://api-web.nhle.com/v1"
UA = "nhl-props/1.0 (personal research; read-only)"
SERIES = {"KXNHLGOAL": "goals", "KXNHLPTS": "points", "KXNHLAST": "assists"}       # "N+ goals / points / assists"
MONTHS = "JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split()
# Kalshi's ticker codes where they differ from the NHL's (both are tried)
ALIASES = {"LAK": ["LA"], "NJD": ["NJ"], "SJS": ["SJ"], "TBL": ["TB"], "WSH": ["WAS"], "VGK": ["VEG", "LV"],
           "UTA": ["UTAH", "UTH"], "CBJ": ["CLB"], "MTL": ["MON"], "CGY": ["CAL"], "NSH": ["NAS"], "WPG": ["WIN"],
           "ANA": ["ANH"], "ARI": ["ARZ", "PHX"]}
log = []
_lock, _last = threading.Lock(), [0.0]
MIN_GAP = 1 / 12.0


def get(url, params=None, tries=4):
    if params:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
    for i in range(tries):
        with _lock:
            wait = _last[0] + MIN_GAP - time.time()
            if wait > 0:
                time.sleep(wait)
            _last[0] = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429 and i < tries - 1:
                time.sleep(2 ** (i + 1)); continue
            if e.code != 404:
                log.append(f"HTTP {e.code} {url[:200]}")
            return None
        except Exception as e:
            if i < tries - 1:
                time.sleep(2 ** i); continue
            log.append(f"ERR {type(e).__name__} {url[:200]}"); return None


def norm(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z ]", "", s.replace("-", " ").replace(".", " "))
    s = re.sub(r"\b(jr|sr|ii|iii|iv)\b", "", s)
    return re.sub(r"\s+", " ", s).strip()


def date_from_ticker(event_ticker):
    m = re.search(r"-(\d{2})([A-Z]{3})(\d{2})", str(event_ticker or ""))
    return f"20{m.group(1)}-{MONTHS.index(m.group(2)) + 1:02d}-{m.group(3)}" if m and m.group(2) in MONTHS else None


def teams_code(event_ticker):
    m = re.search(r"-\d{2}[A-Z]{3}\d{2}(?:\d{4})?([A-Z]+)$", str(event_ticker or ""))
    return m.group(1) if m else None


def codes(abbrev):
    return [abbrev] + ALIASES.get(abbrev, [])


def season_of(date):
    """NHL season start year for a YYYY-MM-DD date (2026-01-10 -> 2025, i.e. 2025-26)."""
    y, mth = int(date[:4]), int(date[5:7])
    return y if mth >= 9 else y - 1


_sched = {}


def schedule_day(date):
    """[{game_id, start_utc, home, away, game_type, state}] for one US date, from the NHL API's schedule."""
    if date not in _sched:
        d = get(f"{NHLAPI}/schedule/{date}") or {}
        games = []
        for day in d.get("gameWeek") or []:
            if day.get("date") != date:
                continue
            for g in day.get("games") or []:
                games.append({"game_id": g.get("id"), "start_utc": g.get("startTimeUTC"),
                              "home": (g.get("homeTeam") or {}).get("abbrev"), "away": (g.get("awayTeam") or {}).get("abbrev"),
                              "game_type": g.get("gameType"), "state": g.get("gameState")})
        if d:
            _sched[date] = games
        return games
    return _sched[date]


def game_of(event_ticker):
    """The NHL game a Kalshi event is about: {game_id, start (datetime UTC), home, away, game_type, season, date}."""
    date, code = date_from_ticker(event_ticker), teams_code(event_ticker)
    if not (date and code):
        return None
    for g in schedule_day(date):
        if not (g["home"] and g["away"] and g["start_utc"]):
            continue
        for a in codes(g["away"]):
            for h in codes(g["home"]):
                if code in (a + h, h + a):
                    start = datetime.fromisoformat(g["start_utc"].replace("Z", "+00:00")).astimezone(timezone.utc)
                    return dict(g, start=start, season=season_of(date), date=date)
    return None


def label(m):
    """(player, N) from an "N+" market's wording: "Name: N+ goals" (title), "Name: N+" (yes_sub_title), or
    "Name records N+ goals" (older wording). (None, None) if none fits."""
    for text, pat in ((m.get("title"), r"^(.+?):\s*(\d+)\+"), (m.get("yes_sub_title"), r"^(.+?):\s*(\d+)\+"),
                      (m.get("title"), r"^(.+?)\s+(?:records|scores|has|gets)\s+(\d+)\+")):
        mt = re.search(pat, str(text or "").strip())
        if mt:
            return mt.group(1).strip(), int(mt.group(2))
    return None, None


def is_over_market(m):
    """An "N+ <stat>" market (= Over N-0.5): strike_type "greater", or "structured" when the wording reads "N+" and
    floor_strike = N - 0.5 (Kalshi's historical copies)."""
    st = m.get("strike_type")
    _, n = label(m)
    if st in (None, "greater"):
        return n is not None or m.get("floor_strike") is not None
    try:
        return st == "structured" and n is not None and abs(float(m.get("floor_strike")) - (n - 0.5)) < 1e-9
    except (TypeError, ValueError):
        return False


def line_of(m):
    """The Over line: floor_strike, else N - 0.5 from the wording."""
    try:
        return round(float(m["floor_strike"]), 1)
    except (KeyError, TypeError, ValueError):
        n = label(m)[1]
        return None if n is None else n - 0.5


def num(x):
    """A price field: dollars string ('0.2600') or integer cents; returns dollars 0-1 or None."""
    if x is None or x == "":
        return None
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v / 100.0 if v > 1.0 else v


def cents(x):
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    if v != v:
        return None
    return v if ("." in str(x) and v != int(v)) else v / 100.0


def ohlc_close(c, key):
    v = c.get(key)
    if isinstance(v, dict):
        if v.get("close_dollars") not in (None, ""):
            return num(v["close_dollars"])
        return cents(v["close"]) if v.get("close") not in (None, "") else None
    if c.get(key + "_close_dollars") not in (None, ""):
        return num(c[key + "_close_dollars"])
    return cents(c.get(key + "_close"))


def now_utc():
    return datetime.now(timezone.utc)


def iso(t):
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


__all__ = ["get", "norm", "game_of", "label", "is_over_market", "line_of", "num", "ohlc_close", "SERIES", "KALSHI",
           "NHLAPI", "schedule_day", "season_of", "now_utc", "iso", "timedelta"]
