# Research Lab -- lessons, NBA (EXPLORATORY)

_Generated 2026-10-24T12:21:25Z by research/lab/report.py after each run. **Exploratory, not proof**: each line compares a candidate with the one it builds on, gate by gate, with no correction for how many comparisons there are. Only the Inspector General's verdicts and the sealed exam decide anything._

- **helped**: beat its parent in all three gates · **faded**: helped in the first gate but by less than half as much (or not at all) in the last · **no effect**: anything else. A candidate is only compared with a parent that ran under the same Constitution version (same seasons).
- Lines starting **Signal** come from the search, refreshed every round: the signal on a base model vs that base alone in each search period (2014–2016 only); **helped** = better in all three periods on most of the bases it was tried on.

## Helped (0)

- none

## Faded (0)

- none

## No effect (0)

- none

## What the search learned (10,976 configurations, 2014–2016 only)

- spread · elo · `hfa_elo`: best 38 (median t +0.99), worst 125 (-0.09) over 5678 configurations
- spread · elo · `k`: best 5 (median t +1.25), worst 40 (-1.21) over 5678 configurations
- spread · elo · `market_blend`: best 1.0 (median t +0.93), worst 0.0 (+0.07) over 5678 configurations
- spread · elo · `mov`: best none (median t +0.76), worst 538 (-0.39) over 5678 configurations
- spread · elo · `revert`: best 0.7 (median t +1.10), worst 0.25 (+0.03) over 5678 configurations
- spread · srs · `carry`: best 1.0 (median t +1.05), worst 0.2 (+0.79) over 3508 configurations
- spread · srs · `hfa_pts`: best 1.0 (median t +1.42), worst 4.0 (+0.71) over 3508 configurations
- spread · srs · `margin_cap`: best 10 (median t +1.26), worst None (+0.70) over 3508 configurations
- spread · srs · `prior_w`: best 24.0 (median t +1.31), worst 0.5 (+0.55) over 3508 configurations
- spread · team_rating · `def_weight`: best 1.0 (median t +0.53), worst 0.5 (+0.06) over 360 configurations
- spread · team_rating · `halflife`: best 60 (median t +1.15), worst 5 (-0.12) over 360 configurations
- spread · team_rating · `season_carry`: best 0.8 (median t +0.45), worst 0.2 (+0.06) over 360 configurations
- total · pace_eff · `halflife`: best 1 (median t +0.49), worst 5 (-0.48) over 120 configurations
- total · team_rating · `halflife`: best 1 (median t +0.88), worst 40 (-0.23) over 360 configurations
