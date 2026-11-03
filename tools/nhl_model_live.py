#!/usr/bin/env python3
"""
nhl_model_live.py -- DeVig's own NHL moneyline model v1 (NHL_MODEL_V1_PREREG.md), run on this season's games for the
app. A small ratings model, written here (not the Research Lab's search; the Lab's leader keeps running beside it as a
challenger, tools/lab_live.py). Display and comparison only: nothing here is bet.

The home team's win chance is a logistic of three numbers known before puck drop:
  elo  Elo gap + home bonus (K 2, home +45, 85% carried into a new season, goal-margin multiplier), in logit units
  b2b  home played yesterday minus away played yesterday (0/1 each)
  sh   shot share (EWMA, 5% per game, pulled 40% back to even each new season), home minus away, x10
with weights fit once on 2012-13 .. 2016-17 regular seasons (the Lab's archive, closing lines never an input) and
frozen here (W). Starting goalies are not used: they are not confirmed early enough before games.

Backtest, descriptive only (fit 2012-16, tested on 2017-18 .. 2020-21, 4,868 games): log loss 0.6716 vs the closing
line's 0.6713, accuracy 58.5% both; always the home rate 0.6901. That is past seasons, not a claimed edge.

Live data: the ratings start from even in 2022-23 and run through every final since, from the NHL's public API
(api.nhle.com, no key): game results from /game, shots from /team/summary (per game). The sealed 2021-22 season and
the Lab's archive are not read here.

Out: live/devig/nhl.json -- {generated_at, model, data_from, data_through, finals_used, check, games: [{game_id, kickoff,
date, home, away, home_name, away_name, home_wp, parts: {elo, b2b, sh}}]} for games in the next 3 days.
tools/models_compare.py reads it as the "devig" NHL model, locks the last number before each start and grades it.

Usage:  python3 tools/nhl_model_live.py           (write live/devig/nhl.json)
        python3 tools/nhl_model_live.py check     (score the frozen model on finals since 2023-24; prints only)
"""
import json
import math
import os
import sys
import urllib.request
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "live", "devig", "nhl.json")
ET = ZoneInfo("America/New_York")
UA = "devig-nhl-model/1.0 (personal research; read-only)"
NHL_API = "https://api.nhle.com/stats/rest/en"
FIRST = 2022                              # first season the live ratings learn from (2022-23), after the sealed 2021
ALIAS = {"ARI": "UTA"}                    # Arizona's players and staff moved to Utah in 2024: one rating
AHEAD = timedelta(days=3)

# frozen model (NHL_MODEL_V1_PREREG.md): Elo settings, shot-share settings, logistic weights [1, elo, b2b, sh]
K, HOME, CARRY = 2.0, 45.0, 0.85
SHOT_A, SHOT_CARRY = 0.05, 0.6
W = (0.031, 0.581, -0.163, 0.526)
VERSION = "nhl-v1"


def get(url, tries=3):
    last = None
    for _ in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except Exception as e:                       # noqa: BLE001 -- retried, then raised
            last = e
    raise RuntimeError(f"{url}: {last}")


def iso(t):
    return t.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def season_start(now):
    return now.year if now.month >= 8 else now.year - 1


# ================================================================ the model (pure: no network)

class Ratings:
    """Every team's Elo, shot share and last game day, run forward one final at a time (in date order)."""

    def __init__(self):
        self.elo, self.sh, self.last, self.season = {}, {}, {}, None

    def new_season(self, season):
        if season == self.season:
            return
        self.season = season
        for t in self.elo:
            self.elo[t] = 1500 + CARRY * (self.elo[t] - 1500)
        for t in self.sh:
            self.sh[t] = 0.5 + SHOT_CARRY * (self.sh[t] - 0.5)

    def parts(self, home, away, day):
        """The three inputs for a game on `day` (a date) before it is played."""
        eh, ea = self.elo.get(home, 1500.0), self.elo.get(away, 1500.0)
        b2b = lambda t: int(t in self.last and (day - self.last[t]).days == 1)   # noqa: E731
        return {"elo": (eh - ea + HOME) / 400 * math.log(10),
                "b2b": b2b(home) - b2b(away),
                "sh": (self.sh.get(home, 0.5) - self.sh.get(away, 0.5)) * 10}

    def update(self, home, away, day, hs, as_, h_shots=None, a_shots=None):
        eh, ea = self.elo.get(home, 1500.0), self.elo.get(away, 1500.0)
        p = 1 / (1 + 10 ** (-(eh + HOME - ea) / 400))
        y = 1 if hs > as_ else 0
        mult = math.log(abs(hs - as_) + 1) * (2.2 / (abs(eh - ea) * 0.001 + 2.2))
        d = K * mult * (y - p) * 4
        self.elo[home], self.elo[away] = eh + d, ea - d
        self.last[home] = self.last[away] = day
        if h_shots and a_shots:
            f = h_shots / (h_shots + a_shots)
            self.sh[home] = (1 - SHOT_A) * self.sh.get(home, 0.5) + SHOT_A * f
            self.sh[away] = (1 - SHOT_A) * self.sh.get(away, 0.5) + SHOT_A * (1 - f)


def home_wp(parts):
    z = W[0] + W[1] * parts["elo"] + W[2] * parts["b2b"] + W[3] * parts["sh"]
    return 1 / (1 + math.exp(-z))


def run(games):
    """games: dicts {game_id, season, day (date), start, home, away, home_score, away_score, home_shots, away_shots},
    finals scored, the rest None. Returns (ratings after every final, [(game, parts, home_wp)] for every game, each
    from the ratings as they stood before it)."""
    r, out = Ratings(), []
    for g in sorted(games, key=lambda g: (g["day"], g["start"], g["game_id"])):
        r.new_season(g["season"])
        parts = r.parts(g["home"], g["away"], g["day"])
        out.append((g, parts, home_wp(parts)))
        if g["home_score"] is not None and g["away_score"] is not None:
            r.update(g["home"], g["away"], g["day"], g["home_score"], g["away_score"], g.get("home_shots"), g.get("away_shots"))
    return r, out


# ================================================================ NHL API

def nhl_games(now):
    teams = {t["id"]: (t["triCode"], t["fullName"]) for t in get(f"{NHL_API}/team")["data"]}
    games = []
    for s in range(FIRST, season_start(now) + 1):
        sid = f"{s}{s + 1}"
        shots = {}
        for row in get(f"{NHL_API}/team/summary?isAggregate=false&isGame=true&limit=-1"
                       f"&cayenneExp=seasonId={sid}%20and%20gameTypeId%3E=2")["data"]:
            shots[(str(row["gameId"]), row["teamId"])] = row.get("shotsForPerGame")
        for g in get(f"{NHL_API}/game?cayenneExp=season={sid}%20and%20gameType%3E=2")["data"]:
            if g.get("gameType") not in (2, 3) or g["homeTeamId"] not in teams or g["visitingTeamId"] not in teams:
                continue
            (hc, hn), (ac, an) = teams[g["homeTeamId"]], teams[g["visitingTeamId"]]
            final = g.get("gameStateId") in (6, 7)
            start = datetime.fromisoformat(g["easternStartTime"]).replace(tzinfo=ET)
            gid = str(g["id"])
            games.append({"game_id": gid, "season": s, "game_type": g["gameType"], "day": date.fromisoformat(g["gameDate"]),
                          "start": start, "home": ALIAS.get(hc, hc), "away": ALIAS.get(ac, ac), "home_name": hn, "away_name": an,
                          "home_score": g["homeScore"] if final else None, "away_score": g["visitingScore"] if final else None,
                          "home_shots": shots.get((gid, g["homeTeamId"])), "away_shots": shots.get((gid, g["visitingTeamId"]))})
    return games


def log_loss(rows):
    s = 0.0
    for p, y in rows:
        p = min(max(p, 1e-6), 1 - 1e-6)
        s -= y * math.log(p) + (1 - y) * math.log(1 - p)
    return s / len(rows) if rows else None


def score(out, first_season):
    """How the frozen model did on finals from `first_season` on (each chance from the ratings before that game)."""
    rows = [(p, int(g["home_score"] > g["away_score"])) for g, _, p in out
            if g["season"] >= first_season and g["home_score"] is not None and g["game_type"] == 2]
    if not rows:
        return None
    home = sum(y for _, y in rows) / len(rows)
    bands = []
    for lo, hi in ((0, .4), (.4, .5), (.5, .6), (.6, .7), (.7, 1.01)):
        b = [(p, y) for p, y in rows if lo <= p < hi]
        if b:
            bands.append({"lo": lo, "hi": min(hi, 1), "n": len(b), "said": round(sum(p for p, _ in b) / len(b), 3),
                          "won": round(sum(y for _, y in b) / len(b), 3)})
    return {"seasons_from": f"{first_season}-{first_season + 1 - 2000:02d}", "games": len(rows),
            "log_loss": round(log_loss(rows), 4), "home_rate_log_loss": round(log_loss([(home, y) for _, y in rows]), 4),
            "accuracy": round(sum((p > .5) == (y == 1) for p, y in rows) / len(rows), 3), "bands": bands}


def main(argv):
    now = datetime.now(timezone.utc)
    if os.environ.get("NHL_MODEL_NOW"):
        now = datetime.fromisoformat(os.environ["NHL_MODEL_NOW"].replace("Z", "+00:00"))
    games = nhl_games(now)
    _, out = run(games)
    chk = score(out, FIRST + 1)                      # 2022-23 warms the ratings up; graded from 2023-24
    if argv[:1] == ["check"]:
        print(json.dumps(chk, indent=1))
        return 0
    done = [g for g in games if g["home_score"] is not None]
    up = []
    for g, parts, p in out:
        if g["home_score"] is None and now < g["start"] <= now + AHEAD:
            up.append({"game_id": g["game_id"], "kickoff": iso(g["start"]), "date": g["day"].isoformat(),
                       "home": g["home"], "away": g["away"], "home_name": g["home_name"], "away_name": g["away_name"],
                       "home_wp": round(p, 4), "parts": {k: round(v, 4) for k, v in parts.items()}})
    up.sort(key=lambda x: (x["kickoff"], x["game_id"]))
    payload = {"generated_at": iso(now), "sport": "NHL",
               "model": {"id": VERSION, "name": "DeVig NHL v1", "file": "nhl/NHL_MODEL_V1_PREREG.md",
                         "inputs": ["elo", "b2b", "sh"], "weights": list(W),
                         "elo": {"k": K, "home": HOME, "carry": CARRY}, "shots": {"alpha": SHOT_A, "carry": SHOT_CARRY}},
               "data_from": f"{FIRST}-{FIRST + 1 - 2000:02d} season",
               "data_through": max(g["day"] for g in done).isoformat() if done else None,
               "finals_used": len(done), "check": chk, "source": "NHL public API (api.nhle.com)", "games": up}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    tmp = OUT + ".tmp"
    with open(tmp, "w") as f:
        json.dump(payload, f, indent=1, sort_keys=True)
        f.write("\n")
    os.replace(tmp, OUT)
    print(f"NHL v1: {len(up)} upcoming games, {len(done)} finals -> {os.path.relpath(OUT, ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
