# Research Lab -- lessons, NBA (EXPLORATORY)

_Generated 2026-10-25T07:26:27Z by research/lab/report.py after each run. **Exploratory, not proof**: each line compares a candidate with the one it builds on, gate by gate, with no correction for how many comparisons there are. Only the Inspector General's verdicts and the sealed exam decide anything._

- **helped**: beat its parent in all three gates · **faded**: helped in the first gate but by less than half as much (or not at all) in the last · **no effect**: anything else. A candidate is only compared with a parent that ran under the same Constitution version (same seasons).
- Lines starting **Signal** come from the search, refreshed every round: the signal on a base model vs that base alone in each search period (2014–2016 only); **helped** = better in all three periods on most of the bases it was tried on.

## Helped (0)

- none

## Faded (0)

- none

## No effect (0)

- none

## What the search learned (26,940 configurations, 2014–2016 only)

- spread · elo · `hfa_elo`: best 44 (median t +1.25), worst 150 (+0.03) over 17653 configurations
- spread · elo · `k`: best 2 (median t +1.81), worst 40 (-1.19) over 17653 configurations
- spread · elo · `market_blend`: best 0.875 (median t +1.24), worst 0.5 (+0.23) over 17653 configurations
- spread · elo · `mov`: best none (median t +0.71), worst 538 (-0.17) over 17653 configurations
- spread · elo · `revert`: best 0.8 (median t +1.49), worst 0.25 (+0.09) over 17653 configurations
- spread · srs · `carry`: best 0.875 (median t +1.62), worst 0.4 (+0.85) over 7276 configurations
- spread · srs · `hfa_pts`: best 0.5 (median t +1.80), worst 4.0 (+0.79) over 7276 configurations
- spread · srs · `margin_cap`: best 16 (median t +1.65), worst None (+0.73) over 7276 configurations
- spread · srs · `prior_w`: best 20.0 (median t +1.81), worst 0.5 (+0.59) over 7276 configurations
- spread · team_rating · `def_weight`: best 1.0 (median t +0.55), worst 0.5 (+0.09) over 392 configurations
- spread · team_rating · `halflife`: best 60 (median t +1.12), worst 5 (-0.12) over 392 configurations
- spread · team_rating · `season_carry`: best 0.55 (median t +0.63), worst 0.2 (+0.06) over 392 configurations
- total · pace_eff · `halflife`: best 1 (median t +0.49), worst 5 (-0.48) over 150 configurations
- total · pace_eff · `season_carry`: best 0.675 (median t +0.17), worst 0.3 (-0.21) over 150 configurations
- total · team_rating · `halflife`: best 1 (median t +0.89), worst 40 (-0.23) over 410 configurations
- total · team_rating · `season_carry`: best 0.675 (median t +0.69), worst 0.2 (+0.14) over 410 configurations
