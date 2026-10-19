"""Reports after every run (Constitution A10): research/status.json for the owner's /lab page (contract:
research/STATUS_SCHEMA.md), and per sport STATUS.md and LESSONS.md (EXPLORATORY; NFL in research/, CFB in
research/cfb/). All generated, never hand-written.

status.json holds every sport: the NFL block at the top level (as before, so older pages keep working) and each
other sport's block under `by_sport`, plus the attempt count across all sports (Constitution C4).
"""
import datetime as dt
import json
import os

from . import config as C
from . import inspector as IG
from . import lab as L
from . import metrics as M
PASSED_LAB = ("lab_pass", "exam_pass", "exam_fail", "promoted", "stopped")
PASSED_EXAM = ("exam_pass", "promoted", "stopped")
MINUTES_PER_CANDIDATE = 1.5
SPORT_NAMES = {"NFL": "NFL", "CFB": "College football"}


def status_md_path():
    return C.STATUS_MD or os.path.join(C.RESEARCH, "STATUS.md")


def lessons_md_path():
    return C.LESSONS_MD or os.path.join(C.RESEARCH, "LESSONS.md")


def gate_names():
    return [g[0] for g in C.GATES]


def all_sports_ledger():
    """Every ledger row of every sport, in sport order: [(sport, row)]."""
    out = []
    for sp in C.SPORTS:
        path = C.LEDGER if sp == C.SPORT else C.dir_for(sp)["LEDGER"]
        out += [(sp, r) for r in L.read_ledger(path) if r["sport"] == sp]
    return out


def global_holm():
    """C4, reported only: {(sport, attempt): Holm-adjusted p over every attempt of every sport}."""
    rows = all_sports_ledger()
    adj = M.holm([IG.fnum(r["p_one_sided"]) if r["status"] == "done" else 1.0 for _, r in rows])
    return {(sp, int(r["attempt"])): a for (sp, r), a in zip(rows, adj)}, len(rows)


def r2(x):
    return None if x is None else round(float(x), 2)


def ci2(c):
    return None if not c or c[0] is None else [r2(c[0]), r2(c[1])]


def candidate_entry(c, res, v, running, gate_now, started_at, eta_at, attempts):
    e = {"id": c["id"], "name": c["name"], "market": c["market"], "family": c["family"], "reason": c["reason"],
         "state": "queued", "fail_reason": "", "gate_now": None, "started_at": None, "eta_at": None,
         "gates": [{"name": n, "effect": None, "ci": None, "games": None, "passed": None} for n in gate_names()],
         "pooled": None, "attempts": attempts, "p_bar": C.P_BAR, "fade_ratio": None, "fade_needed": C.FADE_NEEDED,
         "kalshi": None, "rule_split": [], "exam": {"state": "not_taken", "effect": None, "ci": None, "taken_at": None,
                                                    "note": ""},
         "verdict": "Registered; runs in the next nightly lab run.", "graded_at": None, "run_number": None, "run_url": None,
         "file_url": C.BLOB + L.rel(L.cand_path(c["id"])), "updated_at": None}
    if res:
        e["gates"] = [{"name": g["name"], "effect": r2(g["effect"]), "ci": ci2(g.get("ci")), "games": g["games"],
                       "passed": bool(g["effect"] is not None and g["effect"] > 0)} for g in res["gates"]]
        p = res["pooled"]
        e["pooled"] = {"name": p["name"], "effect": r2(p["effect"]), "ci": ci2(p.get("ci")),
                       "adj_p": v.get("adj_p") if v else None}
        k = p.get("kalshi") or {}
        e["kalshi"] = {"picks": k.get("picks"), "win_rate": k.get("win_rate"), "break_even": k.get("break_even"),
                       "roi": k.get("roi")}
        e["rule_split"] = [{"label": s["label"], "effect": r2(s["effect"]), "note": f"{s['games']} games · {s['note']}"}
                           for s in res["rule_split"]]
        e["file_url"] = C.BLOB + L.rel(os.path.join(C.RESULTS, f"{c['id']}.json"))
        e["updated_at"] = res.get("ran_at")
    if v:
        e.update(state=v.get("state", "queued"), fail_reason=v.get("fail_reason", ""), verdict=v.get("verdict", ""),
                 graded_at=v.get("graded_at"), run_number=int(v["run_number"]) if v.get("run_number") else None,
                 run_url=v.get("run_url"), fade_ratio=v.get("fade_ratio"))
        if v.get("exam"):
            e["exam"] = v["exam"]
        if v.get("promoted_name"):
            e["name"] = f"{v['promoted_name']} · {c['name']}"
    if c["id"] in running:
        first = running.index(c["id"]) == 0
        e.update(state="running" if first else "queued", gate_now=gate_now if first else None,
                 started_at=started_at if first else None, eta_at=eta_at if first else None,
                 verdict="Running through the three gates now." if first else "Waiting to start.")
    return e


def paper_summary():
    out = []
    for p in IG.promoted_list():
        log = IG.read_csv(os.path.join(C.ROOT, p["paper_log"]))
        picks = {r["game_id"]: r for r in log if r["event"] == "pick"}
        gr = [r for r in log if r["event"] == "grade"]
        w = sum(r["outcome"] == "win" for r in gr)
        cost = sum(float(r["cost"]) for r in gr)
        prof = sum(float(r["profit"]) for r in gr)
        be = (cost / len(gr)) if gr else None
        logged = len(picks)
        nopick = sum(1 for r in picks.values() if r["side"] in ("", "none") or not r["price"])
        note = (f"Promoted, not proven. {logged} games logged before kickoff ({nopick} without a pick); "
                f"{len(gr)} graded at Kalshi prices"
                + (f", average break-even {be:.1%}, win rate {w / len(gr):.1%}." if gr else ".")
                + (" Stopped by the stop rule." if p.get("state") == "stopped" else ""))
        out.append({"name": p["name"], "picks": len(gr), "wins": w, "losses": len(gr) - w,
                    "roi": round(prof / cost, 4) if cost else None, "vs_kalshi_note": note})
    return out


def lessons(cands, res, v):
    out = []
    for cid, c in cands.items():
        r = res.get(cid)
        if not r or (v.get(cid) or {}).get("fail_reason") == "error":
            continue
        e = [g["effect"] for g in r["gates"]]
        par = c.get("parent")
        if par:
            pr = res.get(par)
            if not pr:
                continue
            d = [a - b for a, b in zip(e, [g["effect"] for g in pr["gates"]])]
            vs = f"vs {cands[par]['name']}"
        else:
            d = e
            vs = "vs the line-only baseline"
        if all(x > 0 for x in d):
            kind, word = "helped", "helped in every gate"
        elif d[0] > 0 and d[2] < C.FADE_NEEDED * d[0]:
            kind, word = "faded", f"helped in {gate_names()[0]}, then faded"
        else:
            kind, word = "no_effect", "no consistent effect"
        txt = (f"{c['name']} {vs}: {word} ({' / '.join(f'{x:+.2f}' for x in d)} pts in "
               f"{' / '.join(gate_names())}).")
        out.append({"text": txt, "kind": kind, "candidates": [cid]})
    order = {"helped": 0, "faded": 1, "no_effect": 2}
    return sorted(out, key=lambda x: order[x["kind"]])


MAX_RUNS = 10


def secs_between(a, b):
    try:
        t0 = dt.datetime.fromisoformat(a.replace("Z", "+00:00"))
        t1 = dt.datetime.fromisoformat(b.replace("Z", "+00:00"))
        return max(0, int((t1 - t0).total_seconds()))
    except (AttributeError, ValueError):
        return None


def sg(x, d=2, sign="+"):
    v = IG.fnum(x)
    return "—" if v is None else f"{v:{sign}.{d}f}"


def runs(ledger, cands, v):
    """The latest runs as timelines, newest first: lab runs from the ledger (every attempt has its time and run),
    sealed exams from exam/EXAMS.csv. Nothing new is stored; the ledger stays the record."""
    groups = {}
    for r in ledger:
        if r["sport"] != C.SPORT:
            continue
        key = r["run_url"] or r["run_number"] or r["run_at"][:13]          # local runs: group by the hour
        groups.setdefault(key, []).append(r)
    out = []
    fx = lambda x: IG.fnum(x)
    for rows in groups.values():
        steps, reasons = [], {}
        for r in rows:
            cid = r["candidate_id"]
            name = cands[cid]["name"] if cid in cands else cid
            if r["status"] != "done":
                text = f"crashed: {r['error'][:140]}"
            else:
                text = (f"pooled {sg(r['effect_pooled'])} pts [{sg(r['ci_lo'])}, {sg(r['ci_hi'])}] · "
                        f"gates {' / '.join(sg(r[f'g{k}_effect']) for k in (1, 2, 3))}")
            ver = v.get(cid) or {}
            latest = ver.get("attempt") == int(r["attempt"])
            state = ver.get("state", "failed") if latest else ("failed" if r["status"] != "done" else "info")
            fr = ver.get("fail_reason", "") if latest else ""
            if latest:
                reasons[fr or state] = reasons.get(fr or state, 0) + 1
            gates = [None if IG.fnum(r[f"g{k}_effect"]) is None else IG.fnum(r[f"g{k}_effect"]) > 0 for k in (1, 2, 3)]
            steps.append({"at": r["run_at"], "id": cid, "name": name, "text": text, "state": state, "fail_reason": fr,
                          "gates": gates})
        passes = sum(1 for s_ in steps if s_["state"] in PASSED_LAB)
        why = ", ".join(f"{n} {k.replace('_', ' ')}" for k, n in sorted(reasons.items(), key=lambda x: -x[1])
                        if k not in PASSED_LAB)
        first, last = rows[0], rows[-1]
        num = int(fx(first["run_number"])) if fx(first["run_number"]) else None
        out.append({"kind": "lab", "name": "Research Lab" + (f" #{num}" if num else " (local)"),
                    "started_at": first["run_at"], "finished_at": last["run_at"],
                    "duration_s": secs_between(first["run_at"], last["run_at"]), "run_number": num,
                    "run_url": first["run_url"] or None,
                    "summary": f"{len(steps)} tested · {passes} passed the lab" + (f" · failed: {why}" if why else ""),
                    "steps": steps})
    exams = {}
    for x in IG.read_csv(C.EXAMS):
        exams.setdefault(x["exam_no"], []).append(x)
    for no, rows in exams.items():
        cid = rows[0]["candidate_id"]
        name = cands[cid]["name"] if cid in cands else cid
        steps = []
        for x in rows:
            if x["event"] == "registered":
                steps.append({"at": x["at"], "id": cid, "name": name, "state": "info", "fail_reason": "",
                              "text": f"exam {no} of {C.EXAM_BUDGET} spent on the best lab pass (before any sealed data)"})
            elif x["event"] == "scored":
                ok = x["passed"] == "true"
                steps.append({"at": x["at"], "id": cid, "name": name, "state": "exam_pass" if ok else "exam_fail",
                              "fail_reason": "", "text": f"{x['sealed_season']}: {sg(x['effect'])} pts "
                              f"[{sg(x['ci_lo'])}, {sg(x['ci_hi'])}], p = {sg(x['p_one_sided'], 4, '')} "
                              f"(needs < {sg(x['alpha'], 4, '')})"})
            else:
                steps.append({"at": x["at"], "id": cid, "name": name, "state": "exam_fail", "fail_reason": "error",
                              "text": f"crashed (the exam is still spent): {x['note'][:140]}"})
        done = [s_ for s_ in steps if s_["state"] in ("exam_pass", "exam_fail")]
        out.append({"kind": "exam", "name": f"Sealed exam {no}", "started_at": rows[0]["at"],
                    "finished_at": rows[-1]["at"] if done else None,
                    "duration_s": secs_between(rows[0]["at"], rows[-1]["at"]) if done else None,
                    "run_number": None, "run_url": rows[-1]["run_url"] or None,
                    "summary": (f"{name}: " + ("passed" if done[0]["state"] == "exam_pass" else "failed")) if done
                    else f"{name}: being scored", "steps": steps})
    out.sort(key=lambda r: r["started_at"], reverse=True)
    return out[:MAX_RUNS]


def build(running=(), started_at=None, gate_now=1):
    cands = L.load_candidates()
    ledger = L.read_ledger()
    v = IG.verdicts(ledger, cands)
    res = {cid: IG.results(cid) for cid in cands}
    res = {k: x for k, x in res.items() if x}
    attempts = sum(1 for r in ledger if r["sport"] == C.SPORT)
    running = list(running)
    eta = None
    if started_at and running:
        t = dt.datetime.fromisoformat(started_at.replace("Z", "+00:00"))
        eta = (t + dt.timedelta(minutes=MINUTES_PER_CANDIDATE * len(running))).strftime("%Y-%m-%dT%H:%M:%SZ")
    entries = [candidate_entry(c, res.get(cid), v.get(cid), running, gate_now, started_at, eta, attempts)
               for cid, c in cands.items()]
    gadj, gn = global_holm()
    for e in entries:                                   # C4: reported next to the sport's own correction, never used
        at = (v.get(e["id"]) or {}).get("attempt")
        if e["pooled"] is not None:
            e["pooled"]["adj_p_all_sports"] = gadj.get((C.SPORT, at)) if at else None
    states = [x["state"] for x in entries]
    used = IG.budget_used()
    status = {
        "updated_at": L.now(), "scope": C.SPORT, "effect_name": "Edge beyond the closing line", "effect_unit": "pts",
        "note": "Expected result: most likely nothing passes the sealed exam (Constitution, first page).",
        "exam_name": f"Sealed {C.SEALED_SEASON} exam",
        "sport": C.SPORT, "sport_name": SPORT_NAMES.get(C.SPORT, C.SPORT),
        "attempts": {"this_sport": attempts, "all_sports": gn,
                     "note": f"Holm correction over this sport's {attempts} attempts decides; across all sports "
                             f"there are {gn} attempts (reported only)."},
        "constitution": {"version": C.CONSTITUTION_VERSION, "sha256": L.constitution_sha()},
        "links": {"constitution": C.BLOB + C.CONSTITUTION, "ledger": C.BLOB + L.rel(C.LEDGER),
                  "lessons": C.BLOB + L.rel(lessons_md_path())},
        "counts": {"tried": len({r["candidate_id"] for r in ledger if r["sport"] == C.SPORT} & set(cands)),
                   "running": states.count("running"),
                   "lab_pass": sum(s in PASSED_LAB for s in states), "exam_pass": sum(s in PASSED_EXAM for s in states),
                   "exam_budget_left": max(0, C.EXAM_BUDGET - used), "exam_budget_total": C.EXAM_BUDGET},
        "candidates": entries,
        "lessons": lessons(cands, res, v),
        "promoted": paper_summary(),
        "runs": runs(ledger, cands, v),
    }
    if running:                                        # the run in progress, at the top of the timeline
        status["runs"].insert(0, {"kind": "lab", "name": "Research Lab" + (f" #{L.run_info()[0]}" if L.run_info()[0] else ""),
                                  "started_at": started_at, "finished_at": None, "duration_s": None,
                                  "run_number": L.run_info()[0], "run_url": L.run_info()[1],
                                  "summary": f"{len(running)} candidate(s) running through the three gates",
                                  "steps": [{"at": started_at, "id": cid, "name": cands[cid]["name"], "text": "waiting",
                                             "state": "running" if i == 0 else "queued", "fail_reason": ""}
                                            for i, cid in enumerate(running)]})
        status["runs"] = status["runs"][:MAX_RUNS]
    return status, ledger


def status_md(s, ledger):
    c = s["counts"]
    lines = [
        f"# Research Lab -- status ({SPORT_NAMES.get(C.SPORT, C.SPORT)})", "",
        f"_Generated {s['updated_at']} by research/lab/report.py. Constitution {s['constitution']['version']} "
        f"(`{s['constitution']['sha256'][:12]}`). Do not edit by hand._", "",
        f"**Expected result: most likely nothing passes the sealed exam.** Effect = cover points per game beyond the "
        f"line-only baseline (Constitution A5); break-even at Kalshi pricing {C.COST:.2%}.", "",
        f"- Candidates: {len(s['candidates'])} registered, {c['tried']} tried, {c['running']} running",
        f"- Ledger attempts (all count in the Holm correction): {sum(1 for r in ledger if r['sport'] == C.SPORT)} "
        f"· across all sports: {s['attempts']['all_sports']} (reported only, Constitution C4)",
        f"- Lab passes: {c['lab_pass']} · exam passes: {c['exam_pass']} · sealed {C.SEALED_SEASON} exams left: "
        f"{c['exam_budget_left']} of {c['exam_budget_total']}", "",
        "| Candidate | Market | State | " + " | ".join(gate_names()) + " | Pooled [95% CI] | Holm p | Picks win% / ROI |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    f = lambda x: "—" if x is None else f"{x:+.2f}"
    for e in s["candidates"]:
        g = e["gates"]
        p = e["pooled"] or {}
        k = e["kalshi"] or {}
        pooled = "—" if p.get("effect") is None else f"{p['effect']:+.2f} [{p['ci'][0]:+.2f}, {p['ci'][1]:+.2f}]"
        kal = "—" if not k.get("picks") else f"{k['win_rate']:.1%} / {k['roi']:+.1%} ({k['picks']})"
        state = e["state"] + (f" · {e['fail_reason']}" if e["fail_reason"] else "")
        holm = "—" if p.get("adj_p") is None else f"{p['adj_p']:.3f}"
        lines.append(f"| `{e['id']}` {e['name']} | {e['market']} | {state} | {f(g[0]['effect'])} | {f(g[1]['effect'])} | "
                     f"{f(g[2]['effect'])} | {pooled} | {holm} | {kal} |")
    lines += ["", "Verdicts (Inspector General):", ""]
    lines += [f"- `{e['id']}`: {e['verdict'] or 'not run yet'}" for e in s["candidates"]]
    if s["promoted"]:
        lines += ["", "## Promoted, not proven", ""] + [f"- **{p['name']}**: {p['vs_kalshi_note']}" for p in s["promoted"]]
    if s["runs"]:
        lines += ["", "## Recent runs", ""]
        for r in s["runs"][:5]:
            took = "" if r["duration_s"] is None else f", {r['duration_s']} s"
            lines.append(f"- **{r['name']}** {r['started_at']}{took}: {r['summary']}")
    lines += ["", f"Files: `{L.rel(C.RESULTS)}/<id>.json` (every number), `{L.rel(C.LEDGER)}` (every attempt), "
              f"`{L.rel(lessons_md_path())}` (exploratory)."]
    return "\n".join(lines) + "\n"


def lessons_md(s):
    lines = [f"# Research Lab -- lessons, {SPORT_NAMES.get(C.SPORT, C.SPORT)} (EXPLORATORY)", "",
             f"_Generated {s['updated_at']} by research/lab/report.py after each run. **Exploratory, not proof**: each "
             "line compares a candidate with the one it builds on, gate by gate, with no correction for how many "
             "comparisons there are. Only the Inspector General's verdicts and the sealed exam decide anything._", "",
             f"- **helped**: beat its parent in all three gates · **faded**: helped in {gate_names()[0]} but by less "
             f"than half as much (or not at all) in {gate_names()[-1]} · **no effect**: anything else", ""]
    for kind, title in (("helped", "Helped"), ("faded", "Faded"), ("no_effect", "No effect")):
        xs = [x for x in s["lessons"] if x["kind"] == kind]
        lines += [f"## {title} ({len(xs)})", ""] + ([f"- {x['text']}" for x in xs] or ["- none"]) + [""]
    return "\n".join(lines)


def write_all(running=(), started_at=None, gate_now=1):
    """Rebuild every sport's block (only the sport in use can be running) and write status.json, plus the sport in
    use's STATUS.md and LESSONS.md."""
    me = C.SPORT
    keep = {k: getattr(C, k) for k in dir(C) if k.isupper()}
    blocks = {}
    s, ledger = build(running, started_at, gate_now)
    blocks[me] = s
    path = status_md_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(status_md(s, ledger))
    with open(lessons_md_path(), "w") as f:
        f.write(lessons_md(s))
    try:
        for sp in C.SPORTS:
            if sp == me:
                continue
            C.use(sp)
            if os.path.isdir(C.CANDIDATES):
                blocks[sp] = build()[0]
    finally:
        for k, v in keep.items():
            setattr(C, k, v)
    order = [sp for sp in C.SPORTS if sp in blocks]
    top = dict(blocks["NFL"]) if "NFL" in blocks else dict(blocks[order[0]])
    top["by_sport"] = {sp: blocks[sp] for sp in order if sp != top["sport"]}
    top["sports"] = [{"key": sp, "name": SPORT_NAMES.get(sp, sp)} for sp in order]
    with open(C.STATUS_JSON, "w") as f:
        json.dump(top, f, indent=1, ensure_ascii=False)
        f.write("\n")
    return s
