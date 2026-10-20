# Research Lab -- lessons, NFL (EXPLORATORY)

_Generated 2026-10-20T04:04:18Z by research/lab/report.py after each run. **Exploratory, not proof**: each line compares a candidate with the one it builds on, gate by gate, with no correction for how many comparisons there are. Only the Inspector General's verdicts and the sealed exam decide anything._

- **helped**: beat its parent in all three gates · **faded**: helped in the first gate but by less than half as much (or not at all) in the last · **no effect**: anything else. A candidate is only compared with a parent that ran under the same Constitution version (same seasons).

## Helped (3)

- Plain Elo, slower (K 10) vs Plain Elo: helped in every gate (+0.13 / +0.30 / +0.01 pts in 2016–18 / 2019–21 / 2022–24).
- + Stronger preseason reversion vs Plain Elo: helped in every gate (+0.20 / +0.20 / +0.36 pts in 2016–18 / 2019–21 / 2022–24).
- Pace × efficiency, fast (half-life 4) vs Pace × efficiency totals: helped in every gate (+0.51 / +0.06 / +0.11 pts in 2016–18 / 2019–21 / 2022–24).

## Faded (7)

- 538-style combination vs Plain Elo: helped in 2016–18, then faded (+0.14 / +0.05 / -0.26 pts in 2016–18 / 2019–21 / 2022–24).
- + Rest / bye bonus vs Plain Elo: helped in 2016–18, then faded (+0.08 / -0.02 / +0.00 pts in 2016–18 / 2019–21 / 2022–24).
- + Margin-of-victory multiplier vs Plain Elo: helped in 2016–18, then faded (+0.07 / -0.17 / -0.61 pts in 2016–18 / 2019–21 / 2022–24).
- nfelo-style combination vs Plain Elo: helped in 2016–18, then faded (+0.19 / +0.18 / -0.22 pts in 2016–18 / 2019–21 / 2022–24).
- + Market-resistant K vs Plain Elo: helped in 2016–18, then faded (+0.63 / +0.48 / -0.20 pts in 2016–18 / 2019–21 / 2022–24).
- Blend of 2: s-3770bfc8 + s-6f3641ca vs the line-only baseline: helped in 2017–19, then faded (+0.55 / +0.73 / -1.30 pts in 2017–19 / 2020–22 / 2023–24).
- Blend of 2: s-473e5379 + s-8a5f816b vs the line-only baseline: helped in 2017–19, then faded (+0.62 / +0.00 / -0.83 pts in 2017–19 / 2020–22 / 2023–24).

## No effect (10)

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

## What the search learned (84,598 configurations, 2006–2016 only)

- spread · elo · `k`: best 25 (median t +0.92), worst 6 (-0.20) over 77508 configurations
- spread · elo · `market_resist`: best 1.5039 (median t +0.64), worst 0.0 (+0.24) over 77508 configurations
- spread · elo · `mov`: best nfelo (median t +0.75), worst none (-0.08) over 77508 configurations
- spread · elo · `revert`: best 0.2 (median t +0.94), worst 0.7 (-0.16) over 77508 configurations
- spread · signals · `base`: best {'params': {'carry': 0.5, 'hfa_pts': 2.0, 'margin_cap': None, 'prior_w': 3}, 'type': 'srs'} (median t +2.55), worst {'params': {'def_weight': 1.0, 'halflife': 8, 'metric': 'epa', 'pace': 'none', 'season_carry': 0.6}, 'type': 'team_rating'} (+0.63) over 92 configurations
- spread · signals · `signals`: best [{'carry': 0.5, 'den': 'plays', 'halflife': 8, 'id': 'def-turnover-epa', 'kind': 'team', 'markets': ['spread', 'total'], 'num': {'epa': 1, 'noto_epa': -1}, 'reason': 'Takeaway EPA per play by the defense: forced turnovers are partly luck and regress.', 'side': 'defense'}, {'field': 'rest_diff', 'id': 'rest-diff', 'kind': 'schedule', 'markets': ['spread'], 'reason': 'Extra days of rest help recovery and preparation.'}] (median t +2.00), worst [{'carry': 0.5, 'den': 'plays', 'halflife': 8, 'id': 'def-success', 'kind': 'team', 'markets': ['spread', 'total'], 'num': {'succ': 1}, 'reason': 'Success rate allowed: how often a defense lets opponents stay on schedule.', 'side': 'defense'}, {'field': 'div_game', 'id': 'div-game', 'kind': 'schedule', 'markets': ['spread'], 'reason': 'Division rivals know each other well, which may narrow the home edge.'}] (+1.25) over 92 configurations
- spread · srs · `carry`: best 0.8 (median t +1.87), worst 0.2 (+1.48) over 1920 configurations
- spread · srs · `margin_cap`: best 35 (median t +1.92), worst 14 (+0.71) over 1920 configurations
- spread · srs · `prior_w`: best 2 (median t +2.13), worst 15 (+0.29) over 1920 configurations
- spread · team_rating · `def_weight`: best 0.25 (median t +0.33), worst 1.25 (-0.30) over 2835 configurations
- spread · team_rating · `halflife`: best 32 (median t +0.37), worst 2 (-0.48) over 2835 configurations
- spread · team_rating · `metric`: best points (median t +1.18), worst success (-0.46) over 2835 configurations
- spread · team_rating · `season_carry`: best 0.9 (median t +0.32), worst 0.2 (-0.33) over 2835 configurations
- total · pace_eff · `halflife`: best 6 (median t -1.45), worst 32 (-1.70) over 162 configurations
- total · pace_eff · `season_carry`: best 0.4 (median t -1.51), worst 0.9 (-1.87) over 162 configurations
- total · signals · `signals`: best [{'carry': 0.5, 'den': 'comp_plays', 'halflife': 8, 'id': 'off-comp-epa', 'kind': 'team', 'markets': ['spread', 'total'], 'num': {'comp_epa': 1}, 'reason': 'Efficiency while the game is in doubt, without garbage-time stats.', 'side': 'offense'}, {'carry': 0.5, 'den': 'early_plays', 'halflife': 8, 'id': 'off-early-epa', 'kind': 'team', 'markets': ['spread', 'total'], 'num': {'early_epa': 1}, 'reason': "Early-down efficiency shows a team's real offense with less third-down noise.", 'side': 'offense'}] (median t -0.95), worst [{'carry': 0.5, 'den': 'plays', 'halflife': 8, 'id': 'def-success', 'kind': 'team', 'markets': ['spread', 'total'], 'num': {'succ': 1}, 'reason': 'Success rate allowed: how often a defense lets opponents stay on schedule.', 'side': 'defense'}, {'carry': 0.5, 'den': 'plays', 'halflife': 8, 'id': 'def-turnover-epa', 'kind': 'team', 'markets': ['spread', 'total'], 'num': {'epa': 1, 'noto_epa': -1}, 'reason': 'Takeaway EPA per play by the defense: forced turnovers are partly luck and regress.', 'side': 'defense'}, {'carry': 0.5, 'den': 'comp_plays', 'halflife': 8, 'id': 'off-comp-epa', 'kind': 'team', 'markets': ['spread', 'total'], 'num': {'comp_epa': 1}, 'reason': 'Efficiency while the game is in doubt, without garbage-time stats.', 'side': 'offense'}] (-2.21) over 38 configurations
- total · team_rating · `def_weight`: best 0.25 (median t -0.58), worst 1.0 (-1.47) over 1317 configurations
- total · team_rating · `halflife`: best 24 (median t -1.14), worst 2 (-1.64) over 1317 configurations
- total · team_rating · `metric`: best early_epa (median t -1.13), worst epa (-1.80) over 1317 configurations
- total · team_rating · `season_carry`: best 0.9 (median t -1.18), worst 0.2 (-1.53) over 1317 configurations
