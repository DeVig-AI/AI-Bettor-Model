# Research Lab -- lessons, NHL (EXPLORATORY)

_Generated 2026-10-23T17:48:55Z by research/lab/report.py after each run. **Exploratory, not proof**: each line compares a candidate with the one it builds on, gate by gate, with no correction for how many comparisons there are. Only the Inspector General's verdicts and the sealed exam decide anything._

- **helped**: beat its parent in all three gates · **faded**: helped in the first gate but by less than half as much (or not at all) in the last · **no effect**: anything else. A candidate is only compared with a parent that ran under the same Constitution version (same seasons).
- Lines starting **Signal** come from the search, refreshed every round: the signal on a base model vs that base alone in each search period (2014–2016 only); **helped** = better in all three periods on most of the bases it was tried on.

## Helped (0)

- none

## Faded (0)

- none

## No effect (0)

- none

## What the search learned (540 configurations, 2014–2016 only)

- moneyline · elo_ml · `prob`: best fit (median t +0.22), worst elo (-0.29) over 200 configurations
- moneyline · elo_ml · `revert`: best 0.25 (median t +0.32), worst 0.6 (-0.21) over 200 configurations
- moneyline · rating_ml · `def_weight`: best 0.5 (median t +0.08), worst 1.0 (-0.20) over 53 configurations
- moneyline · rating_ml · `halflife`: best 60 (median t +0.84), worst 5 (-0.65) over 53 configurations
- moneyline · rating_ml · `season_carry`: best 0.7 (median t +0.65), worst 0.8 (-0.66) over 53 configurations
- moneyline · srs_ml · `carry`: best 0.7 (median t -0.81), worst 0.2 (-1.13) over 66 configurations
- moneyline · srs_ml · `hfa_pts`: best 0.05 (median t -0.75), worst 0.3 (-1.04) over 66 configurations
- moneyline · srs_ml · `prior_w`: best 16 (median t -0.22), worst 2 (-1.09) over 66 configurations
- total · pace_eff · `halflife`: best 5 (median t +0.06), worst 40 (-1.89) over 26 configurations
- total · pace_eff · `season_carry`: best 0.8 (median t -0.94), worst 0.7 (-1.74) over 26 configurations
- total · team_rating · `def_weight`: best 1.0 (median t +0.63), worst 0.5 (+0.17) over 55 configurations
- total · team_rating · `halflife`: best 60 (median t +0.91), worst 10 (-0.51) over 55 configurations
- total · team_rating · `season_carry`: best 0.5 (median t +0.53), worst 0.2 (-0.27) over 55 configurations
