"""One-off checks for the CFB work, run in GitHub Actions (the dev container can't reach these hosts):
  * CFBD: which provider the CFB_API_KEY belongs to and its real monthly limit (/info), plus the field names of the
    season-level endpoints the lab cache will use (one 2014 sample each; schema and counts only, no rows kept);
  * Kalshi: which series tickers carry NCAA football games;
  * ESPN: the college-football scoreboard's shape;
  * GitHub: licenses of the open CFB model/ratings repos considered for the Models page.
The key is read from the environment and never printed.
"""
import json
import os
import urllib.error
import urllib.request

KEY = os.environ.get("CFB_API_KEY", "")
calls = 0


def get(url, auth=False):
    global calls
    h = {"Accept": "application/json", "User-Agent": "devig-cfb-probe/1.0"}
    if auth:
        h["Authorization"] = "Bearer " + KEY
        calls += 1
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=60) as r:
            hdr = {k: v for k, v in r.headers.items() if "limit" in k.lower() or "remaining" in k.lower()}
            return r.status, json.loads(r.read().decode()), hdr
    except urllib.error.HTTPError as e:
        return e.code, (e.read()[:300].decode(errors="replace")), {}
    except Exception as e:
        return None, f"{type(e).__name__}: {e}", {}


def shape(x):
    if isinstance(x, list):
        return {"rows": len(x), "first": x[0] if x else None}
    return x


print("== CFBD ==  key present:", bool(KEY), "length:", len(KEY))
B = "https://api.collegefootballdata.com"
st, d, h = get(B + "/info", auth=True)
print("/info", st, d if not isinstance(d, str) else d[:200], h)
for path in ["/games?year=2014&seasonType=regular&classification=fbs", "/lines?year=2014&seasonType=regular",
             "/stats/game/advanced?year=2014&seasonType=regular", "/player/returning?year=2014"]:
    st, d, h = get(B + path, auth=True)
    s = shape(d)
    if isinstance(s, dict) and isinstance(s.get("first"), dict):
        f = s["first"]
        print(path, st, "rows", s["rows"], "keys", sorted(f.keys()), h)
        print("   sample:", json.dumps(f)[:900])
    else:
        print(path, st, str(d)[:300], h)
print("CFBD calls used by this probe:", calls)

print("== Kalshi ==")
K = "https://api.elections.kalshi.com/trade-api/v2"
st, d, _ = get(K + "/series?category=Sports")
if st == 200:
    ser = d.get("series") or []
    hits = [(x.get("ticker"), x.get("title")) for x in ser
            if any(w in (str(x.get("ticker")) + " " + str(x.get("title"))).upper()
                   for w in ("NCAAF", "CFB", "COLLEGE FOOTBALL", "NCAA FOOTBALL"))]
    print("series in Sports:", len(ser), "college-football-looking:", hits[:40])
else:
    print("/series", st, str(d)[:200])
for t in ["KXNCAAFGAME", "KXNCAAFSPREAD", "KXNCAAFTOTAL", "KXNCAAFBGAME", "KXCFBGAME"]:
    st, d, _ = get(K + f"/events?series_ticker={t}&status=open&with_nested_markets=true&limit=200")
    if st == 200:
        ev = d.get("events") or []
        print(t, "open events:", len(ev), "cursor:", bool(d.get("cursor")))
        for e in ev[:3]:
            ms = e.get("markets") or []
            print("   ", e.get("event_ticker"), "|", e.get("title"), "|",
                  [(m.get("ticker"), m.get("yes_sub_title"), m.get("floor_strike"), m.get("yes_bid_dollars"),
                    m.get("yes_ask_dollars")) for m in ms[:3]])
    else:
        print(t, st, str(d)[:150])

print("== ESPN ==")
E = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard"
for q in ["", "?groups=80&limit=300"]:
    st, d, _ = get(E + q)
    if st == 200:
        evs = d.get("events") or []
        print(q or "(default)", "events:", len(evs))
        for ev in evs[:2]:
            c = ev["competitions"][0]
            print("   ", ev.get("date"), ev.get("status", {}).get("type", {}).get("state"), "neutral", c.get("neutralSite"),
                  [(x["homeAway"], x["team"].get("id"), x["team"].get("abbreviation"), x["team"].get("location"),
                    x["team"].get("shortDisplayName"), x["team"].get("displayName"), x.get("score"),
                    (x.get("curatedRank") or {}).get("current")) for x in c["competitors"]])
    else:
        print(q, st)

print("== GitHub licenses ==")
for repo in ["sportsdataverse/cfbfastR", "sportsdataverse/sportsdataverse-py", "sportsdataverse/cfbfastR-data",
             "CFBD/cfbd-python", "fivethirtyeight/nfl-elo-game", "fivethirtyeight/data", "kylemhowe/cfb-elo",
             "jkcox21/college-football-elo", "mattsnr/Predictive-Models", "JackLich10/gamezoneR"]:
    st, d, _ = get(f"https://api.github.com/repos/{repo}")
    if st == 200:
        print(repo, "license:", (d.get("license") or {}).get("spdx_id"), "pushed:", d.get("pushed_at"),
              "archived:", d.get("archived"), "|", (d.get("description") or "")[:100])
    else:
        print(repo, st)
st, d, _ = get("https://api.github.com/search/repositories?q=college+football+elo+in:name,description&sort=updated&per_page=15")
if st == 200:
    for r in d.get("items", []):
        print("search:", r["full_name"], (r.get("license") or {}).get("spdx_id"), r.get("pushed_at"), "|",
              (r.get("description") or "")[:90])
st, d, _ = get("https://api.github.com/search/repositories?q=college+football+predictions+spread&sort=updated&per_page=15")
if st == 200:
    for r in d.get("items", []):
        print("search2:", r["full_name"], (r.get("license") or {}).get("spdx_id"), r.get("pushed_at"), "|",
              (r.get("description") or "")[:90])
