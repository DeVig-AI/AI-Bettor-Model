#!/usr/bin/env python3
"""
props_samegame_history.py -- how often two Kalshi player props from the SAME game both hit, compared with their
two chances multiplied (what a parlay calculator assumes). Writes stats/props_samegame.json for the v2 Parlay page.

Descriptive only, on prices already used elsewhere (the props history CSVs and the live props bots' graded rungs,
the same rows tools/props_ladder_history.py reads). It is not a pre-registered test and the app never calls it an edge.

Rows: every rung with a usable price (0 < bid <= ask < 1, ask - bid <= 6c), settled yes / no. A rung's chance is
Kalshi's midpoint (Over = (bid + ask) / 2, Under = 1 - that). Each player's stat in a game is represented by ONE rung,
the one priced closest to 50/50, so a player with many lines doesn't count many times.
Pairs: two different player-stats in the same game, grouped by
  * relation: same player with overlapping stats (points and points+rebounds; NHL points and goals),
              same player with separate stats, teammates, opponents (team read from the Kalshi ticker);
  * sides:    both Over, both Under, one of each.
  * baseline: the same side mixes for two rungs from DIFFERENT games (each game paired with the next one in a seeded
    shuffle). Overs and Unders aren't exactly priced on their own, so pairs from different games already land a bit
    off the multiplied chance; "factor" = a same-game group's ratio / the baseline's ratio is the part that comes from
    sharing a game.
For each group: pairs, games, the multiplied chance summed (expected both-hit count), the actual both-hit count and
their ratio, with a 95% interval from resampling whole games (2,000 draws, seed 20261103). Groups under 2,000 pairs
are left out. Run from the repo root:  python3 tools/props_samegame_history.py
"""
import collections, csv, glob, json, os, sqlite3
from datetime import datetime, timezone
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPORTS = {"nba": "nba/NBA_PROPS_MODEL_V2_LOG.sqlite3", "nhl": "nhl/NHL_PROPS_MODEL_V1_LOG.sqlite3"}
MAX_SPREAD, MIN_PAIRS, DRAWS, SEED = 0.06, 2000, 2000, 20261103
PARTS = {"points": {"points"}, "rebounds": {"rebounds"}, "assists": {"assists"}, "threes": {"threes", "points"},
         "pts_reb_ast": {"points", "rebounds", "assists"}, "pts_reb": {"points", "rebounds"},
         "pts_ast": {"points", "assists"}, "reb_ast": {"rebounds", "assists"}, "stl_blk": {"steals", "blocks"},
         "steals": {"steals"}, "blocks": {"blocks"},
         # NHL: points = goals + assists
         "goals": {"goals"}, "nhl_points": {"goals", "assists"}, "nhl_assists": {"assists"}, "shots": {"shots", "goals"}}


def parts(sport, stat):
    if sport == "nhl" and stat in ("points", "assists"):
        stat = "nhl_" + stat
    return PARTS.get(stat, {stat})


def team_of(ticker):
    """KXNBA3PT-26JAN31DALHOU-HOUATHOMPSON1-5 -> HOU (the player part starts with the team code)"""
    bits = ticker.split("-")
    if len(bits) < 3 or len(bits[1]) < 9:
        return None
    teams, who = bits[1][7:], bits[2]
    for k in (3, 2, 4):
        c = who[:k]
        if len(teams) > k and (teams.startswith(c) or teams.endswith(c)):
            return c
    return None


def ok(b, a):
    return b is not None and a is not None and 0 < b <= a < 1 and a - b <= MAX_SPREAD


def load(sport):
    rows, seen = [], set()
    for f in sorted(glob.glob(os.path.join(ROOT, sport, "props_history", "kalshi", "*.csv"))):
        with open(f, newline="") as fh:
            for r in csv.DictReader(fh):
                try:
                    b, a = float(r["yes_bid"]), float(r["yes_ask"])
                except (ValueError, TypeError):
                    continue
                if r.get("result") in ("yes", "no") and ok(b, a):
                    rows.append((r["ticker"], r["player"], r["stat"], b, a, r["result"] == "yes"))
                    seen.add(r["ticker"])
    con = sqlite3.connect(f"file:{os.path.join(ROOT, SPORTS[sport])}?mode=ro", uri=True)
    for t, player, stat, b, a, res in con.execute(
            "select r.ticker, r.player, r.stat, r.k_bid, r.k_ask, g.result from locked_rows r "
            "join grades g on g.ticker = r.ticker where g.result in ('yes', 'no')"):
        if t not in seen and ok(b, a):
            rows.append((t, player, stat, b, a, res == "yes"))
    con.close()
    # one rung per game + player + stat: the one closest to 50/50
    best = {}
    for t, player, stat, b, a, yes in rows:
        team = team_of(t)
        bits = t.split("-")
        if not team or len(bits) < 3:
            continue
        key = (bits[1], player, stat)
        mid = (b + a) / 2
        if key not in best or abs(mid - 0.5) < abs(best[key][3] - 0.5):
            best[key] = (team, player, stat, mid, yes)
    games = collections.defaultdict(list)
    for (game, _, _), v in best.items():
        games[game].append(v)
    return games


REL = ["same_player_overlap", "same_player", "teammates", "opponents", "different_games"]
SIDES = ["over_over", "under_under", "over_under"]


def per_game(sport, rungs):
    """{(rel, sides): (pairs, expected, actual)} for one game"""
    n = len(rungs)
    if n < 2:
        return {}
    team = np.array([r[0] for r in rungs]); player = np.array([r[1] for r in rungs])
    p = np.array([r[3] for r in rungs]); y = np.array([1.0 if r[4] else 0.0 for r in rungs])
    ps = [parts(sport, r[2]) for r in rungs]
    same_p = player[:, None] == player[None, :]
    overlap = np.array([[bool(ps[i] & ps[j]) for j in range(n)] for i in range(n)])
    same_t = team[:, None] == team[None, :]
    off = ~np.eye(n, dtype=bool)
    rel = {"same_player_overlap": same_p & overlap & off, "same_player": same_p & ~overlap & off,
           "teammates": ~same_p & same_t, "opponents": ~same_t}
    upper = np.triu(np.ones((n, n), dtype=bool), 1)
    side = {"over_over": (p, y, p, y, upper), "under_under": (1 - p, 1 - y, 1 - p, 1 - y, upper),
            "over_under": (p, y, 1 - p, 1 - y, off)}  # ordered pairs: either player can be the Over
    out = {}
    for rk, rm in rel.items():
        for sk, (pa, ya, pb, yb, m) in side.items():
            mask = rm & m
            c = int(mask.sum())
            if c:
                out[(rk, sk)] = (c, float((np.outer(pa, pb) * mask).sum()), float((np.outer(ya, yb) * mask).sum()))
    return out


def cross(a, b):
    """{('different_games', sides): (pairs, expected, actual)} for every rung of game a with every rung of game b"""
    pa, ya = np.array([r[3] for r in a]), np.array([1.0 if r[4] else 0.0 for r in a])
    pb, yb = np.array([r[3] for r in b]), np.array([1.0 if r[4] else 0.0 for r in b])
    n = len(a) * len(b)
    out = {("different_games", "over_over"): (n, pa.sum() * pb.sum(), ya.sum() * yb.sum()),
           ("different_games", "under_under"): (n, (1 - pa).sum() * (1 - pb).sum(), (1 - ya).sum() * (1 - yb).sum()),
           ("different_games", "over_under"): (2 * n, pa.sum() * (1 - pb).sum() + (1 - pa).sum() * pb.sum(),
                                               ya.sum() * (1 - yb).sum() + (1 - ya).sum() * yb.sum())}
    return out


def main():
    rng = np.random.default_rng(SEED)
    doc = {"updated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
           "note": "Descriptive: same-game Kalshi prop pairs, how often both hit vs their chances multiplied. "
                   "Not a pre-registered test.", "min_pairs": MIN_PAIRS, "sports": {}}
    for sport in SPORTS:
        games = load(sport)
        acc = collections.defaultdict(list)  # group -> per game [pairs, exp, act]
        for rungs in games.values():
            for k, v in per_game(sport, rungs).items():
                acc[k].append(v)
        order = sorted(games)
        np.random.default_rng(SEED).shuffle(order)
        for g1, g2 in zip(order, order[1:]):
            for k, v in cross(games[g1], games[g2]).items():
                acc[k].append(v)
        groups = {}
        for (rk, sk), lst in sorted(acc.items()):
            a = np.array(lst)
            pairs, exp, act = a.sum(0)
            if pairs < MIN_PAIRS or exp <= 0:
                continue
            idx = rng.integers(0, len(a), size=(DRAWS, len(a)))
            ratios = a[idx, 2].sum(1) / a[idx, 1].sum(1)
            groups.setdefault(rk, {})[sk] = {
                "pairs": int(pairs), "games": len(a), "expected": round(exp / pairs, 4), "actual": round(act / pairs, 4),
                "ratio": round(act / exp, 3), "lo": round(float(np.percentile(ratios, 2.5)), 3),
                "hi": round(float(np.percentile(ratios, 97.5)), 3)}
        base = groups.get("different_games", {})
        for rk, gs in groups.items():
            for sk, g in gs.items():
                if rk != "different_games" and sk in base:
                    b = base[sk]["ratio"]
                    g.update(factor=round(g["ratio"] / b, 3), factor_lo=round(g["lo"] / b, 3), factor_hi=round(g["hi"] / b, 3))
        doc["sports"][sport.upper()] = {"games": len(games), "groups": groups}
        print(sport, len(games), "games")
        for rk in REL:
            for sk in SIDES:
                g = groups.get(rk, {}).get(sk)
                if g:
                    print(f"  {rk:20s} {sk:12s} n={g['pairs']:7d} exp {g['expected']:.3f} act {g['actual']:.3f} "
                          f"ratio {g['ratio']:.3f} [{g['lo']:.3f}, {g['hi']:.3f}]  factor {g.get('factor', 1):.3f} [{g.get('factor_lo', 1):.3f}, {g.get('factor_hi', 1):.3f}]")
    path = os.path.join(ROOT, "stats", "props_samegame.json")
    with open(path, "w") as fh:
        json.dump(doc, fh, separators=(",", ":"))
    print("wrote", path, os.path.getsize(path), "bytes")


if __name__ == "__main__":
    main()
