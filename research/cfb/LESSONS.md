# Research Lab -- lessons, College football (EXPLORATORY)

_Generated 2026-10-20T00:39:10Z by research/lab/report.py after each run. **Exploratory, not proof**: each line compares a candidate with the one it builds on, gate by gate, with no correction for how many comparisons there are. Only the Inspector General's verdicts and the sealed exam decide anything._

- **helped**: beat its parent in all three gates · **faded**: helped in the first gate but by less than half as much (or not at all) in the last · **no effect**: anything else. A candidate is only compared with a parent that ran under the same Constitution version (same seasons).

## Helped (0)

- none

## Faded (0)

- none

## No effect (0)

- none

## What the search learned (2,447 configurations, 2018–2021 only)

- spread · elo · `mov`: best 538 (median t -0.60), worst none (-0.97) over 849 configurations
- spread · ppa · `carry`: best 0.9 (median t -0.36), worst 0.6 (-0.82) over 125 configurations
- spread · ppa · `garbage_time`: best exclude (median t -0.47), worst include (-0.76) over 125 configurations
- spread · ppa · `prior_w`: best 6 (median t -0.52), worst 0.5 (-0.80) over 125 configurations
- spread · signals · `signals`: best [{'carry': 0.4, 'den': 'plays', 'halflife': 6, 'id': 'off-ppa', 'kind': 'team', 'markets': ['spread', 'total'], 'num': {'epa': 1}, 'reason': 'Offensive PPA per play: efficiency is steadier than points.', 'side': 'offense'}] (median t -inf), worst [{'carry': 0.4, 'den': 'plays', 'halflife': 6, 'id': 'off-ppa', 'kind': 'team', 'markets': ['spread', 'total'], 'num': {'epa': 1}, 'reason': 'Offensive PPA per play: efficiency is steadier than points.', 'side': 'offense'}] (-inf) over 7 configurations
- spread · srs · `carry`: best 0.9 (median t +0.18), worst 0.4 (-0.38) over 466 configurations
- spread · srs · `hfa_pts`: best 2.5 (median t +0.17), worst 3.5 (-0.14) over 466 configurations
- spread · srs · `margin_cap`: best None (median t +0.44), worst 21 (-0.70) over 466 configurations
- spread · srs · `prior_w`: best 0.5 (median t +0.53), worst 10 (-0.48) over 466 configurations
- spread · team_rating · `halflife`: best 2 (median t +0.41), worst 6 (-0.28) over 257 configurations
- spread · team_rating · `metric`: best points (median t +0.23), worst epa (-0.46) over 257 configurations
- spread · team_rating · `season_carry`: best 0.4 (median t +0.16), worst 0.7 (-0.25) over 257 configurations
- total · pace_eff · `efficiency`: best epa (median t +0.58), worst points (+0.01) over 203 configurations
- total · pace_eff · `halflife`: best 20 (median t +0.54), worst 2 (-0.28) over 203 configurations
- total · pace_eff · `pace`: best True (median t +0.58), worst False (-0.01) over 203 configurations
- total · pace_eff · `season_carry`: best 0.5 (median t +0.53), worst 0.2 (-0.25) over 203 configurations
- total · signals · `signals`: best [{'carry': 0.4, 'den': 'plays', 'halflife': 6, 'id': 'off-ppa', 'kind': 'team', 'markets': ['spread', 'total'], 'num': {'epa': 1}, 'reason': 'Offensive PPA per play: efficiency is steadier than points.', 'side': 'offense'}] (median t -inf), worst [{'carry': 0.4, 'den': 'plays', 'halflife': 6, 'id': 'off-ppa', 'kind': 'team', 'markets': ['spread', 'total'], 'num': {'epa': 1}, 'reason': 'Offensive PPA per play: efficiency is steadier than points.', 'side': 'offense'}] (-inf) over 14 configurations
- total · team_rating · `halflife`: best 4 (median t +1.37), worst 2 (+0.67) over 134 configurations
- total · team_rating · `metric`: best epa (median t +1.14), worst points (+0.14) over 134 configurations
- total · team_rating · `pace`: best plays (median t +1.15), worst none (+0.32) over 134 configurations
