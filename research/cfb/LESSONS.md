# Research Lab -- lessons, College football (EXPLORATORY)

_Generated 2026-10-23T00:04:16Z by research/lab/report.py after each run. **Exploratory, not proof**: each line compares a candidate with the one it builds on, gate by gate, with no correction for how many comparisons there are. Only the Inspector General's verdicts and the sealed exam decide anything._

- **helped**: beat its parent in all three gates · **faded**: helped in the first gate but by less than half as much (or not at all) in the last · **no effect**: anything else. A candidate is only compared with a parent that ran under the same Constitution version (same seasons).
- Lines starting **Signal** come from the search, refreshed every round: the signal on a base model vs that base alone in each search period (2018–2021 only); **helped** = better in all three periods on most of the bases it was tried on.

## Helped (4)

- Signal def-finishing (total) on top of a base model: helped in all three search periods on 1 of 1 base model; on average +0.05 / +0.05 / +0.09 pts in 2018 / 2019 / 2021.
- Signal def-points-per-play (total) on top of a base model: helped in all three search periods on 1 of 1 base model; on average +0.05 / +0.05 / +0.09 pts in 2018 / 2019 / 2021.
- Signal def-ppa (spread) on top of a base model: helped in all three search periods on 1 of 1 base model; on average +0.26 / +0.02 / +0.00 pts in 2018 / 2019 / 2021.
- Signal off-finishing (total) on top of a base model: helped in all three search periods on 1 of 1 base model; on average +0.07 / +0.05 / +0.09 pts in 2018 / 2019 / 2021.

## Faded (5)

- Signal def-finishing (spread) on top of a base model: helped in 2018, then faded (helped in all three on 0 of 1); on average +0.07 / +0.16 / -0.13 pts in 2018 / 2019 / 2021.
- Signal def-points-per-play (spread) on top of a base model: helped in 2018, then faded (helped in all three on 0 of 1); on average +0.24 / +0.27 / -0.12 pts in 2018 / 2019 / 2021.
- Signal off-finishing (spread) on top of a base model: helped in 2018, then faded (helped in all three on 0 of 1); on average +0.04 / -0.02 / -0.06 pts in 2018 / 2019 / 2021.
- Signal off-points-per-play (total) on top of a base model: helped in 2018, then faded (helped in all three on 0 of 1); on average +0.05 / +0.16 / -0.03 pts in 2018 / 2019 / 2021.
- Signal off-ppa (total) on top of a base model: helped in 2018, then faded (helped in all three on 0 of 1); on average +0.37 / +0.45 / -0.28 pts in 2018 / 2019 / 2021.

## No effect (4)

- Signal def-ppa (total) on top of a base model: no consistent effect (helped in all three on 0 of 1); on average -0.03 / +0.00 / +0.11 pts in 2018 / 2019 / 2021.
- Signal off-pace (total) on top of a base model: no consistent effect (helped in all three on 0 of 1); on average +0.00 / +0.04 / +0.00 pts in 2018 / 2019 / 2021.
- Signal off-points-per-play (spread) on top of a base model: no consistent effect (helped in all three on 0 of 1); on average -0.06 / -0.07 / -0.53 pts in 2018 / 2019 / 2021.
- Signal off-ppa (spread) on top of a base model: no consistent effect (helped in all three on 0 of 1); on average -0.02 / +0.01 / -0.69 pts in 2018 / 2019 / 2021.

## What the search learned (4,758 configurations, 2018–2021 only)

- spread · elo · `k`: best 40 (median t -0.72), worst 10 (-1.07) over 2048 configurations
- spread · elo · `mov`: best 538 (median t -0.66), worst none (-1.21) over 2048 configurations
- spread · ppa · `carry`: best 0.8 (median t -0.36), worst 0.6 (-0.82) over 128 configurations
- spread · ppa · `garbage_time`: best exclude (median t -0.46), worst include (-0.76) over 128 configurations
- spread · ppa · `prior_w`: best 6 (median t -0.52), worst 0.5 (-0.80) over 128 configurations
- spread · signals · `signals`: best [{'carry': 0.4, 'den': 'plays', 'halflife': 6, 'id': 'off-ppa', 'kind': 'team', 'markets': ['spread', 'total'], 'num': {'epa': 1}, 'reason': 'Offensive PPA per play: efficiency is steadier than points.', 'side': 'offense'}] (median t -inf), worst [{'carry': 0.4, 'den': 'plays', 'halflife': 6, 'id': 'off-ppa', 'kind': 'team', 'markets': ['spread', 'total'], 'num': {'epa': 1}, 'reason': 'Offensive PPA per play: efficiency is steadier than points.', 'side': 'offense'}] (-inf) over 51 configurations
- spread · srs · `carry`: best 0.9 (median t +0.01), worst 0.2 (-0.58) over 1280 configurations
- spread · srs · `hfa_pts`: best 1.5 (median t -0.11), worst 3.5 (-0.42) over 1280 configurations
- spread · srs · `margin_cap`: best None (median t +0.25), worst 21 (-0.68) over 1280 configurations
- spread · srs · `prior_w`: best 0.5 (median t +0.02), worst 9 (-0.52) over 1280 configurations
- spread · team_rating · `halflife`: best 2 (median t +0.37), worst 6 (-0.40) over 378 configurations
- spread · team_rating · `metric`: best points (median t +0.22), worst epa (-0.47) over 378 configurations
- spread · team_rating · `season_carry`: best 0.3 (median t +0.07), worst 0.7 (-0.21) over 378 configurations
- total · pace_eff · `efficiency`: best epa (median t +0.54), worst points (-0.03) over 224 configurations
- total · pace_eff · `halflife`: best 14 (median t +0.48), worst 2 (-0.33) over 224 configurations
- total · pace_eff · `pace`: best True (median t +0.55), worst False (-0.09) over 224 configurations
- total · pace_eff · `season_carry`: best 0.5 (median t +0.53), worst 0.2 (-0.25) over 224 configurations
- total · signals · `signals`: best [{'carry': 0.4, 'den': 'plays', 'halflife': 6, 'id': 'off-points-per-play', 'kind': 'team', 'markets': ['spread', 'total'], 'num': {'points': 1}, 'reason': 'Points per play (tempo-free scoring, as in public college analytics): college tempos vary widely, so points per game overrate fast offenses and underrate slow ones.', 'side': 'offense'}, {'carry': 0.4, 'den': 'plays', 'halflife': 6, 'id': 'off-ppa', 'kind': 'team', 'markets': ['spread', 'total'], 'num': {'epa': 1}, 'reason': 'Offensive PPA per play: efficiency is steadier than points.', 'side': 'offense'}] (median t +0.16), worst [{'carry': 0.4, 'den': 'plays', 'halflife': 6, 'id': 'off-ppa', 'kind': 'team', 'markets': ['spread', 'total'], 'num': {'epa': 1}, 'reason': 'Offensive PPA per play: efficiency is steadier than points.', 'side': 'offense'}] (-inf) over 64 configurations
- total · team_rating · `halflife`: best 4 (median t +1.37), worst 8 (+0.58) over 163 configurations
- total · team_rating · `metric`: best epa (median t +1.14), worst points (+0.16) over 163 configurations
- total · team_rating · `pace`: best plays (median t +1.15), worst none (+0.51) over 163 configurations
