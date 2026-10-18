#!/usr/bin/env python3
"""
frozen_guard.py -- keeps the paper tests' frozen files and recorded results from being changed by accident.

FROZEN.sha256 (repo root) lists two kinds of entries:
  <sha256>  <path>        a frozen file: models, tables, preregs, pick / grading code, training data
  append-only  <path>     a results database: new rows and filling in empty fields (grading) are fine,
                          changing or deleting a recorded value is not

Checks:
  1. every frozen file still has the fingerprint in FROZEN.sha256;
  2. between --base and HEAD, a frozen entry whose fingerprint changed or that was removed from the list must be
     named in a line added to FROZEN_CHANGES.md in the same change (the dated log the preregs ask for);
  3. between --base and HEAD, no append-only database lost a row or had a recorded value changed, except the few
     changes the bots make by design (ALLOWED below). A database named in an added FROZEN_CHANGES.md line is
     reported but does not fail.

Usage:
  python3 tools/frozen_guard.py check --base <git ref>   # what the GitHub workflow runs
  python3 tools/frozen_guard.py check                    # fingerprints only
  python3 tools/frozen_guard.py rehash <path> [...]      # after a logged change: write the new fingerprints
"""
import argparse
import hashlib
import os
import sqlite3
import subprocess
import sys
import tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MANIFEST = "FROZEN.sha256"
LOG = "FROZEN_CHANGES.md"
APPEND = "append-only"

# Changes the bots make on purpose, per (database basename, table):
#   "skip": the table is a cache, not results
#   "free_rows_where": (column, value) -- a row whose base value is this may be re-written (e.g. a SKIP retried)
#   "settle": columns that may move away from a "not yet" value (0 / -1 = ungraded / stale) to a final one
ALLOWED = {
    ("WEATHER_TOTALS_LIVE_V1.sqlite3", "geocache"): {"skip": True},
    ("WEATHER_TOTALS_LIVE_V2.sqlite3", "geocache"): {"skip": True},
    ("WEATHER_TOTALS_LIVE_V1.sqlite3", "games"): {"free_rows_where": ("pick", "SKIP")},
    ("WEATHER_TOTALS_LIVE_V2.sqlite3", "games"): {"free_rows_where": ("pick", "SKIP")},
    ("PROSPECTIVE_TRACKER_V1_1.sqlite3", "picks"): {"settle": {"graded": (0, -1)}},
    ("MLB_PROSPECTIVE_TRACKER_V1.sqlite3", "picks"): {"settle": {"graded": (0, -1)}},
    ("MLB_PROSPECTIVE_TRACKER_V1.sqlite3", "spread_picks"): {"settle": {"graded": (0, -1)}},
    ("NBA_PROSPECTIVE_TRACKER_V1.sqlite3", "picks"): {"settle": {"graded": (0, -1)}},
}


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def git(*args, binary=False):
    r = subprocess.run(["git", *args], cwd=ROOT, capture_output=True)
    if r.returncode != 0:
        return None
    return r.stdout if binary else r.stdout.decode("utf-8", "replace")


def parse(text):
    """{path: sha256 or 'append-only'} from manifest text."""
    out = {}
    for line in (text or "").splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        kind, path = line.split("  ", 1)
        out[path.strip()] = kind.strip()
    return out


def added_log_lines(base):
    diff = git("diff", "--unified=0", base, "HEAD", "--", LOG) or ""
    return [l[1:] for l in diff.splitlines() if l.startswith("+") and not l.startswith("+++")]


def logged(path, lines):
    return any(path in l or os.path.basename(path) in l for l in lines)


def check_files(entries):
    bad = []
    for path, kind in entries.items():
        if kind == APPEND:
            continue                                 # databases are compared with the base in check_dbs
        full = os.path.join(ROOT, path)
        if not os.path.exists(full):
            bad.append(f"{path}: frozen file is missing")
        elif sha(full) != kind:
            bad.append(f"{path}: changed (fingerprint {sha(full)[:12]}, locked {kind[:12]}). Undo it, or log the change "
                       f"in {LOG} and run tools/frozen_guard.py rehash")
    return bad


def check_manifest_changes(base_entries, entries, lines):
    bad = []
    for path, kind in base_entries.items():
        now = entries.get(path)
        if now == kind:
            continue
        what = "removed from the lock list" if now is None else "re-locked with a new fingerprint"
        if not logged(path, lines):
            bad.append(f"{path}: {what} without a dated line naming it in {LOG}")
    return bad


def table_rows(conn, table):
    cols = [r[1] for r in conn.execute(f'PRAGMA table_info("{table}")')]
    pk = [r[1] for r in sorted(conn.execute(f'PRAGMA table_info("{table}")'), key=lambda r: r[5]) if r[5] > 0]
    rows = [dict(zip(cols, r)) for r in conn.execute(f'SELECT * FROM "{table}"')]
    return cols, pk, rows


def compare_db(name, base_path, head_path):
    """Problems where HEAD lost or rewrote rows that existed at base."""
    problems = []
    b, h = sqlite3.connect(base_path), sqlite3.connect(head_path)
    tables = [r[0] for r in b.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
    head_tables = {r[0] for r in h.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    for t in tables:
        rule = ALLOWED.get((name, t), {})
        if rule.get("skip"):
            continue
        if t not in head_tables:
            problems.append(f"table {t} was dropped"); continue
        bcols, pk, brows = table_rows(b, t)
        hcols, _, hrows = table_rows(h, t)
        gone = [c for c in bcols if c not in hcols]
        if gone:
            problems.append(f"table {t}: columns removed {gone}"); continue
        if not pk:                                  # log tables: every old row must still be there
            have = {}
            for r in hrows:
                k = tuple(r[c] for c in bcols)
                have[k] = have.get(k, 0) + 1
            for r in brows:
                k = tuple(r[c] for c in bcols)
                if have.get(k, 0):
                    have[k] -= 1
                else:
                    problems.append(f"table {t}: row deleted or changed: {dict(zip(bcols, k))}"[:300])
            continue
        hk = {tuple(r[c] for c in pk): r for r in hrows}
        free = rule.get("free_rows_where")
        settle = rule.get("settle", {})
        for r in brows:
            key = tuple(r[c] for c in pk)
            if free and r.get(free[0]) == free[1]:
                continue
            now = hk.get(key)
            if now is None:
                problems.append(f"table {t}: row {dict(zip(pk, key))} deleted"); continue
            for c in bcols:
                old, new = r[c], now[c]
                if old is None or old == new:
                    continue
                if c in settle and old in settle[c]:
                    continue
                problems.append(f"table {t}: row {dict(zip(pk, key))} column {c} changed {old!r} -> {new!r}"[:300])
    return problems


def check_dbs(base, entries, lines):
    bad, notes = [], []
    for path, kind in entries.items():
        if kind != APPEND:
            continue
        old = git("show", f"{base}:{path}", binary=True)
        if old is None:
            continue                                 # new database: nothing recorded yet
        head = os.path.join(ROOT, path)
        if not os.path.exists(head):
            (notes if logged(path, lines) else bad).append(f"{path}: results database was deleted")
            continue
        with tempfile.NamedTemporaryFile(suffix=".sqlite3", delete=False) as f:
            f.write(old)
        try:
            problems = compare_db(os.path.basename(path), f.name, head)
        finally:
            os.unlink(f.name)
        if problems:
            target = notes if logged(path, lines) else bad
            target += [f"{path}: {p}" for p in problems[:20]]
            if len(problems) > 20:
                target.append(f"{path}: ... and {len(problems) - 20} more")
    return bad, notes


def summary(lines):
    out = os.environ.get("GITHUB_STEP_SUMMARY")
    if out:
        with open(out, "a") as f:
            f.write("\n".join(lines) + "\n")


def cmd_check(a):
    entries = parse(open(os.path.join(ROOT, MANIFEST)).read())
    bad = check_files(entries)
    notes = []
    if a.base:
        if git("rev-parse", "--verify", a.base + "^{commit}") is None:
            sys.exit(f"base {a.base!r} is not a commit in this checkout (fetch more history)")
        lines = added_log_lines(a.base)
        bad += check_manifest_changes(parse(git("show", f"{a.base}:{MANIFEST}")), entries, lines)
        db_bad, notes = check_dbs(a.base, entries, lines)
        bad += db_bad
    n_files = sum(1 for k in entries.values() if k != APPEND)
    n_dbs = len(entries) - n_files
    head = f"Frozen guard: {n_files} locked files, {n_dbs} results databases" + (f", compared with {a.base}" if a.base else "")
    report = [f"## {head}", ""]
    if notes:
        report += ["Logged database changes (allowed, listed for the record):", ""] + [f"- {n}" for n in notes] + [""]
    if bad:
        report += ["**Blocked:** these test files or results changed without a logged reason:", ""] + [f"- {b}" for b in bad]
        report += ["", f"If a change is intended (a pipeline bug fix), add a dated line to {LOG} naming the file, "
                       "then run `python3 tools/frozen_guard.py rehash <file>` and commit both."]
    else:
        report.append("Nothing blocked: every other change to locked files or results is logged. ✅" if notes or a.base and
                      added_log_lines(a.base) else "All locked files and recorded results are unchanged. ✅")
    print("\n".join(report))
    summary(report)
    for b in bad:
        print(f"::error title=Frozen test file changed::{b}")
    return 1 if bad else 0


def cmd_rehash(a):
    path_m = os.path.join(ROOT, MANIFEST)
    text = open(path_m).read().splitlines()
    want = {os.path.relpath(os.path.abspath(p), ROOT) for p in a.paths}
    out, done = [], set()
    for line in text:
        if line.strip() and not line.startswith("#"):
            kind, path = line.split("  ", 1)
            if path in want and kind != APPEND:
                line = f"{sha(os.path.join(ROOT, path))}  {path}"
                done.add(path)
        out.append(line)
    for p in sorted(want - done):
        out.append(f"{sha(os.path.join(ROOT, p))}  {p}")
        print("added", p)
    open(path_m, "w").write("\n".join(out) + "\n")
    print(f"re-locked {len(done)} file(s), added {len(want - done)}")
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest="cmd", required=True)
    c = sp.add_parser("check"); c.add_argument("--base")
    r = sp.add_parser("rehash"); r.add_argument("paths", nargs="+")
    a = ap.parse_args()
    return cmd_check(a) if a.cmd == "check" else cmd_rehash(a)


if __name__ == "__main__":
    sys.exit(main())
