# NFL Handicapper v1: Kalshi price-move back-test (pre-registration)

Written 2026-10-28, after the model was fit (`nfl/handicapper/model.json`) and before any handicapper line was
compared with a Kalshi price. Nothing is bet.

## The question
Does our own line know where Kalshi's price is going? A handicapper doesn't need to beat the closing price. It
needs to get a better price earlier in the week than the price at kickoff (positive closing line value, CLV).

## The model (fixed by `build_model.py`, fit on 2011–2022 only)
- Ratings: alpha 0.06, carry 0.5, chosen from `ratings.GRID` by leave-one-season-out MAE inside 2011–2022.
- **Early line**: ratings as of 6 days before kickoff. Groups kept by forward selection: base only (home field, net
  EPA, points rating). Matchup, schedule and luck did not lower the cross-validated error.
- **Late line**: ratings as of 1 day before kickoff, plus injuries (QB out −4.1 points, other starters about −0.8 per
  full-time player). Fit 2014–2022.
- Win chance = Phi(line / sigma), sigma 13.31 (early) and 13.12 (late).
- Validation look, 2023–24 against the closing spread: our MAE 10.36 / 10.19 vs the closing spread's 9.84. As
  expected, the market is more accurate than our line at kickoff.

## Data
`kalshi_history.py`: every settled Kalshi NFL moneyline event (KXNFLGAME) matched to an nflverse game of 2025 on,
with each team's yes bid and yes ask from the last hourly candle closing at least 6 days (`d6`), 1 day (`d1`) and
40 minutes (`close`) before kickoff.

**Market chance** at a moment: the average of the home team's mid and 1 − the away team's mid. It is usable only if
both teams have a bid and an ask no more than 0.05 apart.

## Tests (each passes or fails on its own; nothing else counts as a pass)
| Test | Our line | Bought at | Graded at |
|---|---|---|---|
| A | early | `d6` ask | `close` |
| B | late  | `d1` ask | `close` |

For every game with usable market chances at both moments:
1. edge = our chance − market chance at the buy moment, for the home team.
2. If |edge| ≥ 0.04, buy one contract of the side we like (home if edge > 0, else away) at that side's yes ask.
3. CLV = that side's market chance at `close` − ask − fee, where fee = 0.07 · ask · (1 − ask) (Kalshi's fee).

**Pass**: mean CLV > 0 with t = mean / (sd / √n) ≥ 2.0, and at least 30 bets.

## Reported but not counted toward the pass
- The correlation between edge and the price move (market chance at `close` − at the buy moment), all usable games.
- Results: win rate and ROI at settlement (too few games to mean much).
- The same numbers by season.

## What happens next
- **If a test passes**, that line goes to a live paper test with picks locked before the game, its own pre-registration
  and a frozen copy of this model.
- **If both fail**, we write that up as a no-edge result. The model is not tuned on these games to make it pass.
  Any new version is fit without them and is judged only on games played after it is frozen.
