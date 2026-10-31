"""Inspector General (Constitution A2, A6-A9). Deterministic; no AI anywhere.

    python3 -m research.lab.inspector review         # judge every candidate against the whole ledger, write reports
    python3 -m research.lab.inspector exam-register  # spend one sealed exam on the best lab pass (pushed BEFORE the data)
    python3 -m research.lab.inspector exam-run       # download the sealed season, score the registered exam
    python3 -m research.lab.inspector paper          # paper season for promoted models (Kalshi prices before kickoff)
    ... --sport CFB                                  # college football (Part C)
    ... --sport NBA|NHL|MLB                          # Part D

Only this module downloads the sealed season (exam) or current-season data (paper season), and never into the
repo: data.fetch_live keeps it in memory. Only the exam's and the paper season's summary numbers are committed.
"""
import argparse
import csv
import datetime as dt
import json
import math
import os
import subprocess
import sys

import numpy as np
import pandas as pd

from . import config as C
from . import data as D
from . import lab as L
from . import metrics as M
from . import models

EXAM_COLS = ["exam_no", "sport", "constitution_version", "sealed_season", "event", "at", "candidate_id",
             "ledger_attempt", "adj_p_at_entry", "games", "effect", "ci_lo", "ci_hi", "p_one_sided", "alpha", "passed",
             "run_url", "note"]
PAPER_COLS = ["event", "at", "game_id", "season", "week", "kickoff", "away", "home", "market", "model_forecast",
              "kalshi_line", "side", "contract", "strike", "rung_is_home", "bought", "price", "fee", "cost", "final",
              "outcome", "profit", "note"]


def fnum(x):
    try:
        v = float(x)
        return v if math.isfinite(v) else None
    except (TypeError, ValueError):
        return None


def read_csv(path):
    if not os.path.exists(path):
        return []
    with open(path, newline="") as f:
        return list(csv.DictReader(f))


def append_csv(path, cols, row):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    new = not os.path.exists(path)
    with open(path, "a", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols, lineterminator="\n")
        if new:
            w.writeheader()
        w.writerow({k: ("" if row.get(k) is None else row.get(k)) for k in cols})


def results(cid):
    p = os.path.join(C.RESULTS, f"{cid}.json")
    if not os.path.exists(p):
        return None
    with open(p) as f:
        return json.load(f)


def promoted_list():
    if not os.path.exists(C.PROMOTED):
        return []
    with open(C.PROMOTED) as f:
        return json.load(f)


# ---- review: the lab-pass verdicts ----------------------------------------------------------------------------------
def verdicts(ledger=None, cands=None):
    """{candidate_id: verdict} for every candidate that has a ledger row, judged against EVERY ledger attempt."""
    ledger = L.read_ledger() if ledger is None else ledger
    cands = L.load_candidates() if cands is None else cands
    rows = [r for r in ledger if r["sport"] == C.SPORT]
    adj = M.holm([fnum(r["p_one_sided"]) if r["status"] == "done" else 1.0 for r in rows])
    m = len(rows)
    out = {}
    for i, r in enumerate(rows):                       # later attempts of the same candidate replace earlier ones
        cid = r["candidate_id"]
        v = {"attempt": int(r["attempt"]), "attempts": m, "adj_p": adj[i], "p": fnum(r["p_one_sided"]),
             "graded_at": r["run_at"], "run_number": fnum(r["run_number"]), "run_url": r["run_url"] or None}
        if r["status"] != "done":
            v.update(state="failed", fail_reason="error", verdict=f"The run crashed ({r['error'][:160]}). It still "
                     f"counts as one of {m} attempts.")
            out[cid] = v
            continue
        e = [fnum(r[f"g{k}_effect"]) for k in (1, 2, 3)]
        pe = fnum(r["effect_pooled"])
        fade = (e[2] / e[0]) if e[0] and e[0] > 0 and e[2] is not None else None
        v["fade_ratio"] = round(fade, 4) if fade is not None else None
        why = None
        for k in range(3):
            if e[k] is None or e[k] <= 0:
                why = f"gate_{k + 1}"; break
        if why is None and (fade is None or fade < C.FADE_NEEDED):
            why = "faded"
        if why is None and not (pe is not None and pe > 0 and adj[i] < C.P_BAR):
            why = "not_significant"
        shown = "< 0.001" if adj[i] < 0.001 else f"= {adj[i]:.3f}"
        pooled = f"pooled {pe:+.2f} pts, Holm-adjusted p {shown} over {m} attempts"
        if why is None:
            v.update(state="lab_pass", fail_reason="", verdict=f"Passes the lab: {pooled}; positive in all three gates; "
                     f"last gate {fade:.0%} of the first. Eligible for the sealed exam.")
        else:
            say = {"faded": f"the effect faded (last gate {fade:.0%} of the first, needs {C.FADE_NEEDED:.0%})"
                   if fade is not None else "the effect faded",
                   "not_significant": f"not enough evidence after the correction (needs adjusted p < {C.P_BAR})"}
            if why.startswith("gate_"):
                g = C.GATES[int(why[-1]) - 1][0]
                reason = f"not positive in gate {why[-1]} ({g}: {e[int(why[-1]) - 1]:+.2f} pts)"
            else:
                reason = say[why]
            v.update(state="failed", fail_reason=why, verdict=f"Fails the lab: {reason}; {pooled}.")
        out[cid] = v
    # exams and promotion override the lab state
    exams = {}
    for x in read_csv(C.EXAMS):
        exams.setdefault(x["candidate_id"], {}).update({x["event"]: x})
    prom = {p["candidate_id"]: p for p in promoted_list()}
    for cid, ev in exams.items():
        v = out.setdefault(cid, {})
        s = ev.get("scored")
        if s:
            passed = s["passed"] == "true"
            v["exam"] = {"state": "passed" if passed else "failed", "effect": fnum(s["effect"]),
                         "ci": [fnum(s["ci_lo"]), fnum(s["ci_hi"])], "taken_at": s["at"],
                         "note": f"{s['games']} games of {s['sealed_season']}; one-sided p = {fnum(s['p_one_sided']):.4f}, "
                                 f"needs < {fnum(s['alpha']):.4f}"}
            v["state"] = "exam_pass" if passed else "exam_fail"
            v["verdict"] = (f"Passed the sealed {s['sealed_season']} exam ({fnum(s['effect']):+.2f} pts). "
                            if passed else f"Failed the sealed {s['sealed_season']} exam ({fnum(s['effect']):+.2f} pts, "
                            f"p = {fnum(s['p_one_sided']):.3f}). Final.")
        elif ev.get("error"):
            v["exam"] = {"state": "failed", "effect": None, "ci": None, "taken_at": ev["error"]["at"],
                         "note": "The exam crashed; it is spent and final (A8)."}
            v["state"], v["verdict"] = "exam_fail", "The sealed exam crashed. It is spent and final."
        else:
            v["exam"] = {"state": "not_taken", "effect": None, "ci": None, "taken_at": None,
                         "note": "Registered; the sealed season is being scored."}
    for cid, p in prom.items():
        v = out.setdefault(cid, {})
        v["state"] = "stopped" if p.get("state") == "stopped" else "promoted"
        v["promoted_name"] = p["name"]
        v["verdict"] = (f"{p['name']}: promoted, not proven. "
                        + ("Stopped by the stop rule: clearly behind Kalshi." if v["state"] == "stopped"
                           else "Paper-tracked at Kalshi prices before kickoff."))
    return out


def best_lab_pass(v, ledger):
    """A8: smallest adjusted p, then the larger pooled effect, then the earlier attempt; not examined before."""
    examined = {x["candidate_id"] for x in read_csv(C.EXAMS)}
    eff = {int(r["attempt"]): fnum(r["effect_pooled"]) or 0 for r in ledger}
    pool = [(x["adj_p"], -eff.get(x["attempt"], 0), x["attempt"], cid) for cid, x in v.items()
            if x.get("state") == "lab_pass" and cid not in examined]
    return min(pool)[3] if pool else None


def budget_used():
    """Exams spent for this sport and sealed season, across Constitution versions (Part C5: a version never resets it)."""
    return sum(1 for x in read_csv(C.EXAMS) if x["event"] == "registered" and x["sport"] == C.SPORT
               and x["sealed_season"] == str(C.SEALED_SEASON))


def review():
    from . import report
    L.check_constitution()
    report.write_all()
    v = verdicts()
    print(f"review: {len(v)} judged; lab passes: {sorted(c for c, x in v.items() if x.get('state') == 'lab_pass')}")


# ---- the sealed exam --------------------------------------------------------------------------------------------------
def exam_register():
    L.check_constitution()
    ledger = L.read_ledger()
    v = verdicts(ledger)
    if any(x["event"] == "registered" for x in read_csv(C.EXAMS)
           if not any(y["exam_no"] == x["exam_no"] and y["event"] in ("scored", "error") for y in read_csv(C.EXAMS))):
        print("an exam is already registered and not yet scored: exam-run scores it")
        return
    used = budget_used()
    if used >= C.EXAM_BUDGET:
        print(f"::notice title=Sealed exam::budget spent ({used} of {C.EXAM_BUDGET}); nothing is examined")
        return
    cid = best_lab_pass(v, ledger)
    if not cid:
        print("::notice title=Sealed exam::no candidate holds a lab pass, so no exam is spent")
        return
    number, url = L.run_info()
    append_csv(C.EXAMS, EXAM_COLS, dict(exam_no=used + 1, sport=C.SPORT, constitution_version=C.CONSTITUTION_VERSION,
                                        sealed_season=C.SEALED_SEASON, event="registered", at=L.now(), candidate_id=cid,
                                        ledger_attempt=v[cid]["attempt"], adj_p_at_entry=v[cid]["adj_p"],
                                        alpha=round(C.EXAM_ALPHA, 6), run_url=url,
                                        note=f"exam {used + 1} of {C.EXAM_BUDGET}; spent from this moment (A8)"))
    from . import report
    report.write_all()
    print(f"registered exam {used + 1} of {C.EXAM_BUDGET}: {cid}")


def with_live(seasons):
    lab = L.dm().load_lab()
    live = L.dm().fetch_live(seasons)
    return {k: pd.concat([lab[k], live[k]], ignore_index=True) for k in lab}


def exam_run():
    L.check_constitution()
    rows = read_csv(C.EXAMS)
    open_ = [x for x in rows if x["event"] == "registered"
             and not any(y["exam_no"] == x["exam_no"] and y["event"] in ("scored", "error") for y in rows)]
    if not open_:
        print("no registered exam to score")
        return
    x = open_[0]
    cid = x["candidate_id"]
    c = L.load_candidates()[cid]
    number, url = L.run_info()
    base = {k: x[k] for k in ("exam_no", "sport", "constitution_version", "sealed_season", "candidate_id",
                                "ledger_attempt", "adj_p_at_entry", "alpha")}
    try:
        data = with_live([C.SEALED_SEASON])
        out, fit = models.run(c, data)
        e = L.score(out)
        tr = L.between(e, *C.TRAIN)
        s0 = M.baseline_side(tr.r.values)
        ex = L.between(e, C.SEALED_SEASON, C.SEALED_SEASON)
        if len(ex) < C.EXAM_MIN_GAMES:
            raise RuntimeError(f"only {len(ex)} scored games in {C.SEALED_SEASON}")
        res = M.evaluate(ex.d, ex.r, s0, price=L.price_of(c, ex))
        passed = res["effect"] > 0 and res["p"] < C.EXAM_ALPHA
        append_csv(C.EXAMS, EXAM_COLS, dict(base, event="scored", at=L.now(), games=res["games"], effect=res["effect"],
                                            ci_lo=res["ci"][0], ci_hi=res["ci"][1], p_one_sided=res["p"],
                                            passed="true" if passed else "false", run_url=url))
        os.makedirs(os.path.dirname(C.EXAMS), exist_ok=True)
        with open(os.path.join(os.path.dirname(C.EXAMS), f"{cid}.json"), "w") as f:
            json.dump({"id": cid, "exam_no": int(x["exam_no"]), "sealed_season": C.SEALED_SEASON, "passed": passed,
                       "alpha": C.EXAM_ALPHA, "baseline_side": s0, "fit": fit, "run_url": url, **res}, f, indent=1)
            f.write("\n")
        print(f"exam {x['exam_no']} {cid}: {res['effect']:+.3f} pts, p={res['p']:.4f} -> {'PASS' if passed else 'fail'}")
        if passed:
            promote(cid, int(x["exam_no"]))
    except Exception as ex_:
        append_csv(C.EXAMS, EXAM_COLS, dict(base, event="error", at=L.now(), run_url=url,
                                            note=f"{type(ex_).__name__}: {ex_}"[:300]))
        print(f"exam crashed: {ex_}")
    from . import report
    report.write_all()


def promote(cid, exam_no):
    prom = promoted_list()
    name = f"Gauntlet-{len(prom) + 1}"
    prom.append({"name": name, "candidate_id": cid, "promoted_at": L.now(), "exam_no": exam_no, "state": "active",
                 "paper_log": L.rel(os.path.join(C.PAPER_DIR, f"{name}.csv")), "label": "Promoted, not proven"})
    with open(C.PROMOTED, "w") as f:
        json.dump(prom, f, indent=1)
        f.write("\n")
    lock = [L.rel(L.cand_path(cid))] + [f"research/lab/{f}" for f in L.CODE_FILES + ["inspector.py"]]
    subprocess.run([sys.executable, os.path.join(C.ROOT, "tools", "frozen_guard.py"), "rehash", *lock],
                   cwd=C.ROOT, check=True, capture_output=True)
    manifest = os.path.join(C.ROOT, "FROZEN.sha256")
    log = L.rel(os.path.join(C.PAPER_DIR, f"{name}.csv"))
    with open(manifest, "a") as f:
        f.write(f"append-only  {log}\n")
    print(f"promoted {cid} as {name}")


# ---- the paper season -----------------------------------------------------------------------------------------------
def kickoff_utc(gameday, gametime):
    from zoneinfo import ZoneInfo
    t = gametime if isinstance(gametime, str) and gametime else "13:00"
    local = dt.datetime.fromisoformat(f"{gameday}T{t}").replace(tzinfo=ZoneInfo("America/New_York"))
    return local.astimezone(dt.timezone.utc)


def kalshi_pick(market, game, home, forecast):
    """(line in home-margin / total terms, side, contract text, price, yes_wins(final) callable) on Kalshi's main
    rung, or None when there is no two-sided price."""
    rungs = game["spreads"] if market == "spread" else game["totals"]
    best = None
    for q in rungs:
        if q["bid"] is None or q["ask"] is None or not (0 < q["bid"] < q["ask"] < 1):
            continue
        mid = (q["bid"] + q["ask"]) / 2
        if best is None or abs(mid - 0.5) < abs((best["bid"] + best["ask"]) / 2 - 0.5):
            best = q
    if not best:
        return None
    x = best["line"]
    if market == "total":
        line, yes_side, no_side = x, "over", "under"
        model_yes = forecast > x
        text = f"over {x} points"
    elif best["team"] == home:
        line, yes_side, no_side = x, "home", "away"
        model_yes = forecast > x
        text = f"{best['team']} wins by over {x}"
    else:
        line, yes_side, no_side = -x, "away", "home"
        model_yes = forecast < -x
        text = f"{best['team']} wins by over {x}"
    rung_is_home = market == "spread" and best["team"] == home
    if forecast == line:
        return line, "none", text, None, x, rung_is_home, ""
    price = best["ask"] if model_yes else round(1 - best["bid"], 4)
    side = yes_side if model_yes else no_side
    bought = "YES" if model_yes else "NO"
    return line, side, f"{text}: {bought}", price, x, rung_is_home, bought


def paper():
    prom = [p for p in promoted_list() if p.get("state") == "active"]
    if not prom:
        print("paper season: no promoted model; nothing to do")
        return
    if C.SPORT in ("NBA", "NHL", "MLB"):              # D7: starts the day this sport's Kalshi logger is merged
        print(f"paper season: no {C.SPORT} Kalshi logger yet (Constitution D7); {len(prom)} promoted model(s) wait, "
              "nothing is back-filled")
        return
    sys.path.insert(0, C.ROOT)
    import kalshi_games_v1 as K
    season_now = dt.date.today().year if dt.date.today().month >= 8 else dt.date.today().year - 1
    data = with_live(sorted({C.SEALED_SEASON, season_now}))
    try:
        kal = K.kalshi_games(C.KALSHI_SPORT)
    except Exception as e:                           # no prices: no picks this run (never invented)
        print(f"Kalshi unavailable: {e}")
        kal = {}
    now = dt.datetime.now(dt.timezone.utc)
    cands = L.load_candidates()
    games = data["games"].set_index("game_id")
    changed = False
    for p in prom:
        c = cands[p["candidate_id"]]
        path = os.path.join(C.ROOT, p["paper_log"])
        log = read_csv(path)
        picked = {r["game_id"] for r in log if r["event"] == "pick"}
        graded = {r["game_id"] for r in log if r["event"] == "grade"}
        out, _ = models.run(c, data)
        cur = out[(out.season == season_now)]
        for r in cur.itertuples():
            g = games.loc[r.game_id]
            ko = kickoff_utc(g.gameday, g.gametime)
            if r.game_id not in picked and pd.isna(r.actual) and now + dt.timedelta(minutes=5) < ko <= now + dt.timedelta(hours=30):
                kg = kalshi_game_for(kal, g, ko)
                row = dict(event="pick", at=L.now(), game_id=r.game_id, season=r.season, week=r.week,
                           kickoff=ko.strftime("%Y-%m-%dT%H:%M:%SZ"), away=g.away_team, home=g.home_team,
                           market=c["market"], model_forecast=round(float(r.forecast), 3))
                pick = kalshi_pick(c["market"], kg, kg["home_code"], float(r.forecast)) if kg else None
                if not pick:
                    row.update(side="none", note="no two-sided Kalshi price for this game")
                else:
                    line, side, text, price, strike, rung_is_home, bought = pick
                    row.update(kalshi_line=line, side=side, contract=text, strike=strike,
                               rung_is_home="true" if rung_is_home else "false", bought=bought)
                    if price is None:
                        row["note"] = "model equals the Kalshi line: no pick"
                    else:
                        fee = round(C.FEE_RATE * price * (1 - price), 4)
                        row.update(price=price, fee=fee, cost=round(price + fee, 4))
                append_csv(path, PAPER_COLS, row)
                changed = True
        for r in log:
            if r["event"] != "pick" or r["game_id"] in graded or r["side"] in ("", "none") or not r["price"]:
                continue
            if r["game_id"] not in games.index:
                continue
            g = games.loc[r["game_id"]]
            if pd.isna(g.home_score) or pd.isna(g.away_score):
                continue
            final = (g.home_score - g.away_score) if r["market"] == "spread" else (g.home_score + g.away_score)
            win = graded_win(r, final)
            cost = float(r["cost"])
            append_csv(path, PAPER_COLS, dict(event="grade", at=L.now(), game_id=r["game_id"], season=r["season"],
                                              week=r["week"], away=r["away"], home=r["home"], market=r["market"],
                                              side=r["side"], kalshi_line=r["kalshi_line"], cost=cost, final=final,
                                              outcome="win" if win else "loss",
                                              profit=round((1 - cost) if win else -cost, 4)))
            changed = True
        if stop_rule(read_csv(path), games):
            append_csv(path, PAPER_COLS, dict(event="stop", at=L.now(), note="stop rule (A9.4): clearly behind Kalshi"))
            allp = promoted_list()
            for q in allp:
                if q["name"] == p["name"]:
                    q.update(state="stopped", stopped_at=L.now())
            with open(C.PROMOTED, "w") as f:
                json.dump(allp, f, indent=1)
                f.write("\n")
            changed = True
    from . import report
    report.write_all()
    print("paper season: updated" if changed else "paper season: nothing new")


def kalshi_game_for(kal, g, ko):
    """The Kalshi game for one schedule row: NFL by team code, CFB by team names (Kalshi's college codes are its own)."""
    near = [v for v in kal.values() if v.get("date") and abs((dt.date.fromisoformat(v["date"]) - ko.date()).days) <= 1]
    if C.SPORT == "CFB":
        sys.path.insert(0, os.path.join(C.ROOT, "tools"))
        import cfb_teams
        return next((v for v in near if cfb_teams.same_team(v["teams"][v["home_code"]]["name"], g.home_team)
                     and cfb_teams.same_team(v["teams"][v["away_code"]]["name"], g.away_team)), None)
    import kalshi_games_v1 as K
    home, away = K.canon("NFL", g.home_team), K.canon("NFL", g.away_team)
    return next((v for v in near if K.canon("NFL", v["home_code"]) == home and K.canon("NFL", v["away_code"]) == away), None)


def graded_win(pick, final):
    """Kalshi rules: YES on "over X" / "<team> wins by over X" wins only when strictly over X; a tie goes to NO."""
    strike = float(pick["strike"])
    if pick["market"] == "total":
        yes = final > strike
    else:
        yes = (final if pick["rung_is_home"] == "true" else -final) > strike
    return yes if pick["bought"] == "YES" else not yes


def wilson_upper(w, n, z=C.STOP_Z):
    if n == 0:
        return 1.0
    ph = w / n
    return (ph + z * z / (2 * n) + z * math.sqrt(ph * (1 - ph) / n + z * z / (4 * n * n))) / (1 + z * z / n)


def stop_rule(log, games):
    gr = [r for r in log if r["event"] == "grade"]
    picks = {r["game_id"]: r for r in log if r["event"] == "pick"}
    weeks = [int(float(r["week"])) for r in gr if r["week"]]
    if len(gr) < C.STOP_MIN_PICKS or not weeks or max(weeks) <= C.STOP_AFTER_WEEK:
        return False
    w = sum(r["outcome"] == "win" for r in gr)
    be = float(np.mean([float(picks[r["game_id"]]["cost"]) for r in gr if r["game_id"] in picks]))
    return wilson_upper(w, len(gr)) < be


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["review", "exam-register", "exam-run", "paper"])
    ap.add_argument("--sport", default=os.environ.get("LAB_SPORT", "NFL"), help="NFL (Part B), CFB (Part C), NBA, NHL or MLB (Part D)")
    a = ap.parse_args(argv)
    C.use(a.sport)
    if a.cmd != "review":                            # D1b: a suspended chamber spends no exam and logs no paper picks
        C.refuse_if_suspended()
    {"review": review, "exam-register": exam_register, "exam-run": exam_run, "paper": paper}[a.cmd]()
    return 0


if __name__ == "__main__":
    sys.exit(main())
