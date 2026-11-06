# Research Lab -- lessons, Soccer (EXPLORATORY)

_Generated 2026-11-06T03:52:06Z by research/lab/report.py after each run. **Exploratory, not proof**: each line compares a candidate with the one it builds on, gate by gate, with no correction for how many comparisons there are. Only the Inspector General's verdicts and the sealed exam decide anything._

- **helped**: beat its parent in all three gates · **faded**: helped in the first gate but by less than half as much (or not at all) in the last · **no effect**: anything else. A candidate is only compared with a parent that ran under the same Constitution version (same seasons).
- Lines starting **Signal** come from the search, refreshed every round: the signal on a base model vs that base alone in each search period (2020–2022 only); **helped** = better in all three periods on most of the bases it was tried on.

## Helped (0)

- none

## Faded (0)

- none

## No effect (0)

- none

## What the search learned (929 configurations, 2020–2022 only)

- moneyline · elo_ml · `hfa_elo`: best 10 (median t -0.30), worst 30 (-0.65) over 472 configurations
- moneyline · elo_ml · `k`: best 15 (median t -0.42), worst 32 (-0.86) over 472 configurations
- moneyline · elo_ml · `market_blend`: best 0.0 (median t -0.56), worst 0.25 (-inf) over 472 configurations
- moneyline · elo_ml · `revert`: best 0.05 (median t -0.14), worst 0.5 (-0.98) over 472 configurations
- moneyline · rating_ml · `def_weight`: best 1.0 (median t -1.05), worst 0.5 (-1.39) over 121 configurations
- moneyline · rating_ml · `halflife`: best 3 (median t -1.05), worst 10 (-1.37) over 121 configurations
- moneyline · rating_ml · `season_carry`: best 0.6 (median t -1.01), worst 0.2 (-2.02) over 121 configurations
- moneyline · srs_ml · `carry`: best 0.6 (median t -1.17), worst 0.8 (-1.48) over 207 configurations
- moneyline · srs_ml · `margin_cap`: best 3 (median t -1.03), worst None (-1.56) over 207 configurations
- moneyline · srs_ml · `prior_w`: best 2 (median t -1.03), worst 8 (-1.50) over 207 configurations
