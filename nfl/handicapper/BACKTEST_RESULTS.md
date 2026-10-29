# NFL Handicapper v1: Kalshi price-move back-test results

Rules: `HANDICAPPER_V1_BACKTEST_PREREG.md`. CLV and ROI are per $1 contract, fee included. Nothing is bet.

## Test A: early line, bought at `d6`, graded at `close`: **FAIL**

- Games with usable prices: 380; bets (|edge| >= 0.04): 236
- Mean CLV: -0.0170 per contract (t = -5.65)
- Edge vs price move correlation: +0.064 (t = 1.25)
- Results (not counted): won 35.0%, ROI -8.3%

| Season | Games | Bets | Mean CLV | t | Corr | Won | ROI |
|---|---|---|---|---|---|---|---|
| 2025 | 273 | 159 | -0.0166 | -4.21 | +0.046 | 32.9% | -12.8% |
| 2026 | 107 | 77 | -0.0177 | -4.09 | +0.105 | 39.5% | +0.6% |

## Test B: late line, bought at `d1`, graded at `close`: **FAIL**

- Games with usable prices: 386; bets (|edge| >= 0.04): 230
- Mean CLV: -0.0184 per contract (t = -15.17)
- Edge vs price move correlation: +0.111 (t = 2.20)
- Results (not counted): won 35.1%, ROI -6.5%

| Season | Games | Bets | Mean CLV | t | Corr | Won | ROI |
|---|---|---|---|---|---|---|---|
| 2025 | 279 | 153 | -0.0179 | -10.66 | +0.109 | 33.6% | -9.0% |
| 2026 | 107 | 77 | -0.0193 | -13.77 | +0.091 | 38.2% | -1.8% |

## Why (exploratory, written after the results; not part of the test)
| Test | Price move toward our side | Half the bid-ask gap | Kalshi fee | Our side was the underdog |
|---|---|---|---|---|
| A | +0.52¢ (t 1.73) | 0.73¢ | 1.48¢ | 85% |
| B | +0.20¢ (t 1.69) | 0.57¢ | 1.48¢ | 87% |

The price did drift our way slightly, but by about a quarter of what crossing the spread and the fee cost. Most
disagreements come from the model rating favorites lower than the market does. That is mostly the model missing
something (for example, quarterback quality), not the market being wrong.
