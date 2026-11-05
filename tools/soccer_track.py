#!/usr/bin/env python3
"""
soccer_track.py -- the SOCCER.ml record (CHAMPION_CHALLENGER_V4_PREREG.md): DeVig Soccer v1's and Kalshi's home / draw /
away chances locked before each league match it covers, graded after the final whistle. Run hourly after
tools/soccer_model_live.py in models_compare.yml. Nothing is bet.

Lock: every hourly run, each match still ahead gets its row replaced with the model's chances (live/devig/soccer.json)
and Kalshi's vig-free middle price (live/soccer_lines.json, "fair"). Once a match starts its row is never touched
again, so the lock is the last hourly number before kickoff. A match whose Kalshi price was missing at that run keeps
kalshi = null and counts for the model only.
Grade: the 90-minute result (league matches have no extra time) from live/soccer_lines.json, or, once it has dropped
the match, from ESPN's league scoreboard for that day. Score = the log of the chance given to what happened, chances
clipped to [0.01, 0.99] (V1's rule) and rescaled to add to 1; "picked right" = the likeliest of the three happened.

Out: live/devig/soccer_locks.json (every lock, with its result once known) and live/devig/soccer_record.json (the
graded totals and the latest graded matches, which the app shows under DeVig's chances).
"""
import json
import math
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(__file__))
import soccer_model_live as M  # noqa: E402

ROOT = M.ROOT
MODEL = os.path.join(ROOT, "live", "devig", "soccer.json")
LINES = os.path.join(ROOT, "live", "soccer_lines.json")
LOCKS = os.path.join(ROOT, "live", "devig", "soccer_locks.json")
RECORD = os.path.join(ROOT, "live", "devig", "soccer_record.json")
STALE = timedelta(hours=12)           # an older model file is not locked from
ESPN_AFTER = timedelta(hours=3)       # look a result up on ESPN this long after kickoff
GIVE_UP = timedelta(days=5)           # a match with no result by then (postponed, abandoned) is left ungraded
RECENT = 20
TO_ESPN = {v: k for k, v in M.LEAGUES.items()}


def parse_t(s):
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def read(path, default):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def three(p):
    c = [min(0.99, max(0.01, float(x))) for x in p]
    s = sum(c)
    return [x / s for x in c]


def outcome(hs, as_):
    return 0 if hs > as_ else 1 if hs == as_ else 2


def lock(locks, model, lines, now):
    at = parse_t(model.get("generated_at"))
    if not at or now - at > STALE:
        return 0
    fair = {g.get("espn_id"): g.get("fair") for g in lines.get("games") or [] if g.get("espn_id")}
    n = 0
    for g in model.get("games") or []:
        k = parse_t(g.get("kickoff"))
        if not k or k <= now:
            continue
        f = fair.get(g["game_id"]) or {}
        kal = [f.get("home"), f.get("draw"), f.get("away")]
        locks[g["game_id"]] = {
            "game_id": g["game_id"], "league": g["league"], "kickoff": g["kickoff"], "at": model["generated_at"],
            "home": g["home"], "away": g["away"], "home_name": g["home_name"], "away_name": g["away_name"],
            "model": [g["home_wp"], g["draw_p"], g["away_wp"]],
            "kalshi": [round(float(x), 4) for x in kal] if all(isinstance(x, (int, float)) and x > 0 for x in kal) else None,
            "result": None}
        n += 1
    return n


def espn_result(row, cache):
    lg, day = TO_ESPN.get(row["league"]), row["kickoff"][:10].replace("-", "")
    if not lg:
        return None
    if (lg, day) not in cache:
        try:
            cache[(lg, day)] = {g["id"]: g for e in (M._get(M.ESPN.format(lg=lg, d=day)).get("events") or [])
                                for g in [M.reduce_event(e, lg)] if g}
        except Exception:
            cache[(lg, day)] = {}
    g = cache[(lg, day)].get(row["game_id"])
    return (g["hs"], g["as"]) if g and g["hs"] is not None and g["state"] == "post" else None


def grade(locks, lines, now, fetch=espn_result):
    done = {g["espn_id"]: g for g in lines.get("games") or [] if g.get("espn_id") and g.get("state") == "post"}
    cache, n = {}, 0
    for row in locks.values():
        k = parse_t(row["kickoff"])
        if row.get("result") or not k or k > now or now - k > GIVE_UP:
            continue
        g = done.get(row["game_id"])
        r = None
        if g and isinstance(g.get("home_score"), (int, float)) and isinstance(g.get("away_score"), (int, float)):
            r = (int(g["home_score"]), int(g["away_score"]))
        elif now - k >= ESPN_AFTER:
            r = fetch(row, cache)
        if r:
            row["result"] = list(r)
            n += 1
    return n


def record(locks, now):
    graded = sorted((r for r in locks.values() if r.get("result")), key=lambda r: r["kickoff"])

    def tally(rows, key):
        if not rows:
            return None
        ll = hit = 0.0
        for r in rows:
            p, o = three(r[key]), outcome(*r["result"])
            ll -= math.log(p[o])
            hit += max(range(3), key=lambda i: p[i]) == o
        return {"games": len(rows), "log_loss": round(ll / len(rows), 4), "picked_right": round(hit / len(rows), 4)}

    shared = [r for r in graded if r.get("kalshi")]
    return {"generated_at": M.iso(now), "slot": "SOCCER.ml", "champion": "devigsoccer", "model": M.VERSION,
            "rule": "CHAMPION_CHALLENGER_V4_PREREG.md",
            "note": "Locked at the last hourly run before kickoff; 90-minute result; log loss of the chance given to "
                    "what happened (lower is better). New, not proven: nothing is bet.",
            "devig": tally(graded, "model"),
            "shared": {"devig": tally(shared, "model"), "kalshi": tally(shared, "kalshi")} if shared else None,
            "recent": [{"game_id": r["game_id"], "league": r["league"], "kickoff": r["kickoff"],
                        "home_name": r["home_name"], "away_name": r["away_name"], "result": r["result"],
                        "model": r["model"], "kalshi": r.get("kalshi")} for r in graded[-RECENT:][::-1]]}


def main(now=None):
    now = now or datetime.now(timezone.utc)
    locks = {r["game_id"]: r for r in read(LOCKS, {}).get("locks", [])}
    lines = read(LINES, {})
    n_lock = lock(locks, read(MODEL, {}), lines, now)
    n_grade = grade(locks, lines, now)
    rows = sorted(locks.values(), key=lambda r: (r["kickoff"], r["game_id"]))
    with open(LOCKS, "w") as f:
        json.dump({"doc": "SOCCER_LOCKS_V1", "rule": "CHAMPION_CHALLENGER_V4_PREREG.md", "locks": rows}, f, indent=0)
        f.write("\n")
    rec = record(locks, now)
    with open(RECORD, "w") as f:
        json.dump(rec, f, indent=1)
        f.write("\n")
    d = rec["devig"] or {}
    print(f"soccer: {n_lock} locks refreshed, {n_grade} newly graded, {d.get('games', 0)} graded in all")


if __name__ == "__main__":
    main()
