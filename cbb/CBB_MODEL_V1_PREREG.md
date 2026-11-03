# CBB_MODEL_V1 — pre-registration

Written 2026-11-03, before the model's first live number was locked. Locked in `FROZEN.sha256` with
`tools/cbb_model_live.py` and `cbb/cbb_v1_start.json`; any change to the model below becomes v2. Paper only: nothing
is bet, no account is used. Descriptive, not a claimed edge over Kalshi.

## What it is
DeVig's own men's college basketball (Division I) moneyline and spread model, tracked on the Models page as a
**challenger** under the key `devigcbb` ("DeVig CBB v1"). The app has no CBB pick, and this does not become one. It is
graded on the same games as Kalshi.

## Inputs (all known before tip-off; no prices, injuries, rosters or box scores)
Final scores from ESPN's public Division I scoreboard (`groups=50`), in date order. Each team (ESPN team id) carries
one number, **m**, a margin rating in points:
- After each final both teams move by k × (margin − (home court + m gap)), with the margin capped at ±40 points.
  k = 0.05 + 0.15 × e^(−games this season / 4), so a team's first games of a season move it more.
- A team seen for the first time starts at 0 if it is Division I and at −28 if not (a small-college opponent). In
  history "Division I" means 15 or more games on that season's Division I scoreboard; live it means ESPN's current
  Division I team list.
- Ratings carry fully into a new season (carry 1.0); only the early-season k resets.

Expected home margin = 3.5185 × (not neutral) + 0.9429 × (m_home − m_away).
Home win chance = logistic(0.01977 + 0.15703 × expected margin). The model's spread is minus the expected margin.

## How it was chosen
On ESPN's Division I finals for 2010-11 through 2025-26 (season Y = the one ending in spring Y; about 6,000 games a
season, no missing days; fetched with `cbb_model_live.py fetch`, never committed):
- 2011 warms the ratings up. 2020 and 2021 (the COVID seasons) feed the ratings and are scored nowhere.
- Settings searched in three rounds by margin error on 2012-2019, Division I vs Division I games (round 1: k
  {.06,.08,.1}, early k {.1,.2,.3}, early games {3,6}, carry {.6,.75,.9}, small-college start {−15,−22}, cap {20,30};
  rounds 2 and 3 widened past the edges the earlier round landed on). The last round's grid is the one in the script.
  The top two tied at 8.678 points (small-college start −28 and −35); the first listed, −28, was kept. Weights by
  least squares, win chance by logistic regression, both on 2012-2019 only (43,989 games).
- A shrink of the win chance toward 50% was offered (1.0 to 0.85), picked on 2022-2023 only: 1.0 (no shrink).
  2022-2023 (11,224 games): log loss 0.539, accuracy 71.8%, margin error 8.98 points.
- Scored once on 2024-2026 (17,242 games): log loss 0.5323, accuracy 72.2%, margin error 9.12 points
  (2024 0.541, 2025 0.528, 2026 0.528). A little too sure in the middle (said 65%, won 62%; said 75%, won 72%);
  about right at the ends (said 95%, won 95%). Past ESPN games carry no odds, so there is no closing-line comparison.
- The Research Lab Constitution has no CBB Part, so no CBB season is sealed. 2024-2026 were read only for this one
  score (and 2026 to set the start file below), never for choosing anything.

## Start file
Full carry means every rating depends on all seasons since 2011, so the repo keeps `cbb/cbb_v1_start.json`: every
team's m after the 2025-26 season (1,319 team ids, numbers only, no game rows), built by `cbb_model_live.py snapshot`.
A live run starts from it and replays this season's finals (from Nov 1) from ESPN, day by day.

## This season so far
At writing: 184 finals of 2026-27 (Nov 1-2); none graded on the Models page yet. On the 132 games Kalshi lists for
the next 6 days, the model and Kalshi pick the same favourite 92% of the time, 6 points of win chance apart on
average (a description, not a grade).

## Live
`tools/cbb_model_live.py` (hourly in models_compare.yml) writes `live/devig/cbb.json` for games in the next 6 days;
`tools/models_compare.py` reads it as `devigcbb` by ESPN event id, locks the last number before each tip-off and grades
it like every other model.

## What would change it
A v2 (new file), never an edit here. Making it, or any model, the app's CBB pick needs a CBB slot in the
champion/challenger rule (CHAMPION_CHALLENGER_V1_PREREG.md is locked; adding a slot is a new version).
