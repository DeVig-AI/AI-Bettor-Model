# DeVig Research Lab -- Constitution v4

Version: **v4** · adopted 2026-10-19 · applies to: Part A (all sports), Part B (NFL), Part C (college football) ·
replaces v3 (kept unchanged at `research/constitution/RESEARCH_LAB_CONSTITUTION_v3.md`; v2 and v1 alongside it; what
changed: sections "Changes from v1", "Changes from v2" and "Changes from v3" at the end)

This file sets the rules the Research Lab runs by. v1 was written and hash-locked (`FROZEN.sha256`, checked by
`tools/frozen_guard.py`) **before any lab data was downloaded**; v2 was locked before the 1999–2001 seasons it adds
were put in the lab's cache (before writing v2, only those seasons' line coverage was checked: a count of games with a
line, no results). v4 (the NFL search → confirm loop) was written after that cache was built; no model was scored on
any season while it was written. The lab code checks the lock before every run, writes
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
3c. **The search (NFL only, Part B).** Besides hand-written candidates, the lab finds NFL candidates itself, in rounds
   (at most one round a week), deterministically, with no AI:
   - **Menu:** `research/search/MENU.yaml` lists the model families and the values each setting may take. Round 1
     scores every combination. Each later round adds the neighbours (one setting moved one step along its ladder in the
     menu) of the 10 best configurations per market, plus blends of the best performers: every pair of the 6 best,
     equal-weight blends of the best 3 and best 5, and a best-5 blend with non-negative weights summing to 1 fit on the
     training and search seasons. Nothing already scored is scored again.
   - **Search seasons only:** the search code is given data only up to the last search season (B2); it never sees the
     confirmation seasons or the sealed season. Search scores are the A5 effect on the search seasons with
     t = effect ÷ (standard deviation ÷ √games). Every configuration scored is logged in `research/search/`.
   - **Shortlist:** after each round, at most **2 per market** become candidates, best search t first, and only if
     t ≥ **2.0**, the effect is positive in **each** search sub-period, and the model's disagreements with the line
     correlate at most **0.95** with any candidate the search sent before or in the same round. A shortlisted model is
     written to `research/candidates/` with its search numbers, committed, and confirmed like any candidate.
   - Search scores are **exploratory, not attempts**: only the confirmation of a shortlisted candidate is an attempt
     (A6). The search may choose settings and blend weights using the training and search seasons; never later ones.
4. Coefficients a candidate fits are fit **once, on the training seasons only** (blend weights found by the search: on
   the training and search seasons), and then frozen. Team ratings and
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
  earlier ledger row. NFL: the Inspector General's workflow starts the exam automatically after a lab run whose review
  finds a lab pass (the owner may also start it by hand). College football: started only by the owner. Budget and
  finality are the same either way.
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
| Search | 2006–2016 | the search (A3.3c) scores configurations here; sub-periods 2006–09, 2010–13, 2014–16 |
| Gate 1 | 2017–2019 | confirmation |
| Gate 2 | 2020–2022 | confirmation |
| Gate 3 | 2023–2024 | confirmation |
| Pooled | 2017–2024 | the pooled test of A7 |
| **Sealed** | **2025** | the exam (A8); not in the lab |

Rule-era splits (reported, never used to pass): **2017–2020**, **2021–2023** (17-game season from 2021), **2024**
(new kickoff rule from 2024).

Candidates that ran under v1 keep their v1 results (training 2006–15; gates 2016–18, 2019–21, 2022–24); their ledger
rows say so. No NFL candidate ran under v2 or v3's split (2006–12 / 2013–18 / 2019–24). None is re-run unless
re-registered under a new id, which is a new attempt.

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

## Part C -- College football (CFB), added in v3

Part C was written and hash-locked before any college football data was downloaded. Part A applies to CFB unchanged
except where this Part says so explicitly. Everything for CFB lives under `research/cfb/` (candidates, data cache,
results, ledger, exams, paper logs).

**Expected result, stated up front:** college football is noisier than the NFL (130+ FBS teams, 12-13 games each, huge
mismatches, rosters that turn over every year), and its closing lines are still very good forecasts. The most likely
outcome is again that **no CFB candidate passes the sealed exam**. Small samples are not read as findings (C7).

### C1. Data
- **Source:** CollegeFootballData (`api.collegefootballdata.com`, CFBD), with the owner's API key (`CFB_API_KEY`).
  The key is used **only** inside GitHub Actions data/research workflows; it is never printed, committed, or used by
  the app or the website's functions. If the key turns out to belong to a different provider, a new version adapts
  this Part before that provider's data is used.
- **What is cached** (season-level requests wherever the API allows): games (season, week, season type, start time,
  teams, each team's classification, neutral site, final scores); closing lines (spread and total); team-game advanced
  stats (offensive plays and points per play / PPA, with and without garbage time, for offense and defense); and each
  team's returning production before the season. Columns that encode known angles or other prices are dropped:
  moneylines, opening lines, weather, attendance, excitement index, and CFBD's own pregame Elo / win probabilities.
- **Closing line:** for each game, the line from the provider named `consensus` when present, otherwise the median
  over every provider listed for that game. CFBD's `spread` is the home team's line, so the expected home margin is
  `−spread`; the total is `overUnder`.
- **Eligible games:** **both teams FBS** that season, regular season and postseason (bowls, playoff), with final
  scores and a closing line for that market. **FBS-vs-FCS (and any non-FBS) games are excluded entirely**: never
  scored, and never used to update any rating or average. Reason, fixed before data: non-FBS teams play only one or two
  FBS games a year so their strength cannot be learned, the lines are often 30-50 points, and these markets are thin.
- **Line coverage gate:** if, in any training or gate season, fewer than 70% of eligible-team games have a closing line
  for a market, the lab refuses to run that market (it does not shrink or move the seasons); only a new version may
  change the split.
- **Cache:** `research/cfb/data/`, seasons **2009-2024 only**; the lab refuses any row from 2025 or later. A season
  already cached is **never fetched again** while the cache exists (C1a). Every workflow run logs the API calls it used
  (`research/cfb/data/CALLS.csv`), uses at most 150 calls, and stops early when the provider reports fewer than 100
  calls left in the month.
- In season, a weekly data run may refresh only the **current** season (2026), into memory or into files outside the
  lab's cache that the lab never reads. The sealed season is never stored anywhere in the repo.

### C1a. Where the CFB data is kept
- The provider's terms forbid giving third parties stored raw API responses or a copy of the data. So the cache files
  (`research/cfb/data/*.csv`) and the current-season refresh (`research/cfb/current/`) are **never committed**: they
  live only in this repository's GitHub Actions cache (not public), restored by the CFB workflows and git-ignored.
- What is committed: `research/cfb/data/MANIFEST.json` (seasons held and each file's SHA-256), `CALLS.csv` (every API
  call), and derived outputs (results, ledger, verdicts, reports), which the terms allow.
- Every ledger row carries the data fingerprint, so a run on a different copy of the data is visible. If GitHub ever
  evicts the Actions cache, the missing seasons are fetched once more and logged; the lab refuses to run when the
  re-fetched files do not match the fingerprints in `MANIFEST.json` for seasons already used, until the owner adopts
  a new version that says what to do.

### C2. Season split
| Use | Seasons | Notes |
|---|---|---|
| Warm-up | 2009-2013 | ratings and rolling stats only; never scored, never fit on |
| Training | 2014-2017 | the only seasons coefficients may be fit on; also sets the line-only baseline |
| Gate 1 | 2018-2019 | exploration |
| (played through) | 2020 | COVID season (conference-only schedules, opt-outs, empty stadiums): ratings update through it, never scored, never fit on |
| Gate 2 | 2021-2022 | exploration |
| Gate 3 | 2023-2024 | exploration |
| Pooled | 2018-2019 + 2021-2024 | the pooled test of A7 (2020 excluded) |
| **Sealed** | **2025** | the exam (A8); not in the lab |

Splits reported, never used to pass: **2018-19** (before free transfers and NIL), **2021-22** (one-time free
transfer and NIL from 2021), **2023-24** (clock keeps running after first downs from 2023: fewer plays; 12-team
playoff and larger conferences from 2024); **lines of 14 points or less vs more than 14** (mismatches); **regular
season vs postseason**.

### C3. Markets
Same as B3: `spread` (forecast = expected home margin, `r = home margin − closing expected home margin`) and `total`
(`r = combined points − closing total`). "Home" is the home team CFBD lists; at a neutral site a candidate may give no
home edge (its file says so).

### C4. Multiple testing across sports
- The A6 correction for CFB is Holm-Bonferroni over **every CFB attempt** in `research/cfb/LEDGER.csv`.
- Reported alongside it, never used to pass: the **global attempt count across all sports** (every NFL and CFB ledger
  row) and each CFB attempt's Holm-adjusted p over that global set.

### C5. Season, budget and mid-season
- v2 covers the **2026 CFB research season**: sealed exam season 2025, budget **3 exams** (A8, recorded in
  `research/cfb/exam/EXAMS.csv`), ending when the 2026 season's national championship game is played (January 2027).
- A new version never resets an exam budget: exams are counted per sport and sealed season, across versions. So
  v3 leaves the NFL's 2025 budget (B4) exactly as it was under v1 and v2.
- An exam needs at least 400 scored games in the sealed season, or it is recorded as an error (still spent).
- Paper-season mid-season point for the stop rule: after week 7 of the regular season.
- Kalshi markets: the NCAA football series (game winner, spread ladder, total ladder) as confirmed by the first
  test call; main line = the rung priced closest to 50¢. A game without a two-sided Kalshi price is logged with no pick.

### C6. Seed candidates (registered separately in `research/cfb/candidates/`)
(a) a plain team rating (Elo-style) spread model, the baseline every rating idea is measured against; (b) a plain
points-for/against totals model; (c) ideas taken from public, open college football rating methods (FiveThirtyEight's
Elo rules, Simple Rating System / least-squares margins as in cfbfastR and sports-reference, opponent-adjusted
EPA/PPA as in cfbfastR and CFBD), **each idea its own candidate** on top of the plain model: margin-of-victory
multiplier, preseason regression toward the conference instead of the whole league, returning production as the
preseason prior, home edge learned from recent seasons, regression toward the market line, a margin cap, the SRS
family, PPA ratings, the garbage-time filter, and a pace × efficiency totals model; (d) a few small pre-declared
variants. Each counts in the C4 correction. A3.5 applies: no rivalry, revenge, lookahead, letdown, bowl-motivation
or opt-out spots.

### C7. Small samples
No result is read from one conference, one team, one week, or any slice smaller than 300 games, and no slice other
than those named in C2 is reported. A lesson about CFB (A10) is exploratory like every other lesson.

---

## Part D -- reserved

Reserved for another sport. Until a later version adds it, Part A applies only to NFL and CFB.

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

## Changes from v2 (2026-10-19)
1. **Adds Part C, college football** (A1.3). Nothing in Part A or Part B changes, except one sentence that is
   stricter: exam budgets are counted per sport and sealed season across versions (C5), so no version can reset
   the NFL's budget.
2. **Part C was written and hash-locked before any college football data was touched**, on the CFB branch
   (commit bfae47e). While that branch was open, the NFL-only v2 above was adopted on main, so Part C arrives as v3.
   Its text is the same as when it was locked, plus C1a (where the CFB data is kept, from CollegeFootballData's
   terms). C1a was added before any CFB history was downloaded; only a five-call provider check had run.

---

## Changes from v3 (2026-10-19)

1. **NFL: a search → confirm loop (A3.3c, B2)**, the owner's decision. The lab finds NFL candidates itself: an
   automatic, deterministic search over a menu of model settings and blends, scored only on 2006–16; at most 2 per
   market per round that clear t ≥ 2.0 and are positive in every search sub-period are confirmed on 2017–19, 2020–22
   and 2023–24, which the search never sees. Only confirmations are attempts. Why: the owner wants many ideas tried and
   the lab to learn from what ran; trying many ideas directly on the gates would make the correction impossible to pass
   (or, loosened, let luck through), and learning from gate results would turn the gates into training data.
2. **NFL season split (B2):** training 1999–2005 (unchanged), search 2006–16, confirmation 2017–24 (v2/v3 used gates
   2006–12 / 2013–18 / 2019–24; no NFL candidate ran under them). The 18 NFL ideas queued under v2 are now part of the
   search menu instead (same families and settings), so they compete in the search rather than each costing an attempt.
3. **NFL exam starts automatically** when a review finds a lab pass (A8). Budget (3) and finality unchanged.

Unchanged: Part C (college football) entirely; the Holm correction over every attempt of a sport (v1's 18 NFL attempts
keep counting); the 0.05 bar; "positive in every gate"; the fade rule; the sealed 2025 exams and their budgets;
promotion and the stop rule. Said plainly: v4 was written after the 18 v1 NFL results were seen; those used 2016–24, so
the confirmation seasons 2017–24 are not untouched; the sealed 2025 exam and the paper season are the clean tests.

