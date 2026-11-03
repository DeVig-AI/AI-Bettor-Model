#!/usr/bin/env python3
"""
cfb_model_live.py -- DeVig's own college football model (FBS vs FBS), run on this season's games. Tracked on the Models
page as a challenger ("devigcfb"), graded on the same games as Kalshi, FBS Elo, CFB Rankings and the Research Lab's
leader; it is not the app's CFB pick (CFB_MODEL_V1_PREREG.md). Display and comparison only: nothing here is bet.
Not a claimed edge over Kalshi.

Each team carries, game to game in date order (all from games already played):
  m    a margin rating in points: after each game both teams move by k x (margin - expected margin); k starts higher
       for a team's first games of a season and settles (K_EARLY -> K, half-life in games EARLY_N)
  o, d opponent-adjusted offense and defense, in EPA per play with garbage time left out: after each game a team's
       offense moves by KE x (its EPA/play - (league + its offense + the opponent's defense)), and the opponent's
       defense the same way. Higher o is better; higher d is worse (EPA allowed)
At a new season every number is pulled toward even (CARRY, CARRY_E), and a team's o moves with its returning
production (RET x (percent of last year's PPA returning - 0.5)).

Expected home margin = W_HOME x (not neutral) + W_M x (m_home - m_away) + W_E x ((o - d)_home - (o - d)_away) x 100
Home win chance = logistic(A + B x expected margin).

Data: the Research Lab's CollegeFootballData copy (2009-2024, private Actions cache, never committed: Constitution
C1a) plus this season's weekly refresh (research/cfb/current/<season>/). The sealed 2025 season is never read, so the
ratings go from 2024 straight to 2026. This file only reads those tables; it makes no API call.

The settings above (FROZEN) were picked by `fit` on 2012-2017 and are frozen with CFB_MODEL_V1_PREREG.md; any change
is a v2. `fit` reruns the selection and `compare` scores this season's graded games; both print summary numbers only.

Out: live/devig/cfb.json -- {generated_at, sport, model, data_through, finals_used, games: [{game_id, kickoff, date,
home, away, home_name, away_name, neutral, home_wp, home_line, parts: {m, e}}]} for games in the next 10 days. CFBD
game ids are ESPN's, so tools/models_compare.py reads it as the "devigcfb" model by id.

Usage:  python3 tools/cfb_model_live.py          (write live/devig/cfb.json; skipped when the data isn't here)
        python3 tools/cfb_model_live.py fit      (in Actions with the cache: settings search + backtest summary)
        python3 tools/cfb_model_live.py compare PICKS RESULTS   (this season's graded games vs the Models page)
"""
import itertools
import json
import math
import os
import sys
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)
OUT = os.path.join(ROOT, "live", "devig", "cfb.json")
SEALED = 2025
AHEAD = timedelta(days=10)
VERSION = "cfb-v1"

FIT, CHECK, TEST = range(2012, 2018), range(2018, 2020), range(2021, 2025)

# frozen settings (CFB_MODEL_V1_PREREG.md), from `fit` (Actions run 41660284149's selection)
FROZEN = {"settings": {"k": 0.09, "k_early": 0.18, "early_n": 4, "carry": 0.9, "ke": 0.04, "carry_e": 0.0, "ret": 80},
          "weights": {"home": 3.0538, "m": 0.9227, "e": 0.1124},
          "win_chance": {"a": -0.04246, "b": 0.11428}}


def iso(t):
    return t.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ================================================================ the model (pure: no files, no network)

def games_from(data):
    """data: the Lab's assembled tables (games, team_games_ngt, team_games, returning) -> plain dicts in date order.
    Each game: id, season, week, start key, home, away, neutral, margin (None if not played), and each side's
    offensive EPA/play (garbage time left out; the full game when that is missing)."""
    eff = {}
    for name in ("team_games", "team_games_ngt"):                  # ngt second: it wins where both exist
        df = data.get(name)
        if df is None:
            continue
        for r in df.itertuples(index=False):
            if r.plays and r.plays > 0:
                eff[(str(r.game_id), r.team)] = float(r.epa) / float(r.plays)
    ret = {}
    if data.get("returning") is not None:
        for r in data["returning"].itertuples(index=False):
            if r.percent_ppa == r.percent_ppa:                     # not NaN
                ret[(int(r.season), r.team)] = float(r.percent_ppa)
    out = []
    for r in data["games"].itertuples(index=False):
        hs, as_ = r.home_score, r.away_score
        played = hs == hs and as_ == as_ and hs is not None and as_ is not None
        out.append({"id": str(r.game_id), "season": int(r.season), "week": r.week, "day": str(r.gameday),
                    "time": str(r.gametime), "home": r.home_team, "away": r.away_team,
                    "neutral": r.location == "Neutral", "margin": float(hs - as_) if played else None,
                    "line": float(r.spread_line) if r.spread_line == r.spread_line and r.spread_line is not None else None,
                    "eh": eff.get((str(r.game_id), r.home_team)) if played else None,
                    "ea": eff.get((str(r.game_id), r.away_team)) if played else None})
    out.sort(key=lambda g: (g["season"], g["day"], g["time"], g["id"]))
    return out, ret


class Ratings:
    def __init__(self, P, ret=None):
        self.P, self.ret = P, ret or {}
        self.m, self.o, self.d, self.n = {}, {}, {}, {}
        self.lg, self.season = 0.0, None

    def new_season(self, season):
        if season == self.season:
            return
        P = self.P
        for t in self.m:
            self.m[t] *= P["carry"]
        for t in self.o:
            r = self.ret.get((season, t))
            self.o[t] = P["carry_e"] * self.o[t] + (P["ret"] * (r - 0.5) / 100 if r is not None else 0.0)
            self.d[t] *= P["carry_e"]
        self.n, self.season = {}, season

    def parts(self, home, away):
        g = lambda dct, t: dct.get(t, 0.0)               # noqa: E731
        return {"m": g(self.m, home) - g(self.m, away),
                "e": ((g(self.o, home) - g(self.d, home)) - (g(self.o, away) - g(self.d, away))) * 100}

    def update(self, g, pred_margin):
        P, h, a = self.P, g["home"], g["away"]
        for t, s in ((h, 1), (a, -1)):
            n = self.n.get(t, 0)
            k = P["k"] + (P["k_early"] - P["k"]) * math.exp(-n / P["early_n"])
            self.m[t] = self.m.get(t, 0.0) + s * k * (g["margin"] - pred_margin)
            self.n[t] = n + 1
        for off, dfn, e in ((h, a, g["eh"]), (a, h, g["ea"])):
            if e is None:
                continue
            res = e - (self.lg + self.o.get(off, 0.0) + self.d.get(dfn, 0.0))
            self.o[off] = self.o.get(off, 0.0) + P["ke"] * res
            self.d[dfn] = self.d.get(dfn, 0.0) + P["ke"] * res
            self.lg += 0.002 * res


def margin(W, parts, neutral):
    return W["home"] * (0 if neutral else 1) + W["m"] * parts["m"] + W["e"] * parts["e"]


def run(games, P, W, ret=None):
    """Every game, each with the parts and expected margin from the ratings before it. Margin ratings update on the
    model's own expected margin (W), so W is part of the run; `fit` solves W and the run together (a few rounds)."""
    r, out = Ratings(P, ret), []
    for g in games:
        r.new_season(g["season"])
        p = r.parts(g["home"], g["away"])
        mu = margin(W, p, g["neutral"])
        out.append((g, p, mu))
        if g["margin"] is not None:
            r.update(g, W["home"] * (0 if g["neutral"] else 1) + p["m"])   # m learns from margins alone
    return r, out


def logistic(a, b, x):
    z = max(-30.0, min(30.0, a + b * x))
    return 1 / (1 + math.exp(-z))


# ================================================================ fitting (least squares, logistic), pure Python

def ols(X, y):
    k = len(X[0])
    A = [[sum(x[i] * x[j] for x in X) for j in range(k)] for i in range(k)]
    v = [sum(x[i] * t for x, t in zip(X, y)) for i in range(k)]
    for i in range(k):                                   # Gauss-Jordan
        p = max(range(i, k), key=lambda r: abs(A[r][i]))
        A[i], A[p], v[i], v[p] = A[p], A[i], v[p], v[i]
        for r in range(k):
            if r != i and A[i][i]:
                f = A[r][i] / A[i][i]
                A[r] = [a - f * b for a, b in zip(A[r], A[i])]
                v[r] -= f * v[i]
    return [v[i] / A[i][i] for i in range(k)]


def fit_logit(xs, ys):
    a, b = 0.0, 0.1
    for _ in range(60):
        ga = gb = haa = hab = hbb = 0.0
        for x, y in zip(xs, ys):
            p = logistic(a, b, x)
            r, w = y - p, p * (1 - p)
            ga += r; gb += r * x; haa += w; hab += w * x; hbb += w * x * x
        det = haa * hbb - hab * hab
        if not det:
            break
        a += (hbb * ga - hab * gb) / det
        b += (haa * gb - hab * ga) / det
    return a, b


def fit_weights(out, seasons):
    rows = [(g, p) for g, p, _ in out if g["season"] in seasons and g["margin"] is not None]
    X = [[0 if g["neutral"] else 1, p["m"], p["e"]] for g, p in rows]
    w = ols(X, [g["margin"] for g, _ in rows])
    return {"home": w[0], "m": w[1], "e": w[2]}


def summary(out, W, A, B, seasons):
    rows = [(g, mu) for g, _, mu in out if g["season"] in seasons and g["margin"] is not None and g["margin"] != 0]
    if not rows:
        return None
    ll = acc = mae = 0.0
    line = [(g, mu) for g, mu in rows if g["line"] is not None]
    for g, mu in rows:
        p = min(max(logistic(A, B, mu), 1e-6), 1 - 1e-6)
        y = 1 if g["margin"] > 0 else 0
        ll -= y * math.log(p) + (1 - y) * math.log(1 - p)
        acc += (p > 0.5) == (y == 1)
        mae += abs(g["margin"] - mu)
    home = sum(g["margin"] > 0 for g, _ in rows) / len(rows)
    base = -sum(math.log(home) if g["margin"] > 0 else math.log(1 - home) for g, _ in rows) / len(rows)
    bands = []
    for lo, hi in ((0, .2), (.2, .4), (.4, .6), (.6, .8), (.8, 1.01)):
        b = [(logistic(A, B, mu), g["margin"] > 0) for g, mu in rows if lo <= logistic(A, B, mu) < hi]
        if b:
            bands.append({"lo": lo, "hi": min(hi, 1), "n": len(b), "said": round(sum(p for p, _ in b) / len(b), 3),
                          "won": round(sum(y for _, y in b) / len(b), 3)})
    s = {"games": len(rows), "log_loss": round(ll / len(rows), 4), "home_rate_log_loss": round(base, 4),
         "accuracy": round(acc / len(rows), 3), "margin_mae": round(mae / len(rows), 2), "bands": bands}
    if line:   # the closing line, never an input: how far its margin and ours were from what happened, same games
        s["with_line"] = {"games": len(line), "model_mae": round(sum(abs(g["margin"] - mu) for g, mu in line) / len(line), 2),
                          "line_mae": round(sum(abs(g["margin"] - g["line"]) for g, _ in line) / len(line), 2),
                          "line_ats_model": round(sum((mu - g["line"] > 0) == (g["margin"] - g["line"] > 0)
                                                      for g, mu in line if g["margin"] - g["line"] != 0 and mu - g["line"] != 0)
                                                  / max(1, sum(1 for g, mu in line if g["margin"] - g["line"] != 0 and mu - g["line"] != 0)), 3)}
    return s


def solve(games, ret, P, seasons, rounds=3):
    W = {"home": 2.5, "m": 1.0, "e": 0.0}
    for _ in range(rounds):
        _, out = run(games, P, W, ret)
        W = fit_weights(out, seasons)
    _, out = run(games, P, W, ret)
    xs = [mu for g, _, mu in out if g["season"] in seasons and g["margin"] not in (None, 0)]
    ys = [1 if g["margin"] > 0 else 0 for g, _, _ in out if g["season"] in seasons and g["margin"] not in (None, 0)]
    A, B = fit_logit(xs, ys)
    return W, A, B, out


GRID = {"k": [0.09], "k_early": [0.18], "early_n": [4], "carry": [0.85, 0.9],
        "ke": [0.02, 0.04, 0.07], "carry_e": [0.0, 0.1, 0.2], "ret": [80, 120, 160]}


SHRINK = [1.0, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7]


def fit(games, ret):
    fit_s = set(FIT)
    best = None
    for vals in itertools.product(*GRID.values()):
        P = dict(zip(GRID, vals))
        W, A, B, out = solve(games, ret, P, fit_s, rounds=2)
        s = summary(out, W, A, B, fit_s)
        print(json.dumps({"P": P, "mae": s["margin_mae"], "ll": s["log_loss"]}), flush=True)
        if best is None or s["margin_mae"] < best[0]:
            best = (s["margin_mae"], P)
    P = best[1]
    W, A, B, out = solve(games, ret, P, fit_s)
    # the scores-only margin rating alone, same seasons, for comparison
    W0 = {"home": W["home"], "m": 1.0, "e": 0.0}
    _, out0 = run(games, dict(P), W0, ret)
    xs = [mu for g, _, mu in out0 if g["season"] in fit_s and g["margin"] not in (None, 0)]
    A0, B0 = fit_logit(xs, [1 if g["margin"] > 0 else 0 for g, _, _ in out0 if g["season"] in fit_s and g["margin"] not in (None, 0)])
    # the win chance came out a little too sure at the extremes on unseen seasons: shrink it toward 50%, the shrink
    # picked on the check seasons (2018-2019) only
    chk = set(CHECK)
    c = min(SHRINK, key=lambda c: summary(out, W, A * c, B * c, chk)["log_loss"])
    rep = {"settings": P, "weights": {k: round(v, 4) for k, v in W.items()}, "shrink": c,
           "win_chance_unshrunk": {"a": round(A, 5), "b": round(B, 5)}}
    A, B = A * c, B * c
    rep["win_chance"] = {"a": round(A, 5), "b": round(B, 5)}
    for name, ss in (("fit", FIT), ("check", CHECK), ("test", TEST)):
        rep[name] = summary(out, W, A, B, set(ss))
        rep[name + "_scores_only"] = summary(out0, W0, A0, B0, set(ss))
    print("RESULT " + json.dumps(rep))
    return rep


def compare(out, A, B, picks_path, results_path, season):
    """This season's graded CFB games on the Models page (live/models/picks.jsonl + results.jsonl): the frozen model's
    chance for each from the ratings before that game (a replay, not a live lock) next to every other model's last
    number before kickoff, on the games every model has. Prints summary numbers only."""
    res = {}
    for ln in open(results_path):
        r = json.loads(ln)
        if r.get("sport") == "CFB" and r.get("home_score") is not None and r["home_score"] != r["away_score"]:
            res[str(r["game_id"])] = 1 if r["home_score"] > r["away_score"] else 0
    last = {}
    for ln in open(picks_path):
        r = json.loads(ln)
        if r.get("sport") != "CFB" or r.get("home_wp") is None or str(r["game_id"]) not in res:
            continue
        if r.get("at") and r.get("kickoff") and r["at"] > r["kickoff"]:
            continue
        k = (r["model"], str(r["game_id"]))
        if k not in last or r["at"] >= last[k]["at"]:
            last[k] = r
    by = {}
    for (m, gid), r in last.items():
        by.setdefault(m, {})[gid] = float(r["home_wp"])
    mine = {g["id"]: logistic(A, B, mu) for g, _, mu in out if g["season"] == season and g["id"] in res}
    by["devig"] = mine
    def table(models):
        ids = sorted(set.intersection(*(set(by.get(m, {})) for m in models)))
        rows = {}
        for m in models:
            ll = acc = 0.0
            for gid in ids:
                p, y = min(max(by[m][gid], 1e-6), 1 - 1e-6), res[gid]
                ll -= y * math.log(p) + (1 - y) * math.log(1 - p)
                acc += (p > 0.5) == (y == 1)
            rows[m] = {"log_loss": round(ll / len(ids), 4), "accuracy": round(acc / len(ids), 3)} if ids else None
        return {"games": len(ids), "models": rows}
    others = sorted(m for m in by if m != "devig")
    rep = {"graded_cfb_games": len(res), "devig_has": len(mine), "picks_by_model": {m: len(by[m]) for m in sorted(by)},
           "all_four": table(["devig"] + [m for m in ("kalshi", "cfbelo", "cfbrank") if m in by]),
           "each": {m: table(["devig", m]) for m in others}}
    print("COMPARE " + json.dumps(rep))
    return rep


# ================================================================ data (the Lab's cache + the current-season refresh)

def load(now, with_current=True):
    os.environ["LAB_SPORT"] = "CFB"
    from research.lab import config as C
    C.use("CFB")
    from research.lab import cfb_data as D
    import pandas as pd
    season = D.current_season(now.date())
    cur = os.path.join(C.CFB_DIR, "current", str(season))
    if not os.path.exists(D._path(C.DATA_DIR, "games")):
        return None, season
    t = {}
    for k in D.KINDS:
        lab = D._read(C.DATA_DIR, k)
        lab = lab[pd.to_numeric(lab.season, errors="coerce") <= min(C.LAB_MAX_SEASON, SEALED - 1)]   # never 2025
        parts = [lab]
        if with_current and season > SEALED and os.path.exists(D._path(cur, "games")):
            parts.append(D._read(cur, k))
        t[k] = pd.concat(parts, ignore_index=True)
    data = D.assemble(t)
    if (data["games"].season == SEALED).any():
        raise RuntimeError("sealed season rows reached the DeVig CFB model")
    return data, season


def start_of(raw, gid):
    import pandas as pd
    if gid not in raw.index:
        return None
    s = pd.Timestamp(raw.loc[gid, "start"])
    if pd.isna(s):
        return None
    return (s.tz_convert("UTC") if s.tzinfo else s.tz_localize("UTC")).to_pydatetime()


def main(argv):
    now = datetime.now(timezone.utc)
    if os.environ.get("CFB_MODEL_NOW"):
        now = datetime.fromisoformat(os.environ["CFB_MODEL_NOW"].replace("Z", "+00:00"))
    data, season = load(now, with_current=argv[:1] != ["fit"])
    if data is None:
        print("CFB model: the Lab's CFB data isn't here (it lives in the Actions cache): skipped")
        return 0
    games, ret = games_from(data)
    if argv[:1] == ["fit"]:
        fit(games, ret)
        return 0
    if FROZEN is None:
        raise SystemExit("CFB model: no frozen settings yet (run `fit` first)")
    P, W, A, B = FROZEN["settings"], FROZEN["weights"], FROZEN["win_chance"]["a"], FROZEN["win_chance"]["b"]
    _, out = run(games, P, W, ret)
    if argv[:1] == ["compare"]:
        compare(out, A, B, argv[1], argv[2], season)
        return 0
    import pandas as pd
    from research.lab import config as C, cfb_data as D
    raw = pd.concat([D._read(os.path.join(C.CFB_DIR, "current", str(season)), "games")], ignore_index=True)
    raw = raw.drop_duplicates("game_id").assign(game_id=lambda x: x.game_id.astype(str)).set_index("game_id")
    up = []
    for g, p, mu in out:
        if g["season"] != season or g["margin"] is not None:
            continue
        k = start_of(raw, g["id"])
        if not k or not (now < k <= now + AHEAD):
            continue
        up.append({"game_id": g["id"], "kickoff": iso(k), "date": g["day"], "home": g["home"], "away": g["away"],
                   "home_name": g["home"], "away_name": g["away"],
                   "neutral": g["neutral"], "home_wp": round(logistic(A, B, mu), 4), "home_line": round(-mu, 1),
                   "parts": {k2: round(v, 3) for k2, v in p.items()}})
    up.sort(key=lambda x: (x["kickoff"], x["game_id"]))
    done = [g for g in games if g["season"] == season and g["margin"] is not None]
    payload = {"generated_at": iso(now), "sport": "CFB",
               "model": {"id": VERSION, "name": "DeVig CFB v1", "file": "cfb/CFB_MODEL_V1_PREREG.md", **FROZEN},
               "data_through": max(g["day"] for g in done) if done else None, "finals_used": len(done),
               "source": "CollegeFootballData via the Lab's private cache (2009-2024) + this season's weekly refresh; "
                         "sealed 2025 skipped", "games": up}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT + ".tmp", "w") as f:
        json.dump(payload, f, indent=1, sort_keys=True)
        f.write("\n")
    os.replace(OUT + ".tmp", OUT)
    print(f"CFB v1: {len(up)} upcoming games, {len(done)} finals this season -> {os.path.relpath(OUT, ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
