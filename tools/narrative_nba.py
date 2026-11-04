#!/usr/bin/env python3
"""Narrative model v0 (NBA): picks made the way the experts reason, not a statistical model.

The rules were written from a year of expert free-pick shows: tired teams on a
back-to-back, bounce-back and zigzag spots, stars ruled out, what the line says compared with results so far,
fading a big line move, never laying 12 or more, and pace for totals. The logic is frozen as v0; it went 14-20 on
12 past nights it had never seen, so it is labeled "not proven" and the app never uses it for its own picks.

Each hourly run: reads ESPN's public scoreboard and game summaries (no keys), keeps a small cache of finished games
(live/narrative/games.json: score, overtime, each player's points), makes picks for today's games that haven't
started at the current ESPN line, freezes a pick once its game starts, and grades finals at the frozen line.
Writes live/narrative/nba.json for the app.
"""
import datetime as dt
import json
import os
import time
import urllib.request
from collections import defaultdict
from zoneinfo import ZoneInfo

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "live", "narrative")
GAMES = os.path.join(OUT, "games.json")
PICKS = os.path.join(OUT, "nba.json")
API = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/"
SEASON_START = dt.date(2026, 10, 18)
VERSION = "v0"
# Before going live, the frozen v0 rules were run on past nights it had never seen (lines and injuries as ESPN had
# them before each game, graded at the closing line).
TESTS = [
    {"label": "10 nights from the 2024-25 and 2025-26 seasons", "w": 10, "l": 18, "p": 0},
    {"label": "2 nights from this season, before it went live", "w": 4, "l": 2, "p": 0},
]


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


def teams(c):
    t = {x["homeAway"]: x for x in c["competitors"]}
    return t["home"], t["away"]


def box_points(summary):
    pts = {}
    for tp in summary.get("boxscore", {}).get("players", []):
        ab = tp["team"]["abbreviation"]
        if not tp.get("statistics"):
            continue
        st = tp["statistics"][0]
        i = st.get("names", st.get("labels", [])).index("PTS") if "PTS" in st.get("names", st.get("labels", [])) else 1
        for a in st.get("athletes", []):
            if a.get("didNotPlay") or not a.get("stats"):
                continue
            try:
                pts.setdefault(ab, {})[a["athlete"].get("displayName", "?")] = int(a["stats"][i] or 0)
            except (ValueError, IndexError):
                pass
    return pts


def lines(summary):
    pc = summary.get("pickcenter") or []
    if not pc or "pointSpread" not in pc[0]:
        return None
    ps, tt = pc[0]["pointSpread"]["home"], pc[0]["total"]["over"]
    try:
        return dict(sp=num(ps["close"]["line"]), sp_o=num(ps["open"]["line"]), to=num(tt["close"]["line"]), to_o=num(tt["open"]["line"]),
                    book=(pc[0].get("provider") or {}).get("name"))
    except (KeyError, ValueError, TypeError):
        return None


def model(day, H, A, ln, injuries, hist, ppts):
    """The frozen v0 rules. Returns the picks for one game: [{type, pick, line, score, why_for, why_opp}]."""
    sc = {H: 0.0, A: 0.0}
    why = {H: [], A: []}
    sign = {}  # reason -> its value, to tell which of the opponent's reasons help the pick
    cap = {H: False, A: False}

    def add(tm, v, r):
        sc[tm] += v
        why[tm].append(r)
        sign[(tm, r)] = v

    def stars(tm):
        avg = [(sum(v) / len(v), n) for n, v in ppts[tm].items() if len(v) >= 2]
        return sorted(avg, reverse=True)[:3]

    pd = {}
    for tm, opp, home in ((H, A, True), (A, H, False)):
        h = hist[tm]
        pd[tm] = sum(x["pf"] - x["pa"] for x in h) / len(h) if h else 0
        last = h[-1] if h else None
        if last and (day - last["date"]).days == 1:
            r, v = "Second night of a back-to-back", -1.5
            if not last["home"] and not home:
                r += ", both on the road"
                v -= 0.5
            if last["ot"]:
                r += ", after overtime"
                v -= 0.5
            if abs(last["pf"] - last["pa"]) >= 20:
                r += " (last night was a blowout, so starters may have rested)"
                v += 0.75
            add(tm, v, r)
        if last and last["pf"] - last["pa"] <= -15:
            add(tm, 1.0, f"Bounce-back spot after losing by {last['pa'] - last['pf']}")
        if last and last["opp"] == opp and (day - last["date"]).days <= 3 and last["pf"] < last["pa"]:
            add(tm, 1.5, "Zigzag: lost to this same team in the last three days")
        st = stars(tm)
        for avg, n in st:
            if injuries.get(tm, {}).get(n) == "Out":
                add(tm, -1.5, f"{n} ({avg:.0f} points a game) is out")
                if avg == st[0][0]:
                    cap[tm] = True
        if len(h) >= 5 and sum(x["pf"] > x["pa"] for x in h) <= 1:
            add(tm, -0.5, "Struggling team (one win or fewer)")
    exp_home = 0.5 * (pd[H] - pd[A]) + 2.5
    div = -ln["sp"] - exp_home
    if abs(div) >= 4:
        tm = H if div > 0 else A
        add(tm, 1.5, f"Line tell: the line rates {tm} {abs(div):.1f} points better than results so far")
    if abs(ln["sp"] - ln["sp_o"]) >= 1.5:
        tm = H if ln["sp"] > ln["sp_o"] else A
        o, c = (ln["sp_o"], ln["sp"]) if tm == H else (-ln["sp_o"], -ln["sp"])
        add(tm, 1.0, f"Fade the line move: {tm} went from {o:+g} to {c:+g}")
    fav = H if ln["sp"] < 0 else A
    if abs(ln["sp"]) >= 12:
        cap[fav] = True
        why[fav].append("Never lay 12 or more")
    out = []
    diff = sc[H] - sc[A]
    side = H if diff > 0 else A
    if cap[side] and side == fav:
        side = None
    if side and abs(diff) >= 2:
        opp = A if side == H else H
        out.append(dict(type="side", pick=side, line=ln["sp"] if side == H else -ln["sp"], score=round(abs(diff), 2),
                        why_for=why[side] + [f"{opp}: {w}" for w in why[opp] if sign.get((opp, w), 0) < 0],
                        why_opp=[f"{opp}: {w}" for w in why[opp] if sign.get((opp, w), 0) > 0]))
    ts, tw = 0.0, []
    b2b = [tm for tm in (H, A) if hist[tm] and (day - hist[tm][-1]["date"]).days == 1]
    if len(b2b) == 2:
        ts += 1.5
        tw.append("Both teams on a back-to-back: tired defenses mean points")
    elif len(b2b) == 1:
        ts += 0.5
        tw.append(f"{b2b[0]} on tired legs (back-to-back)")
    avgs = [sum(x["pf"] + x["pa"] for x in hist[tm]) / len(hist[tm]) for tm in (H, A) if hist[tm]]
    if len(avgs) == 2:
        ex = sum(avgs) / 2
        if abs(ex - ln["to"]) >= 6:
            ts += 1.5 if ex > ln["to"] else -1.5
            tw.append(f"Pace: their games average {ex:.0f} points, the total is {ln['to']:g}")
    if abs(ln["to"] - ln["to_o"]) >= 3:
        ts += -1 if ln["to"] > ln["to_o"] else 1
        tw.append(f"{'Fade the inflated' if ln['to'] > ln['to_o'] else 'Buy low on the dropping'} total: {ln['to_o']:g} to {ln['to']:g}")
    if abs(ts) >= 2:
        out.append(dict(type="total", pick="OVER" if ts > 0 else "UNDER", line=ln["to"], score=abs(ts), why_for=tw, why_opp=[]))
    return out


def grade(p, hs, as_):
    if p["type"] == "side":
        v = ((hs - as_) if p["pick"] == p["home"] else (as_ - hs)) + p["line"]
    else:
        v = (hs + as_ - p["line"]) * (1 if p["pick"] == "OVER" else -1)
    return "W" if v > 0 else "L" if v < 0 else "P"


def main():
    os.makedirs(OUT, exist_ok=True)
    cache = load(GAMES, {"games": {}})
    games = cache["games"]
    book = load(PICKS, {"picks": []})
    picks = {f"{p['id']}:{p['type']}": p for p in book.get("picks", [])}
    today = dt.datetime.now(ZoneInfo("America/New_York")).date()
    done = [dt.date.fromisoformat(g["date"]) for g in games.values()]
    start = max(SEASON_START, (max(done) - dt.timedelta(days=2)) if done else SEASON_START)

    slates = {}
    d = start
    while d <= today:
        sb = get(f"{API}scoreboard?dates={d:%Y%m%d}")
        slates[d] = sb.get("events", [])
        for e in slates[d]:
            c = e["competitions"][0]
            if c["status"]["type"]["name"] != "STATUS_FINAL" or e["id"] in games:
                continue
            h, a = teams(c)
            s = get(f"{API}summary?event={e['id']}")
            games[e["id"]] = dict(date=d.isoformat(), H=h["team"]["abbreviation"], A=a["team"]["abbreviation"], hs=int(h["score"]),
                                  as_=int(a["score"]), ot=c["status"].get("period", 4) > 4, pts=box_points(s))
        d += dt.timedelta(days=1)

    def history(before):
        hist, ppts = defaultdict(list), defaultdict(lambda: defaultdict(list))
        for g in sorted(games.values(), key=lambda g: g["date"]):
            gd = dt.date.fromisoformat(g["date"])
            if gd >= before:
                continue
            for tm, op, home, pf, pa in ((g["H"], g["A"], True, g["hs"], g["as_"]), (g["A"], g["H"], False, g["as_"], g["hs"])):
                hist[tm].append(dict(date=gd, opp=op, home=home, pf=pf, pa=pa, ot=g["ot"]))
            for tm, pl in g["pts"].items():
                for n, v in pl.items():
                    ppts[tm][n].append(v)
        return hist, ppts

    # today's games that haven't started: (re)make the picks at the current line
    hist, ppts = history(today)
    for e in slates.get(today, []):
        c = e["competitions"][0]
        if c["status"]["type"]["state"] != "pre":
            continue
        h, a = teams(c)
        H, A = h["team"]["abbreviation"], a["team"]["abbreviation"]
        s = get(f"{API}summary?event={e['id']}")
        ln = lines(s)
        for k in [k for k in picks if k.startswith(e["id"] + ":")]:
            del picks[k]  # not started yet: the pick follows the current line, or drops if the rules no longer fire
        if not ln:
            continue
        inj = {i["team"]["abbreviation"]: {x["athlete"]["displayName"]: x.get("status") for x in i.get("injuries", [])} for i in s.get("injuries", [])}
        for p in model(today, H, A, ln, inj, hist, ppts):
            picks[f"{e['id']}:{p['type']}"] = dict(id=e["id"], date=today.isoformat(), start=e["date"], game=f"{A} @ {H}", home=H, away=A,
                                                    book=ln["book"], result=None, final=None, **p)
    # grade finals at the frozen line
    for p in picks.values():
        g = games.get(p["id"])
        if g and p["result"] is None:
            p["result"] = grade(p, g["hs"], g["as_"])
            p["final"] = f"{g['A']} {g['as_']}, {g['H']} {g['hs']}"

    allp = sorted(picks.values(), key=lambda p: (p["date"], p["start"], p["type"]), reverse=True)
    with open(GAMES, "w") as f:
        json.dump(cache, f, separators=(",", ":"))
    with open(PICKS, "w") as f:
        json.dump(dict(model=f"Narrative model {VERSION}", updated=dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
                       live_since="2026-11-04", tests=TESTS, picks=allp), f, indent=1)
    graded = [p for p in allp if p["result"]]
    print(f"narrative: {len(allp)} picks, {sum(p['result'] == 'W' for p in graded)}-{sum(p['result'] == 'L' for p in graded)}, "
          f"{len(allp) - len(graded)} open; {len(games)} finals cached")


if __name__ == "__main__":
    main()
