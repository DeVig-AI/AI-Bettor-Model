# Does NBA Model C get better with the official injury report? -- pre-registration (v1)

Written and committed **before the comparison was computed**. The owner asked whether injury reports can help the
model decide better. Same rule as the NFL test (`NFL_MODEL1_PLUS_INJURIES_V1_PREREG.md`): add injuries if they make
the model better than what runs today, drop them if not. This is a side study, like `research/nba_roster/`. It is not
a Lab chamber candidate, it is not an edge claim, and it says nothing about beating the closing line.

Checked before writing (not a comparison): the NBA's official injury reports are archived as PDFs at
`ak-static.cms.nba.com/referee/injury/Injury-Report_<YYYY-MM-DD>_<HH>PM.pdf` (from about January 2026 the name is
`_<HH>_<MM>PM`), hourly on game days, for every season tested here. One report was read (2025-01-15, 5 PM) to check
the layout: game, team, player ("Last, First"), status (Out / Doubtful / Questionable / Probable / Available), reason.

## Data
- **Games and Model C features:** `nba/nba_games_raw_season<Y>.csv` (repo), features from Model C's own locked code
  (`nba/nba_live_tracker_lock.py` `build_features`, `FEATURES_C`, `MIN_HISTORY`), read-only.
- **Seasons:** 2022-23, 2023-24, 2024-25, 2025-26 (files 2023 to 2026). The 2021-22 games file is read only so the
  first games of 2022-23 have Model C's 10-game form window, as Model C does live. Nothing is fit or scored on
  2021-22, and no injury or box data from it is read. 2026-27 (in progress) is not used.
- **Box scores:** sportsdataverse `player_box_<Y>.csv` (ESPN), regular season, for minutes only.
- **Injury report per game:** the latest on-the-hour report published at least 30 minutes before tip-off (Eastern
  time). If that report can't be read, the next earlier one, back to 8 AM that day. Only rows for that game count.
- Raw PDFs and box scores are never committed; they live in a local cache outside the repo.

## Injury features (fixed here, nothing tuned)
For each team before each game, a player's **minutes share** = his minutes in the team's previous 10 games (any
season) divided by the team's total minutes in those games, times 5 (so a full-time starter is about 1).
- `out_share`: sum of minutes shares of players listed **Out** or **Doubtful**.
- `q_share`: sum of minutes shares of players listed **Questionable**.
- `top_out`: 1 if the team's highest-minutes-share player is listed Out or Doubtful, else 0.
Model features are home minus away: `d_out`, `d_q`, `d_top`. A report player who can't be matched to a box-score
player on that team (by normalized first + last name, suffixes like Jr./III dropped) counts 0. A game with no
readable report gets 0 for all three. The match rate and the share of games with a report are reported.

## Models
- **Model C:** `FEATURES_C`, its pipeline (median imputation, scaling, logistic regression C = 0.2).
- **C + injuries:** `FEATURES_C` + `d_out`, `d_q`, `d_top`. Same pipeline.
- Games: regular season, played, both teams with at least `MIN_HISTORY` prior games (Model C's own filter).

## Test
- **Walk-forward:** each of 2023-24, 2024-25, 2025-26 is forecast by both models fit on the seasons from 2022-23 up
  to the season before. Reported per season and pooled: log loss, Brier, accuracy.
- **Better** only if all three: pooled log loss lower; the 95% interval of the pooled log-loss difference (paired
  game bootstrap, 10,000 resamples, seed 20261106) entirely below 0; lower log loss in at least 2 of the 3 seasons.
- **If better:** Model C keeps running unchanged (it is frozen). A "C + injuries" model fit on 2022-23 to 2025-26
  can be built and paper-tracked next to it, labelled not proven; no picks change until the owner decides.
  **If not:** injuries stay out of the NBA game model; the result stays on record.

Output: `research/injuries/nba_modelc_plus_injuries_v1_results.json` / `.md`.
Code: `research/injuries/nba_modelc_plus_injuries_v1.py` (committed with the results; its feature code follows the
definitions above exactly).
