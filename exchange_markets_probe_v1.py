#!/usr/bin/env python3
"""
exchange_markets_probe_v1.py -- one-off, read-only look at what Kalshi and Polymarket list for
NFL / NBA / MLB right now: how many games, which market types, and whether player props exist.

* Public endpoints only. NO keys, NO account, NO trading endpoints. Nothing is bet.
* Polite: small page sizes, a pause between calls, backoff on HTTP 429, hard caps on pages.
* Output: odds_probe/exchange_markets_probe.json (full sample) and odds_probe/exchange_markets_probe.md
  (short summary for a person). Run from the repo root (see .github/workflows/exchange_markets_probe.yml).
"""
import json, os, re, sys, time, urllib.parse, urllib.request, urllib.error
from datetime import datetime, timezone

KALSHI_BASES = ["https://api.elections.kalshi.com/trade-api/v2", "https://external-api.kalshi.com/trade-api/v2"]
POLY_BASE = "https://gamma-api.polymarket.com"
UA = "exchange-markets-probe/1.0 (personal research; read-only)"
PAUSE = 0.35
OUT_DIR = "odds_probe"
LEAGUES = {
    "NFL": re.compile(r"\b(nfl|pro football)\b", re.I),
    "NBA": re.compile(r"\b(nba|pro basketball)\b", re.I),
    "MLB": re.compile(r"\b(mlb|pro baseball|world series)\b", re.I),
}
PROP_WORDS = re.compile(
    r"(passing|rushing|receiving|reception|yards|yds|touchdown|\btd\b|interception|sacks?|"
    r"points|rebounds|assists|three|3-pointers|double-double|triple-double|"
    r"strikeouts|home run|hits\b|total bases|rbi|player)", re.I)
GAME_WORDS = re.compile(r"(\bvs\.?\b|\bat\b|@|winner|win the game|spread|total)", re.I)
log = []


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
            log.append(f"HTTP {e.code} {url[:160]}")
            return None
        except Exception as e:  # network / JSON
            if i < tries - 1:
                time.sleep(2 ** i); continue
            log.append(f"ERR {type(e).__name__} {url[:160]}")
            return None


def league_of(*texts):
    t = " ".join(str(x or "") for x in texts)
    for lg, rx in LEAGUES.items():
        if rx.search(t):
            return lg
    return None


def kind_of(text):
    t = str(text or "")
    if PROP_WORDS.search(t):
        return "player_prop_or_stat"
    if GAME_WORDS.search(t):
        return "game_line"
    return "other"


# ------------------------------------------------------------------ Kalshi
def probe_kalshi():
    res = {"base": None, "series_found": [], "leagues": {}, "notes": []}
    base, series = None, None
    for b in KALSHI_BASES:
        d = get(f"{b}/series", {"category": "Sports"})
        if d is not None:
            base, series = b, d.get("series") or []
            break
    if base is None:
        res["notes"].append("Kalshi public API unreachable from this runner")
        return res
    res["base"] = base
    picked = []
    for s in series:
        lg = league_of(s.get("title"), s.get("ticker"), " ".join(s.get("tags") or []))
        if lg:
            picked.append((lg, s))
    res["series_total_sports"] = len(series)
    for lg, s in picked[:120]:  # cap
        tk = s.get("ticker")
        res["series_found"].append({"league": lg, "ticker": tk, "title": s.get("title")})
        cursor, pages = None, 0
        while pages < 3:
            d = get(f"{base}/events", {"series_ticker": tk, "status": "open", "with_nested_markets": "true",
                                       "limit": 100, "cursor": cursor})
            pages += 1
            if not d:
                break
            for ev in d.get("events") or []:
                L = res["leagues"].setdefault(lg, {"events": 0, "markets": 0, "kinds": {}, "series": {}, "samples": []})
                L["events"] += 1
                L["series"][tk] = s.get("title")
                for m in ev.get("markets") or []:
                    k = kind_of(" ".join(str(m.get(x) or "") for x in ("title", "subtitle", "yes_sub_title")) + " " + str(s.get("title")))
                    L["markets"] += 1
                    L["kinds"][k] = L["kinds"].get(k, 0) + 1
                    if len(L["samples"]) < 40 and (k == "player_prop_or_stat" or len(L["samples"]) < 15):
                        L["samples"].append({"kind": k, "event": ev.get("title"), "market": m.get("title"),
                                             "yes": m.get("yes_sub_title"), "yes_bid": m.get("yes_bid"), "yes_ask": m.get("yes_ask"),
                                             "last_price": m.get("last_price"), "volume": m.get("volume"),
                                             "close_time": m.get("close_time"), "ticker": m.get("ticker")})
            cursor = d.get("cursor")
            if not cursor:
                break
    return res


# ------------------------------------------------------------------ Polymarket
def probe_polymarket():
    res = {"base": POLY_BASE, "leagues": {}, "notes": []}
    sports = get(f"{POLY_BASE}/sports")
    if sports is None:
        res["notes"].append("Polymarket Gamma API unreachable from this runner")
        return res
    if isinstance(sports, dict):
        sports = sports.get("data") or sports.get("sports") or []
    tag_ids = {}
    for sp in sports:
        lg = league_of(sp.get("sport"), sp.get("label"), sp.get("name"))
        if not lg or str(sp.get("sport", "")).lower() not in ("nfl", "nba", "mlb"):
            continue
        tags = [t.strip() for t in str(sp.get("tags") or "").split(",") if t.strip()]
        tag_ids.setdefault(lg, [])
        for t in tags:
            if t not in tag_ids[lg] and t != "1":  # tag 1 is the generic "Sports" tag
                tag_ids[lg].append(t)
    res["tag_ids"] = tag_ids
    for lg, tags in tag_ids.items():
        seen = set()
        L = res["leagues"].setdefault(lg, {"events": 0, "markets": 0, "kinds": {}, "prop_events": 0, "samples": []})
        for tag in tags[:3]:
            for page in range(4):
                d = get(f"{POLY_BASE}/events", {"tag_id": tag, "closed": "false", "active": "true",
                                                "limit": 100, "offset": page * 100})
                if not d:
                    break
                evs = d if isinstance(d, list) else d.get("data") or d.get("events") or []
                if not evs:
                    break
                for ev in evs:
                    eid = ev.get("id")
                    if eid in seen:
                        continue
                    seen.add(eid)
                    L["events"] += 1
                    slug = str(ev.get("slug") or "")
                    is_prop_ev = slug.endswith("-player-props") or "player prop" in str(ev.get("title", "")).lower()
                    if is_prop_ev:
                        L["prop_events"] += 1
                    for m in ev.get("markets") or []:
                        q = m.get("question") or m.get("title") or ""
                        k = "player_prop_or_stat" if is_prop_ev else kind_of(q + " " + str(m.get("sportsMarketType") or ""))
                        L["markets"] += 1
                        L["kinds"][k] = L["kinds"].get(k, 0) + 1
                        if len(L["samples"]) < 40 and (k == "player_prop_or_stat" or len(L["samples"]) < 15):
                            L["samples"].append({"kind": k, "event": ev.get("title"), "event_slug": slug, "market": q,
                                                 "outcomes": m.get("outcomes"), "prices": m.get("outcomePrices"),
                                                 "liquidity": m.get("liquidity"), "volume": m.get("volume"),
                                                 "end": m.get("endDate") or ev.get("endDate")})
                if len(evs) < 100:
                    break
    return res


def summary_md(out):
    lines = [f"# Exchange markets probe ({out['generated_at']})", "",
             "Read-only snapshot of open NFL/NBA/MLB markets on Kalshi and Polymarket public APIs. No keys, nothing bet.", ""]
    for src in ("kalshi", "polymarket"):
        r = out[src]
        lines.append(f"## {src.title()}")
        if r.get("notes"):
            lines += [f"- note: {n}" for n in r["notes"]]
        for lg, L in sorted(r.get("leagues", {}).items()):
            kinds = ", ".join(f"{k} {v}" for k, v in sorted(L["kinds"].items()))
            extra = f", player-prop events {L['prop_events']}" if "prop_events" in L else ""
            lines.append(f"- **{lg}**: {L['events']} open events, {L['markets']} markets ({kinds}){extra}")
            for s in [x for x in L["samples"] if x["kind"] == "player_prop_or_stat"][:5]:
                lines.append(f"  - prop sample: {s.get('event')} -- {s.get('market')}")
        if not r.get("leagues"):
            lines.append("- no NFL/NBA/MLB markets found")
        lines.append("")
    if out["errors"]:
        lines += ["## Errors", *[f"- {e}" for e in out["errors"][:30]]]
    return "\n".join(lines) + "\n"


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    out = {"generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
           "kalshi": probe_kalshi(), "polymarket": probe_polymarket()}
    out["errors"] = log
    with open(os.path.join(OUT_DIR, "exchange_markets_probe.json"), "w") as f:
        json.dump(out, f, indent=1, default=str)
    md = summary_md(out)
    with open(os.path.join(OUT_DIR, "exchange_markets_probe.md"), "w") as f:
        f.write(md)
    print(md)
    return 0


if __name__ == "__main__":
    sys.exit(main())
