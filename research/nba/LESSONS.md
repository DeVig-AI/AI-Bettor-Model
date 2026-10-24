# Research Lab -- lessons, NBA (EXPLORATORY)

_Generated 2026-10-24T04:38:35Z by research/lab/report.py after each run. **Exploratory, not proof**: each line compares a candidate with the one it builds on, gate by gate, with no correction for how many comparisons there are. Only the Inspector General's verdicts and the sealed exam decide anything._

- **helped**: beat its parent in all three gates · **faded**: helped in the first gate but by less than half as much (or not at all) in the last · **no effect**: anything else. A candidate is only compared with a parent that ran under the same Constitution version (same seasons).
- Lines starting **Signal** come from the search, refreshed every round: the signal on a base model vs that base alone in each search period (2014–2016 only); **helped** = better in all three periods on most of the bases it was tried on.

## Helped (0)

- none

## Faded (0)

- none

## No effect (0)

- none

## What the search learned (7,597 configurations, 2014–2016 only)

- spread · elo · `hfa_elo`: best 38 (median t +1.24), worst 125 (-0.18) over 3810 configurations
- spread · elo · `k`: best 5 (median t +1.23), worst 40 (-1.18) over 3810 configurations
- spread · elo · `market_blend`: best 1.0 (median t +1.21), worst 0.5 (+0.00) over 3810 configurations
- spread · elo · `mov`: best none (median t +0.57), worst 538 (-0.61) over 3810 configurations
- spread · elo · `revert`: best 0.7 (median t +1.34), worst 0.25 (-0.09) over 3810 configurations
- spread · srs · `carry`: best 0.85 (median t +1.17), worst 0.2 (+0.67) over 2109 configurations
- spread · srs · `hfa_pts`: best 1.0 (median t +1.63), worst 4.0 (+0.60) over 2109 configurations
- spread · srs · `margin_cap`: best 10 (median t +1.30), worst None (+0.65) over 2109 configurations
- spread · srs · `prior_w`: best 24.0 (median t +1.35), worst 0.5 (+0.52) over 2109 configurations
- spread · team_rating · `def_weight`: best 1.0 (median t +0.57), worst 0.5 (+0.08) over 320 configurations
- spread · team_rating · `halflife`: best 60 (median t +1.15), worst 5 (-0.11) over 320 configurations
- spread · team_rating · `season_carry`: best 0.65 (median t +0.51), worst 0.2 (+0.03) over 320 configurations
- total · pace_eff · `halflife`: best 1 (median t +0.49), worst 5 (-0.48) over 120 configurations
- total · team_rating · `halflife`: best 1 (median t +0.88), worst 40 (-0.21) over 345 configurations
