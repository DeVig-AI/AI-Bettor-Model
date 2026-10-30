# Research Lab -- status (NBA)

_Generated 2026-10-30T03:31:34Z by research/lab/report.py. Constitution v12 (`fb13091a1111`). Do not edit by hand._

**Expected result: most likely nothing passes the sealed exam.** Effect = cover points per game beyond the line-only baseline (Constitution A5); break-even at Kalshi pricing 51.75%.

- Candidates: 2 registered, 2 tried, 0 running
- Ledger attempts (all count in the Holm correction): 2 · across all sports: 25 (reported only, Constitution C4)
- Lab passes: 0 · exam passes: 0 · sealed 2021 exams left: 3 of 3

Gates: 2017 / 2018 / 2019 (confirmation; the search uses 2014, 2015, 2016). Search leaderboard: `research/nba/search/LEADERBOARD.md`.

| Candidate | Market | State | Gate 1 | Gate 2 | Gate 3 | Pooled [95% CI] | Holm p | Picks win% / ROI |
|---|---|---|---|---|---|---|---|---|
| `s-886c3b42` SRS · carry 0.1 · prior 24 | spread | failed · not_significant | +0.03 | +0.22 | +0.81 | +0.33 [-0.16, +0.81] | 0.178 | 50.9% / -1.6% (3451) |
| `s-e4891f12` Blend of 2: s-e425bd72 + s-066ccdc8 | spread | failed · gate_1 | -0.12 | +0.42 | +0.67 | +0.31 [-0.15, +0.75] | 0.178 | 50.8% / -1.8% (3451) |

Verdicts (Inspector General):

- `s-886c3b42`: Fails the lab: not enough evidence after the correction (needs adjusted p < 0.05); pooled +0.33 pts, Holm-adjusted p = 0.178 over 2 attempts.
- `s-e4891f12`: Fails the lab: not positive in gate 1 (2017: -0.12 pts); pooled +0.31 pts, Holm-adjusted p = 0.178 over 2 attempts.

## Recent runs

- **Search round 345** 2026-10-30T03:31:32Z: 300 models scored → 226 consistent → 0 strong (t ≥ 2.5) → 0 sent to confirmation
- **Search round 344** 2026-10-30T02:57:51Z: 300 models scored → 223 consistent → 0 strong (t ≥ 2.5) → 0 sent to confirmation
- **Search round 343** 2026-10-30T02:27:37Z: 300 models scored → 227 consistent → 0 strong (t ≥ 2.5) → 0 sent to confirmation
- **Search round 342** 2026-10-30T01:52:39Z: 300 models scored → 243 consistent → 0 strong (t ≥ 2.5) → 0 sent to confirmation
- **Search round 341** 2026-10-30T01:21:00Z: 299 models scored → 237 consistent → 0 strong (t ≥ 2.5) → 0 sent to confirmation

Files: `research/nba/results/<id>.json` (every number), `research/nba/LEDGER.csv` (every attempt), `research/nba/LESSONS.md` (exploratory).
