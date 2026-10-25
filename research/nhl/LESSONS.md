# Research Lab -- lessons, NHL (EXPLORATORY)

_Generated 2026-10-25T18:23:17Z by research/lab/report.py after each run. **Exploratory, not proof**: each line compares a candidate with the one it builds on, gate by gate, with no correction for how many comparisons there are. Only the Inspector General's verdicts and the sealed exam decide anything._

- **helped**: beat its parent in all three gates · **faded**: helped in the first gate but by less than half as much (or not at all) in the last · **no effect**: anything else. A candidate is only compared with a parent that ran under the same Constitution version (same seasons).
- Lines starting **Signal** come from the search, refreshed every round: the signal on a base model vs that base alone in each search period (2014–2016 only); **helped** = better in all three periods on most of the bases it was tried on.

## Helped (0)

- none

## Faded (0)

- none

## No effect (0)

- none

## What the search learned (36,248 configurations, 2014–2016 only)

- moneyline · elo_ml · `hfa_elo`: best 110 (median t +0.50), worst 20 (-inf) over 33740 configurations
- moneyline · elo_ml · `hfa_mode`: best fixed (median t -inf), worst fixed (-inf) over 33740 configurations
- moneyline · elo_ml · `k`: best 4 (median t -inf), worst 4 (-inf) over 33740 configurations
- moneyline · elo_ml · `market_blend`: best 0.6875 (median t +0.45), worst 0.0 (-inf) over 33740 configurations
- moneyline · elo_ml · `mov`: best none (median t -inf), worst none (-inf) over 33740 configurations
- moneyline · elo_ml · `prob`: best elo (median t -inf), worst elo (-inf) over 33740 configurations
- moneyline · elo_ml · `revert`: best 0.1 (median t +0.50), worst 0.25 (-inf) over 33740 configurations
- moneyline · rating_ml · `halflife`: best 55 (median t +0.98), worst 10 (-0.66) over 323 configurations
- moneyline · rating_ml · `season_carry`: best 0.65 (median t +0.95), worst 0.2 (-0.22) over 323 configurations
- moneyline · srs_ml · `carry`: best 0.65 (median t -0.40), worst 0.2 (-0.99) over 960 configurations
- moneyline · srs_ml · `hfa_pts`: best 0.025 (median t -0.37), worst 0.4 (-0.93) over 960 configurations
- moneyline · srs_ml · `prior_w`: best 32.0 (median t +0.34), worst 2 (-0.99) over 960 configurations
- total · pace_eff · `halflife`: best 5 (median t +0.01), worst 35 (-1.88) over 123 configurations
- total · pace_eff · `season_carry`: best 0.2 (median t -1.52), worst 0.5 (-1.88) over 123 configurations
- total · team_rating · `def_weight`: best 0.75 (median t +0.67), worst 0.5 (+0.41) over 345 configurations
- total · team_rating · `halflife`: best 55 (median t +0.91), worst 10 (-0.51) over 345 configurations
- total · team_rating · `season_carry`: best 0.575 (median t +0.90), worst 0.2 (+0.33) over 345 configurations
