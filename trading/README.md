# Trading system (paper only)

Goal right now: find out whether any signal beats buy-and-hold SPY after costs. Nothing trades yet.

## 1. Get the code (once)
Needs Git and Python **3.12** (not 3.13 or newer: one of Zipline's parts has no ready-made install for those).
- Windows: python.org installer for 3.12.x, tick "Add python.exe to PATH". Git: git-scm.com.
- Mac: `brew install python@3.12 git`
- Linux: `sudo apt install python3.12 python3.12-venv git`

```
git clone https://github.com/perezreynaldo1226-afk/AI-Bettor-Model.git
cd AI-Bettor-Model
git checkout claude/new-session-bd4v1o
cd trading
```

## 2. Set up (once, ~5 minutes)
- Windows (PowerShell): `powershell -ExecutionPolicy Bypass -File setup.ps1`
- Mac/Linux: `sh setup.sh`

This makes a private Python environment in `trading/.venv`, installs everything, creates `.env`,
and runs a quick self-test. It should end with "Ready".

## 3. Paste your keys
Open `trading/.env` in any text editor. Needed: Alpaca paper keys, your email for the SEC, a free
Nasdaq Data Link key (WIKI prices to 2018) and a free Tiingo key. Stooq and FMP are optional.

## 4. Run
Windows uses `.\trader.bat`, Mac/Linux uses `./trader.sh`. Same commands:

| command | what it does |
|---|---|
| `trader probe` | checks every free source + times a backtest (first run downloads ~0.5 GB). Read `data/PROBE.md` |
| `trader amend approve-initial` | locks the constitution (once) |
| `trader download` | today's data batch + audit. Read `data/AUDIT_REPORT.md` |
| `trader download --status` | how far along the download is |
| `trader autostart --yes` | run the download every day at 18:30 by itself |
| `trader test-signals` | once prices are in: test the four signals. Results in `reports/chamber/` |
| `trader owner status` / `stop` / `restart` | emergency stop and restart |
| `trader selftest` | quick check that everything still works |

If anything prints an error, paste it to Claude.

Decisions and why: DECISIONS.md. Rules for Claude: CLAUDE.md.
