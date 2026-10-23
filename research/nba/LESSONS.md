# Research Lab -- lessons, NBA (EXPLORATORY)

_Generated 2026-10-23T18:21:27Z by research/lab/report.py after each run. **Exploratory, not proof**: each line compares a candidate with the one it builds on, gate by gate, with no correction for how many comparisons there are. Only the Inspector General's verdicts and the sealed exam decide anything._

- **helped**: beat its parent in all three gates · **faded**: helped in the first gate but by less than half as much (or not at all) in the last · **no effect**: anything else. A candidate is only compared with a parent that ran under the same Constitution version (same seasons).
- Lines starting **Signal** come from the search, refreshed every round: the signal on a base model vs that base alone in each search period (2014–2016 only); **helped** = better in all three periods on most of the bases it was tried on.

## Helped (0)

- none

## Faded (0)

- none

## No effect (0)

- none

## What the search learned (1,070 configurations, 2014–2016 only)

- spread · elo · `hfa_elo`: best 50 (median t +0.27), worst 125 (-0.02) over 400 configurations
- spread · elo · `k`: best 10 (median t +0.68), worst 20 (-0.42) over 400 configurations
- spread · elo · `mov`: best none (median t +0.66), worst 538 (-0.51) over 400 configurations
- spread · srs · `carry`: best 0.9 (median t +1.06), worst 0.3 (+0.47) over 191 configurations
- spread · srs · `hfa_pts`: best 3.5 (median t +0.95), worst 2.5 (+0.50) over 191 configurations
- spread · srs · `margin_cap`: best 15 (median t +0.99), worst None (+0.65) over 191 configurations
- spread · srs · `prior_w`: best 16 (median t +1.09), worst 0.5 (+0.49) over 191 configurations
- spread · team_rating · `def_weight`: best 1.0 (median t +0.68), worst 0.5 (-0.02) over 75 configurations
- spread · team_rating · `halflife`: best 60 (median t +1.30), worst 5 (-0.06) over 75 configurations
- spread · team_rating · `season_carry`: best 0.4 (median t +0.94), worst 0.3 (+0.00) over 75 configurations
- total · pace_eff · `halflife`: best 60 (median t +0.27), worst 10 (-0.40) over 33 configurations
- total · pace_eff · `season_carry`: best 0.7 (median t +0.02), worst 0.2 (-0.41) over 33 configurations
- total · team_rating · `halflife`: best 3 (median t +0.66), worst 30 (-0.21) over 101 configurations
