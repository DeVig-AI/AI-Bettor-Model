"""One entry point, so you never have to remember script paths.

    trader probe                  check what the free FMP plan gives (about 8 requests)
    trader download [--status]    today's data batch (or just show progress)
    trader test-signals           run the four signals through the chamber
    trader chamber ...            e.g. trader chamber test momentum | vault momentum | count
    trader owner status|stop|restart
    trader amend status|propose|approve|approve-initial
    trader autostart [--yes]      run the download every day by itself
    trader selftest [--all]       run the tests (fast by default, --all takes ~5 min)
"""
from __future__ import annotations

import runpy
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = {"probe": "probe_fmp.py", "download": "download.py", "chamber": "chamber.py",
           "owner": "owner.py", "autostart": "install_autostart.py"}


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help", "help"):
        print(__doc__)
        return 0
    cmd, rest = argv[0], argv[1:]
    sys.path.insert(0, str(ROOT))
    if cmd == "test-signals":
        cmd, rest = "chamber", ["test-all"]
    if cmd in SCRIPTS:
        sys.argv = [SCRIPTS[cmd], *rest]
        try:
            runpy.run_path(str(ROOT / "scripts" / SCRIPTS[cmd]), run_name="__main__")
        except SystemExit as e:
            return int(e.code or 0)
        except (ValueError, FileNotFoundError, PermissionError) as e:
            print(f"Stopped: {e}")  # plain message instead of a traceback
            return 1
        return 0
    if cmd == "amend":
        from trader import amend
        return amend.main(rest)
    if cmd == "selftest":
        args = [sys.executable, "-m", "pytest", "-q"]
        if "--all" not in rest:
            args.append("--ignore=tests/test_chamber.py")
        return subprocess.call(args, cwd=ROOT)
    print(f"unknown command {cmd!r}\n{__doc__}")
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
