# NBA_PROPS_MODEL_V1_LIVE — pre-registration

Written 2026-10-18, before the 2026-27 NBA season and before any NBA prop price was seen. This file's SHA-256 is
computed by `nba/nba_props_model_v1_live.py` on every run and stored with every paper pick. If this file changes, the
test is void; any change becomes v2 with a new pre-registration. Paper only: nothing is bet, no account is used.

## Question
Does the frozen NBA player-prop model beat Kalshi's own prices on NBA player props, after Kalshi's fee?

## What is frozen
- Code: `nba/nba_props_model_lib_v1.py`, `nba/nba_props_model_v1_live.py` (as committed with this file).
- Tables: `nba/nba_props_model_v1_tables.json`, sha256 `e56b2cd90cd7e188527eb34700a7a65c5644d387804bcbf8737ee7cb9c5d7d93`,
  fit on ESPN player box scores, seasons 2009-10 through 2025-26 (regular season, play-in, playoffs).
  Parameters: SPAN_SHORT 5, SPAN_LONG 20, SHRINK_K 3, N_BUCKETS 10, min_prev 5, 1,001 stored quantiles per bucket.
- Model: a player's expected stat = weighted average of his previous played games (recent games count more);
  P(stat > line) = share of historical (actual / expected) ratios, in the same expected-value bucket, that clear the line.
  No prices, injuries, lineups, minutes news or future data are inputs.

## Prices
Kalshi public market data from `nba/props_exchanges_export.json` (`nba/nba_props_exchanges_v1.py`). A market "N+ <stat>"
(floor_strike N−0.5) is an Over N−0.5. Over is bought at the yes ask; Under at the no ask = 1 − yes bid.

## Fee
Estimated Kalshi taker fee per contract = 0.07 × P × (1 − P), P = price paid.

## Lock (one time per game)
The first scheduled run between 6 h and 30 min before tip-off locks the game. At lock:
1. Every scored row (model chance exists, Kalshi bid and ask exist) is written to `locked_rows`.
2. A row can become a paper pick only if ALL hold:
   - stat is points, rebounds, assists, threes, pts+reb+ast, pts+reb, pts+ast or reb+ast
     (steals, blocks, steals+blocks and turnovers are never picked);
   - the player has ≥ 40 prior played games in the box scores loaded at run time (current and two prior seasons);
   - his last played game is no more than 30 days old;
   - Kalshi open interest ≥ 100 contracts;
   - |model chance − Kalshi mid| ≤ 0.20;
   - he is not listed on ESPN's NBA injury report as Out, Doubtful or suspended at lock time;
   - expected value per $1 contract after the fee ≥ 0.05 (Over: p − ask − fee(ask); Under: (1 − p) − (1 − bid) − fee(1 − bid)).
3. At most one pick per player per stat: the line and side with the highest EV.
Games not locked in the window are skipped, never locked late. Locked rows and picks are append-only.

Why these filters (from the 2012-13 to 2025-26 walk-forward, done before this file, not from live results):
with fewer than 40 prior games the model ran 3–5 points too high; steals, blocks and turnovers were no better than a
simple player hit rate; large gaps from the market usually mean news the model cannot see.

## Grading
Each locked market is graded by Kalshi's own settlement ("yes" / "no"), read from the public API at least 4 hours after
tip-off. Markets that settle any other way (void, fair-value settlement) are excluded. Each pick = 1 contract:
win pays 1 − price − fee, loss costs price + fee.

## Evaluation (one time)
At 500 graded picks or after the last 2026-27 regular-season game, whichever is first.
- Fewer than 150 graded picks at that point → INCONCLUSIVE.
- PASS needs BOTH:
  (a) ROI 95% bootstrap lower bound > 0, resampling games, 10,000 draws, seed 20261018;
  (b) model log loss < Kalshi mid log loss on locked rows with open interest ≥ 100, ask − bid ≤ 0.10, ≥ 40 prior
      games, stat in the pick list (chances clipped to [0.01, 0.99]).
- Otherwise FAIL.
Also reported: Over and Under separately, by stat, calibration, locks missed.

## Known limits
- No minutes, lineup, rest or teammate-injury information; NBA prices move on that news and the model cannot.
- Early in the season the current year's box scores may be missing or late; expectations then lean on last season.
- One season of evidence is not proof of long-run profit.
