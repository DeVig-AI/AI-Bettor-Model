# MLB bullpen study v1 -- pre-registration

Written and committed **before any result of this study was computed**. Nothing about the relief-pitcher data has
been seen: this sandbox cannot reach Retrosheet, so the data is downloaded only inside the GitHub Actions run.
Once this file and `mlb/research/mlb_bullpen_study_v1.py` are committed they are locked (`FROZEN.sha256`). If the
first run fails **before any result is computed** (for example, the download link has moved), the data-loading code
may be fixed, with a dated line in `FROZEN_CHANGES.md`; the features, split, model and bars below may not change.

**Question:** MLB Model C sees each team's runs scored/allowed over the last 15 games, each starting pitcher's last
5 starts (ERA, strikeouts minus walks per batter) and rest days. It does not see the bullpen, which pitches about
40% of innings. Does adding the bullpen make it a better forecaster?

**Expected result, stated up front:** a small improvement at most. Model C's runs-allowed feature already contains
the bullpen's runs. And a better forecaster is not the same as beating Kalshi: there is no historical Kalshi MLB
price to test that against, so this study cannot say anything about profit.

## Data
- Model C's own files, unchanged: `mlb/teamstats.csv`, `mlb/pitching.csv` (Retrosheet, 2010-2025), read through
  Model C's own `load_training_data()` (imported read-only from the locked `mlb/mlb_live_tracker_lock_v4.py`), so the
  base features, eligibility rules and regular-season-only filter are exactly Model C's.
- Relief pitchers: Retrosheet's parsed `pitching.csv` (one row per pitcher per game), 2010-2025, regular season;
  a reliever is a row with `p_gs` = 0. Downloaded in the workflow, never committed.

## Features added (per team, from games before this one, regular season only)
- `bp_era15`: the team's relievers' earned runs × 27 ÷ outs recorded over the team's previous 15 games
  (Model C's window), any season, at least 1 game; missing when there is none (then imputed as Model C imputes).
- `bp_outs3`: outs recorded by the team's relievers in the previous 3 calendar days (fatigue).
- Home and away versions: 4 new features, 14 in total.

## Model and test
- Both models are Model C's pipeline exactly: median imputation, standard scaling, logistic regression C = 0.2.
  "C" uses Model C's 10 features, "C+bullpen" the 14.
- **Walk-forward by season:** for each test season 2015-2025, both are fit on every eligible game from 2010 up to
  the season before, then forecast every eligible game of the test season. (2020's 60-game season is a test season
  like the others.)
- Reported per season and pooled: log loss, Brier score, accuracy, for both.
- **Bullpen helps** only if **all** of: pooled log loss lower for C+bullpen; the 95% interval of the pooled log-loss
  difference (paired game bootstrap, 10,000 resamples, seed 20261019) is entirely below 0; and C+bullpen has lower
  log loss in at least 7 of the 11 test seasons.
- If it helps, a separate pre-registration would set up "MLB Model C v2" as a live paper test for the 2027 season
  (live bullpen numbers from MLB's Stats API, checked against Retrosheet as Model C's features were). Nothing here
  changes Model C, its picks or the app.

## Not in this study
Lineups and left/right matchups: they need each game's batting order and every batter's and pitcher's throwing /
batting hand, a bigger data job; a later study.

## Output
`mlb/research/bullpen_v1_results.json` and `bullpen_v1_results.md`, written by the script in the workflow
"MLB bullpen study (pre-registered, run on demand)".
