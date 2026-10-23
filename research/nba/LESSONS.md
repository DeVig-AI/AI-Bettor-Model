# Research Lab -- lessons, NBA (EXPLORATORY)

_Generated 2026-10-23T18:49:19Z by research/lab/report.py after each run. **Exploratory, not proof**: each line compares a candidate with the one it builds on, gate by gate, with no correction for how many comparisons there are. Only the Inspector General's verdicts and the sealed exam decide anything._

- **helped**: beat its parent in all three gates · **faded**: helped in the first gate but by less than half as much (or not at all) in the last · **no effect**: anything else. A candidate is only compared with a parent that ran under the same Constitution version (same seasons).
- Lines starting **Signal** come from the search, refreshed every round: the signal on a base model vs that base alone in each search period (2014–2016 only); **helped** = better in all three periods on most of the bases it was tried on.

## Helped (0)

- none

## Faded (0)

- none

## No effect (0)

- none

## What the search learned (1,571 configurations, 2014–2016 only)

- spread · elo · `hfa_elo`: best 75 (median t +0.05), worst 125 (-0.27) over 600 configurations
- spread · elo · `k`: best 10 (median t +0.68), worst 30 (-1.27) over 600 configurations
- spread · elo · `mov`: best none (median t +0.35), worst 538 (-0.86) over 600 configurations
- spread · elo · `revert`: best 0.5 (median t +0.08), worst 0.4 (-0.19) over 600 configurations
- spread · srs · `carry`: best 0.9 (median t +1.05), worst 0.3 (+0.53) over 309 configurations
- spread · srs · `hfa_pts`: best 1.5 (median t +1.12), worst 4.0 (+0.56) over 309 configurations
- spread · srs · `margin_cap`: best 15 (median t +1.02), worst 30 (+0.67) over 309 configurations
- spread · srs · `prior_w`: best 16 (median t +1.14), worst 2 (+0.49) over 309 configurations
- spread · team_rating · `def_weight`: best 1.0 (median t +0.58), worst 0.5 (-0.05) over 105 configurations
- spread · team_rating · `halflife`: best 60 (median t +1.23), worst 5 (-0.09) over 105 configurations
- spread · team_rating · `season_carry`: best 0.4 (median t +0.50), worst 0.3 (+0.00) over 105 configurations
- total · pace_eff · `halflife`: best 3 (median t +0.41), worst 5 (-0.39) over 49 configurations
- total · pace_eff · `season_carry`: best 0.7 (median t +0.02), worst 0.2 (-0.41) over 49 configurations
- total · team_rating · `halflife`: best 3 (median t +0.60), worst 60 (-0.29) over 137 configurations
- total · team_rating · `season_carry`: best 0.6 (median t +0.38), worst 0.3 (+0.04) over 137 configurations
