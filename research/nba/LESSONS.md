# Research Lab -- lessons, NBA (EXPLORATORY)

_Generated 2026-10-28T16:50:43Z by research/lab/report.py after each run. **Exploratory, not proof**: each line compares a candidate with the one it builds on, gate by gate, with no correction for how many comparisons there are. Only the Inspector General's verdicts and the sealed exam decide anything._

- **helped**: beat its parent in all three gates · **faded**: helped in the first gate but by less than half as much (or not at all) in the last · **no effect**: anything else. A candidate is only compared with a parent that ran under the same Constitution version (same seasons).
- Lines starting **Signal** come from the search, refreshed every round: the signal on a base model vs that base alone in each search period (2014–2016 only); **helped** = better in all three periods on most of the bases it was tried on.

## Helped (1)

- SRS · carry 0.1 · prior 24 vs the line-only baseline: helped in every gate (+0.03 / +0.22 / +0.81 pts in 2017 / 2018 / 2019).

## Faded (0)

- none

## No effect (1)

- Blend of 2: s-e425bd72 + s-066ccdc8 vs the line-only baseline: no consistent effect (-0.12 / +0.42 / +0.67 pts in 2017 / 2018 / 2019).

## What the search learned (84,757 configurations, 2014–2016 only)

- spread · elo · `hfa_elo`: best 18 (median t +1.47), worst 150 (+0.29) over 59670 configurations
- spread · elo · `k`: best 2 (median t +1.62), worst 40 (-1.23) over 59670 configurations
- spread · elo · `market_blend`: best 0.9375 (median t +1.39), worst 0.25 (+0.66) over 59670 configurations
- spread · elo · `mov`: best none (median t +1.05), worst 538 (+0.34) over 59670 configurations
- spread · elo · `revert`: best 0.9 (median t +1.63), worst 0.2 (+0.47) over 59670 configurations
- spread · srs · `carry`: best 0.1 (median t +1.71), worst 0.7 (+1.08) over 22016 configurations
- spread · srs · `hfa_pts`: best 0.75 (median t +1.79), worst 4.0 (+0.89) over 22016 configurations
- spread · srs · `margin_cap`: best 11 (median t +1.48), worst None (+0.87) over 22016 configurations
- spread · srs · `prior_w`: best 28.0 (median t +1.68), worst 0.5 (+0.66) over 22016 configurations
- spread · team_rating · `def_weight`: best 1.0 (median t +0.62), worst 0.5 (+0.28) over 660 configurations
- spread · team_rating · `halflife`: best 1 (median t +1.08), worst 5 (-0.22) over 660 configurations
- spread · team_rating · `season_carry`: best 1.0 (median t +0.60), worst 0.2 (+0.07) over 660 configurations
- total · pace_eff · `halflife`: best 1 (median t +0.45), worst 5 (-0.49) over 221 configurations
- total · pace_eff · `season_carry`: best 0.625 (median t +0.05), worst 0.85 (-0.23) over 221 configurations
- total · team_rating · `halflife`: best 1 (median t +0.88), worst 40 (-0.13) over 656 configurations
