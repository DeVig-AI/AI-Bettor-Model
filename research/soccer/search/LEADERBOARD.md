# Research Lab search (SOCCER) -- leaderboard (EXPLORATORY)

_Generated 2026-11-08T23:57:45Z by research/lab/search.py. Scores are on the search seasons 2020–2022 only: effect = cover points (moneyline: win-chance points) per game beyond the line-only baseline, t = effect ÷ its standard error. Thousands of tries mean the best t here is partly luck: that is why only the shortlist is confirmed, on seasons the search never saw._

21197 configurations scored so far.

## Moneyline -- top 25 of 21197

| # | id | model | effect | t | 2020 | 2021 | 2022 |
|---|---|---|---|---|---|---|---|
| 1 | `s-4b87a575` | Blend of 2: s-411bb5c9 + s-bf6e1b8f | +0.29 | 0.34 | +1.79 | +0.18 | -1.15 |
| 2 | `s-75c3c56e` | Blend of 3: s-568d0b04 + s-140bbacd + s-411bb5c9 | +0.29 | 0.34 | +1.79 | +0.18 | -1.15 |
| 3 | `s-f39dc2f7` | Blend of 2: s-140bbacd + s-cf899dec | +0.28 | 0.34 | +1.50 | +0.55 | -1.24 |
| 4 | `s-cbaea125` | Blend of 2: s-568d0b04 + s-411bb5c9 | +0.28 | 0.34 | +1.67 | +0.14 | -0.99 |
| 5 | `s-568d0b04` | Elo · K19 · fixed home edge · 538 margin · revert 0.00 · win chance fit on training | +0.26 | 0.32 | +1.77 | +0.17 | -1.18 |
| 6 | `s-f4f84316` | Blend of 2: s-8973ca25 + s-cf0491b4 | +0.26 | 0.32 | +1.47 | +0.24 | -0.95 |
| 7 | `s-d6989336` | Blend of 2: s-cf899dec + s-bf6e1b8f | +0.26 | 0.31 | +1.37 | +0.59 | -1.22 |
| 8 | `s-26b97cea` | Blend of 2: s-cf899dec + s-8857adc9 | +0.25 | 0.30 | +1.50 | +0.48 | -1.26 |
| 9 | `s-140bbacd` | Elo · K19 · fixed home edge · 538 margin · revert 0.00 · market blend 1 · win chance fit on training | +0.25 | 0.30 | +1.37 | +0.55 | -1.22 |
| 10 | `s-cf899dec` | Elo · K19 · fixed home edge · 538 margin · revert 0.00 · market blend 1 · win chance fit on training | +0.25 | 0.30 | +1.50 | +0.51 | -1.31 |
| 11 | `s-411bb5c9` | Elo · K19 · fixed home edge · 538 margin · revert 0.00 · win chance fit on training | +0.24 | 0.29 | +1.60 | +0.25 | -1.16 |
| 12 | `s-296a7e4b` | Blend of 2: s-8973ca25 + s-8857adc9 | +0.23 | 0.28 | +1.67 | +0.19 | -1.20 |
| 13 | `s-900dc7ad` | Elo · K20 · fixed home edge · 538 margin · revert 0.03 · market blend 1 · win chance fit on training | +0.22 | 0.27 | +1.71 | +0.21 | -1.28 |
| 14 | `s-e11b6354` | Blend of 2: s-b1095140 + s-8857adc9 | +0.22 | 0.27 | +1.82 | +0.20 | -1.40 |
| 15 | `s-2e813c99` | Blend of 2: s-568d0b04 + s-900dc7ad | +0.21 | 0.26 | +1.78 | +0.35 | -1.54 |
| 16 | `s-c6f888af` | Blend of 2: s-cf899dec + s-cf0491b4 | +0.21 | 0.26 | +1.79 | +0.20 | -1.40 |
| 17 | `s-5a4c2ccb` | Blend of 3: s-568d0b04 + s-cf899dec + s-411bb5c9 | +0.21 | 0.25 | +1.64 | +0.18 | -1.23 |
| 18 | `s-2565cae7` | Blend of 2: s-900dc7ad + s-cf0491b4 | +0.21 | 0.25 | +1.54 | +0.28 | -1.23 |
| 19 | `s-f84267e3` | Blend of 2: s-140bbacd + s-cf0491b4 | +0.20 | 0.25 | +1.69 | +0.13 | -1.25 |
| 20 | `s-aa622a24` | Blend of 2: s-140bbacd + s-411bb5c9 | +0.20 | 0.25 | +1.62 | +0.19 | -1.23 |
| 21 | `s-8c7b499d` | Blend of 2: s-140bbacd + s-8973ca25 | +0.20 | 0.25 | +1.78 | +0.37 | -1.59 |
| 22 | `s-4ce13fdb` | Blend of 2: s-411bb5c9 + s-b1095140 | +0.20 | 0.24 | +1.68 | +0.38 | -1.49 |
| 23 | `s-e1d32585` | Blend of 3: s-cf899dec + s-411bb5c9 + s-8973ca25 | +0.20 | 0.24 | +1.75 | +0.33 | -1.52 |
| 24 | `s-9ab3ff36` | Blend of 2: s-bf6e1b8f + s-8857adc9 | +0.20 | 0.24 | +1.60 | +0.25 | -1.27 |
| 25 | `s-8973ca25` | Elo · K20 · fixed home edge · 538 margin · revert 0.03 · win chance fit on training | +0.20 | 0.24 | +1.45 | +0.34 | -1.23 |

## What the search learned (exploratory)

- moneyline · elo_ml · `hfa_elo`: best 45 (median t -0.21), worst 30 (-inf) over 18794 configurations
- moneyline · elo_ml · `hfa_mode`: best fixed (median t -inf), worst fixed (-inf) over 18794 configurations
- moneyline · elo_ml · `k`: best 19 (median t +0.00), worst 10 (-inf) over 18794 configurations
- moneyline · elo_ml · `market_blend`: best 0.1875 (median t -0.41), worst 0.0 (-inf) over 18794 configurations
- moneyline · elo_ml · `mov`: best none (median t -inf), worst none (-inf) over 18794 configurations
- moneyline · elo_ml · `revert`: best 0.0625 (median t -0.20), worst 0.1 (-inf) over 18794 configurations
- moneyline · rating_ml · `def_weight`: best 1.0 (median t -0.84), worst 0.5 (-1.24) over 486 configurations
- moneyline · rating_ml · `halflife`: best 1 (median t -0.60), worst 10 (-1.28) over 486 configurations
- moneyline · rating_ml · `season_carry`: best 1.0 (median t -0.77), worst 0.2 (-1.91) over 486 configurations
- moneyline · srs_ml · `carry`: best 0.575 (median t -1.04), worst 0.2 (-1.47) over 1463 configurations
- moneyline · srs_ml · `hfa_pts`: best 0.175 (median t -1.11), worst 0.5 (-1.41) over 1463 configurations
- moneyline · srs_ml · `margin_cap`: best 3 (median t -0.96), worst None (-1.52) over 1463 configurations
- moneyline · srs_ml · `prior_w`: best 3 (median t -1.25), worst 8 (-1.60) over 1463 configurations
