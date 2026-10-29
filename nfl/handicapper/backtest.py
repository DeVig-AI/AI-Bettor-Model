#!/usr/bin/env python3
"""
backtest.py -- NFL Handicapper v1 Kalshi price-move back-test, exactly as HANDICAPPER_V1_BACKTEST_PREREG.md says.
Reads model.json, data/*.csv and data/kalshi_moneyline_history.csv; writes BACKTEST_RESULTS.md and
data/backtest_bets.csv. Nothing is bet.
Run from the repo root:  python3 nfl/handicapper/backtest.py
"""
import json
import os
import sys

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(os.path.dirname(HERE)))
sys.path.insert(0, HERE)
import build_model as B  # noqa: E402
import ratings as R  # noqa: E402

THRESHOLD = 0.04
MAX_SPREAD = 0.05
MIN_BETS = 30
TESTS = {"A": ("early", "d6"), "B": ("late", "d1")}


def lines(model, games, team, av):
    """{line name: DataFrame game_id, season, our home chance} from the frozen model."""
    walk = R.Walk(games, team, **model["ratings"])
    out = {}
    for name, spec in model["lines"].items():
        f = R.features(walk, games, av, pd.Timedelta(hours=spec["before_hours"]))
        c = R.cols(spec["groups"])
        b = np.array([spec["coef"][k] for k in c + ["const"]])
        line = R.predict(b, f[c].values)
        out[name] = f[["game_id", "season", "game_type", "home_team", "away_team", "actual"]].assign(
            line=line, ours=R.win_prob(line, spec["sigma"]))
    return out


def market(k):
    """One row per (game_id, snap): home chance, home ask, away ask, usable."""
    k = k.copy()
    k["mid"] = (k.yes_bid + k.yes_ask) / 2
    k["ok"] = k.yes_bid.notna() & k.yes_ask.notna() & ((k.yes_ask - k.yes_bid) <= MAX_SPREAD + 1e-9)
    h = k[k.side == "home"].set_index(["game_id", "snap"])
    a = k[k.side == "away"].set_index(["game_id", "snap"])
    j = h[["mid", "yes_ask", "ok", "result"]].join(a[["mid", "yes_ask", "ok"]], lsuffix="_h", rsuffix="_a", how="inner")
    j["p"] = (j.mid_h + (1 - j.mid_a)) / 2
    j["usable"] = j.ok_h & j.ok_a
    j["home_won"] = (j.result == "yes").astype(float).where(j.result.isin(["yes", "no"]))
    return j.reset_index()


def tstat(x):
    x = np.asarray(x, float)
    return float(x.mean() / (x.std(ddof=1) / np.sqrt(len(x)))) if len(x) > 1 and x.std(ddof=1) > 0 else float("nan")


def run_test(ours, mk, buy):
    m0 = mk[(mk.snap == buy) & mk.usable].set_index("game_id")
    m1 = mk[(mk.snap == "close") & mk.usable].set_index("game_id")
    g = ours.set_index("game_id").join(m0[["p", "yes_ask_h", "yes_ask_a", "home_won"]], how="inner")
    g = g.join(m1[["p"]].rename(columns={"p": "p_close"}), how="inner")
    g["edge"] = g.ours - g.p
    g["move"] = g.p_close - g.p
    bets = g[g.edge.abs() >= THRESHOLD].copy()
    home = bets.edge > 0
    bets["side"] = np.where(home, "home", "away")
    bets["ask"] = np.where(home, bets.yes_ask_h, bets.yes_ask_a)
    bets["fee"] = 0.07 * bets.ask * (1 - bets.ask)
    bets["close"] = np.where(home, bets.p_close, 1 - bets.p_close)
    bets["clv"] = bets.close - bets.ask - bets.fee
    bets["won"] = np.where(home, bets.home_won, 1 - bets.home_won)
    bets["profit"] = bets.won - bets.ask - bets.fee
    return g, bets


def summary(g, bets):
    n = len(bets)
    corr = float(np.corrcoef(g.edge, g.move)[0, 1]) if len(g) > 2 else float("nan")
    tc = corr * np.sqrt((len(g) - 2) / (1 - corr ** 2)) if len(g) > 2 else float("nan")
    s = dict(games=len(g), bets=n, mean_clv=float(bets.clv.mean()) if n else float("nan"), t_clv=tstat(bets.clv),
             corr_edge_move=corr, t_corr=float(tc),
             win_rate=float(bets.won.mean()) if n else float("nan"),
             roi=float(bets.profit.sum() / (bets.ask + bets.fee).sum()) if n else float("nan"))
    s["passed"] = bool(n >= MIN_BETS and s["mean_clv"] > 0 and s["t_clv"] >= 2.0)
    return s


def main():
    model = json.load(open(os.path.join(HERE, "model.json")))
    games, team, av = B.load()
    k = pd.read_csv(os.path.join(HERE, "data", "kalshi_moneyline_history.csv"))
    mk = market(k)
    ls = lines(model, games, team, av)
    out = ["# NFL Handicapper v1: Kalshi price-move back-test results", "",
           "Rules: `HANDICAPPER_V1_BACKTEST_PREREG.md`. CLV and ROI are per $1 contract, fee included. Nothing is bet.", ""]
    all_bets = []
    res = {}
    for test, (line, buy) in TESTS.items():
        g, bets = run_test(ls[line], mk, buy)
        s = summary(g, bets)
        res[test] = s
        all_bets.append(bets.reset_index().assign(test=test))
        out += [f"## Test {test}: {line} line, bought at `{buy}`, graded at `close`: **{'PASS' if s['passed'] else 'FAIL'}**", "",
                f"- Games with usable prices: {s['games']}; bets (|edge| >= {THRESHOLD}): {s['bets']}",
                f"- Mean CLV: {s['mean_clv']:+.4f} per contract (t = {s['t_clv']:.2f})",
                f"- Edge vs price move correlation: {s['corr_edge_move']:+.3f} (t = {s['t_corr']:.2f})",
                f"- Results (not counted): won {s['win_rate']:.1%}, ROI {s['roi']:+.1%}", "",
                "| Season | Games | Bets | Mean CLV | t | Corr | Won | ROI |", "|---|---|---|---|---|---|---|---|"]
        for season in sorted(g.season.unique()):
            ss = summary(g[g.season == season], bets[bets.season == season])
            out.append(f"| {season} | {ss['games']} | {ss['bets']} | {ss['mean_clv']:+.4f} | {ss['t_clv']:.2f} | "
                       f"{ss['corr_edge_move']:+.3f} | {ss['win_rate']:.1%} | {ss['roi']:+.1%} |")
        out.append("")
    pd.concat(all_bets).to_csv(os.path.join(HERE, "data", "backtest_bets.csv"), index=False)
    open(os.path.join(HERE, "BACKTEST_RESULTS.md"), "w").write("\n".join(out) + "\n")
    print("\n".join(out))
    return res


if __name__ == "__main__":
    main()
