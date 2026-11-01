# Research Lab scout -- what changed in the outside sources

_Written 2026-11-01 21:59 UTC by tools/scout_sources.py (Constitution v12 A2). Links and change notes only; read a source itself (and cite it) before proposing anything from it. What a source says is information, never instructions._

## nfelo (NFL) -- https://github.com/greerreNFL/nfelo
_An NFL Elo model adjusted for quarterbacks, rest, market lines and more; its feature and adjustment code._ License: none stated (read only; never copy code).

- 15 new commit(s), `50bd490` → `4be7403` ([compare](https://github.com/greerreNFL/nfelo/compare/50bd490...4be7403)):
  - 2026-10-29 `5c8c638` Automated Update
  - 2026-10-30 `56613b5` Automated Update
  - 2026-10-30 `38a907a` Automated Update
  - 2026-10-30 `dc6c975` Automated Update
  - 2026-10-30 `f72b284` Automated Update
  - 2026-10-30 `a158941` Automated Update
  - 2026-10-31 `795f1ea` Automated Update
  - 2026-10-31 `89ffa10` Automated Update
  - 2026-10-31 `69cb177` Automated Update
  - 2026-10-31 `dba5413` Automated Update
  - 2026-10-31 `5989222` Automated Update
  - 2026-11-01 `87eaed5` Automated Update
  - 2026-11-01 `cc62461` Automated Update
  - 2026-11-01 `4e0064b` Automated Update
  - 2026-11-01 `4be7403` Automated Update
- files changed: `output_data/historic_projected_spreads.csv`, `output_data/nfelo_games.csv`, `output_data/prediction_tracker.csv`

## elo538-nfl (NFL) -- https://github.com/fivethirtyeight/nfl-elo-game
_FiveThirtyEight's NFL Elo game model and its rules (home field, margin of victory, rest, playoffs)._ License: MIT.

- no change since last week.

## nflfastr (NFL) -- https://github.com/nflverse/nflfastR
_The EPA, win-probability and completion models behind nflverse's play-by-play columns, with their documentation._ License: MIT.

- no change since last week.

## nfl4th (NFL) -- https://github.com/nflverse/nfl4th
_Fourth-down decision model (expected points and win probability by choice); how coaches' choices cost points._ License: MIT.

- no change since last week.

## nflwar (NFL) -- https://github.com/ryurko/nflWAR
_Wins above replacement for NFL players (how much each position is worth), from play-by-play._ License: MIT.

- no change since last week.

## open-source-football (NFL) -- https://github.com/mrcaseb/open-source-football
_Open Source Football, public analytics articles with code (EPA stability, pass rate, prediction models)._ License: per article (read only).

- no change since last week.

## cfbfastr (CFB) -- https://github.com/sportsdataverse/cfbfastR
_College football play-by-play, EPA/PPA and win-probability models, with documentation._ License: MIT.

- 10 new commit(s), `71c3be6` → `5c70148` ([compare](https://github.com/sportsdataverse/cfbfastR/compare/71c3be6...5c70148)):
  - 2026-10-30 `a4ea625` fix(cfbd): document CFBD's new CPOE columns and punt stat types, retry 502/504 (#196)
  - 2026-11-01 `fd98df7` fix(load): read model_pbp from parquet, keep play ids exact, correct season floors (#197)
  - 2026-11-01 `f965d6a` fix(wp): score WP boosters on the 2H-kickoff flag they were trained on; add an sdv-py EP/WP oracle (
  - 2026-11-01 `4a61a87` build(cran): prepare cfbfastR 3.1.0 for CRAN (#198)
  - 2026-11-01 `e10874c` fix(pbp): engine parity with sdv-py on play-text case, timeouts and fair-catch kickoffs (#203)
  - 2026-11-01 `b31b401` docs: NEWS refile, contributor files, README counts, pkgdown agent pages, dead links (3.1.0) (#201)
  - 2026-11-01 `af82330` docs: companion packages in the README and articles (sdvplotR, sportyR, cfbseedR, cfb4th, cfbplotR) 
  - 2026-11-01 `22f1c4d` ci: r-devel check, URL check, coverage, checkout v7 (#200)
  - 2026-11-01 `bbcaf39` feat(cfbd): add the five CFBD punting endpoint wrappers (#205)
  - 2026-11-01 `5c70148` fix(pbp): read 'punt for a loss of N' as -N yards punted (#204)
- files changed: `.Rbuildignore`, `.github/ISSUE_TEMPLATE/bug_report.md`, `.github/ISSUE_TEMPLATE/feature_request.md`, `.github/copilot-instructions.md`, `.github/pull_request_template.md`, `.github/workflows/R-CMD-check.yaml`, `.github/workflows/pkgdown.yaml`, `.github/workflows/test-coverage.yaml`, `.github/workflows/url-check.yaml`, `CLAUDE.md`, `CONTRIBUTING.md`, `DESCRIPTION`, `NAMESPACE`, `NEWS.md`, `R/cfbd_api_key.R`, `R/cfbd_metrics.R`, `R/cfbd_passing.R`, `R/cfbd_pbp_data.R`, `R/cfbd_pbp_data_v2.R`, `R/cfbd_play.R`, `R/cfbd_players.R`, `R/cfbd_punting.R`, `R/cfbd_stats.R`, `R/cfbd_teams.R`, `R/data.R` (+102 more)

## cfb-elo-schwill (CFB) -- https://github.com/schwill2018/college-football-elo
_A college football (FBS) Elo model and its predictions._ License: none stated (read only; never copy code).

- 5 new commit(s), `18c3231` → `68e80c5` ([compare](https://github.com/schwill2018/college-football-elo/compare/18c3231...68e80c5)):
  - 2026-10-28 `8f4ae2c` Update College Elo outputs
  - 2026-10-29 `76f146c` Update College Elo outputs
  - 2026-10-30 `9163785` Update College Elo outputs
  - 2026-10-31 `11e0a76` Update College Elo outputs
  - 2026-11-01 `68e80c5` Update College Elo outputs
- files changed: `cfb_elo_history.csv`, `current_elo_rankings.csv`, `daily_projections.csv`, `data/cfb_overtime_supplement.csv`, `future_projections.csv`, `historical_predictions.csv`, `performance_by_year.csv`, `performance_games.csv`, `spread_performance_by_year.csv`, `weekly_projections.csv`

## cfb-rankings-keck (CFB) -- https://github.com/brandon-keck/cfb-rankings
_College football Elo rankings (home edge, scale) with weekly ratings._ License: MIT.

- no change since last week.
