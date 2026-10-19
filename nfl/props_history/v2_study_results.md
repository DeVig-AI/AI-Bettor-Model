# NFL_PROPS_V2_STUDY results

Prereg sha256 `2f110f3bed7e7ff263020f011eb5ef4679089f66c67bbb9258da42f6e68d4760` · learning games before 2026-09-24, test games from 2026-09-24

Rows: {"main_set": 11233, "learning": 4486, "test": 6747, "learning_games": 32, "test_games": 48}

v2 = sigmoid(0.007 + 0.875·logit(Kalshi mid) + 0.045·logit(v1 model)); threshold T = 0.02

## Test A (primary): TOO CLOSE TO CALL
v2 log loss 0.53535 vs Kalshi 0.53668, difference -0.00133 (95% CI [-0.00345, 0.0007]). Negative = v2 more right.

## Test B: V2 MORE RIGHT
v2 log loss 0.53535 vs v1 0.56441, difference -0.02906 (95% CI [-0.04514, -0.01386]).

## Test C: picks on the test games
v2: {"count": 2, "games": 1, "win_rate": 0.0, "avg_needs_pct": 26.28, "profit_sum": -0.526, "cost_sum": 0.526, "roi": -1.0, "roi_95ci": [-1.0, -1.0], "avg_chance_given_pct": 28.71}
v1 MEDIUM + HIGH: {"count": 950, "games": 48, "win_rate": 0.3968, "avg_needs_pct": 39.53, "profit_sum": 1.475, "cost_sum": 375.525, "roi": 0.0039, "roi_95ci": [-0.0922, 0.1015], "avg_chance_given_pct": 50.82}

## Decision: KEEP V1

This is a back-test on past prices; it cannot replace a live paper test.
