# NFL Handicapper v2: live paper test (pre-registration)

Written 2026-10-29, after `model_v2.json` was fit and before v2 made any decision on a real game. Paper only: no
account, no key, and no order is ever sent.

## Why v2
v1 failed its back-test (`BACKTEST_RESULTS.md`). Prices drifted its way by only 0.2–0.5¢, and buying at the ask plus
Kalshi's fee cost about 2.2¢. Most of its disagreements were underdog sides, because it doesn't know who the
quarterback is. v2 changes two things, both decided before looking at any v2 number on 2025–26 games:

1. **QB ratings** (`qb.py`). Each QB gets a rating from his own starts (538's per-game VALUE), and each team is rated
   with its expected starter. That's its last starter, or a backup-level rating in the late line when the final
   injury report lists the starter Out or Doubtful. Groups were picked by v1's procedure, inside 2011–2022 only:
   - early line: base + qb + matchup
   - late line: base + qb + injuries
   - validation look at 2023–24, MAE against the margin: early 10.25 (v1 10.36), late 10.11 (v1 10.19). The closing
     spread's MAE is 9.84.
2. **Limit orders instead of paying the ask.** The order rests at our side's yes bid. It counts as filled only if
   a later hourly candle traded, or offered, *below* that price. Equal doesn't count: others could be ahead of us
   in the queue.

v2 is not fit on, chosen with or judged on any 2025–26 game the v1 back-test used.

## Decisions (`live.py`, every 3 hours, `.github/workflows/nfl_handicapper.yml`)
- Games kicking off from 2026-10-29 00:00 UTC through the 2026 season's Super Bowl, regular season and playoffs.
- **Early line** decides once in the window 6 days to 4 days before kickoff. **Late line** decides once in the window
  1 day to 2 hours before kickoff, using the latest injury reports. The decision is made at the first run inside
  the window where Kalshi has prices.
- **Market chance**: the average of the home mid and 1 − the away mid. Usable only if both bid-ask gaps are ≤ 0.05.
- **Edge** = our home chance − market chance. If the market is usable and |edge| ≥ 0.04, rest one paper contract of
  our side at its yes bid, good until 40 minutes before kickoff.
- Every decision, bet or not, is appended to `live/decisions.csv` with its reasons. Grades go to
  `live/grades.csv`. Both files are append-only.

## Grading
- **Close**: the market chance from the last hourly candle ending 40 minutes or more before kickoff.
- **Filled orders**: CLV = our side's close − limit − maker fee, maker fee = 0.0175 · P · (1 − P). That's Kalshi's
  maker rate where one is charged; if a market charges none, this is conservative.
- **Also recorded**: buying at the ask with the taker fee 0.07 · P · (1 − P); unfilled orders' would-be CLV; results.

## The verdict (read once, after the season's last game; one per line)
**Pass**: at least 30 filled orders, mean CLV of the filled orders > 0, and t = mean / (sd / √n) ≥ 2.0.

Running totals in `live/LIVE_RESULTS.md` are for watching only. A pass means its own next step: a frozen v2 copy,
then a decision by the owner on real stakes. If the result is a failure, it's written up as one.
