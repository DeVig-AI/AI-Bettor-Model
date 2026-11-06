# Research Lab -- lessons, Soccer (EXPLORATORY)

_Generated 2026-11-06T04:57:49Z by research/lab/report.py after each run. **Exploratory, not proof**: each line compares a candidate with the one it builds on, gate by gate, with no correction for how many comparisons there are. Only the Inspector General's verdicts and the sealed exam decide anything._

- **helped**: beat its parent in all three gates · **faded**: helped in the first gate but by less than half as much (or not at all) in the last · **no effect**: anything else. A candidate is only compared with a parent that ran under the same Constitution version (same seasons).
- Lines starting **Signal** come from the search, refreshed every round: the signal on a base model vs that base alone in each search period (2020–2022 only); **helped** = better in all three periods on most of the bases it was tried on.

## Helped (0)

- none

## Faded (0)

- none

## No effect (0)

- none

## What the search learned (1,344 configurations, 2020–2022 only)

- moneyline · elo_ml · `k`: best 6 (median t -0.49), worst 20 (-0.91) over 743 configurations
- moneyline · elo_ml · `market_blend`: best 0.0 (median t -0.49), worst 0.25 (-inf) over 743 configurations
- moneyline · elo_ml · `revert`: best 0.05 (median t -0.44), worst 0.5 (-1.04) over 743 configurations
- moneyline · rating_ml · `def_weight`: best 1.0 (median t -1.02), worst 0.5 (-1.34) over 140 configurations
- moneyline · rating_ml · `halflife`: best 3 (median t -1.03), worst 5 (-1.38) over 140 configurations
- moneyline · rating_ml · `season_carry`: best 0.6 (median t -1.01), worst 0.2 (-1.97) over 140 configurations
- moneyline · srs_ml · `margin_cap`: best 3 (median t -1.07), worst None (-1.58) over 287 configurations
- moneyline · srs_ml · `prior_w`: best 2 (median t -1.04), worst 8 (-1.54) over 287 configurations
