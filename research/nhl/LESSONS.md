# Research Lab -- lessons, NHL (EXPLORATORY)

_Generated 2026-10-24T07:32:12Z by research/lab/report.py after each run. **Exploratory, not proof**: each line compares a candidate with the one it builds on, gate by gate, with no correction for how many comparisons there are. Only the Inspector General's verdicts and the sealed exam decide anything._

- **helped**: beat its parent in all three gates · **faded**: helped in the first gate but by less than half as much (or not at all) in the last · **no effect**: anything else. A candidate is only compared with a parent that ran under the same Constitution version (same seasons).
- Lines starting **Signal** come from the search, refreshed every round: the signal on a base model vs that base alone in each search period (2014–2016 only); **helped** = better in all three periods on most of the bases it was tried on.

## Helped (0)

- none

## Faded (0)

- none

## No effect (0)

- none

## What the search learned (8,146 configurations, 2014–2016 only)

- moneyline · elo_ml · `hfa_elo`: best 95 (median t +0.66), worst 20 (-inf) over 6894 configurations
- moneyline · elo_ml · `hfa_mode`: best fixed (median t -inf), worst fixed (-inf) over 6894 configurations
- moneyline · elo_ml · `k`: best 5 (median t +0.64), worst 4 (-inf) over 6894 configurations
- moneyline · elo_ml · `market_blend`: best 1.0 (median t -0.07), worst 0.25 (-inf) over 6894 configurations
- moneyline · elo_ml · `mov`: best none (median t -inf), worst none (-inf) over 6894 configurations
- moneyline · elo_ml · `prob`: best elo (median t -inf), worst elo (-inf) over 6894 configurations
- moneyline · elo_ml · `revert`: best 0.2916 (median t +0.78), worst 0.25 (-inf) over 6894 configurations
- moneyline · rating_ml · `def_weight`: best 0.75 (median t +0.38), worst 1.0 (-0.19) over 179 configurations
- moneyline · rating_ml · `halflife`: best 50 (median t +0.84), worst 5 (-0.68) over 179 configurations
- moneyline · rating_ml · `season_carry`: best 0.8 (median t +0.70), worst 0.2 (-0.23) over 179 configurations
- moneyline · srs_ml · `carry`: best 0.75 (median t -0.45), worst 0.2 (-1.06) over 308 configurations
- moneyline · srs_ml · `hfa_pts`: best 0.15 (median t -0.44), worst 0.4 (-1.04) over 308 configurations
- moneyline · srs_ml · `prior_w`: best 24.0 (median t -0.05), worst 2 (-1.06) over 308 configurations
- total · pace_eff · `halflife`: best 5 (median t +0.02), worst 35 (-1.88) over 66 configurations
- total · pace_eff · `season_carry`: best 0.2 (median t -0.71), worst 0.8 (-1.88) over 66 configurations
- total · team_rating · `def_weight`: best 1.0 (median t +0.64), worst 0.5 (+0.26) over 204 configurations
- total · team_rating · `halflife`: best 60 (median t +0.89), worst 10 (-0.55) over 204 configurations
- total · team_rating · `season_carry`: best 0.45 (median t +0.77), worst 0.8 (+0.20) over 204 configurations
