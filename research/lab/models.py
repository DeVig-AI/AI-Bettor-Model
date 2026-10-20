"""Model families for Research Lab candidates. Each takes a candidate's `params` and the data, walks every game in
kickoff order, forecasts it from what was known before kickoff, then (if it has been played) learns from it.

`run(candidate, data)` returns one row per game: game_id, season, game_type, week, forecast, line, actual
(actual / line are NaN for unplayed games or games without a line). Coefficients are fit on TRAIN seasons only
(Constitution A3.4) and reported in `fit`.
"""
import math
import os
from collections import defaultdict, deque

import numpy as np
import pandas as pd

from . import config as C

FRANCHISE = {"STL": "LA", "SD": "LAC", "OAK": "LV"}          # relocations keep one rating

# Approximate stadium coordinates (lat, lon) by nflverse stadium_id, for travel distance.
STADIUMS = {
    "ATL00": (33.758, -84.401), "ATL97": (33.755, -84.401), "BAL00": (39.278, -76.623), "BOS00": (42.091, -71.264),
    "BRG00": (30.412, -91.184), "BUF00": (42.774, -78.787), "BUF01": (43.641, -79.389), "CAR00": (35.226, -80.853),
    "CHI98": (41.862, -87.617), "CHI99": (40.099, -88.236), "CIN00": (39.095, -84.516), "CLE00": (41.506, -81.700),
    "DAL00": (32.748, -97.093), "DAL99": (32.840, -96.911), "DEN00": (39.744, -105.020), "DET00": (42.340, -83.046),
    "FRA00": (50.069, 8.645), "GER00": (48.219, 11.625), "GNB00": (44.501, -88.062), "HOU00": (29.685, -95.411),
    "IND00": (39.760, -86.164), "IND99": (39.763, -86.163), "JAX00": (30.324, -81.637), "KAN00": (39.049, -94.484),
    "LAX01": (33.953, -118.339), "LAX97": (33.864, -118.261), "LAX99": (34.014, -118.288), "LON00": (51.556, -0.280),
    "LON01": (51.456, -0.342), "LON02": (51.604, -0.066), "MEX00": (19.303, -99.150), "MIA00": (25.958, -80.239),
    "MIN00": (44.974, -93.258), "MIN01": (44.974, -93.258), "MIN98": (44.976, -93.225), "NAS00": (36.166, -86.771),
    "NOR00": (29.951, -90.081), "NYC00": (40.813, -74.074), "NYC01": (40.813, -74.074), "OAK00": (37.752, -122.201),
    "PHI00": (39.901, -75.168), "PHI99": (39.906, -75.171), "PHO00": (33.528, -112.263), "PHO99": (33.426, -111.933),
    "PIT00": (40.447, -80.016), "SAN00": (29.417, -98.479), "SAO00": (-23.545, -46.474), "SDG00": (32.783, -117.120),
    "SEA00": (47.595, -122.332), "SFO00": (37.714, -122.386), "SFO01": (37.403, -121.970), "STL00": (38.633, -90.188),
    "TAM00": (27.976, -82.503), "VEG00": (36.091, -115.184), "WAS00": (38.908, -76.865),
}


def miles(a, b):
    if a is None or b is None:
        return 0.0
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 3958.8 * 2 * math.asin(math.sqrt(min(1.0, h)))


def ordered(games):
    g = games.copy()
    g["_t"] = g.gametime.fillna("13:00").astype(str)
    return g.sort_values(["gameday", "_t", "game_id"]).drop(columns="_t").reset_index(drop=True)


def slots(games):
    """Games grouped by kickoff (same day and time), in order. Every game in a slot is forecast before any of them is
    learned from: they are played at the same time, so none may see another's result (not even through a league average)."""
    key = list(zip(games.gameday, games.gametime.fillna("13:00").astype(str)))
    rows = list(games.itertuples())
    i = 0
    while i < len(rows):
        j = i
        while j < len(rows) and key[j] == key[i]:
            j += 1
        yield rows[i:j]
        i = j


def played(row):
    return not (pd.isna(row.home_score) or pd.isna(row.away_score))


def qb_value(r):
    """538's per-game QB VALUE (as published in its 2019+ methodology)."""
    return (-2.2 * r.att + 3.7 * r.cmp + r.yds / 5 + 11.3 * r.td - 14.1 * r.int - 8 * r.sacks
            - 1.1 * r.ratt + 0.6 * r.ryds + 15.9 * r.rtd)


def home_bases(games):
    """{(team, season): stadium_id} -- where the team played most of its home games that season."""
    h = games[games.location != "Neutral"].groupby(["home_team", "season"]).stadium_id
    return {k: v.mode().iloc[0] for k, v in h}


def conferences(games):
    """{(team, season): conference} from the schedule (college football)."""
    out = {}
    for col_t, col_c in (("home_team", "home_conf"), ("away_team", "away_conf")):
        if col_c in games.columns:
            for t, s, c in zip(games[col_t], games.season, games[col_c]):
                if isinstance(c, str):
                    out[(t, s)] = c
    return out


def returning_share(data):
    """{(team, season): share of last season's PPA that returns} (college football; missing = no adjustment)."""
    r = data.get("returning")
    if r is None or not len(r):
        return {}
    return {(t, int(s)): float(v) for t, s, v in zip(r.team, r.season, r.percent_ppa) if v == v}


def _out(rows):
    return pd.DataFrame(rows, columns=["game_id", "season", "game_type", "week", "forecast", "line", "actual"])


# ---- Elo family (market: spread) -----------------------------------------------------------------------------------
def run_elo(p, data):
    games = ordered(data["games"])
    qbg = {(r.game_id, r.qb_id): qb_value(r) for r in data["qb_games"].itertuples()} if p["qb"] != "none" else {}
    bases = home_bases(games) if p.get("travel_elo_per_1000mi") else {}
    epp = p["elo_per_point"]
    conf = conferences(games) if p.get("revert_center") == "conference" else {}
    ret = returning_share(data) if p.get("returning", "none") != "none" else {}
    R = defaultdict(lambda: float(p["mean"]))
    last_season = {}
    hfa_hist = defaultdict(list)                       # season -> home margins (non-neutral)
    qbr, teamq = {}, {}                                # QB and team rolling VALUE
    league_q = None
    last_qb = {}
    rows = []
    cur = None
    hfa_pts = p["hfa_elo"] / epp
    for g in games.itertuples():
        if g.season != cur:                            # new season: home field for it, from earlier seasons only
            cur = g.season
            if p["hfa_mode"] == "rolling":
                prev = [m for s in range(cur - p["hfa_seasons"], cur) for m in hfa_hist.get(s, [])]
                hfa_pts = float(np.mean(prev)) if prev else p["hfa_elo"] / epp
            median = float(np.median(list(R.values()))) if R else p["mean"]
            conf_mean = {}
            if conf:                                   # C6: each conference's average rating at the end of last season
                by = defaultdict(list)
                for t, r in R.items():
                    c = conf.get((t, cur))
                    if c:
                        by[c].append(r)
                conf_mean = {c: float(np.mean(v)) for c, v in by.items()}
        h, a = FRANCHISE.get(g.home_team, g.home_team), FRANCHISE.get(g.away_team, g.away_team)
        for t in (h, a):                               # offseason reversion, once per team per season
            if t in last_season and last_season[t] != g.season:
                prev = R[t] - (median - p["mean"]) if p.get("revert_center") == "median" else R[t]
                center = conf_mean.get(conf.get((t, g.season)), p["mean"]) if conf else p["mean"]
                rv = p["revert"]
                if ret:                                # returning production: keep more of a team that returns more
                    share = ret.get((t, g.season))
                    if share is not None and np.isfinite(share):
                        rv = min(1.0, max(0.0, rv + p["returning_k"] * (p["returning_mid"] - share)))
                R[t] = center * rv + prev * (1 - rv)
            last_season[t] = g.season
        neutral = g.location == "Neutral"
        dh = R[h] - R[a] + (0 if neutral else hfa_pts * epp)
        week1 = g.game_type == "REG" and g.week == 1
        if p["bye_elo"] and not week1:
            dh += p["bye_elo"] * ((g.home_rest >= p["bye_rest_days"]) - (g.away_rest >= p["bye_rest_days"]))
        if p["travel_elo_per_1000mi"]:
            site = STADIUMS.get(g.stadium_id)
            mh = miles(STADIUMS.get(bases.get((g.home_team, g.season))), site)
            ma = miles(STADIUMS.get(bases.get((g.away_team, g.season))), site)
            dh += p["travel_elo_per_1000mi"] * (ma - mh) / 1000
        starters = {}
        if p["qb"] == "538":
            for side, t, qid in (("h", h, g.home_qb_id), ("a", a, g.away_qb_id)):
                qid = qid if isinstance(qid, str) else last_qb.get(t)
                starters[side] = qid
                base = league_q if league_q is not None else 0.0
                if qid is not None and qid not in qbr:
                    qbr[qid] = base - p["qb_new_below_avg"]
                if t not in teamq:
                    teamq[t] = base
                adj = p["qb_elo_per_value"] * (qbr[qid] - teamq[t]) if qid is not None else 0.0
                dh += adj if side == "h" else -adj
        if g.game_type != "REG":
            dh *= p["playoff_mult"]
        fc = dh / epp
        line = g.spread_line
        actual = (g.home_score - g.away_score) if played(g) else np.nan
        rows.append((g.game_id, g.season, g.game_type, g.week, fc, line, actual))
        if not played(g):
            continue
        m = g.home_score - g.away_score
        if not neutral:
            hfa_hist[g.season].append(m)
        # what the ratings learn against: the model's own spread, or a blend with the closing line
        fu = fc
        if p["market_blend"] and not pd.isna(line):
            fu = (1 - p["market_blend"]) * fc + p["market_blend"] * line
        du = fu * epp
        k = p["k"]
        if p["market_resist"] and not pd.isna(line):
            me, ke = abs(m - fu), abs(m - line)
            if me >= 1 and me > ke:
                k *= 1 + (me - ke) / p["market_resist"]
        if p["mov"] == "nfelo":
            err = m - fu
            shift = 0.0 if err == 0 else math.copysign(k * math.log(max(abs(err), 1) + 1, p["nfelo_log_base"]), err)
        else:
            res = 1.0 if m > 0 else 0.0 if m < 0 else 0.5
            pu = 1 / (1 + 10 ** max(-300.0, min(300.0, -du / 400)))     # some settings run away; never overflow
            mult = 1.0
            if p["mov"] == "538":
                lead = du if res == 1.0 else -du
                mm = min(abs(m), p["mov_cap"]) if p.get("mov_cap") else abs(m)
                mult = math.log(max(mm, 1) + 1) * (2.2 / (1.0 if res == 0.5 else lead * 0.001 + 2.2))
            shift = k * mult * (res - pu)
        R[h] += shift
        R[a] -= shift
        if p["qb"] == "538":
            for side, t, opp in (("h", h, a), ("a", a, h)):
                qid = starters.get(side)
                v = qbg.get((g.game_id, qid)) if qid else None
                if v is None:
                    continue
                al = p["qb_alpha"]
                qbr[qid] = (1 - al) * qbr[qid] + al * v
                teamq[t] = (1 - al) * teamq[t] + al * v
                league_q = v if league_q is None else 0.99 * league_q + 0.01 * v
                last_qb[t] = qid
    return _out(rows), {}


# ---- Pace x efficiency family (market: total) ----------------------------------------------------------------------
def run_pace_eff(p, data):
    games = ordered(data["games"])
    tg = {(r.game_id, FRANCHISE.get(r.team, r.team)): (r.plays, r.epa) for r in data["team_games"].itertuples()}
    lam = 0.5 ** (1 / p["halflife"])
    carry = p["season_carry"]
    league = deque(maxlen=p.get("league_window", 544))  # about one season of team-games: (plays, points, epa)
    st = {}                                            # team -> dict of rolling means
    last_season = {}
    keys = ("op", "opts", "oepa", "dp", "dpts", "depa")

    def lg():
        if not league:
            return {"p": 63.0, "pts": 21.0, "epa": 0.0}
        a = np.array(league, dtype=float)
        return {"p": a[:, 0].mean(), "pts": a[:, 1].mean(), "epa": a[:, 2].mean()}

    def prior(L):
        return {"op": L["p"], "opts": L["pts"], "oepa": L["epa"], "dp": L["p"], "dpts": L["pts"], "depa": L["epa"]}

    raw = []
    meta = []
    for slot in slots(games):
        L = lg()

        def side(o, d):
            if not p.get("pace", True):                # plain points for / against, no plays at all
                return L["pts"] * (st[o]["opts"] / L["pts"]) * (st[d]["dpts"] / L["pts"])
            plays = L["p"] * (st[o]["op"] / L["p"]) * (st[d]["dp"] / L["p"])
            if p["efficiency"] == "epa":
                ppp = L["pts"] / L["p"] + (st[o]["oepa"] / st[o]["op"] - L["epa"] / L["p"]) \
                    + (st[d]["depa"] / st[d]["dp"] - L["epa"] / L["p"])
            else:
                lppp = L["pts"] / L["p"]
                ppp = lppp * ((st[o]["opts"] / st[o]["op"]) / lppp) * ((st[d]["dpts"] / st[d]["dp"]) / lppp)
            return plays * ppp

        for g in slot:                                 # 1) forecast every game in the slot
            h, a = FRANCHISE.get(g.home_team, g.home_team), FRANCHISE.get(g.away_team, g.away_team)
            for t in (h, a):
                if t not in st:
                    st[t] = prior(L)
                elif last_season.get(t) != g.season:   # new season: shrink toward the league
                    P0 = prior(L)
                    st[t] = {k: carry * st[t][k] + (1 - carry) * P0[k] for k in keys}
                last_season[t] = g.season
            raw.append(side(h, a) + side(a, h))
            actual = (g.home_score + g.away_score) if played(g) else np.nan
            meta.append((g.game_id, g.season, g.game_type, g.week, g.total_line, actual))
        for g in slot:                                 # 2) then learn from the ones that were played
            if not played(g):
                continue
            h, a = FRANCHISE.get(g.home_team, g.home_team), FRANCHISE.get(g.away_team, g.away_team)
            ph, pa = tg.get((g.game_id, h)), tg.get((g.game_id, a))   # play-by-play uses today's codes (LV, LAC, LA)
            if ph is None or pa is None:
                if p.get("pace", True):
                    continue
                ph = pa = (L["p"], L["epa"])           # points-only model: plays are not needed
            for o, d, po, pts_o in ((h, a, ph, g.home_score), (a, h, pa, g.away_score)):
                st[o]["op"] = lam * st[o]["op"] + (1 - lam) * po[0]
                st[o]["opts"] = lam * st[o]["opts"] + (1 - lam) * pts_o
                st[o]["oepa"] = lam * st[o]["oepa"] + (1 - lam) * po[1]
                st[d]["dp"] = lam * st[d]["dp"] + (1 - lam) * po[0]
                st[d]["dpts"] = lam * st[d]["dpts"] + (1 - lam) * pts_o
                st[d]["depa"] = lam * st[d]["depa"] + (1 - lam) * po[1]
                league.append((po[0], pts_o, po[1]))
    raw = np.array(raw)
    m = pd.DataFrame(meta, columns=["game_id", "season", "game_type", "week", "line", "actual"])
    fit = {}
    if p["calibrate"]:
        tr = (m.season >= C.TRAIN[0]) & (m.season <= C.TRAIN[1]) & m.actual.notna()
        b, a0 = np.polyfit(raw[tr.values], m.actual[tr].values, 1)
        fit = {"intercept": round(float(a0), 4), "slope": round(float(b), 4), "fit_games": int(tr.sum()),
               "fit_seasons": f"{C.TRAIN[0]}-{C.TRAIN[1]}"}
        fc = a0 + b * raw
    else:
        fc = raw
    m["forecast"] = fc
    return m[["game_id", "season", "game_type", "week", "forecast", "line", "actual"]], fit


# ---- Team rating family (spread or total) ---------------------------------------------------------------------------
# Opponent-adjusted offense (O) and defense (D) ratings on one metric, updated after every game by a fraction `lr` of
# the surprise: expected = league + O[offense] + D[defense]. For totals, a pace rating gives expected plays.
METRICS = {   # metric -> (numerator column, denominator column or None for per game, prior league value)
    "points": (None, None, 21.0), "epa": ("epa", "plays", 0.0), "pass_epa": ("pass_epa", "pass_plays", 0.0),
    "early_epa": ("early_epa", "early_plays", 0.0), "success": ("succ", "plays", 0.45),
    "noto_epa": ("noto_epa", "noto_plays", 0.05), "comp_epa": ("comp_epa", "comp_plays", 0.0),
}


def _lstsq(X, y):
    coef, *_ = np.linalg.lstsq(np.asarray(X, dtype=float), np.asarray(y, dtype=float), rcond=None)
    return coef


def run_team_rating(p, data, market):
    games = ordered(data["games"])
    tg = {(r.game_id, FRANCHISE.get(r.team, r.team)): r for r in data["team_games"].itertuples()}
    num, den, prior = METRICS[p["metric"]]
    lr = 1 - 0.5 ** (1 / p["halflife"])
    carry, dw, pace = p["season_carry"], p["def_weight"], p["pace"]
    O, D, PO, PD = (defaultdict(float) for _ in range(4))
    lw = p.get("league_window") or 544                 # team-games in the league averages (~ one NFL season)
    league, lplays, lspp = deque(maxlen=lw), deque(maxlen=lw), deque(maxlen=lw)
    last_season = {}

    def mean(q, default):
        return float(np.mean(q)) if q else default

    def metric(r, pts):
        if num is None:
            return float(pts)
        n = getattr(r, den)
        return getattr(r, num) / n if n else None

    feats, meta = [], []
    for slot in slots(games):
        lg, lp, ls = mean(league, prior), mean(lplays, 63.0), mean(lspp, 28.0)
        for g in slot:                                 # 1) forecast every game in the slot
            h, a = FRANCHISE.get(g.home_team, g.home_team), FRANCHISE.get(g.away_team, g.away_team)
            for t in (h, a):
                if t in last_season and last_season[t] != g.season:
                    for R in (O, D, PO, PD):
                        R[t] *= carry
                last_season[t] = g.season
            exp_h, exp_a = lg + O[h] + D[a], lg + O[a] + D[h]
            if pace == "plays":
                pl_h, pl_a = lp + PO[h] + PD[a], lp + PO[a] + PD[h]
            elif pace == "seconds":
                pl_h, pl_a = lp * ls / max(5.0, ls + PO[h] + PD[a]), lp * ls / max(5.0, ls + PO[a] + PD[h])
            else:
                pl_h = pl_a = None
            if market == "spread":
                feats.append([0.0 if g.location == "Neutral" else 1.0, exp_h - exp_a])
                actual = (g.home_score - g.away_score) if played(g) else np.nan
                line = g.spread_line
            else:
                feats.append([1.0, exp_h + exp_a] if pl_h is None else [1.0, pl_h + pl_a, pl_h * exp_h + pl_a * exp_a])
                actual = (g.home_score + g.away_score) if played(g) else np.nan
                line = g.total_line
            meta.append((g.game_id, g.season, g.game_type, g.week, line, actual))
        for g in slot:                                 # 2) then learn from the ones that were played
            if not played(g):
                continue
            h, a = FRANCHISE.get(g.home_team, g.home_team), FRANCHISE.get(g.away_team, g.away_team)
            rh, ra = tg.get((g.game_id, h)), tg.get((g.game_id, a))
            if num is not None and (rh is None or ra is None):
                continue
            for o, d, r, pts in ((h, a, rh, g.home_score), (a, h, ra, g.away_score)):
                x = metric(r, pts)
                if x is not None:
                    e = x - (lg + O[o] + D[d])
                    O[o] += lr * e
                    D[d] += lr * dw * e
                    league.append(x)
                if pace != "none" and r is not None and r.plays:
                    y, base = (r.plays, lp) if pace == "plays" else (r.top_seconds / r.plays, ls)
                    e = y - (base + PO[o] + PD[d])
                    PO[o] += lr * e
                    PD[d] += lr * e
                    (lplays if pace == "plays" else lspp).append(y)
                    if pace == "seconds":
                        lplays.append(r.plays)
    X = np.array(feats)
    m = pd.DataFrame(meta, columns=["game_id", "season", "game_type", "week", "line", "actual"])
    tr = ((m.season >= C.TRAIN[0]) & (m.season <= C.TRAIN[1]) & m.actual.notna()).values
    coef = _lstsq(X[tr], m.actual.values[tr])
    m["forecast"] = X @ coef
    names = ["home", "rating_diff"] if market == "spread" else (["intercept", "rating_sum"] if X.shape[1] == 2 else
                                                                ["intercept", "pace_sum", "pace_x_efficiency"])
    fit = {"coef": {n: round(float(c), 6) for n, c in zip(names, coef)}, "fit_games": int(tr.sum()),
           "fit_seasons": f"{C.TRAIN[0]}-{C.TRAIN[1]}"}
    return m[["game_id", "season", "game_type", "week", "forecast", "line", "actual"]], fit


# ---- Blend family -----------------------------------------------------------------------------------------------------
def find_candidate(cid):
    """A registered candidate's definition, from research/candidates/ or (same batch) research/queue/."""
    import glob
    import yaml
    paths = [os.path.join(C.CANDIDATES, f"{cid}.yaml")] + sorted(glob.glob(os.path.join(C.QUEUE, f"*-{cid}.yaml")))
    for path in paths:
        if os.path.exists(path):
            with open(path) as f:
                return yaml.safe_load(f)
    raise ValueError(f"blend component {cid!r} is not registered")


def run_blend(p, data, market):
    outs, fits = [], {}
    for comp, w in zip(p["components"], p["weights"]):
        c = comp if isinstance(comp, dict) else find_candidate(comp)    # inline (search) or a registered id
        cid = comp if isinstance(comp, str) else f"component {len(fits) + 1}"
        if c["market"] != market:
            raise ValueError(f"blend component {cid} is a {c['market']} model, not {market}")
        o, f = run(c, data)
        outs.append((o.set_index("game_id"), w))
        fits[cid] = f
    base = outs[0][0].copy()
    base["forecast"] = sum(o.forecast.reindex(base.index) * w for o, w in outs) / sum(w for _, w in outs)
    return base.reset_index()[["game_id", "season", "game_type", "week", "forecast", "line", "actual"]], fits


# ---- Least-squares rating families (college football; market: spread) ------------------------------------------------
def _ridge(idx, n, rows, prior, w):
    """Ratings x (length n) minimising sum((y - x[i] + x[j] - h)^2) + w * sum((x - prior)^2) over rows (i, j, y, h)."""
    A = np.zeros((n, n))
    b = w * prior.copy()
    A[np.diag_indices(n)] = w
    for i, j, y, h in rows:
        r = y - h
        A[i, i] += 1; A[j, j] += 1; A[i, j] -= 1; A[j, i] -= 1
        b[i] += r; b[j] -= r
    return np.linalg.solve(A, b)


def run_srs(p, data):
    """Simple Rating System (least-squares margins, as in sports-reference / cfbfastR), re-solved before every game
    date from this season's finished games, shrunk toward last season's final rating (prior_w games' worth, carry)."""
    games = ordered(data["games"])
    fr = lambda t: FRANCHISE.get(t, t)                # NFL relocations keep one rating (no effect on CFB names)
    teams = sorted({fr(t) for t in set(games.home_team) | set(games.away_team)})
    ix = {t: i for i, t in enumerate(teams)}
    n = len(teams)
    prior = np.zeros(n)
    rows_season, rows, cur, cur_day, x = [], [], None, None, np.zeros(n)
    hfa = p["hfa_pts"]
    for g in games.itertuples():
        if g.season != cur:
            if cur is not None:
                prior = p["carry"] * _ridge(ix, n, rows_season, prior, p["prior_w"])
                prior -= prior.mean()
            cur, rows_season, cur_day = g.season, [], None
            x = prior.copy()
        if g.gameday != cur_day:                       # only games finished before this date
            cur_day = g.gameday
            x = _ridge(ix, n, rows_season, prior, p["prior_w"]) if rows_season else prior.copy()
        i, j = ix[fr(g.home_team)], ix[fr(g.away_team)]
        h = 0.0 if g.location == "Neutral" else hfa
        rows.append((g.game_id, g.season, g.game_type, g.week, x[i] - x[j] + h, g.spread_line,
                     (g.home_score - g.away_score) if played(g) else np.nan))
        if played(g):
            m = g.home_score - g.away_score
            if p.get("margin_cap"):
                m = max(-p["margin_cap"], min(p["margin_cap"], m))
            rows_season.append((i, j, float(m), h))
    return _out(rows), {}


def run_ppa(p, data):
    """Opponent-adjusted PPA (EPA) ratings, as in cfbfastR / CFBD: each offence's points added per play and each
    defence's PPA allowed, least squares with last-season priors, re-solved before every game date. Spread =
    b * (net home - net away) + c at a home site; b and c fit once on the training seasons (A3.4)."""
    games = ordered(data["games"])
    tg = data["team_games_ngt" if p.get("garbage_time") == "exclude" else "team_games"]
    ppp = {(r.game_id, r.team): (r.epa / r.plays) for r in tg.itertuples() if r.plays and r.plays > 0}
    teams = sorted(set(games.home_team) | set(games.away_team))
    ix = {t: i for i, t in enumerate(teams)}
    n = len(teams)
    # unknowns: offence o_t (0..n-1), defence d_t (n..2n-1); observation y = mu + o_off - d_def (d = PPA prevented)
    pri = np.zeros(2 * n)
    obs, cur, cur_day, est, mu = [], None, None, np.zeros(2 * n), 0.0
    w = p["prior_w"]

    def solve(obs, pri):
        if not obs:
            return pri.copy(), 0.0
        mu_ = float(np.mean([y for _, _, y in obs]))
        A = np.eye(2 * n) * w
        b = w * pri.copy()
        for o, d, y in obs:
            r = y - mu_
            k = n + d
            A[o, o] += 1; A[k, k] += 1; A[o, k] -= 1; A[k, o] -= 1
            b[o] += r; b[k] -= r
        return np.linalg.solve(A, b), mu_

    feats = []
    for g in games.itertuples():
        if g.season != cur:
            if cur is not None:
                fin, _ = solve(obs, pri)
                pri = p["carry"] * fin
            cur, obs, cur_day = g.season, [], None
            est = pri.copy()
        if g.gameday != cur_day:
            cur_day = g.gameday
            est, mu = solve(obs, pri)
        i, j = ix[g.home_team], ix[g.away_team]
        net = (est[i] + est[n + i]) - (est[j] + est[n + j])
        feats.append((g.game_id, g.season, g.game_type, g.week, net, 0.0 if g.location == "Neutral" else 1.0,
                      g.spread_line, (g.home_score - g.away_score) if played(g) else np.nan))
        for o, d in ((g.home_team, g.away_team), (g.away_team, g.home_team)):
            v = ppp.get((g.game_id, o))
            if v is not None and np.isfinite(v):
                obs.append((ix[o], ix[d], float(v)))
    f = pd.DataFrame(feats, columns=["game_id", "season", "game_type", "week", "net", "home", "line", "actual"])
    tr = (f.season >= C.TRAIN[0]) & (f.season <= C.TRAIN[1]) & f.actual.notna()
    X = np.column_stack([f.net[tr], f.home[tr]])
    coef, *_ = np.linalg.lstsq(X, f.actual[tr].values, rcond=None)
    f["forecast"] = coef[0] * f.net + coef[1] * f.home
    fit = {"points_per_net_ppa": round(float(coef[0]), 4), "home_points": round(float(coef[1]), 4),
           "fit_games": int(tr.sum()), "fit_seasons": f"{C.TRAIN[0]}-{C.TRAIN[1]}"}
    return f[["game_id", "season", "game_type", "week", "forecast", "line", "actual"]], fit


def _run_signals(p, d, m):
    from .signals import run_signals
    return run_signals(p, d, m)


FAMILIES = {"elo": run_elo, "pace_eff": run_pace_eff, "srs": run_srs, "ppa": run_ppa,
            "team_rating": lambda p, d, m: run_team_rating(p, d, m), "blend": lambda p, d, m: run_blend(p, d, m),
            "signals": _run_signals}
MARKET_OF = {"elo": "spread", "pace_eff": "total", "srs": "spread", "ppa": "spread"}   # the other families take the candidate's market


def run(candidate, data):
    t = candidate["model"]["type"]
    if t not in FAMILIES:
        raise ValueError(f"unknown model family {t!r}")
    if t in MARKET_OF:
        if MARKET_OF[t] != candidate["market"]:
            raise ValueError(f"family {t} forecasts {MARKET_OF[t]}, candidate says {candidate['market']}")
        return FAMILIES[t](candidate["model"]["params"], data)
    return FAMILIES[t](candidate["model"]["params"], data, candidate["market"])
