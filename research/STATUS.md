# Research Lab -- status (NFL)

_Generated 2026-10-19T05:07:19Z by research/lab/report.py. Constitution v2 (`8d8bad6e8c32`). Do not edit by hand._

**Expected result: most likely nothing passes the sealed exam.** Effect = cover points per game beyond the line-only baseline (Constitution A5); break-even at Kalshi pricing 51.75%.

- Candidates: 36 registered, 18 tried, 0 running
- Ledger attempts (all count in the Holm correction): 18
- Lab passes: 0 · exam passes: 0 · sealed 2025 exams left: 3 of 3

Gates: v2 candidates 2006–12 / 2013–18 / 2019–24; v1 candidates 2016–18 / 2019–21 / 2022–24 (their ledger rows say which).

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
| `tot-epa` + EPA per play as efficiency | total | failed · gate_1 | -0.68 | -0.32 | -1.33 | -0.78 [-1.57, +0.00] | 1.000 | 48.8% / -5.6% (2453) |
| `tot-pe-fast` Pace × efficiency, fast (half-life 4) | total | failed · gate_2 | +0.13 | -0.75 | -0.18 | -0.27 [-1.03, +0.50] | 1.000 | 50.2% / -2.9% (2453) |
| `tot-pe-slow` Pace × efficiency, slow (half-life 16) | total | failed · gate_1 | -0.39 | -0.41 | -0.13 | -0.31 [-0.97, +0.35] | 1.000 | 49.9% / -3.6% (2453) |
| `tot-pe` Pace × efficiency totals | total | failed · gate_1 | -0.39 | -0.81 | -0.30 | -0.50 [-1.21, +0.23] | 1.000 | 49.7% / -4.0% (2453) |
| `rt-points` Points rating (SRS-style) | spread | queued | — | — | — | — | — | — |
| `rt-epa` EPA-per-play rating | spread | queued | — | — | — | — | — | — |
| `rt-pass-epa` Passing-EPA rating | spread | queued | — | — | — | — | — | — |
| `rt-early-epa` Early-down EPA rating | spread | queued | — | — | — | — | — | — |
| `rt-success` Success-rate rating | spread | queued | — | — | — | — | — | — |
| `rt-noto-epa` EPA without turnovers | spread | queued | — | — | — | — | — | — |
| `rt-comp-epa` EPA in competitive moments | spread | queued | — | — | — | — | — | — |
| `rt-epa-off` EPA rating, offense-first | spread | queued | — | — | — | — | — | — |
| `bl-elo-epa` Blend: Elo + EPA rating | spread | queued | — | — | — | — | — | — |
| `bl-elo-points` Blend: Elo + points rating | spread | queued | — | — | — | — | — | — |
| `bl-spread-4` Blend of four spread ratings | spread | queued | — | — | — | — | — | — |
| `tt-points` Points-for/against totals | total | queued | — | — | — | — | — | — |
| `tt-epa` EPA × pace totals | total | queued | — | — | — | — | — | — |
| `tt-success` Success rate × pace totals | total | queued | — | — | — | — | — | — |
| `tt-noto-epa` EPA without turnovers × pace totals | total | queued | — | — | — | — | — | — |
| `tt-spp` EPA × seconds-per-play pace totals | total | queued | — | — | — | — | — | — |
| `tt-comp-epa` Competitive-moment EPA totals | total | queued | — | — | — | — | — | — |
| `bl-tot` Blend: pace × efficiency + EPA totals | total | queued | — | — | — | — | — | — |

Verdicts (Inspector General):

- `elo-538`: Fails the lab: not positive in gate 2 (2013–18: -0.82 pts); pooled +0.07 pts, Holm-adjusted p = 1.000 over 18 attempts.
- `elo-base`: Fails the lab: not positive in gate 2 (2013–18: -0.87 pts); pooled +0.10 pts, Holm-adjusted p = 1.000 over 18 attempts.
- `elo-bye`: Fails the lab: not positive in gate 2 (2013–18: -0.89 pts); pooled +0.12 pts, Holm-adjusted p = 1.000 over 18 attempts.
- `elo-hfa-trend`: Fails the lab: not positive in gate 2 (2013–18: -0.48 pts); pooled +0.09 pts, Holm-adjusted p = 1.000 over 18 attempts.
- `elo-k10`: Fails the lab: not positive in gate 2 (2013–18: -0.58 pts); pooled +0.24 pts, Holm-adjusted p = 1.000 over 18 attempts.
- `elo-k30`: Fails the lab: not positive in gate 2 (2013–18: -0.84 pts); pooled -0.04 pts, Holm-adjusted p = 1.000 over 18 attempts.
- `elo-market`: Fails the lab: not positive in gate 2 (2013–18: -0.79 pts); pooled +0.17 pts, Holm-adjusted p = 1.000 over 18 attempts.
- `elo-mov`: Fails the lab: not positive in gate 2 (2013–18: -1.04 pts); pooled -0.15 pts, Holm-adjusted p = 1.000 over 18 attempts.
- `elo-nfelo`: Fails the lab: not positive in gate 2 (2013–18: -0.69 pts); pooled +0.14 pts, Holm-adjusted p = 1.000 over 18 attempts.
- `elo-playoff`: Fails the lab: not positive in gate 2 (2013–18: -0.80 pts); pooled +0.13 pts, Holm-adjusted p = 1.000 over 18 attempts.
- `elo-qb`: Fails the lab: not positive in gate 2 (2013–18: -1.00 pts); pooled +0.02 pts, Holm-adjusted p = 1.000 over 18 attempts.
- `elo-resist`: Fails the lab: not positive in gate 2 (2013–18: -0.39 pts); pooled +0.39 pts, Holm-adjusted p = 1.000 over 18 attempts.
- `elo-revert`: Fails the lab: not positive in gate 2 (2013–18: -0.68 pts); pooled +0.35 pts, Holm-adjusted p = 1.000 over 18 attempts.
- `elo-travel`: Fails the lab: not positive in gate 2 (2013–18: -0.74 pts); pooled +0.06 pts, Holm-adjusted p = 1.000 over 18 attempts.
- `tot-epa`: Fails the lab: not positive in gate 1 (2006–12: -0.68 pts); pooled -0.78 pts, Holm-adjusted p = 1.000 over 18 attempts.
- `tot-pe-fast`: Fails the lab: not positive in gate 2 (2013–18: -0.75 pts); pooled -0.27 pts, Holm-adjusted p = 1.000 over 18 attempts.
- `tot-pe-slow`: Fails the lab: not positive in gate 1 (2006–12: -0.39 pts); pooled -0.31 pts, Holm-adjusted p = 1.000 over 18 attempts.
- `tot-pe`: Fails the lab: not positive in gate 1 (2006–12: -0.39 pts); pooled -0.50 pts, Holm-adjusted p = 1.000 over 18 attempts.
- `rt-points`: In the queue (#1): runs in lab batch 1 from now. Not an attempt yet, so it can still be edited or removed at no cost.
- `rt-epa`: In the queue (#2): runs in lab batch 1 from now. Not an attempt yet, so it can still be edited or removed at no cost.
- `rt-pass-epa`: In the queue (#3): runs in lab batch 1 from now. Not an attempt yet, so it can still be edited or removed at no cost.
- `rt-early-epa`: In the queue (#4): runs in lab batch 1 from now. Not an attempt yet, so it can still be edited or removed at no cost.
- `rt-success`: In the queue (#5): runs in lab batch 1 from now. Not an attempt yet, so it can still be edited or removed at no cost.
- `rt-noto-epa`: In the queue (#6): runs in lab batch 1 from now. Not an attempt yet, so it can still be edited or removed at no cost.
- `rt-comp-epa`: In the queue (#7): runs in lab batch 1 from now. Not an attempt yet, so it can still be edited or removed at no cost.
- `rt-epa-off`: In the queue (#8): runs in lab batch 1 from now. Not an attempt yet, so it can still be edited or removed at no cost.
- `bl-elo-epa`: In the queue (#9): runs in lab batch 1 from now. Not an attempt yet, so it can still be edited or removed at no cost.
- `bl-elo-points`: In the queue (#10): runs in lab batch 1 from now. Not an attempt yet, so it can still be edited or removed at no cost.
- `bl-spread-4`: In the queue (#11): runs in lab batch 1 from now. Not an attempt yet, so it can still be edited or removed at no cost.
- `tt-points`: In the queue (#12): runs in lab batch 1 from now. Not an attempt yet, so it can still be edited or removed at no cost.
- `tt-epa`: In the queue (#13): runs in lab batch 1 from now. Not an attempt yet, so it can still be edited or removed at no cost.
- `tt-success`: In the queue (#14): runs in lab batch 1 from now. Not an attempt yet, so it can still be edited or removed at no cost.
- `tt-noto-epa`: In the queue (#15): runs in lab batch 1 from now. Not an attempt yet, so it can still be edited or removed at no cost.
- `tt-spp`: In the queue (#16): runs in lab batch 1 from now. Not an attempt yet, so it can still be edited or removed at no cost.
- `tt-comp-epa`: In the queue (#17): runs in lab batch 1 from now. Not an attempt yet, so it can still be edited or removed at no cost.
- `bl-tot`: In the queue (#18): runs in lab batch 1 from now. Not an attempt yet, so it can still be edited or removed at no cost.

## Recent runs

- **Research Lab #1** 2026-10-19T04:34:00Z, 10 s: 18 tested · 0 passed the lab · failed: 15 gate 2, 3 gate 1

Files: `research/results/<id>.json` (every number), `research/LEDGER.csv` (every attempt), `research/LESSONS.md` (exploratory).
