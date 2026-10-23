# Research Lab -- lessons, NBA (EXPLORATORY)

_Generated 2026-10-23T17:44:17Z by research/lab/report.py after each run. **Exploratory, not proof**: each line compares a candidate with the one it builds on, gate by gate, with no correction for how many comparisons there are. Only the Inspector General's verdicts and the sealed exam decide anything._

- **helped**: beat its parent in all three gates · **faded**: helped in the first gate but by less than half as much (or not at all) in the last · **no effect**: anything else. A candidate is only compared with a parent that ran under the same Constitution version (same seasons).
- Lines starting **Signal** come from the search, refreshed every round: the signal on a base model vs that base alone in each search period (2014–2016 only); **helped** = better in all three periods on most of the bases it was tried on.

## Helped (0)

- none

## Faded (0)

- none

## No effect (0)

- none

## What the search learned (540 configurations, 2014–2016 only)

- spread · elo · `hfa_elo`: best 50 (median t +0.69), worst 125 (+0.20) over 200 configurations
- spread · elo · `k`: best 10 (median t +0.68), worst 15 (+0.36) over 200 configurations
- spread · elo · `market_blend`: best 0.0 (median t +0.68), worst 0.5 (+0.39) over 200 configurations
- spread · elo · `mov`: best none (median t +0.87), worst 538 (-0.02) over 200 configurations
- spread · elo · `revert`: best 0.5 (median t +0.69), worst 0.25 (+0.36) over 200 configurations
- spread · srs · `carry`: best 0.8 (median t +0.72), worst 0.3 (+0.43) over 128 configurations
- spread · srs · `hfa_pts`: best 3.5 (median t +0.77), worst 3.0 (+0.48) over 128 configurations
- spread · srs · `prior_w`: best 8 (median t +0.94), worst 2 (+0.49) over 128 configurations
- spread · team_rating · `def_weight`: best 1.0 (median t +0.57), worst 0.5 (-0.04) over 54 configurations
- spread · team_rating · `halflife`: best 40 (median t +0.69), worst 5 (-0.08) over 54 configurations
- spread · team_rating · `season_carry`: best 0.7 (median t +0.37), worst 0.3 (+0.00) over 54 configurations
- total · team_rating · `def_weight`: best 0.5 (median t +0.48), worst 0.75 (+0.00) over 18 configurations
