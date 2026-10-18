# Changes to locked test files

Every change to a file listed in `FROZEN.sha256`, and every intended change to a recorded result, gets one dated
line here **in the same commit**, naming the file and why. The frozen guard (`.github/workflows/frozen_guard.yml`)
blocks the change otherwise. The preregs allow pipeline bug fixes "logged with a date"; this is that log.
New tests are not changes: add their files with `python3 tools/frozen_guard.py rehash <file>` and no log line.

Format: `- YYYY-MM-DD <file>: <what changed and why>`

- 2026-10-18 FROZEN.sha256: lock list created (145 files, 10 results databases). Nothing changed.
