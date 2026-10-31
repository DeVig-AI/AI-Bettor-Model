# Research Lab -- lessons, NBA (EXPLORATORY)

_Generated 2026-10-31T20:54:11Z by research/lab/report.py after each run. **Exploratory, not proof**: each line compares a candidate with the one it builds on, gate by gate, with no correction for how many comparisons there are. Only the Inspector General's verdicts and the sealed exam decide anything._

- **helped**: beat its parent in all three gates · **faded**: helped in the first gate but by less than half as much (or not at all) in the last · **no effect**: anything else. A candidate is only compared with a parent that ran under the same Constitution version (same seasons).
- Lines starting **Signal** come from the search, refreshed every round: the signal on a base model vs that base alone in each search period (2014–2016 only); **helped** = better in all three periods on most of the bases it was tried on.

## Helped (1)

- SRS · carry 0.1 · prior 24 vs the line-only baseline: helped in every gate (+0.03 / +0.22 / +0.81 pts in 2017 / 2018 / 2019).

## Faded (4)

- Signal def-ft-rate (total) on top of a base model: helped in 2014, then faded (helped in all three on 0 of 1); on average +0.01 / +0.00 / +0.00 pts in 2014 / 2015 / 2016.
- Signal def-tov-rate (spread) on top of a base model: helped in 2014, then faded (helped in all three on 0 of 1); on average +0.02 / +0.01 / -0.06 pts in 2014 / 2015 / 2016.
- Signal def-tov-rate (total) on top of a base model: helped in 2014, then faded (helped in all three on 0 of 1); on average +0.01 / -0.01 / +0.00 pts in 2014 / 2015 / 2016.
- Signal off-3pa-rate (spread) on top of a base model: helped in 2014, then faded (helped in all three on 0 of 1); on average +0.12 / +0.03 / -0.19 pts in 2014 / 2015 / 2016.

## No effect (21)

- Blend of 2: s-e425bd72 + s-066ccdc8 vs the line-only baseline: no consistent effect (-0.12 / +0.42 / +0.67 pts in 2017 / 2018 / 2019).
- Signal def-drtg (spread) on top of a base model: no consistent effect (helped in all three on 0 of 1); on average -0.28 / -0.11 / -0.35 pts in 2014 / 2015 / 2016.
- Signal def-drtg (total) on top of a base model: no consistent effect (helped in all three on 0 of 1); on average -0.06 / +0.00 / +0.04 pts in 2014 / 2015 / 2016.
- Signal def-efg (spread) on top of a base model: no consistent effect (helped in all three on 0 of 1); on average -0.17 / -0.12 / -0.23 pts in 2014 / 2015 / 2016.
- Signal def-efg (total) on top of a base model: no consistent effect (helped in all three on 0 of 1); on average -0.06 / +0.00 / +0.04 pts in 2014 / 2015 / 2016.
- Signal def-ft-rate (spread) on top of a base model: no consistent effect (helped in all three on 0 of 1); on average -0.02 / -0.05 / -0.10 pts in 2014 / 2015 / 2016.
- Signal def-oreb (spread) on top of a base model: no consistent effect (helped in all three on 0 of 1); on average -0.07 / -0.05 / +0.00 pts in 2014 / 2015 / 2016.
- Signal def-oreb (total) on top of a base model: no consistent effect (helped in all three on 0 of 1); on average -0.08 / +0.00 / +0.04 pts in 2014 / 2015 / 2016.
- Signal def-pace (total) on top of a base model: no consistent effect (helped in all three on 0 of 1); on average -0.11 / +0.03 / +0.06 pts in 2014 / 2015 / 2016.
- Signal off-3pa-rate (total) on top of a base model: no consistent effect (helped in all three on 0 of 1); on average -0.16 / -0.13 / +0.08 pts in 2014 / 2015 / 2016.
- Signal off-efg (spread) on top of a base model: no consistent effect (helped in all three on 0 of 1); on average -0.15 / -0.02 / -0.34 pts in 2014 / 2015 / 2016.
- Signal off-efg (total) on top of a base model: no consistent effect (helped in all three on 0 of 1); on average -0.08 / +0.05 / +0.06 pts in 2014 / 2015 / 2016.
- Signal off-ft-rate (spread) on top of a base model: no consistent effect (helped in all three on 0 of 1); on average -0.29 / -0.20 / -0.34 pts in 2014 / 2015 / 2016.
- Signal off-ft-rate (total) on top of a base model: no consistent effect (helped in all three on 0 of 1); on average -0.13 / +0.07 / +0.06 pts in 2014 / 2015 / 2016.
- Signal off-oreb (spread) on top of a base model: no consistent effect (helped in all three on 0 of 1); on average -0.04 / -0.06 / -0.09 pts in 2014 / 2015 / 2016.
- Signal off-oreb (total) on top of a base model: no consistent effect (helped in all three on 0 of 1); on average -0.01 / -0.05 / +0.00 pts in 2014 / 2015 / 2016.
- Signal off-ortg (spread) on top of a base model: no consistent effect (helped in all three on 0 of 1); on average -0.19 / -0.35 / -0.63 pts in 2014 / 2015 / 2016.
- Signal off-ortg (total) on top of a base model: no consistent effect (helped in all three on 0 of 1); on average -0.08 / +0.00 / +0.04 pts in 2014 / 2015 / 2016.
- Signal off-pace (total) on top of a base model: no consistent effect (helped in all three on 0 of 1); on average -0.11 / +0.03 / +0.06 pts in 2014 / 2015 / 2016.
- Signal off-tov-rate (spread) on top of a base model: no consistent effect (helped in all three on 0 of 1); on average -0.05 / -0.07 / -0.02 pts in 2014 / 2015 / 2016.
- Signal off-tov-rate (total) on top of a base model: no consistent effect (helped in all three on 0 of 1); on average -0.07 / +0.00 / +0.04 pts in 2014 / 2015 / 2016.

## What the search learned (124,637 configurations, 2014–2016 only)

- spread · elo · `hfa_elo`: best 18 (median t +1.27), worst 150 (+0.38) over 83290 configurations
- spread · elo · `k`: best 2 (median t +1.67), worst 40 (-1.23) over 83290 configurations
- spread · elo · `market_blend`: best 0.9375 (median t +1.27), worst 0.0 (+0.77) over 83290 configurations
- spread · elo · `mov`: best none (median t +1.13), worst 538 (+0.47) over 83290 configurations
- spread · elo · `revert`: best 0.9 (median t +1.48), worst 0.2 (+0.54) over 83290 configurations
- spread · signals · `signals`: best [{'carry': 0.5, 'den': 'fga', 'halflife': 10, 'id': 'off-3pa-rate', 'kind': 'team', 'markets': ['spread', 'total'], 'num': {'fg3a': 1}, 'reason': "Share of shots that are threes; shot selection drives efficiency and how much a team's scoring varies.", 'side': 'offense'}] (median t +2.73), worst [{'carry': 0.5, 'den': 'poss', 'halflife': 10, 'id': 'off-ortg', 'kind': 'team', 'markets': ['spread', 'total'], 'num': {'points': 1}, 'reason': 'Points per possession (offensive rating) separates scoring quality from pace; scoring margin mixes both.', 'side': 'offense'}] (+0.69) over 30 configurations
- spread · srs · `carry`: best 0.1 (median t +1.55), worst 0.875 (+1.16) over 38052 configurations
- spread · srs · `hfa_pts`: best 0.75 (median t +1.63), worst 4.0 (+0.93) over 38052 configurations
- spread · srs · `margin_cap`: best 8 (median t +1.48), worst None (+0.93) over 38052 configurations
- spread · srs · `prior_w`: best 40.0 (median t +1.51), worst 0.5 (+0.71) over 38052 configurations
- spread · team_rating · `def_weight`: best 1.0 (median t +0.62), worst 0.5 (+0.28) over 663 configurations
- spread · team_rating · `halflife`: best 1 (median t +1.08), worst 5 (-0.22) over 663 configurations
- spread · team_rating · `season_carry`: best 1.0 (median t +0.59), worst 0.2 (+0.07) over 663 configurations
- total · pace_eff · `halflife`: best 1 (median t +0.45), worst 5 (-0.49) over 221 configurations
- total · pace_eff · `season_carry`: best 0.625 (median t +0.05), worst 0.85 (-0.23) over 221 configurations
- total · signals · `signals`: best [{'carry': 0.5, 'den': 'poss', 'halflife': 10, 'id': 'def-drtg', 'kind': 'team', 'markets': ['spread', 'total'], 'num': {'points': 1}, 'reason': 'Points allowed per possession (defensive rating), the defensive half of efficiency, free of pace.', 'side': 'defense'}, {'carry': 0.5, 'halflife': 10, 'id': 'def-pace', 'kind': 'team', 'markets': ['total'], 'num': {'poss': 1}, 'reason': 'Possessions in games against this team; some defenses slow opponents down, which lowers totals.', 'side': 'defense'}] (median t +1.32), worst [{'carry': 0.5, 'den': 'fga', 'halflife': 10, 'id': 'def-ft-rate', 'kind': 'team', 'markets': ['spread', 'total'], 'num': {'fta': 1}, 'reason': 'Free-throw attempts allowed per field-goal attempt, how often a defense fouls.', 'side': 'defense'}, {'carry': 0.5, 'den': 'poss', 'halflife': 10, 'id': 'def-oreb', 'kind': 'team', 'markets': ['spread', 'total'], 'num': {'oreb': 1}, 'reason': 'Offensive rebounds allowed per possession, how well a defense finishes possessions with a rebound.', 'side': 'defense'}] (+0.83) over 32 configurations
- total · team_rating · `halflife`: best 1 (median t +0.88), worst 40 (-0.13) over 663 configurations
