# Research Lab -- lessons, NBA (EXPLORATORY)

_Generated 2026-10-25T08:49:12Z by research/lab/report.py after each run. **Exploratory, not proof**: each line compares a candidate with the one it builds on, gate by gate, with no correction for how many comparisons there are. Only the Inspector General's verdicts and the sealed exam decide anything._

- **helped**: beat its parent in all three gates · **faded**: helped in the first gate but by less than half as much (or not at all) in the last · **no effect**: anything else. A candidate is only compared with a parent that ran under the same Constitution version (same seasons).
- Lines starting **Signal** come from the search, refreshed every round: the signal on a base model vs that base alone in each search period (2014–2016 only); **helped** = better in all three periods on most of the bases it was tried on.

## Helped (0)

- none

## Faded (0)

- none

## No effect (1)

- Blend of 2: s-e425bd72 + s-066ccdc8 vs the line-only baseline: no consistent effect (-0.12 / +0.42 / +0.67 pts in 2017 / 2018 / 2019).

## What the search learned (28,224 configurations, 2014–2016 only)

- spread · elo · `hfa_elo`: best 32 (median t +1.49), worst 150 (+0.03) over 18126 configurations
- spread · elo · `k`: best 2 (median t +1.82), worst 40 (-1.19) over 18126 configurations
- spread · elo · `market_blend`: best 0.875 (median t +1.44), worst 0.5 (+0.24) over 18126 configurations
- spread · elo · `mov`: best none (median t +0.74), worst 538 (-0.16) over 18126 configurations
- spread · elo · `revert`: best 0.8 (median t +1.52), worst 0.25 (+0.10) over 18126 configurations
- spread · srs · `carry`: best 0.825 (median t +1.48), worst 0.4 (+0.87) over 7741 configurations
- spread · srs · `hfa_pts`: best 0.5 (median t +1.83), worst 4.0 (+0.79) over 7741 configurations
- spread · srs · `margin_cap`: best 16 (median t +1.63), worst None (+0.75) over 7741 configurations
- spread · srs · `prior_w`: best 20.0 (median t +1.79), worst 0.5 (+0.59) over 7741 configurations
- spread · team_rating · `def_weight`: best 1.0 (median t +0.61), worst 0.5 (+0.18) over 466 configurations
- spread · team_rating · `halflife`: best 1 (median t +1.08), worst 5 (-0.11) over 466 configurations
- spread · team_rating · `season_carry`: best 0.675 (median t +0.52), worst 0.2 (+0.06) over 466 configurations
- total · pace_eff · `halflife`: best 1 (median t +0.49), worst 5 (-0.49) over 168 configurations
- total · pace_eff · `season_carry`: best 0.675 (median t +0.05), worst 0.55 (-0.22) over 168 configurations
- total · team_rating · `halflife`: best 1 (median t +0.88), worst 40 (-0.19) over 477 configurations
- total · team_rating · `season_carry`: best 0.625 (median t +0.40), worst 0.2 (+0.15) over 477 configurations
