# CHAMPION_CHALLENGER_V1 — pre-registration

Written 2026-10-30, the owner's decision, before any challenger has been checked under it. Its SHA-256 is locked in
`FROZEN.sha256`; any change voids it and needs a new version. Research Lab Constitution v13 (A9.3) points here.
Nothing is bet.

## Why
The owner wants the app to show whichever model really does best. The rule: a challenger that beats the model the app
uses (the **champion**) on past games **replaces it in the app right away**; the old model keeps locking and grading
its own picks beside it; after a fixed number of games the challenger is **kept** if it was better throughout, or
**removed** and the old model put back. "Better" means more accurate win chances **and** no worse profit at Kalshi
prices. NFL Model 2.0 (`nfl/app_model.json`, 2026-10-22) was this, done once by hand; this makes it a standing rule.

Said plainly, up front: no challenger qualifies today. Every Research Lab candidate has failed (0 of 25), and the
same-game samples since 2026-10-19 are far below the 300 games entry needs. The most likely result for a long time
is that the champions do not change. That is a real result and is reported like any other.

## Terms
- **Slot**: one sport and market, e.g. `NBA.ml` (who wins). Each slot has one champion at a time. This version has
  **winner slots only** (`NFL.ml`, `NBA.ml`, `MLB.ml`, `CFB.ml`): the accuracy test needs a win chance, and spread or
  total models give a line instead. Spread and total slots need a later version with their own measure.
- **Champion**: the model whose pick the app shows for that slot, set in `live/champions.json`. `devig` means
  DeVig's own tracker locks (NBA / MLB Model C, NFL Model 1.0); `devig2` NFL Model 2.0; `market` means DeVig makes
  no pick there and Kalshi's line stands.
- **Challenger**: a model registered in `live/champions/challengers/<id>.yaml` (fields below). The file must be
  committed, unmodified, in a commit older than the run that first checks it (as Lab candidates, A3.1).
- **Reference time** of a game: DeVig's own tracker lock for it (NFL Model 1.0, NBA / MLB Model C) when there is
  one; otherwise (college football) 6 hours before the start.
- **Lock**: a model's number for a game, taken before the game starts. A DeVig tracker (`devig`) is locked at its own
  tracker lock (`models_compare.py` reads it). Every other model in the slot, champion or challenger (`devig2`,
  outside models, `market` = Kalshi's no-vig win chance), is locked at its current number
  (`live/models/latest.json`) at the first hourly run at or after the reference time and before the start: so up to
  about an hour after DeVig's lock. A model with no number at that run has no lock for that game. When DeVig's
  tracker locks a game again (the NBA tracker re-locks each morning for the next 3 days, and the app shows its last
  lock), every model is locked again against the new lock; the locks compared are the ones taken against DeVig's
  **last** lock before the start, so both models are measured at the same moment. Every lock is appended to
  `live/champions/MODEL_LOCKS.csv` (append-only, `FROZEN.sha256`), with the DeVig lock time it was taken against.
- **Price**: Kalshi's last pre-start price for the picked side as `models_compare.py` records it (ask, fee
  included); its no-vig home win chance from the two asks for the market baseline.
- **Graded game**: a game with a final score in `live/models/results.jsonl`, a lock from both models, both win
  chances strictly between 0 and 1, not a tie. Chances are clipped to [0.01, 0.99] for log loss.
- **Profit**: 1 unit on the side each model's win chance favours (above 0.5; exactly 0.5 = no bet), at the price
  above, as `grade_game` in `tools/models_compare.py` computes it. A game without a price counts for accuracy but not
  profit.

## Challenger file
`id`, `slot`, `source` (a model key in `tools/models_compare.py`'s `MODELS`), `license` (must allow use: MIT, BSD,
Apache, public domain, or this project; "none stated" can never enter), `reason` (one line), `registered`
(date). Nothing else: no parameters to tune.

## 1. Entry (the challenger replaces the champion in the app)
Checked every hourly run for each registered challenger in a slot with no trial running, on the **graded games
logged since the challenger was registered** (its own locks from `MODEL_LOCKS.csv`; never games before it):
1. At least **300** graded games shared with the champion.
2. **More accurate:** challenger minus champion log loss per game, 95% game bootstrap (10,000 draws, seed 20261030):
   the whole interval below 0.
3. **No worse profit:** the challenger's total profit ≥ the champion's on the same priced games.
4. Where the champion is `market`, the comparison is against Kalshi's no-vig win chance (accuracy) and the Kalshi
   favourite (profit) instead.
5. Slots the app can show a challenger in, in this version: **NBA.ml**. Other slots are checked and logged the same
   way ("eligible, waiting for app support") but nothing in the app changes until a later version adds them. NFL.ml
   is under Model 2.0's own review (its prereg and `nfl/app_model.json`, review 2026-11-04) and is not checked until
   that review is recorded.

If all hold, the challenger enters: `live/champions.json` gets a trial (challenger, start = the run time, previous
champion, target), and the app's pick for that slot comes from the challenger for every game starting after that
moment, with a **"Trial"** label. The champion keeps locking and grading exactly as before.

**Confidence tiers** for a challenger's app picks are fixed at entry from its 300+ entry games: top 25% = the 75th
percentile of max(p, 1−p), top 50% = the median; each tier's hit rate on those games is the accuracy the app shows.
They never change during the trial. A pick below the top-50% cutoff is a PASS, as for DeVig's own models.

## 2. Trial
- Length: the first **150** graded games after entry (NBA, NHL, MLB); **64** for the NFL.
- The 150 (64) games are split by start time into **4 equal quarters** (the last quarter takes the remainder).

## 3. Kept or removed (decided once, when the trial reaches its length)
- **Kept** (promoted: it becomes the champion, the label goes away) only if the challenger's log loss is lower than
  the champion's **in every one of the 4 quarters**, **and** its total profit over the trial is ≥ the champion's.
- Otherwise **removed**: the previous champion is put back for games starting after the decision; the challenger is
  retired for the rest of that season (it keeps being logged, never re-enters that season).
- A kept challenger's old champion keeps being locked and graded for the rest of the season, so the comparison
  stays visible.

## 4. Records
Every entry, keep and removal is appended to `live/champions/DECISIONS.csv` (append-only) with the numbers it used:
games, log losses, the bootstrap interval, profits, per-quarter log losses. `live/champions.json` is the current
state only. The app shows both models' records on the trial games.

## 5. What this does not change
DeVig's trackers, their lock and grading code, the Research Lab's tests and stop rules, and Model 2.0's own review.
Nothing is back-filled: a challenger's record starts at its registration.
