# NBA_PROPS_KALSHI_BACKTEST_V1 — pre-registration

Written 2026-10-19, before any past Kalshi NBA prop price has been collected or seen. Its SHA-256 is locked in
`FROZEN.sha256` and recorded in the results. Any change after hashing voids it; a change becomes v2.
This is a back-test on past prices. It does not change, replace or feed the live paper test NBA_PROPS_MODEL_V1_LIVE.

## Question
On past NBA games, who was more right about player props: Kalshi's price shortly before tip-off, or the frozen
NBA_PROPS_MODEL_V1 method? And would the live test's pick rule have made money after Kalshi's fee?

## Data
- Prices: every settled Kalshi market in the NBA player-prop series found by `nba/nba_props_exchanges_v1.py`'s series
  filter (`stat_of` on GET /series?category=Sports titles, e.g. KXNBAPTS, KXNBAREB, KXNBAAST, KXNBA3PT, KXNBAPRA,
  KXNBAPR, KXNBAPA, KXNBARA, KXNBASTL, KXNBABLK, KXNBASTOCK(S), KXNBAPLAYOFFPTS), for games that tipped off before
  2026-10-18 00:00 UTC, collected by `nba/kalshi_props_history_v1.py` from the public API (no key, nothing bet).
  Only "greater" markets ("N+ <stat>" = Over N−0.5, the line being Kalshi's floor_strike).
- Games: regular season, play-in and playoffs only (ESPN season type 2, 3, 5 — the same game types the tables are fit
  on). Preseason, All-Star and summer-league games are excluded. Tip-off times from ESPN's public NBA scoreboard.
- Snapshot: the last hourly candle closing at least 40 minutes before tip-off, searched in the 8 hours before that
  (yes bid close, yes ask close, open interest). No such candle → the row has no price.
- Outcome: Kalshi's own settlement. Only markets with result "yes" or "no" are used.
- Duplicates (same game, player, stat and line in two series): keep the one with the larger open interest.
- Season label S = ESPN's (the year the season ends; a game in September or later belongs to the next year's season).

## Model (no tuning, no leakage)
- The frozen tables `nba/nba_props_model_v1_tables.json` were fit on ESPN seasons 2010–2026 (2009-10 to 2025-26),
  which overlap Kalshi's price history. They are NOT used to score any past game.
- Walk-forward: for a game in season S, the ratio tables are refit with the identical frozen method
  (`nba_props_model_lib_v1`: load_box → player_games → add_expectations → fit_ratio_tables(min_prev=5)) on ESPN
  seasons 2010 to S−1 only. Nothing from season S or later is in the tables used for season S.
  Check done before this file, with no prices: the same code on 2010–2026 reproduces the frozen tables exactly
  (bucket edges, counts and quantiles, all 12 stats). The check is re-run and reported with the results.
- Expected value per player and stat: exactly as the live test (`next_game_expectations`): his played games in the ESPN
  box scores of seasons S−2 to S strictly before the game date (spans 5 and 20, shrink K = 3).
- Prior games n and last game date are counted the same way, before the game date.
- Players are matched exactly as the live test: normalized name; if several players share it, the one whose last team
  is in the game; otherwise unmatched. A model chance needs n ≥ 5.

## Rows used
- Main set = the live prereg's pick filters that can be applied historically:
  model chance exists; stat is points, rebounds, assists, threes, pts+reb+ast, pts+reb, pts+ast or reb+ast;
  n ≥ 40 prior played games; last played game ≤ 30 days before the game date; open interest ≥ 100;
  0 < bid < ask < 1; ask − bid ≤ 0.10; |model chance − Kalshi mid| ≤ 0.20.
- No injury filter: there are no historical ESPN injury reports at snapshot time. This is a real difference from the
  live test (players ruled Out late are not removed here) and is reported as a limit.
- Information only (no verdict): Test 1 without the 0.20 gap filter, and on steals / blocks / stl+blk / turnovers.

## Test 1 — who was more right (primary)
- Log loss of the model chance vs log loss of Kalshi's mid ((bid + ask) / 2), chances clipped to [0.01, 0.99].
- 95% interval for mean(model − Kalshi) by bootstrap over games, 10,000 draws, seed 20261018.
- MODEL MORE RIGHT if the whole interval is below 0. KALSHI MORE RIGHT if the whole interval is above 0.
  Otherwise TOO CLOSE TO CALL.

## Test 2 — would the live pick rule have made money
- On main-set rows: Over EV = p − ask − fee(ask); Under EV = (1 − p) − (1 − bid) − fee(1 − bid);
  fee(P) = 0.07·P·(1 − P). A side qualifies if EV ≥ 0.05. At most one pick per player per stat per game: the line and
  side with the highest EV.
- Each pick = 1 contract: a win pays 1 − price − fee, a loss costs price + fee.
- Report count, games, win rate, average cost, ROI per $1 staked (profit / cost) and its 95% game-bootstrap interval
  (10,000 draws, seed 20261018); also Over and Under separately, by stat and by season.
- PROFITABLE only if the whole ROI interval is above 0; otherwise NOT SHOWN PROFITABLE.
- Also reported (information only): whether the live test's PASS bar would have been met (ROI lower bound > 0 AND
  model log loss < Kalshi log loss on the main set).

## Minimums
- Fewer than 300 main-set rows or fewer than 30 games → both tests INCONCLUSIVE.
- Fewer than 150 picks (the live test's floor) → Test 2 INCONCLUSIVE.

## Reporting
- Report every number, including failures: the collection funnel, how many games and seasons of Kalshi NBA prop
  history existed, results by season and by stat.
- Known limits: the model's design and pick filters (≥ 40 games, the pick stats) were chosen in a 2012-13 to 2025-26
  walk-forward that overlaps these games, so only the tables, not the design, are out of sample; no injury filter;
  hourly candles, not the exact quote at lock time; the fee is an estimate.
- This is a back-test on past prices; it cannot replace the live paper test.
