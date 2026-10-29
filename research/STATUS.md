# Research Lab -- status (NFL)

_Generated 2026-10-29T10:52:49Z by research/lab/report.py. Constitution v12 (`fb13091a1111`). Do not edit by hand._

**Expected result: most likely nothing passes the sealed exam.** Effect = cover points per game beyond the line-only baseline (Constitution A5); break-even at Kalshi pricing 51.75%.

- Candidates: 22 registered, 22 tried, 0 running
- Ledger attempts (all count in the Holm correction): 22 · across all sports: 25 (reported only, Constitution C4)
- Lab passes: 0 · exam passes: 0 · sealed 2025 exams left: 3 of 3

Gates: v4 candidates 2017–19 / 2020–22 / 2023–24 (confirmation; the search uses 2006–16); v1 candidates 2016–18 / 2019–21 / 2022–24 (their ledger rows say which). Search leaderboard: `research/search/LEADERBOARD.md`.

| Candidate | Market | State | Gate 1 | Gate 2 | Gate 3 | Pooled [95% CI] | Holm p | Picks win% / ROI |
|---|---|---|---|---|---|---|---|---|
| `elo-538` 538-style combination | spread | failed · gate_2 | +0.39 | -0.82 | +0.63 | +0.07 [-0.75, +0.87] | 1.000 | 49.0% / -5.2% (2412) |
| `elo-base` Plain Elo | spread | failed · gate_2 | +0.25 | -0.87 | +0.89 | +0.10 [-0.66, +0.85] | 1.000 | 50.6% / -2.3% (2412) |
| `elo-bye` + Rest / bye bonus | spread | failed · gate_2 | +0.33 | -0.89 | +0.89 | +0.12 [-0.64, +0.88] | 1.000 | 50.6% / -2.3% (2412) |
| `elo-hfa-trend` + Home field that changes over time | spread | failed · gate_2 | +0.23 | -0.48 | +0.49 | +0.09 [-0.62, +0.79] | 1.000 | 51.0% / -1.5% (2412) |
| `elo-k10` Plain Elo, slower (K 10) | spread | failed · gate_2 | +0.38 | -0.58 | +0.89 | +0.24 [-0.49, +0.98] | 1.000 | 50.9% / -1.6% (2412) |
| `elo-k30` Plain Elo, faster (K 30) | spread | failed · gate_2 | +0.22 | -0.84 | +0.49 | -0.04 [-0.81, +0.72] | 1.000 | 50.1% / -3.2% (2412) |
| `elo-market` + Learn from the market line | spread | failed · gate_2 | +0.19 | -0.79 | +1.08 | +0.17 [-0.58, +0.91] | 1.000 | 50.6% / -2.2% (2412) |
| `elo-mov` + Margin-of-victory multiplier | spread | failed · gate_2 | +0.32 | -1.04 | +0.28 | -0.15 [-0.93, +0.63] | 1.000 | 49.0% / -5.4% (2412) |
| `elo-nfelo` nfelo-style combination | spread | failed · gate_2 | +0.44 | -0.69 | +0.67 | +0.14 [-0.57, +0.86] | 1.000 | 50.7% / -2.1% (2412) |
| `elo-playoff` + Playoff boost | spread | failed · gate_2 | +0.25 | -0.80 | +0.93 | +0.13 [-0.63, +0.89] | 1.000 | 50.6% / -2.2% (2412) |
| `elo-qb` + Quarterback adjustment | spread | failed · gate_2 | +0.10 | -1.00 | +0.93 | +0.02 [-0.74, +0.78] | 1.000 | 49.7% / -4.0% (2412) |
| `elo-resist` + Market-resistant K | spread | failed · gate_2 | +0.88 | -0.39 | +0.69 | +0.39 [-0.40, +1.18] | 1.000 | 51.1% / -1.2% (2412) |
| `elo-revert` + Stronger preseason reversion | spread | failed · gate_2 | +0.45 | -0.68 | +1.25 | +0.35 [-0.40, +1.09] | 1.000 | 51.4% / -0.7% (2412) |
| `elo-travel` + Travel distance | spread | failed · gate_2 | +0.06 | -0.74 | +0.82 | +0.06 [-0.71, +0.83] | 1.000 | 50.6% / -2.2% (2412) |
| `s-0501d21a` Blend of 3: s-f3fafc67 + s-1bba7fb4 + s-aaee4789 | spread | failed · gate_2 | +0.84 | -0.05 | -1.06 | +0.01 [-0.51, +0.54] | 1.000 | 49.2% / -5.0% (2150) |
| `s-b07a5742` Signals (SRS · carry 0.6 · prior 4 · margin cap 35) + bye-diff, qb-change, travel-diff | spread | failed · gate_3 | +0.83 | +0.18 | -0.75 | +0.17 [-0.34, +0.71] | 1.000 | 49.3% / -4.7% (2150) |
| `s-e27628a8` Blend of 2: s-3770bfc8 + s-6f3641ca | spread | failed · gate_3 | +0.55 | +0.73 | -1.30 | +0.14 [-0.48, +0.76] | 1.000 | 49.7% / -4.0% (2150) |
| `s-f369d5f7` Blend of 2: s-473e5379 + s-8a5f816b | spread | failed · gate_3 | +0.62 | +0.00 | -0.83 | +0.01 [-0.63, +0.64] | 1.000 | 49.7% / -4.0% (2150) |
| `tot-epa` + EPA per play as efficiency | total | failed · gate_1 | -0.68 | -0.32 | -1.33 | -0.78 [-1.57, +0.00] | 1.000 | 48.8% / -5.6% (2453) |
| `tot-pe-fast` Pace × efficiency, fast (half-life 4) | total | failed · gate_2 | +0.13 | -0.75 | -0.18 | -0.27 [-1.03, +0.50] | 1.000 | 50.2% / -2.9% (2453) |
| `tot-pe-slow` Pace × efficiency, slow (half-life 16) | total | failed · gate_1 | -0.39 | -0.41 | -0.13 | -0.31 [-0.97, +0.35] | 1.000 | 49.9% / -3.6% (2453) |
| `tot-pe` Pace × efficiency totals | total | failed · gate_1 | -0.39 | -0.81 | -0.30 | -0.50 [-1.21, +0.23] | 1.000 | 49.7% / -4.0% (2453) |

Verdicts (Inspector General):

- `elo-538`: Fails the lab: not positive in gate 2 (2020–22: -0.82 pts); pooled +0.07 pts, Holm-adjusted p = 1.000 over 22 attempts.
- `elo-base`: Fails the lab: not positive in gate 2 (2020–22: -0.87 pts); pooled +0.10 pts, Holm-adjusted p = 1.000 over 22 attempts.
- `elo-bye`: Fails the lab: not positive in gate 2 (2020–22: -0.89 pts); pooled +0.12 pts, Holm-adjusted p = 1.000 over 22 attempts.
- `elo-hfa-trend`: Fails the lab: not positive in gate 2 (2020–22: -0.48 pts); pooled +0.09 pts, Holm-adjusted p = 1.000 over 22 attempts.
- `elo-k10`: Fails the lab: not positive in gate 2 (2020–22: -0.58 pts); pooled +0.24 pts, Holm-adjusted p = 1.000 over 22 attempts.
- `elo-k30`: Fails the lab: not positive in gate 2 (2020–22: -0.84 pts); pooled -0.04 pts, Holm-adjusted p = 1.000 over 22 attempts.
- `elo-market`: Fails the lab: not positive in gate 2 (2020–22: -0.79 pts); pooled +0.17 pts, Holm-adjusted p = 1.000 over 22 attempts.
- `elo-mov`: Fails the lab: not positive in gate 2 (2020–22: -1.04 pts); pooled -0.15 pts, Holm-adjusted p = 1.000 over 22 attempts.
- `elo-nfelo`: Fails the lab: not positive in gate 2 (2020–22: -0.69 pts); pooled +0.14 pts, Holm-adjusted p = 1.000 over 22 attempts.
- `elo-playoff`: Fails the lab: not positive in gate 2 (2020–22: -0.80 pts); pooled +0.13 pts, Holm-adjusted p = 1.000 over 22 attempts.
- `elo-qb`: Fails the lab: not positive in gate 2 (2020–22: -1.00 pts); pooled +0.02 pts, Holm-adjusted p = 1.000 over 22 attempts.
- `elo-resist`: Fails the lab: not positive in gate 2 (2020–22: -0.39 pts); pooled +0.39 pts, Holm-adjusted p = 1.000 over 22 attempts.
- `elo-revert`: Fails the lab: not positive in gate 2 (2020–22: -0.68 pts); pooled +0.35 pts, Holm-adjusted p = 1.000 over 22 attempts.
- `elo-travel`: Fails the lab: not positive in gate 2 (2020–22: -0.74 pts); pooled +0.06 pts, Holm-adjusted p = 1.000 over 22 attempts.
- `s-0501d21a`: Fails the lab: not positive in gate 2 (2020–22: -0.05 pts); pooled +0.01 pts, Holm-adjusted p = 1.000 over 22 attempts.
- `s-b07a5742`: Fails the lab: not positive in gate 3 (2023–24: -0.75 pts); pooled +0.17 pts, Holm-adjusted p = 1.000 over 22 attempts.
- `s-e27628a8`: Fails the lab: not positive in gate 3 (2023–24: -1.30 pts); pooled +0.14 pts, Holm-adjusted p = 1.000 over 22 attempts.
- `s-f369d5f7`: Fails the lab: not positive in gate 3 (2023–24: -0.83 pts); pooled +0.01 pts, Holm-adjusted p = 1.000 over 22 attempts.
- `tot-epa`: Fails the lab: not positive in gate 1 (2017–19: -0.68 pts); pooled -0.78 pts, Holm-adjusted p = 1.000 over 22 attempts.
- `tot-pe-fast`: Fails the lab: not positive in gate 2 (2020–22: -0.75 pts); pooled -0.27 pts, Holm-adjusted p = 1.000 over 22 attempts.
- `tot-pe-slow`: Fails the lab: not positive in gate 1 (2017–19: -0.39 pts); pooled -0.31 pts, Holm-adjusted p = 1.000 over 22 attempts.
- `tot-pe`: Fails the lab: not positive in gate 1 (2017–19: -0.39 pts); pooled -0.50 pts, Holm-adjusted p = 1.000 over 22 attempts.

## Recent runs

- **Search round 699** 2026-10-29T10:52:26Z: 2,000 models scored → 553 consistent → 24 strong (t ≥ 2.5) → 0 sent to confirmation
- **Search round 698** 2026-10-29T10:20:48Z: 2,000 models scored → 524 consistent → 27 strong (t ≥ 2.5) → 0 sent to confirmation
- **Search round 697** 2026-10-29T09:48:47Z: 1,999 models scored → 550 consistent → 35 strong (t ≥ 2.5) → 0 sent to confirmation
- **Search round 696** 2026-10-29T09:19:21Z: 1,999 models scored → 546 consistent → 27 strong (t ≥ 2.5) → 0 sent to confirmation
- **Search round 695** 2026-10-29T08:48:59Z: 2,000 models scored → 523 consistent → 19 strong (t ≥ 2.5) → 0 sent to confirmation

Files: `research/results/<id>.json` (every number), `research/LEDGER.csv` (every attempt), `research/LESSONS.md` (exploratory).
