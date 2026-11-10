#!/usr/bin/env python3
"""
stats_cbb.py -- the Research section's men's college basketball files (Division I): DeVig's power rankings and team
stats with league ranks (record, scoring, home and road, last 10, streak) and each team's games, from ESPN's public
daily scoreboards. Display only: nothing here feeds a model, a pick or a test. Teams only for now (no players).

THIS SEASON ONLY. The Research Lab Constitution (Part E) seals the 2026 season (2025-26) for the CBB chamber, so
nothing from it or earlier is fetched or written: no last-season column, and the power rating has no prior.

A finished day's scoreboard never changes, so it is fetched once and kept in the cache folder (the workflow keeps
that folder in the private Actions cache); a run fetches only the days since.

Output (stats/cbb/): index.json and team_<KEY>.json, the college football files' layout (tools/stats_cfb.py), keyed by
ESPN's team abbreviation, as the app's college games are. Run by .github/workflows/stats.yml.
"""
import json
import os
import re
import sys
import tempfile
import time
import urllib.request
from datetime import date, datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import stats_common as S  # noqa: E402

OUT = os.path.join(os.path.dirname(__file__), "..", "stats", "cbb")
ESPN = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/"
UA = "DeVig research stats (github.com/DeVig-AI/AI-Bettor-Model)"
SEALED = 2026                                   # ESPN's season year (2026 = 2025-26): the lab's sealed exam season
CONFIG = {
    "rating_unit": "points",
    "rank_low": ["oppg"], "rank_skip": [],
    "search_cols": [],
    "team_rows": [["Record", "record"], ["Points per game", "ppg", 1], ["Allowed per game", "oppg", 1],
                  ["Average margin", "margin", 1, True], ["Home", "home"], ["Away", "away"], ["Neutral", "neutral"],
                  ["Last 10", "last10"], ["Streak", "streak"]],
    "roster_cols": [], "player_cols": [], "log_show": [], "hit_stats": [],
}


def season_of(now):
    """ESPN's season year: the year the season ends (games from November 2026 are the 2027 season)."""
    return now.year + 1 if now.month >= 10 else now.year


def key_of(code):
    """A team's file key: its ESPN abbreviation with anything but letters and digits as '_'."""
    return re.sub(r"[^A-Z0-9]", "_", str(code).upper())


def num(v):
    try:
        f = float(str(v).replace(",", ""))
    except (TypeError, ValueError):
        return 0.0
    return f if f == f else 0.0


class Espn:
    """GETs ESPN JSON; a day's scoreboard is kept in `cache` once every game on it is final."""

    def __init__(self, cache, fetch=None, pause=0.25):
        self.cache, self.pause, self.calls = cache, pause, 0
        self._fetch = fetch or self._http
        os.makedirs(os.path.join(cache, "day"), exist_ok=True)

    def _http(self, url):
        for i in range(4):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
                with urllib.request.urlopen(req, timeout=30) as r:
                    return json.loads(r.read().decode("utf-8"))
            except Exception as e:                  # a slow or busy moment: back off and try again
                if i == 3:
                    raise
                print(f"retry {url}: {type(e).__name__}")
                time.sleep(2 * (i + 1))

    def day(self, d, today):
        """Division I games on day d: [{id, date, season, type, neutral, done, sides: {home/away: {...}}}]."""
        path = os.path.join(self.cache, "day", f"{d:%Y%m%d}.json")
        if os.path.exists(path):
            with open(path) as f:
                return json.load(f)
        self.calls += 1
        data = self._fetch(f"{ESPN}scoreboard?groups=50&dates={d:%Y%m%d}&limit=500")
        if self.pause:
            time.sleep(self.pause)
        games = []
        for ev in data.get("events") or []:
            comp = (ev.get("competitions") or [{}])[0]
            side = {c.get("homeAway"): c for c in comp.get("competitors") or []}
            if "home" not in side or "away" not in side:
                continue
            st = (comp.get("status") or ev.get("status") or {}).get("type") or {}
            season = ev.get("season") or {}

            def one(c):
                t = c.get("team") or {}
                color = str(t.get("color") or "")
                return {"id": str(t.get("id")), "code": key_of(t.get("abbreviation") or t.get("id")),
                        "name": t.get("displayName") or t.get("location") or t.get("abbreviation"),
                        "color": "#" + color if re.fullmatch(r"[0-9a-fA-F]{6}", color) else None,
                        "d1": t.get("conferenceId") not in (None, ""), "pts": int(num(c.get("score")))}
            games.append({"id": str(ev.get("id")), "date": str(ev.get("date", ""))[:10], "season": season.get("year"),
                          "type": "P" if season.get("type") == 3 else "R", "neutral": bool(comp.get("neutralSite")),
                          "done": bool(st.get("completed")), "home": one(side["home"]), "away": one(side["away"])})
        # keep the day once it's over and every game on it is final (or there were none): it won't change again
        if d < today - timedelta(days=1) and all(g["done"] for g in games):
            with open(path, "w") as f:
                json.dump(games, f)
        return games


def season_start(y):
    """The first day read: November 1 before the season's year (the season tips off in early November)."""
    return date(y - 1, 11, 1)


def finished_games(api, y, today):
    if y <= SEALED:
        raise SystemExit(f"season {y} is sealed for the research lab; nothing from it is fetched")
    out, seen = [], set()
    d = season_start(y)
    while d <= today and d <= date(y, 4, 30):
        for g in api.day(d, today):
            if g["done"] and g["season"] == y and g["id"] not in seen:
                seen.add(g["id"])
                out.append(g)
        d += timedelta(days=1)
    return sorted(out, key=lambda g: (g["date"], g["id"]))


def records(rows):
    w = sum(1 for r in rows if r["f"] > r["a"])
    return f"{w}-{len(rows) - w}"


def build(now, cache, fetch=None, pause=0.25):
    y = season_of(now)
    api = Espn(cache, fetch, pause)
    games = finished_games(api, y, now.date())
    d1 = {}                                       # ESPN id -> {code, name, color} for Division I teams
    for g in games:
        for s in ("home", "away"):
            t = g[s]
            if t["d1"]:
                d1[t["id"]] = {"code": t["code"], "name": t["name"], "color": t["color"]}
    rows = {tid: [] for tid in d1}                # per D1 team, oldest first
    for g in games:
        for me, op in (("home", "away"), ("away", "home")):
            if g[me]["id"] in rows:
                ha = "N" if g["neutral"] else ("H" if me == "home" else "A")
                rows[g[me]["id"]].append({"g": g, "opp": g[op], "ha": ha, "f": g[me]["pts"], "a": g[op]["pts"]})
    ratings, _ = S.srs([(g["home"]["id"], g["away"]["id"], g["home"]["pts"] - g["away"]["pts"]) for g in games
                        if g["home"]["id"] in d1 and g["away"]["id"] in d1], sorted(d1))
    order = sorted(d1, key=lambda t: (-ratings.get(t, 0.0), d1[t]["code"]))
    rank = {t: i + 1 for i, t in enumerate(order)}

    ts = {}
    for tid, rs in rows.items():
        res = ["W" if r["f"] > r["a"] else "L" for r in rs]
        w, l, last10, streak = S.record(res)
        n = len(rs)
        ts[tid] = {
            "gp": n, "w": w, "l": l, "record": f"{w}-{l}", "last10": last10, "streak": streak,
            "home": records([r for r in rs if r["ha"] == "H"]), "away": records([r for r in rs if r["ha"] == "A"]),
            "neutral": records([r for r in rs if r["ha"] == "N"]),
            "ppg": S.r1(sum(r["f"] for r in rs) / n) if n else None, "oppg": S.r1(sum(r["a"] for r in rs) / n) if n else None,
            "margin": S.r1(sum(r["f"] - r["a"] for r in rs) / n) if n else None,
            "games": [[r["g"]["date"], r["opp"]["code"], r["ha"], r["f"], r["a"], "W" if r["f"] > r["a"] else "L",
                       r["g"]["type"], y, ""] for r in rs][::-1]}
    ranks = S.league_ranks({t: ts[t] for t in ts if ts[t]["gp"]}, CONFIG["team_rows"], CONFIG["rank_low"], CONFIG["rank_skip"])

    stamp = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    season = f"{y - 1}-{str(y)[2:]}"
    for tid in d1:
        this = ts.get(tid) or {}
        S.write(os.path.join(OUT, f"team_{d1[tid]['code']}.json"), {
            "generated_at": stamp, "code": d1[tid]["code"], "name": d1[tid]["name"], "color": d1[tid]["color"], "rank": rank[tid],
            "rating": S.r1(ratings.get(tid)), "season": season, "last_season": "—", "season_year": y,
            "this": {f: v for f, v in this.items() if f != "games"} if this.get("gp") else None, "ranks": ranks.get(tid) or None,
            "last": None, "games": this.get("games", []), "players": []})
    teams = []
    for tid in order:
        s = ts.get(tid) or {}
        teams.append({"code": d1[tid]["code"], "name": d1[tid]["name"], "color": d1[tid]["color"], "rank": rank[tid],
                      "rating": S.r1(ratings.get(tid)), "rating_this": S.r1(ratings.get(tid)), "rating_last": None,
                      **{f: s.get(f) for f in ("gp", "w", "l", "record", "last10", "streak", "ppg", "oppg", "margin")}})
    S.write(os.path.join(OUT, "index.json"), {
        "generated_at": stamp, "sport": "CBB", "season": season, "last_season": "—", "season_year": y, "rank_last": "Last 10",
        "rating_note": "Points per game better than an average Division I team, adjusted for who each team played (SRS), this season only.",
        "source": "ESPN's daily scoreboards (Division I men). This season only: the 2025-26 season is sealed for the research lab.",
        "log_cols": ["date", "opp", "ha", "type", "season"], **CONFIG,
        "teams": teams, "players": []})
    return {"teams": len(d1), "games": len(games), "calls": api.calls}


def main():
    cache = os.getenv("CBB_ESPN_CACHE") or tempfile.mkdtemp()
    out = build(datetime.now(timezone.utc), cache)
    print(f"CBB research files: {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
