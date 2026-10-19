# Research Lab -- lessons, NFL (EXPLORATORY)

_Generated 2026-10-19T07:06:52Z by research/lab/report.py after each run. **Exploratory, not proof**: each line compares a candidate with the one it builds on, gate by gate, with no correction for how many comparisons there are. Only the Inspector General's verdicts and the sealed exam decide anything._

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

## What the search learned (5,733 configurations, 2006–2016 only)

- spread · elo · `bye_elo`: best 12 (median t +1.44), worst 0 (+0.53) over 3664 configurations
- spread · elo · `hfa_mode`: best fixed (median t +0.90), worst rolling (+0.53) over 3664 configurations
- spread · elo · `k`: best 25 (median t +1.31), worst 10 (-0.13) over 3664 configurations
- spread · elo · `market_blend`: best 0.75 (median t +1.73), worst 0.0 (+0.52) over 3664 configurations
- spread · elo · `market_resist`: best 3.0 (median t +1.65), worst 0.75 (-0.67) over 3664 configurations
- spread · elo · `mov`: best 538 (median t +1.16), worst none (-0.24) over 3664 configurations
- spread · elo · `revert`: best 0.4 (median t +1.32), worst 0.5263 (-0.03) over 3664 configurations
- spread · elo · `travel_elo_per_1000mi`: best 8 (median t +1.54), worst 0 (+0.47) over 3664 configurations
- spread · srs · `carry`: best 0.2 (median t +2.35), worst 0.5 (+1.84) over 187 configurations
- spread · srs · `hfa_pts`: best 3.0 (median t +2.24), worst 1.5 (+1.83) over 187 configurations
- spread · srs · `margin_cap`: best 35 (median t +2.54), worst 14 (+0.52) over 187 configurations
- spread · srs · `prior_w`: best 4 (median t +2.29), worst 10 (+1.06) over 187 configurations
- spread · team_rating · `def_weight`: best 0.5 (median t +0.40), worst 1.0 (-0.10) over 761 configurations
- spread · team_rating · `halflife`: best 12 (median t +0.37), worst 3 (-0.30) over 761 configurations
- spread · team_rating · `metric`: best points (median t +1.63), worst success (-0.59) over 761 configurations
- spread · team_rating · `season_carry`: best 0.6667 (median t +2.25), worst 0.3 (-0.12) over 761 configurations
- total · pace_eff · `efficiency`: best points (median t -1.43), worst epa (-1.74) over 48 configurations
- total · pace_eff · `season_carry`: best 0.4 (median t -1.45), worst 0.8 (-1.87) over 48 configurations
- total · team_rating · `def_weight`: best 0.5 (median t -0.66), worst 1.0 (-1.50) over 660 configurations
- total · team_rating · `halflife`: best 32 (median t -0.70), worst 8 (-1.61) over 660 configurations
- total · team_rating · `metric`: best success (median t -1.23), worst epa (-1.88) over 660 configurations
- total · team_rating · `season_carry`: best 0.9 (median t -0.95), worst 0.3 (-1.55) over 660 configurations
