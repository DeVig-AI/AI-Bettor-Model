# CFB_MODEL_V1 — pre-registration

Written 2026-11-03, before the model's first live number was locked. Locked in `FROZEN.sha256` with
`tools/cfb_model_live.py`; any change to the model below becomes v2. Paper only: nothing is bet, no account is used.
Descriptive, not a claimed edge over Kalshi.

## What it is
DeVig's own college football (FBS vs FBS) moneyline and spread model, tracked on the Models page as a **challenger**
under the key `devigcfb` ("DeVig CFB v1"). It is **not** the app's CFB pick: the app keeps showing what it showed
before. It is graded on the same games as Kalshi, FBS Elo, CFB Rankings and the Research Lab's CFB leader.

## Inputs (all known before kickoff; no prices, injuries or depth charts)
Each team carries, updated after every final in date order:
- **m**, a margin rating in points. Both teams move by k × (margin − (home field + m gap)); k starts at 0.18 for a
  team's first games of a season and settles toward 0.09 (k = 0.09 + 0.09 × e^(−games/4)). 90% carries into a new season.
- **o, d**, opponent-adjusted offense and defense in EPA per play, garbage time left out (the full game when that is
  missing). After each game: residual = EPA/play − (league + offense + opponent's defense); offense and the opponent's
  defense each move by 0.04 × residual. Both reset to 0 at a new season, then o moves by 0.8 × (share of last year's PPA
  returning − 0.5) EPA per play.

Expected home margin = 3.0538 × (not neutral) + 0.9227 × (m_home − m_away) + 0.1124 × ((o − d)_home − (o − d)_away) × 100.
Home win chance = logistic(−0.04246 + 0.11428 × expected margin). The model's spread is minus the expected margin.

## How it was chosen
On the Research Lab's CollegeFootballData copy (2009-2024; private Actions cache, never committed, Constitution C1a):
- Settings searched in three rounds by margin error on 2012-2017 (round 1: k {.07,.09,.12}, carry {.9,.95},
  EPA step {.04,.07,.1}, EPA carry {.4,.6,.8}, returning {0,15,30}; rounds 2 and 3 widened past the edges the earlier
  round landed on). The last round's grid is the one in the script. Weights by least squares, win chance by logistic
  regression, both on 2012-2017 only.
- A shrink of the win chance toward 50% was offered (1.0 to 0.7), picked on 2018-2019 only: 1.0 (no shrink).
- Scored on 2018-2019 (1,546 games): log loss 0.504, accuracy 73.4%, margin error 12.72 points
  (the same ratings with scores only: 0.511).
- Scored once on 2021-2024 (3,136 games): log loss 0.5548, accuracy 70.8%, margin error 12.93 points
  (scores only: 0.5562, 69.9%). The closing line, never an input, missed by 12.19 points; the model's side
  beat the closing spread 48% of the time. A little too sure at the extremes (said 12%, won 17%; said 90%, won 87%).
- The sealed 2025 season is never read. Ratings go from 2024 straight to 2026, so a new season starts a year staler
  than models that saw 2025.

## This season so far (replay, before this file was written)
On the 98 graded 2026 games every CFB model on the Models page had picked, the frozen model's chance from the ratings
before each game (a replay; the others are their real locked numbers): log loss 0.578, accuracy 72.4%.
Kalshi 0.550 (74.5%), FBS Elo 0.563 (75.5%), CFB Rankings 0.574 (69.4%). It is behind all three.

## Live
`tools/cfb_model_live.py` (hourly in models_compare.yml) writes `live/devig/cfb.json` for games in the next 10 days from
the Lab's cache plus this season's refresh; `tools/models_compare.py` reads it as `devigcfb`, locks the last number
before each kickoff and grades it like every other model.

## What would change it
A v2 (new file), never an edit here. Making it, or any model, the app's CFB pick needs a CFB slot in the
champion/challenger rule (CHAMPION_CHALLENGER_V1_PREREG.md is locked; adding a slot is a new version).
