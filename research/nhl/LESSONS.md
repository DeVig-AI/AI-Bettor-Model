# Research Lab -- lessons, NHL (EXPLORATORY)

_Generated 2026-10-29T20:35:18Z by research/lab/report.py after each run. **Exploratory, not proof**: each line compares a candidate with the one it builds on, gate by gate, with no correction for how many comparisons there are. Only the Inspector General's verdicts and the sealed exam decide anything._

- **helped**: beat its parent in all three gates · **faded**: helped in the first gate but by less than half as much (or not at all) in the last · **no effect**: anything else. A candidate is only compared with a parent that ran under the same Constitution version (same seasons).
- Lines starting **Signal** come from the search, refreshed every round: the signal on a base model vs that base alone in each search period (2014–2016 only); **helped** = better in all three periods on most of the bases it was tried on.

## Helped (0)

- none

## Faded (0)

- none

## No effect (0)

- none

## What the search learned (100,603 configurations, 2014–2016 only)

- moneyline · elo_ml · `hfa_elo`: best 78 (median t +0.31), worst 20 (-inf) over 95428 configurations
- moneyline · elo_ml · `hfa_mode`: best fixed (median t -inf), worst fixed (-inf) over 95428 configurations
- moneyline · elo_ml · `k`: best 4 (median t -inf), worst 4 (-inf) over 95428 configurations
- moneyline · elo_ml · `market_blend`: best 0.5312 (median t -0.17), worst 0.0 (-inf) over 95428 configurations
- moneyline · elo_ml · `mov`: best none (median t -inf), worst none (-inf) over 95428 configurations
- moneyline · elo_ml · `prob`: best elo (median t -inf), worst elo (-inf) over 95428 configurations
- moneyline · elo_ml · `revert`: best 0.125 (median t +0.20), worst 0.25 (-inf) over 95428 configurations
- moneyline · rating_ml · `halflife`: best 55 (median t +0.96), worst 10 (-0.68) over 623 configurations
- moneyline · rating_ml · `season_carry`: best 0.7 (median t +0.99), worst 0.2 (+0.07) over 623 configurations
- moneyline · srs_ml · `carry`: best 0.975 (median t +0.06), worst 0.2 (-0.63) over 2806 configurations
- moneyline · srs_ml · `prior_w`: best 40.0 (median t +0.63), worst 4 (-0.97) over 2806 configurations
- total · pace_eff · `halflife`: best 5 (median t +0.02), worst 35 (-1.88) over 208 configurations
- total · team_rating · `halflife`: best 60 (median t +0.94), worst 10 (-0.56) over 623 configurations
- total · team_rating · `season_carry`: best 0.5625 (median t +0.85), worst 0.3 (+0.37) over 623 configurations
