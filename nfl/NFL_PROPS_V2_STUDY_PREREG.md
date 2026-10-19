# NFL_PROPS_V2_STUDY — pre-registration

Written 2026-10-19, before any v2 number has been computed. Its SHA-256 is recorded in the results. Any change after
hashing voids it; a change becomes v3.

## Why
The live v1 prop picks (NFL_PROPS_MODEL_V1) are overconfident: on 2026-10-18 the model expected 91 of 169 picks to win
and 71 did, about what Kalshi's prices implied (69). The v1 back-test (NFL_PROPS_KALSHI_BACKTEST_V1) found the same
on past games: Kalshi's price was more right than the model (log loss 0.536 vs 0.567). v2 tries to keep only what
the model adds on top of Kalshi's price, and to make fewer, stronger picks.

## Data
- The same settled Kalshi prop markets and pre-kickoff snapshots as the v1 back-test
  (`nfl/props_history/kalshi_props_history_v1.csv`), scored with the frozen v1 model exactly as the v1 back-test
  does (same player matching, same expected values, frozen 2026 tables), and its same main set: a model chance, 21+
  prior games in the role, one of the 10 pickable stats, 0 < bid < ask < 1, ask − bid ≤ 0.10, open interest ≥ 100.
- **Learning games:** game_date before 2026-09-24 (weeks 1–2). **Test games:** game_date on or after 2026-09-24
  (weeks 3–6). Nothing about the test games is used to build v2.

## v2 (built on the learning games only)
1. **Calibrated chance.** p2 = sigmoid(a + b·logit(mid) + c·logit(model)), where mid = (bid + ask)/2 and model = the
   v1 chance (both clipped to [0.01, 0.99]); a, b, c fit by maximum likelihood (logistic regression) on the learning
   rows.
2. **Pick rule.** For each row, the side with the bigger edge = p2 for that side − (price paid + fee
   0.07·P·(1−P)), Over paying the ask, Under paying 1 − bid. A row is a pick if that edge ≥ T. At most one line per
   player per stat per game (the biggest edge), then at most 3 picks per game (the 3 biggest edges).
3. **Threshold T** is the value in {0.02, 0.03, 0.04, 0.06, 0.08} with the best ROI on the learning games among those
   giving at least 40 learning picks; if none gives 40, T = 0.02.

## Tests (test games only)
- **Test A — accuracy vs Kalshi (primary).** Log loss of p2 vs log loss of Kalshi's mid on all test main-set rows;
  95% interval for (p2 − mid) by bootstrap over games, 10,000 draws, seed 20261019. V2 MORE RIGHT if the whole
  interval is below 0, KALSHI MORE RIGHT if the whole interval is above 0, else TOO CLOSE TO CALL.
- **Test B — accuracy vs v1.** The same comparison of p2 against the v1 model chance.
- **Test C — picks.** For v2 picks and, on the same test games, for v1's MEDIUM + HIGH picks (the v1 back-test's
  label rule): count, win rate, average price paid ("needs"), average chance v2 / v1 gave them, ROI per $1 at
  price + fee, and the 95% game-bootstrap ROI interval.
- Fewer than 300 test rows or 30 test games: every verdict is INCONCLUSIVE.

## Decision, fixed now
- v2 replaces v1 as the app's prop picks (and starts its own locked live paper test) only if **Test A is not KALSHI
  MORE RIGHT** and **Test B is V2 MORE RIGHT** and **v2's test ROI is above v1's**.
- Otherwise v1 stays, and the app says plainly that no prop model has beaten Kalshi's prices.
- Either way every number is reported, including failures. This is a back-test on past prices; it cannot replace
  a live paper test.
