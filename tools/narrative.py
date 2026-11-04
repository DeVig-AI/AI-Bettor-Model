#!/usr/bin/env python3
"""Narrative model: picks made the way the experts reason, not a statistical model. NBA, NHL, NFL, CFB, CBB.

The reasoning came from a year of expert free-pick shows: tired teams (back-to-backs, short weeks), bounce-back spots,
zigzags, key players ruled out, struggling teams, what the line says compared with results so far, fading a big line
move, never laying a huge number, and pace for totals. NBA uses the frozen v0 rules exactly as tested (14-20 on 12
nights it had never seen). The other sports use the same reasoning with each sport's own sizes (a blowout in hockey
is 3 goals, in college football 21 points) and are new and untested. All of it is labeled "not proven" and the app
never uses it for its own picks.

Each hourly run per sport: reads ESPN's public scoreboard and game summaries (no keys), keeps a small cache of finished
games, makes picks for today's games that haven't started at the current ESPN line, freezes a pick once its game
starts, and grades finals at the frozen line. Writes live/narrative/<sport>.json for the app.
ESPN's college data is never committed (Constitution E1): CFB and CBB caches live in .cache/narrative/ (Actions cache).
"""
import datetime as dt
import json
import os
import sys
import time
import urllib.request
from collections import defaultdict
from zoneinfo import ZoneInfo

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "live", "narrative")
PRIVATE = os.path.join(ROOT, ".cache", "narrative")
API = "https://site.api.espn.com/apis/site/v2/sports/"
LIVE_SINCE = "2026-11-04"

# kind: how sides are bet (spread, or moneyline for hockey). key: which players count as the ones that matter
# (None = skip: ESPN has no college injury reports). home: home edge in points/goals. blow: a blowout loss. cap: never
# lay this many points (or, for moneylines, this chance). gap: the totals pace gap. move/tmove: a big line/total move.
SPORTS = {
    "NBA": dict(path="basketball/nba", q="", start="2026-10-18", kind="spread", key="pts", home=2.5, blow=15, cap=12,
                gap=6, move=1.5, tmove=3, b2b=True, zig=True, rest=False, min_games=0, cache=os.path.join(OUT, "games.json"),
                tests=[{"label": "10 nights from the 2024-25 and 2025-26 seasons", "w": 10, "l": 18, "p": 0},
                       {"label": "2 nights from this season, before it went live", "w": 4, "l": 2, "p": 0}]),
    "NHL": dict(path="hockey/nhl", q="", start="2026-10-06", kind="ml", key="hockey", home=0.2, blow=3, cap=0.72,
                gap=0.75, move=0.04, tmove=0.5, b2b=True, zig=True, rest=False, min_games=3,
                cache=os.path.join(OUT, "nhl_games.json"), tests=[]),
    "NFL": dict(path="football/nfl", q="", start="2026-09-09", kind="spread", key="qb", home=1.5, blow=17, cap=10,
                gap=4, move=1.5, tmove=2, b2b=False, zig=False, rest=True, min_games=3,
                cache=os.path.join(OUT, "nfl_games.json"), tests=[]),
    "CFB": dict(path="football/college-football", q="&groups=80&limit=400", start="2026-08-27", kind="spread", key=None,
                home=2.5, blow=21, cap=21, gap=7, move=2, tmove=3, b2b=False, zig=False, rest=True, min_games=3,
                cache=os.path.join(PRIVATE, "cfb_games.json"), tests=[]),
    "CBB": dict(path="basketball/mens-college-basketball", q="&groups=50&limit=400", start="2026-11-02", kind="spread",
                key=None, home=3, blow=15, cap=15, gap=6, move=2, tmove=3, b2b=True, zig=False, rest=False, min_games=3,
                cache=os.path.join(PRIVATE, "cbb_games.json"), tests=[]),
}
UNIT = {"NBA": "points", "NFL": "points", "CFB": "points", "CBB": "points", "NHL": "goals"}


def get(url, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "devig-narrative"}), timeout=20) as r:
                return json.load(r)
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(2 * (i + 1))


def load(path, empty):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return empty


def num(x):
    return float(str(x).replace("o", "").replace("u", "").replace("+", ""))


def implied(o):
    o = num(o)
    return 100 / (o + 100) if o > 0 else -o / (-o + 100)


def teams(c):
    t = {x["homeAway"]: x for x in c["competitors"]}
    return t["home"], t["away"]


def box(summary, key):
    """Per team id: {player: value} for the players that matter (points; hockey goals+assists; QB pass attempts)."""
    out = {}
    for tp in summary.get("boxscore", {}).get("players", []):
        tid = str(tp["team"]["id"])
        for st in tp.get("statistics", []):
            lab = st.get("names") or st.get("labels") or []
            if key == "pts":
                if "PTS" not in lab:
                    continue
                f = lambda s: int(s[lab.index("PTS")] or 0)
            elif key == "hockey":
                if "G" not in lab or "A" not in lab:
                    continue
                f = lambda s: int(s[lab.index("G")] or 0) + int(s[lab.index("A")] or 0)
            else:  # qb
                if st.get("name") != "passing" or "C/ATT" not in lab:
                    continue
                f = lambda s: int(str(s[lab.index("C/ATT")]).split("/")[1] or 0)
            for a in st.get("athletes", []):
                if a.get("didNotPlay") or not a.get("stats"):
                    continue
                try:
                    out.setdefault(tid, {})[a["athlete"].get("displayName", "?")] = f(a["stats"])
                except (ValueError, IndexError):
                    pass
    return out


def lines(summary):
    pc = summary.get("pickcenter") or []
    if not pc or "pointSpread" not in pc[0] or "total" not in pc[0]:
        return None
    ps, tt, ml = pc[0]["pointSpread"]["home"], pc[0]["total"]["over"], pc[0].get("moneyline") or {}
    try:
        ln = dict(sp=num(ps["close"]["line"]), sp_o=num(ps["open"]["line"]), to=num(tt["close"]["line"]), to_o=num(tt["open"]["line"]),
                  book=(pc[0].get("provider") or {}).get("name"))
    except (KeyError, ValueError, TypeError):
        return None
    try:
        ln.update(ml_h=num(ml["home"]["close"]["odds"]), ml_a=num(ml["away"]["close"]["odds"]),
                  ph=implied(ml["home"]["close"]["odds"]), ph_o=implied(ml["home"]["open"]["odds"]))
    except (KeyError, ValueError, TypeError):
        pass
    return ln


def model(S, sport, day, H, A, ab, ln, injuries, hist, ppts, neutral, read=None):
    """The rules for one game. Returns [{type, pick, line, score, why_for, why_opp}]. For NBA this is v0, unchanged.
    `read`, if given, is filled with the lean on the side and the total even when neither clears the bar for a pick."""
    read = {} if read is None else read
    sc = {H: 0.0, A: 0.0}
    why = {H: [], A: []}
    sign = {}
    cap = {H: False, A: False}
    u = UNIT[sport]

    def add(tm, v, r):
        sc[tm] += v
        why[tm].append(r)
        sign[(tm, r)] = v

    def stars(tm):
        avg = [(sum(v) / len(v), n) for n, v in ppts[tm].items() if len(v) >= 2]
        return sorted(avg, reverse=True)[:1 if S["key"] == "qb" else 2 if S["key"] == "hockey" else 3]

    pd = {}
    for tm, opp, home in ((H, A, True), (A, H, False)):
        h = hist[tm]
        pd[tm] = sum(x["pf"] - x["pa"] for x in h) / len(h) if h else 0
        last = h[-1] if h else None
        gap = (day - last["date"]).days if last else None
        if S["b2b"] and last and gap == 1:
            r, v = "Second night of a back-to-back", -1.5
            if not last["home"] and not home:
                r += ", both on the road"
                v -= 0.5
            if last["ot"]:
                r += ", after overtime"
                v -= 0.5
            if abs(last["pf"] - last["pa"]) >= S["blow"] + (2 if sport == "NHL" else 5):  # NBA: 20
                r += " (last night was a blowout, so starters may have rested)"
                v += 0.75
            add(tm, v, r)
        if S["rest"] and last and gap <= 5:
            add(tm, -1.0, f"Short week: {gap} days since its last game")
        if S["rest"] and last and 12 <= gap <= 20:
            add(tm, 1.0, "Coming off a bye week, rested and with extra time to prepare")
        if last and last["pf"] - last["pa"] <= -S["blow"]:
            add(tm, 1.0, f"Bounce-back spot after losing by {last['pa'] - last['pf']}")
        if S["zig"] and last and last["opp"] == opp and gap <= 3 and last["pf"] < last["pa"]:
            add(tm, 1.5, "Zigzag: lost to this same team in the last three days")
        if S["key"]:
            st = stars(tm)
            for avg, n in st:
                if injuries.get(tm, {}).get(n) == "Out":
                    if S["key"] == "qb":
                        add(tm, -2.0, f"Starting quarterback {n} is out")
                    else:
                        add(tm, -1.5, f"{n} ({avg:.1f} points a game) is out" if S["key"] == "hockey" else f"{n} ({avg:.0f} points a game) is out")
                    if avg == st[0][0]:
                        cap[tm] = True
        if len(h) >= 5 and sum(x["pf"] > x["pa"] for x in h) <= 1:
            add(tm, -0.5, "Struggling team (one win or fewer)")
    enough = all(len(hist[t]) >= S["min_games"] for t in (H, A))
    out = []
    if S["kind"] == "spread":
        if enough:
            exp_home = 0.5 * (pd[H] - pd[A]) + (0 if neutral else S["home"])
            div = -ln["sp"] - exp_home
            if abs(div) >= 4 * (S["blow"] / 15 if sport in ("NFL", "CFB") else 1):
                tm = H if div > 0 else A
                add(tm, 1.5, f"Line tell: the line rates {ab[tm]} {abs(div):.1f} points better than results so far")
        if abs(ln["sp"] - ln["sp_o"]) >= S["move"]:
            tm = H if ln["sp"] > ln["sp_o"] else A
            o, c = (ln["sp_o"], ln["sp"]) if tm == H else (-ln["sp_o"], -ln["sp"])
            add(tm, 1.0, f"Fade the line move: {ab[tm]} went from {o:+g} to {c:+g}")
        fav = H if ln["sp"] < 0 else A
        if abs(ln["sp"]) >= S["cap"]:
            cap[fav] = True
            why[fav].append(f"Never lay {S['cap']:g} or more")
    else:  # moneyline (hockey)
        if "ph" not in ln:
            return []
        fav = H if ln["ph"] >= 0.5 else A
        dog = A if fav == H else H
        if enough and pd[fav] <= pd[dog] - 0.5:
            add(fav, 1.5, f"Line tell: the price makes {ab[fav]} the favorite though {ab[dog]} has the better goal difference")
        if abs(ln["ph"] - ln["ph_o"]) >= S["move"]:
            tm = A if ln["ph"] > ln["ph_o"] else H
            add(tm, 1.0, f"Fade the line move: the price moved {abs(ln['ph'] - ln['ph_o']) * 100:.0f} points of chance away from {ab[tm]}")
        if max(ln["ph"], 1 - ln["ph"]) >= S["cap"]:
            cap[fav] = True
            why[fav].append("Never lay a price this big")
    diff = sc[H] - sc[A]
    side = H if diff > 0 else A
    lo = A if side == H else H
    read["side"] = dict(lean=ab[side] if diff else None, score=round(abs(diff), 2), capped=bool(cap[side] and side == fav),
                        why_for=why[side] + [f"{ab[lo]}: {w}" for w in why[lo] if sign.get((lo, w), 0) < 0],
                        why_opp=[f"{ab[lo]}: {w}" for w in why[lo] if sign.get((lo, w), 0) > 0])
    if cap[side] and side == fav:
        side = None
    if side and abs(diff) >= 2:
        opp = A if side == H else H
        if S["kind"] == "spread":
            line = ln["sp"] if side == H else -ln["sp"]
        else:
            line = ln["ml_h"] if side == H else ln["ml_a"]
        out.append(dict(type="side", pick=ab[side], line=line, score=round(abs(diff), 2),
                        why_for=why[side] + [f"{ab[opp]}: {w}" for w in why[opp] if sign.get((opp, w), 0) < 0],
                        why_opp=[f"{ab[opp]}: {w}" for w in why[opp] if sign.get((opp, w), 0) > 0]))
    ts, tw = 0.0, []
    if S["b2b"]:
        b2b = [tm for tm in (H, A) if hist[tm] and (day - hist[tm][-1]["date"]).days == 1]
        if len(b2b) == 2:
            ts += 1.5
            tw.append("Both teams on a back-to-back: tired defenses mean points" if u == "points" else "Both teams on a back-to-back: tired legs and goalies mean goals")
        elif len(b2b) == 1:
            ts += 0.5
            tw.append(f"{ab[b2b[0]]} on tired legs (back-to-back)")
    ts_pace = 0
    if enough and hist[H] and hist[A]:
        ex = sum(sum(x["pf"] + x["pa"] for x in hist[tm]) / len(hist[tm]) for tm in (H, A)) / 2
        if abs(ex - ln["to"]) >= S["gap"]:
            ts_pace = 1.5 if ex > ln["to"] else -1.5
            ts += ts_pace
            tw.append(f"Pace: their games average {ex:.1f} {u}, the total is {ln['to']:g}" if u == "goals" else f"Pace: their games average {ex:.0f} points, the total is {ln['to']:g}")
    if abs(ln["to"] - ln["to_o"]) >= S["tmove"]:
        ts += -1 if ln["to"] > ln["to_o"] else 1
        tw.append(f"{'Fade the inflated' if ln['to'] > ln['to_o'] else 'Buy low on the dropping'} total: {ln['to_o']:g} to {ln['to']:g}")
    # each total reason's direction, for the read: pace is +-1.5, the move fade is -+1, back-to-backs always push over
    tv = [(w, -1 if w.startswith("Fade the inflated") or (w.startswith("Pace") and ts_pace < 0) else 1) for w in tw]
    tl = (1 if ts > 0 else -1) if ts else 0
    read["total"] = dict(lean=("OVER" if ts > 0 else "UNDER") if ts else None, line=ln["to"], score=round(abs(ts), 2),
                         why_for=[w for w, v in tv if v == tl], why_opp=[w for w, v in tv if v != tl])
    if abs(ts) >= 2:
        out.append(dict(type="total", pick="OVER" if ts > 0 else "UNDER", line=ln["to"], score=abs(ts), why_for=tw, why_opp=[]))
    return out


def grade(p, hs, as_, kind):
    if p["type"] == "side":
        m = (hs - as_) if p["pick"] == p["home"] else (as_ - hs)
        v = m if kind == "ml" else m + p["line"]
    else:
        v = (hs + as_ - p["line"]) * (1 if p["pick"] == "OVER" else -1)
    return "W" if v > 0 else "L" if v < 0 else "P"


def run(sport):
    S = SPORTS[sport]
    base = API + S["path"] + "/"
    os.makedirs(os.path.dirname(S["cache"]), exist_ok=True)
    cache = load(S["cache"], {"games": {}})
    games = cache["games"]
    out_path = os.path.join(OUT, f"{sport.lower()}.json")
    prev = load(out_path, {"picks": []})
    picks = {f"{p['id']}:{p['type']}": p for p in prev.get("picks", [])}
    # what the model read on each game, pick or not, so the sheet can say "leans X" on a pass; kept 2 days
    reads = {r["id"]: r for r in prev.get("reads", [])}
    today = dt.datetime.now(ZoneInfo("America/New_York")).date()
    done = [dt.date.fromisoformat(g["date"]) for g in games.values()]
    start = max(dt.date.fromisoformat(S["start"]), (max(done) - dt.timedelta(days=2)) if done else dt.date.fromisoformat(S["start"]))

    slates = {}
    d = start
    while d <= today:
        slates[d] = get(f"{base}scoreboard?dates={d:%Y%m%d}{S['q']}").get("events", [])
        for e in slates[d]:
            c = e["competitions"][0]
            if c["status"]["type"]["name"] != "STATUS_FINAL" or e["id"] in games:
                continue
            h, a = teams(c)
            pts = box(get(f"{base}summary?event={e['id']}"), S["key"]) if S["key"] else {}
            # key by ESPN team id (college codes aren't unique); the NBA's old cache keyed by code, both work the same
            games[e["id"]] = dict(date=d.isoformat(), H=str(h["team"]["id"]), A=str(a["team"]["id"]), hs=int(h["score"]),
                                  as_=int(a["score"]), ot=c["status"].get("period", 4) > (3 if sport == "NHL" else 4), pts=pts)
        d += dt.timedelta(days=1)

    hist, ppts = defaultdict(list), defaultdict(lambda: defaultdict(list))
    for g in sorted(games.values(), key=lambda g: g["date"]):
        gd = dt.date.fromisoformat(g["date"])
        if gd >= today:
            continue
        for tm, op, home, pf, pa in ((g["H"], g["A"], True, g["hs"], g["as_"]), (g["A"], g["H"], False, g["as_"], g["hs"])):
            hist[tm].append(dict(date=gd, opp=op, home=home, pf=pf, pa=pa, ot=g["ot"]))
        for tm, pl in g["pts"].items():
            for n, v in pl.items():
                ppts[tm][n].append(v)

    for e in slates.get(today, []):
        c = e["competitions"][0]
        if c["status"]["type"]["state"] != "pre":
            continue
        h, a = teams(c)
        H, A = str(h["team"]["id"]), str(a["team"]["id"])
        for k in [k for k in picks if k.startswith(e["id"] + ":")]:
            del picks[k]  # not started yet: the pick follows the current line, or drops if the rules no longer fire
        ab = {H: h["team"]["abbreviation"], A: a["team"]["abbreviation"]}
        rd = dict(id=e["id"], date=today.isoformat(), start=e["date"], game=f"{ab[A]} @ {ab[H]}", home=ab[H], away=ab[A],
                  home_id=H, away_id=A, note=None)
        reads[e["id"]] = rd
        if not all(len(hist[t]) >= max(1, S["min_games"]) for t in (H, A)) and sport != "NBA":
            rd["note"] = f"Waits until both teams have played {S['min_games']} games"
            continue
        s = get(f"{base}summary?event={e['id']}")
        ln = lines(s)
        if not ln:
            rd["note"] = "No line posted yet"
            continue
        inj = {str(i["team"]["id"]): {x["athlete"]["displayName"]: x.get("status") for x in i.get("injuries", [])} for i in s.get("injuries", [])}
        for p in model(S, sport, today, H, A, ab, ln, inj, hist, ppts, bool(c.get("neutralSite")), rd):
            picks[f"{e['id']}:{p['type']}"] = dict(id=e["id"], date=today.isoformat(), start=e["date"], game=f"{ab[A]} @ {ab[H]}",
                                                    home=ab[H], away=ab[A], home_id=H, away_id=A, book=ln["book"],
                                                    result=None, final=None, **p)
    for p in picks.values():
        g = games.get(p["id"])
        if g and p["result"] is None:
            p["result"] = grade(p, g["hs"], g["as_"], S["kind"] if p["type"] == "side" else "spread")
            p["final"] = f"{p['away']} {g['as_']}, {p['home']} {g['hs']}"

    allp = sorted(picks.values(), key=lambda p: (p["date"], p["start"], p["type"]), reverse=True)
    with open(S["cache"], "w") as f:
        json.dump(cache, f, separators=(",", ":"))
    with open(out_path, "w") as f:
        json.dump(dict(model="Narrative model", sport=sport, version="v0", kind=S["kind"], tested=bool(S["tests"]),
                       updated=dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), live_since=LIVE_SINCE,
                       tests=S["tests"], picks=allp,
                       reads=sorted((r for r in reads.values() if r["date"] >= (today - dt.timedelta(days=2)).isoformat()),
                                    key=lambda r: r["start"], reverse=True)), f, indent=1)
    graded = [p for p in allp if p["result"]]
    print(f"narrative {sport}: {len(allp)} picks, {sum(p['result'] == 'W' for p in graded)}-{sum(p['result'] == 'L' for p in graded)}, "
          f"{len(allp) - len(graded)} open; {len(games)} finals cached")


def main():
    os.makedirs(OUT, exist_ok=True)
    bad = 0
    for sport in sys.argv[1:] or SPORTS:
        try:
            run(sport)
        except Exception as e:  # one sport failing never stops the others
            bad += 1
            print(f"narrative {sport}: failed: {e!r}")
    sys.exit(1 if bad == len(sys.argv[1:] or SPORTS) else 0)


if __name__ == "__main__":
    main()
