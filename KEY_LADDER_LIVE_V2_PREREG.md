# KEY_LADDER_LIVE_V2_PREREG — key-number ladder live test, priced on Kalshi

**Written:** 2026-10-18, before any V2 snapshot. The sha256 of this file is hard-coded in `nfl_key_ladder_live_v2.py`.

## Why a V2
V1 (`KEY_LADDER_LIVE_V1_PREREG.md`) pulled DraftKings, Hard Rock and Pinnacle ladders from The Odds API, a paid key. The project is moving to free, keyless data only, so V1 ends on 2026-10-18 with its results kept as they are (`KEY_LADDER_LIVE_V1.sqlite3`, see `NFL LIVE TESTS V1 CLOSED.md`). V1 bets are never mixed into V2.

## What stays exactly the same as V1
- The frozen fair table `nfl_key_ladder_fair_table_v1.json` (sha256 `5c32c251adb90ec54cce647fc5987d4a5a6b6506de143ae48b2ef58c4fc2eea2`).
- Cover chance, push share, Wilson range, EV = (1 − p_push) × [p × (dec − 1) − (1 − p)], EV_low, the 14-point window, the 200-game minimum.
- First-snapshot rule, one official bet per game (highest-EV HIGH/MEDIUM rung, HIGH preferred), 1 unit, push returns the stake. ESPN final scores.
- Schedule: Thursday 22:30 UTC (next 6 h) and Sunday 13:30 UTC (next 36 h); Tuesday grade-only; manual runs allowed.

## What changes
- **Ladder:** Kalshi's public NFL spread market (series `KXNFLSPREAD`, "<team> wins by over X points"), read without an account. Each rung gives two prices:
  - YES = that team at −X, at the ask;
  - NO = the other team at +X, at 1 − the bid.
  - Both include Kalshi's taker fee estimate 0.07 × P × (1 − P), as American odds.
- **Only half-point strikes** are priced. On Kalshi a margin equal to a whole-number strike settles NO rather than pushing, which the fair table does not model.
- **Main line:** the Kalshi rung whose bid/ask midpoint is closest to 50%.
- **Pinnacle agreement is dropped** (no free sharp price). HIGH = EV_low ≥ 0. MEDIUM = EV ≥ +0.03 (and not HIGH). LEAN = +0.01 ≤ EV < +0.03 (information only).

## Evaluation (one look only)
- **When:** at the first of (a) 250 graded official V2 bets, or (b) 2028-02-15.
- **Primary:** ROI of official bets. PASS = 10,000-resample bootstrap 95% CI lower bound > 0, with at least 100 bets.
- **Secondary (descriptive):** ROI by tier; by whether the rung crosses 3/7/10; buying vs selling points; YES vs NO side; calibration.

## Honest limits
- Kalshi's ladder is thinner than a sportsbook's and its far rungs can be stale; the logged price is what the bot saw, not a fill.
- The table conditions only on the main spread.
- Power is low: a few official bets per week.

## What will NOT happen
- No change to the table, tiers, thresholds, price rule, schedule or criteria after V2 data is seen. Pipeline bug fixes are allowed but must be logged with a date.
- No bets are placed by any script.
