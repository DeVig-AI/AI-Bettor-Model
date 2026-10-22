# NFL injury study v1 -- results

Run 2026-10-22T21:23:38Z, exactly as `NFL_INJURY_STUDY_V1_PREREG.md` (fit 2013-2018, test 2019-2024).
Injury-report rows with a status: 30,806; matched to snap counts: 30,734 (99.8%). Games: 3,277 (3,277 with snap counts).

## A. Beyond the closing line (primary)
- Effect: **+0.658 points per game** (95% interval -0.145 to +1.460), one-sided p = 0.056 -> **no edge**.
- Picks against the line: 705-706 (50.0%; break-even 51.75%), ROI at Kalshi pricing -3.5% on 1451 picks.
- By period: 2019-2021 +1.214, 2022-2024 +0.124 points.
- Fit coefficients (cover points): intercept +0.145, d_qb -1.941, d_out -0.326, d_q +0.038

## B. A model that does not see the line
| Test 2019-2024 | Log loss | Brier | Accuracy |
|---|---|---|---|
| Base (form, rest) | 0.6520 | 0.2299 | 61.8% |
| Base + injuries | 0.6438 | 0.2263 | 62.9% |

Log-loss change -0.00823 (95% interval -0.01282 to -0.00347) -> **injuries help**.

Points (2013-2018 least squares, home minus away):

| Feature | What the games say | What the closing line moved |
|---|---|---|
| d_form | +0.48 | +0.45 |
| d_rest | +0.09 | +0.17 |
| d_qb | -3.79 | -1.92 |
| d_out | -0.51 | -0.20 |
| d_q | -0.09 | -0.12 |
