# Research Lab -- lessons, NBA (EXPLORATORY)

_Generated 2026-10-23T19:42:22Z by research/lab/report.py after each run. **Exploratory, not proof**: each line compares a candidate with the one it builds on, gate by gate, with no correction for how many comparisons there are. Only the Inspector General's verdicts and the sealed exam decide anything._

- **helped**: beat its parent in all three gates · **faded**: helped in the first gate but by less than half as much (or not at all) in the last · **no effect**: anything else. A candidate is only compared with a parent that ran under the same Constitution version (same seasons).
- Lines starting **Signal** come from the search, refreshed every round: the signal on a base model vs that base alone in each search period (2014–2016 only); **helped** = better in all three periods on most of the bases it was tried on.

## Helped (0)

- none

## Faded (0)

- none

## No effect (0)

- none

## What the search learned (2,450 configurations, 2014–2016 only)

- spread · elo · `hfa_elo`: best 25 (median t +1.01), worst 125 (-0.42) over 1013 configurations
- spread · elo · `k`: best 5 (median t +1.21), worst 40 (-0.82) over 1013 configurations
- spread · elo · `market_blend`: best 0.75 (median t +0.65), worst 0.25 (-0.20) over 1013 configurations
- spread · elo · `mov`: best none (median t +0.40), worst 538 (-0.93) over 1013 configurations
- spread · elo · `revert`: best 0.2 (median t +0.79), worst 0.4 (-0.24) over 1013 configurations
- spread · srs · `carry`: best 0.9 (median t +0.90), worst 0.3 (+0.60) over 584 configurations
- spread · srs · `hfa_pts`: best 1.5 (median t +1.09), worst 2.5 (+0.65) over 584 configurations
- spread · srs · `margin_cap`: best 15 (median t +1.00), worst None (+0.66) over 584 configurations
- spread · srs · `prior_w`: best 16 (median t +1.15), worst 1 (+0.50) over 584 configurations
- spread · team_rating · `def_weight`: best 1.0 (median t +0.48), worst 0.5 (-0.00) over 155 configurations
- spread · team_rating · `halflife`: best 60 (median t +0.98), worst 5 (-0.06) over 155 configurations
- spread · team_rating · `season_carry`: best 0.8 (median t +0.48), worst 0.2 (-0.03) over 155 configurations
- total · pace_eff · `halflife`: best 60 (median t +0.24), worst 10 (-0.37) over 56 configurations
- total · pace_eff · `season_carry`: best 0.7 (median t +0.03), worst 0.2 (-0.27) over 56 configurations
- total · team_rating · `halflife`: best 3 (median t +0.60), worst 40 (-0.27) over 167 configurations
