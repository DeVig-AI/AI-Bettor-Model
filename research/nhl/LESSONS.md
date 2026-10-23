# Research Lab -- lessons, NHL (EXPLORATORY)

_Generated 2026-10-23T18:25:08Z by research/lab/report.py after each run. **Exploratory, not proof**: each line compares a candidate with the one it builds on, gate by gate, with no correction for how many comparisons there are. Only the Inspector General's verdicts and the sealed exam decide anything._

- **helped**: beat its parent in all three gates · **faded**: helped in the first gate but by less than half as much (or not at all) in the last · **no effect**: anything else. A candidate is only compared with a parent that ran under the same Constitution version (same seasons).
- Lines starting **Signal** come from the search, refreshed every round: the signal on a base model vs that base alone in each search period (2014–2016 only); **helped** = better in all three periods on most of the bases it was tried on.

## Helped (0)

- none

## Faded (0)

- none

## No effect (0)

- none

## What the search learned (1,066 configurations, 2014–2016 only)

- moneyline · elo_ml · `k`: best 4 (median t +0.12), worst 8 (-0.15) over 411 configurations
- moneyline · elo_ml · `prob`: best fit (median t +0.10), worst elo (-0.20) over 411 configurations
- moneyline · elo_ml · `revert`: best 0.25 (median t +0.27), worst 0.6 (-0.26) over 411 configurations
- moneyline · rating_ml · `def_weight`: best 0.75 (median t +0.31), worst 1.0 (-0.20) over 99 configurations
- moneyline · rating_ml · `halflife`: best 60 (median t +0.84), worst 5 (-0.69) over 99 configurations
- moneyline · rating_ml · `season_carry`: best 0.8 (median t +0.73), worst 0.2 (-0.32) over 99 configurations
- moneyline · srs_ml · `carry`: best 0.7 (median t -0.79), worst 0.3 (-1.06) over 143 configurations
- moneyline · srs_ml · `prior_w`: best 16 (median t -0.23), worst 2 (-1.04) over 143 configurations
- total · pace_eff · `halflife`: best 5 (median t +0.02), worst 40 (-1.88) over 41 configurations
- total · pace_eff · `season_carry`: best 0.3 (median t -0.70), worst 0.7 (-1.37) over 41 configurations
- total · team_rating · `def_weight`: best 1.0 (median t +0.54), worst 0.5 (+0.26) over 106 configurations
- total · team_rating · `halflife`: best 60 (median t +0.87), worst 10 (-0.54) over 106 configurations
- total · team_rating · `season_carry`: best 0.6 (median t +0.63), worst 0.3 (+0.28) over 106 configurations
