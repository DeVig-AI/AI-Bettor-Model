# Research Lab -- lessons, Soccer (EXPLORATORY)

_Generated 2026-11-06T02:36:15Z by research/lab/report.py after each run. **Exploratory, not proof**: each line compares a candidate with the one it builds on, gate by gate, with no correction for how many comparisons there are. Only the Inspector General's verdicts and the sealed exam decide anything._

- **helped**: beat its parent in all three gates · **faded**: helped in the first gate but by less than half as much (or not at all) in the last · **no effect**: anything else. A candidate is only compared with a parent that ran under the same Constitution version (same seasons).
- Lines starting **Signal** come from the search, refreshed every round: the signal on a base model vs that base alone in each search period (2020–2022 only); **helped** = better in all three periods on most of the bases it was tried on.

## Helped (0)

- none

## Faded (0)

- none

## No effect (0)

- none

## What the search learned (470 configurations, 2020–2022 only)

- moneyline · elo_ml · `hfa_mode`: best rolling (median t -0.32), worst fixed (-0.62) over 200 configurations
- moneyline · elo_ml · `revert`: best 0.1 (median t -0.24), worst 0.5 (-0.90) over 200 configurations
- moneyline · rating_ml · `def_weight`: best 1.0 (median t -1.06), worst 0.5 (-1.45) over 72 configurations
- moneyline · rating_ml · `halflife`: best 3 (median t -0.88), worst 5 (-1.41) over 72 configurations
- moneyline · rating_ml · `season_carry`: best 0.8 (median t -0.80), worst 0.2 (-1.90) over 72 configurations
- moneyline · srs_ml · `carry`: best 0.5 (median t -1.23), worst 0.2 (-1.57) over 128 configurations
- moneyline · srs_ml · `margin_cap`: best 3 (median t -1.01), worst None (-1.59) over 128 configurations
- moneyline · srs_ml · `prior_w`: best 2 (median t -1.20), worst 8 (-1.66) over 128 configurations
