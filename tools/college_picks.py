#!/usr/bin/env python3
"""
college_picks.py -- DeVig's locked college picks (CHAMPION_CHALLENGER_V3_PREREG.md): men's college basketball from
DeVig CBB v1 ("devigcbb") and college football from DeVig CFB v1 ("devigcfb"), written as the app's boards
cbb/lineboard_export.json and cfb/lineboard_export.json, the same shape as the NFL / NBA / MLB boards.
Paper picks only: nothing here is bet. Not a claimed edge over Kalshi.

Each run (hourly in models_compare.yml, after tools/champion_review.py):
  1. every CBB.ml / CFB.ml champion lock in live/champions/MODEL_LOCKS.csv (the model's number at the first hourly run
     at or after 6 hours before the start) that is not on the board yet becomes a decision, at the sport's tiers:
     confidence c = max(p, 1 - p); c >= top-25% cutoff -> pick, tier "top25"; c >= top-50% cutoff -> pick, "top50";
     below -> PASS (the lean is kept). Kalshi's moneyline and main spread from live/models/latest.json at that run are
     the pick's locked price (picks.jsonl's last pre-start price when the run that locked it was missed);
  2. a decision is never changed after it is written, except its outcome: finals from live/models/results.jsonl;
  3. the boards are rewritten (compact JSON).

Tiers (fixed, never re-fit): CBB from the 17,242 graded 2024-2026 games in CBB v1's one-time check (V3 lists them);
CFB from DeVig CFB v1's 2021-2024 test games, computed once in Actions (`cfb-tiers`, needs the Lab's CFB data cache)
into cfb/cfb_v1_tiers.json and never rewritten. Until that file exists no CFB decision is written.

Usage:  python3 tools/college_picks.py [--now ISO] [--dry-run]
        python3 tools/college_picks.py cfb-tiers        (once, in Actions with the cache)
        python3 tools/college_picks.py cbb-tiers DIR    (re-derive CBB's numbers from cbb_model_live.py's season files)
"""
import argparse
import csv
import json
import os
import sys
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "tools"))
LOCKS = os.path.join(ROOT, "live", "champions", "MODEL_LOCKS.csv")
LATEST = os.path.join(ROOT, "live", "models", "latest.json")
PICKS = os.path.join(ROOT, "live", "models", "picks.jsonl")
RESULTS = os.path.join(ROOT, "live", "models", "results.jsonl")
CFB_TIERS = os.path.join(ROOT, "cfb", "cfb_v1_tiers.json")
RULE = "CHAMPION_CHALLENGER_V3_PREREG.md"
START = "2026-11-04T06:00:00Z"            # V3 written: no lock from before it becomes a pick (no back-fill)

# CBB v1 on its 2024-2026 check (17,242 games): median and 75th percentile of max(p, 1 - p), and the share picked right
CBB_TIERS = {"games": 17242, "top50": 0.7259, "top25": 0.8489, "acc_top50": 0.8444, "acc_top25": 0.9246,
             "acc_rest": 0.5995, "source": "cbb/CBB_MODEL_V1_PREREG.md check, seasons 2024-2026"}

SPORTS = {
    "CBB": {"slot": "CBB.ml", "model": "devigcbb", "dir": "cbb", "version": "cbb-v1",
            "note": "DeVig CBB v1, locked 6 hours before the start: one margin rating per team from Division I "
                    "scores, plus home court. Odds from Kalshi. Not proven against Kalshi."},
    "CFB": {"slot": "CFB.ml", "model": "devigcfb", "dir": "cfb", "version": "cfb-v1",
            "note": "DeVig CFB v1, locked 6 hours before the start: a margin rating, opponent-adjusted offense and "
                    "defense per play, and returning players, plus home field. Odds from Kalshi. Behind Kalshi so "
                    "far this season; not proven."},
}


def iso(t):
    return t.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_t(s):
    return datetime.fromisoformat(str(s).replace("Z", "+00:00")) if s else None


def read_jsonl(path):
    if not os.path.exists(path):
        return []
    with open(path) as f:
        return [json.loads(l) for l in f if l.strip()]


def read_csv(path):
    if not os.path.exists(path):
        return []
    with open(path, newline="") as f:
        return list(csv.DictReader(f))


def tiers_for(sport):
    if sport == "CBB":
        return CBB_TIERS
    if os.path.exists(CFB_TIERS):
        with open(CFB_TIERS) as f:
            return json.load(f)
    return None


def american(x):
    return None if x is None else round(float(x))


def decide(p_home, home, away, t):
    c = max(p_home, 1 - p_home)
    side = home if p_home >= 0.5 else away
    if c >= t["top25"]:
        return {"action": "ML", "side": side, "prob": round(c, 4), "tier": "top25", "bar": t["top50"]}
    if c >= t["top50"]:
        return {"action": "ML", "side": side, "prob": round(c, 4), "tier": "top50", "bar": t["top50"]}
    return {"action": "PASS", "side": None, "prob": round(c, 4), "tier": None, "bar": t["top50"]}


def board_docs(path):
    if not os.path.exists(path):
        return {}
    with open(path) as f:
        return {d["doc_id"]: d["data"] for d in json.load(f).get("docs", []) if d.get("collection") == "decisions"}


def build(now, sport, lock_rows, latest, picks_rows, results):
    cfg = SPORTS[sport]
    path = os.path.join(ROOT, cfg["dir"], "lineboard_export.json")
    docs = board_docs(path)
    t = tiers_for(sport)
    added = 0
    info = {}                                   # game_id -> {home, away, kickoff, date, kalshi}
    for g in (latest.get("games") or {}).values():
        if g.get("sport") == sport:
            info[g["game_id"]] = {**g, "kalshi": (g.get("picks") or {}).get("kalshi") or {}, "fresh": True}
    closing = {}
    for r in picks_rows:
        if r.get("sport") != sport:
            continue
        if r.get("model") == "kalshi":
            closing[r["game_id"]] = r
        info.setdefault(r["game_id"], {k: r.get(k) for k in ("home", "away", "kickoff", "date")})
    for gid, k in closing.items():
        info[gid].setdefault("kalshi", k)
    market = {(r["game_id"], r["champion_lock_at"]): r for r in lock_rows
              if r["slot"] == cfg["slot"] and r["model"] == "market"}

    if t is not None:
        tiers_from = max(parse_t(START), parse_t(t.get("computed_at") or START))
        for r in lock_rows:
            if r["slot"] != cfg["slot"] or r["model"] != cfg["model"] or r["role"] != "champion":
                continue
            gid = r["game_id"]
            if gid in docs or gid not in info:
                continue
            if parse_t(r["logged_at"]) < tiers_from or parse_t(r["logged_at"]) >= parse_t(r["kickoff"]):
                continue
            g = info[gid]
            # the price at the lock: latest.json's, when this run took the lock; else Kalshi's last pre-start price
            fresh = g.get("fresh") and (now - parse_t(r["logged_at"])).total_seconds() < 3600
            k = (g.get("kalshi") if fresh else closing.get(gid) or g.get("kalshi")) or {}
            m = market.get((gid, r["champion_lock_at"]))
            dec = decide(float(r["home_wp"]), g["home"], g["away"], t)
            lean_side = g["home"] if float(r["home_wp"]) >= 0.5 else g["away"]
            docs[gid] = {
                "sport": sport, "game_id": gid, "home_team": g["home"], "away_team": g["away"],
                "game_date": g.get("date"), "kickoff_time": r["kickoff"], "locked_at": r["logged_at"],
                "decision": dec,
                "lean": {"side": lean_side, "prob": dec["prob"], "note": cfg["note"]},
                "market_snapshot": {"moneyline_home": american(k.get("home_ml")), "moneyline_away": american(k.get("away_ml")),
                                    "spread_home": k.get("home_line"),
                                    "from": "lock" if fresh else "last pre-start (lock run missed)"},
                "inputs": {"model_version": cfg["version"], "market_book": "Kalshi",
                           "market_prob_home_at_lock": None if m is None else float(m["home_wp"]),
                           "model_prob_home_at_lock": float(r["home_wp"])},
                "outcome": {"resolved": False, "decision_correct": None, "home_score": None, "away_score": None},
                "rule": RULE,
            }
            added += 1

    for gid, d in docs.items():
        f = results.get(gid)
        if f is None or d["outcome"]["resolved"]:
            continue
        hs, as_ = f["home_score"], f["away_score"]
        win = d["home_team"] if hs > as_ else d["away_team"] if as_ > hs else None
        side = d["decision"]["side"]
        d["outcome"] = {"resolved": True, "home_score": hs, "away_score": as_,
                        "decision_correct": None if side is None or win is None else side == win}

    ordered = sorted(docs.values(), key=lambda d: (d["kickoff_time"], d["game_id"]))
    out = {"sport": sport, "generated_at": iso(now), "rule": RULE, "tiers": t, "n_docs": len(ordered),
           "docs": [{"collection": "decisions", "doc_id": d["game_id"], "data": d} for d in ordered]}
    return path, out, added


def cfb_tiers():
    if os.path.exists(CFB_TIERS):
        print("CFB tiers: already fixed in", os.path.relpath(CFB_TIERS, ROOT))
        return 0
    import cfb_model_live as M
    data, _ = M.load(datetime.now(timezone.utc), with_current=False)
    if data is None:
        print("CFB tiers: the Lab's CFB data isn't here (Actions cache): skipped")
        return 0
    games, ret = M.games_from(data)
    F = M.FROZEN
    _, out = M.run(games, F["settings"], F["weights"], ret)
    A, B = F["win_chance"]["a"], F["win_chance"]["b"]
    rows = []
    for g, _, mu in out:
        if g["season"] in M.TEST and g["margin"] is not None and g["margin"] != 0:
            p = M.logistic(A, B, mu)
            rows.append((max(p, 1 - p), (p > 0.5) == (g["margin"] > 0)))
    return write_tiers(rows, CFB_TIERS, "cfb/CFB_MODEL_V1_PREREG.md test seasons 2021-2024 (cfb_model_live.py, frozen)")


def summarize(rows):
    cs = sorted(c for c, _ in rows)
    n = len(cs)
    med = (cs[(n - 1) // 2] + cs[n // 2]) / 2
    p75 = cs[int(0.75 * (n - 1))]
    acc = lambda lo, hi=2.0: round(sum(w for c, w in rows if lo <= c < hi) / max(1, sum(1 for c, _ in rows if lo <= c < hi)), 4)
    return {"games": n, "top50": round(med, 4), "top25": round(p75, 4), "acc_top50": acc(med),
            "acc_top25": acc(p75), "acc_rest": acc(0, med)}


def write_tiers(rows, path, source):
    s = dict(summarize(rows), source=source, computed_at=iso(datetime.now(timezone.utc)))
    with open(path, "w") as f:
        json.dump(s, f, indent=1)
        f.write("\n")
    print("tiers:", {k: v for k, v in s.items() if k != "source"}, "->", os.path.relpath(path, ROOT))
    return 0


def cbb_tiers(d):
    import cbb_model_live as M
    games, di = M.load_dir(d)
    F = M.FROZEN
    W, A, B = F["weights"], F["win_chance"]["a"], F["win_chance"]["b"]
    _, out = M.run(games, F["settings"], W["home"], di)
    rows = []
    for g, gap, _ in M.graded(out, M.TEST):
        p = M.logistic(A, B, M.margin(W, gap, g["neutral"]))
        rows.append((max(p, 1 - p), (p > 0.5) == (g["hs"] > g["as"])))
    print("CBB tiers:", summarize(rows), "(fixed in this file:", {k: CBB_TIERS[k] for k in ("top50", "top25")}, ")")
    return 0


def main(argv):
    if argv[:1] == ["cfb-tiers"]:
        return cfb_tiers()
    if argv[:1] == ["cbb-tiers"]:
        return cbb_tiers(argv[1])
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--now")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)
    now = parse_t(a.now) if a.now else datetime.now(timezone.utc)
    lock_rows = read_csv(LOCKS)
    latest = json.load(open(LATEST)) if os.path.exists(LATEST) else {"games": {}}
    picks_rows = read_jsonl(PICKS)
    results = {r["game_id"]: r for r in read_jsonl(RESULTS) if r.get("sport") in SPORTS}
    for sport in SPORTS:
        path, out, added = build(now, sport, lock_rows, latest, picks_rows, results)
        ds = [d["data"] for d in out["docs"]]
        picks = [d for d in ds if d["decision"]["action"] != "PASS"]
        graded = [d for d in picks if d["outcome"]["decision_correct"] is not None]
        won = sum(d["outcome"]["decision_correct"] for d in graded)
        print(f"{sport}: {added} new; {len(ds)} on the board, {len(picks)} picks, {won}-{len(graded) - won} graded"
              + ("" if out["tiers"] else " (no tiers yet: no decisions)"))
        if not a.dry_run:
            with open(path, "w") as f:
                json.dump(out, f, separators=(",", ":"))
                f.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
