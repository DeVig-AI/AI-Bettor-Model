#!/usr/bin/env python3
"""
nfl_injury_study_v1.py -- the NFL injury study, exactly as research/injuries/NFL_INJURY_STUDY_V1_PREREG.md says.
Runs once; writes research/injuries/results_v1.json and results_v1.md. Nothing here feeds a pick, the app or a test.

Data: nflverse releases (public), seasons 2013-2024 only, downloaded into research/injuries/.cache/ (not committed).

Usage:  python3 research/injuries/nfl_injury_study_v1.py
"""
import json
import math
import os
import re
import sys
import urllib.request
from collections import defaultdict, deque
from datetime import datetime, timezone

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".cache")
REL = "https://github.com/nflverse/nflverse-data/releases/download/"
SEASONS = range(2013, 2025)
FIT, TEST = (2013, 2018), (2019, 2024)
SEED, B = 20261019, 10_000
COST = 0.5175                                   # Kalshi price at 50c plus the taker fee (Lab A4)
FRANCHISE = {"STL": "LA", "SD": "LAC", "OAK": "LV"}
OUT_STATUS, Q_STATUS = {"Out", "Doubtful"}, {"Questionable"}


def get(name):
    path = os.path.join(CACHE, name.replace("/", "__"))
    if not os.path.exists(path):
        os.makedirs(CACHE, exist_ok=True)
        req = urllib.request.Request(REL + name, headers={"User-Agent": "devig-research/1.0"})
        with urllib.request.urlopen(req, timeout=120) as r, open(path + ".part", "wb") as f:
            f.write(r.read())
        os.replace(path + ".part", path)
    return pd.read_csv(path, low_memory=False)


def fr(t):
    return FRANCHISE.get(t, t)


def norm(name):
    return re.sub(r"[^a-z]", "", str(name).lower().replace(" jr", "").replace(" sr", "").replace(" iii", "").replace(" ii", ""))


def load():
    g = get("schedules/games.csv")
    g = g[g.season.between(SEASONS.start, SEASONS.stop - 1)].copy()
    g = g[g.home_score.notna() & g.away_score.notna()]
    g["home"], g["away"] = g.home_team.map(fr), g.away_team.map(fr)
    g = g.sort_values(["season", "week", "gameday", "game_id"]).reset_index(drop=True)
    snaps = pd.concat([get(f"snap_counts/snap_counts_{y}.csv") for y in SEASONS], ignore_index=True)
    inj = pd.concat([get(f"injuries/injuries_{y}.csv") for y in SEASONS], ignore_index=True)
    players = get("players/players.csv")
    rosters = pd.concat([get(f"weekly_rosters/roster_weekly_{y}.csv") for y in SEASONS], ignore_index=True)
    return g, snaps, inj, players, rosters


def build(g, snaps, inj, players, rosters):
    """One row per game with the base and injury features (prereg 'Features'), and the join coverage."""
    snaps = snaps.copy()
    snaps["team"] = snaps.team.map(fr)
    snaps["key"] = snaps.pfr_player_id.astype(str)
    gsis_pfr = dict(zip(players.gsis_id, players.pfr_id))
    by_game = {gid: x for gid, x in snaps.groupby("game_id")}
    # injury rows with a status, keyed (season, week, team); each player's snap-count key when it can be found
    inj = inj[inj.report_status.isin(OUT_STATUS | Q_STATUS)].copy()
    inj["team"] = inj.team.map(fr)
    name_key = {}
    for r in snaps[["team", "season", "player", "key"]].drop_duplicates().itertuples():
        name_key[(r.team, r.season, norm(r.player))] = r.key
    snap_keys = set(snaps.key)
    def key_of(gsis, team, season, name):
        k = gsis_pfr.get(gsis)
        if not isinstance(k, str):
            k = name_key.get((team, season, norm(name)))
        return k if isinstance(k, str) else None
    inj["key"] = [key_of(r.gsis_id, r.team, r.season, r.full_name) for r in inj.itertuples()]
    matched = int(inj.key.isin(snap_keys).sum())
    report = defaultdict(list)
    for r in inj.itertuples():
        report[(r.season, r.week, r.team)].append((r.key, r.report_status))
    # weekly rosters: (season, week, team) -> {player key: status}
    rosters = rosters.copy()
    rosters["team"] = rosters.team.map(fr)
    roster = defaultdict(dict)
    for r in rosters.itertuples():
        k = key_of(r.gsis_id, r.team, r.season, r.full_name)
        if k:
            roster[(int(r.season), int(r.week), r.team)][k] = r.status

    hist = defaultdict(lambda: deque(maxlen=3))    # team -> last 3 games' {player key: max snap share}, QB key
    margins = defaultdict(lambda: deque(maxlen=8))
    rows = []
    for r in g.itertuples():
        f = {"game_id": r.game_id, "season": int(r.season), "week": int(r.week), "game_type": r.game_type,
             "margin": float(r.home_score - r.away_score), "spread_line": r.spread_line,
             "d_rest": 0.0 if pd.isna(r.home_rest) or pd.isna(r.away_rest) else float(r.home_rest - r.away_rest)}
        side = {}
        for t in (r.home, r.away):
            h = [x for x in hist[t] if x[2] == r.season]          # this season's games only
            count = defaultdict(int)
            for shares, _, _ in h:
                for k, v in shares.items():
                    if v >= 0.5:
                        count[k] += 1
            regulars = {k for k, c in count.items() if c >= math.ceil(len(h) / 2)}
            qb = h[-1][1] if h else None
            rep = report.get((r.season, r.week, t), [])
            st = {k: s for k, s in rep if k}
            ros = roster.get((r.season, r.week, t))
            def out(k):
                return st.get(k) in OUT_STATUS or (bool(ros) and ros.get(k) != "ACT")
            side[t] = {"qb_out": float(qb is not None and out(qb)),
                       "reg_out": float(sum(1 for k in regulars if k != qb and out(k))),
                       "reg_q": float(sum(1 for k in regulars if k != qb and not out(k) and st.get(k) in Q_STATUS)),
                       "form": float(np.mean(margins[t])) if margins[t] else 0.0}
        hs, as_ = side[r.home], side[r.away]
        f.update(d_qb=hs["qb_out"] - as_["qb_out"], d_out=hs["reg_out"] - as_["reg_out"], d_q=hs["reg_q"] - as_["reg_q"],
                 d_form=hs["form"] - as_["form"], home_qb_out=hs["qb_out"], away_qb_out=as_["qb_out"])
        rows.append(f)
        # then learn from this game
        x = by_game.get(r.game_id)
        for t in (r.home, r.away):
            if x is not None:
                y = x[x.team == t]
                shares = {k: max(float(o or 0), float(d or 0)) for k, o, d in zip(y.key, y.offense_pct, y.defense_pct)}
                q = y[y.position == "QB"].sort_values("offense_snaps", ascending=False)
                hist[t].append((shares, q.key.iloc[0] if len(q) else None, r.season))
        margins[r.home].append(float(r.home_score - r.away_score))
        margins[r.away].append(float(r.away_score - r.home_score))
    d = pd.DataFrame(rows)
    snap_games = set(snaps.game_id)
    cover = {"report_rows_with_status": int(len(inj)), "report_rows_matched_to_snap_counts": matched,
             "team_weeks_with_roster": int(len(roster)),
             "games": int(len(d)), "games_with_snap_counts": int(sum(gid in snap_games for gid in d.game_id))}
    return d, cover


def ols(X, y):
    X1 = np.column_stack([np.ones(len(X)), X])
    beta, *_ = np.linalg.lstsq(X1, y, rcond=None)
    return beta


def logit(X, y, iters=50):
    X1 = np.column_stack([np.ones(len(X)), X])
    w = np.zeros(X1.shape[1])
    for _ in range(iters):
        p = 1 / (1 + np.exp(-X1 @ w))
        H = X1.T @ (X1 * (p * (1 - p))[:, None])
        step = np.linalg.solve(H, X1.T @ (y - p))
        w += step
        if np.max(np.abs(step)) < 1e-10:
            break
    return w


def predict(w, X):
    return 1 / (1 + np.exp(-np.column_stack([np.ones(len(X)), X]) @ w))


def phi(z):
    return 0.5 * (1 + math.erf(z / math.sqrt(2)))


def boot_idx(n):
    return np.random.default_rng(SEED).integers(0, n, size=(B, n))


INJ = ["d_qb", "d_out", "d_q"]
BASE = ["d_form", "d_rest"]


def question_a(d):
    x = d[d.spread_line.notna()].copy()
    x["r"] = x.margin - x.spread_line
    fit = x[x.season.between(*FIT)]
    test = x[x.season.between(*TEST)].reset_index(drop=True)
    beta = ols(fit[INJ].values, fit.r.values)
    s0 = 1.0 if fit.r.mean() >= 0 else -1.0
    side = np.sign(test[INJ].values @ beta[1:])
    r = test.r.values
    def effect(idx=None):
        s, rr = (side, r) if idx is None else (side[idx], r[idx])
        return float(np.mean(s * rr) - np.mean(s0 * rr))
    E = effect()
    idx = boot_idx(len(r))
    dist = np.mean((side - s0)[idx] * r[idx], axis=1)
    se = float(np.std(dist))
    picks = side != 0
    res = side[picks] * r[picks]
    w, l, push = int((res > 0).sum()), int((res < 0).sum()), int((res == 0).sum())
    profit = w * (1 - COST) - l * COST
    halves = {}
    for lo, hi in ((2019, 2021), (2022, 2024)):
        m = test.season.between(lo, hi).values
        halves[f"{lo}-{hi}"] = round(float(np.mean(side[m] * r[m]) - np.mean(s0 * r[m])), 4)
    p = 1 - phi(E / se) if se > 0 else 1.0
    return {"coef_points": dict(zip(["intercept"] + INJ, [round(float(b), 4) for b in beta])),
            "fit_games": int(len(fit)), "test_games": int(len(test)), "baseline_side": s0,
            "effect_pts": round(E, 4), "ci95": [round(float(np.percentile(dist, 2.5)), 4), round(float(np.percentile(dist, 97.5)), 4)],
            "p_one_sided": round(p, 4), "passes": bool(E > 0 and p < 0.05),
            "picks": int(picks.sum()), "w": w, "l": l, "push": push,
            "win_pct": round(w / (w + l), 4) if w + l else None, "breakeven": COST,
            "roi": round(profit / ((w + l) * COST), 4) if w + l else None, "effect_by_period": halves}


def question_b(d):
    x = d[d.margin != 0]
    fit, test = x[x.season.between(*FIT)], x[x.season.between(*TEST)]
    y_fit, y = (fit.margin > 0).astype(float).values, (test.margin > 0).astype(float).values
    out, probs = {}, {}
    for name, cols in (("base", BASE), ("base_plus_injuries", BASE + INJ)):
        w = logit(fit[cols].values, y_fit)
        p = np.clip(predict(w, test[cols].values), 1e-12, 1 - 1e-12)
        probs[name] = p
        out[name] = {"coef": dict(zip(["intercept"] + cols, [round(float(v), 5) for v in w])),
                     "log_loss": round(float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p))), 5),
                     "brier": round(float(np.mean((p - y) ** 2)), 5),
                     "accuracy": round(float(np.mean((p > 0.5) == (y == 1))), 4)}
    ll = lambda p: -(y * np.log(p) + (1 - y) * np.log(1 - p))
    diff = ll(probs["base_plus_injuries"]) - ll(probs["base"])
    dist = diff[boot_idx(len(diff))].mean(axis=1)
    ci = [round(float(np.percentile(dist, 2.5)), 5), round(float(np.percentile(dist, 97.5)), 5)]
    out["log_loss_change"] = round(float(diff.mean()), 5)
    out["log_loss_change_ci95"] = ci
    out["helps"] = bool(diff.mean() < 0 and ci[1] < 0)
    out["fit_games"], out["test_games"] = int(len(fit)), int(len(test))
    # points: what the games say each is worth, and what the closing line moved for it (2013-2018)
    f2 = d[d.season.between(*FIT) & d.spread_line.notna()]
    cols = BASE + INJ
    out["margin_points"] = dict(zip(["intercept"] + cols, [round(float(v), 3) for v in ols(f2[cols].values, f2.margin.values)]))
    out["closing_line_points"] = dict(zip(["intercept"] + cols, [round(float(v), 3) for v in ols(f2[cols].values, f2.spread_line.values)]))
    return out


def report_md(res):
    a, b, c = res["question_a"], res["question_b"], res["coverage"]
    pct = lambda v: f"{v * 100:.1f}%"
    lines = [
        "# NFL injury study v1 -- results",
        "",
        f"Run {res['run_at']}, exactly as `NFL_INJURY_STUDY_V1_PREREG.md` (fit {FIT[0]}-{FIT[1]}, test {TEST[0]}-{TEST[1]}).",
        f"Injury-report rows with a status: {c['report_rows_with_status']:,}; matched to snap counts: "
        f"{c['report_rows_matched_to_snap_counts']:,} ({pct(c['report_rows_matched_to_snap_counts'] / c['report_rows_with_status'])}). "
        f"Games: {c['games']:,} ({c['games_with_snap_counts']:,} with snap counts).",
        "",
        "## A. Beyond the closing line (primary)",
        f"- Effect: **{a['effect_pts']:+.3f} points per game** (95% interval {a['ci95'][0]:+.3f} to {a['ci95'][1]:+.3f}), "
        f"one-sided p = {a['p_one_sided']:.3f} -> **{'PASS' if a['passes'] else 'no edge'}**.",
        f"- Picks against the line: {a['w']}-{a['l']} ({pct(a['win_pct']) if a['win_pct'] is not None else '—'}; "
        f"break-even 51.75%), ROI at Kalshi pricing {pct(a['roi']) if a['roi'] is not None else '—'} on {a['picks']} picks.",
        f"- By period: " + ", ".join(f"{k} {v:+.3f}" for k, v in a["effect_by_period"].items()) + " points.",
        f"- Fit coefficients (cover points): " + ", ".join(f"{k} {v:+.3f}" for k, v in a["coef_points"].items()),
        "",
        "## B. A model that does not see the line",
        "| Test 2019-2024 | Log loss | Brier | Accuracy |",
        "|---|---|---|---|",
        f"| Base (form, rest) | {b['base']['log_loss']:.4f} | {b['base']['brier']:.4f} | {pct(b['base']['accuracy'])} |",
        f"| Base + injuries | {b['base_plus_injuries']['log_loss']:.4f} | {b['base_plus_injuries']['brier']:.4f} | {pct(b['base_plus_injuries']['accuracy'])} |",
        "",
        f"Log-loss change {b['log_loss_change']:+.5f} (95% interval {b['log_loss_change_ci95'][0]:+.5f} to "
        f"{b['log_loss_change_ci95'][1]:+.5f}) -> **{'injuries help' if b['helps'] else 'no clear help'}**.",
        "",
        "Points (2013-2018 least squares, home minus away):",
        "",
        "| Feature | What the games say | What the closing line moved |",
        "|---|---|---|",
    ]
    for k in BASE + INJ:
        lines.append(f"| {k} | {b['margin_points'][k]:+.2f} | {b['closing_line_points'][k]:+.2f} |")
    return "\n".join(lines) + "\n"


def main():
    g, snaps, inj, players, rosters = load()
    d, cover = build(g, snaps, inj, players, rosters)
    res = {"study": "NFL_INJURY_STUDY_V1", "run_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
           "coverage": cover, "question_a": question_a(d), "question_b": question_b(d),
           "feature_counts": {"games_home_qb_out": int(d.home_qb_out.sum()), "games_away_qb_out": int(d.away_qb_out.sum()),
                              "games_any_regular_out": int((d.d_out != 0).sum())}}
    with open(os.path.join(HERE, "results_v1.json"), "w") as f:
        json.dump(res, f, indent=1)
    md = report_md(res)
    with open(os.path.join(HERE, "results_v1.md"), "w") as f:
        f.write(md)
    print(md)
    return 0


if __name__ == "__main__":
    sys.exit(main())
