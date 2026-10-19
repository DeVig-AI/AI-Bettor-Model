# Changes to locked test files

Every change to a file listed in `FROZEN.sha256`, and every intended change to a recorded result, gets one dated
line here **in the same commit**, naming the file and why. The frozen guard (`.github/workflows/frozen_guard.yml`)
blocks the change otherwise. The preregs allow pipeline bug fixes "logged with a date"; this is that log.
New tests are not changes: add their files with `python3 tools/frozen_guard.py rehash <file>` and no log line.

Format: `- YYYY-MM-DD <file>: <what changed and why>`

- 2026-10-18 FROZEN.sha256: lock list created (145 files, 10 results databases). Nothing changed.
- 2026-10-18 kalshi_games_v1.py: MLB event tickers carry the start time after the date (26OCT172000TBCLE), so no MLB game could be read and the first Kalshi MLB lock found 0 games. The time digits are now skipped before the team codes. NFL and NBA tickers have no time and read the same as before.
- 2026-10-19 research/RESEARCH_LAB_CONSTITUTION.md: Constitution v2 (owner's decision): seasons 1999-2024 with training 1999-2005 and gates 2006-12 / 2013-18 / 2019-24; a queue of ideas run 18 per lab run. v1 kept unchanged as research/constitution/RESEARCH_LAB_CONSTITUTION_v1.md; every v1 attempt keeps counting.
