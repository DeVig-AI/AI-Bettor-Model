# Research Lab search (CBB) -- leaderboard (EXPLORATORY)

_Generated 2026-11-04T03:16:47Z by research/lab/search.py. Scores are on the search seasons 2019–2022 only: effect = cover points (moneyline: win-chance points) per game beyond the line-only baseline, t = effect ÷ its standard error. Thousands of tries mean the best t here is partly luck: that is why only the shortlist is confirmed, on seasons the search never saw._

470 configurations scored so far.

## Moneyline -- top 25 of 470

| # | id | model | effect | t | 2019 | 2020 | 2022 |
|---|---|---|---|---|---|---|---|
| 1 | `s-75f1e7b1` | Blend of 2: s-1fd48a78 + s-81bd507f | -0.11 | -0.30 | +0.25 | -0.38 | -0.20 |
| 2 | `s-a39c70b1` | Blend of 2: s-1fd48a78 + s-87d255ca | -0.12 | -0.31 | +0.15 | -0.56 | +0.06 |
| 3 | `s-0406c77b` | Blend of 2: s-81bd507f + s-fcb6ea18 | -0.14 | -0.37 | +0.15 | -0.32 | -0.24 |
| 4 | `s-1fd48a78` | Points rating · half-life 15 · carry 0.5 · win chance fit on training | -0.17 | -0.45 | +0.30 | -0.49 | -0.32 |
| 5 | `s-51d134f8` | Blend of 2: s-1fd48a78 + s-fcb6ea18 | -0.17 | -0.46 | +0.13 | -0.27 | -0.37 |
| 6 | `s-3ea2d82f` | Elo · K20 · fixed home edge · 538 margin · revert 0.33 · win chance fit on training | -0.19 | -0.48 | +0.52 | -1.01 | -0.07 |
| 7 | `s-81bd507f` | SRS · carry 0.5 · prior 8 · margin cap 20 · win chance fit on training | -0.19 | -0.50 | +0.18 | -0.51 | -0.24 |
| 8 | `s-2925159b` | Blend of 2: s-81bd507f + s-87d255ca | -0.19 | -0.51 | +0.28 | -0.45 | -0.40 |
| 9 | `s-998eebe4` | SRS · carry 0.7 · prior 4 · margin cap 20 · win chance fit on training | -0.19 | -0.52 | +0.15 | -0.50 | -0.22 |
| 10 | `s-e683e211` | SRS · carry 0.5 · prior 8 · win chance fit on training | -0.20 | -0.54 | +0.38 | -0.60 | -0.38 |
| 11 | `s-5d2542c2` | Blend of 2: s-81bd507f + s-998eebe4 | -0.21 | -0.56 | +0.26 | -0.32 | -0.55 |
| 12 | `s-5357e693` | Blend of 2: s-e683e211 + s-fcb6ea18 | -0.23 | -0.60 | -0.04 | -0.58 | -0.07 |
| 13 | `s-8c4e4c01` | SRS · carry 0.3 · prior 16 · win chance fit on training | -0.23 | -0.60 | +0.24 | -0.99 | +0.06 |
| 14 | `s-acde6897` | Blend of 2: s-e683e211 + s-4035df6e | -0.23 | -0.61 | +0.10 | -0.75 | -0.04 |
| 15 | `s-24d989cc` | Blend of 2: s-4035df6e + s-fcb6ea18 | -0.24 | -0.62 | -0.15 | -0.60 | +0.04 |
| 16 | `s-b0594eae` | Blend of 3: s-1fd48a78 + s-81bd507f + s-998eebe4 | -0.23 | -0.63 | +0.20 | -0.52 | -0.37 |
| 17 | `s-87d255ca` | SRS · carry 0.5 · prior 8 · margin cap 20 · win chance fit on training | -0.24 | -0.63 | +0.19 | -0.67 | -0.23 |
| 18 | `s-0ecc5fab` | Elo · K15 · fixed home edge · 538 margin · revert 0.33 · win chance fit on training | -0.25 | -0.64 | +0.36 | -0.98 | -0.12 |
| 19 | `s-4035df6e` | SRS · carry 0.3 · prior 16 · win chance fit on training | -0.24 | -0.64 | -0.12 | -0.69 | +0.08 |
| 20 | `s-d056d186` | Blend of 2: s-1fd48a78 + s-4035df6e | -0.24 | -0.64 | -0.13 | -0.56 | -0.05 |
| 21 | `s-5f871485` | Blend of 2: s-8c4e4c01 + s-4035df6e | -0.25 | -0.65 | -0.12 | -0.82 | +0.19 |
| 22 | `s-d4be4b4c` | Blend of 2: s-1fd48a78 + s-e683e211 | -0.25 | -0.66 | -0.01 | -0.58 | -0.17 |
| 23 | `s-f147ecc7` | Blend of 2: s-1fd48a78 + s-998eebe4 | -0.24 | -0.66 | +0.18 | -0.53 | -0.38 |
| 24 | `s-a5450944` | Blend of 3: s-1fd48a78 + s-81bd507f + s-8c4e4c01 | -0.25 | -0.67 | +0.37 | -0.85 | -0.26 |
| 25 | `s-4993c78f` | Blend of 2: s-87d255ca + s-fcb6ea18 | -0.25 | -0.67 | -0.02 | -0.59 | -0.14 |

## What the search learned (exploratory)

- moneyline · elo_ml · `hfa_elo`: best 75 (median t -2.96), worst 125 (-3.57) over 200 configurations
- moneyline · elo_ml · `k`: best 20 (median t -2.77), worst 15 (-3.55) over 200 configurations
- moneyline · elo_ml · `mov`: best 538 (median t -2.45), worst none (-4.35) over 200 configurations
- moneyline · elo_ml · `prob`: best fit (median t -2.20), worst elo (-5.01) over 200 configurations
- moneyline · elo_ml · `revert`: best 0.25 (median t -2.62), worst 0.6 (-3.76) over 200 configurations
- moneyline · rating_ml · `def_weight`: best 1.0 (median t -1.77), worst 0.5 (-3.54) over 77 configurations
- moneyline · rating_ml · `halflife`: best 10 (median t -1.96), worst 3 (-2.76) over 77 configurations
- moneyline · rating_ml · `season_carry`: best 0.5 (median t -1.96), worst 0.8 (-2.69) over 77 configurations
- moneyline · srs_ml · `carry`: best 0.5 (median t -1.23), worst 0.8 (-2.08) over 123 configurations
- moneyline · srs_ml · `hfa_pts`: best 3.0 (median t -1.29), worst 5.0 (-2.21) over 123 configurations
- moneyline · srs_ml · `prior_w`: best 8 (median t -1.04), worst 32 (-2.48) over 123 configurations
