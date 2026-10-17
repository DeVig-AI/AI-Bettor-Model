"""Owner-only controls.

    python scripts/owner.py status     # kill switch, pause, constitution, log integrity
    python scripts/owner.py stop       # emergency stop: kill switch on
    python scripts/owner.py restart    # only the owner restarts (asks you to type a phrase)
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from trader import amend  # noqa: E402
from trader.logbook import Logbook  # noqa: E402
from trader.risk_officer import HaltState  # noqa: E402


def main(argv: list[str]) -> int:
    cmd = argv[0] if argv else "status"
    h, log = HaltState(), Logbook()
    if cmd == "status":
        print("Kill switch:", "ON (no trading)" if h.killed() else "off")
        try:
            amend.load_verified()
            print("Constitution: approved and unchanged")
        except amend.ConstitutionError as e:
            print("Constitution:", e)
        print("Decision log:", log.verify()[1])
        return 0
    if cmd == "stop":
        h.kill("owner", "owner pressed stop")
        log.record("owner", "emergency_stop", "owner pressed stop")
        print("Stopped. Nothing will trade until you run: python scripts/owner.py restart")
        return 0
    if cmd == "restart":
        typed = input("Type exactly: I AM THE OWNER AND I RESTART TRADING\n> ")
        h.owner_restart(typed)
        log.record("owner", "restart", "owner restarted trading")
        print("Restarted.")
        return 0
    print(__doc__)
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
