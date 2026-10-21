# NHL_PROPS_MODEL_V1_LIVE — pre-registration

Written 2026-10-21, before any Kalshi NHL prop price was collected or seen (the only earlier contact with Kalshi's NHL
markets was a coverage probe that recorded market counts and wording, never a price: `odds_probe/nhl_wnba_probe_v1.md`).
This file's SHA-256 is computed by `nhl/nhl_props_model_v1_live.py` on every run and stored with every paper pick, and
the file is locked in `FROZEN.sha256`. If it changes, the test is void; any change becomes v2. Paper only: nothing is
bet, no account is used.

## Question
Does the frozen NHL player-prop model beat Kalshi's own prices on NHL goals, assists and points props, after Kalshi's fee?

## What is frozen
- Code: `nhl/nhl_props_model_lib_v1.py`, `nhl/nhl_props_model_v1_live.py`, `nhl/nhl_kalshi_common_v1.py`,
  `nhl/nhl_props_exchanges_v1.py` (as committed with this file).
- Model file: `nhl/nhl_props_model_v1_tables.json`, sha256 `070c52e001557187205eddda9c7185d8c434de983d6127a043fa12d6f4aa6b56`, written by `nhl/nhl_props_fit_v1.py` from the
  NHL's public box scores of 2010-11 to 2025-26 (regular season and playoffs, skaters only).
- Settings, chosen by the box-score-only design study `nhl/design/design_v1.md` (walk-forward 2016-17 to 2024-25; no
  price read): look-back spans 40 / 160 games (short / long exponentially weighted averages), shrink K = 3, Poisson method.
- Model: a skater's expected goals / assists / points = recent-weighted average of his previous played games, shrunk
  toward his longer-run average when he has few games; P(stat ≥ N) for an "N+" line = P(X ≥ N) with X ~ Poisson(expected value) (no fitted tables).
  No prices, injuries, lineups, ice-time news or future data are inputs.

## Prices
Kalshi public market data, series KXNHLGOAL (goals), KXNHLAST (assists), KXNHLPTS (points), from
`nhl/props_exchanges_export.json` (`nhl/nhl_props_exchanges_v1.py`). A market "Name: N+ goals" is an Over N−0.5.
Over is bought at the yes ask; Under at the no ask = 1 − yes bid.

## Fee
Estimated Kalshi taker fee per contract = 0.07 × P × (1 − P), P = price paid.

## Lock (one time per game)
The first scheduled run between 6 h and 30 min before puck drop (NHL API schedule time) locks the game. At lock:
1. Every scored row (model chance exists, Kalshi bid and ask exist) is written to `locked_rows`.
2. A row can become a paper pick only if ALL hold:
   - the player has ≥ 40 earlier played games (NHL box scores since 2010-11);
   - his last played game is no more than 30 days old;
   - Kalshi open interest ≥ 100 contracts; 0 < bid < ask < 1; ask − bid ≤ 0.10;
   - |model chance − Kalshi mid| ≤ 0.20;
   - he is not listed on ESPN's NHL injury report as Out, Day-To-Day, injured reserve (IR / LTIR) or suspended;
   - expected value per $1 contract after the fee ≥ 0.05 (Over: p − ask − fee(ask); Under: (1 − p) − (1 − bid) − fee(1 − bid)).
3. At most one pick per player per stat: the line and side with the highest EV.
Games not locked in the window are skipped, never locked late. Locked rows and picks are append-only.

## Grading
Each locked market is graded by Kalshi's own settlement ("yes" / "no"), read from the public API at least 4 hours after
puck drop. Markets that settle any other way are excluded. Each pick = 1 contract: a win pays 1 − price − fee, a loss
costs price + fee.

## Evaluation (one time)
At 500 graded picks or after the last 2026-27 regular-season game, whichever is first.
- Fewer than 150 graded picks at that point → INCONCLUSIVE.
- PASS needs BOTH:
  (a) ROI 95% bootstrap lower bound > 0, resampling games, 10,000 draws, seed 20261021;
  (b) model log loss < Kalshi mid log loss on locked rows that pass the pick filters other than the EV and injury
      rules (chances clipped to [0.01, 0.99]).
- Otherwise FAIL.
Also reported: Over and Under separately, by stat, by line, calibration, locks missed.

## Known limits
- No line combinations, power-play units, ice time or goalie information; prices move on that news and the model cannot.
- Goals are rare and noisy; one season of picks is not proof of long-run profit.
- The back-test NHL_PROPS_KALSHI_BACKTEST_V1 (separate prereg) uses the same model on past prices; it does not change
  or replace this test.
