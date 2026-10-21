# NHL props model -- design study v1 (box scores only, no prices)

Walk-forward over 2016-2024 test seasons; players with >= 40 earlier games; mean log loss over goals 0.5/1.5, assists 0.5/1.5, points 0.5/1.5/2.5 (lower is better).

| spans | shrink | method | mean log loss |
|---|---|---|---|
| 40/160 | 10 | ratio | 0.30331 |
| 40/160 | 3 | ratio | 0.30341 |
| 40/160 | 10 | poisson | 0.3035 |
| 40/160 | 3 | poisson | 0.30367 |
| 20/80 | 10 | ratio | 0.30678 |
| 20/80 | 3 | ratio | 0.307 |
| 20/80 | 10 | poisson | 0.30973 |
| 20/80 | 3 | poisson | 0.31019 |
| 10/40 | 10 | ratio | 0.31197 |
| 10/40 | 3 | ratio | 0.31239 |
| 5/20 | 10 | ratio | 0.3179 |
| 5/20 | 3 | ratio | 0.31873 |
| 10/40 | 10 | poisson | 0.3233 |
| 10/40 | 3 | poisson | 0.32435 |
| 5/20 | 10 | poisson | 0.35026 |
| 5/20 | 3 | poisson | 0.35238 |

**Chosen:** spans 40/160, shrink 3, method poisson.

Chosen model by line (calibration: mean chance vs how often it happened):

| line | log loss | mean chance | hit rate | rows |
|---|---|---|---|---|
| goals>0.5 | 0.40389 | 0.1514 | 0.1526 | 386150 |
| goals>1.5 | 0.08099 | 0.0191 | 0.0172 | 386150 |
| assists>0.5 | 0.52787 | 0.2392 | 0.2413 | 387528 |
| assists>1.5 | 0.15718 | 0.0425 | 0.0409 | 387528 |
| points>0.5 | 0.60338 | 0.3465 | 0.3489 | 387608 |
| points>1.5 | 0.26891 | 0.0898 | 0.0887 | 387608 |
| points>2.5 | 0.08345 | 0.0202 | 0.0188 | 387608 |

## How this choice was reached (recorded before any price was seen)
- First run (look-backs 5/20, 10/40, 20/80): the longest, 20/80 with ratio tables (0.30700), was best.
- Because the best sat at the edge of the options, 40/160 was added and the study rerun (this table). 40/160 is again
  the longest and best; the gains were shrinking (0.3124 → 0.3070 → 0.3034). The study was not extended further: a
  known limit, so an even longer look-back might do marginally better on box scores.
- Within 0.0005 of the best (ratio, shrink 10: 0.30331), the pre-set tie rule picks the simpler method: Poisson,
  shrink 3 (0.30367).
