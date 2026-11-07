# NBA_PROPS_MODEL_V3_LIVE — pre-registration

Written 2026-11-06, before v3 has made any live pick. This file's SHA-256 is computed by
`nba/nba_props_model_v3_live.py` on every run and stored with every paper pick; it is also locked in `FROZEN.sha256`.
If this file changes, the test is void; any change becomes v4 with a new pre-registration. Paper only: nothing is
bet, no account is used.

## Why v3, and why now
**Owner's decision (2026-11-06):** each sport's newest model becomes the app's model, labelled not proven, without
waiting for a paper trial ("all of the models are unproven"). This **skips** the rule in
`NBA_PROPS_MODEL_V3_SHADOW_PREREG.md` that a v3 live test with picks waits for the shadow to show v3 more right than
v2. That rule is not met and is not claimed to be met. The evidence for v3 is only NBA_PROPS_KALSHI_BACKTEST_V3:
v3 more right than v2 on reused 2025-26 prices (log loss −0.0033, 95% interval −0.0050 to −0.0018), with Kalshi's
price more right than both. **No NBA prop model has beaten Kalshi's prices.**

Nothing existing changes: NBA_PROPS_MODEL_V2_LIVE and NBA_PROPS_MODEL_V3_SHADOW keep running exactly as
pre-registered, with their own logs and evaluations.

## What is frozen
- Code: `nba/nba_props_model_v3_live.py` as committed with this file. It calls the frozen v2 live test's functions
  (`nba/nba_props_model_v2_live.py`: prices, box scores, rosters, injury report, name matching, scoring loop, lock
  filters, fee, grading) unchanged, with v3's model and inputs in place of v2's.
- Model and inputs: as in NBA_PROPS_MODEL_V3_SHADOW — `nba/nba_props_model_v3_T2027.json.gz` and
  `nba/nba_props_live_features_v3.py` (same known difference from training: "teammates back").

## Lock, picks, grading
Exactly v2's rules (NBA_PROPS_MODEL_V2_LIVE_PREREG.md, "Prices and fee", "Lock", "Grading"), with "v2 chance" read
as "v3 chance". Information-only blend stored with each row: sigmoid(−0.0412 + 0.7737·logit(mid) + 0.2177·logit(v3)).
Log: `nba/NBA_PROPS_MODEL_V3_LOG.sqlite3` (append-only, v2's tables). The app's props export
(`nba/props_model_export.json`) is written by this script after v2's run, so the app shows v3.

## Evaluation (one time)
At 500 graded picks or after the last 2026-27 regular-season game, whichever is first.
- Fewer than 150 graded picks → INCONCLUSIVE.
- PASS needs BOTH: (a) ROI 95% bootstrap lower bound > 0 (resampling games, 10,000 draws, seed 20261106) and
  (b) v3 log loss < Kalshi mid log loss on locked rows with open interest ≥ 100, ask − bid ≤ 0.10, ≥ 40 prior
  games, the four stats (chances clipped to [0.01, 0.99]). Otherwise FAIL.
- Also reported: the blend vs Kalshi on the same rows, Over / Under, by stat, calibration, locks missed.

## Known limits
v2's (injury report read up to 2 hours before the lock; ESPN's box score file can lag; one season is not proof),
plus: v3 went live on the owner's decision before its shadow test finished.
