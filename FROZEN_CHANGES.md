# Changes to locked test files

Every change to a file listed in `FROZEN.sha256`, and every intended change to a recorded result, gets one dated
line here **in the same commit**, naming the file and why. The frozen guard (`.github/workflows/frozen_guard.yml`)
blocks the change otherwise. The preregs allow pipeline bug fixes "logged with a date"; this is that log.
New tests are not changes: add their files with `python3 tools/frozen_guard.py rehash <file>` and no log line.

Format: `- YYYY-MM-DD <file>: <what changed and why>`

- 2026-10-18 FROZEN.sha256: lock list created (145 files, 10 results databases). Nothing changed.
- 2026-10-18 kalshi_games_v1.py: MLB event tickers carry the start time after the date (26OCT172000TBCLE), so no MLB game could be read and the first Kalshi MLB lock found 0 games. The time digits are now skipped before the team codes. NFL and NBA tickers have no time and read the same as before.
- 2026-10-19 research/RESEARCH_LAB_CONSTITUTION.md: v2 adds Part C (college football), written and locked before any CFB data was downloaded. Part A and Part B (NFL) rules unchanged; see research/CONSTITUTION_LOG.md.
- 2026-10-19 research/RESEARCH_LAB_CONSTITUTION.md: v3 adds C1a (CFB data kept in the private Actions cache, never committed, per CollegeFootballData's terms). Stricter only; Part A and Part B unchanged; see research/CONSTITUTION_LOG.md.
