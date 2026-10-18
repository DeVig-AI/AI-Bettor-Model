# NFL_PROPS_KALSHI_BACKTEST_V1 — pre-registration

Written 2026-10-18, before any past Kalshi prop price has been seen. Its SHA-256 is recorded in the project notes
and in the results. Any change after hashing voids it; a change becomes v2.

## Question
On past NFL games, who was more right about player props: Kalshi's price shortly before kickoff, or the
NFL_PROPS_MODEL_V1 method? And would the app's confidence labels have made money?

## Data
- Prices: every settled Kalshi market in KXNFLPASSYDS, KXNFLPASSTDS, KXNFLPASSATT, KXNFLPASSCOMP, KXNFLPASSINT,
  KXNFLRSHYDS, KXNFLRSHATT, KXNFLRECYDS, KXNFLREC, KXNFLRRYDS, KXNFLTD for games that kicked off before
  2026-10-18 00:00 UTC, collected by `nfl/kalshi_props_history_v1.py`.
- Snapshot: the last hourly candle closing at least 40 minutes before kickoff (yes bid, yes ask, open interest).
- Outcome: Kalshi's own settlement. Only markets with result "yes" or "no" are used.
- Kickoffs: nflverse schedule.

## Model (no tuning)
- Expected value per player and stat: the v1 EWMA (spans 5 and 16, shrink K = 2) over the player's games in that role
  before the game date, from nflverse play-by-play.
- Ratio tables: for a game in season S, the v1 method fit on seasons 2016 to S−1. For S = 2026 these are exactly the
  frozen v1 tables (sha256 d566c111…). Nothing is fit on the season being tested.
- Players are matched to nflverse ids by normalized name and team (team taken from the Kalshi ticker).

## Rows used
- Main set: a model chance exists, the player has ≥ 21 prior games in that role, the stat is one of the 10 pickable
  stats (everything except touchdowns), 0 < bid < ask < 1, ask − bid ≤ 0.10, open interest ≥ 100.
- Touchdowns are reported separately, for information only.

## Test 1 — who was more right (primary)
- Compare log loss of the model chance vs log loss of Kalshi's mid ((bid + ask) / 2), chances clipped to [0.01, 0.99].
- 95% interval for (model − Kalshi) by bootstrap over games, 10,000 draws, seed 20261018.
- MODEL MORE RIGHT if the whole interval is below 0. KALSHI MORE RIGHT if the whole interval is above 0.
  Otherwise TOO CLOSE TO CALL.

## Test 2 — would the labels have made money
- Apply the app's label rules exactly: model within 0.20 of the mid; edge = model chance of the side − (price paid +
  fee 0.07·P·(1−P)); Over pays the ask, Under pays 1 − bid; LEAN 0.02–0.05, MEDIUM 0.05–0.10, HIGH ≥ 0.10; at most one
  line per player per stat (the biggest edge).
- No injury filter (no historical injury reports at snapshot time).
- For MEDIUM + HIGH together (the paper-test bar) and for each label: count, win rate, average "needs" %, ROI per $1
  staked at price + fee, and its 95% game-bootstrap interval.
- MEDIUM + HIGH PROFITABLE only if the ROI interval is entirely above 0.

## Reporting
- Report every number, including failures, plus results by season and by stat.
- If there are fewer than 300 main-set rows or fewer than 30 games, the result is INCONCLUSIVE.
- This is a back-test on past prices; it cannot replace the live paper test.
