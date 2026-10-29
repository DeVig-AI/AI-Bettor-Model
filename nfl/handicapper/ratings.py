"""
ratings.py -- NFL Handicapper v1: our own line for every NFL game, built the way a handicapper builds one.

1. Power ratings. Every team carries, as points or EPA per play above the league average and adjusted for the
   opponent it faced: offense and defense (all plays, passes, runs, plays without turnovers) and a points rating.
   Each game moves a rating by `alpha` of the way toward what the team showed in that game; a new season starts
   from `carry` of last season's rating. Ratings only ever see games that were over before the moment they are
   read: `snapshot(game, before)` gives each team's ratings as they stood `before` kickoff (6 days, 1 day, 0).
2. Adjustments. A game's line is a linear fit of the home margin on features, each in a named group:
     base      home field (the league's recent home margin), net EPA, points rating
     matchup   passing and rushing split, and how each offense's strength meets the other defense's weakness
     schedule  rest difference, short week, travel miles
     luck      net EPA without turnovers (turnovers mostly do not repeat)
     injuries  snap share of players listed Out / Doubtful: QB, rest of offense, defense (known from the final
               injury report, so only in the late line)
   Coefficients are fit on FIT_SEASONS only; groups are kept by leave-one-season-out cross-validation inside them.
3. Win chance. P(home wins) = Phi(line / sigma), sigma = the residual spread on FIT_SEASONS.
"""
import math
from collections import defaultdict

import numpy as np
import pandas as pd

FIT_SEASONS = (2011, 2022)          # 2009-10 warm the ratings up; 2023-24 are a validation look; 2025 on is the test
INJURY_FROM = 2013                  # the availability data starts here
GRID = [dict(alpha=a, carry=c) for a in (0.04, 0.06, 0.08, 0.12) for c in (0.5, 0.7)]
FRANCHISE = {"STL": "LA", "SD": "LAC", "OAK": "LV"}
STATS = ("all", "pass", "run", "noto")
GROUPS = {
    "base": ["home", "net_epa", "mov"],
    "matchup": ["net_pass", "net_run", "mu_pass", "mu_run"],
    "schedule": ["rest", "short_week", "travel"],
    "luck": ["net_noto"],
    "injuries": ["inj_qb", "inj_off", "inj_def"],
}
HOURS = pd.Timedelta(hours=4)       # a game's result is known 4 hours after kickoff


def franchise(t):
    return FRANCHISE.get(t, t)


def kickoffs(games):
    t = pd.to_datetime(games.gameday + " " + games.gametime.fillna("13:00"))
    return t.dt.tz_localize("America/New_York").dt.tz_convert("UTC")


def team_lines(team_games):
    """{(game_id, team): {stat: (plays, epa)}} for offense."""
    out = {}
    for r in team_games.itertuples():
        out[(r.game_id, franchise(r.team))] = {
            "all": (r.plays, r.epa), "pass": (r.pass_plays, r.pass_epa),
            "run": (r.plays - r.pass_plays, r.epa - r.pass_epa), "noto": (r.noto_plays, r.noto_epa)}
    return out


def fresh():
    return {**{f"off_{s}": 0.0 for s in STATS}, **{f"def_{s}": 0.0 for s in STATS}, "mov": 0.0}


class Walk:
    """Ratings walked through every game in kickoff order, keeping each team's history so any game can read the
    ratings as they stood at any moment before it."""

    def __init__(self, games, team_games, alpha, carry):
        self.games = games.assign(kick=kickoffs(games)).sort_values(["kick", "game_id"]).reset_index(drop=True)
        self.alpha, self.carry = alpha, carry
        self.hist = defaultdict(list)                 # team -> [(ready time, season, ratings)]
        self.hfa = []                                 # (ready time, recent home margin)
        lines = team_lines(team_games)
        lg = {s: 0.0 for s in STATS}                  # league EPA per play, slowly moving
        hfa = 2.5
        cur = {}
        for g in self.games.itertuples():
            h, a = franchise(g.home_team), franchise(g.away_team)
            if pd.isna(g.home_score) or (g.game_id, h) not in lines or (g.game_id, a) not in lines:
                continue
            pre = {t: self._start(cur.get(t), g.season) for t in (h, a)}
            ready = g.kick + HOURS
            for t, o, sign in ((h, a, 1), (a, h, -1)):
                me, op = pre[t], pre[o]
                new = dict(me)
                for s in STATS:
                    n_o, e_o = lines[(g.game_id, t)][s]
                    n_d, e_d = lines[(g.game_id, o)][s]
                    if n_o:
                        new[f"off_{s}"] += alpha * ((e_o / n_o - lg[s] - op[f"def_{s}"]) - me[f"off_{s}"])
                    if n_d:
                        new[f"def_{s}"] += alpha * ((e_d / n_d - lg[s] - op[f"off_{s}"]) - me[f"def_{s}"])
                margin = sign * (g.home_score - g.away_score)
                home = sign * hfa if g.location != "Neutral" else 0.0
                new["mov"] += alpha * (margin - home - (me["mov"] - op["mov"]))
                cur[t] = (g.season, new)
                self.hist[t].append((ready, g.season, new))
            for s in STATS:
                for t in (h, a):
                    n, e = lines[(g.game_id, t)][s]
                    if n:
                        lg[s] += 0.004 * (e / n - lg[s])
            if g.location != "Neutral":
                hfa += 0.004 * ((g.home_score - g.away_score) - hfa)
                self.hfa.append((ready, hfa))

    def _start(self, entry, season):
        if entry is None:
            return fresh()
        s, r = entry
        return r if s == season else {k: v * self.carry for k, v in r.items()}

    def rating(self, team, season, when):
        h = self.hist.get(franchise(team), [])
        lo, hi = 0, len(h)
        while lo < hi:                                # last entry ready at or before `when`
            m = (lo + hi) // 2
            if h[m][0] <= when:
                lo = m + 1
            else:
                hi = m
        return self._start((h[lo - 1][1], h[lo - 1][2]) if lo else None, season)

    def home_edge(self, when):
        v = 2.5
        for t, x in self.hfa:                          # short list scan is fine: called once per game below
            if t > when:
                break
            v = x
        return v


def miles(games):
    """Away and home travel miles for each game (Research Lab stadium table)."""
    from research.lab import models as M
    bases = M.home_bases(games)
    out = []
    for g in games.itertuples():
        site = M.STADIUMS.get(g.stadium_id)
        far = [M.miles(M.STADIUMS.get(bases.get((t, g.season))), site) for t in (g.away_team, g.home_team)]
        out.append(far)
    return np.array(out)


def features(walk, games, availability, before):
    """One row per game: every feature as known `before` kickoff (a Timedelta)."""
    g = games.assign(kick=kickoffs(games)).reset_index(drop=True)
    far = miles(g)
    av = {(r.game_id, r.team): r for r in availability.itertuples()}
    hfa_t = [t for t, _ in walk.hfa]
    hfa_v = [v for _, v in walk.hfa]
    rows = []
    for i, r in enumerate(g.itertuples()):
        when = r.kick - before
        H = walk.rating(r.home_team, r.season, when)
        A = walk.rating(r.away_team, r.season, when)
        k = np.searchsorted(hfa_t, when, side="right")
        hfa = hfa_v[k - 1] if k else 2.5
        net = lambda s: (H[f"off_{s}"] - H[f"def_{s}"]) - (A[f"off_{s}"] - A[f"def_{s}"])
        ah, aa = av.get((r.game_id, r.home_team)), av.get((r.game_id, r.away_team))
        inj = lambda c: (getattr(ah, c) if ah is not None else 0.0) - (getattr(aa, c) if aa is not None else 0.0)
        rest_h, rest_a = (r.home_rest if r.home_rest == r.home_rest else 7), (r.away_rest if r.away_rest == r.away_rest else 7)
        rows.append(dict(
            game_id=r.game_id, season=r.season, game_type=r.game_type, week=r.week, kick=r.kick,
            home_team=r.home_team, away_team=r.away_team,
            actual=r.home_score - r.away_score if r.home_score == r.home_score else np.nan,
            spread_line=r.spread_line,
            home=hfa if r.location != "Neutral" else 0.0,
            net_epa=net("all"), mov=H["mov"] - A["mov"],
            net_pass=net("pass"), net_run=net("run"),
            mu_pass=H["off_pass"] * A["def_pass"] - A["off_pass"] * H["def_pass"],
            mu_run=H["off_run"] * A["def_run"] - A["off_run"] * H["def_run"],
            rest=float(np.clip(rest_h - rest_a, -7, 7)),
            short_week=float(rest_h <= 5) - float(rest_a <= 5),
            travel=(far[i][0] - far[i][1]) / 1000.0,
            net_noto=net("noto"),
            inj_qb=inj("out_qb"), inj_off=inj("out_off"), inj_def=inj("out_def"),
        ))
    return pd.DataFrame(rows)


def cols(groups):
    return [c for gname in groups for c in GROUPS[gname]]


def fit(X, y):
    A = np.column_stack([X, np.ones(len(X))])
    b, *_ = np.linalg.lstsq(A, y, rcond=None)
    return b


def predict(b, X):
    return np.column_stack([X, np.ones(len(X))]) @ b


def cv_mae(df, groups):
    """Leave-one-season-out MAE of the home margin over the rows of `df`."""
    c = cols(groups)
    err = []
    for s in sorted(df.season.unique()):
        tr, te = df[df.season != s], df[df.season == s]
        b = fit(tr[c].values, tr.actual.values)
        err.append(np.abs(predict(b, te[c].values) - te.actual.values))
    return float(np.mean(np.concatenate(err)))


def select(df, candidates, start=("base",)):
    """Forward selection of feature groups by leave-one-season-out MAE; a group stays only if it lowers it."""
    chosen = list(start)
    best = cv_mae(df, chosen)
    trail = [(tuple(chosen), round(best, 4))]
    left = [c for c in candidates if c not in chosen]
    while left:
        scores = {c: cv_mae(df, chosen + [c]) for c in left}
        c = min(scores, key=scores.get)
        if scores[c] >= best:
            break
        chosen.append(c)
        best = scores[c]
        left.remove(c)
        trail.append((tuple(chosen), round(best, 4)))
    return chosen, best, trail


def win_prob(line, sigma):
    return 0.5 * (1.0 + np.vectorize(math.erf)(np.asarray(line) / (sigma * math.sqrt(2.0))))
