# NBA Model C + the official injury report -- results (v1)

Pre-registration: `NBA_MODELC_PLUS_INJURIES_V1_PREREG.md` (committed before any comparison). Full numbers:
`nba_modelc_plus_injuries_v1_results.json`. Inputs: `nba_injury_reports_fetch.py` (2,390 official report PDFs,
sportsdataverse box scores; cache outside the repo, never committed). Code: `nba_modelc_plus_injuries_v1.py`.

## Verdict: better, by all three pre-registered rules

| Walk-forward | Games | Model C log loss | C + injuries log loss | Model C accuracy | C + injuries accuracy |
|---|---|---|---|---|---|
| 2023-24 | 1,231 | 0.6400 | 0.6331 | 63.2% | 64.6% |
| 2024-25 | 1,231 | 0.6244 | 0.6180 | 65.6% | 65.4% |
| 2025-26 | 1,231 | 0.6158 | 0.6052 | 64.3% | 67.3% |
| **Pooled** | **3,693** | **0.6267** | **0.6188** | **64.4%** | **65.8%** |

- Pooled log loss lower: yes (difference -0.0079).
- 95% interval of the difference (paired game bootstrap, 10,000, seed 20261106): **-0.0118 to -0.0041**, below 0.
- Lower log loss in **3 of 3** seasons.
- Brier also lower (0.2185 to 0.2149). Coefficients in the last fit (scaled features): d_out -0.25, d_q -0.05,
  d_top -0.01. Nearly all the gain comes from minutes listed Out or Doubtful.

## Read this before using it
- **One fix was made after the first run, and the first run is kept on record.** The first run read each report
  with a line pattern that expected a tip time before every matchup. The report prints the time only when it changes,
  so rows of a second game at the same time kept the previous team, and some players were counted for the wrong team
  (checked by hand on January 2025 reports: Orlando's Banchero filed under Washington). That run's numbers:
  pooled log loss 0.6267 vs 0.6230, difference -0.0037, interval -0.0076 to +0.0003, lower in 3 of 3 seasons:
  **not better** (the interval touched 0). The fix changes only the parsing (time and matchup each optional); the
  features, models, seasons and rules are exactly as pre-registered. Matched players went from 52% to 66% of listed
  ones; on the January 2025 check, 94% of listed players who had played for their team matched, and the rest were
  players out for the season or listed by a different first name (counted 0, as pre-registered).
- This is **model accuracy, not an edge**. Sportsbook and Kalshi prices already react to the injury report, and the
  NFL injury study found no edge against the closing line. A more accurate model is not proven to beat the price.
- Out of sample in time only: 2023-24 to 2025-26, three seasons. 2026-27 is untouched and would be the real test.

## What the pre-registration says happens next
Model C keeps running unchanged (it is frozen). A "C + injuries" model fit on 2022-23 to 2025-26 can be built and
paper-tracked next to it, labelled not proven; no picks change until the owner decides.
