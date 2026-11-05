#!/usr/bin/env python3
"""
soccer_model_live.py -- DeVig's own soccer model (DeVig Soccer v1) for the five big European leagues, run on this
season's matches. The app shows its home / draw / away chance in 90 minutes beside Kalshi's on each league match it
covers (soccer/SOCCER_MODEL_V1_PREREG.md, CHAMPION_CHALLENGER_V4_PREREG.md). Display and comparison only: nothing here
is bet. New and not proven; not a claimed edge over Kalshi.

Each team (league + ESPN team id) carries two numbers on the log-goals scale: attack a (scores more) and defence d
(lets in less). Each league carries a goal level mu and a home edge h. Expected goals:
    home = exp(mu + h + a_home - d_away),   away = exp(mu + a_away - d_home).
After each final both teams move by k x (goals - expected goals), each team's goals counted up to CAP. k starts higher
for a team's first games of a season (k = K x (1 + EARLY x e^(-games / 6))). The league's mu and h move by 0.002 x the
same errors. A team that did not play in the league the season before (promoted, or back after time
away) starts PROMO below the league's current average attack and defence (over the teams that played in it this
season or last). At a new season every team's a and d are multiplied by CARRY.
Chances: the two expected-goals numbers as independent Poisson counts (0-10 goals each) with the Dixon-Coles low-score
adjustment RHO (it moves chance between 0-0, 1-1 and 1-0, 0-1), summed into home win / draw / away win and rescaled
to add to 1.

Data: final scores only, from ESPN's public scoreboards (eng.1, esp.1, ita.1, ger.1, fra.1; league matches only), read
a month at a time. No prices, injuries, lineups or transfers. A season is named by the year it starts (2019 = 2019-20)
and a match belongs to the season ESPN lists it under. Picked by `fit` on 2019-2022 (2013-2018 warm the ratings up and
are scored nowhere) and scored once on 2023-2025. 2026 is never read except live, and nothing from it is stored.
Match rows are never committed: the repo keeps only soccer/soccer_v1_start.json, every team's and league's numbers
after the 2025-26 season, which a live run starts from and then replays this season's finals from ESPN.

Out: live/devig/soccer.json -- {generated_at, sport, model, data_through, finals_used, games: [{game_id, league,
kickoff, home, away, home_name, away_name, home_wp, draw_p, away_wp, xg_home, xg_away}]} for league matches in the next
7 days. game_id is ESPN's event id, as in live/soccer_lines.json.

Usage:  python3 tools/soccer_model_live.py                       (write live/devig/soccer.json)
        python3 tools/soccer_model_live.py fetch DIR 2013 ... 2025  (season files from ESPN into DIR; never commit DIR)
        python3 tools/soccer_model_live.py fit DIR                (rerun the settings search + the one-time score;
                                                                    summary numbers only)
        python3 tools/soccer_model_live.py snapshot DIR           (rebuild soccer/soccer_v1_start.json from DIR)
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
OUT = os.path.join(ROOT, "live", "devig", "soccer.json")
START = os.path.join(ROOT, "soccer", "soccer_v1_start.json")
ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer/{lg}/scoreboard?dates={d}&limit=1000"
UA = "devig-soccer-v1/1.0 (personal project; read-only)"
LEAGUES = {"eng.1": "EPL", "esp.1": "LALIGA", "ita.1": "SERIEA", "ger.1": "BUND", "fra.1": "LIGUE1"}
AHEAD = timedelta(days=7)
VERSION = "soccer-v1"
FIRST, SEARCH, TEST = 2013, (2019, 2020, 2021, 2022), (2023, 2024, 2025)
LAST = 2025                       # the start file holds the numbers after this season
MAXG = 10                         # goals counted per team in the chance grid
K_LEAGUE = 0.002                  # how fast a league's goal level and home edge move (fixed, not searched)
MU0, H0 = math.log(1.35), 0.25    # a league's starting goal level and home edge (warm-up seasons settle them)

# frozen settings (SOCCER_MODEL_V1_PREREG.md), from `fit` (round 2 below)
FROZEN = {"settings": {"k": 0.015, "early": 0.5, "carry": 1.0, "promo": 0.2, "cap": 4}, "rho": -0.05}
# round 1 (k .02-.05, early 0-2, carry .7-1, promo .1-.3, cap 4/99) landed on edges; this is round 2
GRID = {"k": [0.01, 0.015, 0.02, 0.025], "early": [0.0, 0.5, 1.0], "carry": [0.85, 0.95, 1.0],
        "promo": [0.0, 0.1, 0.2, 0.3], "cap": [4, 99]}
RHOS = [0.0, -0.05, -0.1, -0.15]


def iso(t):
    return t.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ================================================================ the model (pure: no files, no network)

class Ratings:
    def __init__(self, P, start=None):
        self.P = P
        s = start or {}
        self.t = {k: [v[0], v[1]] for k, v in (s.get("teams") or {}).items()}      # key -> [a, d]
        self.last = {k: v[2] for k, v in (s.get("teams") or {}).items()}           # key -> last season in the league
        self.lg = {k: list(v) for k, v in (s.get("leagues") or {}).items()}        # league -> [mu, h]
        self.season = s.get("season")
        self.n = {}

    def new_season(self, season):
        if self.season is not None and season != self.season:
            c = self.P["carry"]
            self.t = {k: [v[0] * c, v[1] * c] for k, v in self.t.items()}
        if season != self.season:
            self.n = {}
        self.season = season

    def see(self, key, season):
        if key not in self.t or self.last.get(key, -1) < season - 1:
            lg = key.split("|")[0] + "|"
            peers = [v for k, v in self.t.items() if k.startswith(lg) and self.last.get(k, -1) >= season - 1]
            ma = sum(v[0] for v in peers) / len(peers) if peers else 0.0
            md = sum(v[1] for v in peers) / len(peers) if peers else 0.0
            self.t[key] = [ma - self.P["promo"], md - self.P["promo"]]
        self.last[key] = season

    def expected(self, g):
        mu, h = self.lg.setdefault(g["league"], [MU0, H0])
        H, A = self.t[g["hk"]], self.t[g["ak"]]
        home = 0.0 if g["neutral"] else h
        return math.exp(mu + home + H[0] - A[1]), math.exp(mu + A[0] - H[1])

    def k(self, key):
        return self.P["k"] * (1.0 + self.P["early"] * math.exp(-self.n.get(key, 0) / 6.0))

    def update(self, g, lh, la):
        cap = self.P["cap"]
        eh, ea = min(g["hs"], cap) - min(lh, cap), min(g["as"], cap) - min(la, cap)
        H, A = self.t[g["hk"]], self.t[g["ak"]]
        kh, ka = self.k(g["hk"]), self.k(g["ak"])
        H[0] += kh * eh
        A[1] -= ka * eh
        A[0] += ka * ea
        H[1] -= kh * ea
        L = self.lg[g["league"]]
        L[0] += K_LEAGUE * (eh + ea)
        if not g["neutral"]:
            L[1] += K_LEAGUE * (eh - ea) / 2.0
        self.n[g["hk"]], self.n[g["ak"]] = self.n.get(g["hk"], 0) + 1, self.n.get(g["ak"], 0) + 1


def run(games, P, start=None):
    """games in start-time order ({id, season, league, hk, ak, neutral, hs, as (None until final)}).
    Returns the ratings and [(game, expected home goals, expected away goals)], every number from games already
    played."""
    r = Ratings(P, start)
    out = []
    for g in games:
        r.new_season(g["season"])
        for key in (g["hk"], g["ak"]):
            r.see(key, g["season"])
        lh, la = r.expected(g)
        out.append((g, lh, la))
        if g["hs"] is not None:
            r.update(g, lh, la)
    return r, out


def _pois(lam):
    p, out = math.exp(-lam), []
    for i in range(MAXG + 1):
        out.append(p)
        p *= lam / (i + 1)
    return out


def chances(lh, la, rho):
    """Home win, draw, away win in 90 minutes from the two expected-goals numbers (Dixon-Coles adjusted)."""
    ph, pa = _pois(lh), _pois(la)
    hw = dr = aw = 0.0
    for i, x in enumerate(ph):
        for j, y in enumerate(pa):
            p = x * y
            if i == 0 and j == 0:
                p *= 1.0 - lh * la * rho
            elif i == 0 and j == 1:
                p *= 1.0 + lh * rho
            elif i == 1 and j == 0:
                p *= 1.0 + la * rho
            elif i == 1 and j == 1:
                p *= 1.0 - rho
            if i > j:
                hw += p
            elif i == j:
                dr += p
            else:
                aw += p
    s = hw + dr + aw
    return hw / s, dr / s, aw / s


def outcome(g):
    return 0 if g["hs"] > g["as"] else 1 if g["hs"] == g["as"] else 2


# ================================================================ data (ESPN, never committed)

def _get(url, tries=5):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "gzip"})
            with urllib.request.urlopen(req, timeout=30) as r:
                b = r.read()
                if r.headers.get("Content-Encoding") == "gzip":
                    b = gzip.decompress(b)
                return json.loads(b)
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(2 * (i + 1))


def reduce_event(e, league):
    """One scoreboard event as a match: league matches with two teams only. hs/as are None unless full time."""
    c = (e.get("competitions") or [{}])[0]
    teams = {t.get("homeAway"): t for t in c.get("competitors") or []}
    if "home" not in teams or "away" not in teams:
        return None
    st = (c.get("status") or e.get("status") or {}).get("type") or {}
    done = bool(st.get("completed")) and st.get("state") == "post"
    try:
        hs, as_ = (int(float(teams["home"]["score"])), int(float(teams["away"]["score"]))) if done else (None, None)
    except (KeyError, TypeError, ValueError):
        hs, as_ = None, None
    yr = (e.get("season") or {}).get("year")
    hid, aid = str(teams["home"]["team"]["id"]), str(teams["away"]["team"]["id"])
    return {"id": str(e.get("id")), "season": yr, "league": league, "start": e.get("date"),
            "neutral": bool(c.get("neutralSite")), "hk": f"{league}|{hid}", "ak": f"{league}|{aid}",
            "hs": hs, "as": as_, "state": st.get("state"),
            "names": (teams["home"]["team"].get("displayName"), teams["away"]["team"].get("displayName"))}


def months(season, until=None):
    """July of the season's year to August of the next (2019-20 ran into August 2020), or to `until`."""
    y, m, out = season, 7, []
    while (y, m) <= (season + 1, 8):
        if until and (y, m) > (until.year, until.month):
            break
        out.append(f"{y}{m:02d}")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def fetch_season(season, until=None):
    jobs = [(lg, mo) for lg in LEAGUES for mo in months(season, until)]
    with ThreadPoolExecutor(8) as ex:
        bodies = list(ex.map(lambda j: _get(ESPN.format(lg=j[0], d=j[1])), jobs))
    seen = {}
    for (lg, _), b in zip(jobs, bodies):
        for e in b.get("events") or []:
            g = reduce_event(e, lg)
            if g and g["season"] == season:
                seen[g["id"]] = g
    return sorted(seen.values(), key=lambda g: (g["start"] or "", g["id"]))


def save(d, season, games):
    keep = [{k: g[k] for k in ("id", "season", "league", "start", "neutral", "hk", "ak", "hs", "as")}
            for g in games if g["hs"] is not None]
    with gzip.open(os.path.join(d, f"soccer_{season}.json.gz"), "wt") as f:
        json.dump(keep, f)
    return len(keep)


def load(d, seasons):
    out = []
    for s in seasons:
        with gzip.open(os.path.join(d, f"soccer_{s}.json.gz"), "rt") as f:
            out += json.load(f)
    return sorted(out, key=lambda g: (g["season"], g["start"] or "", g["id"]))


# ================================================================ fit / score (summary numbers only)

def score(rows, rho, seasons):
    n = ll = hit = 0
    by = {}
    for g, lh, la in rows:
        if g["season"] not in seasons:
            continue
        p = chances(lh, la, rho)
        o = outcome(g)
        l = -math.log(max(p[o], 1e-12))
        n, ll, hit = n + 1, ll + l, hit + (max(range(3), key=lambda i: p[i]) == o)
        b = by.setdefault(g["season"], [0, 0.0])
        b[0], b[1] = b[0] + 1, b[1] + l
    return {"n": n, "log_loss": ll / n, "acc": hit / n, "by_season": {s: round(v[1] / v[0], 4) for s, v in by.items()}}


def base_rates(games, fit_seasons, seasons):
    """Each league's home / draw / away share on fit_seasons, scored as a fixed forecast on seasons."""
    cnt = {}
    for g in games:
        if g["season"] in fit_seasons:
            c = cnt.setdefault(g["league"], [0, 0, 0])
            c[outcome(g)] += 1
    n = ll = 0
    for g in games:
        if g["season"] in seasons:
            c = cnt[g["league"]]
            n, ll = n + 1, ll - math.log(c[outcome(g)] / sum(c))
    return ll / n


def calibration(rows, rho, seasons):
    bins = {}
    for g, lh, la in rows:
        if g["season"] not in seasons:
            continue
        p = chances(lh, la, rho)
        o = outcome(g)
        for i, name in ((0, "home"), (1, "draw")):
            b = bins.setdefault((name, min(int(p[i] * 10), 9)), [0, 0.0, 0])
            b[0], b[1], b[2] = b[0] + 1, b[1] + p[i], b[2] + (o == i)
    return {f"{k[0]} {k[1] * 10}-{k[1] * 10 + 10}%": (v[0], round(v[1] / v[0], 3), round(v[2] / v[0], 3))
            for k, v in sorted(bins.items()) if v[0] >= 50}


def fit(d):
    games = load(d, range(FIRST, LAST + 1))
    print(f"{len(games)} finals, seasons {FIRST}-{LAST}; search on {SEARCH}, one-time score on {TEST}")
    best = []
    keys = list(GRID)
    for vals in itertools.product(*(GRID[k] for k in keys)):
        P = dict(zip(keys, vals))
        _, rows = run([g for g in games if g["season"] <= max(SEARCH)], P)
        for rho in RHOS:
            s = score(rows, rho, SEARCH)
            best.append((s["log_loss"], P, rho, s))
    best.sort(key=lambda b: b[0])
    print("top 5 on the search seasons (log loss, settings, rho):")
    for ll, P, rho, s in best[:5]:
        print(f"  {ll:.5f}  {P}  rho={rho}")
    edges = {k: sorted({b[1][k] for b in best[:5]}) for k in keys}
    print("top-5 settings per knob (an edge value means the grid may be too narrow):", edges)
    ll, P, rho, s = best[0]
    print(f"picked: {P} rho={rho}; search {SEARCH}: n={s['n']} log loss {s['log_loss']:.4f} acc {s['acc']:.3f} "
          f"by season {s['by_season']}")
    print(f"  league base rates (fit on 2013-2018) on the search seasons: {base_rates(games, range(FIRST, 2019), SEARCH):.4f}")
    if "--score" in sys.argv:
        _, rows = run(games, P)
        t = score(rows, rho, TEST)
        print(f"ONE-TIME SCORE {TEST}: n={t['n']} log loss {t['log_loss']:.4f} acc {t['acc']:.3f} by season {t['by_season']}")
        print(f"  league base rates (fit on 2013-2022) on {TEST}: {base_rates(games, range(FIRST, 2023), TEST):.4f}")
        print("  calibration (bin: games, said, happened):")
        for k, v in calibration(rows, rho, TEST).items():
            print(f"    {k}: {v}")
        ps = [chances(lh, la, rho) for g, lh, la in rows if g["season"] in TEST]
        print(f"  mean said home/draw/away: {[round(sum(p[i] for p in ps) / len(ps), 3) for i in range(3)]}; "
              f"happened: {[round(sum(outcome(g) == i for g, _, _ in rows if g['season'] in TEST) / len(ps), 3) for i in range(3)]}")


def snapshot(d):
    P, rho = FROZEN["settings"], FROZEN["rho"]
    r, _ = run(load(d, range(FIRST, LAST + 1)), P)
    out = {"model": VERSION, "season": LAST, "settings": P, "rho": rho,
           "note": "Every team's attack, defence and last season in its league after the 2025-26 season, and each "
                   "league's goal level and home edge (log-goals scale). Numbers only, no match rows "
                   "(soccer/SOCCER_MODEL_V1_PREREG.md).",
           "leagues": {k: [round(v[0], 5), round(v[1], 5)] for k, v in sorted(r.lg.items())},
           "teams": {k: [round(v[0], 5), round(v[1], 5), r.last[k]] for k, v in sorted(r.t.items())}}
    with open(START, "w") as f:
        json.dump(out, f, indent=0, sort_keys=False)
        f.write("\n")
    print(f"wrote {START}: {len(out['teams'])} teams, {len(out['leagues'])} leagues")


# ================================================================ live

def live():
    with open(START) as f:
        start = json.load(f)
    P, rho = start["settings"], start["rho"]
    now = datetime.now(timezone.utc)
    season = now.year if now.month >= 7 else now.year - 1
    allg = fetch_season(season, until=(now + AHEAD).date())
    finals = [g for g in allg if g["hs"] is not None and g["state"] == "post"]
    upcoming = [g for g in allg if g["state"] == "pre" and g["start"]
                and now < datetime.fromisoformat(g["start"].replace("Z", "+00:00")) <= now + AHEAD]
    for g in upcoming:
        g["hs"] = g["as"] = None
    seq = sorted(finals + upcoming, key=lambda g: (g["start"] or "", g["id"]))
    _, rows = run(seq, P, start)
    games = []
    for g, lh, la in rows:
        if g["hs"] is not None:
            continue
        hw, dr, aw = chances(lh, la, rho)
        games.append({"game_id": g["id"], "league": LEAGUES[g["league"]], "kickoff": g["start"],
                      "home": g["hk"].split("|")[1], "away": g["ak"].split("|")[1],
                      "home_name": g["names"][0], "away_name": g["names"][1],
                      "home_wp": round(hw, 4), "draw_p": round(dr, 4), "away_wp": round(aw, 4),
                      "xg_home": round(lh, 2), "xg_away": round(la, 2)})
    out = {"generated_at": iso(now), "sport": "SOCCER", "model": VERSION,
           "data_through": max((g["start"] for g in finals), default=None), "finals_used": len(finals),
           "games": games}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(out, f, indent=1)
        f.write("\n")
    print(f"wrote {OUT}: {len(games)} matches ahead, {len(finals)} finals of {season}-{(season + 1) % 100:02d} replayed")


def main():
    a = sys.argv[1:]
    if not a:
        return live()
    if a[0] == "fetch":
        os.makedirs(a[1], exist_ok=True)
        for s in map(int, a[2:]):
            if s > LAST:
                sys.exit(f"season {s} is never stored")
            print(f"{s}: {save(a[1], s, fetch_season(s))} finals")
    elif a[0] == "fit":
        fit(a[1])
    elif a[0] == "snapshot":
        snapshot(a[1])
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
