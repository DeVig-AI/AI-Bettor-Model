"""Research Lab runner (Constitution A2-A7, Part B). Deterministic; no AI anywhere.

    python3 -m research.lab.lab pending          # how many candidates this run will take (prints a number, <= 18)
    python3 -m research.lab.lab start            # pull the next ones from research/queue/ and mark them running in
                                                 # research/status.json (the workflow pushes both before the run)
    python3 -m research.lab.lab run [--rerun ID] # run them (at most 18) through the three gates
    ... --sport CFB                              # college football (Part C; files under research/cfb/)
    ... --sport NBA|NHL|MLB                      # Part D (files under research/nba/, research/nhl/, research/mlb/)

`run` writes research/results/<id>.json, appends one research/LEDGER.csv row per attempt (never edits one), and
locks each candidate file that ran into FROZEN.sha256. The Inspector General's review (inspector.py) then judges.
"""
import argparse
import csv
import datetime as dt
import hashlib
import json
import os
import subprocess
import sys
import traceback

import numpy as np
import yaml

from . import config as C
from . import data as D
from . import metrics as M
from . import models

LEDGER_COLS = ["attempt", "sport", "candidate_id", "market", "run_at", "status", "constitution_version",
               "constitution_sha256", "candidate_sha256", "code_sha256", "data_sha256", "git_commit", "run_number",
               "run_url", "games_pooled", "effect_pooled", "ci_lo", "ci_hi", "p_one_sided", "g1_effect", "g2_effect",
               "g3_effect", "error"]
REQUIRED = ["id", "name", "market", "family", "parent", "reason", "model"]
CODE_FILES = ["config.py", "data.py", "cfb_data.py", "sbr_data.py", "sdv_data.py", "models.py", "metrics.py", "lab.py", "search.py",
              "signals.py"]


def dm():
    """The data module for the sport in use (Part B1 nflverse, Part C1 CollegeFootballData, Part D1 the archive)."""
    if C.SPORT == "CFB":
        from . import cfb_data
        return cfb_data
    if C.SPORT in ("NBA", "NHL", "MLB"):
        from . import sbr_data
        return sbr_data
    return D


def now():
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def sha_text(b):
    return hashlib.sha256(b).hexdigest()


def git(*args):
    r = subprocess.run(["git", *args], cwd=C.ROOT, capture_output=True, text=True)
    return r.returncode, r.stdout.strip()


# ---- the Constitution's lock -----------------------------------------------------------------------------------------
def constitution_sha():
    return D.sha_file(os.path.join(C.ROOT, C.CONSTITUTION))


def locked_sha(path):
    with open(os.path.join(C.ROOT, "FROZEN.sha256")) as f:
        lines = f.read().splitlines()
    for line in lines:
        if line.strip() and not line.startswith("#"):
            kind, p = line.split("  ", 1)
            if p == path:
                return kind
    return None


def check_constitution():
    got, want = constitution_sha(), locked_sha(C.CONSTITUTION)
    if want is None:
        raise SystemExit(f"{C.CONSTITUTION} is not locked in FROZEN.sha256: the lab does not run without it")
    if got != want:
        raise SystemExit(f"{C.CONSTITUTION} fingerprint {got[:12]} does not match its lock {want[:12]}: refusing to run")
    return got


def code_sha():
    h = hashlib.sha256()
    for f in CODE_FILES:
        with open(os.path.join(os.path.dirname(__file__), f), "rb") as fh:
            h.update(fh.read())
    return h.hexdigest()


# ---- candidates and ledger ------------------------------------------------------------------------------------------
def cand_path(cid):
    return os.path.join(C.CANDIDATES, f"{cid}.yaml")


def rel(path):
    return os.path.relpath(path, C.ROOT)


def load_candidates():
    out = {}
    for f in sorted(os.listdir(C.CANDIDATES)) if os.path.isdir(C.CANDIDATES) else []:
        if not f.endswith(".yaml"):
            continue
        with open(os.path.join(C.CANDIDATES, f)) as fh:
            c = yaml.safe_load(fh)
        missing = [k for k in REQUIRED if k not in c]
        if missing:
            raise SystemExit(f"candidate {f}: missing {missing}")
        if f != f"{c['id']}.yaml":
            raise SystemExit(f"candidate {f}: id {c['id']!r} must match the file name")
        if c["market"] not in C.MARKETS:
            raise SystemExit(f"candidate {f}: market must be one of {', '.join(C.MARKETS)} for {C.SPORT}")
        out[c["id"]] = c
    for c in out.values():
        if c["parent"] is not None and c["parent"] not in out:
            raise SystemExit(f"candidate {c['id']}: parent {c['parent']!r} is not registered")
    return out


def read_ledger(path=None):
    path = path or C.LEDGER
    if not os.path.exists(path):
        return []
    with open(path, newline="") as f:
        return list(csv.DictReader(f))


def append_ledger(row, path=None):
    path = path or C.LEDGER
    new = not os.path.exists(path)
    with open(path, "a", newline="") as f:
        w = csv.DictWriter(f, fieldnames=LEDGER_COLS, lineterminator="\n")
        if new:
            w.writeheader()
        w.writerow({k: ("" if row.get(k) is None else row.get(k)) for k in LEDGER_COLS})


def pending(cands, ledger, rerun=None):
    ran = {r["candidate_id"] for r in ledger if r["sport"] == C.SPORT}
    ids = [cid for cid in cands if cid not in ran]
    if rerun:
        if rerun not in cands:
            raise SystemExit(f"--rerun {rerun}: no such candidate")
        last = [r for r in ledger if r["candidate_id"] == rerun]
        if last and last[-1]["status"] != "error":
            raise SystemExit(f"--rerun {rerun}: its last attempt finished; only a crashed attempt may be re-run")
        if rerun not in ids:
            ids.append(rerun)
    return ids


def queued():
    """[(order, id, path)] waiting in research/queue/, in order (Constitution v2 A3.3a)."""
    out = []
    if os.path.isdir(C.QUEUE):
        for f in sorted(os.listdir(C.QUEUE)):
            if f.endswith(".yaml") and "-" in f and f.split("-", 1)[0].isdigit():
                out.append((int(f.split("-", 1)[0]), f.split("-", 1)[1][:-5], os.path.join(C.QUEUE, f)))
    return out


def take_from_queue(cands, ledger, log=print):
    """Move the next queued ideas into research/candidates/ so this run has up to BATCH to run. Returns their ids."""
    room = C.BATCH - len(pending(cands, ledger))
    moved = []
    for _, cid, path in queued()[:max(0, room)]:
        dest = cand_path(cid)
        if os.path.exists(dest):
            raise SystemExit(f"queue: {cid} is already a registered candidate; give the queued idea a new id")
        os.rename(path, dest)
        moved.append(cid)
        log(f"queue -> candidates: {cid}")
    return moved


def committed(path):
    """A3.1: the file is tracked and identical to the committed version (so it was committed before this run)."""
    rp = rel(path)
    code, _ = git("ls-files", "--error-unmatch", rp)
    if code != 0:
        return False, "not committed"
    code, _ = git("diff", "--quiet", "HEAD", "--", rp)
    if code != 0:
        return False, "changed since its commit"
    return True, ""


# ---- one candidate through the gates --------------------------------------------------------------------------------
def score(out, s0_from=None):
    """Eligible games (line and result known) with d = forecast - line, r = actual - line."""
    e = out[out.line.notna() & out.actual.notna() & ~out.season.isin(C.SKIP_SEASONS)].copy()
    if not np.isfinite(e.forecast).all():
        raise ValueError(f"{int((~np.isfinite(e.forecast)).sum())} eligible games have no forecast")
    e["d"] = e.forecast - e.line
    e["r"] = e.actual - e.line
    return e


def between(e, a, b):
    return e[(e.season >= a) & (e.season <= b)]


def split_mask(e, kind):
    """Rows of the extra reported splits (Part C2): line size, regular season vs postseason."""
    return {"line_small": e.line.abs() <= 14, "line_big": e.line.abs() > 14,
            "regular": e.game_type == "REG", "post": e.game_type != "REG"}[kind]


def price_of(c, e):
    """The home side's closing price per game, for moneyline pick pricing (Part D3); None for spreads and totals."""
    return (e.line.values / 100) if c["market"] == "moneyline" else None


def evaluate_candidate(c, data):
    out, fit = models.run(c, data)
    e = score(out)
    if int(e.season.max()) > C.LAB_MAX_SEASON:
        raise dm().SealedDataError("sealed season in the lab's results")
    tr = between(e, *C.TRAIN)
    s0 = M.baseline_side(tr.r.values)
    res = {"baseline": {"side": s0, "train_mean_cover": round(float(tr.r.mean()), 4), "train_games": len(tr),
                        "meaning": "line-only baseline takes this side on every game (+1 home/over, -1 away/under)"},
           "train": M.evaluate(tr.d, tr.r, s0, with_ci=False, price=price_of(c, tr)), "gates": [], "rule_split": [],
           "fit": fit}
    for name, a, b in C.GATES:
        g = between(e, a, b)
        res["gates"].append(dict(name=name, seasons=[a, b], **M.evaluate(g.d, g.r, s0, price=price_of(c, g))))
    name, a, b = C.POOLED
    g = between(e, a, b)
    res["pooled"] = dict(name=name, seasons=[a, b], **M.evaluate(g.d, g.r, s0, price=price_of(c, g)))
    for label, a, b, note in C.RULE_SPLITS:
        g = between(e, a, b)
        res["rule_split"].append(dict(label=label, seasons=[a, b], note=note,
                                      **M.evaluate(g.d, g.r, s0, with_ci=False, price=price_of(c, g))))
    pooled = between(e, *C.POOLED[1:])
    for label, kind, note in C.EXTRA_SPLITS:
        g = pooled[split_mask(pooled, kind).values]
        res["rule_split"].append(dict(label=label, seasons=list(C.POOLED[1:]), note=note,
                                      **M.evaluate(g.d, g.r, s0, with_ci=False, price=price_of(c, g))))
    return res


def lock_candidate(cid):
    subprocess.run([sys.executable, os.path.join(C.ROOT, "tools", "frozen_guard.py"), "rehash", rel(cand_path(cid))],
                   cwd=C.ROOT, check=True, capture_output=True)


def run_info():
    n = os.environ.get("GITHUB_RUN_NUMBER")
    rid = os.environ.get("GITHUB_RUN_ID")
    url = f"https://github.com/{C.REPO}/actions/runs/{rid}" if rid else None
    return (int(n) if n else None), url


def run_all(rerun=None, log=print):
    csha = check_constitution()
    cands = load_candidates()
    ledger = read_ledger()
    ids = pending(cands, ledger, rerun)[:C.BATCH]
    if not ids:
        log("nothing to run: every registered candidate has a ledger row")
        return []
    data = dm().load_lab()
    blocked = dm().blocked_markets(data) if hasattr(dm(), "blocked_markets") else set()
    if blocked:                                       # C1 line-coverage gate: refuse, never shrink the seasons
        log(f"::warning title=Research Lab::line coverage under 70% in a training or gate season for "
            f"{sorted(blocked)}: those candidates do not run (Constitution C1)")
        ids = [cid for cid in ids if cands[cid]["market"] not in blocked]
    dsha, ksha = dm().data_fingerprint(), code_sha()
    _, head = git("rev-parse", "HEAD")
    number, url = run_info()
    os.makedirs(C.RESULTS, exist_ok=True)
    done = []
    for cid in ids:
        c = cands[cid]
        path = cand_path(cid)
        attempt = len(read_ledger()) + 1
        row = dict(attempt=attempt, sport=C.SPORT, candidate_id=cid, market=c["market"], run_at=now(),
                   constitution_version=C.CONSTITUTION_VERSION, constitution_sha256=csha,
                   candidate_sha256=D.sha_file(path), code_sha256=ksha, data_sha256=dsha, git_commit=head,
                   run_number=number, run_url=url)
        ok, why = committed(path)
        try:
            if not ok:
                raise RuntimeError(f"candidate file {why} (Constitution A3.1)")
            res = evaluate_candidate(c, data)
            p = res["pooled"]
            row.update(status="done", games_pooled=p["games"], effect_pooled=p["effect"], ci_lo=p["ci"][0],
                       ci_hi=p["ci"][1], p_one_sided=p["p"], g1_effect=res["gates"][0]["effect"],
                       g2_effect=res["gates"][1]["effect"], g3_effect=res["gates"][2]["effect"])
            doc = {"id": cid, "name": c["name"], "market": c["market"], "family": c["family"], "parent": c["parent"],
                   "reason": c["reason"], "attempt": attempt, "ran_at": row["run_at"],
                   "constitution": {"version": C.CONSTITUTION_VERSION, "sha256": csha},
                   "candidate_sha256": row["candidate_sha256"], "code_sha256": ksha, "data_sha256": dsha,
                   "git_commit": head, "run_number": number, "run_url": url,
                   "effect_definition": ("win-chance points per game beyond the line-only baseline, against the "
                                         "vig-free closing price (Constitution D3)" if c["market"] == "moneyline" else
                                         "cover points per game beyond the line-only baseline (Constitution A5)"),
                   "pricing": ({"price": "the vig-free closing price of the picked side", "fee_rate": C.FEE_RATE}
                               if c["market"] == "moneyline" else {"price": C.PRICE, "fee": C.FEE, "break_even": C.COST}),
                   **res}
            with open(os.path.join(C.RESULTS, f"{cid}.json"), "w") as f:
                json.dump(doc, f, indent=1, ensure_ascii=False)
                f.write("\n")
            log(f"{cid}: pooled {p['effect']:+.3f} pts [{p['ci'][0]:+.3f}, {p['ci'][1]:+.3f}] p={p['p']:.4f}; gates "
                + " / ".join(f"{g['effect']:+.3f}" for g in res["gates"]))
        except Exception as ex:                       # a crash is still an attempt (A6): p = 1
            if isinstance(ex, (D.SealedDataError, dm().SealedDataError)):
                raise
            row.update(status="error", error=f"{type(ex).__name__}: {ex}"[:300])
            log(f"{cid}: ERROR {row['error']}")
            traceback.print_exc()
        append_ledger(row)
        if ok:
            lock_candidate(cid)
        done.append(cid)
    return done


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["pending", "start", "run"])
    ap.add_argument("--rerun", default=None, help="re-run one candidate whose last attempt crashed")
    ap.add_argument("--sport", default=os.environ.get("LAB_SPORT", "NFL"), help="NFL (Part B), CFB (Part C), NBA, NHL or MLB (Part D)")
    a = ap.parse_args(argv)
    C.use(a.sport)
    if C.SUSPENDED:                                  # D1b: nothing runs in a suspended chamber
        print(0 if a.cmd == "pending" else C.SUSPENDED)
        return 0
    if a.cmd == "pending":
        print(min(C.BATCH, len(pending(load_candidates(), read_ledger(), a.rerun or None)) + len(queued())))
        return 0
    if a.cmd == "start":
        from . import report
        check_constitution()
        ledger = read_ledger()
        take_from_queue(load_candidates(), ledger)
        ids = pending(load_candidates(), ledger, a.rerun or None)[:C.BATCH]
        report.write_all(running=ids, started_at=now())
        return 0
    run_all(a.rerun or None)
    return 0


if __name__ == "__main__":
    sys.exit(main())
