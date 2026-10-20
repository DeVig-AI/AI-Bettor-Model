# NBA_PROPS_KALSHI_BACKTEST_V1 results

Prereg sha256 `6238976e1a3d6278510299ffeed185c45f0b2b93e5be2fe42dfd7eb29e79358f` · seasons [2026] (tables fit on {'2026': '2010-2025'}) · refit on 2010-2026 reproduces the frozen tables: True

Kalshi NBA prop history found: 696 games. Coverage by season: {"2026": {"games": 696, "markets": 68595, "with_price": 66624, "first": "2026-01-16", "last": "2026-06-13", "by_type": {"2": 53902, "3": 13762, "5": 931}}}

Funnel: {"collected": 71581, "settled_yes_no": 68595, "nba_game_types_modeled_stat": 68595, "after_dedup": 68595, "player_unmatched": 8, "model_chance_exists": 68587, "main_set": 19767}

## Test 1 (primary): KALSHI MORE RIGHT
Main set 19767 rows / 687 games. Model log loss 0.55801, Kalshi mid 0.54115, difference 0.01685 (95% CI [0.01234, 0.02132]). Negative = model more right.

By season: {"2026": {"rows": 19767, "games": 687, "yes_rate": 0.3937, "model_logloss": 0.55801, "kalshi_logloss": 0.54115, "diff_model_minus_kalshi": 0.01685, "diff_95ci": [0.01234, 0.02132]}}

By stat: {"points": {"rows": 8226, "games": 667, "yes_rate": 0.3744, "model_logloss": 0.53868, "kalshi_logloss": 0.52007, "diff_model_minus_kalshi": 0.01861, "diff_95ci": [0.01249, 0.02471]}, "rebounds": {"rows": 4440, "games": 634, "yes_rate": 0.443, "model_logloss": 0.59704, "kalshi_logloss": 0.57874, "diff_model_minus_kalshi": 0.0183, "diff_95ci": [0.00987, 0.02667]}, "assists": {"rows": 3332, "games": 606, "yes_rate": 0.4148, "model_logloss": 0.5805, "kalshi_logloss": 0.56523, "diff_model_minus_kalshi": 0.01527, "diff_95ci": [0.00482, 0.0257]}, "threes": {"rows": 3769, "games": 538, "yes_rate": 0.3592, "model_logloss": 0.53431, "kalshi_logloss": 0.52159, "diff_model_minus_kalshi": 0.01272, "diff_95ci": [0.00375, 0.02151]}, "pts_reb_ast": {"rows": 0, "games": 0}, "pts_reb": {"rows": 0, "games": 0}, "pts_ast": {"rows": 0, "games": 0}, "reb_ast": {"rows": 0, "games": 0}}

## Test 2: NOT SHOWN PROFITABLE
All picks: {"count": 5542, "games": 666, "win_rate": 0.4664, "avg_cost": 0.4696, "avg_ev": 0.1076, "profit_sum": -17.704, "cost_sum": 2602.704, "roi": -0.0068, "roi_95ci": [-0.0345, 0.0209]}

By side: {"OVER": {"count": 1692, "games": 533, "win_rate": 0.3422, "avg_cost": 0.3447, "avg_ev": 0.1025, "profit_sum": -4.257, "cost_sum": 583.257, "roi": -0.0073, "roi_95ci": [-0.0712, 0.0578]}, "UNDER": {"count": 3850, "games": 653, "win_rate": 0.521, "avg_cost": 0.5245, "avg_ev": 0.1098, "profit_sum": -13.447, "cost_sum": 2019.447, "roi": -0.0067, "roi_95ci": [-0.0379, 0.0246]}}

By stat: {"points": {"count": 2215, "games": 618, "win_rate": 0.4637, "avg_cost": 0.4681, "avg_ev": 0.1077, "profit_sum": -9.937, "cost_sum": 1036.937, "roi": -0.0096, "roi_95ci": [-0.049, 0.0301]}, "rebounds": {"count": 1270, "games": 537, "win_rate": 0.4315, "avg_cost": 0.4541, "avg_ev": 0.108, "profit_sum": -28.763, "cost_sum": 576.763, "roi": -0.0499, "roi_95ci": [-0.1061, 0.0075]}, "assists": {"count": 1053, "games": 505, "win_rate": 0.49, "avg_cost": 0.4768, "avg_ev": 0.1062, "profit_sum": 13.94, "cost_sum": 502.06, "roi": 0.0278, "roi_95ci": [-0.0323, 0.0865]}, "threes": {"count": 1004, "games": 441, "win_rate": 0.492, "avg_cost": 0.485, "avg_ev": 0.1082, "profit_sum": 7.056, "cost_sum": 486.944, "roi": 0.0145, "roi_95ci": [-0.0438, 0.0746]}, "pts_reb_ast": {"count": 0}, "pts_reb": {"count": 0}, "pts_ast": {"count": 0}, "reb_ast": {"count": 0}}

By season: {"2026": {"count": 5542, "games": 666, "win_rate": 0.4664, "avg_cost": 0.4696, "avg_ev": 0.1076, "profit_sum": -17.704, "cost_sum": 2602.704, "roi": -0.0068, "roi_95ci": [-0.0345, 0.0209]}}

## Information only
{"test1_no_gap_filter": {"rows": 23136, "games": 689, "yes_rate": 0.411, "model_logloss": 0.59536, "kalshi_logloss": 0.55547, "diff_model_minus_kalshi": 0.0399, "diff_95ci": [0.03278, 0.04752]}, "test1_other_stats": {"rows": 1123, "games": 266, "yes_rate": 0.3802, "model_logloss": 0.60904, "kalshi_logloss": 0.58889, "diff_model_minus_kalshi": 0.02015, "diff_95ci": [0.00381, 0.0361]}, "live_pass_bar_met": false}

No injury filter (no historical injury reports). This is a back-test on past prices; it cannot replace the live paper test.
