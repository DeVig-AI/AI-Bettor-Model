# NBA_PROPS_KALSHI_BACKTEST_V2 — pre-registration

Written 2026-10-22, before the v2 model has scored any Kalshi row. Its SHA-256 is locked in `FROZEN.sha256` and
recorded in the results. Any change after hashing voids it; a change becomes v3.
The Kalshi prices used here were already collected and already scored by v1 (NBA_PROPS_KALSHI_BACKTEST_V1, Kalshi
more right by 0.018). They were not used to build v2: v2 was designed and fit on box scores only.

## Question
v1 knew less than Kalshi. v2 adds minutes and role, usage, rest, the opponent, and teammates who are out. On the same
past games: is v2 more right than Kalshi's price, more right than v1, and would its picks have made money after
Kalshi's fee? And does v2 add anything on top of Kalshi's price?

## The model (fixed before this file)
- Design: `nba/nba_props_design_v2.py` → `nba/design/design_v2.json` (walk-forward 2021–2025 on box scores, no prices;
  v2 mean log loss 0.52268 vs v1 0.55009; spread = ratio tables). Code: `nba/nba_props_model_lib_v2.py`.
- Frozen model for the Kalshi season (2025-26, S = 2026): `nba/nba_props_model_v2_T2026.json.gz`, made by
  `nba/nba_props_fit_v2.py --target 2026`: LightGBM means trained on seasons 2020–2025; spread tables fit out of
  sample on 2025 (means from a model trained on 2020–2024). Nothing from 2025-26 is in it. Its SHA-256 is locked.
- Inputs for each game are built by `nba_props_model_lib_v2.build` from ESPN box scores of seasons 2019–2026, using
  only games before that game, plus tonight's availability: who is out for a reason other than coach's decision.
  The model is not refit during the season.

## Data
- Rows: exactly the v1 back-test's rows: `nba/kalshi_props_backtest_v1.py`'s `load_rows` and `score` on
  `nba/props_history/kalshi/*.csv` (same snapshot ≥ 40 min before tip-off, same dedup, same player matching, same
  v1 chances). Stats: points, rebounds, assists, threes (the only ones Kalshi listed with prices that v2 models).
- A row gets a v2 chance if the matched player has a box-score row in that game (played, or a coach's-decision DNP).
- **Player out:** a row whose player is missing from the game's box score, or is a DNP for any reason other than
  coach's decision, is dropped from every test below (the live test's injury rule drops players ruled out), and the
  count is reported.

## Sets
- **No-gap set:** v2 chance and v1 chance exist; n ≥ 40 prior played games; last played ≤ 30 days before; open
  interest ≥ 100; 0 < bid < ask < 1; ask − bid ≤ 0.10; player not out.
- **Main set (v2):** no-gap set and |v2 chance − Kalshi mid| ≤ 0.20 (the live rule's gap filter, on v2's chance).
- mid = (bid + ask) / 2. Chances clipped to [0.01, 0.99] for log loss.

## Tests
- **Test 1 — v2 vs Kalshi (primary).** Log loss of v2 vs Kalshi's mid on the main set. 95% interval for
  mean(v2 − Kalshi) by bootstrap over games, 10,000 draws, seed 20261022. V2 MORE RIGHT if the whole interval is
  below 0, KALSHI MORE RIGHT if the whole interval is above 0, else TOO CLOSE TO CALL.
- **Test 2 — v2 vs v1.** Log loss of v2 vs v1 on the no-gap set, same bootstrap. V2 MORE RIGHT / V1 MORE RIGHT /
  TOO CLOSE TO CALL.
- **Test 3 — v2 picks.** On the main set: Over EV = p − ask − fee(ask), Under EV = (1 − p) − (1 − bid) − fee(1 − bid),
  fee(P) = 0.07·P·(1 − P); a side qualifies if EV ≥ 0.05; at most one pick per player per stat per game (highest
  EV). One contract each. Count, win rate, average cost, ROI per $1 and its 95% game-bootstrap interval. PROFITABLE
  only if the whole interval is above 0, else NOT SHOWN PROFITABLE.
- **Test 4 — v2 on top of Kalshi.** Learning games: game_date before 2026-02-15; test games: on or after.
  Rows: the no-gap set. p_b = sigmoid(a + b·logit(mid) + c·logit(v2)), fit by maximum likelihood on the learning rows.
  - 4a: log loss of p_b vs Kalshi's mid on the test rows, same bootstrap and verdict words (BLEND MORE RIGHT /
    KALSHI MORE RIGHT / TOO CLOSE TO CALL). Also reported: a, b, c and a 95% game-bootstrap interval for c on the
    learning rows (1,000 refits, seed 20261022) (c > 0 means v2 adds information Kalshi's price lacks).
  - 4b: blend picks on the test games: the Test 3 EV rule with p_b and threshold T, T chosen on the learning games
    from {0.02, 0.03, 0.04, 0.06} as the best ROI among values giving ≥ 100 learning picks (else 0.03); one pick per
    player per stat per game. ROI and interval as Test 3.

## Minimums
- Fewer than 300 rows or 30 games in a test's set → that test is INCONCLUSIVE. Fewer than 150 picks → that pick
  test is INCONCLUSIVE.

## Information only (no verdicts)
- Test 1 on v1's exact main set (v1's 0.20 gap filter) for a like-for-like comparison with the v1 back-test.
- Test 1 and Test 2 by stat and by month; Test 3 by side and by stat.
- **Late-news check:** Test 1 on main-set rows whose team had no "fresh" absence (no teammate who played the team's
  previous game is out tonight). Fresh absences are the ones most likely to be announced late, possibly after the
  40-minute snapshot; on these rows v2 cannot have known anything Kalshi could not.

## Decision, fixed now
- **v2 replaces v1** as the NBA prop model if Test 2 is V2 MORE RIGHT. It then starts its own locked live paper test
  (a new prereg, NBA_PROPS_MODEL_V2_LIVE), with ESPN's injury report standing in for box-score availability, and v1's
  live test is closed with its record kept.
- Whether those live picks are presented as an edge depends on Test 1 and Test 3: only if Test 1 is not KALSHI MORE
  RIGHT and Test 3 is PROFITABLE. If instead Test 4a is BLEND MORE RIGHT or TOO CLOSE TO CALL and Test 4b is
  PROFITABLE, the live test uses the blend (with the learning-period a, b, c and T). Otherwise the app says plainly
  that no NBA prop model has beaten Kalshi's prices, and the picks stay a paper test.
- Every number is reported, including failures.

## Known limits
- Availability comes from the box score (who did not play), not from the injury report at snapshot time: a player
  scratched in the last 40 minutes is "out" here but may not have been known. The late-news check measures this.
- Hourly candles, not the exact quote; the fee is an estimate; one season of Kalshi history (2025-26, from
  2025-11-18). This is a back-test on past prices; it cannot replace a live paper test.
