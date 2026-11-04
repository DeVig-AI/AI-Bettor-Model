# Champion / challenger V3: locked college picks (CBB and CFB)

Written 2026-11-04, the owner's decision, before any college pick under it has been made. Its SHA-256 is in
`FROZEN.sha256`; any change is a V4. V1 (`CHAMPION_CHALLENGER_V1_PREREG.md`) and V2 (`CHAMPION_CHALLENGER_V2_PREREG.md`)
stay as they are. Everything in V2 holds except what is listed below.

## Why

The owner asked that the app make locked picks for men's college basketball and college football the way it does for
the NFL and NBA: a side, a confidence tier, or a pass, locked before the game and graded after it.

Said plainly: neither model has a graded live record against Kalshi. DeVig CBB v1 has only its one-time check on
2024-2026 (ESPN results, no odds). DeVig CFB v1 is behind Kalshi, FBS Elo and CFB Rankings on the 98 graded 2026 games
its prereg lists. Both are labelled "not proven" everywhere, and nothing is bet.

## Changes from V2

1. **CBB.ml picks.** The champion (`devigcbb`, DeVig CBB v1) now makes locked picks with confidence tiers and PASS,
   replacing V2's "a chance only, no tiers, no PASS". Tiers, fixed here from the 17,242 graded games of CBB v1's
   2024-2026 check (confidence c = max(p, 1 - p)):
   - top 25%: c >= **0.8489** (picked right 92.5% of those games);
   - top 50%: c >= **0.7259**, the median (84.4%); this is the pick bar;
   - below 0.7259: PASS (the lean is still shown; 60.0% picked right on those games).
2. **CFB.ml champion is `devigcfb`** (DeVig CFB v1) from 2026-11-04T06:00:00Z, replacing `market`. This is the owner's
   decision, not an entry-test result; it is logged in `live/champions/DECISIONS.csv` as action `owner`. `market` is
   still locked beside it in every game, as for every slot. A registered CFB challenger's entry test is now against
   `devigcfb`.
3. **CFB.ml picks.** `devigcfb` makes locked picks the same way, with tiers fixed from its prereg's test seasons
   2021-2024 (the frozen settings, every FBS-vs-FBS final with a non-zero margin): top 50% = the median of c, top 25% =
   the 75th percentile, each with its hit rate on those games. They are computed once, in Actions where the Lab's CFB
   data cache is (Constitution C1a), by `tools/college_picks.py cfb-tiers`, into `cfb/cfb_v1_tiers.json`, and that file
   is never rewritten. The method is fixed here; the numbers come only from 2021-2024, never from 2025 (sealed) or
   2026. Until that file exists, no CFB pick is made.
4. **Lock time and price.** A pick is the champion's lock in `live/champions/MODEL_LOCKS.csv` (6 hours before the
   start, V2 item 2). Its price is Kalshi's moneyline and main spread from `live/models/latest.json` at the run that
   took the lock; if that run was missed, Kalshi's last pre-start price, and the pick says so.
5. **No back-fill.** Only locks logged at or after 2026-11-04T06:00:00Z (and, for CFB, after the tiers file was
   written) become picks.
6. **Written by** `tools/college_picks.py` (hourly in `models_compare.yml`, after `tools/champion_review.py`) into
   `cbb/lineboard_export.json` and `cfb/lineboard_export.json`. A pick is never changed after it is written, except
   its result (finals from `live/models/results.jsonl`). Record and units are at the locked price, before fee.

## Not changed

The models themselves (their preregs, `tools/cbb_model_live.py`, `tools/cfb_model_live.py` and their start files),
the entry test, the trial, the keep-or-remove rule, every other slot, DeVig's trackers and the Research Lab's rules.
