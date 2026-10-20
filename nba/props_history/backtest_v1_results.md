# NBA_PROPS_KALSHI_BACKTEST_V1 results

Prereg sha256 `6238976e1a3d6278510299ffeed185c45f0b2b93e5be2fe42dfd7eb29e79358f` · seasons [2026] (tables fit on {'2026': '2010-2025'}) · refit on 2010-2026 reproduces the frozen tables: True

Kalshi NBA prop history found: 1092 games. Coverage by season: {"2026": {"games": 1092, "markets": 87803, "with_price": 85605, "first": "2025-11-18", "last": "2026-06-13", "by_type": {"2": 73110, "3": 13762, "5": 931}}}

Funnel: {"collected": 91444, "settled_yes_no": 87803, "nba_game_types_modeled_stat": 87803, "after_dedup": 87803, "player_unmatched": 8, "model_chance_exists": 87795, "main_set": 21495}

## Test 1 (primary): KALSHI MORE RIGHT
Main set 21495 rows / 957 games. Model log loss 0.56273, Kalshi mid 0.54461, difference 0.01812 (95% CI [0.01388, 0.02242]). Negative = model more right.

By season: {"2026": {"rows": 21495, "games": 957, "yes_rate": 0.3992, "model_logloss": 0.56273, "kalshi_logloss": 0.54461, "diff_model_minus_kalshi": 0.01812, "diff_95ci": [0.01388, 0.02242]}}

By stat: {"points": {"rows": 9175, "games": 902, "yes_rate": 0.3831, "model_logloss": 0.54693, "kalshi_logloss": 0.52656, "diff_model_minus_kalshi": 0.02037, "diff_95ci": [0.01458, 0.02651]}, "rebounds": {"rows": 4769, "games": 791, "yes_rate": 0.4456, "model_logloss": 0.59781, "kalshi_logloss": 0.57899, "diff_model_minus_kalshi": 0.01881, "diff_95ci": [0.01062, 0.02693]}, "assists": {"rows": 3601, "games": 748, "yes_rate": 0.4235, "model_logloss": 0.58449, "kalshi_logloss": 0.56743, "diff_model_minus_kalshi": 0.01706, "diff_95ci": [0.00726, 0.02693]}, "threes": {"rows": 3950, "games": 640, "yes_rate": 0.3582, "model_logloss": 0.53721, "kalshi_logloss": 0.5242, "diff_model_minus_kalshi": 0.01301, "diff_95ci": [0.00432, 0.02149]}, "pts_reb_ast": {"rows": 0, "games": 0}, "pts_reb": {"rows": 0, "games": 0}, "pts_ast": {"rows": 0, "games": 0}, "reb_ast": {"rows": 0, "games": 0}}

## Test 2: NOT SHOWN PROFITABLE
All picks: {"count": 6046, "games": 872, "win_rate": 0.4616, "avg_cost": 0.4706, "avg_ev": 0.107, "profit_sum": -54.051, "cost_sum": 2845.051, "roi": -0.019, "roi_95ci": [-0.0453, 0.0075]}

By side: {"OVER": {"count": 1805, "games": 616, "win_rate": 0.3396, "avg_cost": 0.3462, "avg_ev": 0.102, "profit_sum": -11.842, "cost_sum": 624.842, "roi": -0.019, "roi_95ci": [-0.0789, 0.0441]}, "UNDER": {"count": 4241, "games": 841, "win_rate": 0.5136, "avg_cost": 0.5235, "avg_ev": 0.1091, "profit_sum": -42.209, "cost_sum": 2220.209, "roi": -0.019, "roi_95ci": [-0.048, 0.0099]}}

By stat: {"points": {"count": 2454, "games": 777, "win_rate": 0.4568, "avg_cost": 0.4694, "avg_ev": 0.107, "profit_sum": -30.837, "cost_sum": 1151.837, "roi": -0.0268, "roi_95ci": [-0.0642, 0.0111]}, "rebounds": {"count": 1388, "games": 633, "win_rate": 0.4272, "avg_cost": 0.453, "avg_ev": 0.1073, "profit_sum": -35.795, "cost_sum": 628.795, "roi": -0.0569, "roi_95ci": [-0.1111, -0.0029]}, "assists": {"count": 1135, "games": 580, "win_rate": 0.4846, "avg_cost": 0.4766, "avg_ev": 0.1057, "profit_sum": 9.087, "cost_sum": 540.913, "roi": 0.0168, "roi_95ci": [-0.0405, 0.0745]}, "threes": {"count": 1069, "games": 497, "win_rate": 0.493, "avg_cost": 0.4897, "avg_ev": 0.1077, "profit_sum": 3.495, "cost_sum": 523.505, "roi": 0.0067, "roi_95ci": [-0.0507, 0.0644]}, "pts_reb_ast": {"count": 0}, "pts_reb": {"count": 0}, "pts_ast": {"count": 0}, "reb_ast": {"count": 0}}

By season: {"2026": {"count": 6046, "games": 872, "win_rate": 0.4616, "avg_cost": 0.4706, "avg_ev": 0.107, "profit_sum": -54.051, "cost_sum": 2845.051, "roi": -0.019, "roi_95ci": [-0.0453, 0.0075]}}

## Information only
{"test1_no_gap_filter": {"rows": 25137, "games": 965, "yes_rate": 0.4156, "model_logloss": 0.59958, "kalshi_logloss": 0.55823, "diff_model_minus_kalshi": 0.04135, "diff_95ci": [0.03438, 0.04853]}, "test1_other_stats": {"rows": 1125, "games": 268, "yes_rate": 0.3804, "model_logloss": 0.60893, "kalshi_logloss": 0.58881, "diff_model_minus_kalshi": 0.02012, "diff_95ci": [0.00387, 0.03602]}, "live_pass_bar_met": false}

No injury filter (no historical injury reports). This is a back-test on past prices; it cannot replace the live paper test.
