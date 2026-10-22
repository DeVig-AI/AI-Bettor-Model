# NHL_PROPS_KALSHI_BACKTEST_V1 results

Prereg sha256 `3184b20376784d2e8bf417b6167c400f08ce50ebf73b845d24b94244af6acf67` · model {"span_short": 40, "span_long": 160, "shrink_k": 3.0, "method": "poisson", "min_prev": 5, "fit_seasons": [2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]} · seasons [2025, 2026] (tables {'2025': '2010-2024', '2026': '2010-2025'})

Kalshi NHL prop history found: 1133 games. Coverage: {"2025": {"games": 988, "markets": 107753, "with_price": 98171, "first": "2025-11-21", "last": "2026-06-14", "by_stat": {"points": 41199, "assists": 29369, "goals": 37185}, "by_type": {"2": 97170, "3": 10583}}, "2026": {"games": 145, "markets": 18287, "with_price": 17841, "first": "2026-09-29", "last": "2026-10-20", "by_stat": {"goals": 7746, "points": 5914, "assists": 4627}, "by_type": {"2": 18287}}}

Collection: {"events_done_total": 3365, "no_game": 3, "not_nhl_game_type": 0, "after_cutoff": 24, "no_markets": 0, "no_candle": 0, "complete": true} · Funnel: {"collected": 128341, "settled_yes_no": 126040, "nhl_game_types_prop_stat": 126040, "after_dedup": 126040, "player_unmatched": 1063, "model_chance_exists": 124583, "main_set": 7658}

## Test 1 (primary): KALSHI MORE RIGHT
Main set 7658 rows / 541 games. Model log loss 0.51862, Kalshi mid 0.50884, difference 0.00978 (95% CI [0.00572, 0.01397]). Negative = model more right.

By season: {"2025": {"rows": 4018, "games": 407, "yes_rate": 0.2566, "model_logloss": 0.51076, "kalshi_logloss": 0.50619, "diff_model_minus_kalshi": 0.00457, "diff_95ci": [-0.00066, 0.00985]}, "2026": {"rows": 3640, "games": 134, "yes_rate": 0.2802, "model_logloss": 0.52729, "kalshi_logloss": 0.51176, "diff_model_minus_kalshi": 0.01553, "diff_95ci": [0.00978, 0.0217]}}

By stat: {"goals": {"rows": 4743, "games": 522, "yes_rate": 0.1935, "model_logloss": 0.46266, "kalshi_logloss": 0.45351, "diff_model_minus_kalshi": 0.00915, "diff_95ci": [0.00445, 0.01376]}, "assists": {"rows": 872, "games": 239, "yes_rate": 0.3601, "model_logloss": 0.61569, "kalshi_logloss": 0.60001, "diff_model_minus_kalshi": 0.01568, "diff_95ci": [0.00256, 0.02974]}, "points": {"rows": 2043, "games": 295, "yes_rate": 0.4009, "model_logloss": 0.60711, "kalshi_logloss": 0.59838, "diff_model_minus_kalshi": 0.00873, "diff_95ci": [0.00222, 0.01561]}}

By line: {"0.5": {"rows": 6338, "games": 534, "yes_rate": 0.2879, "model_logloss": 0.53795, "kalshi_logloss": 0.5277, "diff_model_minus_kalshi": 0.01025, "diff_95ci": [0.0062, 0.01436]}, "1.5": {"rows": 1158, "games": 215, "yes_rate": 0.1779, "model_logloss": 0.43614, "kalshi_logloss": 0.4296, "diff_model_minus_kalshi": 0.00654, "diff_95ci": [-0.00243, 0.01566]}, "2.5": {"rows": 162, "games": 95, "yes_rate": 0.1235, "model_logloss": 0.3517, "kalshi_logloss": 0.33722, "diff_model_minus_kalshi": 0.01448, "diff_95ci": [-0.01433, 0.04656]}}

## Test 2: NOT SHOWN PROFITABLE
All picks: {"count": 1468, "games": 316, "win_rate": 0.376, "avg_cost": 0.4001, "avg_ev": 0.0787, "profit_sum": -35.402, "cost_sum": 587.402, "roi": -0.0603, "roi_95ci": [-0.1195, 0.0007]}

By side: {"OVER": {"count": 1021, "games": 279, "win_rate": 0.2586, "avg_cost": 0.2784, "avg_ev": 0.0785, "profit_sum": -20.205, "cost_sum": 284.205, "roi": -0.0711, "roi_95ci": [-0.172, 0.0329]}, "UNDER": {"count": 447, "games": 185, "win_rate": 0.6443, "avg_cost": 0.6783, "avg_ev": 0.0793, "profit_sum": -15.197, "cost_sum": 303.197, "roi": -0.0501, "roi_95ci": [-0.1189, 0.0164]}}

By stat: {"goals": {"count": 953, "games": 305, "win_rate": 0.3347, "avg_cost": 0.3464, "avg_ev": 0.0789, "profit_sum": -11.094, "cost_sum": 330.094, "roi": -0.0336, "roi_95ci": [-0.1095, 0.0422]}, "assists": {"count": 188, "games": 133, "win_rate": 0.4628, "avg_cost": 0.5138, "avg_ev": 0.0825, "profit_sum": -9.604, "cost_sum": 96.604, "roi": -0.0994, "roi_95ci": [-0.2343, 0.0345]}, "points": {"count": 327, "games": 166, "win_rate": 0.4465, "avg_cost": 0.4915, "avg_ev": 0.076, "profit_sum": -14.705, "cost_sum": 160.705, "roi": -0.0915, "roi_95ci": [-0.1939, 0.0136]}}

By season: {"2025": {"count": 708, "games": 185, "win_rate": 0.322, "avg_cost": 0.3234, "avg_ev": 0.0781, "profit_sum": -0.989, "cost_sum": 228.989, "roi": -0.0043, "roi_95ci": [-0.1176, 0.112]}, "2026": {"count": 760, "games": 131, "win_rate": 0.4263, "avg_cost": 0.4716, "avg_ev": 0.0793, "profit_sum": -34.413, "cost_sum": 358.413, "roi": -0.096, "roi_95ci": [-0.1594, -0.0336]}}

## Information only
{"test1_no_gap_filter": {"rows": 7669, "games": 541, "yes_rate": 0.268, "model_logloss": 0.51913, "kalshi_logloss": 0.50914, "diff_model_minus_kalshi": 0.00999, "diff_95ci": [0.00586, 0.01426]}, "live_pass_bar_met": false}

No injury filter (no historical injury reports). This is a back-test on past prices; it cannot replace the live paper test.
