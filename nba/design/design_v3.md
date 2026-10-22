# NBA props model v3 -- design study (box scores only, no prices)

Mean log loss over points / rebounds / assists / threes, walk-forward 2021-2025 (lower is better).

| candidate | all | teammate_newly_out | teammate_back | oct_nov | new_team |
|---|---|---|---|---|---|
| v2 | 0.52267 | 0.53501 | 0.52179 | 0.51926 | 0.50707 |
| v3 | 0.51978 | 0.53177 | 0.51872 | 0.51645 | 0.50161 |
| v3_month | 0.5196 | 0.53158 | 0.51856 | 0.51638 | 0.50232 |

Rows: all 1597431, teammate_newly_out 710936, teammate_back 1051715, oct_nov 301451, new_team 14093

**Best overall:** v3_month.
