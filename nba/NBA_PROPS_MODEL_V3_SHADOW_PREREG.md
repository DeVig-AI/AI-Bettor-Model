# NBA_PROPS_MODEL_V3_SHADOW — pre-registration

Written 2026-10-22, before v3 has locked any live row. Its SHA-256 is stored with every run and locked in
`FROZEN.sha256`. Any change voids it. Paper only, and v3 makes **no picks**.

## Why
NBA_PROPS_KALSHI_BACKTEST_V3's fixed decision: v3 was more right than v2 (log loss −0.0033, 95% interval −0.0050 to
−0.0018) on reused 2025-26 prices, so v3 runs as a shadow next to v2's live test. The reused prices make that weaker
evidence; this shadow is the clean test.

## What runs
- `nba/nba_props_model_v3_shadow.py`, after `nba_props_model_v2_live.py` in the same bot run, with the frozen model
  `nba/nba_props_model_v3_T2027.json.gz` (trained 2021–2026, spread fit on 2026; sha256 in `FROZEN.sha256`) and inputs
  from `nba/nba_props_live_features_v3.py`. Those match training on past dates exactly except "teammates back":
  training counted a returning teammate only if he played, live counts him if he is available (not Out / Doubtful /
  suspended, on the roster). Players a team holds out without listing them make live higher than training would.
- Lock: the first run between 6 hours and 30 minutes before tip-off (v2's rule); every Kalshi row of the four stats
  with a bid and ask and a v3 chance is written to `nba/NBA_PROPS_MODEL_V3_SHADOW_LOG.sqlite3` (append-only).

## Evaluation (one time, when v2's live test is evaluated)
Rows: v3 shadow rows joined by ticker to v2's locked rows of the same games, with v2's filters (open interest ≥ 100,
0 < bid < ask < 1, ask − bid ≤ 0.10, ≥ 40 prior games), graded by Kalshi's settlement as recorded in
`nba/NBA_PROPS_MODEL_V2_LOG.sqlite3`. Chances clipped to [0.01, 0.99].
- v3 vs v2 log loss, 95% game bootstrap (10,000 draws, seed 20261025). V3 MORE RIGHT if the whole interval is below 0.
- Also reported: v3 vs Kalshi mid; v3 + Kalshi blend with the back-test's a, b, c (−0.0412, 0.7737, 0.2177) vs Kalshi.
- A v3 live test with picks needs V3 MORE RIGHT here and a new prereg.
