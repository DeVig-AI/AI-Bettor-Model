# Research Lab search (SOCCER) -- leaderboard (EXPLORATORY)

_Generated 2026-11-08T22:51:46Z by research/lab/search.py. Scores are on the search seasons 2020–2022 only: effect = cover points (moneyline: win-chance points) per game beyond the line-only baseline, t = effect ÷ its standard error. Thousands of tries mean the best t here is partly luck: that is why only the shortlist is confirmed, on seasons the search never saw._

20743 configurations scored so far.

## Moneyline -- top 25 of 20743

| # | id | model | effect | t | 2020 | 2021 | 2022 |
|---|---|---|---|---|---|---|---|
| 1 | `s-4b87a575` | Blend of 2: s-411bb5c9 + s-bf6e1b8f | +0.29 | 0.34 | +1.79 | +0.18 | -1.15 |
| 2 | `s-d6989336` | Blend of 2: s-cf899dec + s-bf6e1b8f | +0.26 | 0.31 | +1.37 | +0.59 | -1.22 |
| 3 | `s-26b97cea` | Blend of 2: s-cf899dec + s-8857adc9 | +0.25 | 0.30 | +1.50 | +0.48 | -1.26 |
| 4 | `s-cf899dec` | Elo · K19 · fixed home edge · 538 margin · revert 0.00 · market blend 1 · win chance fit on training | +0.25 | 0.30 | +1.50 | +0.51 | -1.31 |
| 5 | `s-411bb5c9` | Elo · K19 · fixed home edge · 538 margin · revert 0.00 · win chance fit on training | +0.24 | 0.29 | +1.60 | +0.25 | -1.16 |
| 6 | `s-296a7e4b` | Blend of 2: s-8973ca25 + s-8857adc9 | +0.23 | 0.28 | +1.67 | +0.19 | -1.20 |
| 7 | `s-e11b6354` | Blend of 2: s-b1095140 + s-8857adc9 | +0.22 | 0.27 | +1.82 | +0.20 | -1.40 |
| 8 | `s-4ce13fdb` | Blend of 2: s-411bb5c9 + s-b1095140 | +0.20 | 0.24 | +1.68 | +0.38 | -1.49 |
| 9 | `s-e1d32585` | Blend of 3: s-cf899dec + s-411bb5c9 + s-8973ca25 | +0.20 | 0.24 | +1.75 | +0.33 | -1.52 |
| 10 | `s-9ab3ff36` | Blend of 2: s-bf6e1b8f + s-8857adc9 | +0.20 | 0.24 | +1.60 | +0.25 | -1.27 |
| 11 | `s-8973ca25` | Elo · K20 · fixed home edge · 538 margin · revert 0.03 · win chance fit on training | +0.20 | 0.24 | +1.45 | +0.34 | -1.23 |
| 12 | `s-9dc3de98` | Elo · K20 · fixed home edge · 538 margin · revert 0.10 · win chance fit on training | +0.19 | 0.23 | +1.61 | +0.15 | -1.23 |
| 13 | `s-f5f15e25` | Blend of 2: s-d982d235 + s-3d5ec3dc | +0.19 | 0.23 | +1.67 | +0.15 | -1.30 |
| 14 | `s-59526383` | Elo · K10 · home edge by season · 538 margin · revert 0.00 · market blend 0.25 · win chance fit on training | +0.20 | 0.23 | +1.37 | +1.27 | -2.10 |
| 15 | `s-3fd553d5` | Elo · K10 · home edge by season · 538 margin · revert 0.00 · market blend 0.25 · win chance fit on training | +0.20 | 0.23 | +1.37 | +1.27 | -2.10 |
| 16 | `s-6cec6e21` | Blend of 2: s-3fd553d5 + s-59526383 | +0.20 | 0.23 | +1.37 | +1.27 | -2.10 |
| 17 | `s-fdf6339b` | Blend of 2: s-3fd553d5 + s-3e786a42 | +0.20 | 0.23 | +1.37 | +1.27 | -2.10 |
| 18 | `s-4f83fbe3` | Blend of 2: s-3fd553d5 + s-4179d072 | +0.20 | 0.23 | +1.37 | +1.27 | -2.10 |
| 19 | `s-33359b60` | Blend of 2: s-3fd553d5 + s-8810d0fa | +0.20 | 0.23 | +1.37 | +1.27 | -2.10 |
| 20 | `s-d32978c4` | Blend of 2: s-3fd553d5 + s-fdeb6606 | +0.20 | 0.23 | +1.37 | +1.27 | -2.10 |
| 21 | `s-36b02c9b` | Blend of 2: s-59526383 + s-fdeb6606 | +0.20 | 0.23 | +1.37 | +1.27 | -2.10 |
| 22 | `s-7cccc272` | Blend of 3: s-3fd553d5 + s-59526383 + s-3e786a42 | +0.20 | 0.23 | +1.37 | +1.27 | -2.10 |
| 23 | `s-137c2b12` | Blend of 3: s-3fd553d5 + s-59526383 + s-4179d072 | +0.20 | 0.23 | +1.37 | +1.27 | -2.10 |
| 24 | `s-7530ae4d` | Blend of 3: s-3fd553d5 + s-59526383 + s-8810d0fa | +0.20 | 0.23 | +1.37 | +1.27 | -2.10 |
| 25 | `s-e7eec144` | Blend of 2: s-3fd553d5 + s-5ada354d | +0.20 | 0.23 | +1.37 | +1.27 | -2.10 |

## What the search learned (exploratory)

- moneyline · elo_ml · `hfa_elo`: best 35 (median t -0.12), worst 30 (-inf) over 18543 configurations
- moneyline · elo_ml · `hfa_mode`: best fixed (median t -inf), worst fixed (-inf) over 18543 configurations
- moneyline · elo_ml · `k`: best 21 (median t +0.04), worst 10 (-inf) over 18543 configurations
- moneyline · elo_ml · `market_blend`: best 0.1875 (median t -0.93), worst 0.0 (-inf) over 18543 configurations
- moneyline · elo_ml · `mov`: best none (median t -inf), worst none (-inf) over 18543 configurations
- moneyline · elo_ml · `revert`: best 0.0625 (median t +0.03), worst 0.1 (-inf) over 18543 configurations
- moneyline · rating_ml · `def_weight`: best 1.0 (median t -0.85), worst 0.5 (-1.26) over 435 configurations
- moneyline · rating_ml · `halflife`: best 1 (median t -0.60), worst 10 (-1.30) over 435 configurations
- moneyline · rating_ml · `season_carry`: best 0.85 (median t -0.74), worst 0.2 (-1.91) over 435 configurations
- moneyline · srs_ml · `carry`: best 0.575 (median t -0.88), worst 0.2 (-1.47) over 1365 configurations
- moneyline · srs_ml · `hfa_pts`: best 0.175 (median t -1.11), worst 0.5 (-1.41) over 1365 configurations
- moneyline · srs_ml · `margin_cap`: best 3 (median t -0.97), worst None (-1.53) over 1365 configurations
- moneyline · srs_ml · `prior_w`: best 3 (median t -1.25), worst 8 (-1.60) over 1365 configurations
