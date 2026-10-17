"""Run the testing chamber.

    python scripts/chamber.py test momentum     # train + validation; writes reports/chamber/momentum_validation.md
    python scripts/chamber.py test-all          # the four first signals, one after another
    python scripts/chamber.py vault momentum    # ONE final vault run; only if validation passed
    python scripts/chamber.py count             # how many tests have been run
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from trader.chamber.chamber import SINGLE, Chamber  # noqa: E402
from trader.chamber.registry import Registry  # noqa: E402


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 1
    cmd = argv[0]
    if cmd == "count":
        r = Registry()
        print(f"{r.total_runs()} runs, {len(r.candidates_tried())} distinct candidates: {r.candidates_tried()}")
        return 0
    ch = Chamber.from_cache()
    names = list(SINGLE) if cmd == "test-all" else argv[1:2]
    for n in names:
        if n not in SINGLE:
            print(f"unknown signal {n}; choose from {list(SINGLE)}")
            return 1
        out = ch.vault_test(SINGLE[n]) if cmd == "vault" else ch.evaluate(SINGLE[n])
        v = out["verdict"]
        print(f"{n}: {'PASSED' if v['passed'] else 'FAILED'}  (deflated Sharpe {v['dsr']:.2f})")
        for k, ok in v["checks"].items():
            print(f"   {'yes' if ok else 'NO '}  {k}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
