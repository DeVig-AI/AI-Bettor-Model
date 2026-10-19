# Changes to locked test files

Every change to a file listed in `FROZEN.sha256`, and every intended change to a recorded result, gets one dated
line here **in the same commit**, naming the file and why. The frozen guard (`.github/workflows/frozen_guard.yml`)
blocks the change otherwise. The preregs allow pipeline bug fixes "logged with a date"; this is that log.
New tests are not changes: add their files with `python3 tools/frozen_guard.py rehash <file>` and no log line.

Format: `- YYYY-MM-DD <file>: <what changed and why>`

- 2026-10-18 FROZEN.sha256: lock list created (145 files, 10 results databases). Nothing changed.
- 2026-10-18 kalshi_games_v1.py: MLB event tickers carry the start time after the date (26OCT172000TBCLE), so no MLB game could be read and the first Kalshi MLB lock found 0 games. The time digits are now skipped before the team codes. NFL and NBA tickers have no time and read the same as before.
- 2026-10-19 nba/kalshi_props_history_v1.py: first collection run wrote 0 markets — settled events are listed under /events but Kalshi had moved their markets to /historical/markets, so each event came back empty and was still marked done. Now falls back to /historical/markets?event_ticker=, never marks an event done when no market was written, and saves raw samples. The empty progress files were deleted (no price had been recorded or seen). Prereg and back-test script unchanged.
- 2026-10-19 nba/kalshi_props_history_v1.py: second run found the markets on /historical/markets but wrote 0: Kalshi's historical copies of the "N+ <stat>" markets say strike_type "structured" (player in custom_strike), not "greater", so the filter dropped them. A structured market now counts only when its title reads "N+" and floor_strike = N − 0.5 — the same Over N−0.5 market the prereg describes. No price had been recorded or seen. Prereg and back-test script unchanged.
- 2026-10-19 nba/kalshi_props_history_v1.py: speed only — markets read from /historical/markets now go straight to the historical candle endpoint (the batch and live endpoints always return nothing for them, which doubled the calls), and up to 16 threads share a 15 requests/s limit (was 6 threads, 12/s). Same candles, same snapshot rule, same output.
