#!/usr/bin/env python3
"""
kalshi_props_v2_study.py -- runs the pre-registered study NFL_PROPS_V2_STUDY (nfl/NFL_PROPS_V2_STUDY_PREREG.md):
a calibrated, pickier prop model (v2) built on weeks 1-2 of 2026 and judged on weeks 3-6 against Kalshi's price and
against v1. Written and committed before any v2 number was computed.

Run from the repo root (GitHub Actions):  python3 nfl/kalshi_props_v2_study.py
Inputs : the same files as the v1 back-test (it reuses that script's scoring helpers unchanged).
Outputs: nfl/props_history/v2_study_results.json and v2_study_results.md, and v2_study_rows.csv (every scored
         main-set row, so later work can reuse it without re-downloading play-by-play).

Implementation choices the prereg does not spell out, fixed here before running:
- Rows are scored exactly as kalshi_props_backtest_v1.main() does (copied below, same helpers).
- The logistic fit uses Newton steps (at most 50, stop when the step is below 1e-10) with no regularization.
- "ROI" is profit / cost with cost = price + fee per contract, as in the v1 back-test's roi_block.
- Bootstraps use numpy default_rng(20261019), resampling games with replacement.
"""
import csv, hashlib, json, os, sys
import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import nfl_props_model_lib_v1 as L  # noqa: E402
import kalshi_props_backtest_v1 as B  # noqa: E402  (helpers only; its main() is not run)

PREREG = os.path.join(HERE, "NFL_PROPS_V2_STUDY_PREREG.md")
OUT_JSON = os.path.join(HERE, "props_history", "v2_study_results.json")
OUT_MD = os.path.join(HERE, "props_history", "v2_study_results.md")
OUT_ROWS = os.path.join(HERE, "props_history", "v2_study_rows.csv")
SPLIT = "2026-09-24"
THRESHOLDS = [0.02, 0.03, 0.04, 0.06, 0.08]
MIN_LEARN_PICKS, MAX_PER_GAME = 40, 3
B.SEED = 20261019


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def logit(p):
    p = np.clip(np.asarray(p, float), 0.01, 0.99)
    return np.log(p / (1 - p))


def fit_logistic(X, y):
    w = np.zeros(X.shape[1])
    for _ in range(50):
        p = 1 / (1 + np.exp(-(X @ w)))
        g = X.T @ (y - p)
        H = (X * (p * (1 - p))[:, None]).T @ X
        step = np.linalg.solve(H + 1e-9 * np.eye(len(w)), g)
        w += step
        if np.max(np.abs(step)) < 1e-10:
            break
    return w


def score_rows():
    """Every settled row scored with the frozen v1 model, exactly as the v1 back-test does."""
    rows = [r for r in csv.DictReader(open(B.DATA)) if r["result"] in ("yes", "no") and r["stat"] in L.STATS]
    assert sha(B.TABLES) == B.FROZEN_SHA, "frozen tables file changed"
    tables = json.load(open(B.TABLES))["tables"]
    scored = []
    for s in sorted({int(r["season"]) for r in rows}):
        if s != B.FROZEN_SEASON:
            continue                                   # the history holds 2026 only; v2 uses the frozen tables
        rmap = B.roster_map(s)
        pg = B.player_games(range(s - 3, s + 1))
        srows = [r for r in rows if int(r["season"]) == s]
        for date in sorted({r["game_date"] for r in srows}):
            exp = L.next_game_expectations(pg, pd.Timestamp(date))
            for r in (x for x in srows if x["game_date"] == date):
                team = B.slug_team(r["player_slug"], r["away_team"], r["home_team"])
                ids = rmap.get((B.norm(r["player"]), team), set()) if team else set()
                if not ids:
                    for t in (r["away_team"], r["home_team"]):
                        ids |= rmap.get((B.norm(r["player"]), t), set())
                if not ids:
                    ids = rmap.get((B.norm(r["player"]), None), set())
                pid = next(iter(ids)) if len(ids) == 1 else None
                e = exp.get(pid, {}) if pid else {}
                ev, n = e.get("exp_" + r["stat"]), int(e.get("n_" + r["stat"], 0) or 0)
                line = float(r["line"])
                mp = L.p_over(tables, r["stat"], ev, line) if (pid and n >= B.MIN_PREV) else None
                scored.append({"game": f'{r["game_date"]}_{r["away_team"]}_{r["home_team"]}', "date": r["game_date"],
                               "stat": r["stat"], "player": r["player"], "line": line, "n": n, "model_p": mp,
                               "bid": B.fnum(r["yes_bid"]), "ask": B.fnum(r["yes_ask"]), "oi": B.fnum(r["open_interest"]),
                               "y": 1 if r["result"] == "yes" else 0})
    return [r for r in scored if r["model_p"] is not None and r["n"] >= B.MIN_PREV_PICK and r["stat"] in B.PICK_STATS
            and r["bid"] is not None and r["ask"] is not None and 0 < r["bid"] < r["ask"] < 1
            and r["ask"] - r["bid"] <= B.MAX_SPREAD and (r["oi"] or 0) >= B.MIN_OI]


def v2_picks(rows, p2, T):
    best = {}
    for r, p in zip(rows, p2):
        no_ask = round(1 - r["bid"], 4)
        eo, eu = p - r["ask"] - B.fee(r["ask"]), (1 - p) - no_ask - B.fee(no_ask)
        side, edge = ("OVER", eo) if eo >= eu else ("UNDER", eu)
        if edge < T:
            continue
        k = (r["game"], r["player"], r["stat"])
        if k not in best or edge > best[k]["edge"]:
            best[k] = {"game": r["game"], "stat": r["stat"], "side": side, "edge": edge,
                       "price": r["ask"] if side == "OVER" else no_ask, "chance": p if side == "OVER" else 1 - p,
                       "won": (r["y"] == 1) if side == "OVER" else (r["y"] == 0)}
    by_game = {}
    for b in best.values():
        by_game.setdefault(b["game"], []).append(b)
    out = []
    for g in by_game.values():
        out += sorted(g, key=lambda b: -b["edge"])[:MAX_PER_GAME]
    return out


def v1_picks(rows):
    best = {}
    for r in rows:
        e = B.label_edge(r)
        if not e or e["tier"] not in ("MEDIUM", "HIGH"):
            continue
        k = (r["game"], r["player"], r["stat"])
        if k not in best or e["ev"] > best[k][1]["ev"]:
            best[k] = (r, e)
    return [{"game": r["game"], "stat": r["stat"], "side": e["side"], "price": e["price"],
             "chance": r["model_p"] if e["side"] == "OVER" else 1 - r["model_p"],
             "won": (r["y"] == 1) if e["side"] == "OVER" else (r["y"] == 0)} for r, e in best.values()]


def picks_block(bets):
    blk = B.roi_block(bets)
    if bets:
        blk["avg_chance_given_pct"] = round(float(np.mean([b["chance"] for b in bets])) * 100, 2)
    return blk


def compare(rows, a, b):
    y = np.array([r["y"] for r in rows], float)
    la, lb = B.logloss(np.asarray(a), y), B.logloss(np.asarray(b), y)
    res = {"rows": len(rows), "games": len({r["game"] for r in rows}), "a_logloss": round(float(la.mean()), 5),
           "b_logloss": round(float(lb.mean()), 5), "diff_a_minus_b": round(float((la - lb).mean()), 5)}
    if res["games"] >= 2:
        res["diff_95ci"] = [round(x, 5) for x in B.boot_mean_diff([r["game"] for r in rows], la, lb)]
    return res


def verdict(res, a_name, b_name, enough):
    if not enough:
        return "INCONCLUSIVE"
    lo, hi = res["diff_95ci"]
    return f"{a_name} MORE RIGHT" if hi < 0 else (f"{b_name} MORE RIGHT" if lo > 0 else "TOO CLOSE TO CALL")


def main():
    rows = score_rows()
    with open(OUT_ROWS, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    learn = [r for r in rows if r["date"] < SPLIT]
    test = [r for r in rows if r["date"] >= SPLIT]

    def X(rs):
        return np.column_stack([np.ones(len(rs)), logit([(r["bid"] + r["ask"]) / 2 for r in rs]), logit([r["model_p"] for r in rs])])
    coef = fit_logistic(X(learn), np.array([r["y"] for r in learn], float))
    p2 = lambda rs: 1 / (1 + np.exp(-(X(rs) @ coef)))  # noqa: E731

    learn_p2 = p2(learn)
    tries = {}
    for T in THRESHOLDS:
        tries[str(T)] = picks_block(v2_picks(learn, learn_p2, T))
    ok = [T for T in THRESHOLDS if tries[str(T)].get("count", 0) >= MIN_LEARN_PICKS]
    T = max(ok, key=lambda t: tries[str(t)]["roi"]) if ok else THRESHOLDS[0]

    test_p2 = p2(test)
    mid = [(r["bid"] + r["ask"]) / 2 for r in test]
    enough = len(test) >= 300 and len({r["game"] for r in test}) >= 30
    a = compare(test, test_p2, mid)
    a["verdict"] = verdict(a, "V2", "KALSHI", enough)
    b = compare(test, test_p2, [r["model_p"] for r in test])
    b["verdict"] = verdict(b, "V2", "V1", enough)
    v2t, v1t = v2_picks(test, test_p2, T), v1_picks(test)
    c = {"v2_picks": picks_block(v2t), "v1_medium_high_picks": picks_block(v1t)}
    c["v2_by_stat"] = {st: B.roi_block([x for x in v2t if x["stat"] == st]) for st in B.PICK_STATS}
    v2_roi, v1_roi = c["v2_picks"].get("roi"), c["v1_medium_high_picks"].get("roi")
    adopt = (enough and a["verdict"] != "KALSHI MORE RIGHT" and b["verdict"] == "V2 MORE RIGHT"
             and v2_roi is not None and (v1_roi is None or v2_roi > v1_roi))

    out = {"doc": "NFL_PROPS_V2_STUDY", "prereg_sha256": sha(PREREG), "script_sha256": sha(__file__),
           "data_sha256": sha(B.DATA), "tables_sha256": sha(B.TABLES), "split": SPLIT,
           "rows": {"main_set": len(rows), "learning": len(learn), "test": len(test),
                    "learning_games": len({r["game"] for r in learn}), "test_games": len({r["game"] for r in test})},
           "v2": {"coef_a_b_c": [round(float(x), 5) for x in coef], "threshold": T, "learning_picks_by_threshold": tries},
           "test_a_v2_vs_kalshi": a, "test_b_v2_vs_v1": b, "test_c_picks": c,
           "decision": "ADOPT V2" if adopt else "KEEP V1"}
    json.dump(out, open(OUT_JSON, "w"), indent=1)
    md = ["# NFL_PROPS_V2_STUDY results", "",
          f"Prereg sha256 `{out['prereg_sha256']}` · learning games before {SPLIT}, test games from {SPLIT}", "",
          f"Rows: {json.dumps(out['rows'])}", "",
          f"v2 = sigmoid({coef[0]:.3f} + {coef[1]:.3f}·logit(Kalshi mid) + {coef[2]:.3f}·logit(v1 model)); threshold T = {T}", "",
          f"## Test A (primary): {a['verdict']}", f"v2 log loss {a['a_logloss']} vs Kalshi {a['b_logloss']}, "
          f"difference {a['diff_a_minus_b']} (95% CI {a.get('diff_95ci')}). Negative = v2 more right.", "",
          f"## Test B: {b['verdict']}", f"v2 log loss {b['a_logloss']} vs v1 {b['b_logloss']}, difference "
          f"{b['diff_a_minus_b']} (95% CI {b.get('diff_95ci')}).", "",
          "## Test C: picks on the test games", f"v2: {json.dumps(c['v2_picks'])}",
          f"v1 MEDIUM + HIGH: {json.dumps(c['v1_medium_high_picks'])}", "",
          f"## Decision: {out['decision']}", "",
          "This is a back-test on past prices; it cannot replace a live paper test."]
    open(OUT_MD, "w").write("\n".join(md) + "\n")
    print("\n".join(md))


if __name__ == "__main__":
    main()
