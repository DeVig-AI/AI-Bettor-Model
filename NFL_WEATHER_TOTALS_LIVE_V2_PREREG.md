# NFL_WEATHER_TOTALS_LIVE_V2_PREREG — the weather/totals live test, priced on Kalshi

**Written:** 2026-10-18, before any V2 snapshot. The sha256 of this file is hard-coded in `nfl_weather_totals_live_v2.py`.

## Why a V2
V1 (`NFL WEATHER TOTALS LIVE V1 PREREG.md`) priced every pick at Pinnacle through The Odds API, a paid key. The project is moving to free, keyless data only, so V1 ends on 2026-10-18 with its results kept as they are (`WEATHER_TOTALS_LIVE_V1.sqlite3`, see `NFL LIVE TESTS V1 CLOSED.md`). V1 picks are never mixed into V2.

## What stays exactly the same as V1
- The frozen model `nfl_weather_totals_model_v1.json` as refit under V1 Amendment 1 (sha256 `588945bd0e37bc265f23776d7f015901e33f3c5827ff99900f09f0f62c14f8a5`, the value in V1's `meta.model_sha`), never refit. The V2 script stops if the file changes.
- Features, the 3.5 h snapshot window, the first-snapshot rule, ESPN venue/roof and final scores, the open-meteo forecast at the kickoff hour.
- Pick rule: higher-EV side if EV ≥ +0.02, else PASS; every game logged, including passes and skips with a reason. A push returns the stake.

## What changes
- **Price:** Kalshi's public NFL total market (series `KXNFLTOTAL`, "over X points scored"), read without an account.
  - The rung used is the one whose bid/ask midpoint is closest to 50%.
  - Over price = the YES ask; under price = 1 − the YES bid. Both include Kalshi's taker fee estimate 0.07 × P × (1 − P), turned into American odds.
  - `q_over` = the de-vigged over probability from those two prices; `total_line` = that rung's line.
- **Skips:** games where Kalshi has no two-sided total rung are logged as SKIP ("no Kalshi total").

## Evaluation (one look only)
- **When:** at the first of (a) 300 graded V2 picks, or (b) 2028-02-15.
- **Primary:** ROI of V2 picks at the logged Kalshi price. PASS requires a 10,000-resample bootstrap 95% CI lower bound > 0 and at least 100 picks.
- **Secondary (descriptive):** outdoor vs indoor; Over vs Under; wind ≥ 15; the spread between Kalshi's line and the rung's 50% point.

## Honest limits
- The model was trained on sportsbook closing totals; Kalshi's middle rung is not the same thing as a book's main total, and its price includes the bid/ask spread and fee.
- Thin Kalshi books can make the middle rung's price stale. The logged price is what the bot saw, not a fill.
- Power is low, as in V1. A FAIL at 300 picks means "not confirmed," not "disproved."

## What will NOT happen
- No refit, threshold, feature or price-rule change after V2 picks begin. Pipeline bug fixes are allowed but must be logged with a date.
- No bets are placed.
