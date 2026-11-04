# Research Lab search (CBB) -- leaderboard (EXPLORATORY)

_Generated 2026-11-04T10:11:47Z by research/lab/search.py. Scores are on the search seasons 2019–2022 only: effect = cover points (moneyline: win-chance points) per game beyond the line-only baseline, t = effect ÷ its standard error. Thousands of tries mean the best t here is partly luck: that is why only the shortlist is confirmed, on seasons the search never saw._

940 configurations scored so far.

## Moneyline -- top 25 of 940

| # | id | model | effect | t | 2019 | 2020 | 2022 |
|---|---|---|---|---|---|---|---|
| 1 | `s-b58f1fdd` | Blend of 2: s-d44f714c + s-0ba0401c | +0.31 | 0.81 | +0.84 | -0.29 | +0.39 |
| 2 | `s-e73f8041` | Blend of 2: s-64a6990a + s-0ba0401c | +0.31 | 0.81 | +0.84 | -0.29 | +0.39 |
| 3 | `s-d44f714c` | Elo · K32 · home edge by season · 538 margin · revert 0.25 · Elo win chance | +0.27 | 0.78 | +0.98 | -0.32 | +0.15 |
| 4 | `s-64a6990a` | Elo · K32 · home edge by season · 538 margin · revert 0.25 · Elo win chance | +0.26 | 0.77 | +0.98 | -0.33 | +0.15 |
| 5 | `s-b186240d` | Blend of 2: s-d44f714c + s-64a6990a | +0.26 | 0.77 | +0.98 | -0.33 | +0.15 |
| 6 | `s-0b475899` | Blend of 3: s-d44f714c + s-64a6990a + s-ca284812 | +0.25 | 0.73 | +0.96 | -0.37 | +0.16 |
| 7 | `s-b17fd2c7` | Blend of 2: s-d44f714c + s-f86e6943 | +0.23 | 0.67 | +0.88 | +0.03 | -0.20 |
| 8 | `s-559ec667` | Blend of 2: s-64a6990a + s-f86e6943 | +0.23 | 0.67 | +0.88 | +0.03 | -0.20 |
| 9 | `s-af9ace1e` | Blend of 3: s-d44f714c + s-0ba0401c + s-f86e6943 | +0.18 | 0.47 | +0.79 | -0.46 | +0.21 |
| 10 | `s-294f8b2b` | Blend of 3: s-64a6990a + s-0ba0401c + s-f86e6943 | +0.18 | 0.47 | +0.79 | -0.46 | +0.21 |
| 11 | `s-6faebb5e` | Blend of 3: s-d44f714c + s-f86e6943 + s-ca284812 | +0.14 | 0.42 | +0.73 | -0.20 | -0.09 |
| 12 | `s-d04de3b6` | Blend of 3: s-64a6990a + s-f86e6943 + s-ca284812 | +0.14 | 0.42 | +0.73 | -0.20 | -0.09 |
| 13 | `s-3b7ff0c5` | Blend of 3: s-d44f714c + s-64a6990a + s-0ba0401c | +0.15 | 0.41 | +0.66 | -0.46 | +0.26 |
| 14 | `s-4be71336` | Blend of 2: s-64a6990a + s-53ae7146 | +0.12 | 0.34 | +0.84 | -0.12 | -0.34 |
| 15 | `s-f5154876` | Blend of 2: s-d44f714c + s-53ae7146 | +0.12 | 0.33 | +0.83 | -0.12 | -0.34 |
| 16 | `s-12f9db90` | Blend of 2: s-0ba0401c + s-ca284812 | +0.12 | 0.32 | +0.67 | -0.49 | +0.20 |
| 17 | `s-320905ad` | Blend of 2: s-0ba0401c + s-ca3ccd7b | +0.12 | 0.32 | +0.67 | -0.49 | +0.20 |
| 18 | `s-34a37f81` | Blend of 3: s-d44f714c + s-64a6990a + s-f86e6943 | +0.11 | 0.32 | +0.66 | -0.21 | -0.11 |
| 19 | `s-a24e8a07` | Blend of 3: s-d44f714c + s-86b6d7ee + s-ca284812 | +0.10 | 0.31 | +0.96 | -0.48 | -0.15 |
| 20 | `s-5a56c939` | Blend of 3: s-64a6990a + s-86b6d7ee + s-ca284812 | +0.10 | 0.31 | +0.96 | -0.48 | -0.15 |
| 21 | `s-7fc9f4a9` | Blend of 2: s-64a6990a + s-ca284812 | +0.10 | 0.30 | +0.83 | -0.53 | +0.01 |
| 22 | `s-ceeacc53` | Blend of 2: s-d44f714c + s-ca284812 | +0.10 | 0.29 | +0.83 | -0.54 | +0.01 |
| 23 | `s-45283f07` | Blend of 2: s-d44f714c + s-ca3ccd7b | +0.10 | 0.29 | +0.83 | -0.54 | +0.01 |
| 24 | `s-a642eb54` | Blend of 2: s-64a6990a + s-ca3ccd7b | +0.10 | 0.29 | +0.83 | -0.54 | +0.01 |
| 25 | `s-e6cda253` | Blend of 5: s-d44f714c + s-64a6990a + s-0ba0401c + s-86b6d7ee + s-f86e6943 | +0.10 | 0.26 | +0.67 | -0.22 | -0.15 |

## What the search learned (exploratory)

- moneyline · elo_ml · `hfa_elo`: best 75 (median t -2.56), worst 125 (-2.86) over 454 configurations
- moneyline · elo_ml · `hfa_mode`: best fixed (median t -2.45), worst rolling (-2.86) over 454 configurations
- moneyline · elo_ml · `k`: best 32 (median t -1.79), worst 15 (-3.55) over 454 configurations
- moneyline · elo_ml · `mov`: best 538 (median t -1.62), worst none (-3.63) over 454 configurations
- moneyline · elo_ml · `prob`: best fit (median t -1.83), worst elo (-4.37) over 454 configurations
- moneyline · elo_ml · `revert`: best 0.25 (median t -2.52), worst 0.6 (-3.28) over 454 configurations
- moneyline · rating_ml · `def_weight`: best 1.0 (median t -1.78), worst 0.5 (-3.54) over 110 configurations
- moneyline · rating_ml · `halflife`: best 20 (median t -1.88), worst 3 (-2.76) over 110 configurations
- moneyline · rating_ml · `season_carry`: best 0.5 (median t -2.01), worst 0.8 (-2.67) over 110 configurations
- moneyline · srs_ml · `carry`: best 0.5 (median t -1.30), worst 0.8 (-2.09) over 236 configurations
- moneyline · srs_ml · `hfa_pts`: best 2.0 (median t -1.32), worst 5.0 (-2.07) over 236 configurations
- moneyline · srs_ml · `prior_w`: best 8 (median t -1.14), worst 32 (-2.33) over 236 configurations
