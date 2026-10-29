# Research Lab -- lessons, NBA (EXPLORATORY)

_Generated 2026-10-29T16:26:21Z by research/lab/report.py after each run. **Exploratory, not proof**: each line compares a candidate with the one it builds on, gate by gate, with no correction for how many comparisons there are. Only the Inspector General's verdicts and the sealed exam decide anything._

- **helped**: beat its parent in all three gates · **faded**: helped in the first gate but by less than half as much (or not at all) in the last · **no effect**: anything else. A candidate is only compared with a parent that ran under the same Constitution version (same seasons).
- Lines starting **Signal** come from the search, refreshed every round: the signal on a base model vs that base alone in each search period (2014–2016 only); **helped** = better in all three periods on most of the bases it was tried on.

## Helped (1)

- SRS · carry 0.1 · prior 24 vs the line-only baseline: helped in every gate (+0.03 / +0.22 / +0.81 pts in 2017 / 2018 / 2019).

## Faded (0)

- none

## No effect (1)

- Blend of 2: s-e425bd72 + s-066ccdc8 vs the line-only baseline: no consistent effect (-0.12 / +0.42 / +0.67 pts in 2017 / 2018 / 2019).

## What the search learned (98,369 configurations, 2014–2016 only)

- spread · elo · `hfa_elo`: best 18 (median t +1.38), worst 150 (+0.32) over 67087 configurations
- spread · elo · `k`: best 2 (median t +1.64), worst 40 (-1.23) over 67087 configurations
- spread · elo · `market_blend`: best 0.9375 (median t +1.33), worst 0.0 (+0.71) over 67087 configurations
- spread · elo · `mov`: best none (median t +1.08), worst 538 (+0.38) over 67087 configurations
- spread · elo · `revert`: best 0.9 (median t +1.53), worst 0.2 (+0.49) over 67087 configurations
- spread · srs · `carry`: best 0.1 (median t +1.62), worst 0.95 (+1.12) over 28167 configurations
- spread · srs · `hfa_pts`: best 0.75 (median t +1.68), worst 4.0 (+0.91) over 28167 configurations
- spread · srs · `margin_cap`: best 8 (median t +1.49), worst None (+0.90) over 28167 configurations
- spread · srs · `prior_w`: best 40.0 (median t +1.54), worst 0.5 (+0.68) over 28167 configurations
- spread · team_rating · `def_weight`: best 1.0 (median t +0.62), worst 0.5 (+0.28) over 663 configurations
- spread · team_rating · `halflife`: best 1 (median t +1.08), worst 5 (-0.22) over 663 configurations
- spread · team_rating · `season_carry`: best 1.0 (median t +0.59), worst 0.2 (+0.07) over 663 configurations
- total · pace_eff · `halflife`: best 1 (median t +0.45), worst 5 (-0.49) over 221 configurations
- total · pace_eff · `season_carry`: best 0.625 (median t +0.05), worst 0.85 (-0.23) over 221 configurations
- total · team_rating · `halflife`: best 1 (median t +0.88), worst 40 (-0.13) over 663 configurations
