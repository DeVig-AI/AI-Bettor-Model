# NBA_PROPS_KALSHI_BACKTEST_V3 — pre-registration

Written 2026-10-22, before the v3 model has scored any Kalshi row. Its SHA-256 is locked in `FROZEN.sha256` and
recorded in the results. Any change after hashing voids it.

## Read this first: these prices have been used before
The 2025-26 Kalshi props were already scored by v1 and v2, and v2's results by stat, month and absence type were
seen before v3 was designed. v3's new inputs (teammates newly out / back, new team, early season) were chosen
because v2 lost most there. v3 was designed and fit on box scores only, but this back-test is **not a clean
out-of-sample test**: a good result here is weaker evidence than v2's was. The clean test of v3 is the 2026-27
season, live, and NHL. Every result below is labelled REUSED.

## Model (fixed before this file)
- Design: `nba/design/design_v3.md` (box scores only, walk-forward 2021–2025): v3 0.51978 vs v2 0.52267; monthly
  refit 0.51960, inside the 0.0005 tie margin, so the simpler fit-once model is used.
- Code: `nba/nba_props_model_lib_v3.py`, `nba/nba_props_fit_v3.py`. Frozen model for 2025-26:
  `nba/nba_props_model_v3_T2026.json.gz` (trained 2020–2025, spread fit on 2025), sha256 in `FROZEN.sha256`.

## Rows
Exactly the v2 back-test's no-gap set, `nba/props_history/backtest_v2_rows.csv` (25,131 rows; players out already
dropped), joined to v3's inputs by date and player id from box scores of seasons 2019–2026. A row without a v3
chance is dropped and counted. Main set = rows with |v3 − mid| ≤ 0.20.

## Tests (labels and bootstrap as the v2 back-test: game bootstrap, 10,000 draws, seed 20261024)
- **Test 1 (primary):** v3 vs Kalshi mid on the main set. V3 MORE RIGHT / KALSHI MORE RIGHT / TOO CLOSE TO CALL.
- **Test 2:** v3 vs v2 on the no-gap set. V3 MORE RIGHT / V2 MORE RIGHT / TOO CLOSE TO CALL.
- **Test 3:** v3 picks with the live rule (EV ≥ 0.05, one per player per stat per game) on the main set; ROI and
  interval; PROFITABLE only if the whole interval is above 0.
- **Test 4:** blend sigmoid(a + b·logit(mid) + c·logit(v3)) fit on games before 2026-02-15, scored after:
  4a log loss vs Kalshi; 4b picks with T chosen on the learning games from {0.02, 0.03, 0.04, 0.06} (≥ 100
  learning picks, else 0.03).
- Information only: Test 1 by stat, by month, on rows with / without a teammate newly out.
- Minimums as v2: 300 rows / 30 games; 150 picks.

## Decision, fixed now
- If Test 2 is V3 MORE RIGHT, v3 runs **alongside** v2 in the live test from the next bot run as a shadow: its chances
  are locked with every row, it makes no picks of its own, and v2's live test is not changed. A switch from v2 to v3
  needs the 2026-27 live rows: at the v2 live test's evaluation, v3 vs v2 log loss on the same locked rows is
  reported, and only if v3 is more right there (95% game bootstrap) does a v3 live test get a new prereg.
- Otherwise v3 is dropped and the report says so.
