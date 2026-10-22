# Research Lab -- lessons, NFL (EXPLORATORY)

_Generated 2026-10-22T23:53:25Z by research/lab/report.py after each run. **Exploratory, not proof**: each line compares a candidate with the one it builds on, gate by gate, with no correction for how many comparisons there are. Only the Inspector General's verdicts and the sealed exam decide anything._

- **helped**: beat its parent in all three gates · **faded**: helped in the first gate but by less than half as much (or not at all) in the last · **no effect**: anything else. A candidate is only compared with a parent that ran under the same Constitution version (same seasons).
- Lines starting **Signal** come from the search, refreshed every round: the signal on a base model vs that base alone in each search period (2006–2016 only); **helped** = better in all three periods on most of the bases it was tried on.

## Helped (3)

- Plain Elo, slower (K 10) vs Plain Elo: helped in every gate (+0.13 / +0.30 / +0.01 pts in 2016–18 / 2019–21 / 2022–24).
- + Stronger preseason reversion vs Plain Elo: helped in every gate (+0.20 / +0.20 / +0.36 pts in 2016–18 / 2019–21 / 2022–24).
- Pace × efficiency, fast (half-life 4) vs Pace × efficiency totals: helped in every gate (+0.51 / +0.06 / +0.11 pts in 2016–18 / 2019–21 / 2022–24).

## Faded (39)

- 538-style combination vs Plain Elo: helped in 2016–18, then faded (+0.14 / +0.05 / -0.26 pts in 2016–18 / 2019–21 / 2022–24).
- + Rest / bye bonus vs Plain Elo: helped in 2016–18, then faded (+0.08 / -0.02 / +0.00 pts in 2016–18 / 2019–21 / 2022–24).
- + Margin-of-victory multiplier vs Plain Elo: helped in 2016–18, then faded (+0.07 / -0.17 / -0.61 pts in 2016–18 / 2019–21 / 2022–24).
- nfelo-style combination vs Plain Elo: helped in 2016–18, then faded (+0.19 / +0.18 / -0.22 pts in 2016–18 / 2019–21 / 2022–24).
- + Market-resistant K vs Plain Elo: helped in 2016–18, then faded (+0.63 / +0.48 / -0.20 pts in 2016–18 / 2019–21 / 2022–24).
- Blend of 2: s-3770bfc8 + s-6f3641ca vs the line-only baseline: helped in 2017–19, then faded (+0.55 / +0.73 / -1.30 pts in 2017–19 / 2020–22 / 2023–24).
- Blend of 2: s-473e5379 + s-8a5f816b vs the line-only baseline: helped in 2017–19, then faded (+0.62 / +0.00 / -0.83 pts in 2017–19 / 2020–22 / 2023–24).
- Signal def-finishing (total) on top of a base model: helped in 2006–09, then faded (helped in all three on 0 of 2); on average +0.01 / -0.08 / -0.01 pts in 2006–09 / 2010–13 / 2014–16.
- Signal def-finishing~c0.3 (total) on top of a base model: helped in 2006–09, then faded (helped in all three on 0 of 2); on average +0.01 / -0.08 / -0.01 pts in 2006–09 / 2010–13 / 2014–16.
- Signal def-finishing~c0.7 (total) on top of a base model: helped in 2006–09, then faded (helped in all three on 0 of 2); on average +0.01 / -0.08 / -0.01 pts in 2006–09 / 2010–13 / 2014–16.
- Signal def-finishing~h4 (total) on top of a base model: helped in 2006–09, then faded (helped in all three on 0 of 2); on average +0.02 / -0.12 / -0.00 pts in 2006–09 / 2010–13 / 2014–16.
- Signal def-pass-epa (spread) on top of a base model: helped in 2006–09, then faded (helped in all three on 0 of 4); on average +0.14 / -0.12 / -0.05 pts in 2006–09 / 2010–13 / 2014–16.
- Signal def-success~c0.3 (total) on top of a base model: helped in 2006–09, then faded (helped in all three on 0 of 2); on average +0.01 / -0.01 / -0.03 pts in 2006–09 / 2010–13 / 2014–16.
- Signal def-success~h16 (total) on top of a base model: helped in 2006–09, then faded (helped in all three on 0 of 2); on average +0.00 / -0.02 / -0.03 pts in 2006–09 / 2010–13 / 2014–16.
- Signal def-turnover-epa (spread) on top of a base model: helped in 2006–09, then faded (helped in all three on 1 of 4); on average +0.11 / -0.02 / -0.04 pts in 2006–09 / 2010–13 / 2014–16.
- Signal def-turnover-epa (total) on top of a base model: helped in 2006–09, then faded (helped in all three on 0 of 2); on average +0.02 / -0.13 / -0.02 pts in 2006–09 / 2010–13 / 2014–16.
- Signal def-turnover-epa~c0.3 (spread) on top of a base model: helped in 2006–09, then faded (helped in all three on 0 of 4); on average +0.03 / +0.00 / -0.05 pts in 2006–09 / 2010–13 / 2014–16.
- Signal def-turnover-epa~c0.3 (total) on top of a base model: helped in 2006–09, then faded (helped in all three on 0 of 2); on average +0.01 / -0.13 / -0.02 pts in 2006–09 / 2010–13 / 2014–16.
- Signal def-turnover-epa~c0.7 (spread) on top of a base model: helped in 2006–09, then faded (helped in all three on 0 of 4); on average +0.05 / +0.02 / -0.08 pts in 2006–09 / 2010–13 / 2014–16.
- Signal def-turnover-epa~c0.7 (total) on top of a base model: helped in 2006–09, then faded (helped in all three on 0 of 2); on average +0.02 / -0.10 / -0.01 pts in 2006–09 / 2010–13 / 2014–16.
- Signal def-turnover-epa~h4 (spread) on top of a base model: helped in 2006–09, then faded (helped in all three on 1 of 4); on average +0.08 / -0.02 / -0.12 pts in 2006–09 / 2010–13 / 2014–16.
- Signal div-game (spread) on top of a base model: helped in 2006–09, then faded (helped in all three on 1 of 4); on average +0.06 / -0.11 / +0.02 pts in 2006–09 / 2010–13 / 2014–16.
- Signal off-early-epa (total) on top of a base model: helped in 2006–09, then faded (helped in all three on 0 of 2); on average +0.01 / +0.00 / -0.08 pts in 2006–09 / 2010–13 / 2014–16.
- Signal off-finishing (spread) on top of a base model: helped in 2006–09, then faded (helped in all three on 0 of 4); on average +0.06 / -0.07 / -0.06 pts in 2006–09 / 2010–13 / 2014–16.
- Signal off-finishing (total) on top of a base model: helped in 2006–09, then faded (helped in all three on 0 of 2); on average +0.02 / -0.17 / -0.04 pts in 2006–09 / 2010–13 / 2014–16.
- Signal off-finishing~c0.3 (spread) on top of a base model: helped in 2006–09, then faded (helped in all three on 0 of 4); on average +0.03 / -0.06 / -0.09 pts in 2006–09 / 2010–13 / 2014–16.
- Signal off-finishing~c0.3 (total) on top of a base model: helped in 2006–09, then faded (helped in all three on 0 of 2); on average +0.02 / -0.14 / -0.03 pts in 2006–09 / 2010–13 / 2014–16.
- Signal off-finishing~c0.7 (spread) on top of a base model: helped in 2006–09, then faded (helped in all three on 0 of 4); on average +0.04 / -0.06 / -0.07 pts in 2006–09 / 2010–13 / 2014–16.
- Signal off-finishing~c0.7 (total) on top of a base model: helped in 2006–09, then faded (helped in all three on 0 of 2); on average +0.00 / -0.21 / -0.04 pts in 2006–09 / 2010–13 / 2014–16.
- Signal off-finishing~h16 (spread) on top of a base model: helped in 2006–09, then faded (helped in all three on 0 of 4); on average +0.01 / -0.05 / -0.03 pts in 2006–09 / 2010–13 / 2014–16.
- Signal off-finishing~h16 (total) on top of a base model: helped in 2006–09, then faded (helped in all three on 0 of 2); on average +0.02 / -0.15 / -0.02 pts in 2006–09 / 2010–13 / 2014–16.
- Signal off-finishing~h4 (spread) on top of a base model: helped in 2006–09, then faded (helped in all three on 1 of 4); on average +0.00 / +0.00 / -0.16 pts in 2006–09 / 2010–13 / 2014–16.
- Signal off-finishing~h4 (total) on top of a base model: helped in 2006–09, then faded (helped in all three on 0 of 2); on average +0.02 / -0.21 / +0.00 pts in 2006–09 / 2010–13 / 2014–16.
- Signal off-success (total) on top of a base model: helped in 2006–09, then faded (helped in all three on 0 of 2); on average +0.01 / +0.02 / -0.03 pts in 2006–09 / 2010–13 / 2014–16.
- Signal off-success~c0.3 (total) on top of a base model: helped in 2006–09, then faded (helped in all three on 0 of 2); on average +0.01 / +0.01 / -0.03 pts in 2006–09 / 2010–13 / 2014–16.
- Signal off-success~c0.7 (total) on top of a base model: helped in 2006–09, then faded (helped in all three on 0 of 2); on average +0.01 / +0.02 / -0.04 pts in 2006–09 / 2010–13 / 2014–16.
- Signal off-success~h16 (spread) on top of a base model: helped in 2006–09, then faded (helped in all three on 0 of 4); on average +0.00 / -0.00 / -0.03 pts in 2006–09 / 2010–13 / 2014–16.
- Signal off-success~h4 (total) on top of a base model: helped in 2006–09, then faded (helped in all three on 0 of 2); on average +0.01 / +0.02 / -0.04 pts in 2006–09 / 2010–13 / 2014–16.
- Signal off-turnover-epa (total) on top of a base model: helped in 2006–09, then faded (helped in all three on 0 of 2); on average +0.02 / -0.17 / -0.04 pts in 2006–09 / 2010–13 / 2014–16.

## No effect (56)

- Plain Elo vs the line-only baseline: no consistent effect (+0.25 / -0.87 / +0.89 pts in 2016–18 / 2019–21 / 2022–24).
- + Home field that changes over time vs Plain Elo: no consistent effect (-0.02 / +0.40 / -0.39 pts in 2016–18 / 2019–21 / 2022–24).
- Plain Elo, faster (K 30) vs Plain Elo: no consistent effect (-0.03 / +0.04 / -0.40 pts in 2016–18 / 2019–21 / 2022–24).
- + Learn from the market line vs Plain Elo: no consistent effect (-0.06 / +0.09 / +0.19 pts in 2016–18 / 2019–21 / 2022–24).
- + Playoff boost vs Plain Elo: no consistent effect (+0.00 / +0.07 / +0.04 pts in 2016–18 / 2019–21 / 2022–24).
- + Quarterback adjustment vs Plain Elo: no consistent effect (-0.15 / -0.13 / +0.04 pts in 2016–18 / 2019–21 / 2022–24).
- + Travel distance vs Plain Elo: no consistent effect (-0.19 / +0.14 / -0.06 pts in 2016–18 / 2019–21 / 2022–24).
- + EPA per play as efficiency vs Pace × efficiency totals: no consistent effect (-0.29 / +0.49 / -1.04 pts in 2016–18 / 2019–21 / 2022–24).
- Pace × efficiency, slow (half-life 16) vs Pace × efficiency totals: no consistent effect (-0.00 / +0.40 / +0.16 pts in 2016–18 / 2019–21 / 2022–24).
- Pace × efficiency totals vs the line-only baseline: no consistent effect (-0.39 / -0.81 / -0.30 pts in 2016–18 / 2019–21 / 2022–24).
- Signal bye-diff (spread) on top of a base model: no consistent effect (helped in all three on 2 of 4); on average +0.02 / +0.05 / +0.03 pts in 2006–09 / 2010–13 / 2014–16.
- Signal def-early-epa (spread) on top of a base model: no consistent effect (helped in all three on 1 of 4); on average -0.09 / +0.00 / +0.06 pts in 2006–09 / 2010–13 / 2014–16.
- Signal def-early-epa (total) on top of a base model: no consistent effect (helped in all three on 0 of 2); on average -0.09 / -0.03 / -0.04 pts in 2006–09 / 2010–13 / 2014–16.
- Signal def-early-epa~c0.3 (spread) on top of a base model: no consistent effect (helped in all three on 0 of 4); on average -0.07 / +0.09 / -0.00 pts in 2006–09 / 2010–13 / 2014–16.
- Signal def-early-epa~c0.3 (total) on top of a base model: no consistent effect (helped in all three on 1 of 2); on average -0.06 / -0.02 / -0.04 pts in 2006–09 / 2010–13 / 2014–16.
- Signal def-early-epa~c0.7 (spread) on top of a base model: no consistent effect (helped in all three on 1 of 4); on average -0.17 / -0.02 / +0.02 pts in 2006–09 / 2010–13 / 2014–16.
- Signal def-early-epa~c0.7 (total) on top of a base model: no consistent effect (helped in all three on 0 of 2); on average -0.09 / -0.05 / -0.07 pts in 2006–09 / 2010–13 / 2014–16.
- Signal def-early-epa~h16 (spread) on top of a base model: no consistent effect (helped in all three on 0 of 4); on average -0.12 / +0.02 / +0.01 pts in 2006–09 / 2010–13 / 2014–16.
- Signal def-early-epa~h16 (total) on top of a base model: no consistent effect (helped in all three on 0 of 2); on average -0.04 / +0.02 / -0.05 pts in 2006–09 / 2010–13 / 2014–16.
- Signal def-early-epa~h4 (spread) on top of a base model: no consistent effect (helped in all three on 1 of 4); on average -0.04 / +0.08 / +0.08 pts in 2006–09 / 2010–13 / 2014–16.
- Signal def-early-epa~h4 (total) on top of a base model: no consistent effect (helped in all three on 0 of 2); on average -0.38 / -0.01 / -0.01 pts in 2006–09 / 2010–13 / 2014–16.
- Signal def-finishing (spread) on top of a base model: no consistent effect (helped in all three on 0 of 4); on average -0.12 / +0.10 / +0.01 pts in 2006–09 / 2010–13 / 2014–16.
- Signal def-finishing~c0.3 (spread) on top of a base model: no consistent effect (helped in all three on 0 of 4); on average -0.09 / +0.06 / +0.00 pts in 2006–09 / 2010–13 / 2014–16.
- Signal def-finishing~c0.7 (spread) on top of a base model: no consistent effect (helped in all three on 0 of 4); on average -0.09 / +0.11 / +0.00 pts in 2006–09 / 2010–13 / 2014–16.
- Signal def-finishing~h16 (spread) on top of a base model: no consistent effect (helped in all three on 0 of 4); on average -0.07 / +0.09 / -0.00 pts in 2006–09 / 2010–13 / 2014–16.
- Signal def-finishing~h16 (total) on top of a base model: no consistent effect (helped in all three on 0 of 2); on average -0.01 / -0.08 / -0.01 pts in 2006–09 / 2010–13 / 2014–16.
- Signal def-finishing~h4 (spread) on top of a base model: no consistent effect (helped in all three on 0 of 4); on average -0.07 / +0.03 / -0.07 pts in 2006–09 / 2010–13 / 2014–16.
- Signal def-pass-epa (total) on top of a base model: no consistent effect (helped in all three on 0 of 2); on average -0.20 / +0.12 / +0.03 pts in 2006–09 / 2010–13 / 2014–16.
- Signal def-success (spread) on top of a base model: no consistent effect (helped in all three on 0 of 4); on average -0.07 / -0.09 / +0.06 pts in 2006–09 / 2010–13 / 2014–16.
- Signal def-success (total) on top of a base model: no consistent effect (helped in all three on 0 of 2); on average -0.01 / +0.00 / -0.03 pts in 2006–09 / 2010–13 / 2014–16.
- Signal def-success~c0.3 (spread) on top of a base model: no consistent effect (helped in all three on 0 of 4); on average -0.06 / -0.07 / +0.05 pts in 2006–09 / 2010–13 / 2014–16.
- Signal def-success~c0.7 (spread) on top of a base model: no consistent effect (helped in all three on 0 of 4); on average -0.11 / -0.04 / +0.09 pts in 2006–09 / 2010–13 / 2014–16.
- Signal def-success~c0.7 (total) on top of a base model: no consistent effect (helped in all three on 0 of 2); on average -0.01 / -0.00 / -0.05 pts in 2006–09 / 2010–13 / 2014–16.
- Signal def-success~h16 (spread) on top of a base model: no consistent effect (helped in all three on 0 of 4); on average -0.03 / -0.10 / +0.04 pts in 2006–09 / 2010–13 / 2014–16.
- Signal def-success~h4 (spread) on top of a base model: no consistent effect (helped in all three on 0 of 4); on average -0.06 / -0.07 / +0.04 pts in 2006–09 / 2010–13 / 2014–16.
- Signal def-success~h4 (total) on top of a base model: no consistent effect (helped in all three on 0 of 2); on average -0.01 / +0.01 / -0.04 pts in 2006–09 / 2010–13 / 2014–16.
- Signal def-turnover-epa~h16 (spread) on top of a base model: no consistent effect (helped in all three on 1 of 4); on average -0.02 / -0.00 / -0.10 pts in 2006–09 / 2010–13 / 2014–16.
- Signal def-turnover-epa~h16 (total) on top of a base model: no consistent effect (helped in all three on 0 of 2); on average -0.01 / -0.04 / -0.03 pts in 2006–09 / 2010–13 / 2014–16.
- Signal def-turnover-epa~h4 (total) on top of a base model: no consistent effect (helped in all three on 0 of 2); on average -0.02 / -0.11 / -0.01 pts in 2006–09 / 2010–13 / 2014–16.
- Signal off-comp-epa (spread) on top of a base model: no consistent effect (helped in all three on 0 of 4); on average -0.13 / +0.14 / -0.06 pts in 2006–09 / 2010–13 / 2014–16.
- Signal off-comp-epa (total) on top of a base model: no consistent effect (helped in all three on 1 of 2); on average -0.29 / -0.05 / +0.07 pts in 2006–09 / 2010–13 / 2014–16.
- Signal off-early-epa (spread) on top of a base model: no consistent effect (helped in all three on 0 of 4); on average -0.08 / +0.10 / -0.05 pts in 2006–09 / 2010–13 / 2014–16.
- Signal off-pace (total) on top of a base model: no consistent effect (helped in all three on 0 of 2); on average -0.03 / +0.01 / -0.04 pts in 2006–09 / 2010–13 / 2014–16.
- Signal off-pass-epa (spread) on top of a base model: no consistent effect (helped in all three on 1 of 4); on average -0.06 / +0.12 / -0.00 pts in 2006–09 / 2010–13 / 2014–16.
- Signal off-pass-epa (total) on top of a base model: no consistent effect (helped in all three on 0 of 2); on average -0.38 / +0.09 / -0.12 pts in 2006–09 / 2010–13 / 2014–16.
- Signal off-seconds-per-play (total) on top of a base model: no consistent effect (helped in all three on 0 of 2); on average -0.00 / +0.01 / -0.03 pts in 2006–09 / 2010–13 / 2014–16.
- Signal off-success (spread) on top of a base model: no consistent effect (helped in all three on 0 of 4); on average -0.00 / +0.05 / +0.00 pts in 2006–09 / 2010–13 / 2014–16.
- Signal off-success~c0.3 (spread) on top of a base model: no consistent effect (helped in all three on 0 of 4); on average -0.03 / +0.05 / +0.01 pts in 2006–09 / 2010–13 / 2014–16.
- Signal off-success~c0.7 (spread) on top of a base model: no consistent effect (helped in all three on 0 of 4); on average -0.01 / +0.02 / +0.02 pts in 2006–09 / 2010–13 / 2014–16.
- Signal off-success~h16 (total) on top of a base model: no consistent effect (helped in all three on 0 of 2); on average +0.00 / +0.02 / -0.03 pts in 2006–09 / 2010–13 / 2014–16.
- Signal off-success~h4 (spread) on top of a base model: no consistent effect (helped in all three on 1 of 4); on average +0.01 / +0.06 / +0.06 pts in 2006–09 / 2010–13 / 2014–16.
- Signal off-turnover-epa (spread) on top of a base model: no consistent effect (helped in all three on 0 of 4); on average -0.01 / -0.05 / -0.18 pts in 2006–09 / 2010–13 / 2014–16.
- Signal qb-change (spread) on top of a base model: no consistent effect (helped in all three on 0 of 4); on average -0.07 / +0.03 / +0.04 pts in 2006–09 / 2010–13 / 2014–16.
- Signal rest-diff (spread) on top of a base model: no consistent effect (helped in all three on 1 of 4); on average +0.02 / +0.09 / +0.05 pts in 2006–09 / 2010–13 / 2014–16.
- Signal short-week-diff (spread) on top of a base model: no consistent effect (helped in all three on 0 of 2); on average +0.00 / +0.00 / +0.00 pts in 2006–09 / 2010–13 / 2014–16.
- Signal travel-diff (spread) on top of a base model: no consistent effect (helped in all three on 0 of 4); on average -0.07 / -0.01 / -0.06 pts in 2006–09 / 2010–13 / 2014–16.

## What the search learned (185,587 configurations, 2006–2016 only)

- spread · elo · `bye_elo`: best 32 (median t +0.63), worst 0 (+0.06) over 175067 configurations
- spread · elo · `k`: best 28 (median t +0.78), worst 50 (-1.03) over 175067 configurations
- spread · elo · `market_blend`: best 0.375 (median t +0.58), worst 0.125 (-0.24) over 175067 configurations
- spread · elo · `market_resist`: best 2.252 (median t +0.71), worst 0.375 (-0.88) over 175067 configurations
- spread · elo · `mov`: best nfelo (median t +0.50), worst none (-0.25) over 175067 configurations
- spread · elo · `revert`: best 0.0667 (median t +0.76), worst 0.7 (-0.35) over 175067 configurations
- spread · elo · `travel_elo_per_1000mi`: best 3 (median t +0.31), worst 6 (+0.03) over 175067 configurations
- spread · signals · `base`: best {'params': {'carry': 0.7, 'hfa_pts': 3.5, 'margin_cap': None, 'prior_w': 4}, 'type': 'srs'} (median t +3.83), worst {'params': {'def_weight': 1.0, 'halflife': 8, 'metric': 'epa', 'pace': 'none', 'season_carry': 0.6}, 'type': 'team_rating'} (+0.67) over 1313 configurations
- spread · signals · `signals`: best [{'field': 'off_bye_diff', 'id': 'bye-diff', 'kind': 'schedule', 'markets': ['spread'], 'reason': 'Coming off a bye means extra rest and game-planning time.'}, {'carry': 0.5, 'den': 'plays', 'halflife': 8, 'id': 'def-turnover-epa', 'kind': 'team', 'markets': ['spread', 'total'], 'num': {'epa': 1, 'noto_epa': -1}, 'reason': 'Takeaway EPA per play by the defense: forced turnovers are partly luck and regress.', 'side': 'defense'}, {'carry': 0.5, 'den': None, 'halflife': 8, 'id': 'off-finishing', 'kind': 'team', 'markets': ['spread', 'total'], 'num': {'epa': -1, 'points': 1}, 'reason': 'Points scored beyond what EPA explains (red-zone finishing, short fields): partly luck that may not repeat.', 'side': 'offense'}] (median t +3.43), worst [{'field': 'short_week_diff', 'id': 'short-week-diff', 'kind': 'schedule', 'markets': ['spread'], 'reason': 'Short weeks (Thursday games) limit recovery and preparation.'}] (-inf) over 1313 configurations
- spread · srs · `carry`: best 1.0 (median t +2.02), worst 0.2 (+1.54) over 2402 configurations
- spread · srs · `hfa_pts`: best 0.5 (median t +1.97), worst 3.0 (+1.70) over 2402 configurations
- spread · srs · `margin_cap`: best 24 (median t +2.15), worst 14 (+0.80) over 2402 configurations
- spread · srs · `prior_w`: best 1.5 (median t +2.21), worst 15 (+0.30) over 2402 configurations
- spread · team_rating · `def_weight`: best 0.625 (median t +0.48), worst 1.25 (-0.27) over 3255 configurations
- spread · team_rating · `halflife`: best 40 (median t +0.46), worst 2 (-0.48) over 3255 configurations
- spread · team_rating · `metric`: best points (median t +1.15), worst success (-0.44) over 3255 configurations
- spread · team_rating · `season_carry`: best 1.0 (median t +0.62), worst 0.2 (-0.32) over 3255 configurations
- total · pace_eff · `halflife`: best 6 (median t -1.49), worst 40 (-1.83) over 294 configurations
- total · pace_eff · `season_carry`: best 0.4 (median t -1.52), worst 1.0 (-1.95) over 294 configurations
- total · signals · `base`: best {'params': {'def_weight': 0.25, 'halflife': 16, 'metric': 'early_epa', 'pace': 'seconds', 'season_carry': 0.9}, 'type': 'team_rating'} (median t -0.20), worst {'params': {'def_weight': 1.0, 'halflife': 8, 'metric': 'points', 'pace': 'none', 'season_carry': 0.6}, 'type': 'team_rating'} (-1.46) over 575 configurations
- total · signals · `signals`: best [{'carry': 0.5, 'den': 'pass_plays', 'halflife': 8, 'id': 'def-pass-epa', 'kind': 'team', 'markets': ['spread', 'total'], 'num': {'pass_epa': 1}, 'reason': 'Pass defense efficiency matters more than run defense in modern football.', 'side': 'defense'}, {'carry': 0.5, 'den': 'comp_plays', 'halflife': 8, 'id': 'off-comp-epa', 'kind': 'team', 'markets': ['spread', 'total'], 'num': {'comp_epa': 1}, 'reason': 'Efficiency while the game is in doubt, without garbage-time stats.', 'side': 'offense'}] (median t -0.53), worst [{'carry': 0.5, 'den': 'plays', 'halflife': 8, 'id': 'def-success', 'kind': 'team', 'markets': ['spread', 'total'], 'num': {'succ': 1}, 'reason': 'Success rate allowed: how often a defense lets opponents stay on schedule.', 'side': 'defense'}, {'carry': 0.5, 'den': 'plays', 'halflife': 8, 'id': 'def-turnover-epa', 'kind': 'team', 'markets': ['spread', 'total'], 'num': {'epa': 1, 'noto_epa': -1}, 'reason': 'Takeaway EPA per play by the defense: forced turnovers are partly luck and regress.', 'side': 'defense'}, {'carry': 0.5, 'den': 'plays', 'halflife': 8, 'id': 'off-turnover-epa', 'kind': 'team', 'markets': ['spread', 'total'], 'num': {'epa': 1, 'noto_epa': -1}, 'reason': 'EPA lost to turnovers per play: turnovers are noisy and tend to even out, so recent turnover luck may mislead the rating.', 'side': 'offense'}] (-1.94) over 575 configurations
- total · team_rating · `def_weight`: best 0.625 (median t -0.43), worst 1.0 (-1.45) over 1705 configurations
- total · team_rating · `halflife`: best 16 (median t -1.06), worst 2 (-1.64) over 1705 configurations
- total · team_rating · `metric`: best early_epa (median t -0.93), worst epa (-1.79) over 1705 configurations
- total · team_rating · `season_carry`: best 0.9 (median t -1.10), worst 0.55 (-1.53) over 1705 configurations
