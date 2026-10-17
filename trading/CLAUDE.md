# Trading system: lookup table for Claude

The build plan is HANDOFF.md (owner's PDF, v2). If anything here disagrees, HANDOFF wins.
This folder is separate from the sports-betting code in the rest of the repo; don't touch that.

## The one goal
Prove a signal (or a reasoned combination) beats buy-and-hold SPY after costs on data it has
never seen. Nothing else gets built until that happens.

## Rules that never bend
- Paper trading only. Never spend money, never touch real money. Those need the owner.
- Pass bar is `config/pass_bar.toml`. Never edit it after seeing results.
- Vault (2021+) runs once per candidate, only via `Chamber.vault_test`, only after validation passed.
- Count every test (logs/chamber_registry.jsonl). Max 25 combinations, each with a written reason.
- Missing/bad data: skip that stock-date and log it. Never fill or guess.
- Point-in-time only: fundamentals by filing date, membership as of each date.
- Constitution limits live in code (`trader/risk_officer.py`, `config/constitution.toml`), never in AI judgment.
- Report bad results plainly. Show how a good result could be wrong.
- Log every decision you make that isn't covered by HANDOFF in DECISIONS.md, one line why.

## Folder map
| path | what |
|---|---|
| config/constitution.toml | hard limits; locked by hash (trader/amend.py) |
| config/pass_bar.toml | costs, splits, periods, pass rules, hunt limits |
| trader/risk_officer.py | enforces the constitution; most-tested file |
| trader/executor.py | Alpaca paper orders; accepts only ApprovedPlan |
| trader/logbook.py | append-only hash-chained decision log |
| trader/signals.py | momentum, value, insider, low-vol |
| trader/portfolio.py | top 20%, equal weight, stock/sector caps |
| trader/data/ | FMP client, SEC insider sets, membership, auditor, table builder |
| trader/chamber/ | Zipline engine, metrics (deflated Sharpe), registry + vault lock, Chamber |
| scripts/ | download, probe_fmp, chamber, owner, install_autostart, pre-commit |
| data/reference/ | S&P 500 historical membership (fja05680/sp500, MIT) |
| data/cache/, logs/, state/, reports/ | local only, gitignored |

## Commands
Local setup: `setup.ps1` (Windows) or `setup.sh` (Mac/Linux), Python 3.12, venv in `.venv/`.
Everything goes through `trader.bat` / `trader.sh` -> scripts/cli.py:
```
trader selftest [--all]                   # fast tests; --all adds slow chamber tests (~5 min)
trader probe                              # once, after FMP key is in .env
trader download [--status]                # daily batch: FMP budget, SEC, rebuild tables, audit
trader chamber test momentum | test-all | vault NAME | count
trader owner status | stop | restart
trader amend status | propose | approve | approve-initial
trader autostart [--yes]
.venv/bin/ruff check .
```

## Build order (HANDOFF section 5)
1 data + auditor (built) 2 chamber (built) 3 single signals (waiting on data)
4 combinations (<=25, reasoned) 5 vault 6 decide. Hunt deadline: 3 months from first real run.

## Working cheaply
Cheaper model for routine code and reading logs; strongest only for chamber/risk-officer design
or debugging. Fresh session per unrelated task. Only MCP server: context7 (.mcp.json).
