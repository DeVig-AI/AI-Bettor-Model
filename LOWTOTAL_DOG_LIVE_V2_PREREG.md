# LOWTOTAL_DOG_LIVE_V2_PREREG — live test of the low-total underdog rule (NFL), Kalshi total

**Written:** 2026-10-18, before any V2 pick. The sha256 of this file is listed by `nfl/export_lineboard_nfl_v7.py`.

## Why a V2
V1 (`LOWTOTAL_DOG_LIVE_V1_PREREG.md`) took its total from Pinnacle via the weather test's Odds API snapshot, a paid key. That source ends on 2026-10-18, so V1 ends with its results kept (see `NFL LIVE TESTS V1 CLOSED.md`). V1 bets are never mixed into V2.

## Rule (unchanged except the total's source)
- **Spread and price:** the NFL tracker's latest locked market line for the game (the line the app shows), and the dog spread price from that lock. The tracker now locks Kalshi prices.
- **Total:** the total line from the NFL_WEATHER_TOTALS_LIVE_V2 official snapshot (Kalshi's middle total rung, taken ≤ 3.5 h before kickoff), whatever that game's weather pick is. Games with no official V2 total are skipped.
- **Bet:** the underdog when it gets +3 to +7.5 points (inclusive) and the total is ≤ 41. 1 unit at the locked dog spread price. A push returns the stake.
- Before the official total exists, the app may show a preview from the V2 preview total. Previews are never counted.

## Grading
Final scores from the NFL tracker's grader (the same `outcome` the app uses).

## Evaluation (one look only)
- **When:** at the first of (a) 150 graded V2 bets, or (b) 2028-02-15.
- **PASS** = ROI bootstrap 95% CI lower bound > 0 (10,000 resamples), with at least 60 bets.
- A FAIL at this size means "not confirmed", not "disproved".

## What will NOT happen
No change to the rule, thresholds or criteria after data is seen. Pipeline bug fixes are logged with a date. No bets are placed by any script.
