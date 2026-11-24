# Research Lab -- status (NBA)

_Generated 2026-11-24T23:46:08Z by research/lab/report.py. Constitution v16 (`b3333c768d79`). Do not edit by hand._

**Expected result: most likely nothing passes the sealed exam.** Effect = cover points per game beyond the line-only baseline (Constitution A5); break-even at Kalshi pricing 51.75%.

- Candidates: 2 registered, 2 tried, 0 running
- Ledger attempts (all count in the Holm correction): 2 · across all sports: 35 (reported only, Constitution C4)
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

- **Search round 603** 2026-11-24T23:46:06Z: 256 models scored → 137 consistent → 0 strong (t ≥ 2.5) → 0 sent to confirmation
- **Search round 602** 2026-11-24T13:29:08Z: 235 models scored → 113 consistent → 0 strong (t ≥ 2.5) → 0 sent to confirmation
- **Search round 601** 2026-11-24T03:54:20Z: 234 models scored → 126 consistent → 0 strong (t ≥ 2.5) → 0 sent to confirmation
- **Search round 600** 2026-11-23T15:44:50Z: 230 models scored → 109 consistent → 0 strong (t ≥ 2.5) → 0 sent to confirmation
- **Search round 599** 2026-11-23T04:27:53Z: 225 models scored → 101 consistent → 0 strong (t ≥ 2.5) → 0 sent to confirmation

Files: `research/nba/results/<id>.json` (every number), `research/nba/LEDGER.csv` (every attempt), `research/nba/LESSONS.md` (exploratory).
