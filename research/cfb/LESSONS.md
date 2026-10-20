# Research Lab -- lessons, College football (EXPLORATORY)

_Generated 2026-10-20T01:06:35Z by research/lab/report.py after each run. **Exploratory, not proof**: each line compares a candidate with the one it builds on, gate by gate, with no correction for how many comparisons there are. Only the Inspector General's verdicts and the sealed exam decide anything._

- **helped**: beat its parent in all three gates · **faded**: helped in the first gate but by less than half as much (or not at all) in the last · **no effect**: anything else. A candidate is only compared with a parent that ran under the same Constitution version (same seasons).

## Helped (0)

- none

## Faded (0)

- none

## No effect (0)

- none

## What the search learned (3,720 configurations, 2018–2021 only)

- spread · elo · `k`: best 40 (median t -0.71), worst 10 (-1.00) over 1452 configurations
- spread · elo · `mov`: best 538 (median t -0.63), worst none (-1.06) over 1452 configurations
- spread · ppa · `carry`: best 0.8 (median t -0.36), worst 0.6 (-0.82) over 128 configurations
- spread · ppa · `garbage_time`: best exclude (median t -0.46), worst include (-0.76) over 128 configurations
- spread · ppa · `prior_w`: best 6 (median t -0.52), worst 0.5 (-0.80) over 128 configurations
- spread · signals · `signals`: best [{'carry': 0.4, 'den': 'plays', 'halflife': 6, 'id': 'off-ppa', 'kind': 'team', 'markets': ['spread', 'total'], 'num': {'epa': 1}, 'reason': 'Offensive PPA per play: efficiency is steadier than points.', 'side': 'offense'}] (median t -inf), worst [{'carry': 0.4, 'den': 'plays', 'halflife': 6, 'id': 'off-ppa', 'kind': 'team', 'markets': ['spread', 'total'], 'num': {'epa': 1}, 'reason': 'Offensive PPA per play: efficiency is steadier than points.', 'side': 'offense'}] (-inf) over 7 configurations
- spread · srs · `carry`: best 0.9 (median t +0.07), worst 0.2 (-0.50) over 938 configurations
- spread · srs · `hfa_pts`: best 1.5 (median t -0.06), worst 3.5 (-0.34) over 938 configurations
- spread · srs · `margin_cap`: best None (median t +0.31), worst 21 (-0.66) over 938 configurations
- spread · srs · `prior_w`: best 0.5 (median t +0.12), worst 9 (-0.50) over 938 configurations
- spread · team_rating · `halflife`: best 2 (median t +0.37), worst 6 (-0.40) over 373 configurations
- spread · team_rating · `metric`: best points (median t +0.22), worst epa (-0.47) over 373 configurations
- spread · team_rating · `season_carry`: best 0.3 (median t +0.07), worst 0.7 (-0.21) over 373 configurations
- total · pace_eff · `efficiency`: best epa (median t +0.55), worst points (-0.03) over 223 configurations
- total · pace_eff · `halflife`: best 14 (median t +0.48), worst 2 (-0.33) over 223 configurations
- total · pace_eff · `pace`: best True (median t +0.55), worst False (-0.09) over 223 configurations
- total · pace_eff · `season_carry`: best 0.5 (median t +0.53), worst 0.2 (-0.25) over 223 configurations
- total · signals · `signals`: best [{'carry': 0.4, 'den': 'plays', 'halflife': 6, 'id': 'off-ppa', 'kind': 'team', 'markets': ['spread', 'total'], 'num': {'epa': 1}, 'reason': 'Offensive PPA per play: efficiency is steadier than points.', 'side': 'offense'}] (median t -inf), worst [{'carry': 0.4, 'den': 'plays', 'halflife': 6, 'id': 'off-ppa', 'kind': 'team', 'markets': ['spread', 'total'], 'num': {'epa': 1}, 'reason': 'Offensive PPA per play: efficiency is steadier than points.', 'side': 'offense'}] (-inf) over 14 configurations
- total · team_rating · `halflife`: best 4 (median t +1.37), worst 8 (+0.58) over 163 configurations
- total · team_rating · `metric`: best epa (median t +1.14), worst points (+0.16) over 163 configurations
- total · team_rating · `pace`: best plays (median t +1.15), worst none (+0.51) over 163 configurations
