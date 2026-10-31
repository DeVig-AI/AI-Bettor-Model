#!/usr/bin/env python3
"""
v2 (2026-10-30): the app's NBA pick follows live/champions.json (CHAMPION_CHALLENGER_V1_PREREG.md). While a
challenger is on trial, games starting after the trial began show the challenger's lock (live/champions/
MODEL_LOCKS.csv, taken against this tracker's lock) with its own tiers and `model_label: "Trial"`; Model C's own pick
stays beside it (`compare` on the decisions doc, `outcome.compare_correct`). A challenger that was kept is shown the
same way without the label. Games with no challenger lock, and every game when Model C is the champion with no
trial, are exactly v1. Everything else is v1, unchanged.

export_lineboard_nba.py -- turns the NBA tracker database into the app's game documents (nba/lineboard_export.json),
the same shape as mlb/export_lineboard_mlb_v2.py writes for MLB, so locked NBA picks show up in the free app
(docs/repo-data.js reads this file). Reads only: never touches NBA_PROSPECTIVE_TRACKER_V1.sqlite3's contents.

Per game with a locked pick:
  - a `slate` doc     (game card: Kalshi moneyline + the model's read)
  - a `decisions` doc (the app's ML/PASS call and, once graded, the real outcome)

Decision rule: the app's own NBA cutoffs (NBA_SELECTIVE_COVERAGE_V1): winner prob >= 0.6830 -> ML top25,
>= 0.6083 -> ML top50, else PASS. NBA is moneyline-only (no spread or total model).

Usage:  python3 export_lineboard_nba.py
"""
import csv
import hashlib
import json
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
DB = SCRIPT_DIR / "NBA_PROSPECTIVE_TRACKER_V1.sqlite3"
OUT = SCRIPT_DIR / "lineboard_export.json"
CHAMPIONS = SCRIPT_DIR.parent / "live" / "champions.json"
MODEL_LOCKS = SCRIPT_DIR.parent / "live" / "champions" / "MODEL_LOCKS.csv"
SLOT = "NBA.ml"
NAMES = {"devig": "DeVig Model C", "blotny": "Blotny NBA (MIT, outside model)", "market": "Kalshi's price"}

ML_TOP25, ML_TOP50 = 0.6830, 0.6083
RECENT_DAYS = 5

# full team names in the tracker -> the codes the app uses (TEAM_COLORS.NBA in tools/devig_source.html)
CODE = {
    "Atlanta Hawks": "ATL", "Boston Celtics": "BOS", "Brooklyn Nets": "BKN", "Charlotte Hornets": "CHA",
    "Chicago Bulls": "CHI", "Cleveland Cavaliers": "CLE", "Dallas Mavericks": "DAL", "Denver Nuggets": "DEN",
    "Detroit Pistons": "DET", "Golden State Warriors": "GSW", "Houston Rockets": "HOU", "Indiana Pacers": "IND",
    "LA Clippers": "LAC", "Los Angeles Clippers": "LAC", "Los Angeles Lakers": "LAL", "Memphis Grizzlies": "MEM",
    "Miami Heat": "MIA", "Milwaukee Bucks": "MIL", "Minnesota Timberwolves": "MIN", "New Orleans Pelicans": "NOP",
    "New York Knicks": "NYK", "Oklahoma City Thunder": "OKC", "Orlando Magic": "ORL", "Philadelphia 76ers": "PHI",
    "Phoenix Suns": "PHX", "Portland Trail Blazers": "POR", "Sacramento Kings": "SAC", "San Antonio Spurs": "SAS",
    "Toronto Raptors": "TOR", "Utah Jazz": "UTA", "Washington Wizards": "WAS",
}


def code(name):
    return CODE.get(name, name)


def tier(p, cuts=None):
    top25, top50 = (cuts["top25"], cuts["top50"]) if cuts else (ML_TOP25, ML_TOP50)
    return "top25" if p >= top25 else ("top50" if p >= top50 else None)


def utc(s):
    return datetime.fromisoformat(str(s).replace("Z", "+00:00")).astimezone(timezone.utc)


def zulu(s):
    return utc(s).strftime("%Y-%m-%dT%H:%M:%SZ")


def app_model(kickoff, slot):
    """(model shown in the app, its tiers or None for Model C's, label, model shown beside it or None)."""
    if not slot:
        return "devig", None, None, None
    t = slot.get("trial")
    if t and utc(kickoff) > utc(t["start"]):
        return t["challenger"], t.get("tiers"), "Trial", t["previous"]
    if slot["champion"] != "devig":
        return slot["champion"], slot.get("tiers"), None, "devig"
    return "devig", None, None, None


def other_locks():
    """{(game_id, DeVig lock time): {model: home win chance}} from the champion / challenger lock log."""
    out = {}
    if not MODEL_LOCKS.exists():
        return out
    with MODEL_LOCKS.open(newline="") as f:
        for r in csv.DictReader(f):
            if r["slot"] == SLOT:
                out.setdefault((r["game_id"], r["champion_lock_at"]), {})[r["model"]] = float(r["home_wp"])
    return out


def doc_hash(data):
    body = {k: v for k, v in data.items() if k != "synced_at"}
    return hashlib.sha256(json.dumps(body, sort_keys=True, default=str).encode()).hexdigest()


def num(x):
    return None if x is None else int(round(float(x)))


def main():
    slot = (json.loads(CHAMPIONS.read_text()).get("slots") or {}).get(SLOT) if CHAMPIONS.exists() else None
    locks = other_locks()
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    grades = {r["pick_id"]: r for r in conn.execute("SELECT * FROM grades")}
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    window_start = (datetime.now(timezone.utc) - timedelta(days=RECENT_DAYS)).isoformat()

    docs = []
    for r in conn.execute("SELECT * FROM picks ORDER BY kickoff_time"):
        if r["kickoff_time"] < window_start and r["graded"] == 1:
            continue                                  # old finished games are already in the app and never change
        gid = str(r["event_id"])
        home, away = code(r["home_team"]), code(r["away_team"])
        p_home = r["model_prob_home"]
        shown, cuts, label, beside = app_model(r["kickoff_time"], slot)
        theirs = locks.get((gid, zulu(r["lock_timestamp_utc"])), {})
        if shown != "devig" and theirs.get(shown) is None:
            shown, cuts, label, beside = "devig", None, None, None     # no lock from that model for this game
        compare = None
        if shown != "devig":
            mine = p_home
            p_home = theirs[shown]
            if beside == "devig":
                b_p = mine
            else:
                b_p = theirs.get(beside)
            if b_p is not None:
                b_side = home if b_p >= 0.5 else away
                b_wp = max(b_p, 1 - b_p)
                b_t = tier(b_wp) if beside == "devig" else None
                compare = {"model": beside, "name": NAMES.get(beside, beside), "side": b_side, "prob": b_wp,
                           "tier": b_t, "action": "ML" if b_t else "PASS"}
        side = home if p_home >= 0.5 else away
        wp = max(p_home, 1 - p_home)
        t = tier(wp, cuts)
        if r["home_moneyline_kalshi"] is not None:
            book, mh, ma = "Kalshi", r["home_moneyline_kalshi"], r["away_moneyline_kalshi"]
        else:
            book, mh, ma = "Hard Rock Bet", r["home_moneyline_hardrockbet_fl"], r["away_moneyline_hardrockbet_fl"]
        market = {"book": book, "moneyline_home": num(mh), "moneyline_away": num(ma)}
        model = {"available": True, "status": "locked", "winner_prob": wp, "winner_side": side,
                 "source_snapshot_time": r["lock_timestamp_utc"],
                 "note": (f"Locked pregame by the tracker ({r['model_version']}): points scored/allowed over the last 10 "
                          f"games, rest days and back-to-backs. Odds from {book}.")}
        if shown != "devig":
            cut_note = (f" Its confidence cutoffs ({cuts['top25']:.3f} / {cuts['top50']:.3f}) come from its entry games."
                        if cuts else "")
            model.update(model_key=shown, model_label=label, tiers=cuts,
                         note=(f"{'On trial: ' if label else ''}{NAMES.get(shown, shown)}, which beat "
                               f"{NAMES.get(beside, beside)} on past games (CHAMPION_CHALLENGER_V1). Its number taken when "
                               f"DeVig's tracker locked (within the hour after). {NAMES.get(beside, beside)} is still "
                               f"tracked beside it."
                               f"{cut_note} Odds from {book}."))
        outcome = {"resolved": False, "home_score": None, "away_score": None, "decision_correct": None,
                   "spread_decision_correct": None, "spread_correct": None, "teaser_correct": None}
        g = grades.get(r["id"])
        if g is not None:
            hs, as_ = g["actual_home_score"], g["actual_away_score"]
            outcome.update({"resolved": True, "home_score": hs, "away_score": as_,
                            "graded_source": "ESPN final score via the GitHub Actions grader"})
            if t:
                outcome["decision_correct"] = (hs > as_) if side == home else (as_ > hs)
            if compare and compare["action"] == "ML":
                outcome["compare_correct"] = (hs > as_) if compare["side"] == home else (as_ > hs)
        base = {"game_id": gid, "home_team": home, "away_team": away, "game_date": r["kickoff_time"][:10],
                "kickoff_time": r["kickoff_time"], "season": r["season"], "sport": "NBA"}
        slate = dict(base, market=market, model=model, synced_at=now)
        decision = dict(base, locked_at=r["lock_timestamp_utc"],
                        decision={"action": "ML" if t else "PASS", "prob": wp, "side": side if t else None, "tier": t},
                        market_snapshot={"moneyline_home": num(mh), "moneyline_away": num(ma)},
                        outcome=outcome, spread_read=None, teaser_signal=None)
        if shown != "devig":
            decision.update(model_key=shown, model_label=label, compare=compare)
        for coll, data in (("slate", slate), ("decisions", decision)):
            data["export_hash"] = doc_hash(data)
            docs.append({"collection": coll, "doc_id": gid, "data": data})

    n_res = sum(1 for d in docs if d["collection"] == "decisions" and d["data"]["outcome"]["resolved"])
    new_keys = sorted((d["collection"], d["doc_id"], d["data"]["export_hash"]) for d in docs)
    if OUT.exists():
        try:
            old = json.loads(OUT.read_text())
            if sorted((d["collection"], d["doc_id"], d["data"]["export_hash"]) for d in old["docs"]) == new_keys:
                print(f"No changes: {len(docs)} docs ({len(docs) // 2} games, {n_res} resolved) already exported.")
                return
        except (ValueError, KeyError):
            pass
    OUT.write_text(json.dumps({"sport": "NBA", "generated_at": now, "n_docs": len(docs), "docs": docs},
                              indent=1, sort_keys=True, default=str))
    print(f"Wrote {len(docs)} app docs ({len(docs) // 2} games, {n_res} resolved) to {OUT}")


if __name__ == "__main__":
    main()
