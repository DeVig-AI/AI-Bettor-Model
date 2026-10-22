# NBA_PROPS_TIMING_V1 — pre-registration

Written 2026-10-22, before any earlier-than-40-minute Kalshi price has been collected or seen. Its SHA-256 is locked in
`FROZEN.sha256` and recorded in the results. Any change after hashing voids it; a change becomes v2.

## Question
Every NBA prop back-test so far compared the model with Kalshi's price 40 minutes before tip-off, when the market has
absorbed injury news, lineups and sharp money. The live paper tests lock earlier: at the first bot run inside the
6-hour window, usually 4–6 hours before tip-off. Is Kalshi's price less accurate earlier, and does v2 beat it there?

## Data
- Markets: the 25,131 rows of the NBA v2 back-test's no-gap set (`nba/props_history/backtest_v2_rows.csv`: v1 and
  v2 chances, Kalshi settlement, n_out_fresh), unchanged.
- Earlier prices: `nba/kalshi_props_timing_v1.py` collects, for each market and each horizon H in {24, 12, 6, 3, 1.5}
  hours, the last hourly candle closing at least H hours before tip-off and within the 8 hours before that
  (yes bid, yes ask, open interest).
- The model chances are the back-test's: computed from box scores before the game. v2 also uses tonight's
  availability, which may not be public H hours before tip-off; so the primary rows exclude any row whose team had a
  teammate newly out (n_out_fresh > 0), the absences most likely to be announced late. v1 uses no availability.

## Rows at horizon H
No-gap-set rows with, at H: 0 < bid < ask < 1, ask − bid ≤ 0.10, open interest ≥ 100. mid = (bid + ask) / 2.
Primary rows: those with n_out_fresh = 0. Chances clipped to [0.01, 0.99].

## Tests
- **Test 1 (primary, H = 6).** Log loss of v2 vs Kalshi's mid at 6 hours on the primary rows. 95% interval for
  mean(v2 − Kalshi) by bootstrap over games, 10,000 draws, seed 20261023. V2 MORE RIGHT if the whole interval is below
  0, KALSHI MORE RIGHT if above 0, else TOO CLOSE TO CALL.
- **Test 2 (H = 6).** v2 picks on the primary rows at 6 hours: the live rule (|v2 − mid| ≤ 0.20; EV after fee
  0.07·P·(1 − P) ≥ 0.05; Over at the ask, Under at 1 − bid; one pick per player per stat per game, highest EV).
  ROI per $1 and its 95% game-bootstrap interval. PROFITABLE only if the whole interval is above 0.
- **Test 3 (how much Kalshi learns).** Kalshi's own log loss at each horizon vs at 40 minutes, on rows priced at
  both, same bootstrap: the improvement from H to 40 minutes, with its interval.
- **Information only:** Tests 1 and 2 at every horizon; Test 1 for v1 (all rows, no availability used); Test 1 for v2
  on rows with a newly-out teammate; by stat.
- Fewer than 300 rows or 30 games → INCONCLUSIVE; fewer than 150 picks → the pick test is INCONCLUSIVE.

## Decision, fixed now
- If Test 1 is not KALSHI MORE RIGHT and Test 2 is PROFITABLE, the next NBA live test (a new prereg) locks at a fixed
  horizon of about 6 hours before tip-off instead of "first run in the window", and says so.
- If Test 3 shows Kalshi much less accurate early but Test 1 is still KALSHI MORE RIGHT, the report says the model
  does not beat even the early price.
- Every number is reported, including failures. A back-test on past prices cannot replace a live paper test.

## Known limits
- Hourly candles; thin early markets may have wide spreads (the spread and open-interest filters drop them).
- The v2 chances use box-score availability; the primary rows drop newly-out cases, but long absences may also have
  been unclear 24 hours ahead.
