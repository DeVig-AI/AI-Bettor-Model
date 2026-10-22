# Does NFL Model 1.0 get better with injuries? -- pre-registration (v1)

Written and committed **before the comparison was computed**. The owner's rule: implement injuries if they make
the model better than what runs today, scrap them if not. The injury study v1 (`results_v1.md`) showed injuries
help a simple form-and-rest model; this test asks the question that decides: do they help **NFL Model 1.0** itself?

Checked before writing (not a comparison): Model 1.0's 63 features rebuilt from nflverse with its own locked builder
(`nfl/NFL_AI_MODEL_1_0_bundle.zip`, `live_winner_63_exact_v53.py`) give 2,227 games for 2018-2025, its exact training
row count, and refitting its pipeline on them reproduces the frozen model's probabilities to within 3e-11.

## Models
- **Model 1.0:** its 63 features, its pipeline (median imputation, scaling, logistic regression C = 0.2).
- **1.0 + injuries:** the same plus `d_qb`, `d_out`, `d_q` exactly as defined in `NFL_INJURY_STUDY_V1_PREREG.md`
  (home minus away: last game's QB unavailable; regulars unavailable; regulars questionable), computed by that study's
  locked code with its season range widened to 2017-2025. Same pipeline.
- Games: the 2,227 above (games without injury features get 0, i.e. no difference, as week 1 always does).

## Test
- **Walk-forward:** for each season 2020-2025, both models are fit on 2018 up to the season before and forecast that
  season. Reported per season and pooled: log loss, Brier, accuracy.
- **Better** only if all three: pooled log loss lower; the 95% interval of the pooled log-loss difference (paired
  game bootstrap, 10,000, seed 20261019) entirely below 0; lower log loss in at least 4 of the 6 seasons.
- **If better:** build "NFL Model 2.0" (Model 1.0 + injuries, fit on 2018-2025) and paper-track it live next to
  Model 1.0, which keeps running unchanged so its pre-registered test isn't broken mid-season.
  **If not:** injuries are dropped from the game model; the studies stay on record.

Output: `research/injuries/model1_plus_injuries_v1_results.json` / `.md`.
