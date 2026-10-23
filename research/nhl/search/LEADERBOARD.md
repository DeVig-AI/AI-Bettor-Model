# Research Lab search (NHL) -- leaderboard (EXPLORATORY)

_Generated 2026-10-23T18:52:34Z by research/lab/search.py. Scores are on the search seasons 2014–2016 only: effect = cover points (moneyline: win-chance points) per game beyond the line-only baseline, t = effect ÷ its standard error. Thousands of tries mean the best t here is partly luck: that is why only the shortlist is confirmed, on seasons the search never saw._

1520 configurations scored so far.

## Moneyline -- top 25 of 1231

| # | id | model | effect | t | 2014 | 2015 | 2016 |
|---|---|---|---|---|---|---|---|
| 1 | `s-80d57a4d` | Blend of 2: s-8fa50c11 + s-97285eac | +1.34 | 1.98 | +1.06 | +0.13 | +2.83 |
| 2 | `s-f88de69e` | Blend of 3: s-5e90df05 + s-8fa50c11 + s-97285eac | +1.31 | 1.93 | +0.94 | +0.13 | +2.86 |
| 3 | `s-5e90df05` | Elo · K8 · fixed home edge · 538 margin · revert 0.25 · Elo win chance | +1.31 | 1.92 | +0.88 | +0.19 | +2.86 |
| 4 | `s-862460a8` | Blend of 2: s-5e90df05 + s-97285eac | +1.24 | 1.81 | +0.55 | +0.17 | +3.00 |
| 5 | `s-13207e0e` | Blend of 2: s-5e90df05 + s-8fa50c11 | +1.10 | 1.64 | +0.60 | -0.24 | +2.93 |
| 6 | `s-bed8e594` | Blend of 5 (fitted weights): s-5e90df05 + s-8fa50c11 + s-36a74647 + s-6df55070 + s-f1954d8f | +1.62 | 1.56 | +2.44 | +1.24 | +1.18 |
| 7 | `s-8fa50c11` | Elo · K8 · fixed home edge · 538 margin · revert 0.33 · Elo win chance | +1.01 | 1.54 | +0.34 | -0.25 | +2.95 |
| 8 | `s-bfb6f495` | Blend of 2: s-6df55070 + s-3da0d56d | +1.58 | 1.52 | +1.62 | +1.33 | +1.80 |
| 9 | `s-737449fb` | Blend of 2: s-6df55070 + s-f1954d8f | +1.56 | 1.50 | +2.10 | +1.09 | +1.50 |
| 10 | `s-a0d226e9` | Blend of 3: s-6df55070 + s-f1954d8f + s-3da0d56d | +1.55 | 1.48 | +1.87 | +1.38 | +1.39 |
| 11 | `s-8ca627bc` | Blend of 3: s-51a075bd + s-2330871e + s-3da0d56d | +1.54 | 1.47 | +1.51 | +1.39 | +1.71 |
| 12 | `s-36a74647` | Elo · K6 · fixed home edge · 538 margin · revert 0.40 · Elo win chance | +0.62 | 1.47 | +0.32 | +0.15 | +1.40 |
| 13 | `s-4f5d971e` | Blend of 2: s-f1954d8f + s-2330871e | +1.50 | 1.44 | +1.81 | +1.10 | +1.59 |
| 14 | `s-0730fa8f` | Blend of 8 (fitted weights): s-5e90df05 + s-8fa50c11 + s-36a74647 + s-6df55070 + s-f1954d8f + s-97285eac + s-85bcc219 + s-51a075bd | +1.49 | 1.43 | +1.87 | +1.29 | +1.31 |
| 15 | `s-35f9746d` | Blend of 2: s-6df55070 + s-51a075bd | +1.48 | 1.42 | +1.87 | +1.58 | +1.01 |
| 16 | `s-360ed5c2` | Blend of 3: s-f1954d8f + s-2330871e + s-3da0d56d | +1.47 | 1.41 | +1.43 | +1.31 | +1.66 |
| 17 | `s-a1cf90a9` | Blend of 2: s-6df55070 + s-2a794c8f | +1.47 | 1.41 | +1.61 | +1.89 | +0.92 |
| 18 | `s-b63f2fd0` | Blend of 2: s-51a075bd + s-3da0d56d | +1.47 | 1.41 | +1.71 | +1.14 | +1.56 |
| 19 | `s-cc8a4636` | Blend of 3: s-f1954d8f + s-51a075bd + s-3da0d56d | +1.45 | 1.39 | +1.60 | +1.30 | +1.47 |
| 20 | `s-6df55070` | Points rating · half-life 40 · carry 0.8 · defense ×0.5 · win chance fit on training | +1.44 | 1.39 | +2.11 | +1.33 | +0.89 |
| 21 | `s-1afcc84c` | Blend of 2: s-f1954d8f + s-51a075bd | +1.45 | 1.39 | +1.51 | +1.13 | +1.71 |
| 22 | `s-9e563a2b` | Blend of 3: s-6df55070 + s-f1954d8f + s-2330871e | +1.43 | 1.38 | +1.99 | +0.60 | +1.71 |
| 23 | `s-3fee77f1` | Blend of 5: s-5e90df05 + s-6df55070 + s-f1954d8f + s-51a075bd + s-2330871e | +1.31 | 1.35 | +1.30 | +0.49 | +2.14 |
| 24 | `s-f1954d8f` | Points rating · half-life 60 · carry 0.8 · defense ×0.5 · win chance fit on training | +1.40 | 1.35 | +1.21 | +0.84 | +2.16 |
| 25 | `s-97285eac` | Elo · K8 · fixed home edge · 538 margin · revert 0.20 · Elo win chance | +0.93 | 1.34 | +0.14 | -0.01 | +2.65 |

## Total -- top 25 of 289

| # | id | model | effect | t | 2014 | 2015 | 2016 |
|---|---|---|---|---|---|---|---|
| 1 | `s-c5fdc271` | Blend of 2: s-664d92ad + s-02e13d2b | +0.04 | 1.43 | +0.02 | +0.03 | +0.07 |
| 2 | `s-c048ee1a` | Blend of 2: s-84b04f41 + s-8b16d824 | +0.04 | 1.43 | -0.00 | +0.06 | +0.05 |
| 3 | `s-02fdebce` | Blend of 2: s-84b04f41 + s-664d92ad | +0.04 | 1.42 | -0.01 | +0.06 | +0.05 |
| 4 | `s-afde3f20` | Blend of 2: s-03b5cf05 + s-4e151616 | +0.03 | 1.39 | +0.01 | +0.05 | +0.04 |
| 5 | `s-c12e6ed5` | Blend of 2: s-e699f8d2 + s-bfb48ec6 | +0.04 | 1.39 | -0.00 | +0.06 | +0.05 |
| 6 | `s-4306aa80` | Blend of 3: s-9bf7e7dd + s-03b5cf05 + s-e699f8d2 | +0.03 | 1.37 | -0.00 | +0.05 | +0.05 |
| 7 | `s-e687ddd4` | Blend of 2: s-e699f8d2 + s-8cb5fe9d | +0.04 | 1.37 | +0.03 | +0.03 | +0.05 |
| 8 | `s-41708abd` | Blend of 3: s-03b5cf05 + s-cf1aa7ba + s-664d92ad | +0.03 | 1.34 | +0.00 | +0.04 | +0.05 |
| 9 | `s-1356bba7` | Blend of 3: s-03b5cf05 + s-bfb48ec6 + s-cf1aa7ba | +0.03 | 1.33 | -0.00 | +0.05 | +0.05 |
| 10 | `s-f121eeec` | Blend of 3: s-03b5cf05 + s-84b04f41 + s-8b16d824 | +0.03 | 1.33 | +0.00 | +0.05 | +0.05 |
| 11 | `s-42e57a11` | Blend of 5 (fitted weights): s-9bf7e7dd + s-03b5cf05 + s-84b04f41 + s-e699f8d2 + s-8b16d824 | +0.03 | 1.33 | +0.01 | +0.05 | +0.04 |
| 12 | `s-e22a713a` | Blend of 3: s-03b5cf05 + s-e699f8d2 + s-cf1aa7ba | +0.03 | 1.33 | +0.01 | +0.04 | +0.05 |
| 13 | `s-e245a3b6` | Blend of 2: s-664d92ad + s-8cb5fe9d | +0.03 | 1.30 | +0.01 | +0.03 | +0.06 |
| 14 | `s-acaa02c2` | Blend of 3: s-84b04f41 + s-e699f8d2 + s-8b16d824 | +0.03 | 1.30 | -0.01 | +0.06 | +0.05 |
| 15 | `s-126a0708` | Blend of 2: s-9bf7e7dd + s-cf1aa7ba | +0.03 | 1.29 | +0.01 | +0.03 | +0.05 |
| 16 | `s-5a414a07` | Blend of 2: s-e699f8d2 + s-664d92ad | +0.03 | 1.29 | -0.00 | +0.05 | +0.05 |
| 17 | `s-33acd633` | Blend of 3: s-84b04f41 + s-8b16d824 + s-bfb48ec6 | +0.03 | 1.29 | -0.01 | +0.06 | +0.05 |
| 18 | `s-d0dab786` | Blend of 2: s-84b04f41 + s-cf1aa7ba | +0.03 | 1.28 | +0.00 | +0.04 | +0.05 |
| 19 | `s-d69d54f9` | Blend of 2: s-9bf7e7dd + s-03b5cf05 | +0.03 | 1.27 | +0.01 | +0.04 | +0.05 |
| 20 | `s-d882457e` | Blend of 3: s-9bf7e7dd + s-03b5cf05 + s-8b16d824 | +0.03 | 1.25 | -0.00 | +0.05 | +0.05 |
| 21 | `s-18568b1e` | Blend of 3: s-cf1aa7ba + s-664d92ad + s-1986551b | +0.03 | 1.25 | +0.00 | +0.04 | +0.06 |
| 22 | `s-612a0b1e` | Blend of 3: s-03b5cf05 + s-cf1aa7ba + s-1986551b | +0.03 | 1.24 | +0.02 | +0.02 | +0.05 |
| 23 | `s-05f63884` | Blend of 2: s-cf1aa7ba + s-4e151616 | +0.03 | 1.23 | +0.01 | +0.03 | +0.05 |
| 24 | `s-d5c49599` | Blend of 2: s-03b5cf05 + s-a9e4a30e | +0.03 | 1.23 | +0.02 | +0.02 | +0.06 |
| 25 | `s-ddad22bd` | Blend of 2: s-a9e4a30e + s-664d92ad | +0.03 | 1.22 | +0.01 | +0.04 | +0.05 |

## What the search learned (exploratory)

- moneyline · elo_ml · `hfa_elo`: best 80 (median t +0.45), worst 20 (-0.12) over 731 configurations
- moneyline · elo_ml · `k`: best 2 (median t +0.43), worst 16 (-0.29) over 731 configurations
- moneyline · elo_ml · `market_blend`: best 0.0 (median t -0.08), worst 0.25 (-inf) over 731 configurations
- moneyline · elo_ml · `revert`: best 0.2 (median t +0.67), worst 0.6 (-0.26) over 731 configurations
- moneyline · rating_ml · `def_weight`: best 0.75 (median t +0.07), worst 1.0 (-0.28) over 115 configurations
- moneyline · rating_ml · `halflife`: best 60 (median t +0.84), worst 5 (-0.69) over 115 configurations
- moneyline · rating_ml · `season_carry`: best 0.8 (median t +0.68), worst 0.2 (-0.32) over 115 configurations
- moneyline · srs_ml · `prior_w`: best 16 (median t -0.22), worst 2 (-1.08) over 194 configurations
- total · pace_eff · `halflife`: best 5 (median t +0.02), worst 40 (-1.88) over 42 configurations
- total · pace_eff · `season_carry`: best 0.3 (median t -0.70), worst 0.8 (-1.59) over 42 configurations
- total · team_rating · `def_weight`: best 1.0 (median t +0.54), worst 0.5 (+0.17) over 118 configurations
- total · team_rating · `halflife`: best 60 (median t +0.87), worst 10 (-0.51) over 118 configurations
- total · team_rating · `season_carry`: best 0.6 (median t +0.59), worst 0.8 (+0.16) over 118 configurations
