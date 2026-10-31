"""Signals (Constitution v9 A3.3e): extra, football-reasoned inputs added on top of a base rating model.

A signal is declared in the sport's research/<sport>/search/SIGNALS.yaml (NFL: research/search/SIGNALS.yaml), not in
code, and can only be built from the fields below -- pre-game team statistics, rest, travel, divisional games and
quarterback changes. Weather, dates, kickoff times, prices and known betting angles cannot be expressed at all: the
loader rejects any field or kind not listed here.

Kinds:
  team      rolling (half-life `halflife` games) per-team value of sum(coef * column) [/ den column], from the team's
            own games (side: offense) or from its opponents' games against it (side: defense); shrunk toward the league
            by `carry` at each new season. Spread feature: home minus away (offense) or away minus home (defense).
            Total feature: home plus away.
  schedule  one of SCHEDULE_FIELDS (spread only, home-minus-away).
  qb_change starter differs from the team's previous starter (NFL only), home minus away (spread only).
  injury    (v12, NFL only, spread only) one of INJURY_FIELDS, home minus away, from the week's injury report and
            roster (data.injury_rows): qb_out = last game's QB unavailable, reg_out = regulars unavailable, reg_q =
            regulars questionable. 0 before C.INJURY_FIRST. A model with an injury signal fits its weights on the
            training seasons plus C.INJURY_FIT (the training seasons have no injury data).
  goalie    (v14, NHL only) the starting goalie's save percentage above the league's, from his own earlier games
            (rolling, half-life `halflife` appearances, his weights times `carry` at each new season, shrunk toward the
            league by `prior_shots` shots). The starter is the one the box score marks (D1a); he is known before the
            puck drops, as the closing line is. Moneyline feature: home minus away; total feature: home plus away.

Part D team columns (v14 D1a): NBA and NHL team signals may also read the box-score columns in PART_D_COLUMNS
(built by sdv_data.py); NBA, NHL and MLB signals may read `points`.

The signals model: forecast = base forecast + features · beta, beta fit once by least squares (small ridge) on the
training seasons' residuals (actual - base). Everything is computed game by game from games already finished; games
in one kickoff slot never see each other (models.slots).
"""
import math
import os
from collections import defaultdict, deque

import numpy as np
import pandas as pd
import yaml

from . import config as C

TEAM_COLUMNS = {"plays", "epa", "pass_plays", "pass_epa", "early_plays", "early_epa", "succ", "noto_plays", "noto_epa",
                "comp_plays", "comp_epa", "top_seconds", "points"}
SCHEDULE_FIELDS = {"rest_diff", "travel_diff", "div_game", "off_bye_diff", "short_week_diff"}
INJURY_FIELDS = {"qb_out": "d_qb", "reg_out": "d_out", "reg_q": "d_q"}
PART_D_COLUMNS = {"NBA": {"points", "poss", "fga", "fgm", "fg3a", "fg3m", "fta", "ftm", "oreb", "dreb", "tov", "ast"},
                  "NHL": {"points", "shots", "es_shots", "pp_shots", "pp_goals"}}
KINDS = {"team", "schedule", "qb_change", "injury", "goalie"}
MAX_PER_MODEL = 6


class SignalError(ValueError):
    pass


def validate(sig):
    """Raise SignalError unless the signal uses only allowed kinds and fields (A3.3e). Returns the signal."""
    for k in ("id", "kind", "reason"):
        if not sig.get(k):
            raise SignalError(f"signal needs '{k}': {sig}")
    if sig["kind"] not in KINDS:
        raise SignalError(f"{sig['id']}: kind {sig['kind']!r} is not allowed")
    if sig["kind"] == "team":
        cols = set((sig.get("num") or {}).keys()) | ({sig["den"]} if sig.get("den") else set())
        bad = cols - PART_D_COLUMNS.get(C.SPORT, TEAM_COLUMNS)
        if bad or not sig.get("num"):
            raise SignalError(f"{sig['id']}: columns {sorted(bad) or '(none)'} are not allowed")
        if sig.get("side") not in ("offense", "defense"):
            raise SignalError(f"{sig['id']}: side must be offense or defense")
        if not (1 <= float(sig.get("halflife", 0)) <= 64):
            raise SignalError(f"{sig['id']}: halflife must be 1-64 games")
    if sig["kind"] == "schedule" and sig.get("field") not in SCHEDULE_FIELDS:
        raise SignalError(f"{sig['id']}: schedule field {sig.get('field')!r} is not allowed")
    if sig["kind"] == "injury":
        if sig.get("field") not in INJURY_FIELDS:
            raise SignalError(f"{sig['id']}: injury field {sig.get('field')!r} is not allowed")
        if C.SPORT != "NFL":
            raise SignalError(f"{sig['id']}: injury signals are NFL only")
    if sig["kind"] == "goalie":
        if C.SPORT != "NHL":
            raise SignalError(f"{sig['id']}: goalie signals are NHL only")
        if sig.get("field") != "save_pct":
            raise SignalError(f"{sig['id']}: goalie field must be save_pct")
        if not (1 <= float(sig.get("halflife", 0)) <= 200):
            raise SignalError(f"{sig['id']}: halflife must be 1-200 appearances")
        if not (0 <= float(sig.get("prior_shots", 0)) <= 5000):
            raise SignalError(f"{sig['id']}: prior_shots must be 0-5000")
    markets = sig.get("markets") or ["spread", "total"]
    if sig["kind"] in ("schedule", "qb_change", "injury"):
        markets = ["spread"]
    sig["markets"] = list(markets)
    return sig


def load_library(path=None, auto=True):
    """The sport's SIGNALS.yaml plus, unless auto=False or a file is named, the variants the search's automatic widening
    added (AUTO.yaml, Constitution v10 A3.3c): same kinds and columns, so validated by the same rules."""
    named = path is not None
    path = path or os.path.join(C.SEARCH_DIR, "SIGNALS.yaml")
    lib = {}
    if os.path.exists(path):
        with open(path) as f:
            lib = yaml.safe_load(f) or {}
    extra = []
    if auto and not named:
        from .search import auto_signals
        extra = auto_signals()
    out, seen = [], set()
    for s in (lib.get("signals") or []) + extra:
        s = validate(dict(s))
        if s["id"] in seen:
            raise SignalError(f"duplicate signal id {s['id']}")
        seen.add(s["id"])
        out.append(s)
    return out


def team_frame(data):
    """team_games plus each team's points in that game (from the schedule), keyed by franchise code; for college
    football, comp_plays / comp_epa come from team_games_ngt (garbage time excluded)."""
    from .models import FRANCHISE
    g = data["games"]
    pts = {}
    for r in g.itertuples():
        if not (pd.isna(r.home_score) or pd.isna(r.away_score)):
            pts[(r.game_id, FRANCHISE.get(r.home_team, r.home_team))] = r.home_score
            pts[(r.game_id, FRANCHISE.get(r.away_team, r.away_team))] = r.away_score
    rows = {}
    for r in data["team_games"].to_dict("records"):
        t = FRANCHISE.get(r["team"], r["team"])
        r["points"] = pts.get((r["game_id"], t))
        rows[(r["game_id"], t)] = r
    ngt = data.get("team_games_ngt")                   # CFB: garbage time excluded = the competitive columns
    if ngt is not None and "comp_epa" not in data["team_games"].columns:
        for r in ngt.to_dict("records"):
            x = rows.get((r["game_id"], FRANCHISE.get(r["team"], r["team"])))
            if x is not None:
                x["comp_plays"], x["comp_epa"] = r["plays"], r["epa"]
    return rows


def features(sigs, data, market):
    """{game_id: [feature per signal]} for every game, from information before its kickoff slot."""
    from .models import FRANCHISE, STADIUMS, home_bases, miles, ordered, played, slots
    games = ordered(data["games"])
    rows = team_frame(data)
    bases = home_bases(games) if any(s.get("field") == "travel_diff" for s in sigs) else {}   # CFB has no stadiums
    team_sigs = [s for s in sigs if s["kind"] == "team"]
    lam = {s["id"]: 0.5 ** (1 / float(s["halflife"])) for s in team_sigs}
    val = {s["id"]: defaultdict(lambda: None) for s in team_sigs}          # team -> rolling value
    league = {s["id"]: deque(maxlen=int(s.get("league_window") or 544)) for s in team_sigs}
    last_season, last_qb, last_game_day = {}, {}, {}
    inj = {}
    if any(s["kind"] == "injury" for s in sigs) and data.get("injury_games") is not None:
        inj = {r["game_id"]: r for r in data["injury_games"].to_dict("records")}
    goalie_sigs = [s for s in sigs if s["kind"] == "goalie"]
    starters, apps = {}, defaultdict(list)          # (game, team) -> starter id; game -> [(goalie, shots, saves)]
    if goalie_sigs and data.get("goalie_games") is not None:
        for r in data["goalie_games"].to_dict("records"):
            t = FRANCHISE.get(r["team"], r["team"])
            if r["starter"] in (True, "True", 1):
                starters[(r["game_id"], t)] = r["goalie_id"]
            apps[r["game_id"]].append((r["goalie_id"], float(r["shots_against"]), float(r["saves"])))
    gw = {s["id"]: defaultdict(lambda: [0.0, 0.0]) for s in goalie_sigs}   # goalie -> [weighted saves, weighted shots]
    g_lam = {s["id"]: 0.5 ** (1 / float(s["halflife"])) for s in goalie_sigs}
    g_season = {s["id"]: {} for s in goalie_sigs}   # goalie -> season his weights are in
    league_sv = [0.0, 0.0]                          # all earlier saves, shots (the league's save percentage)
    out = {}

    def roll(sig, gid, season):                     # a new season: his weights times `carry`, once
        if g_season[sig["id"]].get(gid) not in (None, season):
            c = float(sig.get("carry", 0.7))
            w = gw[sig["id"]][gid]
            w[0], w[1] = c * w[0], c * w[1]
        g_season[sig["id"]][gid] = season

    def goalie_value(sig, gid, season):
        if gid is None:
            return 0.0                              # no box score for this game: no information
        roll(sig, gid, season)
        lg = league_sv[0] / league_sv[1] if league_sv[1] else 0.9
        k = float(sig.get("prior_shots", 300))
        sv, sh = gw[sig["id"]][gid]
        return 100 * ((sv + k * lg) / (sh + k) - lg)       # save-percentage points above the league

    def value(sig, r):
        if r is None:
            return None
        tot = 0.0
        for col, coef in sig["num"].items():
            v = r.get(col)
            if v is None or (isinstance(v, float) and math.isnan(v)):
                return None
            tot += float(coef) * float(v)
        if sig.get("den"):
            d = r.get(sig["den"])
            if d is None or (isinstance(d, float) and math.isnan(d)) or not d:
                return None
            tot /= float(d)
        return tot

    for slot in slots(games):
        lg = {sid: (float(np.mean(q)) if q else 0.0) for sid, q in league.items()}
        for g in slot:
            h, a = FRANCHISE.get(g.home_team, g.home_team), FRANCHISE.get(g.away_team, g.away_team)
            for t in (h, a):
                if t in last_season and last_season[t] != g.season:
                    for s in team_sigs:
                        if val[s["id"]][t] is not None:
                            c = float(s.get("carry", 0.5))
                            val[s["id"]][t] = c * val[s["id"]][t] + (1 - c) * lg[s["id"]]
                last_season[t] = g.season
            f = []
            for s in sigs:
                if s["kind"] == "team":
                    vh = val[s["id"]][h] if val[s["id"]][h] is not None else lg[s["id"]]
                    va = val[s["id"]][a] if val[s["id"]][a] is not None else lg[s["id"]]
                    if market == "total":
                        f.append(vh + va)
                    else:
                        f.append(vh - va if s["side"] == "offense" else va - vh)
                elif s["kind"] == "schedule":
                    fld = s["field"]
                    hr, ar = getattr(g, "home_rest", None), getattr(g, "away_rest", None)
                    if fld == "rest_diff":
                        f.append(0.0 if pd.isna(hr) or pd.isna(ar) else float(hr) - float(ar))
                    elif fld in ("off_bye_diff", "short_week_diff"):
                        if pd.isna(hr) or pd.isna(ar) or (g.game_type == "REG" and g.week == 1):
                            f.append(0.0)
                        elif fld == "off_bye_diff":
                            f.append(float(hr >= 13) - float(ar >= 13))
                        else:
                            f.append(float(hr <= 5) - float(ar <= 5))
                    elif fld == "div_game":
                        f.append(float(getattr(g, "div_game", 0) or 0))
                    else:                                  # travel_diff (miles, away minus home, in thousands)
                        site = STADIUMS.get(getattr(g, "stadium_id", None))
                        mh = miles(STADIUMS.get(bases.get((g.home_team, g.season))), site)
                        ma = miles(STADIUMS.get(bases.get((g.away_team, g.season))), site)
                        f.append((ma - mh) / 1000)
                elif s["kind"] == "goalie":                # the starters, both known before the puck drops
                    vh = goalie_value(s, starters.get((g.game_id, h)), g.season)
                    va = goalie_value(s, starters.get((g.game_id, a)), g.season)
                    f.append(vh + va if market == "total" else vh - va)
                elif s["kind"] == "injury":                # published before kickoff; 0 where there is no data
                    v = (inj.get(g.game_id) or {}).get(INJURY_FIELDS[s["field"]])
                    f.append(0.0 if v is None or pd.isna(v) else float(v))
                else:                                      # qb_change
                    ch = []
                    for t, q in ((h, getattr(g, "home_qb_id", None)), (a, getattr(g, "away_qb_id", None))):
                        prev = last_qb.get(t)
                        ch.append(float(isinstance(q, str) and prev is not None and q != prev))
                    f.append(ch[0] - ch[1])
            out[g.game_id] = f
        for g in slot:                                     # then learn from the slot's finished games
            if not played(g):
                continue
            for gid, shots, saves in apps.get(g.game_id, []):
                for s in goalie_sigs:
                    roll(s, gid, g.season)
                    w = gw[s["id"]][gid]
                    lamg = g_lam[s["id"]]
                    w[0], w[1] = lamg * w[0] + saves, lamg * w[1] + shots
                league_sv[0] += saves
                league_sv[1] += shots
            h, a = FRANCHISE.get(g.home_team, g.home_team), FRANCHISE.get(g.away_team, g.away_team)
            for t, q in ((h, getattr(g, "home_qb_id", None)), (a, getattr(g, "away_qb_id", None))):
                if isinstance(q, str):
                    last_qb[t] = q
            for s in team_sigs:
                for o, d in ((h, a), (a, h)):
                    v = value(s, rows.get((g.game_id, o)))
                    if v is None:
                        continue
                    t = o if s["side"] == "offense" else d       # defense: the team that allowed it
                    old = val[s["id"]][t]
                    val[s["id"]][t] = v if old is None else lam[s["id"]] * old + (1 - lam[s["id"]]) * v
                    league[s["id"]].append(v)
    return out


def run_signals(p, data, market):
    """Base model + signals, beta fit on the training seasons (A3.4)."""
    from . import models
    sigs = [validate(dict(s)) for s in p["signals"]]
    if not sigs or len(sigs) > MAX_PER_MODEL:
        raise SignalError(f"a signals model takes 1-{MAX_PER_MODEL} signals")
    if any(market not in s["markets"] for s in sigs):
        raise SignalError(f"a signal here does not apply to {market}")
    base, base_fit = models.run({"id": "base", "market": market, "model": p["base"]}, data)
    F = features(sigs, data, market)
    X = np.array([F[g] for g in base.game_id])
    resid = (base.actual - base.forecast).values
    fit_in = (base.season >= C.TRAIN[0]) & (base.season <= C.TRAIN[1])
    seasons = f"{C.TRAIN[0]}-{C.TRAIN[1]}"
    if any(s["kind"] == "injury" for s in sigs):        # v12 A3.3e: the training seasons have no injury data
        fit_in = fit_in | ((base.season >= C.INJURY_FIT[0]) & (base.season <= C.INJURY_FIT[1]))
        seasons += f" + {C.INJURY_FIT[0]}-{C.INJURY_FIT[1]}"
    tr = (fit_in & base.actual.notna() & ~base.season.isin(C.SKIP_SEASONS)).values
    Xt = X[tr]
    lam = float(p.get("ridge", 1.0))
    beta = np.linalg.solve(Xt.T @ Xt + lam * np.eye(X.shape[1]), Xt.T @ resid[tr])
    out = base.copy()
    out["forecast"] = base.forecast.values + X @ beta
    fit = {"beta": {s["id"]: round(float(b), 6) for s, b in zip(sigs, beta)}, "fit_games": int(tr.sum()),
           "fit_seasons": seasons, "base_fit": base_fit}
    return out, fit
