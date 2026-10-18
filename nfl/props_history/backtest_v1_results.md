# NFL_PROPS_KALSHI_BACKTEST_V1 results

Prereg sha256 `c805828e904031fead5b73c50fd3ce62a6fdec707f56fac1ee2453ac15db2306` · seasons [2026] · refit reproduces frozen 2026 tables: True

Funnel: {"collected": 29219, "settled_yes_no_modeled_stat": 28767, "player_unmatched": 207, "model_chance_exists": 27054, "main_set": 11233}

## Test 1 (primary): KALSHI MORE RIGHT
Main set 11233 rows / 80 games. Model log loss 0.56739, Kalshi mid 0.53627, difference 0.03112 (95% CI [0.01856, 0.04434]). Negative = model more right.

## Test 2: NOT SHOWN PROFITABLE
MEDIUM + HIGH: {"count": 1598, "games": 80, "win_rate": 0.3974, "avg_needs_pct": 40.91, "profit_sum": -18.677, "cost_sum": 653.677, "roi": -0.0286, "roi_95ci": [-0.0973, 0.0402]}
HIGH: {"count": 936, "games": 80, "win_rate": 0.4188, "avg_needs_pct": 42.98, "profit_sum": -10.328, "cost_sum": 402.328, "roi": -0.0257, "roi_95ci": [-0.1029, 0.0527]}
MEDIUM: {"count": 662, "games": 80, "win_rate": 0.3671, "avg_needs_pct": 37.97, "profit_sum": -8.348, "cost_sum": 251.348, "roi": -0.0332, "roi_95ci": [-0.1477, 0.0786]}
LEAN: {"count": 482, "games": 79, "win_rate": 0.3672, "avg_needs_pct": 37.9, "profit_sum": -5.669, "cost_sum": 182.669, "roi": -0.031, "roi_95ci": [-0.1377, 0.0779]}

This is a back-test on past prices; it cannot replace the live paper test.
