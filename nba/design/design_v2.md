# NBA props model v2 -- design study (box scores only, no prices)

Walk-forward, test seasons 2021-2025; log loss of P(stat > line) on Kalshi's ladder rungs near each player's level (lower is better).

| model | mean | points | rebounds | assists | threes |
|---|---|---|---|---|---|
| v1 | 0.55009 | 0.48634 | 0.53641 | 0.57037 | 0.60723 |
| v2_ratio | 0.52268 | 0.4589 | 0.511 | 0.54056 | 0.58025 |
| v2_nb | 0.52661 | 0.4763 | 0.51135 | 0.53983 | 0.57895 |
| v2_poisson | 0.53653 | 0.5098 | 0.51485 | 0.54152 | 0.57997 |

**Chosen v2 spread:** v2_ratio.

Top inputs by gain:

- points: points_e20 65%, usage_e5 16%, usage_e20 9%, vac_pts 2%, last_min 1%, points_e5 1%
- rebounds: rebounds_e20 74%, rebounds_e5 11%, start_rate 2%, last_min 1%, rebounds_pm 1%, vac_reb 1%
- assists: assists_e20 70%, assists_e5 17%, assists_pm 3%, usage_e20 2%, minutes_e5 1%, vac_ast 1%
- threes: fg3a_e20 66%, threes_e20 20%, fg3a_e5 4%, threes_pm 1%, last_min 1%, vac_pts 1%
