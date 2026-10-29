"""
qb.py -- NFL Handicapper v2: quarterback ratings and who is expected to start.

Every quarterback carries a rating: 538's per-game QB VALUE (research.lab.models.qb_value) of the games he started,
each start moving the rating `alpha` of the way toward that game's value; a new season starts from `carry` of the way
between the league's average starter and his rating. A quarterback with no start yet is rated at DEBUT, the average
value of a first career start in the fit seasons (the usual backup).

Expected starter of a team at a moment: the starter of its last game over by then. In the late line (1 day before
kickoff) a team whose final injury report lists Out / Doubtful quarterbacks holding at least half its recent snaps
(availability out_qb >= 0.5) is expected to start a backup, rated DEBUT. Nothing here looks past the moment asked.

Features (home minus away):
  qb         the expected starters' ratings
  qb_change  each expected starter's rating minus the average rating of the team's starters in its last 4 games
             (the team ratings already carry how those games went)
"""
from bisect import bisect_right
from collections import defaultdict

import numpy as np
import pandas as pd

from ratings import HOURS, franchise, kickoffs
from research.lab.models import qb_value

RECENT = 4
OUT_QB = 0.5


def starters(qb_games):
    """{(game_id, team): (qb_id, value)} for the player with the most dropbacks and carries in each team-game."""
    q = qb_games.assign(load=qb_games.att + qb_games.sacks + qb_games.ratt)
    q = q.sort_values("load", ascending=False).drop_duplicates(["game_id", "team"])
    return {(r.game_id, franchise(r.team)): (r.qb_id, qb_value(r)) for r in q.itertuples()}


def debut_value(games, qb_games, seasons):
    """Average VALUE of a quarterback's first start, over starts in `seasons`."""
    st = starters(qb_games)
    g = games.assign(kick=kickoffs(games)).sort_values("kick")
    seen, vals = set(), []
    for r in g.itertuples():
        for t in (franchise(r.home_team), franchise(r.away_team)):
            s = st.get((r.game_id, t))
            if s and s[0] not in seen:
                seen.add(s[0])
                if seasons[0] <= r.season <= seasons[1]:
                    vals.append(s[1])
    return float(np.mean(vals))


class QBWalk:
    def __init__(self, games, qb_games, alpha, carry, debut, league):
        self.alpha, self.carry, self.debut, self.league = alpha, carry, debut, league
        st = starters(qb_games)
        self.qb_hist = defaultdict(list)            # qb -> [(ready, season, rating)]
        self.team_starts = defaultdict(list)        # team -> [(ready, qb)]
        g = games.assign(kick=kickoffs(games)).sort_values(["kick", "game_id"])
        for r in g.itertuples():
            if pd.isna(r.home_score):
                continue
            ready = r.kick + HOURS
            for t in (franchise(r.home_team), franchise(r.away_team)):
                s = st.get((r.game_id, t))
                if not s:
                    continue
                qid, v = s
                h = self.qb_hist[qid]                   # games run in order: the last entry is the latest
                old = self._carried(h[-1], r.season) if h else self.debut
                self.qb_hist[qid].append((ready, r.season, old + alpha * (v - old)))
                self.team_starts[t].append((ready, qid))
        self._times = {k: [x[0] for x in v] for k, v in self.qb_hist.items()}
        self._ttimes = {k: [x[0] for x in v] for k, v in self.team_starts.items()}

    def rating(self, qid, season, when):
        i = bisect_right(self._times.get(qid, []), when)
        return self._carried(self.qb_hist[qid][i - 1], season) if i else self.debut

    def _carried(self, entry, season):
        _, s, r = entry
        return r if s == season else self.league + self.carry * (r - self.league)

    def last_starter(self, team, when):
        team = franchise(team)
        i = bisect_right(self._ttimes.get(team, []), when)
        return self.team_starts[team][i - 1][1] if i else None

    def expected(self, team, season, when, out=False):
        """(expected starter rating, average rating of the last RECENT starters) for `team` at `when`."""
        team = franchise(team)
        starts = self.team_starts.get(team, [])
        i = bisect_right(self._ttimes.get(team, []), when)
        recent = [self.rating(q, season, when) for _, q in starts[max(0, i - RECENT):i]]
        avg = float(np.mean(recent)) if recent else self.debut
        if out or not i:
            return self.debut, avg
        return self.rating(starts[i - 1][1], season, when), avg


def features(qbw, games, availability, before, use_injuries):
    """DataFrame game_id, qb, qb_change as known `before` kickoff."""
    g = games.assign(kick=kickoffs(games))
    av = {(r.game_id, r.team): r.out_qb for r in availability.itertuples()}
    rows = []
    for r in g.itertuples():
        when = r.kick - before
        vals = []
        for t in (r.home_team, r.away_team):
            out = use_injuries and av.get((r.game_id, t), 0.0) >= OUT_QB
            vals.append(qbw.expected(t, r.season, when, out))
        (qh, ah), (qa, aa) = vals
        rows.append(dict(game_id=r.game_id, qb=qh - qa, qb_change=(qh - ah) - (qa - aa)))
    return pd.DataFrame(rows)
