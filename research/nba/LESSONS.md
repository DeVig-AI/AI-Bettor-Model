# Research Lab -- lessons, NBA (EXPLORATORY)

_Generated 2026-10-28T12:19:50Z by research/lab/report.py after each run. **Exploratory, not proof**: each line compares a candidate with the one it builds on, gate by gate, with no correction for how many comparisons there are. Only the Inspector General's verdicts and the sealed exam decide anything._

- **helped**: beat its parent in all three gates · **faded**: helped in the first gate but by less than half as much (or not at all) in the last · **no effect**: anything else. A candidate is only compared with a parent that ran under the same Constitution version (same seasons).
- Lines starting **Signal** come from the search, refreshed every round: the signal on a base model vs that base alone in each search period (2014–2016 only); **helped** = better in all three periods on most of the bases it was tried on.

## Helped (1)

- SRS · carry 0.1 · prior 24 vs the line-only baseline: helped in every gate (+0.03 / +0.22 / +0.81 pts in 2017 / 2018 / 2019).

## Faded (0)

- none

## No effect (1)

- Blend of 2: s-e425bd72 + s-066ccdc8 vs the line-only baseline: no consistent effect (-0.12 / +0.42 / +0.67 pts in 2017 / 2018 / 2019).

## What the search learned (82,052 configurations, 2014–2016 only)

- spread · elo · `hfa_elo`: best 18 (median t +1.73), worst 150 (+0.28) over 58297 configurations
- spread · elo · `k`: best 4 (median t +1.62), worst 40 (-1.22) over 58297 configurations
- spread · elo · `market_blend`: best 0.9375 (median t +1.58), worst 0.25 (+0.65) over 58297 configurations
- spread · elo · `mov`: best none (median t +1.04), worst 538 (+0.32) over 58297 configurations
- spread · elo · `revert`: best 0.9 (median t +1.71), worst 0.2 (+0.47) over 58297 configurations
- spread · srs · `carry`: best 0.1 (median t +1.83), worst 0.7 (+1.07) over 20775 configurations
- spread · srs · `hfa_pts`: best 0.75 (median t +1.94), worst 4.0 (+0.88) over 20775 configurations
- spread · srs · `margin_cap`: best 8 (median t +1.58), worst None (+0.86) over 20775 configurations
- spread · srs · `prior_w`: best 40.0 (median t +1.88), worst 0.5 (+0.66) over 20775 configurations
- spread · team_rating · `def_weight`: best 1.0 (median t +0.64), worst 0.5 (+0.28) over 623 configurations
- spread · team_rating · `halflife`: best 1 (median t +1.08), worst 5 (-0.26) over 623 configurations
- spread · team_rating · `season_carry`: best 1.0 (median t +0.67), worst 0.2 (+0.07) over 623 configurations
- total · pace_eff · `halflife`: best 1 (median t +0.45), worst 5 (-0.49) over 217 configurations
- total · pace_eff · `season_carry`: best 0.625 (median t +0.05), worst 0.55 (-0.22) over 217 configurations
- total · team_rating · `halflife`: best 1 (median t +0.88), worst 40 (-0.17) over 606 configurations
- total · team_rating · `season_carry`: best 0.6125 (median t +0.43), worst 0.2 (+0.15) over 606 configurations
