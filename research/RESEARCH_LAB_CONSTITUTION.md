# DeVig Research Lab -- Constitution v2

Version: **v2** · adopted 2026-10-19 · applies to: Part A (all sports), Part B (NFL) · replaces v1 (kept unchanged at
`research/constitution/RESEARCH_LAB_CONSTITUTION_v1.md`; what changed and why: section "Changes from v1" at the end)

This file sets the rules the Research Lab runs by. v1 was written and hash-locked (`FROZEN.sha256`, checked by
`tools/frozen_guard.py`) **before any lab data was downloaded**; v2 was locked before the 1999–2001 seasons it adds
were put in the lab's cache (before writing v2, only those seasons' line coverage was checked: a count of games with a
line, no results). The lab code checks the lock before every run, writes
this file's fingerprint into every ledger row, and refuses to run if the fingerprint does not match the lock.

**Expected result, stated up front:** the closing line is a very good forecast. The most likely outcome of this lab is
that **no candidate passes the sealed exam**, and quite possibly none passes the lab. That would be a real, useful
result, and it will be reported exactly like a success: every number, plainly.

---

## Part A -- Rules for every sport

### A1. Changing this Constitution
1. Any change, however small, makes a **new version** (v2, v3, ...). The version line above changes, a dated line goes
   into `FROZEN_CHANGES.md` naming this file, and `research/CONSTITUTION_LOG.md` gets one line saying what changed and
   why. Then `python3 tools/frozen_guard.py rehash research/RESEARCH_LAB_CONSTITUTION.md`.
2. A new version never rewrites the past: ledger rows keep the version and fingerprint they ran under.
3. Adding a new sport's Part (e.g. Part C, college football) is a version change. It may add rules for that sport only;
   it does not change Part A or another sport's Part except where it says so explicitly and explains why.
4. Rules may only be made stricter mid-season. Loosening a rule (a bigger exam budget, a weaker correction, a smaller
   fade bar) waits for the next season's version.

### A2. Roles (no AI anywhere in the loop)
- **Research lab** (`research/lab/`, workflow "Research Lab -- ..."): runs every registered candidate that has not run
  yet through the exploration gates, deterministically, inside GitHub Actions. It never sees sealed data.
- **Inspector General** (`research/lab/inspector.py`, workflow "Research Lab -- Inspector General"): judges the lab's
  numbers against these rules, applies the multiple-testing correction over the whole ledger, and is the only code
  that may download sealed data (the exam) or current-season data (the paper season).
- **The owner** decides when a sealed exam is spent (a manual run of the Inspector General workflow) and whether a
  promoted model ever appears anywhere outside `research/`.

### A3. Candidates
1. A candidate is one file `research/candidates/<id>.yaml`: model family, features, every parameter value, the
   candidate it builds on (`parent`, if any), and a one-line reason. **It is committed before it runs**: the lab only
   runs a candidate file that is committed, unmodified, and whose commit is older than the run.
2. One file = one fixed configuration. No search inside a candidate (no grid, no tuning on gate seasons). A variant is a
   new file with a new id, and it counts as a new attempt.
3. Once a candidate has run, its file is locked (added to `FROZEN.sha256` by the lab). It is never edited or deleted.
3a. **The queue.** Ideas may wait in `research/queue/`, one file each, named `NNN-<id>.yaml`; the number sets the
   order. A queued file is not yet an attempt: until the lab takes it, it may be edited, reordered or deleted at no
   cost. Before each run the lab moves the next queued files, in order, into `research/candidates/` and commits that
   move before anything runs; from then on rule 3 applies.
3b. **Batch size:** at most **18** candidates run in one lab run.
4. Coefficients a candidate fits are fit **once, on the training seasons only**, and then frozen. Team ratings and
   rolling averages update game by game using only games already finished before the game being forecast.
5. **No known betting angles.** A candidate may not be built on, or include as a feature, a known betting angle or
   situational trend: weather (temperature, wind, precipitation, dome/outdoor as a totals signal), low-total underdogs,
   key numbers / teasers, line-movement or steam, public betting percentages, primetime/lookahead/revenge spots,
   referee crews. Candidates must be forecasting ideas (how good is each team, how many points will be scored), not
   filters for spots the market is said to misprice.
6. Candidates may use only information available before kickoff. The closing line itself may be used as an input (it
   is known at kickoff), but a candidate's edge is always measured against that same line.

### A4. Pricing
- The closing line is treated as a fair 50/50 price for each side.
- Each pick costs that price plus Kalshi's taker fee, `fee = 0.07 · P · (1 − P)` per $1 contract. At P = 0.50 the fee is
  $0.0175, so a pick costs $0.5175 and pays $1.00 if it wins: **break-even win rate 51.75% (≈ 51.8%)**. Profit per
  contract: +$0.4825 on a win, −$0.5175 on a loss; ROI = profit ÷ cost.
- A push (result exactly on the line) is no bet: stake back, no fee. A game where the model equals the line is no pick.
- Pick ROI is **reported, never sufficient on its own** to pass anything.

### A5. The primary metric: edge beyond the line, in cover points
For every game `i` in a season range (all eligible games, not a filtered subset):
- `r_i` = result minus the closing line, in points (the cover margin; for totals, the over margin).
- `d_i` = model forecast minus the closing line (the model's disagreement); `s_i = sign(d_i)` (0 when equal).
- **Line-only baseline:** a model that knows only the line and one constant per market, the mean of `r` over the
  training seasons. Its side on every game is `s0 = sign(that mean)` (+1 if exactly 0).
- **Effect** `E = mean_i( s_i · r_i ) − mean_i( s0 · r_i )`: cover points per game gained by taking the model's side on
  every game, beyond always taking the line-only baseline's side. Unit: points ("pts"). Pushes count with `r_i = 0`.
- **Uncertainty:** game bootstrap, 10,000 resamples of games with replacement, fixed seed 20261019 (the same resample
  indices for every candidate). 95% CI = 2.5th and 97.5th percentiles. One-sided p-value `p = 1 − Φ(E / SE)`, where SE
  is the standard deviation of the bootstrap effects.
- Also reported, never used to pass: the regression slope of `r` on `d`, the pick record and ROI at Kalshi pricing
  (A4), the share of games with a pick, and effects split by the sport's rule eras.

### A6. Multiple testing
- Every attempt is one ledger row (`research/LEDGER.csv`): every run of every candidate, including variants, re-runs
  and runs that crashed. Rows are never deleted or edited (append-only; the frozen guard checks it).
- **Method: Holm–Bonferroni** over **every** ledger attempt of that sport, using each attempt's pooled one-sided p
  (a crashed attempt counts with p = 1). The bar is adjusted p < **0.05**.
- The correction is recomputed by the Inspector General at every review against the full ledger. A candidate that
  passed earlier can lose its lab pass as attempts accumulate; that is intended.

### A7. Lab pass (all four, judged by the Inspector General)
1. Pooled effect over all exploration gates > 0 **and** its Holm-adjusted p < 0.05 (A6);
2. Effect > 0 in **each** gate;
3. **Not fading:** last gate's effect ≥ **half** the first gate's effect;
4. The run is clean: candidate committed before running, Constitution fingerprint matches, no sealed data touched.
A failed candidate gets a short reason: `not_significant`, `gate_<n>` (not positive in that gate), `faded`, `error`.

### A8. The sealed exam
- The sealed season is never in the lab's data, its cache, or any file the lab can read. Only the Inspector General's
  workflow downloads it, at exam time, and it is not committed (only the exam's summary numbers are).
- **Budget: at most 3 sealed exams per research season** (per Constitution season, see the sport's Part). An exam is
  spent the moment it is recorded in `research/exam/EXAMS.csv`, which happens before the sealed data is downloaded,
  so a crash still spends it. **Every exam is final**: no retakes, no "fixed" re-runs.
- Only the **best current lab pass** may sit an exam: smallest Holm-adjusted p, then the larger pooled effect, then the
  earlier ledger row. An exam is started only by the owner (a manual run of the Inspector General workflow).
- The candidate runs exactly as in the lab (same file, coefficients fit on the training seasons only), with ratings
  carried forward through the sealed season game by game.
- **Exam pass:** sealed-season effect > 0 **and** one-sided p < 0.05 / 3 = **0.0167** (Bonferroni over the budget).
- An exam failure is permanent for that candidate (state `exam_fail`).

### A9. Promotion and the paper season
1. A candidate that passes the exam is **promoted**: named `Gauntlet-1`, `Gauntlet-2`, ... in order, and locked (its
   file and the lab code it ran with are fingerprinted in `FROZEN.sha256`).
2. It is paper-tracked **at real Kalshi prices before kickoff**, under `research/` only: every eligible game is logged
   (pick or no pick) before it starts, at the Kalshi ask for the chosen side plus the A4 fee, on Kalshi's main line
   (the line priced closest to 50¢). Logs are append-only. Nothing is bet.
3. It is described everywhere as **"Promoted, not proven"**. It is not shown in the public app unless the owner later
   decides so, in a separate change.
4. **Stop rule:** from the sport's mid-season point on (see its Part), once at least 40 picks are graded, the model is
   **stopped** if the upper end of the 90% Wilson interval of its win rate is below its average break-even price
   (clearly behind Kalshi). A stopped model stays logged and is never restarted in that season.

### A10. Reporting
- After every run: `research/results/<id>.json` per candidate, `research/LEDGER.csv`, `research/status.json` (the
  owner's /lab page, contract in `research/STATUS_SCHEMA.md`), `research/STATUS.md`, and `research/LESSONS.md`.
- `LESSONS.md` is generated, never hand-written, and labeled **EXPLORATORY**: for each candidate with a `parent`,
  whether the idea **helped** (beat its parent in every gate), **faded** (beat it in the first gate but not by at
  least half as much in the last), or had **no effect** (anything else). Lessons are not evidence of an edge.
- Every number is reported plainly, including the ones that make the lab look bad.

---

## Part B -- NFL

### B1. Data
- **Source:** nflverse, free and public: the schedule with final scores and closing lines
  (`nflverse/nfldata` `data/games.csv`: `spread_line` = closing expected home margin, `total_line` = closing total),
  and play-by-play (`nflverse-data` releases) aggregated to team-game and quarterback-game rows for features.
- Columns that encode known angles or prices other than the closing line (weather, roof/surface, moneylines and the
  juice on spreads/totals) are dropped from the lab's cache.
- **Eligible games:** regular season and playoffs, with final scores and a closing line for that market.
- **Cache:** downloaded seasons are stored in `research/data/nfl/` so runs stay light. The cache holds seasons
  **1999–2024 only** (nflverse's lines start in 1999); the lab refuses any row from 2025 or later.

### B2. Season split
| Use | Seasons | Notes |
|---|---|---|
| Training | 1999–2005 | the only seasons coefficients may be fit on; also sets the line-only baseline. Ratings start here (from average) |
| Gate 1 | 2006–2012 | exploration |
| Gate 2 | 2013–2018 | exploration |
| Gate 3 | 2019–2024 | exploration |
| Pooled | 2006–2024 | the pooled test of A7 |
| **Sealed** | **2025** | the exam (A8); not in the lab |

Rule-era splits (reported, never used to pass): **2006–2020**, **2021–2023** (17-game season from 2021), **2024**
(new kickoff rule from 2024).

Candidates that ran under v1 keep their v1 results (training 2006–15; gates 2016–18, 2019–21, 2022–24); their ledger
rows say so. They are not re-run under v2 unless re-registered under a new id, which is a new attempt.

### B3. Markets
- `spread`: forecast = expected home margin; `r = (home score − away score) − spread_line`.
- `total`: forecast = expected combined points; `r = (home score + away score) − total_line`.

### B4. Season, budget and mid-season
- Constitutions v1 and v2 cover the **2026 research season**: the sealed exam is the 2025 season, budget 3 exams shared by v1 and v2, ending
  when the 2026 NFL season's Super Bowl is played. A later version may move 2025 into the lab and seal 2026.
- Paper-season mid-season point for the stop rule: after week 9 of the regular season.
- Kalshi markets: NFL spread ladder ("<team> wins by over X points") and total ladder ("over X points"), main line =
  the rung priced closest to 50¢.

### B5. Seed candidates (registered separately in `research/candidates/`)
(a) a plain team-rating (Elo-style) spread model; (b) a pace + efficiency totals model; (c) ideas from open NFL models
(FiveThirtyEight's NFL Elo and nfelo), **each idea its own candidate** on top of the plain model: margin-of-victory
multiplier, rest/bye, travel distance, quarterback adjustment, home-field advantage that changes over time, playoff
boost, regression toward the market line; (d) a few small pre-declared variants. Each counts in the A6 correction.

---

## Part C -- reserved

Reserved for another sport (college football is planned). Until a later version adds it, Part A applies only to NFL.

---

## Changes from v1 (2026-10-19)

1. **Seasons (B1, B2):** the cache adds 1999–2001; training moves to 1999–2005 and the exploration gates to
   2006–12, 2013–18 and 2019–24 (pooled 2006–24, about 5,100 games instead of about 2,400). Why: twice the games make
   each test about 40% sharper, so a real edge is easier to tell from luck. What did not change: the Holm correction
   over every attempt, the 0.05 bar, "positive in every gate", the fade rule, the sealed 2025 exam and its budget.
   A1.4 says loosening waits a season; v2 loosens none of the rules A1.4 lists (budget, correction, fade bar). It is
   a change of data split, made **after** the 18 v1 results were seen, so: all 18 v1 attempts keep counting in the
   correction; no v1 candidate is re-run under v2; the new split applies only to candidates registered after v2 was
   locked; older seasons can also add edges that no longer exist, which the fade rule and the sealed exam check.
2. **Queue and batch size (A3.3a, A3.3b):** ideas can wait in `research/queue/` and run 18 per lab run.

