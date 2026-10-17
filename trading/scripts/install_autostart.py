"""Set up the daily data download to run by itself on this computer.

    python scripts/install_autostart.py          # shows what it will do
    python scripts/install_autostart.py --yes    # does it

Detects the OS: Task Scheduler (Windows), launchd (Mac), systemd user timer (Linux).
Runs scripts/download.py every day at 18:30 local time (after the US close), and at
login if a run was missed (computer was off).
"""
from __future__ import annotations

import platform
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PY = sys.executable
SCRIPT = ROOT / "scripts" / "download.py"
LABEL = "trader-daily-download"


def windows() -> list[list[str]]:
    cmd = f'"{PY}" "{SCRIPT}"'
    return [["schtasks", "/Create", "/F", "/TN", LABEL, "/SC", "DAILY", "/ST", "18:30", "/TR", cmd],
            ["schtasks", "/Create", "/F", "/TN", LABEL + "-logon", "/SC", "ONLOGON", "/TR", cmd]]


def mac() -> tuple[Path, str]:
    plist = Path.home() / "Library" / "LaunchAgents" / f"com.{LABEL}.plist"
    body = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.{LABEL}</string>
  <key>ProgramArguments</key><array><string>{PY}</string><string>{SCRIPT}</string></array>
  <key>WorkingDirectory</key><string>{ROOT}</string>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>18</integer><key>Minute</key><integer>30</integer></dict>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>{ROOT}/logs/download.out</string>
  <key>StandardErrorPath</key><string>{ROOT}/logs/download.err</string>
</dict></plist>
"""
    return plist, body


def linux() -> dict[Path, str]:
    d = Path.home() / ".config" / "systemd" / "user"
    return {
        d / f"{LABEL}.service": f"[Unit]\nDescription=Trader daily data download\n\n[Service]\nType=oneshot\n"
                                f"WorkingDirectory={ROOT}\nExecStart={PY} {SCRIPT}\n",
        d / f"{LABEL}.timer": "[Unit]\nDescription=Daily after US close\n\n[Timer]\nOnCalendar=*-*-* 18:30:00\n"
                              "Persistent=true\n\n[Install]\nWantedBy=timers.target\n",
    }


def main() -> int:
    go = "--yes" in sys.argv
    osname = platform.system()
    (ROOT / "logs").mkdir(exist_ok=True)
    if osname == "Windows":
        for c in windows():
            print(" ".join(c))
            if go:
                subprocess.run(c, check=True)
    elif osname == "Darwin":
        plist, body = mac()
        print(f"write {plist}\nlaunchctl load {plist}")
        if go:
            plist.parent.mkdir(parents=True, exist_ok=True)
            plist.write_text(body)
            subprocess.run(["launchctl", "load", str(plist)], check=True)
    elif osname == "Linux":
        files = linux()
        for p, body in files.items():
            print(f"write {p}")
            if go:
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text(body)
        if go:
            subprocess.run(["systemctl", "--user", "daemon-reload"], check=True)
            subprocess.run(["systemctl", "--user", "enable", "--now", f"{LABEL}.timer"], check=True)
    else:
        print(f"Unknown OS {osname}; run scripts/download.py by hand once a day.")
        return 1
    if not go:
        print("\nNothing changed yet. Run again with --yes to install.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
