#!/usr/bin/env python3
"""
cbb_model_live.py -- DeVig's own men's college basketball model (Division I), run on this season's games. Tracked on
the Models page as a challenger ("devigcbb"), graded on the same games as Kalshi; it is not the app's CBB pick
(cbb/CBB_MODEL_V1_PREREG.md). Display and comparison only: nothing here is bet. Not a claimed edge over Kalshi.

Each team (ESPN team id) carries one number, m, a margin rating in points, updated after every final in date order:
both teams move by k x (margin - (home court + m gap)), the margin capped at CAP points; k starts higher for a team's
first games of a season and settles (k = K + K_EARLY x e^(-games/EARLY_N)). A team seen for the first time starts at
0 if it is Division I, NON_DI if not (a small-college opponent). Ratings carry into a new season (CARRY).

Expected home margin = W_HOME x (not neutral) + W_M x (m_home - m_away).
Home win chance = logistic(A + B x expected margin). The model's spread is minus the expected margin.

Data: ESPN's public scoreboard (site.api.espn.com, groups=50 = Division I), read day by day. Season Y ends in spring
Y (2027 = 2026-27). The settings were picked by `fit` on 2012-2019, checked on 2022-2023 and scored once on
2024-2026; 2011 warms the ratings up and 2020-2021 feed them only. Game rows are never committed: the repo keeps only
cbb/cbb_v1_start.json, every team's m after the 2025-26 season, which a live run starts from and then replays this
season's finals from ESPN.

Out: live/devig/cbb.json -- {generated_at, sport, model, data_through, finals_used, games: [{game_id, kickoff, date,
home, away, home_name, away_name, neutral, home_wp, home_line, parts: {m}}]} for games in the next 6 days. game_id is
ESPN's event id, so tools/models_compare.py reads it as the "devigcbb" model by id.

Usage:  python3 tools/cbb_model_live.py                  (write live/devig/cbb.json)
        python3 tools/cbb_model_live.py fetch DIR 2011 ... 2026   (season files from ESPN into DIR; never commit DIR)
        python3 tools/cbb_model_live.py fit DIR          (rerun the settings search + backtest; summary numbers only)
        python3 tools/cbb_model_live.py snapshot DIR     (rebuild cbb/cbb_v1_start.json from DIR)
"""
import gzip
import itertools
import json
import math
import os
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "live", "devig", "cbb.json")
START = os.path.join(ROOT, "cbb", "cbb_v1_start.json")
ESPN = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/"
AHEAD = timedelta(days=6)
VERSION = "cbb-v1"
FIRST, FIT, CHECK, TEST = 2011, range(2012, 2020), (2022, 2023), (2024, 2025, 2026)
LAST = 2026                       # the start file holds the ratings after this season
DI_GAMES = 15                     # history: a team with this many Division I-scoreboard games in a season is Division I

# frozen settings (CBB_MODEL_V1_PREREG.md), from `fit` (round 3 below)
FROZEN = {"settings": {"k": 0.05, "k_early": 0.15, "early_n": 4, "carry": 1.0, "non_di": -28.0, "cap": 40},
          "weights": {"home": 3.5185, "m": 0.9429},
          "win_chance": {"a": 0.01977, "b": 0.15703}}
GRID = {"k": [0.05, 0.055, 0.06], "k_early": [0.1, 0.15], "early_n": [2, 3, 4], "carry": [0.97, 1.0],
        "non_di": [-28.0, -35.0], "cap": [35, 40, 50]}
SHRINK = [1.0, 0.95, 0.9, 0.85]


def iso(t):
    return t.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def season_of(d):
    return d.year + 1 if d.month >= 7 else d.year


# ================================================================ the model (pure: no files, no network)

class Ratings:
    def __init__(self, P, start=None):
        self.P, self.m, self.n, self.season = P, dict(start or {}), {}, None

    def new_season(self, season):
        if self.season is not None and season != self.season:
            self.m = {t: v * self.P["carry"] for t, v in self.m.items()}
        if season != self.season:
            self.n = {}
        self.season = season

    def see(self, team, is_di):
        if team not in self.m:
            self.m[team] = 0.0 if is_di else self.P["non_di"]

    def k(self, team):
        return self.P["k"] + self.P["k_early"] * math.exp(-self.n.get(team, 0) / self.P["early_n"])

    def update(self, g, home):
        h, a = g["home"], g["away"]
        mu = self.m[h] - self.m[a] + (0.0 if g["neutral"] else home)
        r = max(-self.P["cap"], min(self.P["cap"], g["hs"] - g["as"]))
        kh, ka = self.k(h), self.k(a)
        self.m[h] += kh * (r - mu)
        self.m[a] -= ka * (r - mu)
        self.n[h], self.n[a] = self.n.get(h, 0) + 1, self.n.get(a, 0) + 1


def margin(W, gap, neutral):
    return W["home"] * (0.0 if neutral else 1.0) + W["m"] * gap


def logistic(a, b, x):
    return 1.0 / (1.0 + math.exp(-(a + b * x)))


def run(games, P, home, di, start=None):
    """games in date order ({id, season, home, away, neutral, hs, as (None until final)}); di(season, team) -> bool.
    Returns the ratings and [(game, m gap before it, both Division I)]: every number from games already played."""
    r = Ratings(P, start)
    out = []
    for g in games:
        r.new_season(g["season"])
        for t in (g["home"], g["away"]):
            r.see(t, di(g["season"], t))
        out.append((g, r.m[g["home"]] - r.m[g["away"]], di(g["season"], g["home"]) and di(g["season"], g["away"])))
        if g["hs"] is not None:
            r.update(g, home)
    return r, out


def ols2(rows):
    """margin ~ b_home x (not neutral) + b_m x gap, no intercept."""
    s00 = s01 = s11 = v0 = v1 = 0.0
    for g, gap, _ in rows:
        x0, y = 0.0 if g["neutral"] else 1.0, g["hs"] - g["as"]
        s00, s01, s11, v0, v1 = s00 + x0 * x0, s01 + x0 * gap, s11 + gap * gap, v0 + x0 * y, v1 + gap * y
    det = s00 * s11 - s01 * s01
    return {"home": (v0 * s11 - v1 * s01) / det, "m": (v1 * s00 - v0 * s01) / det}


def fit_logit(xs, ys):
    a, b = 0.0, 0.1
    for _ in range(50):
        ga = gb = haa = hab = hbb = 0.0
        for x, y in zip(xs, ys):
            p = logistic(a, b, x)
            q = p * (1 - p)
            ga, gb, haa, hab, hbb = ga + y - p, gb + (y - p) * x, haa + q, hab + q * x, hbb + q * x * x
        det = haa * hbb - hab * hab
        a, b = a + (hbb * ga - hab * gb) / det, b + (haa * gb - hab * ga) / det
    return a, b


def summary(rows, W, A, B, shrink=1.0):
    ll = acc = err = 0.0
    for g, gap, _ in rows:
        mu = margin(W, gap, g["neutral"])
        p, won = 0.5 + shrink * (logistic(A, B, mu) - 0.5), g["hs"] > g["as"]
        ll -= math.log(p if won else 1 - p)
        acc += (p > 0.5) == won
        err += abs(g["hs"] - g["as"] - mu)
    n = len(rows)
    return {"games": n, "log_loss": round(ll / n, 4), "accuracy": round(acc / n, 4), "margin_error": round(err / n, 3)}


def graded(out, seasons):
    return [x for x in out if x[0]["season"] in seasons and x[2] and x[0]["hs"] is not None]


def solve(games, di, P):
    """Two passes: home court in the update starts at 3.0, then is the fitted weight."""
    W = ols2(graded(run(games, P, 3.0, di)[1], FIT))
    _, out = run(games, P, W["home"], di)
    return ols2(graded(out, FIT)), out


def fit(games, di):
    res = []
    for vals in itertools.product(*GRID.values()):
        P = dict(zip(GRID, vals))
        W, out = solve(games, di, P)
        f = graded(out, FIT)
        res.append((sum(abs(g["hs"] - g["as"] - margin(W, gap, g["neutral"])) for g, gap, _ in f) / len(f), P))
    res.sort(key=lambda x: x[0])
    print("settings, best 5 by margin error on", FIT.start, "-", FIT.stop - 1)
    for e, P in res[:5]:
        print(f"  {e:.4f}  {P}")
    P = res[0][1]
    W, out = solve(games, di, P)
    f = graded(out, FIT)
    A, B = fit_logit([margin(W, gap, g["neutral"]) for g, gap, _ in f], [1.0 if g["hs"] > g["as"] else 0.0 for g, _, _ in f])
    print("weights", {k: round(v, 4) for k, v in W.items()}, "win chance", round(A, 5), round(B, 5))
    print("fit  ", summary(f, W, A, B))
    c = graded(out, CHECK)
    best = min(SHRINK, key=lambda s: summary(c, W, A, B, s)["log_loss"])
    for s in SHRINK:
        print("check", s, summary(c, W, A, B, s))
    print("shrink picked on", CHECK, ":", best)
    print("test ", summary(graded(out, TEST), W, A, B, best))


# ================================================================ ESPN

def get(url, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"accept-encoding": "gzip", "user-agent": "devig-models"})
            with urllib.request.urlopen(req, timeout=30) as r:
                b = r.read()
                return json.loads(gzip.decompress(b) if r.headers.get("content-encoding") == "gzip" else b)
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(2 * (i + 1))


def day_games(d):
    """One ESPN day (Division I scoreboard): finals and games not started; in-progress and postponed games left out."""
    j = get(f"{ESPN}scoreboard?dates={d:%Y%m%d}&groups=50&limit=500")
    out = []
    for ev in j.get("events") or []:
        c = (ev.get("competitions") or [{}])[0]
        st = ((ev.get("status") or c.get("status") or {}).get("type")) or {}
        side = {x.get("homeAway"): x for x in c.get("competitors") or []}
        if "home" not in side or "away" not in side:
            continue
        final = st.get("state") == "post" and st.get("completed", True)
        if not final and st.get("state") != "pre":
            continue
        try:
            hs, as_ = (int(side["home"]["score"]), int(side["away"]["score"])) if final else (None, None)
        except (TypeError, ValueError, KeyError):
            continue
        t = lambda k: side[k].get("team") or {}
        out.append({"id": str(ev["id"]), "day": d.isoformat(), "kickoff": ev.get("date"), "season": season_of(d),
                    "neutral": bool(c.get("neutralSite")), "home": str(t("home").get("id")), "away": str(t("away").get("id")),
                    "hn": t("home").get("location"), "an": t("away").get("location"), "hs": hs, "as": as_})
    return out


def days_games(days):
    with ThreadPoolExecutor(6) as ex:
        res = list(ex.map(day_games, days))
    by = {}
    for rows in res:
        for g in rows:
            by[g["id"]] = g                       # a game listed on two days: the later day wins
    return sorted(by.values(), key=lambda g: (g["kickoff"] or "", g["id"]))


def di_teams():
    j = get(f"{ESPN}teams?groups=50&limit=500")
    return {str(x["team"]["id"]) for s in j["sports"] for lg in s["leagues"] for x in lg["teams"]}


def load_dir(d):
    games, di = [], {}
    for y in range(FIRST, LAST + 1):
        with open(os.path.join(d, f"{y}.json")) as f:
            rows = json.load(f)["games"]
        n = {}
        for g in rows:
            g["season"] = y
            for t in (g["home"], g["away"]):
                n[t] = n.get(t, 0) + 1
        di[y] = {t for t, c in n.items() if c >= DI_GAMES}
        games += sorted(rows, key=lambda g: (g["kickoff"] or "", g["id"]))
    return games, (lambda s, t: t in di[s])


# ================================================================ modes

def fetch(d, seasons):
    os.makedirs(d, exist_ok=True)
    for y in seasons:
        days = [date(y - 1, 11, 1) + timedelta(i) for i in range((date(y, 4, 10) - date(y - 1, 11, 1)).days + 1)]
        games = [g for g in days_games(days) if g["hs"] is not None]
        with open(os.path.join(d, f"{y}.json"), "w") as f:
            json.dump({"season": y, "games": games}, f)
        print(y, len(games), "finals")


def snapshot(d):
    games, di = load_dir(d)
    P, W = FROZEN["settings"], FROZEN["weights"]
    r, _ = run(games, P, W["home"], di)
    payload = {"model": VERSION, "after_season": LAST, "data_through": max(g["day"] for g in games),
               "note": "every team's m (ESPN team id) after the 2025-26 season, from cbb_model_live.py snapshot",
               "m": {t: round(v, 4) for t, v in sorted(r.m.items(), key=lambda x: int(x[0]) if x[0].isdigit() else 0)}}
    with open(START, "w") as f:
        json.dump(payload, f, indent=0, sort_keys=True)
        f.write("\n")
    print(f"start file: {len(payload['m'])} teams -> {os.path.relpath(START, ROOT)}")


def live(now):
    P, W, A, B = FROZEN["settings"], FROZEN["weights"], FROZEN["win_chance"]["a"], FROZEN["win_chance"]["b"]
    with open(START) as f:
        start = json.load(f)
    season = season_of(now.date())
    if season <= start["after_season"]:
        raise SystemExit("CBB model: the start file is not from before this season")
    first = date(season - 1, 11, 1)
    last = (now + AHEAD).date() + timedelta(days=1)
    days = [first + timedelta(i) for i in range((last - first).days + 1)] if last >= first else []
    games = days_games(days)
    di_now = di_teams()
    r, out = run(games, P, W["home"], lambda s, t: t in di_now, start["m"])
    up = []
    for g, gap, _ in out:
        k = datetime.fromisoformat(g["kickoff"].replace("Z", "+00:00")) if g["kickoff"] else None
        if g["hs"] is not None or not k or not (now < k <= now + AHEAD):
            continue
        mu = margin(W, gap, g["neutral"])
        up.append({"game_id": g["id"], "kickoff": iso(k), "date": g["day"], "home": g["home"], "away": g["away"],
                   "home_name": g["hn"], "away_name": g["an"], "neutral": g["neutral"],
                   "home_wp": round(logistic(A, B, mu), 4), "home_line": round(-mu, 1), "parts": {"m": round(gap, 3)}})
    up.sort(key=lambda x: (x["kickoff"], x["game_id"]))
    done = [g for g in games if g["hs"] is not None]
    payload = {"generated_at": iso(now), "sport": "CBB",
               "model": {"id": VERSION, "name": "DeVig CBB v1", "file": "cbb/CBB_MODEL_V1_PREREG.md", **FROZEN},
               "data_through": max(g["day"] for g in done) if done else start["data_through"], "finals_used": len(done),
               "source": "ESPN's public Division I scoreboard: cbb/cbb_v1_start.json (ratings after 2025-26) + this "
                         "season's finals", "games": up}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT + ".tmp", "w") as f:
        json.dump(payload, f, indent=1, sort_keys=True)
        f.write("\n")
    os.replace(OUT + ".tmp", OUT)
    print(f"CBB v1: {len(up)} upcoming games, {len(done)} finals this season -> {os.path.relpath(OUT, ROOT)}")


def main(argv):
    if argv[:1] == ["fetch"]:
        fetch(argv[1], [int(y) for y in argv[2:]])
    elif argv[:1] == ["fit"]:
        fit(*load_dir(argv[1]))
    elif argv[:1] == ["snapshot"]:
        snapshot(argv[1])
    else:
        now = datetime.now(timezone.utc)
        if os.environ.get("CBB_MODEL_NOW"):
            now = datetime.fromisoformat(os.environ["CBB_MODEL_NOW"].replace("Z", "+00:00"))
        live(now)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
