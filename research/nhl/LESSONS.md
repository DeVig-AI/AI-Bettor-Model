# Research Lab -- lessons, NHL (EXPLORATORY)

_Generated 2026-10-29T16:01:43Z by research/lab/report.py after each run. **Exploratory, not proof**: each line compares a candidate with the one it builds on, gate by gate, with no correction for how many comparisons there are. Only the Inspector General's verdicts and the sealed exam decide anything._

- **helped**: beat its parent in all three gates · **faded**: helped in the first gate but by less than half as much (or not at all) in the last · **no effect**: anything else. A candidate is only compared with a parent that ran under the same Constitution version (same seasons).
- Lines starting **Signal** come from the search, refreshed every round: the signal on a base model vs that base alone in each search period (2014–2016 only); **helped** = better in all three periods on most of the bases it was tried on.

## Helped (0)

- none

## Faded (0)

- none

## No effect (0)

- none

## What the search learned (98,067 configurations, 2014–2016 only)

- moneyline · elo_ml · `hfa_elo`: best 78 (median t +0.40), worst 20 (-inf) over 93788 configurations
- moneyline · elo_ml · `hfa_mode`: best fixed (median t -inf), worst fixed (-inf) over 93788 configurations
- moneyline · elo_ml · `k`: best 4 (median t -inf), worst 4 (-inf) over 93788 configurations
- moneyline · elo_ml · `market_blend`: best 0.5312 (median t +0.28), worst 0.0 (-inf) over 93788 configurations
- moneyline · elo_ml · `mov`: best none (median t -inf), worst none (-inf) over 93788 configurations
- moneyline · elo_ml · `prob`: best elo (median t -inf), worst elo (-inf) over 93788 configurations
- moneyline · elo_ml · `revert`: best 0.05 (median t +0.46), worst 0.25 (-inf) over 93788 configurations
- moneyline · rating_ml · `def_weight`: best 0.75 (median t +0.78), worst 0.5 (+0.52) over 561 configurations
- moneyline · rating_ml · `halflife`: best 55 (median t +0.97), worst 10 (-0.67) over 561 configurations
- moneyline · rating_ml · `season_carry`: best 0.7 (median t +0.97), worst 0.2 (+0.04) over 561 configurations
- moneyline · srs_ml · `carry`: best 0.925 (median t +0.53), worst 0.2 (-0.68) over 2045 configurations
- moneyline · srs_ml · `hfa_pts`: best 0.25 (median t +0.00), worst 0.05 (-0.57) over 2045 configurations
- moneyline · srs_ml · `prior_w`: best 40.0 (median t +0.63), worst 4 (-0.97) over 2045 configurations
- total · pace_eff · `halflife`: best 5 (median t +0.02), worst 35 (-1.88) over 202 configurations
- total · team_rating · `halflife`: best 60 (median t +0.94), worst 10 (-0.56) over 578 configurations
- total · team_rating · `season_carry`: best 0.5625 (median t +0.93), worst 0.2 (+0.36) over 578 configurations
