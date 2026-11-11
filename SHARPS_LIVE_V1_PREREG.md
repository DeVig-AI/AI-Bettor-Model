# SHARPS_LIVE_V1_PREREG: does following Polymarket's top sports earners beat Kalshi's price?

**Written:** 2026-11-11, before any game was locked. Owner's decision ("let's move on with the market sharp buys"), after the mockup of a "Where the sharps are" card. Nothing is shown in the app while this test runs.

## Why
Polymarket's wallets are public: anyone can see its top sports earners and their bets. The owner asked whether that helps. Being top of last month's list doesn't show a bettor still has an edge, some top wallets bet both sides (market making, hedging), and Polymarket's price isn't Kalshi's. This test checks the one thing that matters for a Kalshi bettor: does their side win more than Kalshi's price says.

## Data (fixed now; tools/sharps_log.py, run twice an hour in game_lines.yml)
- **Games:** every game the app matches to a Polymarket event in live/poly_lines.json (NBA, NHL, NFL, CFB, MLB), from 2026-11-12 on. Moneyline only.
- **The top 20:** Polymarket's sports leaderboard, this month by profit (`/v2/leaderboard?category=SPORTS&timePeriod=MONTH&orderBy=PNL`), the last snapshot taken before the game's start.
- **Their money:** each of the 20 wallets' trades on the game's moneyline market made before the start: buys minus sells, in dollars, per team.
- **Counted:** a trader counts for a team when they have at least $1,000 more on it than on the other team; otherwise not at all.
- **Sharp side:** the team with more counted dollars. No counted trader (or a tie) = no bet.
- **Price:** Kalshi's moneyline for that team from the app's Models file (`live/models/latest.json`), the last read seen before the start, as recorded in the lock row. No Kalshi price = no bet.
- **Locked once** into live/sharps/LOCKS.csv (append-only) after the start. A game whose trades can't all be read waits for the next run; one still unlocked 72 hours after the start is logged as `missed` and not counted.

## Grading
1 unit on the sharp side at the locked Kalshi price (American odds). The winner from live/models/results.jsonl (the Models page's finals, matched by sport, date and teams through live/models/picks.jsonl). Ties and games with no final are left out.

## Evaluation (one look only)
- **When:** on or after 2026-12-15, if there are at least 150 bets; otherwise at the first of 150 bets or 2027-02-15.
- **PASS** = ROI's bootstrap 95% CI lower bound > 0 (10,000 resamples of bets).
- **Reported, not judged:** ROI by sport; the "heads" side (more counted traders) in place of the money side; the games where the sharp side and DeVig's own pick (the app's pick at the time) agree.
- A FAIL means "not shown to help", not "proven useless".

## What happens after
PASS: the owner decides whether the app shows the "Where the sharps are" card, labeled as Polymarket money and never as a DeVig pick. FAIL: the logger is switched off and nothing is shown.

## What will NOT happen
No change to the top-20 list, the $1,000 rule, the price, the grading or the pass rule after data is seen. Pipeline bug fixes are logged in FROZEN_CHANGES.md with a date. No bets are placed by any script.
