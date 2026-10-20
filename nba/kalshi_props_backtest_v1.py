#!/usr/bin/env python3
"""
kalshi_props_backtest_v1.py -- runs the pre-registered back-test NBA_PROPS_KALSHI_BACKTEST_V1
(nba/NBA_PROPS_KALSHI_BACKTEST_V1_PREREG.md) on the settled Kalshi NBA prop markets collected by
nba/kalshi_props_history_v1.py. Written and committed before any result was computed. Same design as
nfl/kalshi_props_backtest_v1.py.

Run from the repo root (GitHub Actions):  python3 nba/kalshi_props_backtest_v1.py
Inputs : nba/props_history/kalshi/*.csv, nba/nba_props_model_v1_tables.json (only for the reproducibility check),
         nba/NBA_PROPS_KALSHI_BACKTEST_V1_PREREG.md, ESPN player box scores (sportsdataverse, downloaded).
Outputs: nba/props_history/backtest_v1_results.json, backtest_v1_results.md, backtest_v1_main_rows.csv

Implementation choices the prereg does not spell out, fixed here before running:
- Tables for season S: load_box + player_games on ESPN seasons 2010..S-1, add_expectations, fit_ratio_tables(min_prev=5).
  The frozen tables are never used for scoring; the same refit on 2010..2026 is compared with them (reported only).
- Expectations: next_game_expectations on the box scores of seasons S-2..S with as_of = the game date (00:00), so only
  games on earlier dates count. It is computed only for players whose name matches a row that day (same result for
  them as computing everyone). Names come from each player's last game before the game date.
- "Last game <= 30 days": (game date - last played game date) in whole days <= 30, as the live code computes it.
- Each bootstrap uses its own numpy default_rng(20261018), resampling games (date_away_home) with replacement.
"""
import csv, glob, hashlib, json, os, re, sys, unicodedata, urllib.request
import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import nba_props_model_lib_v1 as L  # noqa: E402

DATA_GLOB = os.path.join(HERE, "props_history", "kalshi", "*.csv")
TABLES = os.path.join(HERE, "nba_props_model_v1_tables.json")
PREREG = os.path.join(HERE, "NBA_PROPS_KALSHI_BACKTEST_V1_PREREG.md")
OUT_JSON = os.path.join(HERE, "props_history", "backtest_v1_results.json")
OUT_MD = os.path.join(HERE, "props_history", "backtest_v1_results.md")
OUT_ROWS = os.path.join(HERE, "props_history", "backtest_v1_main_rows.csv")
CACHE = os.path.join(HERE, ".box_cache")
BOX_URL = "https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_nba_player_boxscores/player_box_{y}.csv"
FROZEN_SHA = "e56b2cd90cd7e188527eb34700a7a65c5644d387804bcbf8737ee7cb9c5d7d93"
FIRST_SEASON, FROZEN_LAST = 2010, 2026
GAME_TYPES = {"2", "3", "5"}
PICK_STATS = ["points", "rebounds", "assists", "threes", "pts_reb_ast", "pts_reb", "pts_ast", "reb_ast"]
OTHER_STATS = ["steals", "blocks", "stl_blk", "turnovers"]
MIN_PREV, MIN_PREV_PICK, STALE_DAYS = 5, 40, 30
MIN_OI, MAX_SPREAD, MAX_GAP, MIN_EV, FEE_RATE = 100.0, 0.10, 0.20, 0.05, 0.07
MIN_ROWS, MIN_GAMES, MIN_PICKS = 300, 30, 150
CLIP, DRAWS, SEED = (0.01, 0.99), 10000, 20261018


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def box_path(y):
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, f"player_box_{y}.csv")
    if not os.path.exists(p) or os.path.getsize(p) == 0:
        req = urllib.request.Request(BOX_URL.format(y=y), headers={"User-Agent": "nba-props-backtest/1.0"})
        with urllib.request.urlopen(req, timeout=300) as r, open(p, "wb") as f:
            f.write(r.read())
    return p


_box = {}


def box(y):
    if y not in _box:
        _box[y] = L.load_box(box_path(y))
    return _box[y]


def player_games(seasons):
    return L.player_games(pd.concat([box(s) for s in seasons], ignore_index=True))


def refit_tables(last_season):
    """The frozen v1 fit on ESPN seasons 2010..last_season."""
    return L.fit_ratio_tables(L.add_expectations(player_games(range(FIRST_SEASON, last_season + 1))), min_prev=5)


def tables_equal(a, b):
    if set(a) != set(b):
        return False
    for s in a:
        if not np.allclose(a[s]["edges"], b[s]["edges"], atol=1e-9) or a[s]["n"] != b[s]["n"]:
            return False
        if any(len(x) != len(y) or not np.allclose(x, y, atol=1e-4) for x, y in zip(a[s]["q"], b[s]["q"])):
            return False
    return True


def norm(s):      # the live test's name normalization
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z ]", "", s.replace("-", " ").replace(".", ""))
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", s)
    return re.sub(r"\s+", " ", s).strip()


def fnum(x):
    try:
        v = float(x)
        return v if v == v else None
    except (TypeError, ValueError):
        return None


def fee(p):
    return FEE_RATE * p * (1 - p)


def logloss(p, y):
    p = np.clip(p, *CLIP)
    return -(y * np.log(p) + (1 - y) * np.log(1 - p))


def _boot_weights(games):
    keys = sorted(set(games))
    idx = {k: i for i, k in enumerate(keys)}
    gi = np.array([idx[g] for g in games])
    k = len(keys)
    rng = np.random.default_rng(SEED)
    pick = rng.integers(0, k, size=(DRAWS, k))
    w = np.bincount((pick + np.arange(DRAWS)[:, None] * k).ravel(), minlength=DRAWS * k).reshape(DRAWS, k)
    return gi, k, w.astype(float)


def boot_ratio(games, num, den):
    """95% game-bootstrap interval for sum(num) / sum(den) over rows, resampling games."""
    gi, k, w = _boot_weights(games)
    sn, sd = (np.bincount(gi, weights=x, minlength=k) for x in (num, den))
    r = (w @ sn) / np.maximum(w @ sd, 1e-12)
    return [float(np.percentile(r, 2.5)), float(np.percentile(r, 97.5))]


def load_rows(funnel):
    rows = []
    for p in sorted(glob.glob(DATA_GLOB)):
        rows += list(csv.DictReader(open(p)))
    funnel["collected"] = len(rows)
    rows = [r for r in rows if r["result"] in ("yes", "no")]
    funnel["settled_yes_no"] = len(rows)
    rows = [r for r in rows if r["season_type"] in GAME_TYPES and r["stat"] in L.STATS]
    funnel["nba_game_types_modeled_stat"] = len(rows)
    best = {}
    for r in rows:
        r["game"] = f'{r["game_date"]}_{r["away_team"]}_{r["home_team"]}'
        k = (r["game"], norm(r["player"]), r["stat"], round(float(r["line"]), 1))
        oi = fnum(r["open_interest"])
        r["_oi"] = -1.0 if oi is None else oi
        if k not in best or (r["_oi"], best[k]["ticker"]) > (best[k]["_oi"], r["ticker"]):
            best[k] = r              # larger open interest wins; a tie keeps the alphabetically first ticker
    rows = list(best.values())
    funnel["after_dedup"] = len(rows)
    return rows


def score(rows, funnel, out):
    seasons = sorted({int(r["season"]) for r in rows})
    frozen = json.load(open(TABLES))["tables"]
    out["refit_2010_2026_reproduces_frozen_tables"] = tables_equal(refit_tables(FROZEN_LAST), frozen)
    tables = {s: refit_tables(s - 1) for s in seasons}
    out["tables_fit_seasons"] = {str(s): f"{FIRST_SEASON}-{s - 1}" for s in seasons}
    scored, unmatched = [], 0
    for s in seasons:
        pg = player_games([y for y in (s - 2, s - 1, s) if y >= FIRST_SEASON])
        srows = [r for r in rows if int(r["season"]) == s]
        for date in sorted({r["game_date"] for r in srows}):
            as_of = pd.Timestamp(date)
            hist = pg[pg["game_date"] < as_of]
            last_name = hist.groupby("player_id")["name"].last()
            by_name = {}
            for pid, nm in last_name.items():
                by_name.setdefault(norm(nm), []).append(pid)
            drows = [r for r in srows if r["game_date"] == date]
            need = {p for r in drows for p in by_name.get(norm(r["player"]), [])}
            exp = L.next_game_expectations(hist[hist["player_id"].isin(need)], as_of) if need else {}
            for r in drows:
                cands = [p for p in by_name.get(norm(r["player"]), []) if p in exp]
                if len(cands) > 1:
                    cands = [p for p in cands if exp[p]["team"] in (r["away_team"], r["home_team"])]
                pid = cands[0] if len(cands) == 1 else None
                unmatched += int(pid is None)
                e = exp.get(pid, {}) if pid else {}
                ev, n = e.get("exp_" + r["stat"]), int(e.get("n", 0) or 0)
                line = float(r["line"])
                mp = L.p_over(tables[s], r["stat"], ev, line) if (pid and n >= MIN_PREV) else None
                days = (as_of - e["last_game"]).days if e.get("last_game") is not None else None
                scored.append({"game": r["game"], "season": s, "stat": r["stat"], "player": r["player"], "pid": pid,
                               "line": line, "n": n, "days_since": days, "expected": None if ev is None else float(ev),
                               "model_p": mp, "bid": fnum(r["yes_bid"]), "ask": fnum(r["yes_ask"]),
                               "oi": fnum(r["open_interest"]), "y": 1 if r["result"] == "yes" else 0,
                               "ticker": r["ticker"]})
    funnel["player_unmatched"] = unmatched
    funnel["model_chance_exists"] = sum(1 for r in scored if r["model_p"] is not None)
    return seasons, scored


def in_set(r, stats, gap=True):
    return (r["model_p"] is not None and r["stat"] in stats and r["n"] >= MIN_PREV_PICK and
            r["days_since"] is not None and r["days_since"] <= STALE_DAYS and (r["oi"] or 0) >= MIN_OI and
            r["bid"] is not None and r["ask"] is not None and 0 < r["bid"] < r["ask"] < 1 and
            r["ask"] - r["bid"] <= MAX_SPREAD and (not gap or abs(r["model_p"] - (r["bid"] + r["ask"]) / 2) <= MAX_GAP))


def t1(rs):
    if not rs:
        return {"rows": 0, "games": 0}
    y = np.array([r["y"] for r in rs], float)
    lm = logloss(np.array([r["model_p"] for r in rs]), y)
    lk = logloss(np.array([(r["bid"] + r["ask"]) / 2 for r in rs]), y)
    res = {"rows": len(rs), "games": len({r["game"] for r in rs}), "yes_rate": round(float(y.mean()), 4),
           "model_logloss": round(float(lm.mean()), 5), "kalshi_logloss": round(float(lk.mean()), 5),
           "diff_model_minus_kalshi": round(float((lm - lk).mean()), 5)}
    if res["games"] >= 2:
        res["diff_95ci"] = [round(x, 5) for x in boot_ratio([r["game"] for r in rs], lm - lk, np.ones(len(rs)))]
    return res


def roi_block(bets):
    if not bets:
        return {"count": 0}
    games = [b["game"] for b in bets]
    cost = np.array([b["price"] + fee(b["price"]) for b in bets])
    won = np.array([b["won"] for b in bets], dtype=float)
    profit = won * (1 - cost) - (1 - won) * cost
    return {"count": len(bets), "games": len(set(games)), "win_rate": round(float(won.mean()), 4),
            "avg_cost": round(float(cost.mean()), 4), "avg_ev": round(float(np.mean([b["ev"] for b in bets])), 4),
            "profit_sum": round(float(profit.sum()), 3), "cost_sum": round(float(cost.sum()), 3),
            "roi": round(float(profit.sum() / cost.sum()), 4),
            "roi_95ci": [round(x, 4) for x in boot_ratio(games, profit, cost)] if len(set(games)) >= 2 else None}


def picks(rows):
    """The live rule: EV after fee >= 0.05, one line + side per player per stat per game (highest EV)."""
    best = {}
    for r in rows:
        no_ask = round(1 - r["bid"], 4)
        for side, ev, price in (("OVER", r["model_p"] - r["ask"] - fee(r["ask"]), r["ask"]),
                                ("UNDER", (1 - r["model_p"]) - no_ask - fee(no_ask), no_ask)):
            if ev >= MIN_EV:
                k = (r["game"], r["pid"], r["stat"])
                if k not in best or ev > best[k]["ev"]:
                    best[k] = {"game": r["game"], "season": r["season"], "stat": r["stat"], "side": side, "ev": ev,
                               "price": price, "won": (r["y"] == 1) if side == "OVER" else (r["y"] == 0)}
    return list(best.values())


def main():
    out = {"doc": "NBA_PROPS_KALSHI_BACKTEST_V1", "prereg_sha256": sha(PREREG), "script_sha256": sha(__file__),
           "data_files": {os.path.basename(p): sha(p) for p in sorted(glob.glob(DATA_GLOB))},
           "frozen_tables_sha256": sha(TABLES), "funnel": {}}
    assert out["frozen_tables_sha256"] == FROZEN_SHA, "frozen tables file changed"
    funnel = out["funnel"]
    rows = load_rows(funnel)
    cov = {}
    for r in rows:
        c = cov.setdefault(r["season"], {"games": set(), "markets": 0, "with_price": 0, "first": r["game_date"],
                                         "last": r["game_date"], "by_type": {}})
        c["games"].add(r["game"]); c["markets"] += 1; c["with_price"] += int(r["yes_ask"] not in ("", None))
        c["first"], c["last"] = min(c["first"], r["game_date"]), max(c["last"], r["game_date"])
        c["by_type"][r["season_type"]] = c["by_type"].get(r["season_type"], 0) + 1
    out["coverage"] = {s: dict(c, games=len(c["games"])) for s, c in sorted(cov.items())}
    out["coverage_total_games"] = len({r["game"] for r in rows})
    seasons, scored = score(rows, funnel, out)
    out["seasons"] = seasons

    main_rows = [r for r in scored if in_set(r, PICK_STATS)]
    funnel["main_set"] = len(main_rows)
    test1 = t1(main_rows)
    small = test1["rows"] < MIN_ROWS or test1["games"] < MIN_GAMES
    if small:
        test1["verdict"] = "INCONCLUSIVE"
    elif test1["diff_95ci"][1] < 0:
        test1["verdict"] = "MODEL MORE RIGHT"
    elif test1["diff_95ci"][0] > 0:
        test1["verdict"] = "KALSHI MORE RIGHT"
    else:
        test1["verdict"] = "TOO CLOSE TO CALL"
    test1["by_season"] = {str(s): t1([r for r in main_rows if r["season"] == s]) for s in seasons}
    test1["by_stat"] = {st: t1([r for r in main_rows if r["stat"] == st]) for st in PICK_STATS}
    out["test1"] = test1
    out["info_only"] = {"test1_no_gap_filter": t1([r for r in scored if in_set(r, PICK_STATS, gap=False)]),
                        "test1_other_stats": t1([r for r in scored if in_set(r, OTHER_STATS)])}

    bets = picks(main_rows)
    test2 = {"all": roi_block(bets)}
    ci = test2["all"].get("roi_95ci")
    if small or test2["all"]["count"] < MIN_PICKS:
        test2["verdict"] = "INCONCLUSIVE"
    else:
        test2["verdict"] = "PROFITABLE" if ci and ci[0] > 0 else "NOT SHOWN PROFITABLE"
    test2["by_side"] = {sd: roi_block([b for b in bets if b["side"] == sd]) for sd in ("OVER", "UNDER")}
    test2["by_stat"] = {st: roi_block([b for b in bets if b["stat"] == st]) for st in PICK_STATS}
    test2["by_season"] = {str(s): roi_block([b for b in bets if b["season"] == s]) for s in seasons}
    out["test2"] = test2
    out["info_only"]["live_pass_bar_met"] = bool(ci and ci[0] > 0 and test1.get("diff_model_minus_kalshi", 1) < 0)

    os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
    json.dump(out, open(OUT_JSON, "w"), indent=1, default=str)
    cols = ["game", "season", "stat", "player", "pid", "line", "n", "days_since", "expected", "model_p", "bid", "ask",
            "oi", "y", "ticker"]
    with open(OUT_ROWS, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in main_rows:
            w.writerow({k: r[k] for k in cols})

    def j(x):
        return json.dumps(x)
    md = ["# NBA_PROPS_KALSHI_BACKTEST_V1 results", "",
          f"Prereg sha256 `{out['prereg_sha256']}` · seasons {seasons} (tables fit on {out['tables_fit_seasons']}) · "
          f"refit on 2010-2026 reproduces the frozen tables: {out['refit_2010_2026_reproduces_frozen_tables']}", "",
          f"Kalshi NBA prop history found: {out['coverage_total_games']} games. Coverage by season: "
          f"{j(out['coverage'])}", "",
          f"Funnel: {j(funnel)}", "",
          f"## Test 1 (primary): {test1['verdict']}",
          f"Main set {test1['rows']} rows / {test1['games']} games. Model log loss {test1.get('model_logloss')}, "
          f"Kalshi mid {test1.get('kalshi_logloss')}, difference {test1.get('diff_model_minus_kalshi')} "
          f"(95% CI {test1.get('diff_95ci')}). Negative = model more right.", "",
          "By season: " + j(test1["by_season"]), "", "By stat: " + j(test1["by_stat"]), "",
          f"## Test 2: {test2['verdict']}",
          f"All picks: {j(test2['all'])}", "", f"By side: {j(test2['by_side'])}", "",
          f"By stat: {j(test2['by_stat'])}", "", f"By season: {j(test2['by_season'])}", "",
          "## Information only", j(out["info_only"]), "",
          "No injury filter (no historical injury reports). This is a back-test on past prices; it cannot replace the "
          "live paper test."]
    open(OUT_MD, "w").write("\n".join(md) + "\n")
    print("\n".join(md))


if __name__ == "__main__":
    main()
