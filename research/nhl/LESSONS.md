# Research Lab -- lessons, NHL (EXPLORATORY)

_Generated 2026-10-29T14:25:19Z by research/lab/report.py after each run. **Exploratory, not proof**: each line compares a candidate with the one it builds on, gate by gate, with no correction for how many comparisons there are. Only the Inspector General's verdicts and the sealed exam decide anything._

- **helped**: beat its parent in all three gates · **faded**: helped in the first gate but by less than half as much (or not at all) in the last · **no effect**: anything else. A candidate is only compared with a parent that ran under the same Constitution version (same seasons).
- Lines starting **Signal** come from the search, refreshed every round: the signal on a base model vs that base alone in each search period (2014–2016 only); **helped** = better in all three periods on most of the bases it was tried on.

## Helped (0)

- none

## Faded (0)

- none

## No effect (0)

- none

## What the search learned (97,011 configurations, 2014–2016 only)

- moneyline · elo_ml · `hfa_elo`: best 92 (median t +1.02), worst 20 (-inf) over 93273 configurations
- moneyline · elo_ml · `hfa_mode`: best fixed (median t -inf), worst fixed (-inf) over 93273 configurations
- moneyline · elo_ml · `k`: best 4 (median t -inf), worst 4 (-inf) over 93273 configurations
- moneyline · elo_ml · `market_blend`: best 0.0 (median t -inf), worst 0.0 (-inf) over 93273 configurations
- moneyline · elo_ml · `mov`: best none (median t -inf), worst none (-inf) over 93273 configurations
- moneyline · elo_ml · `prob`: best elo (median t -inf), worst elo (-inf) over 93273 configurations
- moneyline · elo_ml · `revert`: best 0.125 (median t +0.46), worst 0.25 (-inf) over 93273 configurations
- moneyline · rating_ml · `halflife`: best 52 (median t +0.92), worst 10 (-0.66) over 443 configurations
- moneyline · rating_ml · `season_carry`: best 0.625 (median t +1.00), worst 0.2 (+0.02) over 443 configurations
- moneyline · srs_ml · `carry`: best 0.625 (median t +0.20), worst 0.2 (-0.75) over 1760 configurations
- moneyline · srs_ml · `hfa_pts`: best 0.25 (median t -0.18), worst 0.0 (-0.62) over 1760 configurations
- moneyline · srs_ml · `prior_w`: best 40.0 (median t +0.61), worst 4 (-0.97) over 1760 configurations
- total · pace_eff · `halflife`: best 5 (median t +0.01), worst 35 (-1.88) over 167 configurations
- total · team_rating · `def_weight`: best 0.75 (median t +0.79), worst 0.5 (+0.46) over 475 configurations
- total · team_rating · `halflife`: best 52 (median t +1.03), worst 10 (-0.53) over 475 configurations
- total · team_rating · `season_carry`: best 0.5625 (median t +1.01), worst 0.2 (+0.33) over 475 configurations
