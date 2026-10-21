# NHL_PROPS_KALSHI_BACKTEST_V1 — pre-registration

Written 2026-10-21, before any past Kalshi NHL prop price was collected or seen (the coverage probe
`odds_probe/nhl_wnba_probe_v1.md` recorded counts and market wording only). Its SHA-256 is locked in `FROZEN.sha256` and
recorded in the results. Any change after hashing voids it; a change becomes v2. Same design as the NBA and NFL Kalshi
back-tests. It does not change or replace the live paper test NHL_PROPS_MODEL_V1_LIVE.

## Question
On past NHL games, who was more right about goals, assists and points props: Kalshi's price shortly before puck drop,
or the frozen NHL_PROPS_MODEL_V1? And would the live test's pick rule have made money after Kalshi's fee?

## Data
- Prices: every settled Kalshi market in KXNHLGOAL, KXNHLAST, KXNHLPTS for NHL regular-season and playoff games (NHL
  API game type 2 or 3) that started before 2026-10-21 00:00 UTC, collected by `nhl/kalshi_props_history_v1.py` from the
  public API. Only "N+" markets (Over N−0.5; Kalshi's historical "structured" copies count when the wording reads
  "N+" and floor_strike = N − 0.5).
- Snapshot: the last hourly candle closing at least 40 minutes before puck drop (NHL API schedule), searched in the
  8 hours before that (yes bid close, yes ask close, open interest). No such candle → no price.
- Outcome: Kalshi's own settlement. Only "yes" or "no" results are used.
- Duplicates (same game, player, stat and line): keep the larger open interest.
- Season S = the NHL season's start year (2025 = 2025-26).

## Model (no tuning, no leakage)
- Settings are the frozen model's (look-back spans 40 / 160 games (short / long exponentially weighted averages), shrink K = 3, Poisson method), chosen on box scores of 2010-11 to 2024-25 only, before any price.
- Walk-forward: for a game in season S, nothing is fit on season S or later: the Poisson method has no fitted tables, and the settings were chosen on 2010-11 to 2024-25 box scores. The model file (sha256 070c52e00155…) records the settings only.
- Expected values: every played game since 2010-11 strictly before the game date, as the live model computes them.
- Players matched by full name (NHL rosters); several matches → the one whose last team is in the game; otherwise
  unmatched. A model chance needs ≥ 5 earlier games.

## Rows used
- Main set = the live test's pick filters that can be applied historically: model chance exists; ≥ 40 earlier played
  games; last played game ≤ 30 days before the game date; open interest ≥ 100; 0 < bid < ask < 1; ask − bid ≤ 0.10;
  |model chance − Kalshi mid| ≤ 0.20.
- No injury filter: there are no historical injury reports at snapshot time. Reported as a limit.
- Information only (no verdict): Test 1 without the 0.20 gap filter.

## Test 1 — who was more right (primary)
- Log loss of the model chance vs Kalshi's mid ((bid + ask) / 2), chances clipped to [0.01, 0.99].
- 95% interval for mean(model − Kalshi) by bootstrap over games, 10,000 draws, seed 20261021.
- MODEL MORE RIGHT if the whole interval is below 0; KALSHI MORE RIGHT if the whole interval is above 0; otherwise
  TOO CLOSE TO CALL.

## Test 2 — would the live pick rule have made money
- On main-set rows: Over EV = p − ask − fee(ask); Under EV = (1 − p) − (1 − bid) − fee(1 − bid); fee(P) = 0.07·P·(1 − P).
  A side qualifies if EV ≥ 0.05; at most one pick per player per stat per game (highest EV).
- Each pick = 1 contract: a win pays 1 − price − fee, a loss costs price + fee.
- Report count, games, win rate, average cost, ROI (profit / cost) and its 95% game-bootstrap interval (10,000 draws,
  seed 20261021); Over and Under, by stat and by season.
- PROFITABLE only if the whole ROI interval is above 0; otherwise NOT SHOWN PROFITABLE.
- Information only: whether the live test's PASS bar would have been met.

## Minimums
- Fewer than 300 main-set rows or fewer than 30 games → both tests INCONCLUSIVE.
- Fewer than 150 picks → Test 2 INCONCLUSIVE.
- The back-test runs only once collection is complete: every settled event read, none left with unreadable markets.

## Reporting
- Every number, including failures: the funnel, how many games and seasons of Kalshi NHL prop history existed,
  results by season, stat and line.
- Known limits: no injury filter; hourly candles, not the exact quote at lock time; the fee is an estimate; most lines
  are "1+", where small price differences matter.
- This is a back-test on past prices; it cannot replace the live paper test.
