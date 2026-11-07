# Champion / challenger V5: NBA's champion becomes Model C + injuries

Written 2026-11-06, the owner's decision. Its SHA-256 is in `FROZEN.sha256`; any change is a V6. V1-V4
(`CHAMPION_CHALLENGER_V1_PREREG.md` .. `..._V4_...`) stay as they are. Everything in V4 holds except what is listed
below.

## Why

The owner asked that the NBA pick use the official injury report. The test
(`research/injuries/NBA_MODELC_PLUS_INJURIES_V1_PREREG.md`, results in
`research/injuries/nba_modelc_plus_injuries_v1_results.md`) found Model C plus three injury features more accurate
than Model C on 2023-24, 2024-25 and 2025-26 (pooled log loss 0.6267 to 0.6188, 3,693 games, 95% interval of the
difference -0.0118 to -0.0041). That test's own next step was a paper trial beside Model C. The owner chose instead
to replace Model C now, since neither model is proven.

Said plainly: this is the owner's choice, not an entry-test result. "More accurate than Model C on past seasons" is
not "beats the price": sportsbook and Kalshi prices already react to the injury report, and neither model has shown
an edge. It is labelled not proven everywhere it is shown.

## Changes from V4

1. **`NBA.ml`'s champion `devig` is now "Model C + injuries"** (`nba/nba_live_tracker_lock_v2.py`, model version
   `NBA_MODEL_C_INJ_V1_LIVE`) for every game it locks after this file's merge. Its features are Model C's eight plus
   `d_out`, `d_q` and `d_top` exactly as in the test; it is fit on 2022-23 .. 2025-26 with Model C's pipeline, on
   the injury features in `nba/nba_injury_features_train.csv` (written by
   `research/injuries/nba_modelc_plus_injuries_v1_build.py`, which stops unless it reproduces the test's log loss).
2. **Its confidence cutoffs** are its own: top 25% at 0.7159 and top 50% at 0.6297 (`nba/nba_v2_tiers.json`, from its
   walk-forward test games), in place of Model C's 0.6830 / 0.6083 for its picks. Below 0.6297: PASS.
3. **Lock time.** A game is locked only on its own day (Eastern time), at the daily lock run (11am ET, or a manual
   run), from the latest official report then. The test used the report about 30 minutes before tip, so the live
   inputs are a few hours older than the tested ones; a game with no readable report gets 0s, as in the test.
4. **Reader.** The live pick reads the report with `tools/injuries_export.py`'s PDF reader; the test read it as text.
   `tests/tools/test_nba_injury_parsers.py` checks the two agree on a fixed past report before every lock run, and
   the lock does not run when they disagree.
5. **Same records.** Its picks go to the same tracker table as Model C's (`nba/NBA_PROSPECTIVE_TRACKER_V1.sqlite3`,
   one pick per game), so grading, the app and the Models page read them unchanged; each lock's injury inputs are
   kept in that database's `injury_inputs` table. Games Model C locked before the merge stay Model C's picks.

## Not changed

Model C's code (`nba/nba_live_tracker_lock.py` stays frozen; the new file imports it read-only) and its past picks,
the grader, every other slot, the college and soccer rules of V3 and V4, and the Research Lab's rules. Model C no
longer locks new games.
