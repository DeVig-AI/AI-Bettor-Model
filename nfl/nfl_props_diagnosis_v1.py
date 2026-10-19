#!/usr/bin/env python3
"""
nfl_props_diagnosis_v1.py -- runs NFL_PROPS_DIAGNOSIS_V1 (nfl/NFL_PROPS_DIAGNOSIS_V1_PLAN.md): where is the frozen
NFL props model v1 wrong compared with Kalshi's price? Lead-finding only; nothing is built or bet. The plan was
committed before this script computed any slice result.

Run from the repo root (GitHub Actions):  python3 nfl/nfl_props_diagnosis_v1.py
Inputs : the v1 back-test inputs (props history, frozen tables, nflverse play-by-play + rosters, downloaded),
         nfl/props_history/v2_study_rows.csv (reproduction check) and
         nfl/props_history/kalshi_game_lines_history_v1.csv (nfl/kalshi_game_lines_history_v1.py).
Outputs: nfl/props_history/diagnosis_v1_rows.csv, diagnosis_v1_results.json, diagnosis_v1_results.md

Implementation choices the plan does not spell out, fixed here before running:
- Rows are scored as kalshi_props_v2_study.score_rows() does (same helpers), also keeping player id, team and the
  model's expected value. The player's team is the Kalshi ticker's team code (as in the back-test); if that cannot be
  read, the team of his latest earlier game in play-by-play if it is one of the two teams; else n/a.
- Kalshi game-market mid = (bid + ask) / 2 when 0 < bid < ask < 1, else the last trade price if 0 < price < 1, else
  unused. A ladder's 50% point = linear interpolation between the two neighbouring lines whose mids straddle 0.5
  (ladders sorted by line; the first straddle from the low end). No straddle: n/a.
- Quantile bins use pandas.qcut(..., duplicates="drop") on all main-set rows with a value.
- Bootstrap weights: one draw matrix per half (and one for all games), seed 20261021, so every bin in a half is
  judged on the same resamples. Placebo: 200 runs, numpy default_rng(20261022); each run shuffles every real family's
  bin labels across rows (keeping sizes) and applies the same checks.
"""
import csv, hashlib, json, os, sys
from statistics import NormalDist
import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import nfl_props_model_lib_v1 as L  # noqa: E402
import kalshi_props_backtest_v1 as B  # noqa: E402  (helpers only; its main() is not run)

PLAN = os.path.join(HERE, "NFL_PROPS_DIAGNOSIS_V1_PLAN.md")
V2_ROWS = os.path.join(HERE, "props_history", "v2_study_rows.csv")
LINES = os.path.join(HERE, "props_history", "kalshi_game_lines_history_v1.csv")
OUT_ROWS = os.path.join(HERE, "props_history", "diagnosis_v1_rows.csv")
OUT_JSON = os.path.join(HERE, "props_history", "diagnosis_v1_results.json")
OUT_MD = os.path.join(HERE, "props_history", "diagnosis_v1_results.md")
SPLIT_SEED, BOOT_SEED, PLACEBO_SEED = 20261020, 20261021, 20261022
DRAWS, PLACEBO_RUNS, MIN_HALF_ROWS, A_SIZE = 4000, 200, 300, 0.05
SEASON = 2026
QB = ["passing_yards", "passing_tds", "passing_attempts", "passing_completions", "interceptions"]
REC = ["receiving_yards", "receptions"]
RUSH = ["rushing_yards", "rushing_attempts"]
NA = "n/a"


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


# ---------------------------------------------------------------- scoring (as the v2 study, keeping more fields)
def score_rows():
    rows = [r for r in csv.DictReader(open(B.DATA)) if r["result"] in ("yes", "no") and r["stat"] in L.STATS]
    assert sha(B.TABLES) == B.FROZEN_SHA, "frozen tables file changed"
    tables = json.load(open(B.TABLES))["tables"]
    rows = [r for r in rows if int(r["season"]) == SEASON]
    rmap = B.roster_map(SEASON)
    pg = B.player_games(range(SEASON - 3, SEASON + 1))
    scored = []
    for date in sorted({r["game_date"] for r in rows}):
        exp = L.next_game_expectations(pg, pd.Timestamp(date))
        for r in (x for x in rows if x["game_date"] == date):
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
                           "y": 1 if r["result"] == "yes" else 0, "pid": pid, "team": team, "ev": ev,
                           "away": r["away_team"], "home": r["home_team"]})
    main = [r for r in scored if r["model_p"] is not None and r["n"] >= B.MIN_PREV_PICK and r["stat"] in B.PICK_STATS
            and r["bid"] is not None and r["ask"] is not None and 0 < r["bid"] < r["ask"] < 1
            and r["ask"] - r["bid"] <= B.MAX_SPREAD and (r["oi"] or 0) >= B.MIN_OI]
    return pd.DataFrame(main), pg


def check_reproduces(df):
    ref = pd.read_csv(V2_ROWS)
    a = df[["game", "stat", "player", "line", "model_p", "y"]].sort_values(["game", "stat", "player", "line"]).reset_index(drop=True)
    b = ref[["game", "stat", "player", "line", "model_p", "y"]].sort_values(["game", "stat", "player", "line"]).reset_index(drop=True)
    ok = len(a) == len(b) and (a[["game", "stat", "player"]].values == b[["game", "stat", "player"]].values).all() \
        and np.allclose(a["line"], b["line"]) and np.allclose(a["model_p"], b["model_p"], atol=1e-9) and (a["y"] == b["y"]).all()
    return bool(ok), len(a), len(b)


# ---------------------------------------------------------------- extra pre-game columns
def add_team_fallback(df, pg):
    last = pg.sort_values("game_date")
    for i in df.index[df["team"].isna()]:
        pid, d = df.at[i, "pid"], pd.Timestamp(df.at[i, "date"])
        h = last[(last["player_id"] == pid) & (last["game_date"] < d)]
        t = h["posteam"].iloc[-1] if len(h) else None
        df.at[i, "team"] = t if t in (df.at[i, "away"], df.at[i, "home"]) else None
    df["home_away"] = np.where(df["team"].isna(), NA, np.where(df["team"] == df["home"], "home", "away"))
    df["opp"] = np.where(df["team"] == df["home"], df["away"], np.where(df["team"] == df["away"], df["home"], None))
    return df


def team_volume(seasons):
    """Per (game_id, posteam): team targets and team carries, from play-by-play."""
    out = []
    for s in seasons:
        p = B.pbp(s)
        tg = p[p["receiver_player_id"].notna() & (p["pass_attempt"].fillna(0) == 1) & (p["sack"].fillna(0) == 0)]
        ca = p[p["rusher_player_id"].notna() & (p["rush_attempt"].fillna(0) == 1)]
        t = tg.groupby(["game_id", "posteam"]).size().rename("team_targets")
        c = ca.groupby(["game_id", "posteam"]).size().rename("team_carries")
        out.append(pd.concat([t, c], axis=1).fillna(0).reset_index())
    return pd.concat(out, ignore_index=True)


def add_usage(df, pg):
    """Last-3 vs the 16 earlier games in the role (plan slice 6)."""
    vol = team_volume(range(SEASON - 3, SEASON + 1))
    g = pg.merge(vol, on=["game_id", "posteam"], how="left")
    ratio = []
    cache = {}
    for r in df.itertuples():
        st = r.stat
        grp = "qb" if st in QB else ("rec" if st in REC else "rush")
        role = {"qb": "role_pass", "rec": "role_rec", "rush": "role_rush"}[grp]
        if st == "rush_rec_yards":
            role = "role_skill"
        key = (r.pid, role)
        if key not in cache:
            cache[key] = g[(g["player_id"] == r.pid) & (g[role] == 1)].sort_values("game_date")
        h = cache[key]
        h = h[h["game_date"] < pd.Timestamp(r.date)]
        if len(h) < 6:
            ratio.append(np.nan); continue
        last3, base = h.iloc[-3:], h.iloc[-19:-3]
        if grp == "qb":
            num = last3["passing_attempts"].mean(); den = base["passing_attempts"].mean()
            ratio.append(num / den if den > 0 else np.nan); continue
        if st == "rush_rec_yards":
            pn, tn = (lambda x: x["rushing_attempts"].sum() + x["targets"].sum()), \
                     (lambda x: x["team_carries"].sum() + x["team_targets"].sum())
        elif grp == "rec":
            pn, tn = (lambda x: x["targets"].sum()), (lambda x: x["team_targets"].sum())
        else:
            pn, tn = (lambda x: x["rushing_attempts"].sum()), (lambda x: x["team_carries"].sum())
        s3 = pn(last3) / tn(last3) if tn(last3) > 0 else np.nan
        sb = pn(base) / tn(base) if tn(base) > 0 else np.nan
        ratio.append(s3 / sb if sb and sb > 0 else np.nan)
    df["usage_ratio"] = ratio
    df["usage_group"] = np.where(df["stat"].isin(QB), "qb", np.where(df["stat"].isin(REC), "rec", "rush_skill"))
    return df


def add_defense(df, pg):
    """Opponent's 2026 season-to-date amount of the stat allowed per game, games before the date (plan slice 10)."""
    cur = pg[pg["season"] == SEASON]
    stats = B.PICK_STATS
    d = cur.groupby(["game_id", "game_date", "defteam"])[stats].sum().reset_index()
    vals = []
    for r in df.itertuples():
        h = d[(d["defteam"] == r.opp) & (d["game_date"] < pd.Timestamp(r.date))]
        vals.append(h[r.stat].mean() if len(h) and r.opp is not None else np.nan)
    df["opp_allowed"] = vals
    return df


def mid_of(row):
    b, a, p = B.fnum(row["yes_bid"]), B.fnum(row["yes_ask"]), B.fnum(row["last_price"])
    if b is not None and a is not None and 0 < b < a < 1:
        return (b + a) / 2
    return p if p is not None and 0 < p < 1 else None


def cross_half(points):
    """x where p (P(value > x)) crosses 0.5, by linear interpolation; points = [(x, p)]."""
    pts = sorted((x, p) for x, p in points if p is not None)
    for (x0, p0), (x1, p1) in zip(pts, pts[1:]):
        if (p0 - 0.5) * (p1 - 0.5) <= 0 and p0 != p1:
            return x0 + (p0 - 0.5) * (x1 - x0) / (p0 - p1)
    return None


def game_lines():
    """{game key: {"total": t, "home_margin": m, "margin_source": ...}} from Kalshi's pre-game game markets."""
    if not os.path.exists(LINES):
        return {}, {"file": "missing"}
    rows = list(csv.DictReader(open(LINES)))
    games = {}
    for r in rows:
        games.setdefault(f'{r["game_date"]}_{r["away_team"]}_{r["home_team"]}', []).append(r)
    out, info = {}, {"games": len(games), "total": 0, "margin_ladder": 0, "margin_moneyline": 0}
    for k, rs in games.items():
        home = rs[0]["home_team"]
        tot = cross_half([(float(r["line"]), mid_of(r)) for r in rs if r["kind"] == "total" and r["line"]])
        pts = []
        for r in rs:
            if r["kind"] != "spread" or not r["line"] or not r["team"]:
                continue
            m, x = mid_of(r), float(r["line"])
            if m is None:
                continue
            pts.append((x, m) if r["team"] == home else (-x, 1 - m))   # P(home margin > -x) = 1 - P(away margin > x)
        margin, src = cross_half(pts), "ladder"
        if margin is None:
            ml = {r["team"]: mid_of(r) for r in rs if r["kind"] == "moneyline" and r["team"]}
            ph = ml.get(home)
            if ph is None and ml:
                other = next(iter(v for t, v in ml.items() if t != home), None)
                ph = 1 - other if other is not None else None
            margin = 13.5 * NormalDist().inv_cdf(ph) if ph is not None and 0 < ph < 1 else None
            src = "moneyline" if margin is not None else None
        out[k] = {"total": tot, "home_margin": margin, "margin_source": src}
        info["total"] += tot is not None
        info["margin_ladder"] += src == "ladder"
        info["margin_moneyline"] += src == "moneyline"
    return out, info


def add_game_lines(df):
    gl, info = game_lines()
    tot, mar = [], []
    for r in df.itertuples():
        g = gl.get(r.game, {})
        tot.append(g.get("total"))
        hm = g.get("home_margin")
        mar.append(np.nan if hm is None or r.home_away == NA else (hm if r.home_away == "home" else -hm))
    df["game_total"] = pd.to_numeric(pd.Series(tot, index=df.index), errors="coerce")
    df["team_margin"] = mar
    df["team_implied"] = (df["game_total"] + df["team_margin"]) / 2
    return df, info


# ---------------------------------------------------------------- slices
def qbins(s, q, by=None):
    lab = pd.Series(NA, index=s.index, dtype=object)
    groups = [(None, s.index)] if by is None else list(s.groupby(by).groups.items())
    for _, idx in groups:
        v = s.loc[idx].dropna()
        if len(v) < q:
            continue
        c = pd.qcut(v, q, labels=False, duplicates="drop")
        lab.loc[c.index] = ("Q" + (c.astype(int) + 1).astype(str)) if q == 5 else c.map(lambda i: ["low", "mid", "high"][int(i)] if c.max() == 2 else f"T{int(i) + 1}")
    return lab


def make_slices(df):
    mid = (df["bid"] + df["ask"]) / 2
    gap = df["model_p"] - mid
    S = {}
    S["stat"] = df["stat"].astype(object)
    S["lean_side"] = pd.Series(np.where(gap > 0, "over_lean", np.where(gap < 0, "under_lean", NA)), index=df.index, dtype=object)
    S["line_minus_ev"] = qbins(df["line"] - df["ev"], 5, by=df["stat"])
    ag = gap.abs()
    S["abs_gap"] = pd.Series(pd.cut(ag, [0, 0.05, 0.10, 0.15, 0.20, 1.0], right=False,
                                    labels=["0-5", "5-10", "10-15", "15-20", "20+"]).astype(object), index=df.index).fillna(NA)
    S["prior_games"] = pd.Series(np.where(df["n"] <= 40, "21-40", np.where(df["n"] <= 80, "41-80", "81+")), index=df.index, dtype=object)
    S["usage_change"] = qbins(df["usage_ratio"], 3, by=df["usage_group"])
    S["game_total"] = qbins(df["game_total"], 3)
    S["team_spread"] = qbins(df["team_margin"], 3)
    S["team_implied_pts"] = qbins(df["team_implied"], 3)
    S["opp_defense"] = qbins(df["opp_allowed"], 3, by=df["stat"])
    S["home_away"] = df["home_away"].astype(object)
    return S


A_FAMILIES = {"stat", "line_minus_ev", "prior_games", "usage_change", "game_total", "team_spread",
              "team_implied_pts", "opp_defense", "home_away"}
BIN_NOTE = {"line_minus_ev": "Q1 = line furthest below model expected value", "usage_change": "low = usage falling",
            "team_spread": "low = player's team the bigger underdog", "opp_defense": "low = opponent allows least",
            "game_total": "low = lowest totals", "team_implied_pts": "low = fewest implied points"}


# ---------------------------------------------------------------- statistics
class Boot:
    """Game-bootstrap weights for the rows of one frame: a per-draw mean is (W @ per-game sums) / (W @ counts)."""
    def __init__(self, frame, seed):
        self.frame = frame
        games = frame["game"].tolist()
        keys = sorted(set(games))
        ix = {k: i for i, k in enumerate(keys)}
        self.gi, self.k = np.array([ix[g] for g in games]), len(keys)
        rng = np.random.default_rng(seed)
        pick = rng.integers(0, self.k, size=(DRAWS, self.k))
        self.W = np.apply_along_axis(np.bincount, 1, pick, minlength=self.k).astype(float)

    def sums(self, v):
        return np.bincount(self.gi, weights=v, minlength=self.k)

    def mean(self, mask, v):
        """Per-draw mean of v over the rows where mask is true (draws with no such rows dropped)."""
        m = np.asarray(mask, float)
        num, den = self.W @ self.sums(np.where(m > 0, v, 0.0)), self.W @ self.sums(m)
        return num[den > 0] / den[den > 0]


def ci(d):
    return [round(float(np.percentile(d, 2.5)), 5), round(float(np.percentile(d, 97.5)), 5)]


def basic(d, boot=None, mask=None):
    if not len(d):
        return {"rows": 0}
    res = {"rows": int(len(d)), "games": int(d["game"].nunique()),
           "model_logloss": round(float(d["llm"].mean()), 5), "kalshi_logloss": round(float(d["llk"].mean()), 5),
           "diff_model_minus_kalshi": round(float((d["llm"] - d["llk"]).mean()), 5),
           "avg_model_pct": round(float(d["model_p"].mean()) * 100, 2), "hit_rate_pct": round(float(d["y"].mean()) * 100, 2),
           "avg_kalshi_mid_pct": round(float(d["mid"].mean()) * 100, 2)}
    if boot is not None:
        res["diff_95ci"] = ci(boot.mean(mask, (boot.frame["llm"] - boot.frame["llk"]).to_numpy()))
    return res


def checks(h, lab, boot, do_a):
    """A and B statistics for every bin of one family in one half h (lab aligned with h's rows)."""
    gerr = (h["model_p"] - h["y"]).to_numpy()
    g_all = boot.mean(np.ones(len(h)), gerr)
    lean = np.sign(h["model_p"] - h["mid"]).to_numpy()
    edge = lean * (h["y"] - h["mid"]).to_numpy()
    lab = np.asarray(lab, dtype=object)
    out = {}
    for b in sorted(set(lab) - {NA}, key=str):
        m = lab == b
        r = {"rows": int(m.sum())}
        if do_a:
            num, den = boot.W @ boot.sums(np.where(m, gerr, 0.0)), boot.W @ boot.sums(m.astype(float))
            ok = den > 0
            r["A_D"] = round(float(gerr[m].mean() - gerr.mean()), 5)
            r["A_ci"] = ci(num[ok] / den[ok] - g_all[ok])
        mt = m & (lean != 0)
        r["B_E"] = round(float(edge[mt].mean()), 5) if mt.any() else None
        r["B_ci"] = ci(boot.mean(mt, edge)) if mt.any() else None
        out[b] = r
    return out


def lead_calls(disc, conf, do_a):
    calls = {}
    for b in disc:
        d, c = disc[b], conf.get(b, {"rows": 0})
        eligible = d["rows"] >= MIN_HALF_ROWS and c["rows"] >= MIN_HALF_ROWS
        a = b_ = False
        if eligible and do_a:
            lo, hi = d["A_ci"]
            a_disc = abs(d["A_D"]) >= A_SIZE and (lo > 0 or hi < 0)
            clo, chi = c["A_ci"]
            a = a_disc and ((d["A_D"] > 0 and clo > 0) or (d["A_D"] < 0 and chi < 0))
        if eligible and d.get("B_ci") and c.get("B_ci"):
            b_ = d["B_ci"][0] > 0 and c["B_ci"][0] > 0
        calls[b] = {"eligible": eligible, "A_lead": bool(a), "B_lead": bool(b_)}
    return calls


def main():
    out = {"doc": "NFL_PROPS_DIAGNOSIS_V1", "plan_sha256": sha(PLAN), "script_sha256": sha(__file__),
           "data_sha256": sha(B.DATA), "tables_sha256": sha(B.TABLES)}
    df, pg = score_rows()
    ok, n_a, n_b = check_reproduces(df)
    out["reproduces_v2_study_rows"] = {"ok": ok, "rows_here": n_a, "rows_v2_file": n_b}
    if not ok:
        json.dump(out, open(OUT_JSON, "w"), indent=1)
        sys.exit("scored rows do not reproduce v2_study_rows.csv -- stopping before any slice result")
    df = add_team_fallback(df, pg)
    df = add_usage(df, pg)
    df = add_defense(df, pg)
    df, out["game_lines"] = add_game_lines(df)
    df["mid"] = (df["bid"] + df["ask"]) / 2
    df["llm"] = B.logloss(df["model_p"].to_numpy(), df["y"].to_numpy())
    df["llk"] = B.logloss(df["mid"].to_numpy(), df["y"].to_numpy())

    games = sorted(df["game"].unique())
    order = np.random.default_rng(SPLIT_SEED).permutation(len(games))
    disc_games = {games[i] for i in order[:len(games) // 2]}
    df["half"] = np.where(df["game"].isin(disc_games), "discovery", "confirmation")
    S = make_slices(df)
    for k, v in S.items():
        df["slice_" + k] = v
    df.drop(columns=["llm", "llk"]).to_csv(OUT_ROWS, index=False)

    boots = {"all": Boot(df, BOOT_SEED)}
    halves = {h: df[df["half"] == h] for h in ("discovery", "confirmation")}
    for h, d in halves.items():
        boots[h] = Boot(d, BOOT_SEED)
    out["overall"] = {"all": basic(df, boots["all"], np.ones(len(df))),
                      **{h: basic(d, boots[h], np.ones(len(d))) for h, d in halves.items()}}
    out["missing_values"] = {k: int((v == NA).sum()) for k, v in S.items()}

    fams, n_eligible, hits = {}, 0, []
    for fam, lab in S.items():
        do_a = fam in A_FAMILIES
        ck = {h: checks(halves[h], lab.loc[halves[h].index], boots[h], do_a) for h in halves}
        calls = lead_calls(ck["discovery"], ck["confirmation"], do_a)
        bins = {}
        for b in sorted(set(lab), key=str):
            d = df[lab == b]
            bins[b] = {"all": basic(d, boots["all"], (lab == b).to_numpy()),
                       **{h: basic(halves[h][lab.loc[halves[h].index] == b]) for h in halves}}
            if b != NA:
                bins[b]["checks"] = {h: ck[h].get(b) for h in halves}
                bins[b]["call"] = calls.get(b)
                n_eligible += calls[b]["eligible"]
                for kind in ("A_lead", "B_lead"):
                    if calls[b][kind]:
                        hits.append({"slice": fam, "bin": b, "kind": kind[0]})
        fams[fam] = {"A_applies": do_a, "bins": bins}
    out["slices"] = fams
    out["eligible_bins"] = n_eligible
    out["leads"] = hits

    # chance: analytic, and placebo (shuffled labels, same sizes)
    n_a_elig = sum(1 for f in fams.values() if f["A_applies"] for b, v in f["bins"].items() if b != NA and v["call"]["eligible"])
    out["chance_analytic"] = {"per_check_rate": 0.00125, "A_checks": n_a_elig, "B_checks": n_eligible,
                              "expected_hits": round(0.00125 * (n_a_elig + n_eligible), 3)}
    rng = np.random.default_rng(PLACEBO_SEED)
    counts = []
    for _ in range(PLACEBO_RUNS):
        c = 0
        for fam, lab in S.items():
            sh = pd.Series(rng.permutation(lab.to_numpy()), index=lab.index)
            ck = {h: checks(halves[h], sh.loc[halves[h].index], boots[h], fam in A_FAMILIES) for h in halves}
            calls = lead_calls(ck["discovery"], ck["confirmation"], fam in A_FAMILIES)
            c += sum(v["A_lead"] + v["B_lead"] for v in calls.values())
        counts.append(c)
    out["chance_placebo"] = {"runs": PLACEBO_RUNS, "avg_hits_per_run": round(float(np.mean(counts)), 3),
                             "share_of_runs_with_any_hit": round(float(np.mean(np.array(counts) > 0)), 3),
                             "max_hits_in_a_run": int(max(counts))}
    out["verdict"] = "LEADS FOUND" if hits else "NO LEADS FOUND"
    json.dump(out, open(OUT_JSON, "w"), indent=1, default=str)
    write_md(out)


def pct(x):
    return "—" if x is None else f"{x:.1f}"


def write_md(o):
    ov = o["overall"]["all"]
    md = ["# NFL_PROPS_DIAGNOSIS_V1 results", "",
          f"Plan sha256 `{o['plan_sha256']}` · rows reproduce the v2 study: {o['reproduces_v2_study_rows']['ok']} "
          f"({o['reproduces_v2_study_rows']['rows_here']} rows)", "",
          f"## Verdict: {o['verdict']}", ""]
    if o["leads"]:
        for h in o["leads"]:
            md.append(f"- **{h['slice']} = {h['bin']}** ({'A: model error differs' if h['kind'] == 'A' else 'B: model beats Kalshi'})")
    else:
        md.append("No slice bin met the lead criterion in both halves. The model is uniformly less informed than "
                  "Kalshi: its errors are not concentrated in any place these slices can see, so new inputs of these "
                  "kinds (usage trend, game script, opponent defense, home/away, line placement) are unlikely to save it.")
    md += ["", f"Eligible bins: {o['eligible_bins']} · chance hits expected: analytic {o['chance_analytic']['expected_hits']}, "
           f"placebo {o['chance_placebo']['avg_hits_per_run']} per run (any hit in {o['chance_placebo']['share_of_runs_with_any_hit'] * 100:.0f}% of runs, "
           f"max {o['chance_placebo']['max_hits_in_a_run']}) · real hits {len(o['leads'])}", "",
           f"Overall: {ov['rows']} rows / {ov['games']} games · model log loss {ov['model_logloss']} vs Kalshi "
           f"{ov['kalshi_logloss']} (diff {ov['diff_model_minus_kalshi']}, 95% CI {ov.get('diff_95ci')}) · avg model "
           f"{ov['avg_model_pct']}% / hit {ov['hit_rate_pct']}% / Kalshi {ov['avg_kalshi_mid_pct']}%", "",
           f"Game lines read: {json.dumps(o['game_lines'])} · missing (n/a) rows per slice: {json.dumps(o['missing_values'])}", "",
           "Columns: rows · games · log loss model / Kalshi · diff (95% game CI) · avg model % / hit % / Kalshi % · "
           "A: D = calibration gap in bin − overall, discovery [CI] | confirmation [CI] · B: realized edge vs mid, "
           "discovery [CI] | confirmation [CI] · lead", ""]
    for fam, f in o["slices"].items():
        md += [f"### {fam}" + (f" ({BIN_NOTE[fam]})" if fam in BIN_NOTE else "") + ("" if f["A_applies"] else " — A not applied (cut on the model−Kalshi gap)"), "",
               "| bin | rows | games | LL model | LL Kalshi | diff (95% CI) | model % | hit % | Kalshi % | A disc | A conf | B disc | B conf | lead |",
               "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
        for b, v in f["bins"].items():
            a = v["all"]
            if not a.get("rows"):
                continue
            ck, call = v.get("checks") or {}, v.get("call") or {}

            def cell(h, k):
                c = ck.get(h) or {}
                if c.get(k + "_ci") is None or (k == "A" and "A_D" not in c):
                    return "—"
                val = c["A_D"] if k == "A" else c["B_E"]
                return f"{val * 100:+.1f} [{c[k + '_ci'][0] * 100:+.1f}, {c[k + '_ci'][1] * 100:+.1f}] n={c['rows']}"
            lead = "—" if b == NA else ("A+B" if call.get("A_lead") and call.get("B_lead") else "A" if call.get("A_lead")
                                        else "B" if call.get("B_lead") else ("no" if call.get("eligible") else "too few"))
            md.append(f"| {b} | {a['rows']} | {a['games']} | {a['model_logloss']} | {a['kalshi_logloss']} | "
                      f"{a['diff_model_minus_kalshi']} {a.get('diff_95ci', '')} | {pct(a['avg_model_pct'])} | {pct(a['hit_rate_pct'])} | "
                      f"{pct(a['avg_kalshi_mid_pct'])} | {cell('discovery', 'A')} | {cell('confirmation', 'A')} | "
                      f"{cell('discovery', 'B')} | {cell('confirmation', 'B')} | {lead} |")
        md.append("")
    md.append("Back-test on past prices (2026 weeks 1–6). Lead-finding only: nothing here is a new model or a pick.")
    open(OUT_MD, "w").write("\n".join(md) + "\n")
    print("\n".join(md[:20]))


if __name__ == "__main__":
    main()
