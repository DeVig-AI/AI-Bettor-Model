#!/usr/bin/env python3
"""
nhl_wnba_probe_v1.py -- read-only data probe before building anything for the NHL or the WNBA.

What it measures (coverage only -- no prices, no results, so a later back-test can still be pre-registered before any
past price is seen):
  1. Kalshi: every sports series whose title mentions the NHL / hockey / the WNBA. For each: what kind it is (game
     winner, total, spread, player prop, futures/other), how many events are open and settled on the live and the
     historical endpoints, settled games by month, and the wording of two sample markets (title, strike type,
     floor_strike -- never a price).
  2. Free box scores (sportsdataverse releases): which seasons exist, rows, games, date range, season types, columns.
     NHL: nhl_player_boxscores (NHL API style). WNBA: espn_wnba_player_boxscores (same format as the NBA files).
  3. ESPN's public scoreboard for both leagues (tip-off / puck-drop times), one date each.
  4. The NHL's own public API (api-web.nhle.com): a schedule day and one game's box score per season since 2010-11,
     because the sportsdataverse NHL files before 2023-24 have no game id or game date.

Public endpoints, no keys, no account, nothing bet. Run from the repo root:  python3 odds_probe/nhl_wnba_probe_v1.py
Output: odds_probe/nhl_wnba_probe_v1.json and odds_probe/nhl_wnba_probe_v1.md
PARTS=boxscores,kalshi,espn (env) limits what runs, e.g. PARTS=boxscores where Kalshi is not reachable.
"""
import csv, io, json, os, re, sys, time, urllib.parse, urllib.request, urllib.error
from collections import Counter, defaultdict
from datetime import datetime, timezone

KALSHI = "https://api.elections.kalshi.com/trade-api/v2"
ESPN = "https://site.api.espn.com/apis/site/v2/sports/{path}/scoreboard"
BOX = "https://github.com/sportsdataverse/sportsdataverse-data/releases/download/{tag}/player_box_{y}.csv"
UA = "nhl-wnba-probe/1.0 (personal research; read-only)"
PAUSE = 0.12
OUT_DIR = os.path.dirname(os.path.abspath(__file__))
PARTS = set((os.getenv("PARTS") or "boxscores,kalshi,espn,nhlapi").split(","))
NHLAPI = "https://api-web.nhle.com/v1"
LEAGUE_RX = {"NHL": re.compile(r"\b(nhl|hockey|stanley cup)\b", re.I),
             "WNBA": re.compile(r"\b(wnba|women'?s pro basketball)\b", re.I)}
KIND_RX = [("total", re.compile(r"\btotal\b|over/under", re.I)),
           ("spread", re.compile(r"spread|puck ?line|margin|win by", re.I)),
           ("futures", re.compile(r"champion|cup winner|mvp|award|season|playoffs? (qualif|make)|draft|division|"
                                  r"conference winner|series winner|most |leader", re.I)),
           ("player_prop", re.compile(r"\bplayer\b|\bpoints\b|\bgoals?\b|\bassists?\b|\bshots?\b|\bsaves?\b|"
                                      r"\brebounds?\b|\bthrees?\b|\bblocks?\b|\bsteals?\b", re.I)),
           ("game_winner", re.compile(r"\bgame\b|\bwinner\b|\bwin\b|vs\.?|\bat\b", re.I))]
MONTHS = "JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split()
BOX_SOURCES = {"NHL": ("nhl_player_boxscores", range(2008, 2028)),
               "WNBA": ("espn_wnba_player_boxscores", range(2002, 2028))}
ESPN_DATES = {"NHL": ("hockey/nhl", "20261018"), "WNBA": ("basketball/wnba", "20250715")}
log = []


def get(url, params=None, tries=4, raw=False, timeout=60):
    if params:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
    for i in range(tries):
        time.sleep(PAUSE)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*" if raw else "application/json"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                b = r.read()
                return b if raw else json.loads(b.decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429 and i < tries - 1:
                time.sleep(2 ** (i + 1)); continue
            if e.code != 404:
                log.append(f"HTTP {e.code} {url[:160]}")
            return None
        except Exception as e:
            if i < tries - 1:
                time.sleep(2 ** i); continue
            log.append(f"ERR {type(e).__name__} {url[:160]}"); return None


# ---- 1. Kalshi ------------------------------------------------------------------------------------------------------
def kind_of(title):
    for k, rx in KIND_RX:
        if rx.search(title or ""):
            return k
    return "other"


def month_of(event_ticker):
    m = re.search(r"-(\d{2})([A-Z]{3})(\d{2})", str(event_ticker or ""))
    return f"20{m.group(1)}-{MONTHS.index(m.group(2)) + 1:02d}" if m and m.group(2) in MONTHS else None


def page(path, params, key, limit_pages=200):
    out, cursor = [], None
    for _ in range(limit_pages):
        d = get(KALSHI + path, dict(params, cursor=cursor))
        if not d:
            break
        items = d.get(key) or []
        out += items
        cursor = d.get("cursor")
        if not cursor or not items:
            break
    return out


def sample(m):
    return {k: m.get(k) for k in ("ticker", "title", "yes_sub_title", "strike_type", "floor_strike", "cap_strike",
                                  "result", "status", "market_type")}


def kalshi():
    series = page("/series", {"category": "Sports"}, "series", 80)
    found = {}
    for s in series:
        title = s.get("title") or ""
        for lg, rx in LEAGUE_RX.items():
            if rx.search(title) or rx.search(" ".join(s.get("tags") or [])):
                found[s["ticker"]] = {"league": lg, "title": title, "kind": kind_of(title)}
    for tk, info in sorted(found.items()):
        settled = page("/events", {"series_ticker": tk, "status": "settled", "limit": 200}, "events")
        opened = page("/events", {"series_ticker": tk, "status": "open", "limit": 200}, "events", 5)
        hist = page("/historical/markets", {"series_ticker": tk, "limit": 1000}, "markets")
        months = Counter(m for m in (month_of(e.get("event_ticker")) for e in settled) if m)
        hist_events = {m.get("event_ticker") for m in hist}
        hist_months = Counter(m for m in (month_of(e) for e in hist_events) if m)
        ms = []
        for e in (settled[:1] + opened[:1]):
            d = get(KALSHI + "/markets", {"event_ticker": e.get("event_ticker"), "limit": 5}) or {}
            mk = d.get("markets") or []
            if not mk:
                d = get(KALSHI + "/historical/markets", {"event_ticker": e.get("event_ticker"), "limit": 5}) or {}
                mk = d.get("markets") or []
            ms += [sample(m) for m in mk[:2]]
        if not ms and hist:
            ms = [sample(m) for m in hist[:2]]
        info.update(settled_events=len(settled), open_events=len(opened), historical_markets=len(hist),
                    historical_events=len(hist_events), settled_by_month=dict(sorted(months.items())),
                    historical_by_month=dict(sorted(hist_months.items())), sample_markets=ms)
    return {"series_scanned": len(series), "matched": found}


# ---- 2. Box scores --------------------------------------------------------------------------------------------------
def boxscores():
    out = {}
    for lg, (tag, years) in BOX_SOURCES.items():
        seasons = {}
        for y in years:
            b = get(BOX.format(tag=tag, y=y), raw=True, tries=2, timeout=180)
            if not b:
                continue
            rows = list(csv.DictReader(io.StringIO(b.decode("utf-8", "replace"))))
            if not rows:
                continue
            cols = list(rows[0].keys())
            dates = sorted(r.get("game_date") or "" for r in rows if r.get("game_date"))
            seasons[y] = {"rows": len(rows), "games": len({r.get("game_id") for r in rows}),
                          "players": len({r.get("athlete_id") or r.get("player_id") for r in rows}),
                          "first": dates[0] if dates else None, "last": dates[-1] if dates else None,
                          "season_types": dict(Counter(r.get("season_type") or r.get("game_type") or "?" for r in rows)),
                          "mb": round(len(b) / 1e6, 1),
                          "has_game_id_and_date": "game_id" in rows[0] and "game_date" in rows[0]}
            out.setdefault(lg, {"source": BOX.format(tag=tag, y="{y}"), "columns": cols})
        if lg in out:
            out[lg]["seasons"] = seasons
        else:
            out[lg] = {"source": BOX.format(tag=tag, y="{y}"), "seasons": {}}
    return out


# ---- 3. ESPN scoreboard -------------------------------------------------------------------------------------------
def espn():
    out = {}
    for lg, (path, date) in ESPN_DATES.items():
        d = get(ESPN.format(path=path), {"dates": date})
        evs = (d or {}).get("events") or []
        out[lg] = {"date": date, "reachable": d is not None, "games": len(evs),
                   "has_start_time": all(bool(e.get("date")) for e in evs) if evs else None,
                   "sample": [{"name": e.get("shortName"), "date": e.get("date"),
                               "season": (e.get("season") or {}).get("year"), "type": (e.get("season") or {}).get("type")}
                              for e in evs[:2]]}
    return out


# ---- 4. NHL public API ---------------------------------------------------------------------------------------------
def nhlapi():
    out = {}
    for start in range(2010, 2027):
        gid = f"{start}020001"                          # first regular-season game of the season starting in `start`
        d = get(f"{NHLAPI}/gamecenter/{gid}/boxscore")
        if not d:
            out[start] = {"boxscore": False}
            continue
        ps = d.get("playerByGameStats") or {}
        home = ps.get("homeTeam") or {}
        out[start] = {"boxscore": True, "game_date": d.get("gameDate"), "start_utc": d.get("startTimeUTC"),
                      "player_groups": sorted(home), "skater_fields": sorted((home.get("forwards") or [{}])[0])}
    d = get(f"{NHLAPI}/schedule/2015-10-10")
    out["schedule_2015_10_10"] = {"reachable": d is not None,
                                  "games": sum(len(w.get("games") or []) for w in (d or {}).get("gameWeek") or [])}
    return out


def md(res):
    L = ["# NHL / WNBA data probe v1", "",
         f"_Generated {res['generated_at']} by odds_probe/nhl_wnba_probe_v1.py. Coverage only: no prices, no results._", ""]
    k = res.get("kalshi")
    if k:
        L += ["## Kalshi series", "", f"{k['series_scanned']} sports series scanned.", ""]
        for lg in ("NHL", "WNBA"):
            rows = {t: v for t, v in k["matched"].items() if v["league"] == lg}
            L += [f"### {lg}: {len(rows)} series", "", "| series | title | kind | settled events | open | historical markets |",
                  "|---|---|---|---|---|---|"]
            for t, v in sorted(rows.items(), key=lambda x: (x[1]["kind"], x[0])):
                L.append(f"| `{t}` | {v['title']} | {v['kind']} | {v.get('settled_events')} | {v.get('open_events')} | "
                         f"{v.get('historical_markets')} |")
            L.append("")
            for t, v in sorted(rows.items()):
                if v.get("settled_by_month") or v.get("historical_by_month"):
                    L.append(f"- `{t}` settled by month: {v.get('settled_by_month')} · historical: "
                             f"{v.get('historical_by_month')}")
                for s in v.get("sample_markets") or []:
                    L.append(f"  - sample: {s.get('title')!r} · strike {s.get('strike_type')} {s.get('floor_strike')}")
            L.append("")
    b = res.get("boxscores")
    if b:
        L += ["## Box scores (sportsdataverse)", ""]
        for lg, v in b.items():
            ss = v.get("seasons") or {}
            missing = [y for y, s in ss.items() if not s.get("has_game_id_and_date", True)]
            if missing:
                L += [f"**{lg}: seasons {missing} have no game_id / game_date column -- not usable per game.**", ""]
            L += [f"### {lg}", f"Source: `{v['source']}` · {len(ss)} seasons: {min(ss) if ss else '-'}–{max(ss) if ss else '-'}",
                  "", "| season | rows | games | players | first | last | types | MB |", "|---|---|---|---|---|---|---|---|"]
            for y, s in sorted(ss.items()):
                L.append(f"| {y} | {s['rows']} | {s['games']} | {s['players']} | {s['first']} | {s['last']} | "
                         f"{s['season_types']} | {s['mb']} |")
            L += ["", f"Columns: {', '.join(v.get('columns') or [])}", ""]
    n = res.get("nhlapi")
    if n:
        ok = [y for y, v in n.items() if isinstance(v, dict) and v.get("boxscore")]
        L += ["## NHL public API (api-web.nhle.com)", "", f"Box score found for the first game of seasons: {ok}", "",
              f"Schedule day 2015-10-10: {n.get('schedule_2015_10_10')}", ""]
        first = next((v for v in n.values() if isinstance(v, dict) and v.get("skater_fields")), None)
        if first:
            L += [f"Skater fields: {', '.join(first['skater_fields'])}", ""]
    e = res.get("espn")
    if e:
        L += ["## ESPN scoreboard", ""] + [f"- {lg}: {json.dumps(v)}" for lg, v in e.items()] + [""]
    if res["errors"]:
        L += ["## Errors", ""] + [f"- {x}" for x in res["errors"][:60]]
    return "\n".join(L) + "\n"


def main():
    res = {"generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "parts": sorted(PARTS)}
    path_json = os.path.join(OUT_DIR, "nhl_wnba_probe_v1.json")
    if os.path.exists(path_json):                       # keep parts measured elsewhere (e.g. box scores run locally)
        old = json.load(open(path_json))
        for p in ("kalshi", "boxscores", "espn", "nhlapi"):
            if p in old and p not in PARTS:
                res[p] = old[p]
    if "kalshi" in PARTS:
        res["kalshi"] = kalshi()
    if "boxscores" in PARTS:
        res["boxscores"] = boxscores()
    if "espn" in PARTS:
        res["espn"] = espn()
    if "nhlapi" in PARTS:
        res["nhlapi"] = nhlapi()
    res["errors"] = log[:300]
    json.dump(res, open(path_json, "w"), indent=1, default=str)
    open(os.path.join(OUT_DIR, "nhl_wnba_probe_v1.md"), "w").write(md(res))
    print(md(res)[:6000])


if __name__ == "__main__":
    sys.exit(main())
