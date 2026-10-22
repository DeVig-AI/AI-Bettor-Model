# NBA_PROPS_MODEL_V2_LIVE — pre-registration

Written 2026-10-22, before NBA_PROPS_MODEL_V2 has made any live pick. This file's SHA-256 is computed by
`nba/nba_props_model_v2_live.py` on every run and stored with every paper pick; it is also locked in `FROZEN.sha256`.
If this file changes, the test is void; any change becomes v3 with a new pre-registration. Paper only: nothing is
bet, no account is used.

## Why v2
NBA_PROPS_KALSHI_BACKTEST_V2 (`nba/props_history/backtest_v2_results.md`), whose decision rule was fixed before it
ran, found v2 more right than v1 by 0.031 log loss on 25,131 past Kalshi props, so v2 replaces v1. It also found
Kalshi's price still more right than v2 (by 0.0075), v2's picks not shown profitable (ROI −1.3%, interval −4.6% to
+2.1%), and a v2 + Kalshi blend slightly more right than Kalshi but with too few picks to judge. So: **no NBA prop
model has beaten Kalshi's prices**, and the app must say so. This live test checks v2 on games it has never seen.
NBA_PROPS_MODEL_V1_LIVE is closed on the day this file is committed; its log is kept unchanged (0 picks: its 30-day
stale rule blocked every player since opening night).

## What is frozen
- Code: `nba/nba_props_model_lib_v2.py`, `nba/nba_props_live_features_v2.py`, `nba/nba_props_fit_v2.py`,
  `nba/nba_props_design_v2.py` (constants), `nba/nba_props_model_v2_live.py`, as committed with this file.
- Model: `nba/nba_props_model_v2_T2027.json.gz` (sha256 in `FROZEN.sha256`), made by
  `nba_props_fit_v2.py --target 2027`: LightGBM Poisson means for points, rebounds, assists, threes trained on ESPN
  seasons 2021–2026; spread tables fit out of sample on 2026 (means from a model trained on 2021–2025). Not refit
  during the season.
- Inputs (the same as in training, checked to match exactly on past dates by `check_parity`): the player's recent
  minutes, starts, per-minute rates, usage, games missed, days since he last played; team rest and back-to-back;
  home/away; team and opponent pace and what the opponent allows; teammates out tonight and the minutes, usage,
  assists, rebounds and points they leave. Built from ESPN box scores of seasons 2020–2027 (the current season's
  file as published), ESPN's team rosters and ESPN's NBA injury report at run time.
- Teammates out tonight = players who played for the team in its last 10 games, whose latest team it still is, and
  who are listed Out, Doubtful or suspended on the injury report or are no longer on the team's ESPN roster.
  (Known difference from training: on nights when a departed player has already played for a new team earlier the
  same night, training did not count him; live does. It only affects a team's first games after the offseason.)

## Prices and fee
Kalshi public market data from `nba/props_exchanges_export.json` (`nba/nba_props_exchanges_v1.py`). "N+ <stat>" =
Over N − 0.5. Over is bought at the yes ask, Under at 1 − yes bid. Fee per contract = 0.07 × P × (1 − P).

## Lock (one time per game)
The first scheduled run between 6 h and 30 min before tip-off locks the game. At lock:
1. Every scored row (v2 chance exists, Kalshi bid and ask exist) is written to `locked_rows`.
2. A row becomes a paper pick only if ALL hold:
   - stat is points, rebounds, assists or threes;
   - the player has ≥ 40 prior played games in the loaded box scores;
   - he is not Out, Doubtful or suspended on the injury report (players listed Questionable are scored as playing);
   - Kalshi open interest ≥ 100; 0 < bid < ask < 1; ask − bid ≤ 0.10;
   - |v2 chance − Kalshi mid| ≤ 0.20;
   - EV per $1 contract after the fee ≥ 0.05 (Over: p − ask − fee(ask); Under: (1 − p) − (1 − bid) − fee(1 − bid)).
   There is no stale-days rule: days since the last game is a model input.
3. At most one pick per player per stat: the line and side with the highest EV.
Games not locked in the window are skipped, never locked late. Locked rows and picks are append-only.
Also stored with each locked row (information only, never used to pick): the blend chance
sigmoid(−0.0382 + 0.8473·logit(mid) + 0.1391·logit(v2)) from the back-test's learning games.

## Grading
By Kalshi's own settlement ("yes" / "no"), read from the public API at least 4 hours after tip-off. Other settlements
(void, fair value) are excluded. Each pick = 1 contract: a win pays 1 − price − fee, a loss costs price + fee.

## Evaluation (one time)
At 500 graded picks or after the last 2026-27 regular-season game, whichever is first.
- Fewer than 150 graded picks → INCONCLUSIVE.
- PASS needs BOTH: (a) ROI 95% bootstrap lower bound > 0 (resampling games, 10,000 draws, seed 20261022) and
  (b) v2 log loss < Kalshi mid log loss on locked rows with open interest ≥ 100, ask − bid ≤ 0.10, ≥ 40 prior
  games, the four stats (chances clipped to [0.01, 0.99]). Otherwise FAIL.
- Also reported: the blend's log loss vs Kalshi on the same rows, Over / Under, by stat, calibration, locks missed.

## Known limits
- The injury report and rosters are read at run time, up to 2 hours before the lock; later news is missed.
- ESPN's current-season box score file can lag; inputs then lean on older games (days since last game says so).
- One season of evidence is not proof of long-run profit.
