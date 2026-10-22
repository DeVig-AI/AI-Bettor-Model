# NFL Model 2.0 -- live paper test (pre-registration)

Written and committed before Model 2.0's first graded game. Locked with its model file and code (`FROZEN.sha256`).

## Why it exists
The owner's rule: implement injuries if they make the model better than what runs today. The pre-registered test
(`research/injuries/NFL_MODEL1_PLUS_INJURIES_V1_PREREG.md`, results in `model1_plus_injuries_v1_results.md`) found
Model 1.0 + injuries **better** walk-forward 2020-2025: log loss 0.6402 -> 0.6348 (95% interval of the change
-0.0101 to -0.0007), better in 4 of 6 seasons; accuracy 64.6% -> 64.4% (about the same). It passed, narrowly.

## The model
- Model 1.0's 63 features + 3 injury features (home minus away: last game's QB unavailable; regulars unavailable;
  regulars questionable, as defined in `research/injuries/NFL_INJURY_STUDY_V1_PREREG.md`), Model 1.0's pipeline,
  fit once on 2018-2025 (2,227 games). File: `nfl/model2/NFL_MODEL_2_0.joblib`, sha256 `6f30e64466e236b1cef80ffa249af586505f0b0471e7d7477e45ac295d5a7672`.
- Features come from the same locked code that was tested (Model 1.0's builder, the injury study's build()). Every
  run checks that Model 1.0's forecast from these features equals what Model 1.0's tracker locked; if they differ by
  more than 1e-6 the run writes no Model 2.0 numbers.

## How it runs
- **Model 1.0 keeps running unchanged** as the app's NFL pick and keeps its own pre-registered test. Model 2.0 runs
  beside it; it is shown on the Models page as "DeVig 2.0", not used for the app's picks.
- A workflow forecasts the coming week's games every 3 hours and right after Sunday inactives, with the injury
  reports and rosters as nflverse has them then. The **last forecast before kickoff** is the graded one (the Models
  page locks it at the start of the game; every forecast is also appended to `nfl/model2/MODEL2_LIVE_LOG.jsonl`).

## Grading and the decision
- Graded on the Models page like every model (favourite won, profit at Kalshi's price, beat the closing line).
- **Decision at the end of the 2026 NFL season (after the Super Bowl):** over every game both Model 1.0 and
  Model 2.0 forecast, if Model 2.0's log loss is lower, Model 2.0 replaces Model 1.0 as the app's NFL game model for
  2027 (refit with 2026 added, a new version); if not, injuries are dropped from the game model. The numbers are
  reported either way.
