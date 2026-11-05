# Champion / challenger V4: a soccer slot

Written 2026-11-05, the owner's decision, before any soccer number has been locked. Its SHA-256 is in
`FROZEN.sha256`; any change is a V5. V1, V2 and V3 (`CHAMPION_CHALLENGER_V1_PREREG.md`, `..._V2_...`, `..._V3_...`)
stay as they are. Everything in V3 holds except what is listed below.

## Why

The owner asked that the app show DeVig's own soccer chances, and that the Research Lab's soccer work (Constitution
v16, Part F) have a slot to challenge one day. DeVig Soccer v1 (`soccer/SOCCER_MODEL_V1_PREREG.md`) is that model.

Said plainly: DeVig Soccer v1 has no graded live record. Its only score is the one-time check on 2023-2025 in its
prereg (three-way log loss 0.983, the likeliest outcome happened 52.7% of the time, 5,255 matches), on ESPN results
with no prices, so it has never been measured against Kalshi. Making it the champion is the owner's choice, not a
result. It is labelled "new, not proven" everywhere it is shown, and nothing is bet.

## Changes from V3

1. **A new slot, `SOCCER.ml`**: the 90-minute result (home win, draw or away win) of a league match of the Premier
   League, LaLiga, Serie A, the Bundesliga or Ligue 1. Champion: `devigsoccer` (DeVig Soccer v1), from
   2026-11-05. The app shows its three chances on every such match it has a number for, labelled DeVig and "new, not
   proven", beside Kalshi's: chances only, no locked pick, no confidence tiers, no PASS.
2. **Measure for this slot.** A win chance for one side cannot score a draw, so `SOCCER.ml` uses the three-way log
   loss: the log of the chance a model gave to what happened, each of the three chances clipped to [0.01, 0.99] and
   rescaled to add to 1. "Picked right" = the likeliest of the three happened. Kalshi's three chances are its
   vig-free middle prices (`fair` in `live/soccer_lines.json`). Profit is not part of this slot's tests until a
   version fixes how a three-way pick is priced; the entry test for a soccer challenger is items 1 and 2 of V1's
   entry (300 shared graded matches, the whole bootstrap interval of the log loss difference below 0), with this
   measure.
3. **Lock and grade.** `tools/soccer_track.py` (hourly in `models_compare.yml`, after `tools/soccer_model_live.py`)
   replaces each upcoming match's lock at every run and never touches it after kick-off, so the lock is the last
   hourly number before kick-off (no 6-hour reference time: the model's number moves only on finals, and Kalshi's
   price is the one at the same run). Locks and results are in `live/devig/soccer_locks.json`, the totals in
   `live/devig/soccer_record.json`. A match with no result 5 days after kick-off is left ungraded. Only locks taken at
   or after this file's merge are graded: nothing is back-filled.
4. **Where it runs.** This slot is kept by `tools/soccer_track.py`, not by `tools/champion_review.py`, until a soccer
   challenger exists; `live/champions.json` does not list it before then. A challenger file for `SOCCER.ml` needs a
   Lab soccer model that has passed Part F's exam and an app that can show a soccer trial, and then a V5 that moves
   this slot into `champion_review.py`.
5. **Season end for soccer** (how long a removed challenger waits): June 1.

## Not changed

DeVig Soccer v1 itself (its prereg, `tools/soccer_model_live.py` and its start file stay locked as they are), every
other slot, the college picks of V3, DeVig's trackers, and the Research Lab's rules (Part F included: no 2026-27
soccer match is stored for this slot beyond the locks and results above, which are the slot's own record, not Lab
data, and no Lab candidate is scored on them).
