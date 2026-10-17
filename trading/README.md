# Trading system (paper only)

Goal right now: find out whether any signal beats buy-and-hold SPY after costs. Nothing trades yet.

## Setup on the home desktop (once)
1. Install Python 3.11-3.13, then: `pip install -r requirements.txt`
2. Copy `.env.example` to `.env` and paste your keys (Alpaca paper, FMP free, SEC contact email).
3. `python scripts/probe_fmp.py` (uses ~8 FMP requests) -> read `data/FMP_PROBE.md`.
4. `python -m trader.amend approve-initial` to lock the constitution.
5. `python scripts/install_autostart.py --yes` so the data download runs every day by itself.

## Day to day
- `python scripts/download.py --status`: how far the download is.
- `data/AUDIT_REPORT.md`: is the data good enough.
- `python scripts/chamber.py test-all`: once prices are in, test the four signals.
- `reports/chamber/*.md`: results, including failures.
- `python scripts/owner.py stop`: emergency stop.

Decisions and why: DECISIONS.md. Rules for Claude: CLAUDE.md.
