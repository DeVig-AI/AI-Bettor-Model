#!/usr/bin/env python3
"""
champion_review.py -- CHAMPION_CHALLENGER_V1_PREREG.md, run after tools/models_compare.py every hour.

The app shows one model's pick per slot (sport + market; this version: who wins). A registered challenger that beats
that model (the champion) on 300+ graded same games logged since its registration replaces it in the app at once, on
a trial; the old model keeps locking beside it. After the trial (150 games, NFL 64) the challenger is kept only if it
was more accurate in all four quarters and no worse on profit at Kalshi prices; otherwise the old model is put back.

Each run:
  1. locks every model of every slot for upcoming games (live/champions/MODEL_LOCKS.csv, append-only): DeVig's
     trackers at their own lock, every other model at its current number in live/models/latest.json, taken against
     DeVig's lock time (college football: 6 hours before the start);
  2. for a slot on trial: once the trial has its games, keeps or removes the challenger;
  3. for a slot not on trial: checks each registered challenger's entry test;
  4. appends every decision to live/champions/DECISIONS.csv, writes live/champions.json (current state) and
     live/champions_export.json (the app's progress card).

Grading reuses tools/models_compare.py (finals in live/models/results.jsonl, Kalshi's last pre-start prices in
live/models/picks.jsonl, profit as its grade_game computes it). Nothing here is bet.

Usage:  python3 tools/champion_review.py [--now ISO] [--dry-run]
"""
import argparse
import csv
import json
import math
import random
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import models_compare as MC  # noqa: E402

STATE = ROOT / "live" / "champions.json"
DIR = ROOT / "live" / "champions"
LOCKS = DIR / "MODEL_LOCKS.csv"
DECISIONS = DIR / "DECISIONS.csv"
CHALLENGERS = DIR / "challengers"
EXPORT = ROOT / "live" / "champions_export.json"

LOCK_COLS = ["logged_at", "slot", "game_id", "kickoff", "model", "role", "home_wp", "champion_lock_at"]
DECISION_COLS = ["at", "slot", "action", "challenger", "champion", "games", "ll_challenger", "ll_champion", "ll_diff",
                 "ci_lo", "ci_hi", "profit_challenger", "profit_champion", "quarters", "tier_top25", "tier_top50",
                 "acc_top25", "acc_top50", "detail"]

# the prereg's numbers
ENTRY_GAMES = 300
TRIAL_GAMES = {"NFL": 64}
TRIAL_GAMES_DEFAULT = 150
BOOT_DRAWS, BOOT_SEED = 10_000, 20261030
CLIP = 0.01
NO_TRACKER_LEAD = timedelta(hours=6)          # college football: reference time = 6 hours before the start
TRACKER_SPORTS = {"NFL", "NBA", "MLB"}        # sports where DeVig's own tracker lock is the reference time
ALLOWED_LICENSES = {"mit", "bsd", "apache", "apache-2.0", "public domain", "this project"}
SEASON_END = {"NBA": (7, 1), "NFL": (3, 1), "MLB": (12, 1), "CFB": (2, 1)}   # a removed challenger waits until then


def iso(t):
    return MC.iso(t)


# ================================================================ files

def read_csv(path):
    if not path.exists():
        return []
    with path.open(newline="") as f:
        return list(csv.DictReader(f))


def append_csv(path, cols, rows):
    if not rows:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    new = not path.exists() or path.stat().st_size == 0
    with path.open("a", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        if new:
            w.writeheader()
        for r in rows:
            w.writerow({k: ("" if r.get(k) is None else r.get(k)) for k in cols})


def read_simple_yaml(path):
    """The challenger files are flat `key: value` lines; read them without a YAML library."""
    out = {}
    for line in path.read_text().splitlines():
        if not line.strip() or line.lstrip().startswith("#") or ":" not in line:
            continue
        k, v = line.split(":", 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def committed(path):
    """The file is in git, unmodified, in a commit older than now (prereg: like a Lab candidate, A3.1)."""
    rel = str(path.relative_to(ROOT))
    try:
        if subprocess.run(["git", "ls-files", "--error-unmatch", rel], cwd=ROOT, capture_output=True).returncode:
            return False
        if subprocess.run(["git", "diff", "--quiet", "HEAD", "--", rel], cwd=ROOT).returncode:
            return False
    except OSError:
        return False
    return True


def challengers():
    """{slot: [challenger dict]} for every valid, committed registration."""
    out = {}
    if not CHALLENGERS.exists():
        return out
    for f in sorted(CHALLENGERS.glob("*.yaml")):
        c = read_simple_yaml(f)
        ok = all(c.get(k) for k in ("id", "slot", "source", "license", "registered")) \
            and c["license"].lower() in ALLOWED_LICENSES and committed(f)
        if ok:
            out.setdefault(c["slot"], []).append(c)
        else:
            MC.note(f"challenger {f.name}", ValueError("not used: missing field, license not allowed, or not committed"))
    return out


# ================================================================ 1. locks

def slot_models(slot, state_slot, regs):
    """Every model locked for a slot: its champion, DeVig's tracker where it has one, the trial's models, every
    registered challenger, and the market."""
    sport = slot.split(".")[0]
    models = {state_slot["champion"], "market"}
    if sport in TRACKER_SPORTS:
        models.add("devig")
    t = state_slot.get("trial") or {}
    models.update(m for m in (t.get("challenger"), t.get("previous")) if m)
    models.update(c["source"] for c in regs.get(slot, []))
    return models


def model_number(model, picks):
    """A model's current home win chance in a latest.json game, or None."""
    if model == "market":
        k = picks.get("kalshi") or {}
        p = MC.novig(k.get("home_ml"), k.get("away_ml"))
        return p if p is not None else k.get("home_wp")
    return (picks.get(model) or {}).get("home_wp")


def reference_lock(sport, game, picks):
    """(DeVig lock time string, datetime) the game's locks are taken against, or None when it has none yet."""
    if sport in TRACKER_SPORTS:
        at = (picks.get("devig") or {}).get("at")
        return (at, MC.parse_t(at)) if at else None
    t = game["kickoff_dt"] - NO_TRACKER_LEAD
    return iso(t), t


def lock_step(now, state, regs, latest, existing):
    """New MODEL_LOCKS rows for this run. `existing` is the set of (slot, game_id, model, champion_lock_at) already
    logged, so each model is locked once per DeVig lock."""
    rows = []
    for slot, s in state["slots"].items():
        sport = slot.split(".")[0]
        models = slot_models(slot, s, regs)
        trial = s.get("trial") or {}
        for key, g in (latest.get("games") or {}).items():
            if g.get("sport") != sport:
                continue
            kick = MC.parse_t(g.get("kickoff"))
            if kick is None or kick <= now:
                continue
            g = dict(g, kickoff_dt=kick)
            picks = g.get("picks") or {}
            ref = reference_lock(sport, g, picks)
            if ref is None or now < ref[1]:
                continue
            for m in sorted(models):
                k = (slot, g["game_id"], m, ref[0])
                if k in existing:
                    continue
                p = model_number(m, picks)
                if p is None:
                    continue
                role = "champion" if m == s["champion"] else "challenger" if m == trial.get("challenger") else "tracked"
                rows.append({"logged_at": iso(now), "slot": slot, "game_id": g["game_id"], "kickoff": g["kickoff"],
                             "model": m, "role": role, "home_wp": round(float(p), 4), "champion_lock_at": ref[0]})
                existing.add(k)
    return rows


# ================================================================ 2. same-game pairs

def final_locks(slot, lock_rows, picks_rows):
    """{game_id: {model: home_wp}} from the locks taken against DeVig's last lock before the start."""
    sport = slot.split(".")[0]
    last_ref = {}
    if sport in TRACKER_SPORTS:
        for p in picks_rows:
            if p.get("sport") == sport and p.get("model") == "devig" and p.get("at"):
                last_ref[str(p["game_id"])] = p["at"]
    out = {}
    for r in lock_rows:
        if r["slot"] != slot:
            continue
        ref = last_ref.get(r["game_id"])
        if sport in TRACKER_SPORTS and r["champion_lock_at"] != ref:
            continue
        out.setdefault(r["game_id"], {})[r["model"]] = float(r["home_wp"])
    return out


def pairs(slot, a, b, since, lock_rows, picks_rows, result_rows):
    """Graded games where both models a and b have a final lock, kicking off at or after `since`, by start time:
    [{game_id, kickoff, pa, pb, home_won, home_ml, away_ml}]."""
    sport = slot.split(".")[0]
    locks = final_locks(slot, lock_rows, picks_rows)
    kick = {}
    for r in lock_rows:
        if r["slot"] == slot:
            kick[r["game_id"]] = r["kickoff"]
    res = {str(r["game_id"]): r for r in result_rows if r.get("sport") == sport}
    price = {str(p["game_id"]): p for p in picks_rows if p.get("sport") == sport and p.get("model") == "kalshi"}
    out = []
    for gid, ms in locks.items():
        if a not in ms or b not in ms or gid not in res:
            continue
        t = MC.parse_t(kick.get(gid))
        if t is None or t < since:
            continue
        r = res[gid]
        if r.get("home_score") is None or r.get("away_score") is None or r["home_score"] == r["away_score"]:
            continue
        pa, pb = ms[a], ms[b]
        if not (0 < pa < 1 and 0 < pb < 1):
            continue
        k = price.get(gid) or {}
        out.append({"game_id": gid, "kickoff": t, "pa": pa, "pb": pb, "home_won": r["home_score"] > r["away_score"],
                    "home_ml": MC.num(k.get("home_ml")), "away_ml": MC.num(k.get("away_ml"))})
    out.sort(key=lambda x: (x["kickoff"], x["game_id"]))
    return out


# ================================================================ 3. measures

def log_loss(p, home_won):
    p = min(max(p, CLIP), 1 - CLIP)
    return -math.log(p if home_won else 1 - p)


def profit(p, home_won, home_ml, away_ml):
    """1 unit on the side the win chance favours at Kalshi's price (models_compare's moneyline rule); None without a
    price, 0.0 for no bet (exactly 0.5)."""
    if p == 0.5:
        return 0.0
    side_home = p > 0.5
    odds = home_ml if side_home else away_ml
    if odds is None:
        return None
    return MC.ml_payout(odds) if side_home == home_won else -1.0


def mean(xs):
    return sum(xs) / len(xs) if xs else None


def bootstrap_ci(diffs, draws=BOOT_DRAWS, seed=BOOT_SEED):
    """95% percentile interval of the mean of `diffs`, resampling games."""
    rng = random.Random(seed)
    n = len(diffs)
    means = sorted(sum(diffs[rng.randrange(n)] for _ in range(n)) / n for _ in range(draws))
    return means[int(0.025 * draws)], means[int(0.975 * draws) - 1]


def summarize(ps, draws=BOOT_DRAWS):
    """Challenger (pa) vs champion (pb) over these pairs."""
    lla = [log_loss(x["pa"], x["home_won"]) for x in ps]
    llb = [log_loss(x["pb"], x["home_won"]) for x in ps]
    diffs = [a - b for a, b in zip(lla, llb)]
    priced = [(profit(x["pa"], x["home_won"], x["home_ml"], x["away_ml"]),
               profit(x["pb"], x["home_won"], x["home_ml"], x["away_ml"])) for x in ps]
    priced = [(a, b) for a, b in priced if a is not None and b is not None]
    lo, hi = bootstrap_ci(diffs, draws) if diffs else (None, None)
    return {"games": len(ps), "ll_challenger": mean(lla), "ll_champion": mean(llb), "ll_diff": mean(diffs),
            "ci_lo": lo, "ci_hi": hi, "priced": len(priced),
            "profit_challenger": sum(a for a, _ in priced), "profit_champion": sum(b for _, b in priced)}


def entry_passes(s):
    return s["games"] >= ENTRY_GAMES and s["ci_hi"] is not None and s["ci_hi"] < 0 \
        and s["profit_challenger"] >= s["profit_champion"]


def tiers(ps):
    """Top-25% / top-50% confidence cutoffs from the challenger's entry games, and each tier's hit rate."""
    conf = sorted(max(x["pa"], 1 - x["pa"]) for x in ps)
    n = len(conf)

    def pct(q):
        i = q * (n - 1)
        lo, hi = math.floor(i), math.ceil(i)
        return conf[lo] + (conf[hi] - conf[lo]) * (i - lo)

    t25, t50 = pct(0.75), pct(0.5)

    def acc(cut):
        hits = [(x["pa"] > 0.5) == x["home_won"] for x in ps if max(x["pa"], 1 - x["pa"]) >= cut]
        return round(sum(hits) / len(hits), 4) if hits else None

    return {"top25": round(t25, 4), "top50": round(t50, 4), "acc_top25": acc(t25), "acc_top50": acc(t50)}


def quarters(ps):
    q = len(ps) // 4
    return [ps[:q], ps[q:2 * q], ps[2 * q:3 * q], ps[3 * q:]]


def trial_verdict(ps, target):
    """None until the trial has `target` graded games; then (kept, summary, per-quarter log loss differences)."""
    if len(ps) < target:
        return None
    ps = ps[:target]
    qd = [mean([log_loss(x["pa"], x["home_won"]) - log_loss(x["pb"], x["home_won"]) for x in q]) for q in quarters(ps)]
    s = summarize(ps)
    kept = all(d is not None and d < 0 for d in qd) and s["profit_challenger"] >= s["profit_champion"]
    return kept, s, qd


def season_end(sport, now):
    m, d = SEASON_END.get(sport, (7, 1))
    end = datetime(now.year, m, d, tzinfo=timezone.utc)
    return end if end > now else datetime(now.year + 1, m, d, tzinfo=timezone.utc)


# ================================================================ 4. the review

def decision_row(now, slot, action, challenger, champion, s=None, qd=None, t=None, detail=""):
    r = {"at": iso(now), "slot": slot, "action": action, "challenger": challenger, "champion": champion,
         "detail": detail}
    if s:
        r.update({k: (round(v, 6) if isinstance(v, float) else v) for k, v in s.items() if k in DECISION_COLS})
    if qd:
        r["quarters"] = " ".join(f"{d:+.5f}" for d in qd)
    if t:
        r.update(tier_top25=t["top25"], tier_top50=t["top50"], acc_top25=t["acc_top25"], acc_top50=t["acc_top50"])
    return r


def review(now, state, regs, lock_rows, picks_rows, result_rows, decided):
    """(new decision rows, progress per slot). Changes `state` in place. `decided` = set of (slot, challenger,
    action) already logged, so a waiting slot logs 'eligible' once."""
    out, progress = [], {}
    for slot, s in state["slots"].items():
        sport = slot.split(".")[0]
        champ = s["champion"]
        progress[slot] = {"champion": champ, "since": s.get("since"), "trial": None, "challengers": []}
        if s.get("hold"):
            progress[slot]["hold"] = s["hold"]
            continue
        trial = s.get("trial")
        if trial:
            start = MC.parse_t(trial["start"])
            ps = pairs(slot, trial["challenger"], trial["previous"], start, lock_rows, picks_rows, result_rows)
            target = trial["target"]
            v = trial_verdict(ps, target)
            progress[slot]["trial"] = dict(trial, games=min(len(ps), target))
            if v is None:
                continue
            kept, summ, qd = v
            if kept:
                s.update(champion=trial["challenger"], since=iso(now), tiers=trial.get("tiers"), trial=None)
                out.append(decision_row(now, slot, "keep", trial["challenger"], trial["previous"], summ, qd,
                                        detail="more accurate in all 4 quarters and no worse on profit"))
            else:
                s["trial"] = None
                s.setdefault("retired", []).append({"id": trial["challenger"], "at": iso(now),
                                                    "until": iso(season_end(sport, now))})
                why = "behind in a quarter" if not all(d < 0 for d in qd) else "lower profit"
                out.append(decision_row(now, slot, "remove", trial["challenger"], trial["previous"], summ, qd,
                                        detail=f"{why}; {trial['previous']} put back"))
            progress[slot]["trial"] = None
            progress[slot]["champion"] = s["champion"]
            continue
        retired = {r["id"] for r in s.get("retired", []) if MC.parse_t(r["until"]) > now}
        for c in regs.get(slot, []):
            if c["source"] == champ or c["source"] in retired:
                continue
            since = datetime.fromisoformat(c["registered"]).replace(tzinfo=timezone.utc)
            ps = pairs(slot, c["source"], champ, since, lock_rows, picks_rows, result_rows)
            summ = summarize(ps, draws=BOOT_DRAWS if len(ps) >= ENTRY_GAMES else 1000)
            progress[slot]["challengers"].append({"id": c["source"], "games": summ["games"], "needed": ENTRY_GAMES,
                                                  "ll_diff": summ["ll_diff"], "ci_hi": summ["ci_hi"],
                                                  "profit_challenger": summ["profit_challenger"],
                                                  "profit_champion": summ["profit_champion"]})
            if not entry_passes(summ):
                continue
            t = tiers(ps)
            if not s.get("app_support"):
                if (slot, c["source"], "eligible") not in decided:
                    out.append(decision_row(now, slot, "eligible", c["source"], champ, summ, t=t,
                                            detail="passed entry; waiting for app support in a later version"))
                    decided.add((slot, c["source"], "eligible"))
                continue
            target = TRIAL_GAMES.get(sport, TRIAL_GAMES_DEFAULT)
            s["trial"] = {"challenger": c["source"], "start": iso(now), "previous": champ, "target": target, "tiers": t}
            out.append(decision_row(now, slot, "enter", c["source"], champ, summ, t=t,
                                    detail=f"replaces {champ} in the app on a {target}-game trial"))
            progress[slot]["trial"] = dict(s["trial"], games=0)
            break                                                     # one trial at a time per slot
    return out, progress


def export(now, state, progress):
    data = {"doc": "CHAMPIONS_V1", "generated_at": iso(now), "rule": state.get("rule"), "slots": progress}
    return {"generated_at": iso(now), "n_docs": 1, "docs": [{"collection": "champions", "doc_id": "CHAMPIONS_V1",
                                                            "data": data}]}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--now")
    ap.add_argument("--dry-run", action="store_true", help="print what would change; write nothing")
    a = ap.parse_args()
    now = MC.parse_t(a.now) if a.now else datetime.now(timezone.utc)

    state = json.loads(STATE.read_text())
    regs = challengers()
    latest = json.loads(MC.LATEST.read_text()) if MC.LATEST.exists() else {"games": {}}
    lock_rows = read_csv(LOCKS)
    existing = {(r["slot"], r["game_id"], r["model"], r["champion_lock_at"]) for r in lock_rows}
    new_locks = lock_step(now, state, regs, latest, existing)
    lock_rows += [{k: str(v) for k, v in r.items()} for r in new_locks]

    decided = {(r["slot"], r["challenger"], r["action"]) for r in read_csv(DECISIONS)}
    decisions, progress = review(now, state, regs, lock_rows, MC.read_jsonl(MC.PICKS), MC.read_jsonl(MC.RESULTS),
                                 decided)
    print(f"{len(new_locks)} new locks; {len(decisions)} decisions")
    for d in decisions:
        print(f"  {d['slot']}: {d['action']} {d['challenger']} (champion {d['champion']}) -- {d['detail']}")
    for slot, p in progress.items():
        for c in p["challengers"]:
            print(f"  {slot}: {c['id']} {c['games']}/{c['needed']} same games")
    if a.dry_run:
        return 0
    append_csv(LOCKS, LOCK_COLS, new_locks)
    append_csv(DECISIONS, DECISION_COLS, decisions)
    STATE.write_text(json.dumps(state, indent=1) + "\n")
    EXPORT.write_text(json.dumps(export(now, state, progress), indent=1, default=str) + "\n")
    for e in MC.errors:
        print("note:", e)
    return 0


if __name__ == "__main__":
    sys.exit(main())
