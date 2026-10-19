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


def raw(repo, path, n=None):
    with urllib.request.urlopen(f"https://raw.githubusercontent.com/{repo}/main/{path}", timeout=60) as r:
        return r.read(n).decode(errors="replace") if n else r.read().decode(errors="replace")


if os.environ.get("PROBE", "detail") == "detail":    # third pass: how the two live CFB Elo repos publish (no CFBD calls)
    import re
    t = raw("brandon-keck/cfb-rankings", "README.md")
    print("cfb-rankings README:", " ".join(t.split())[:4000])
    st, tr, _ = get("https://api.github.com/repos/brandon-keck/cfb-rankings/git/trees/main?recursive=1")
    print("files:", [x["path"] for x in tr.get("tree", []) if x["type"] == "blob"])
    for f in [x["path"] for x in tr.get("tree", []) if x["path"].endswith(".py")][:12]:
        src = raw("brandon-keck/cfb-rankings", f)
        hits = [l.strip() for l in src.splitlines() if re.search(r"(?i)home|hfa|k_factor|K =|400|neutral|predict", l)]
        print("  ", f, "->", hits[:14])
    w = raw("brandon-keck/cfb-rankings", "data/elo_full_field_weekly.csv").splitlines()
    print("weekly rows", len(w), "last:", w[-3:], "| 2026 rows:", sum(1 for l in w if l.startswith("2026,")))
    print("weeks 2026:", sorted({int(l.split(",")[1]) for l in w if l.startswith("2026,")}))
    hp = raw("schwill2018/college-football-elo", "historical_predictions.csv").splitlines()
    print("schwill historical_predictions:", hp[0][:600])
    print("   rows", len(hp), "last:", [l[:300] for l in hp[-2:]])
    t = raw("schwill2018/college-football-elo", "README.md")
    print("schwill README:", " ".join(t.split())[:2500])
    for f in ["collegefootballdata.com/terms", "collegefootballdata.com/api-tiers"]:
        try:
            with urllib.request.urlopen(urllib.request.Request("https://" + f, headers={"User-Agent": "Mozilla/5.0"}), timeout=30) as r:
                h = r.read().decode(errors="replace")
            txt = re.sub(r"<[^>]+>", " ", re.sub(r"(?s)<(script|style).*?</\1>", " ", h))
            print(f, ":", " ".join(txt.split())[:5000])
        except Exception as e:
            print(f, "error", e)
    raise SystemExit(0)

MODE = os.environ.get("PROBE", "repos")
if MODE == "repos":                             # second pass: no CFBD calls, only what the open repos publish
    for repo in ["MellowMindedMateo/papers-pick-bot", "brandon-keck/cfb-rankings", "collierjc75/ncaaf-predictions",
                 "sdisorbo/samalytics-ncaaf", "Engy-22/CFB-Point-Spread-Model", "JasonDoug/SaturdaySlate",
                 "schwill2018/college-football-elo", "sportsdataverse/cfbfastR"]:
        st, d, _ = get(f"https://api.github.com/repos/{repo}")
        if st != 200:
            print(repo, st); continue
        br = d.get("default_branch")
        st, t, _ = get(f"https://api.github.com/repos/{repo}/git/trees/{br}?recursive=1")
        files = [x["path"] for x in (t.get("tree") or []) if x["type"] == "blob"] if st == 200 else []
        lic = [f for f in files if f.upper().startswith(("LICENSE", "LICENCE", "COPYING"))]
        data = [f for f in files if f.lower().endswith((".csv", ".json", ".parquet")) and
                any(w in f.lower() for w in ("pred", "pick", "rating", "elo", "forecast", "spread", "rank"))]
        print(f"== {repo} branch={br} license={(d.get('license') or {}).get('spdx_id')} files={len(files)} "
              f"pushed={d.get('pushed_at')} stars={d.get('stargazers_count')}")
        print("   license files:", lic, "| workflows:", [f for f in files if f.startswith(".github/workflows")][:6])
        print("   data files:", data[:25])
        for f in lic[:1]:
            st, raw, _ = get(f"https://raw.githubusercontent.com/{repo}/{br}/{f}") if False else (None, None, None)
        readme = next((f for f in files if f.lower() == "readme.md"), None)
        if readme:
            try:
                with urllib.request.urlopen(f"https://raw.githubusercontent.com/{repo}/{br}/{readme}", timeout=30) as r:
                    txt = r.read().decode(errors="replace")
                print("   README:", " ".join(txt.split())[:700])
            except Exception as e:
                print("   README error", e)
        for f in data[:3]:
            try:
                with urllib.request.urlopen(f"https://raw.githubusercontent.com/{repo}/{br}/{f}", timeout=30) as r:
                    head = r.read(600).decode(errors="replace")
                print(f"   head {f}:", head.replace(chr(10), " / ")[:500])
            except Exception as e:
                print("   head error", f, e)
    raise SystemExit(0)

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
