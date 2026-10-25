# Research Lab -- lessons, NBA (EXPLORATORY)

_Generated 2026-10-25T09:26:59Z by research/lab/report.py after each run. **Exploratory, not proof**: each line compares a candidate with the one it builds on, gate by gate, with no correction for how many comparisons there are. Only the Inspector General's verdicts and the sealed exam decide anything._

- **helped**: beat its parent in all three gates · **faded**: helped in the first gate but by less than half as much (or not at all) in the last · **no effect**: anything else. A candidate is only compared with a parent that ran under the same Constitution version (same seasons).
- Lines starting **Signal** come from the search, refreshed every round: the signal on a base model vs that base alone in each search period (2014–2016 only); **helped** = better in all three periods on most of the bases it was tried on.

## Helped (0)

- none

## Faded (0)

- none

## No effect (1)

- Blend of 2: s-e425bd72 + s-066ccdc8 vs the line-only baseline: no consistent effect (-0.12 / +0.42 / +0.67 pts in 2017 / 2018 / 2019).

## What the search learned (28,896 configurations, 2014–2016 only)

- spread · elo · `hfa_elo`: best 32 (median t +1.44), worst 150 (+0.04) over 18415 configurations
- spread · elo · `k`: best 2 (median t +1.76), worst 40 (-1.19) over 18415 configurations
- spread · elo · `market_blend`: best 0.875 (median t +1.35), worst 0.5 (+0.24) over 18415 configurations
- spread · elo · `mov`: best none (median t +0.75), worst 538 (-0.13) over 18415 configurations
- spread · elo · `revert`: best 0.8 (median t +1.49), worst 0.25 (+0.10) over 18415 configurations
- spread · srs · `carry`: best 0.825 (median t +1.41), worst 0.5 (+0.87) over 8048 configurations
- spread · srs · `hfa_pts`: best 0.5 (median t +1.81), worst 4.0 (+0.80) over 8048 configurations
- spread · srs · `margin_cap`: best 16 (median t +1.48), worst None (+0.75) over 8048 configurations
- spread · srs · `prior_w`: best 32.0 (median t +1.68), worst 0.5 (+0.59) over 8048 configurations
- spread · team_rating · `def_weight`: best 1.0 (median t +0.63), worst 0.5 (+0.18) over 486 configurations
- spread · team_rating · `halflife`: best 1 (median t +1.08), worst 5 (-0.12) over 486 configurations
- spread · team_rating · `season_carry`: best 0.675 (median t +0.57), worst 0.2 (+0.07) over 486 configurations
- total · pace_eff · `halflife`: best 1 (median t +0.49), worst 5 (-0.49) over 168 configurations
- total · pace_eff · `season_carry`: best 0.675 (median t +0.05), worst 0.55 (-0.22) over 168 configurations
- total · team_rating · `halflife`: best 1 (median t +0.88), worst 40 (-0.17) over 490 configurations
