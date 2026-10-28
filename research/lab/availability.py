"""Who is missing, by playing time, NFL (Constitution v13 B1, A3.3e): one row per team-game with the share of the team's recent snaps
held by players its final injury report listed Out or Doubtful for that game.

Sources (nflverse-data releases, public): weekly injury reports (gsis id, report status), snap counts (offense and
defense share per player per game, pro-football-reference ids, from 2013) and the players table that links the two
ids. Everything a row holds is known before kickoff: the injury report is published before the game, and the snap
shares come only from the team's previous games (`WINDOW` of them, a player who did not play in one counts 0 there),
so a player out for weeks has already faded from the team's recent snaps -- and from its recent statistics.
(The v12 `injury` signals count regulars; these weight each missing player by how much he has been playing.)

Columns: out_qb, out_ol, out_skill (RB/FB/WR/TE), out_front (DL/LB), out_db (CB/S), out_off (offense, QB left out:
qb_change covers the quarterback) and out_def -- each a sum of snap shares (1.0 = one full-time player) -- and
listed_out (how many players were listed Out or Doubtful).
"""
import io
from collections import defaultdict, deque

import pandas as pd

from . import config as C

FIRST = 2013                   # nflverse snap counts are empty for 2012; earlier seasons get no row (the signal reads 0)
WINDOW = 4
OUT = ("Out", "Doubtful")
COLS = ["season", "game_id", "team", "out_qb", "out_ol", "out_skill", "out_front", "out_db", "out_off", "out_def",
        "listed_out"]
UNITS = {"QB": "qb", "T": "ol", "G": "ol", "C": "ol", "OL": "ol", "OT": "ol", "OG": "ol",
         "RB": "skill", "FB": "skill", "WR": "skill", "TE": "skill",
         "DE": "front", "DT": "front", "NT": "front", "DL": "front", "LB": "front", "OLB": "front", "ILB": "front",
         "MLB": "front", "CB": "db", "S": "db", "FS": "db", "SS": "db", "DB": "db"}


def _csv(get, url):
    return pd.read_csv(io.BytesIO(get(url)), low_memory=False)


def download(seasons, get):
    """(injuries, snaps, players) for `seasons` from nflverse-data, using the caller's downloader."""
    inj = pd.concat([_csv(get, C.INJURIES_URL.format(season=s)) for s in seasons], ignore_index=True)
    snaps = pd.concat([_csv(get, C.SNAPS_URL.format(season=s)) for s in seasons], ignore_index=True)
    players = _csv(get, C.PLAYERS_URL)[["gsis_id", "pfr_id"]].dropna()
    return inj, snaps, players


def build(games, injuries, snaps, players):
    """COLS rows for every game in `games` that has snap counts before it (team codes as in the schedule)."""
    g = games[games.season >= FIRST].sort_values(["gameday", "gametime", "game_id"], na_position="last")
    pfr = dict(zip(players.gsis_id, players.pfr_id))
    listed = defaultdict(list)                     # (season, week, team) -> pfr ids listed Out / Doubtful
    for r in injuries[injuries.report_status.isin(OUT)].itertuples():
        if r.gsis_id in pfr:
            listed[(int(r.season), int(r.week), r.team)].append(pfr[r.gsis_id])
    by_game = {k: v for k, v in snaps.groupby(["game_id", "team"])}
    unit = {}
    recent = defaultdict(lambda: deque(maxlen=WINDOW))   # team -> its last WINDOW games: {pfr id: (off, def)}
    rows = []
    for r in g.itertuples():
        for t in (r.home_team, r.away_team):
            past = recent[t]
            if past:
                ids = listed.get((int(r.season), int(r.week), t), [])
                row = dict(season=r.season, game_id=r.game_id, team=t, listed_out=len(ids),
                           **{c: 0.0 for c in COLS[3:-1]})
                for p in ids:
                    off = sum(x.get(p, (0.0, 0.0))[0] for x in past) / len(past)
                    dfn = sum(x.get(p, (0.0, 0.0))[1] for x in past) / len(past)
                    u = unit.get(p)
                    if u:
                        row["out_" + u] += off if u in ("qb", "ol", "skill") else dfn
                    if u != "qb":
                        row["out_off"] += off
                    row["out_def"] += dfn
                rows.append(row)
        for t in (r.home_team, r.away_team):       # then this game's snaps join the window
            s = by_game.get((r.game_id, t))
            if s is None:
                continue
            recent[t].append({p: (float(o or 0), float(d or 0))
                              for p, o, d in zip(s.pfr_player_id, s.offense_pct, s.defense_pct)})
            for p, pos in zip(s.pfr_player_id, s.position):
                if pos in UNITS:
                    unit[p] = UNITS[pos]
    out = pd.DataFrame(rows, columns=COLS)
    for c in COLS[3:-1]:
        out[c] = out[c].round(4)
    return out
