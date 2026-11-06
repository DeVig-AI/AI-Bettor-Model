# Research Lab search (SOCCER) -- leaderboard (EXPLORATORY)

_Generated 2026-11-06T02:36:14Z by research/lab/search.py. Scores are on the search seasons 2020–2022 only: effect = cover points (moneyline: win-chance points) per game beyond the line-only baseline, t = effect ÷ its standard error. Thousands of tries mean the best t here is partly luck: that is why only the shortlist is confirmed, on seasons the search never saw._

470 configurations scored so far.

## Moneyline -- top 25 of 470

| # | id | model | effect | t | 2020 | 2021 | 2022 |
|---|---|---|---|---|---|---|---|
| 1 | `s-f5f15e25` | Blend of 2: s-d982d235 + s-3d5ec3dc | +0.19 | 0.23 | +1.67 | +0.15 | -1.30 |
| 2 | `s-d982d235` | Elo · K20 · fixed home edge · 538 margin · revert 0.10 · win chance fit on training | +0.10 | 0.12 | +1.59 | +0.04 | -1.36 |
| 3 | `s-3d5ec3dc` | Elo · K20 · fixed home edge · 538 margin · revert 0.10 · win chance fit on training | +0.07 | 0.09 | +1.73 | +0.09 | -1.63 |
| 4 | `s-6f1da4b7` | Elo · K20 · home edge by season · revert 0.10 · win chance fit on training | +0.03 | 0.04 | +1.15 | +0.23 | -1.31 |
| 5 | `s-cafff26d` | Elo · K20 · home edge by season · revert 0.10 · win chance fit on training | +0.03 | 0.04 | +1.15 | +0.23 | -1.31 |
| 6 | `s-865f2dd1` | Elo · K20 · home edge by season · revert 0.10 · win chance fit on training | +0.03 | 0.04 | +1.15 | +0.23 | -1.31 |
| 7 | `s-79750054` | Blend of 2: s-6f1da4b7 + s-865f2dd1 | +0.03 | 0.04 | +1.15 | +0.23 | -1.31 |
| 8 | `s-47ec917f` | Blend of 2: s-6f1da4b7 + s-cafff26d | +0.03 | 0.04 | +1.15 | +0.23 | -1.31 |
| 9 | `s-106045d2` | Blend of 2: s-6f1da4b7 + s-3ab6d926 | +0.03 | 0.04 | +1.15 | +0.23 | -1.31 |
| 10 | `s-36d69ffd` | Blend of 2: s-865f2dd1 + s-cafff26d | +0.03 | 0.04 | +1.15 | +0.23 | -1.31 |
| 11 | `s-5b9bc49a` | Blend of 2: s-865f2dd1 + s-3ab6d926 | +0.03 | 0.04 | +1.15 | +0.23 | -1.31 |
| 12 | `s-b7c0bfce` | Blend of 2: s-cafff26d + s-3ab6d926 | +0.03 | 0.04 | +1.15 | +0.23 | -1.31 |
| 13 | `s-e54efa23` | Blend of 3: s-6f1da4b7 + s-865f2dd1 + s-cafff26d | +0.03 | 0.04 | +1.15 | +0.23 | -1.31 |
| 14 | `s-8e778b1d` | Blend of 3: s-6f1da4b7 + s-865f2dd1 + s-3ab6d926 | +0.03 | 0.04 | +1.15 | +0.23 | -1.31 |
| 15 | `s-ff3b2b2a` | Blend of 3: s-6f1da4b7 + s-cafff26d + s-3ab6d926 | +0.03 | 0.04 | +1.15 | +0.23 | -1.31 |
| 16 | `s-da810b0d` | Blend of 3: s-865f2dd1 + s-cafff26d + s-3ab6d926 | +0.03 | 0.04 | +1.15 | +0.23 | -1.31 |
| 17 | `s-2217a182` | Blend of 2: s-3d5ec3dc + s-73de7555 | +0.03 | 0.03 | +1.54 | -0.04 | -1.45 |
| 18 | `s-3ab6d926` | Elo · K20 · home edge by season · revert 0.10 · win chance fit on training | +0.03 | 0.03 | +1.15 | +0.21 | -1.31 |
| 19 | `s-73de7555` | Elo · K20 · fixed home edge · 538 margin · revert 0.10 · win chance fit on training | +0.02 | 0.02 | +1.51 | -0.03 | -1.46 |
| 20 | `s-2f3366fe` | Elo · K15 · home edge by season · revert 0.20 · win chance fit on training | +0.00 | 0.00 | +1.64 | -0.29 | -1.37 |
| 21 | `s-ef04b002` | Elo · K15 · home edge by season · revert 0.20 · win chance fit on training | +0.00 | 0.00 | +1.64 | -0.29 | -1.37 |
| 22 | `s-f71fae88` | Elo · K15 · home edge by season · revert 0.20 · win chance fit on training | +0.00 | 0.00 | +1.64 | -0.29 | -1.37 |
| 23 | `s-3553a7d2` | Elo · K15 · home edge by season · revert 0.20 · win chance fit on training | +0.00 | 0.00 | +1.64 | -0.29 | -1.37 |
| 24 | `s-56e12df0` | Blend of 2: s-2f3366fe + s-3553a7d2 | +0.00 | 0.00 | +1.64 | -0.29 | -1.37 |
| 25 | `s-17c89670` | Blend of 2: s-2f3366fe + s-ef04b002 | +0.00 | 0.00 | +1.64 | -0.29 | -1.37 |

## What the search learned (exploratory)

- moneyline · elo_ml · `hfa_mode`: best rolling (median t -0.32), worst fixed (-0.62) over 200 configurations
- moneyline · elo_ml · `revert`: best 0.1 (median t -0.24), worst 0.5 (-0.90) over 200 configurations
- moneyline · rating_ml · `def_weight`: best 1.0 (median t -1.06), worst 0.5 (-1.45) over 72 configurations
- moneyline · rating_ml · `halflife`: best 3 (median t -0.88), worst 5 (-1.41) over 72 configurations
- moneyline · rating_ml · `season_carry`: best 0.8 (median t -0.80), worst 0.2 (-1.90) over 72 configurations
- moneyline · srs_ml · `carry`: best 0.5 (median t -1.23), worst 0.2 (-1.57) over 128 configurations
- moneyline · srs_ml · `margin_cap`: best 3 (median t -1.01), worst None (-1.59) over 128 configurations
- moneyline · srs_ml · `prior_w`: best 2 (median t -1.20), worst 8 (-1.66) over 128 configurations
