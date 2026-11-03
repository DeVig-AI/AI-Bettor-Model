# CHAMPION_CHALLENGER_V2 — pre-registration

Written 2026-11-03, the owner's decision, before any CBB challenger has been registered or checked. Its SHA-256 is
locked in `FROZEN.sha256`; any change voids it and needs a new version. It replaces `CHAMPION_CHALLENGER_V1_PREREG.md`
(kept unchanged) as the rule `tools/champion_review.py` runs. Nothing is bet.

## Why
The owner asked that DeVig's own men's college basketball model, DeVig CBB v1 (`cbb/CBB_MODEL_V1_PREREG.md`), be the
app's CBB number, and that a Research Lab model then be built to challenge it. CBB v1's prereg says that takes a CBB
slot in this rule, added in a new version. This is that version.

Said plainly: CBB v1 has no graded live record yet. Its only score is the one-time check on 2024-2026 in its prereg
(log loss 0.532, 72.2% picked right, 17,242 games), on ESPN results with no odds, so it has never been measured against
Kalshi's prices. Making it the champion is the owner's choice, not a result.

## What stays the same
Everything in V1, word for word, except the four changes below: the terms, the challenger file, the entry test (300
graded shared games, the log loss interval below 0, profit no worse), the confidence tiers, the trial, the keep or
remove decision, and the records.

## Changes from V1
1. **A new slot, `CBB.ml`** (who wins a men's college basketball game). Champion: `devigcbb` (DeVig CBB v1), from
   2026-11-03. The app shows its win chance on every CBB game it has a number for, labelled DeVig, the same way it shows
   DeVig's NHL model: a chance for each team, not a locked pick (no confidence tiers, no PASS), because V1 fixes tiers
   only for a challenger, at entry.
2. **Reference time for CBB:** DeVig has no CBB tracker, so it is 6 hours before the start, as for college football.
   Every model in the slot, the champion included, is locked at its number in `live/models/latest.json` at the first
   hourly run at or after that time and before the start.
3. **Slots the app can show a challenger in:** `NBA.ml` and `CBB.ml`. A challenger file for `CBB.ml` is committed only
   once the app can show a CBB trial (the challenger's chance in place of DeVig CBB's, with the "Trial" label), so a
   challenger never enters a slot the app cannot show.
4. **Season end for CBB** (how long a removed challenger waits): April 15.

## What this does not change
CBB v1 itself (its prereg, `tools/cbb_model_live.py` and its start file stay locked as they are), DeVig's trackers, the
Research Lab's tests and stop rules, and every other slot. The Research Lab Constitution has no CBB Part yet; a Lab CBB
model needs one (a new Constitution version) before it can be a challenger here. Nothing is back-filled.
