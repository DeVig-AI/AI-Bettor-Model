#!/usr/bin/env python3
"""
stats_wnba.py -- the Research section's WNBA files, built exactly like the NBA's (tools/stats_nba.py) from ESPN's WNBA
box scores as published by sportsdataverse: DeVig's power rankings, team stats with league ranks, and every player's
averages and game log, this season and last. Display only: nothing here feeds a model, a pick or a test.

Differences from the NBA: a season is one calendar year (May to October), the league's teams are read from the data
(expansion teams join on their own; the All-Star game's one-off teams are left out) and team codes are ESPN's, as the
app's WNBA games use. Output: stats/wnba/. Run by .github/workflows/stats.yml.
"""
import importlib.util
import os
import sys
import tempfile
from datetime import datetime, timezone

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
# its own copy of stats_nba, so switching it to the WNBA never changes the NBA module (both can run in one process)
_spec = importlib.util.spec_from_file_location("stats_nba_for_wnba", os.path.join(HERE, "stats_nba.py"))
N = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(N)

MIN_GAMES = 3                                    # a team: 3+ regular-season games (All-Star teams play one)


def season_of(now):
    """The season under way or just finished: this year from May, last year before."""
    return now.year if now.month >= 5 else now.year - 1


def teams_in(cache, years):
    out = set()
    for y in years:
        path = N.fetch("team", y, cache)
        if not path:
            continue
        t = pd.read_csv(path, low_memory=False)
        n = t[t.season_type == 2].groupby("team_abbreviation").size()
        out |= set(str(a).upper() for a, k in n.items() if k >= MIN_GAMES)
    return out


OUT = os.path.join(HERE, "..", "stats", "wnba")


def use_wnba():
    N.SPORT = "WNBA"
    N.OUT = OUT
    N.URL = "https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_wnba_{kind}_boxscores/{kind}_box_{y}.csv"
    N.season_of = season_of
    N.label = str
    N.code = lambda a: str(a).upper()


def build(now, cache):
    use_wnba()
    y = season_of(now)
    N.TEAMS = teams_in(cache, (y, y - 1))
    return N.build(now, cache)


def main():
    cache = os.getenv("STATS_CACHE") or tempfile.mkdtemp()
    n = build(datetime.now(timezone.utc), cache)
    print(f"WNBA research files: {n} players")
    return 0


if __name__ == "__main__":
    sys.exit(main())
