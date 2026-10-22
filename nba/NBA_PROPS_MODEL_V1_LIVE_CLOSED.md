# NBA_PROPS_MODEL_V1_LIVE — closed 2026-10-22

Closed by the decision rule of NBA_PROPS_KALSHI_BACKTEST_V2 (fixed before it ran): v2 was more right than v1 on
25,131 past Kalshi props (log loss 0.5687 vs 0.5997, 95% interval of the difference −0.0361 to −0.0261), so v2
replaces v1. See `nba/props_history/backtest_v2_results.md`.

Record at closing: 0 paper picks as of 2026-10-22 02:00 UTC (14 games locked, no pick). From opening night (2026-10-20) every candidate was blocked by v1's pre-registered
30-day stale rule, because the current season's box scores held only opening night. `nba/NBA_PROPS_MODEL_V1_LOG.sqlite3`
is kept unchanged. The live paper test continues as NBA_PROPS_MODEL_V2_LIVE (`nba/NBA_PROPS_MODEL_V2_LIVE_PREREG.md`).
