"""Research Lab data probe (MLB, NBA, and later WNBA / college basketball): which free sources of historical closing
lines and final scores can GitHub Actions reach, for which seasons, with which columns, under which terms.

    python3 -m research.probe.data_probe        # writes research/probe/PROBE.md and PROBE.json

Coverage only: seasons, row counts, column names, and the share of games that have a line. It never summarises
results (no scores, margins, covers or overs are computed or reported), so it can run before a sport's Constitution
Part is written. Downloads go to a temporary folder and are deleted; nothing downloaded is committed.
"""
import datetime as dt
import io
import json
import os
import re
import sqlite3
import sys
import tempfile
import time
import urllib.request
import zipfile

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
UA = "Mozilla/5.0 (devig-research-probe; read-only)"
SBR = "https://www.sportsbookreviewsonline.com/scoresoddsarchives/{sport}/{sport}oddsarchives.htm"
SBR_SPORTS = {"NBA": "nba", "MLB": "mlb", "NCAAB": "ncaabasketball", "WNBA": "wnba"}
KYLESKOM = "https://raw.githubusercontent.com/kyleskom/NBA-Machine-Learning-Sports-Betting/master/Data/OddsData.sqlite"
ESPN_SB = "https://site.api.espn.com/apis/site/v2/sports/{path}/scoreboard?dates={date}"
ESPN_ODDS = "https://sports.core.api.espn.com/v2/sports/{path}/events/{eid}/competitions/{eid}/odds"
ESPN_PATHS = {"NBA": "basketball/nba", "MLB": "baseball/mlb", "WNBA": "basketball/wnba",
              "NCAAB": "basketball/mens-college-basketball"}
# one mid-season date per season to sample ESPN's odds history
ESPN_DATES = {"NBA": [f"{y}0115" for y in range(2008, 2026)], "MLB": [f"{y}0710" for y in range(2008, 2026)],
              "WNBA": [f"{y}0715" for y in range(2010, 2026)], "NCAAB": [f"{y}0201" for y in range(2008, 2026)]}
RETRO = "https://www.retrosheet.org/gamelogs/gl{year}.zip"
RETRO_NOTICE = "https://www.retrosheet.org/notice.txt"


def get(url, tries=3, timeout=60):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:
            if i == tries - 1:
                raise RuntimeError(f"{type(e).__name__}: {e}")
            time.sleep(2 * (i + 1))


def share(s):
    v = pd.to_numeric(s, errors="coerce")
    return round(float(v.notna().mean()), 3) if len(v) else None


def probe_sbr(sport):
    page = SBR.format(sport=SBR_SPORTS[sport])
    r = {"source": "Sportsbook Reviews Online odds archive", "url": page}
    try:
        html = get(page).decode("utf-8", "replace")
    except RuntimeError as e:
        r["error"] = str(e)
        return r
    links = sorted(set(re.findall(r'href="([^"]+\.xlsx?)"', html, flags=re.I)))
    r["files"] = len(links)
    r["terms_snippet"] = " ".join(re.findall(r"[^.<>]*(?:copyright|terms|permission|reproduc)[^.<>]*\.", html,
                                             flags=re.I))[:500] or None
    seasons = []
    for href in links:
        url = href if href.startswith("http") else page.rsplit("/", 1)[0] + "/" + href.lstrip("/")
        s = {"file": url.rsplit("/", 1)[-1]}
        try:
            df = pd.read_excel(io.BytesIO(get(url)))
            cols = [str(c) for c in df.columns]
            s.update(rows=len(df), columns=cols)
            for c in cols:
                if re.search(r"close|open|ml|run ?line|o/?u|2h", c, flags=re.I):
                    s[f"numeric:{c}"] = share(df[c])
        except Exception as e:
            s["error"] = f"{type(e).__name__}: {e}"[:200]
        seasons.append(s)
    r["seasons"] = seasons
    return r


def probe_kyleskom():
    r = {"source": "kyleskom/NBA-Machine-Learning-Sports-Betting OddsData.sqlite (scraped from SBR)", "url": KYLESKOM}
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "odds.sqlite")
        try:
            with open(p, "wb") as f:
                f.write(get(KYLESKOM, timeout=180))
        except RuntimeError as e:
            r["error"] = str(e)
            return r
        c = sqlite3.connect(p)
        tables = [t[0] for t in c.execute("select name from sqlite_master where type='table'")]
        r["tables"] = []
        for t in sorted(tables):
            df = pd.read_sql(f'select * from "{t}"', c)
            row = {"table": t, "rows": len(df), "columns": list(df.columns)}
            for k in ("OU", "Spread", "ML_Home", "ML_Away"):
                if k in df:
                    row[f"numeric:{k}"] = share(df[k])
            if "Spread" in df:
                row["spread_signed_share"] = round(float((pd.to_numeric(df.Spread, errors="coerce") < 0).mean()), 3)
            if "Date" in df:
                row["dates"] = [str(df.Date.min()), str(df.Date.max())]
            r["tables"].append(row)
        c.close()
    r["note"] = ("License not stated in the repository. Older tables give the spread without a side (favourite's "
                 "number), recent ones signed; whether lines are closing is not documented.")
    return r


def probe_espn(sport):
    path = ESPN_PATHS[sport]
    r = {"source": "ESPN public odds (core API) for past games", "samples": []}
    for date in ESPN_DATES[sport]:
        s = {"date": date}
        try:
            sb = json.loads(get(ESPN_SB.format(path=path, date=date)))
            evs = sb.get("events") or []
            s["games_that_day"] = len(evs)
            if evs:
                eid = evs[0]["id"]
                od = json.loads(get(ESPN_ODDS.format(path=path, eid=eid)))
                items = od.get("items") or []
                s["odds_items"] = len(items)
                if items:
                    it = items[0]
                    if "$ref" in it:
                        it = json.loads(get(it["$ref"]))
                    s["provider"] = (it.get("provider") or {}).get("name")
                    s["fields"] = sorted(k for k in it if k in ("spread", "overUnder", "homeTeamOdds", "awayTeamOdds",
                                                                "open", "close", "current"))
        except Exception as e:
            s["error"] = f"{type(e).__name__}: {e}"[:200]
        r["samples"].append(s)
        time.sleep(0.3)
    return r


def probe_retrosheet():
    r = {"source": "Retrosheet game logs (MLB scores)", "years": {}}
    try:
        r["notice"] = get(RETRO_NOTICE).decode("utf-8", "replace").strip()[:800]
    except RuntimeError as e:
        r["notice_error"] = str(e)
    for y in range(2008, 2026):
        try:
            z = zipfile.ZipFile(io.BytesIO(get(RETRO.format(year=y))))
            name = z.namelist()[0]
            r["years"][y] = {"file": name, "games": sum(1 for _ in z.open(name))}
        except Exception as e:
            r["years"][y] = {"error": f"{type(e).__name__}: {e}"[:120]}
    return r


def markdown(res):
    L = ["# Research Lab data probe (MLB, NBA, WNBA, college basketball)", "",
         f"_Generated {res['at']} in GitHub Actions by research/probe/data_probe.py. Coverage only: no results are "
         "computed or shown. Raw details: PROBE.json._", ""]
    for sport, parts in res["sports"].items():
        L += [f"## {sport}", ""]
        for p in parts:
            L.append(f"### {p['source']}")
            if p.get("error"):
                L += [f"- **Not reachable:** {p['error']}", ""]
                continue
            if "seasons" in p:
                L.append(f"- {p['files']} files · terms on the page: {p.get('terms_snippet') or 'none found'}")
                for s in p["seasons"]:
                    extra = ", ".join(f"{k[8:]} {v:.0%}" for k, v in s.items() if k.startswith("numeric:") and v is not None)
                    L.append(f"  - `{s['file']}`: {s.get('rows', '—')} rows" + (f" · {extra}" if extra else "") +
                             (f" · error {s['error']}" if s.get("error") else ""))
            if "tables" in p:
                L.append(f"- {p['note']}")
                for t in p["tables"]:
                    extra = ", ".join(f"{k[8:]} {v:.0%}" for k, v in t.items() if k.startswith("numeric:"))
                    L.append(f"  - `{t['table']}`: {t['rows']} rows, {t.get('dates')} · {extra} · signed spreads "
                             f"{t.get('spread_signed_share', 0):.0%}")
            if "samples" in p:
                for s in p["samples"]:
                    L.append(f"  - {s['date']}: " + (f"error {s['error']}" if s.get("error") else
                             f"{s.get('games_that_day', 0)} games, odds items {s.get('odds_items', 0)}"
                             + (f" ({s.get('provider')}; {', '.join(s.get('fields') or [])})" if s.get("odds_items") else "")))
            if "years" in p:
                L.append(f"- Notice: {p.get('notice', p.get('notice_error'))}")
                for y, v in p["years"].items():
                    L.append(f"  - {y}: " + (f"{v['games']} games" if "games" in v else v["error"]))
            L.append("")
    return "\n".join(L) + "\n"


def main():
    res = {"at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "sports": {}}
    for sport in ("NBA", "MLB", "WNBA", "NCAAB"):
        parts = [probe_sbr(sport)]
        if sport == "NBA":
            parts.append(probe_kyleskom())
        parts.append(probe_espn(sport))
        if sport == "MLB":
            parts.append(probe_retrosheet())
        res["sports"][sport] = parts
        print(f"{sport}: probed {len(parts)} sources", flush=True)
    with open(os.path.join(HERE, "PROBE.json"), "w") as f:
        json.dump(res, f, indent=1, default=str)
    with open(os.path.join(HERE, "PROBE.md"), "w") as f:
        f.write(markdown(res))
    return 0


if __name__ == "__main__":
    sys.exit(main())
