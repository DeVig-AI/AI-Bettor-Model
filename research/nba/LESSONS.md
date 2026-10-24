# Research Lab -- lessons, NBA (EXPLORATORY)

_Generated 2026-10-24T02:20:19Z by research/lab/report.py after each run. **Exploratory, not proof**: each line compares a candidate with the one it builds on, gate by gate, with no correction for how many comparisons there are. Only the Inspector General's verdicts and the sealed exam decide anything._

- **helped**: beat its parent in all three gates · **faded**: helped in the first gate but by less than half as much (or not at all) in the last · **no effect**: anything else. A candidate is only compared with a parent that ran under the same Constitution version (same seasons).
- Lines starting **Signal** come from the search, refreshed every round: the signal on a base model vs that base alone in each search period (2014–2016 only); **helped** = better in all three periods on most of the bases it was tried on.

## Helped (0)

- none

## Faded (0)

- none

## No effect (0)

- none

## What the search learned (5,929 configurations, 2014–2016 only)

- spread · elo · `hfa_elo`: best 38 (median t +1.56), worst 125 (-0.20) over 3219 configurations
- spread · elo · `k`: best 8 (median t +1.33), worst 40 (-1.18) over 3219 configurations
- spread · elo · `market_blend`: best 1.0 (median t +1.50), worst 0.25 (-0.03) over 3219 configurations
- spread · elo · `mov`: best none (median t +0.40), worst 538 (-0.74) over 3219 configurations
- spread · elo · `revert`: best 0.225 (median t +1.63), worst 0.25 (-0.14) over 3219 configurations
- spread · srs · `carry`: best 0.85 (median t +1.20), worst 0.4 (+0.59) over 1517 configurations
- spread · srs · `hfa_pts`: best 1.0 (median t +1.67), worst 4.0 (+0.51) over 1517 configurations
- spread · srs · `margin_cap`: best 10 (median t +1.37), worst None (+0.63) over 1517 configurations
- spread · srs · `prior_w`: best 24.0 (median t +1.34), worst 0.5 (+0.51) over 1517 configurations
- spread · team_rating · `def_weight`: best 1.0 (median t +0.46), worst 0.5 (+0.04) over 201 configurations
- spread · team_rating · `halflife`: best 1 (median t +1.12), worst 5 (-0.09) over 201 configurations
- spread · team_rating · `season_carry`: best 0.75 (median t +0.92), worst 0.2 (+0.01) over 201 configurations
- total · pace_eff · `halflife`: best 1 (median t +0.47), worst 5 (-0.39) over 84 configurations
- total · pace_eff · `season_carry`: best 0.9 (median t +0.15), worst 0.3 (-0.21) over 84 configurations
- total · team_rating · `halflife`: best 1 (median t +0.90), worst 40 (-0.27) over 249 configurations
- total · team_rating · `season_carry`: best 0.65 (median t +0.59), worst 0.2 (+0.12) over 249 configurations
