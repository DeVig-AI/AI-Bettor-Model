# Research Lab -- lessons, NBA (EXPLORATORY)

_Generated 2026-10-24T05:27:32Z by research/lab/report.py after each run. **Exploratory, not proof**: each line compares a candidate with the one it builds on, gate by gate, with no correction for how many comparisons there are. Only the Inspector General's verdicts and the sealed exam decide anything._

- **helped**: beat its parent in all three gates · **faded**: helped in the first gate but by less than half as much (or not at all) in the last · **no effect**: anything else. A candidate is only compared with a parent that ran under the same Constitution version (same seasons).
- Lines starting **Signal** come from the search, refreshed every round: the signal on a base model vs that base alone in each search period (2014–2016 only); **helped** = better in all three periods on most of the bases it was tried on.

## Helped (0)

- none

## Faded (0)

- none

## No effect (0)

- none

## What the search learned (7,918 configurations, 2014–2016 only)

- spread · elo · `hfa_elo`: best 38 (median t +1.20), worst 125 (-0.17) over 3957 configurations
- spread · elo · `k`: best 5 (median t +1.23), worst 40 (-1.18) over 3957 configurations
- spread · elo · `market_blend`: best 1.0 (median t +1.18), worst 0.5 (+0.00) over 3957 configurations
- spread · elo · `mov`: best none (median t +0.61), worst 538 (-0.55) over 3957 configurations
- spread · elo · `revert`: best 0.7 (median t +1.31), worst 0.25 (-0.09) over 3957 configurations
- spread · srs · `carry`: best 0.85 (median t +1.15), worst 0.2 (+0.68) over 2248 configurations
- spread · srs · `hfa_pts`: best 1.0 (median t +1.62), worst 4.0 (+0.62) over 2248 configurations
- spread · srs · `margin_cap`: best 10 (median t +1.28), worst None (+0.65) over 2248 configurations
- spread · srs · `prior_w`: best 24.0 (median t +1.35), worst 0.5 (+0.52) over 2248 configurations
- spread · team_rating · `def_weight`: best 1.0 (median t +0.56), worst 0.5 (+0.06) over 335 configurations
- spread · team_rating · `halflife`: best 60 (median t +1.15), worst 5 (-0.11) over 335 configurations
- spread · team_rating · `season_carry`: best 0.8 (median t +0.48), worst 0.2 (+0.03) over 335 configurations
- total · pace_eff · `halflife`: best 1 (median t +0.49), worst 5 (-0.48) over 120 configurations
- total · team_rating · `halflife`: best 1 (median t +0.88), worst 40 (-0.23) over 354 configurations
