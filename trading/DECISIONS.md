# Decisions log

One line each: what, and why. Newest at the bottom. Dates are when decided.

## 2026-10-17: setup
- Audit: no earlier trading/"chamber" code exists in this repo (only sports-betting code), so built fresh.
- Put the trading system in `trading/` so it can't disturb the repo's automated sports jobs.
- CLAUDE.md lives in `trading/` (the project root for this system), not the repo root, for the same reason.
- Config files are TOML (Python's built-in reader) so no YAML dependency is needed.
- Constitution limits are also capped in code (pydantic bounds): editing the file can tighten but never loosen past HANDOFF values.
- Constitution is locked by hash; any edit needs propose -> 24h -> owner phrase; loosening refused in a drawdown; unknown drawdown state counts as a drawdown.
- Owner must run `python -m trader.amend approve-initial` once; until then nothing can load the constitution for live trading (fail safe).
- Stop-loss set at 15% below entry (HANDOFF requires one but gives no number; matched to the kill-switch size).
- Time limit: a position must be re-approved within 45 days; the monthly rebalance re-approves, so anything not re-selected is sold.
- Kill switch blocks all orders, even stop-loss sells ("stop everything" read literally); only the owner restarts.
- Bad data or broker error blocks all orders, even exits (HANDOFF: "no trades"). Overdue positions get reported as alerts (watchdog not built yet).
- Two strategies naming different sectors for the same stock: the stock is dropped (can't enforce a sector cap on unknown sector).
- A stock with no sector is skipped (missing data rule), both live and in backtests.
- Clipped weight goes to cash, never redistributed (redistributing would add risk the strategy didn't ask for).
- Decision log is append-only JSONL with a hash chain, so an edited or deleted line is detectable.

## 2026-10-17: the 30% per-strategy limit (owner may want to overrule)
- Live: enforced as written, so one strategy alone can only use 30% of the account; 70% stays cash.
- Chamber: a signal is tested as a fully-invested sleeve (5% stock and 25% sector caps applied). Testing at 30% invested would compare a mostly-cash portfolio to SPY and say nothing about the signal.
- Consequence: live returns with a single strategy will be about 30% of the backtest's. The owner should know this before judging live results.

## 2026-10-17: chamber
- The daily-loss pause and kill switch are NOT simulated in backtests (a 15% kill would freeze every strategy, and SPY, in 2008 forever); each report shows how often they would have fired.
- Stop-loss IS simulated in backtests (it changes results and is a hard rule).
- Backtest engine: Zipline Reloaded 3.1.1 installed and passed a smoke test, so it's used (HANDOFF tools order). Backtrader not needed.
- Zipline fills at the next session's close, not the next open. Kept: no look-ahead, slightly different from live.
- Orders are sized at the decision close but fill a day later; if that leaves the portfolio over 100% invested, it sells back the next day (and pays the cost). No borrowed money in backtests.
- Backtests use $10M capital (realistic size); live uses notional orders so $100 works.
- Benchmarks: SPY bought once (one 0.15% cost) and held; equal-weight S&P 500 rebalanced monthly at the same costs, no limits.
- data_start 2001-01-01: the membership file's author says the first ~5 years may be missing names. Train starts 2002-01-01 (12 months of history needed).
- Market periods fixed before results: 2008 crash = 2007-10-01..2009-03-31, bull = 2009-04-01..2019-12-31, 2020 crash = 2020-02-01..2020-04-30, 2022 bear = calendar 2022.
- Sharpe uses a 0% risk-free rate for both strategy and SPY (fair comparison; no extra data source).
- Deflated Sharpe is computed on ACTIVE returns (strategy minus SPY) so it tests the edge, not "stocks went up". N = distinct candidates ever tested (benchmarks and synthetic tests excluded). Variance across trials = larger of observed spread and sampling variance. Pass = 0.95.
- Pre-vault gate = pass rules 1, 2, 5 on validation, plus rule 3 on the periods seen so far. Rule 4 (0.30% costs) is reported, not required, as HANDOFF says.
- Walk-forward inside training: the four signals have no fitted settings, so each calendar year is reported as its own out-of-sample fold (year-by-year vs SPY).
- "Vault opened" is logged before the vault run, so a crash still uses the one try.
- Hunt deadline counts 3 months from the first real chamber run, since testing can't start until data is downloaded.
- Ties in a signal are broken by ticker name, so runs repeat exactly.
- Top 20% means 20% of index members with a price that day. Insider buying usually scores fewer stocks than that, so it holds fewer names (rest in cash, since the 5% stock cap stops it concentrating).
- Sectors come from today's FMP profiles (no free historical sector data). Listed as a weakness in every report.
- Value: E/P uses trailing 4 quarters of net income; B/M uses latest equity; both use market cap = price x shares from the latest filing, carried forward with the price-adjustment factor so a split after the filing doesn't distort it. Negative book equity = no B/M score (skipped).
- Fundamentals become usable the day after their filing date.
- Insider buying counts officers and directors only; 10% owners who aren't officers/directors are excluded (HANDOFF says officers or directors).

## 2026-10-17: data
- FMP free tier, per FMP's own pages and third parties: 250 requests/day, 500MB/30 days, and only ~5 years of history. If confirmed by scripts/probe_fmp.py, free FMP cannot give 2001+ or 2008. Needs owner decision (EODHD ~$20-40 one month).
- FMP download order: delisted list, adjusted prices, profiles, raw prices, income, balance. ~5 requests x ~1,050 tickers = ~5,300 requests = ~22 days at 240/day.
- Daily budget set to 240 of 250 to leave a margin.
- Every FMP reply is cached, including "not in your plan" errors, so nothing is requested twice.
- Insider data: SEC's official quarterly Form 3/4/5 data sets (one zip per quarter, 2006 onward) instead of edgartools per-filing requests: ~80 downloads instead of tens of thousands, and one less dependency. Insider signal history therefore starts 2006.
- Insider dates use the FILING date (when the public knew), not the trade date.
- "edgar-traps" could not be found; its checks (Form 4 filed under the wrong company) are written into the auditor instead.
- Auditor excludes: price spikes over 50% that reverse by 40%+ the next day; gaps of more than 5 trading days; index members with no prices or prices starting late (ticker reuse). Big moves that don't reverse are kept (real crashes are real).
- Survivorship check goes RED (data unfit) if under 50% of departed names have prices; warns under 90%.
- Bankrupt names appear in the membership file under their later tickers (e.g. LEHMQ); whether FMP has them is checked by the probe.
- The cloud session that built this could not reach FMP, SEC or Alpaca (network policy), so no real data was downloaded or tested here.

## 2026-10-17: tools (TOOLS_HANDOFF)
- Installed and smoke-tested: duckdb 1.5.6, pyarrow, pandera 0.34.1, pandas-market-calendars 5.5.0, pydantic 2.14.1, pytest 9.1.1, alpaca-py 0.44.0, zipline-reloaded 3.1.1, alphalens-reloaded 0.4.6. All MIT/Apache, all updated within the last 16 months.
- alphalens-reloaded: installed (starter set) but not wired in yet; used at step 3 for an information-coefficient check alongside the chamber.
- Results stats: neither pyfolio-reloaded (last release 2025-06) nor quantstats used for the pass bar; our own ~60 lines in chamber/metrics.py, tested, so a library update can't move the bar. quantstats (active, Apache) picked for the later nicer report; not installed now.
- edgartools: rejected for now (see insider data above). Real, MIT, active; keep as backup.
- Backtrader: rejected (GPL, last release 2023, not needed since Zipline installed).
- Context7 MCP (@upstash/context7-mcp 4.4.2, MIT): added in trading/.mcp.json, needs Node/npx on the desktop.
- Lint + test hook: scripts/pre-commit (ruff + fast tests, only when trading/ files are staged). Install with scripts/install_hooks.sh.
- ccusage (npm, MIT, 20.0.34): exists; owner runs `npx ccusage` to see token spend. Not a project dependency.
- rtk, claude-token-optimizer, claude-context-optimizer, code-review-graph: names exist on PyPI/npm but not verified to be the tools described; optional, skipped.
- Later-phase tools (VectorBT, PyPortfolioOpt, APScheduler, Streamlit, OpenRouter, LiteLLM): not installed, per phasing.
- Reference backtester rebuilding membership via the Internet Archive: couldn't find it by search. Not needed: fja05680/sp500 gives membership; delisted prices are the real gap.

## 2026-10-17: running on the owner's computer
- Python 3.12 required: bcolz-zipline (needed by Zipline) has no ready-made Windows/Mac package for 3.13, and numpy 2.5 needs 3.12+.
- Checked by a clean install on 3.12 using only ready-made packages (no compiler): all 121 tests pass.
- Pinned empyrical-reloaded 0.5.12: without it pip picked 0.5.9, which crashes on numpy 2. peewee 3.17.3 pinned with it; installs without a compiler.
- Private environment in trading/.venv; `trader.bat` / `trader.sh` wrap every command so nothing needs activating.
- .gitattributes forces LF line endings so a Windows checkout can't change the constitution's hash and lock trading out.
- Decision log always written with LF so its hash chain is the same on every OS.
- Not tested on real Windows or Mac hardware from here; setup.ps1 is untested PowerShell.

## 2026-10-17: DATA_HANDOFF v2 (free stack)
- Live machinery (daily run, heartbeat, watchdog, alerts, HTML report) NOT built, per DATA_HANDOFF section 0.
- Sources, one job each: WIKI (to 2018-03-27), Alpaca (2016+), Tiingo (only names still missing, post-2018 gaps first), Stooq (backup), SEC (CIKs, sectors, fundamentals, filing history, insider). FMP only with `--fmp`.
- Merge priority when sources overlap: WIKI > Tiingo > Alpaca > FMP > Stooq ("most complete adjustment history": WIKI has explicit split and dividend columns; Stooq has no raw prices).
- Adjusted prices are spliced by daily returns, not levels: each source anchors adjustments at a different date, so pasting levels would fake a jump at every seam.
- Overlap check: raw closes compared directly when both sources have them; otherwise adjusted closes compared after removing the 20-day rolling median ratio (so different anchors aren't "conflicts"). Over 1% is logged.
- A source switch with no overlapping day (unknown return across the seam): logged, return set to 0, and 7 days either side excluded.
- Alpaca: history to the last month-end only, so every page is cacheable and never re-downloaded; backtests don't need the last few days.
- Tiingo budget kept under the reported limits: 480 symbols/month, 45/hour, 950/day. Tiingo's free ticker list is checked first so the monthly symbol cap isn't spent on names it doesn't have. The download sleeps through the hourly cap (up to 8 hours) unless `--no-wait`.
- Stooq needs an API key from a captcha page since 2026 (found when checking); supported via STOOQ_API_KEY or a manually downloaded bulk zip. Backup only.
- Delisting rule: bankrupt (8-K item 1.03) and unexplained = -100%. Acquired (8-K item 2.01 or merger proxy/tender filings) with a deal price in data/reference/delisting_outcomes.csv = deal price.
- DEVIATION: acquired with NO deal price on file = last traded price, flagged "deal price not checked", instead of -100%. Reason: we can't parse deal prices out of filings automatically, a cash-deal target trades at about the deal price, and booking real acquisitions at -100% would wreck the results for a reason that has nothing to do with the signal. Every such case is listed; fill the CSV to replace it.
- "Prices stop" vs "stock stopped": if the last price falls within 10 days of a frozen source's end (WIKI, 2018-03-27), it's a coverage gap, not a delisting. Only stocks whose prices stop while in the index (or within 35 days of leaving) get the delisting rule.
- The final-price row is dated the next trading session and tagged source=delisting_rule; a -100% is stored as $0.001 (Zipline can't store 0).
- Each report shows how many delisting events hit a held stock and their total effect on the portfolio.
- Sectors: SEC SIC codes mapped to the 12 Fama-French industries (a published, fixed mapping), replacing FMP profiles. Still today's code, not historical.
- In backtests, stocks with no known sector go into one "Unknown" bucket under the 25% cap instead of being skipped: skipping them would drop mostly old delisted names, i.e. survivorship bias. Live trading still drops unknown-sector stocks.
- Ticker -> CIK: SEC's current ticker list, then tickers seen on Form 4 filings (2006+), then data/reference/ticker_cik_overrides.csv. Older departed names often have no CIK: no sector, no fundamentals, and "unexplained" (-100%) if they delisted while held. Counted in the audit.
- Fundamentals: SEC companyfacts, 10-K/10-K/A only, flows 350-380 days, ordered tag synonyms (no mixing tags within one period), value stamped with first filing date, usable the day after. A restated value is kept as its own row and used only from its own filing date; the original is never overwritten. Same value re-reported later (prior-year comparative) is dropped.
- Value signal now uses annual 10-K data (latest annual earnings, latest book equity, cover-page share count) instead of 4 quarters; skipped if the latest annual report is over 18 months old.
- Value runs from 2010-01-01, insider from 2006-07-01; their SPY and equal-weight benchmarks start on the same date. Reports say plainly when a signal has no 2008 test.
- Rule 3 (market periods) counts only periods a run covers at least 80% of, and needs more than zero tested; untested periods are named in the report. Before the vault, the 2022 bear can't be tested.
- BUG FIXED: market periods were judged inside one split, so the 2009-2019 bull (which spans train and validation) was never tested. Runs are now joined across splits before judging periods.
- Coverage gate: share of S&P 500 member-days (2001 onward) with a usable price; excluded days count as missing. Over 5% missing = RED and the report asks the owner about the paid fallback.
- Wikipedia cross-check: changes more than 7 days off from the membership file are listed in data/WIKIPEDIA_MISMATCHES.txt. Neither side is picked.
- Kill switch (owner deciding): constitution unchanged. Reports show A (sell and stop), B (fire only if 15% behind SPY, relative drawdown), C (no new orders, keep positions; engine rerun frozen from the trigger day). In backtests nobody restarts after A or C. The pass bar is judged with none of them.
- Probe speed test runs on a synthetic universe the same size as the real one (the real data isn't downloaded when the probe runs); every real chamber run also records its own time.
- Checked against the web, not tested: Tiingo 500 symbols/month and 50/hour agree across sources; 1,000/day comes from one older article. Alpaca free history from 2016 with SIP bars confirmed in Alpaca's docs. WIKI's current export status could not be confirmed; the probe checks it, and a Kaggle copy works via WIKI_PRICES_FILE.
- Added lxml (needed by pandas to read the Wikipedia table).
