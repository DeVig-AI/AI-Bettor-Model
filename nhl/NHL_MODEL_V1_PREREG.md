# NHL_MODEL_V1 — pre-registration

Written 2026-11-03, before the model's first live number was locked. Locked in `FROZEN.sha256` with
`tools/nhl_model_live.py`; any change to the model below becomes v2. Paper only: nothing is bet, no account is used.
Descriptive, not a claimed edge over Kalshi.

## What it is
DeVig's own NHL moneyline model: the app's NHL win chance. The Research Lab's NHL search leader (s-b7ed7469,
`tools/lab_live.py`) keeps running beside it on the Models page as a challenger, graded on the same games.

## Inputs (all known before puck drop; no prices, injuries or starting goalies)
- **elo**: (home Elo − away Elo + 45) / 400 × ln 10. Elo starts at 1500, K = 2, goal-margin multiplier
  ln(|margin| + 1) × 2.2 / (|Elo gap| × 0.001 + 2.2), update = K × multiplier × (result − expected) × 4.
  85% of each team's distance from 1500 carries into a new season.
- **b2b**: home played the previous day (1/0) minus away played the previous day.
- **sh**: shot share (shots for / shots for + against), exponentially weighted at 5% per game, pulled 40% of the way
  back to 0.5 at each new season; home minus away, × 10.

Home win chance = logistic(0.031 + 0.581·elo − 0.163·b2b + 0.526·sh).

## How it was chosen
On the Lab's NHL archive (2011-12 to 2020-21; read locally, never committed):
- Elo settings picked from K ∈ {2,3,4}, home ∈ {45,60,75}, carry ∈ {0.85,0.95} by log loss on 2012-13 to 2016-17.
- Weights fit by logistic regression on 2012-13 to 2016-17, then scored once on 2017-18 to 2020-21 (4,868 games):
  log loss 0.6716 (Elo only 0.6746; always the home rate 0.6901). The closing line, never an input, scored 0.6713.
- A starting-goalie input added little (0.6714) and the starter is not confirmed early enough, so it is left out.
- The sealed 2021-22 season is never read.

## Live
Ratings start from 1500 in 2022-23 and run through every final since, from the NHL's public API (api.nhle.com: game
results from /game, per-game shots from /team/summary). Graded on 2023-24 onward (the frozen model, each chance from the
ratings before that game), before this file was written: 4,171 regular-season games, log loss 0.6673, always the home
rate 0.6894, accuracy 58.3%; the 10-point bands within 2.5 points of what happened.

`tools/nhl_model_live.py` writes `live/devig/nhl.json` (games in the next 3 days); `tools/models_compare.py` reads it
as the "devig" NHL model, locks the last number before each start and grades it like every other model.

## What would change it
A v2 (new file), never an edit here. Replacing it with another model as the app's NHL pick needs an NHL slot in the
champion/challenger rule (CHAMPION_CHALLENGER_V1_PREREG.md is locked; adding a slot is a new version).
