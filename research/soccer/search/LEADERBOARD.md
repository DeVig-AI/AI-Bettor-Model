# Research Lab search (SOCCER) -- leaderboard (EXPLORATORY)

_Generated 2026-11-09T01:08:21Z by research/lab/search.py. Scores are on the search seasons 2020–2022 only: effect = cover points (moneyline: win-chance points) per game beyond the line-only baseline, t = effect ÷ its standard error. Thousands of tries mean the best t here is partly luck: that is why only the shortlist is confirmed, on seasons the search never saw._

21606 configurations scored so far.

## Moneyline -- top 25 of 21606

| # | id | model | effect | t | 2020 | 2021 | 2022 |
|---|---|---|---|---|---|---|---|
| 1 | `s-314ab856` | Blend of 2: s-4edca0c0 + s-568d0b04 | +0.30 | 0.36 | +1.80 | +0.22 | -1.15 |
| 2 | `s-4b87a575` | Blend of 2: s-411bb5c9 + s-bf6e1b8f | +0.29 | 0.34 | +1.79 | +0.18 | -1.15 |
| 3 | `s-75c3c56e` | Blend of 3: s-568d0b04 + s-140bbacd + s-411bb5c9 | +0.29 | 0.34 | +1.79 | +0.18 | -1.15 |
| 4 | `s-f39dc2f7` | Blend of 2: s-140bbacd + s-cf899dec | +0.28 | 0.34 | +1.50 | +0.55 | -1.24 |
| 5 | `s-cbaea125` | Blend of 2: s-568d0b04 + s-411bb5c9 | +0.28 | 0.34 | +1.67 | +0.14 | -0.99 |
| 6 | `s-4edca0c0` | Elo · K19 · fixed home edge · 538 margin · revert 0.00 · win chance fit on training | +0.27 | 0.32 | +1.73 | +0.18 | -1.15 |
| 7 | `s-568d0b04` | Elo · K19 · fixed home edge · 538 margin · revert 0.00 · win chance fit on training | +0.26 | 0.32 | +1.77 | +0.17 | -1.18 |
| 8 | `s-f4f84316` | Blend of 2: s-8973ca25 + s-cf0491b4 | +0.26 | 0.32 | +1.47 | +0.24 | -0.95 |
| 9 | `s-d6989336` | Blend of 2: s-cf899dec + s-bf6e1b8f | +0.26 | 0.31 | +1.37 | +0.59 | -1.22 |
| 10 | `s-26b97cea` | Blend of 2: s-cf899dec + s-8857adc9 | +0.25 | 0.30 | +1.50 | +0.48 | -1.26 |
| 11 | `s-e678a158` | Blend of 2: s-4edca0c0 + s-411bb5c9 | +0.25 | 0.30 | +1.71 | +0.14 | -1.12 |
| 12 | `s-7b903d56` | Blend of 3: s-4edca0c0 + s-568d0b04 + s-411bb5c9 | +0.25 | 0.30 | +1.71 | +0.14 | -1.12 |
| 13 | `s-140bbacd` | Elo · K19 · fixed home edge · 538 margin · revert 0.00 · market blend 1 · win chance fit on training | +0.25 | 0.30 | +1.37 | +0.55 | -1.22 |
| 14 | `s-cf899dec` | Elo · K19 · fixed home edge · 538 margin · revert 0.00 · market blend 1 · win chance fit on training | +0.25 | 0.30 | +1.50 | +0.51 | -1.31 |
| 15 | `s-411bb5c9` | Elo · K19 · fixed home edge · 538 margin · revert 0.00 · win chance fit on training | +0.24 | 0.29 | +1.60 | +0.25 | -1.16 |
| 16 | `s-296a7e4b` | Blend of 2: s-8973ca25 + s-8857adc9 | +0.23 | 0.28 | +1.67 | +0.19 | -1.20 |
| 17 | `s-900dc7ad` | Elo · K20 · fixed home edge · 538 margin · revert 0.03 · market blend 1 · win chance fit on training | +0.22 | 0.27 | +1.71 | +0.21 | -1.28 |
| 18 | `s-e11b6354` | Blend of 2: s-b1095140 + s-8857adc9 | +0.22 | 0.27 | +1.82 | +0.20 | -1.40 |
| 19 | `s-2e813c99` | Blend of 2: s-568d0b04 + s-900dc7ad | +0.21 | 0.26 | +1.78 | +0.35 | -1.54 |
| 20 | `s-c6f888af` | Blend of 2: s-cf899dec + s-cf0491b4 | +0.21 | 0.26 | +1.79 | +0.20 | -1.40 |
| 21 | `s-5a4c2ccb` | Blend of 3: s-568d0b04 + s-cf899dec + s-411bb5c9 | +0.21 | 0.25 | +1.64 | +0.18 | -1.23 |
| 22 | `s-99da2bb8` | Blend of 3: s-4edca0c0 + s-140bbacd + s-411bb5c9 | +0.21 | 0.25 | +1.64 | +0.18 | -1.23 |
| 23 | `s-20086536` | Blend of 3: s-4edca0c0 + s-140bbacd + s-cf899dec | +0.21 | 0.25 | +1.42 | +0.30 | -1.12 |
| 24 | `s-98382dd6` | Blend of 3: s-4edca0c0 + s-411bb5c9 + s-900dc7ad | +0.21 | 0.25 | +1.75 | +0.36 | -1.52 |
| 25 | `s-2565cae7` | Blend of 2: s-900dc7ad + s-cf0491b4 | +0.21 | 0.25 | +1.54 | +0.28 | -1.23 |

## What the search learned (exploratory)

- moneyline · elo_ml · `hfa_elo`: best 45 (median t -0.21), worst 30 (-inf) over 19041 configurations
- moneyline · elo_ml · `hfa_mode`: best fixed (median t -inf), worst fixed (-inf) over 19041 configurations
- moneyline · elo_ml · `k`: best 21 (median t -0.27), worst 10 (-inf) over 19041 configurations
- moneyline · elo_ml · `market_blend`: best 0.1875 (median t -0.39), worst 0.0 (-inf) over 19041 configurations
- moneyline · elo_ml · `mov`: best none (median t -inf), worst none (-inf) over 19041 configurations
- moneyline · elo_ml · `revert`: best 0.0625 (median t -0.26), worst 0.1 (-inf) over 19041 configurations
- moneyline · rating_ml · `def_weight`: best 1.0 (median t -0.84), worst 0.5 (-1.21) over 517 configurations
- moneyline · rating_ml · `halflife`: best 1 (median t -0.60), worst 10 (-1.27) over 517 configurations
- moneyline · rating_ml · `season_carry`: best 0.85 (median t -0.75), worst 0.2 (-1.87) over 517 configurations
- moneyline · srs_ml · `carry`: best 0.575 (median t -1.00), worst 0.2 (-1.47) over 1562 configurations
- moneyline · srs_ml · `hfa_pts`: best 0.175 (median t -1.08), worst 0.5 (-1.41) over 1562 configurations
- moneyline · srs_ml · `margin_cap`: best 3 (median t -0.96), worst None (-1.51) over 1562 configurations
- moneyline · srs_ml · `prior_w`: best 2 (median t -1.09), worst 8 (-1.57) over 1562 configurations
