#!/usr/bin/env python3
"""
nba_props_exchanges_v1.py -- pulls open NBA player-prop markets from Kalshi's public API (no key, no account,
nothing bet) and writes nba/props_exchanges_export.json in the same format as the NFL props export.

* Kalshi's NBA player-prop series are DISCOVERED each run from GET /series?category=Sports by title (e.g. a series
  titled like "Pro Basketball Points"), so new or renamed series are picked up; what was found is saved in the export.
* A market "Name: 25+ points" (floor_strike 24.5, strike_type greater) is stored as Over 24.5.
* Tip-off times come from ESPN's public NBA scoreboard; teams are stored with standard codes (GSW, NOP, NYK, SAS...).
Run from the repo root:  python3 nba/nba_props_exchanges_v1.py
"""
import hashlib, json, os, re, sys, time, unicodedata, urllib.parse, urllib.request, urllib.error
from datetime import datetime, timedelta, timezone

KALSHI = "https://api.elections.kalshi.com/trade-api/v2"
ESPN_SB = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard"
UA = "nba-props-exchanges/1.0 (personal research; read-only)"
PAUSE = 0.25
OUT = os.path.join("nba", "props_exchanges_export.json")
log = []

STD = ["ATL", "BOS", "BKN", "CHA", "CHI", "CLE", "DAL", "DEN", "DET", "GSW", "HOU", "IND", "LAC", "LAL", "MEM", "MIA",
       "MIL", "MIN", "NOP", "NYK", "OKC", "ORL", "PHI", "PHX", "POR", "SAC", "SAS", "TOR", "UTA", "WAS"]
ALT = {"GS": "GSW", "NO": "NOP", "NY": "NYK", "SA": "SAS", "UTAH": "UTA", "WSH": "WAS", "PHO": "PHX", "BRK": "BKN",
       "CHO": "CHA", "NOR": "NOP", "LA": "LAL"}
CITY = {"atlanta": "ATL", "boston": "BOS", "brooklyn": "BKN", "charlotte": "CHA", "chicago": "CHI", "cleveland": "CLE",
        "dallas": "DAL", "denver": "DEN", "detroit": "DET", "golden state": "GSW", "houston": "HOU", "indiana": "IND",
        "los angeles c": "LAC", "la clippers": "LAC", "los angeles clippers": "LAC", "los angeles l": "LAL",
        "la lakers": "LAL", "los angeles lakers": "LAL", "memphis": "MEM", "miami": "MIA", "milwaukee": "MIL",
        "minnesota": "MIN", "new orleans": "NOP", "new york": "NYK", "oklahoma city": "OKC", "orlando": "ORL",
        "philadelphia": "PHI", "phoenix": "PHX", "portland": "POR", "sacramento": "SAC", "san antonio": "SAS",
        "toronto": "TOR", "utah": "UTA", "washington": "WAS"}
NICK = {"hawks": "ATL", "celtics": "BOS", "nets": "BKN", "hornets": "CHA", "bulls": "CHI", "cavaliers": "CLE",
        "mavericks": "DAL", "nuggets": "DEN", "pistons": "DET", "warriors": "GSW", "rockets": "HOU", "pacers": "IND",
        "clippers": "LAC", "lakers": "LAL", "grizzlies": "MEM", "heat": "MIA", "bucks": "MIL", "timberwolves": "MIN",
        "pelicans": "NOP", "knicks": "NYK", "thunder": "OKC", "magic": "ORL", "76ers": "PHI", "suns": "PHX",
        "trail blazers": "POR", "blazers": "POR", "kings": "SAC", "spurs": "SAS", "raptors": "TOR", "jazz": "UTA",
        "wizards": "WAS"}
MONTHS = "JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split()
SKIP_SERIES = re.compile(r"\b(most|leader|leaders|mvp|season|first|team|champion|championship|series|award|draft|"
                         r"total|spread|win|wins|winner|double|triple|rookie|coach|all-?star|trade|career|record|"
                         r"quarter|half|margin|longest|dunk|exact|range)\b", re.I)


def get(url, params=None, tries=4):
    if params:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
    for i in range(tries):
        time.sleep(PAUSE)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429 and i < tries - 1:
                time.sleep(2 ** (i + 1)); continue
            log.append(f"HTTP {e.code} {url[:180]}"); return None
        except Exception as e:
            if i < tries - 1:
                time.sleep(2 ** i); continue
            log.append(f"ERR {type(e).__name__} {url[:180]}"); return None


def fnum(x):
    try:
        v = float(x)
        return v if v == v else None
    except (TypeError, ValueError):
        return None


def stat_of(title):
    """Map a Kalshi series title to a canonical stat, or None."""
    t = str(title or "").lower()
    if not re.search(r"(pro basketball|\bnba\b)", t) or SKIP_SERIES.search(t):
        return None
    has = {k: bool(re.search(p, t)) for k, p in {
        "pts": r"\bpoints?\b|\bpts\b", "reb": r"\brebounds?\b|\breb\b", "ast": r"\bassists?\b|\bast\b",
        "stl": r"\bsteals?\b", "blk": r"\bblocks?\b", "tov": r"\bturnovers?\b",
        "three": r"three|3-?point|3pt|\bthrees\b|3-?pointers?"}.items()}
    if has["three"]:
        return "threes"
    if has["pts"] and has["reb"] and has["ast"]:
        return "pts_reb_ast"
    if has["pts"] and has["reb"]:
        return "pts_reb"
    if has["pts"] and has["ast"]:
        return "pts_ast"
    if has["reb"] and has["ast"]:
        return "reb_ast"
    if has["stl"] and has["blk"]:
        return "stl_blk"
    for k, s in (("pts", "points"), ("reb", "rebounds"), ("ast", "assists"), ("stl", "steals"), ("blk", "blocks"),
                 ("tov", "turnovers")):
        if has[k]:
            return s
    return None


def code_of(name):
    n = re.sub(r"\s+", " ", str(name or "").strip().lower())
    return CITY.get(n) or NICK.get(n) or (n.upper() if n.upper() in STD else ALT.get(n.upper()))


def teams_from_title(title):
    head = str(title or "").split(":")[0]
    parts = re.split(r"\s+(?:vs\.?|at|@)\s+", head, flags=re.I)
    if len(parts) != 2:
        return None
    a, h = code_of(parts[0]), code_of(parts[1])
    return (a, h) if a and h else None


def teams_from_ticker(event_ticker):
    m = re.search(r"-\d{2}[A-Z]{3}\d{2}([A-Z]+)$", str(event_ticker or ""))
    if not m:
        return None
    s = m.group(1)
    known = {c: c for c in STD}; known.update(ALT)
    for i in range(2, len(s) - 1):
        a, h = s[:i], s[i:]
        if a in known and h in known:
            return known[a], known[h]
    return None


def date_from_ticker(event_ticker):
    m = re.search(r"-(\d{2})([A-Z]{3})(\d{2})", str(event_ticker or ""))
    return f"20{m.group(1)}-{MONTHS.index(m.group(2)) + 1:02d}-{m.group(3)}" if m else None


def norm_name(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z ]", "", s.replace("-", " "))
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", s)
    return re.sub(r"\s+", " ", s).strip()


_sb = {}


def espn_games(date):
    """{(away, home): {"tip": iso, "espn_id": id}} for an ESPN scoreboard date (YYYY-MM-DD, US date)."""
    if date in _sb:
        return _sb[date]
    out = {}
    d = get(ESPN_SB, {"dates": date.replace("-", "")})
    for ev in (d or {}).get("events") or []:
        comp = (ev.get("competitions") or [{}])[0]
        teams = {c.get("homeAway"): c.get("team", {}).get("abbreviation") for c in comp.get("competitors") or []}
        a, h = teams.get("away"), teams.get("home")
        a, h = ALT.get(a, a), ALT.get(h, h)
        if a and h:
            out[(a, h)] = {"tip": ev.get("date"), "espn_id": ev.get("id")}
    _sb[date] = out
    return out


def discover_series():
    found, cursor, pages = {}, None, 0
    while pages < 60:
        d = get(f"{KALSHI}/series", {"category": "Sports", "cursor": cursor})
        pages += 1
        if not d:
            break
        for s in d.get("series") or []:
            st = stat_of(s.get("title"))
            if st:
                found[s.get("ticker")] = {"stat": st, "title": s.get("title")}
        cursor = d.get("cursor")
        if not cursor:
            break
    return found


def main():
    now = datetime.now(timezone.utc)
    series = discover_series()
    games, nq = {}, 0
    for tk, info in series.items():
        cursor, pages = None, 0
        while pages < 5:
            d = get(f"{KALSHI}/events", {"series_ticker": tk, "status": "open", "with_nested_markets": "true",
                                         "limit": 100, "cursor": cursor})
            pages += 1
            if not d:
                break
            for ev in d.get("events") or []:
                et = ev.get("event_ticker")
                date = date_from_ticker(et)
                teams = teams_from_title(ev.get("title")) or teams_from_ticker(et)
                if not (date and teams):
                    log.append(f"skip event {et} '{ev.get('title')}'"); continue
                sb = espn_games(date)
                if teams not in sb and (teams[1], teams[0]) in sb:
                    teams = (teams[1], teams[0])               # Kalshi listed home first: use ESPN's away/home
                info_g = sb.get(teams) or {}
                key = f"{date}_{teams[0]}_{teams[1]}"
                g = games.setdefault(key, {"meta": {"game_key": key, "game_date": date, "away_team": teams[0],
                                                    "home_team": teams[1], "kickoff_time": None, "espn_id": None},
                                           "rows": {}})
                if info_g.get("tip"):
                    g["meta"]["kickoff_time"] = datetime.fromisoformat(info_g["tip"].replace("Z", "+00:00")) \
                        .astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                    g["meta"]["espn_id"] = info_g.get("espn_id")
                for m in ev.get("markets") or []:
                    if m.get("status") not in (None, "active", "open") or m.get("strike_type") not in (None, "greater"):
                        continue
                    line, title = fnum(m.get("floor_strike")), str(m.get("title") or "")
                    player = title.split(":")[0].strip() if ":" in title else None
                    if line is None or not player or re.search(r"\s(vs\.?|at|@)\s", player, re.I):
                        continue
                    k = (norm_name(player), info["stat"], round(line, 1))
                    g["rows"][k] = {"player": player, "stat": info["stat"], "line": round(line, 1),
                                    "k": {"bid": fnum(m.get("yes_bid_dollars")), "ask": fnum(m.get("yes_ask_dollars")),
                                          "last": fnum(m.get("last_price_dollars")), "oi": fnum(m.get("open_interest_fp")),
                                          "vol": fnum(m.get("volume_fp")), "t": m.get("ticker"), "e": et}}
                    nq += 1
            cursor = d.get("cursor")
            if not cursor:
                break
    stamp = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    docs = []
    for key, g in sorted(games.items()):
        rows = sorted(g["rows"].values(), key=lambda r: (r["stat"], r["player"], r["line"]))
        data = dict(g["meta"], sport="NBA", source="kalshi public market data", fetched_at=stamp,
                    note="Exchange prices = market's implied chance (0-1). Not sportsbook odds, not picks.",
                    n_rows=len(rows), rows=rows)
        data["export_hash"] = hashlib.sha256(json.dumps({k: v for k, v in data.items() if k != "fetched_at"},
                                                        sort_keys=True).encode()).hexdigest()
        docs.append({"collection": "props", "doc_id": key, "data": data})
    os.makedirs("nba", exist_ok=True)
    out = {"sport": "NBA_PROPS", "generated_at": stamp, "n_docs": len(docs),
           "counts": {"series_found": len(series), "kalshi_quotes": nq, "rows": sum(d["data"]["n_rows"] for d in docs)},
           "series_found": series, "errors": log[:100], "docs": docs}
    json.dump(out, open(OUT, "w"), separators=(",", ":"))
    print(json.dumps({k: out[k] for k in ("generated_at", "n_docs", "counts")}, indent=1))
    print("series:", json.dumps(series, indent=1)[:3000])


if __name__ == "__main__":
    sys.exit(main())
