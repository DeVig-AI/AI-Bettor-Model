# PROPS_UNDER_OVER_V1 — pre-registration

Written 2026-11-03 (UTC), before any game in the test window has started. This file and
`props_under_over_v1.py` are locked in `FROZEN.sha256`; any change voids the test. Paper only: nothing is bet,
no key is used, and DeVig makes no picks from it.

## Why
On reused 2025-26 Kalshi prices (`stats/props_ladder.json`, already looked at, so not evidence), NBA and NHL player
prop Overs bought at the ask lost about 4¢ more per $1 contract than they won back, fee in, while Unders bought at
1 − bid lost about the fee. The app's ladder describes that. A dry run of this script on the live bots' first
2026-27 games (Oct 21 – Nov 3, 153 games, before the window) leaned the other way: D = −2.2¢, 95% −4.5¢ to +0.2¢,
so the gap may not hold. This test settles it on games nobody has seen yet.
It is not a test of beating Kalshi; a "beats Kalshi" claim would need its own live picks test.

## Rows
- Every rung the live props bots lock before a game: `nba/NBA_PROPS_MODEL_V2_LOG.sqlite3` and
  `nhl/NHL_PROPS_MODEL_V1_LOG.sqlite3`, table `locked_rows` (bid `k_bid`, ask `k_ask` at the lock, 6 h to 30 min
  before the game), joined to `locked_games` for the start time and to `grades` by ticker for Kalshi's settlement.
- Games whose `kickoff_utc` is on or after 2026-11-04 00:00 UTC and before 2027-02-01 00:00 UTC.
- Kept: result `yes` or `no` (scalar / void settlements dropped), 0 < bid ≤ ask < 1, ask − bid ≤ 0.06.
  Every stat the bots lock is in. No other filter, no model input.

## Measure
Per rung, with fee f(p) = 0.07·p·(1 − p) and y = 1 if it settled `yes`:
- Over cost  = ask + f(ask);         Over loss  = Over cost − y
- Under cost = (1 − bid) + f(1 − bid); Under loss = Under cost − (1 − y)
- d = Over loss − Under loss (cents per $1 contract the Over lost beyond the Under on the same rung).

**Primary:** D = mean of d over all kept rungs of both sports. 95% interval from a bootstrap that resamples whole
games (sport + game_key), 10,000 draws, seed 20261103, percentile interval.

## Decision (one time, fixed)
- Fewer than 300 games in the window → **TOO FEW GAMES**, no decision.
- Whole interval above 0 → **UNDERS LOST LESS**.
- Whole interval below 0 → **OVERS LOST LESS**.
- Otherwise → **NO CLEAR GAP**.

Reported only, no decision: D for each sport; mean Over loss and Under loss with the same bootstrap. Even an Under
loss interval wholly below 0 is reported as a number only; it is not an edge claim.

## When and how
`props_under_over_v1.py` runs daily from `.github/workflows/props_under_over.yml`. Before 2027-02-03 00:00 UTC
it prints only how many games and rungs are in the window, never results. On or after that date it evaluates once,
writes `PROPS_UNDER_OVER_V1_RESULT.json` and `.md`, and never evaluates again. No early look, no early stop, no
change to the window.

The app's ladder note (`stats/props_ladder.json`, rebuilt daily) includes these games as they are graded; that
display cannot change anything above.

## What the result changes in the app
- UNDERS LOST LESS / OVERS LOST LESS: the ladder may cite this test's D and window next to the past-data note.
- NO CLEAR GAP / TOO FEW GAMES: the ladder note says the side gap did not hold up and stops calling one side
  cheaper.
In every case the app keeps saying a safer line is peace of mind for a parlay, not a bargain.
