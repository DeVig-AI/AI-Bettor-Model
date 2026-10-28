# Research Lab -- lessons, NBA (EXPLORATORY)

_Generated 2026-10-28T02:52:32Z by research/lab/report.py after each run. **Exploratory, not proof**: each line compares a candidate with the one it builds on, gate by gate, with no correction for how many comparisons there are. Only the Inspector General's verdicts and the sealed exam decide anything._

- **helped**: beat its parent in all three gates · **faded**: helped in the first gate but by less than half as much (or not at all) in the last · **no effect**: anything else. A candidate is only compared with a parent that ran under the same Constitution version (same seasons).
- Lines starting **Signal** come from the search, refreshed every round: the signal on a base model vs that base alone in each search period (2014–2016 only); **helped** = better in all three periods on most of the bases it was tried on.

## Helped (0)

- none

## Faded (0)

- none

## No effect (1)

- Blend of 2: s-e425bd72 + s-066ccdc8 vs the line-only baseline: no consistent effect (-0.12 / +0.42 / +0.67 pts in 2017 / 2018 / 2019).

## What the search learned (76,864 configurations, 2014–2016 only)

- spread · elo · `hfa_elo`: best 12 (median t +0.99), worst 150 (+0.28) over 54365 configurations
- spread · elo · `k`: best 2 (median t +1.61), worst 40 (-1.22) over 54365 configurations
- spread · elo · `market_blend`: best 0.875 (median t +0.94), worst 0.25 (+0.64) over 54365 configurations
- spread · elo · `mov`: best none (median t +1.04), worst 538 (+0.32) over 54365 configurations
- spread · elo · `revert`: best 0.8 (median t +1.18), worst 0.2 (+0.46) over 54365 configurations
- spread · srs · `hfa_pts`: best 0.5 (median t +1.42), worst 4.0 (+0.88) over 19967 configurations
- spread · srs · `margin_cap`: best 10 (median t +1.28), worst None (+0.84) over 19967 configurations
- spread · srs · `prior_w`: best 32.0 (median t +1.36), worst 0.5 (+0.66) over 19967 configurations
- spread · team_rating · `def_weight`: best 1.0 (median t +0.63), worst 0.5 (+0.18) over 507 configurations
- spread · team_rating · `halflife`: best 1 (median t +1.08), worst 5 (-0.22) over 507 configurations
- spread · team_rating · `season_carry`: best 0.675 (median t +0.48), worst 0.2 (+0.07) over 507 configurations
- total · pace_eff · `halflife`: best 1 (median t +0.49), worst 5 (-0.49) over 169 configurations
- total · pace_eff · `season_carry`: best 0.625 (median t +0.05), worst 0.55 (-0.22) over 169 configurations
- total · team_rating · `halflife`: best 1 (median t +0.88), worst 40 (-0.17) over 507 configurations
