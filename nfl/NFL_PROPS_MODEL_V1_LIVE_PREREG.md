# NFL_PROPS_MODEL_V1_LIVE — pre-registration

Written 2026-10-18, before any live lock. This file's SHA-256 is computed by `nfl/nfl_props_model_v1_live.py`
on every run and stored with every paper pick. If this file changes, the test is void; any change becomes a new
version (v2) with a new pre-registration. Paper only: nothing is bet, no account is used.

## Question
Does the frozen NFL player-prop model beat Kalshi's own prices on NFL player props, after Kalshi's fee?

## What is frozen
- Code: `nfl/nfl_props_model_lib_v1.py`, `nfl/nfl_props_model_v1_live.py` (as committed with this file).
- Tables: `nfl/nfl_props_model_v1_tables.json`, sha256 `d566c111331235218182c708c7e353a4c0983e65e7ba10fd7b48aaaa3e3a1743`,
  fit on 2016–2025 nflverse play-by-play only. Parameters: SPAN_SHORT 5, SPAN_LONG 16, SHRINK_K 2, N_BUCKETS 10, min_prev 3.
- Model: a player's expected stat = weighted average of his previous games in that role (recent games count more);
  P(stat > line) = share of historical (actual / expected) ratios, in the same expected-value bucket, that clear the line.
  No prices, injuries, weather or future data are inputs.

## Prices
Kalshi public market data from `nfl/props_exchanges_export.json` (`nfl/nfl_props_exchanges_v1.py`). A Kalshi
market "N+ <stat>" with floor_strike N−0.5 is an Over N−0.5. Over is bought at the yes ask; Under is bought at
the no ask = 1 − yes bid. Polymarket quotes are shown in the app but are NOT used for picks or grading (too thin).

## Fee
Estimated Kalshi taker fee per contract = 0.07 × P × (1 − P), P = price paid. (Kalshi rounds fees up to the cent per
order; this estimate matches larger orders and slightly flatters 1-contract orders.)

## Lock (one time per game)
The first scheduled run between 6 h and 40 min before kickoff locks the game. At lock:
1. Every scored row (model chance exists, Kalshi bid and ask exist) is written to `locked_rows`.
2. A row can become a paper pick only if ALL hold:
   - stat is one of passing_yards, passing_tds, passing_attempts, passing_completions, interceptions,
     rushing_yards, rushing_attempts, receiving_yards, receptions, rush_rec_yards (touchdowns and fantasy points never);
   - the player has ≥ 21 prior games in that role in the 2023–2026 play-by-play loaded at run time;
   - Kalshi open interest ≥ 100 contracts;
   - |model chance − Kalshi mid| ≤ 0.20;
   - the player is not listed in `nfl/injury_report.json` as Out, Doubtful, IR, PUP, suspended, reserve or NFI
     (if that file is missing, no injury filter is applied);
   - expected value per $1 contract after the fee ≥ 0.05:
     Over EV = p − ask − fee(ask); Under EV = (1 − p) − (1 − bid) − fee(1 − bid).
3. At most one pick per player per stat: the line and side with the highest EV.
Games not locked in the window (missing kickoff time, no run in the window, no Kalshi prices) are skipped, never
locked late. Locked rows and picks are append-only (SQLite triggers block updates and deletes).

Why these filters (decided from 2016–2025 walk-forward data before this file, not from live results): with ≤ 20
prior games the model's chances ran about 3–5 points too high; touchdowns were no better than a simple player hit rate;
large gaps from the market usually mean news the model cannot see.

## Grading
At least 12 h after kickoff, once the game is in nflverse play-by-play: the player's stat in that game from
play-by-play (same definitions as training: passing attempts exclude sacks, two-point plays excluded). Over wins if
actual > line. A player with no recorded involvement is graded 0 (Kalshi "No"). Each pick = 1 contract:
win pays 1 − price − fee, loss costs price + fee.

## Evaluation (one time, no peeking decisions)
Evaluated once, at 300 graded picks or after the last 2026 regular-season game, whichever is first.
- Fewer than 100 graded picks at season end → INCONCLUSIVE (no claim either way).
- PASS needs BOTH:
  (a) ROI (profit ÷ cost) 95% bootstrap lower bound > 0, resampling games with replacement, 10,000 draws, seed 20261018;
  (b) model log loss < Kalshi mid log loss on locked rows with open interest ≥ 100, ask − bid ≤ 0.10, ≥ 21 prior games,
      stat in the pick list (mid = (bid + ask) / 2; chances clipped to [0.01, 0.99]).
- Otherwise FAIL.
Also reported, not used for PASS/FAIL: Over and Under ROI separately; ROI excluding players with no involvement;
calibration of model chances; number of locks missed.

## Known limits (stated before results)
- Training rows only include games where a player touched the ball or was targeted, so chances for low-usage
  players lean too high (favours Overs).
- Play-by-play totals can differ slightly from official box scores Kalshi settles on.
- The model does not know about injuries to teammates, depth-chart changes, weather or game script.
- A PASS would be one season of evidence, not proof of long-run profit.
