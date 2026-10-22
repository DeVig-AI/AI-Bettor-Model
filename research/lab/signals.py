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
KINDS = {"team", "schedule", "qb_change"}
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
        bad = cols - TEAM_COLUMNS
        if bad or not sig.get("num"):
            raise SignalError(f"{sig['id']}: columns {sorted(bad) or '(none)'} are not allowed")
        if sig.get("side") not in ("offense", "defense"):
            raise SignalError(f"{sig['id']}: side must be offense or defense")
        if not (1 <= float(sig.get("halflife", 0)) <= 64):
            raise SignalError(f"{sig['id']}: halflife must be 1-64 games")
    if sig["kind"] == "schedule" and sig.get("field") not in SCHEDULE_FIELDS:
        raise SignalError(f"{sig['id']}: schedule field {sig.get('field')!r} is not allowed")
    markets = sig.get("markets") or ["spread", "total"]
    if sig["kind"] in ("schedule", "qb_change"):
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
    out = {}

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
            if not d:
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
    tr = ((base.season >= C.TRAIN[0]) & (base.season <= C.TRAIN[1]) & base.actual.notna()
          & ~base.season.isin(C.SKIP_SEASONS)).values
    Xt = X[tr]
    lam = float(p.get("ridge", 1.0))
    beta = np.linalg.solve(Xt.T @ Xt + lam * np.eye(X.shape[1]), Xt.T @ resid[tr])
    out = base.copy()
    out["forecast"] = base.forecast.values + X @ beta
    fit = {"beta": {s["id"]: round(float(b), 6) for s, b in zip(sigs, beta)}, "fit_games": int(tr.sum()),
           "fit_seasons": f"{C.TRAIN[0]}-{C.TRAIN[1]}", "base_fit": base_fit}
    return out, fit
