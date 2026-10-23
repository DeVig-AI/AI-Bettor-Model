# Research Lab -- lessons, NHL (EXPLORATORY)

_Generated 2026-10-23T18:52:35Z by research/lab/report.py after each run. **Exploratory, not proof**: each line compares a candidate with the one it builds on, gate by gate, with no correction for how many comparisons there are. Only the Inspector General's verdicts and the sealed exam decide anything._

- **helped**: beat its parent in all three gates · **faded**: helped in the first gate but by less than half as much (or not at all) in the last · **no effect**: anything else. A candidate is only compared with a parent that ran under the same Constitution version (same seasons).
- Lines starting **Signal** come from the search, refreshed every round: the signal on a base model vs that base alone in each search period (2014–2016 only); **helped** = better in all three periods on most of the bases it was tried on.

## Helped (0)

- none

## Faded (0)

- none

## No effect (0)

- none

## What the search learned (1,520 configurations, 2014–2016 only)

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
