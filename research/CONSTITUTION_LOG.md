# Research Lab Constitution -- version log

One line per version of `research/RESEARCH_LAB_CONSTITUTION.md`: date, version, fingerprint, what changed and why.
The same change also gets a dated line in `FROZEN_CHANGES.md` (the frozen guard enforces that).

- 2026-10-19 v1: adopted (Part A all sports, Part B NFL, Part C reserved). Locked before any lab data was downloaded.
- 2026-10-19 v2: adds Part C (college football: CFBD data, FBS-vs-FBS games only, eras 2014-17 train / 2018-19, 2021-22, 2023-24 gates, 2020 played through, sealed 2025, own Holm correction plus a reported global attempt count). Part A and Part B unchanged; exam budgets are counted per sport and sealed season across versions. Locked before any CFB data was downloaded.
- 2026-10-19 v3: Part C1a, where CFB data is kept. CollegeFootballData's Terms of Use (2026-08-12) forbid publishing stored raw API responses or mirroring the data, so the CFB cache lives only in the private GitHub Actions cache (git-ignored); only MANIFEST.json (fingerprints), CALLS.csv and derived outputs are committed; a re-fetch after cache eviction must match the fingerprints. Stricter only; adopted before any CFB history was downloaded (a five-call provider check had run).
