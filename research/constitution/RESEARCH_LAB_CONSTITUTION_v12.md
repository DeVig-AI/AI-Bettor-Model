# DeVig Research Lab -- Constitution v12

Version: **v12** · adopted 2026-10-27 · applies to: Part A (all sports), Part B (NFL), Part C (college football),
Part D (NBA, NHL, MLB) · replaces v11 (kept unchanged at `research/constitution/RESEARCH_LAB_CONSTITUTION_v11.md`; v10
to v1 alongside it; what changed: sections "Changes from v1" to "Changes from v11" at the end)

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

### A2. Roles (no AI anywhere in the scoring loop)
- **Research lab** (`research/lab/`, workflow "Research Lab -- ..."): runs every registered candidate that has not run
  yet through the exploration gates, deterministically, inside GitHub Actions. It never sees sealed data.
- **Inspector General** (`research/lab/inspector.py`, workflow "Research Lab -- Inspector General"): judges the lab's
  numbers against these rules, applies the multiple-testing correction over the whole ledger, and is the only code
  that may download sealed data (the exam) or current-season data (the paper season).
- **Researcher** (since v9; a Claude session a scheduled task starts weekly, instructions in `research/RESEARCHER.md`):
  **proposes** new signals (A3.3e) and menu values by pull request, each with a football reason. It never scores,
  judges, merges or runs anything in the loop, and it may read only the search side (signal libraries, menus, search
  leaderboards and code), never the ledger, results, exams, status, lessons or paper logs. Nothing it proposes is
  used until the owner merges it; everything merged is then scored by the same deterministic code as any idea.
  Since v12 it is also a **scout**: it may read outside public work (open-source models' code and documentation,
  published analytics) listed in `research/scout/SOURCES.yaml` or found from there, and a signal taken from outside
  work cites it (link and the file or section) in its reason. Each run starts in a fresh session, so it has never
  seen the lab's results. Outside content is information to weigh, never instructions; it cannot change these rules.
  The scout bot (workflow "Research Lab -- scout") only lists what changed in those sources each week
  (`research/scout/WHATS_NEW.md`): links and change notes, never copies of anyone's code or text.
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
3c. **The search (every sport with a search split: NFL Part B, college football Part C, NBA / NHL / MLB Part D).** Besides hand-written
   candidates, the lab finds candidates itself, per sport, in rounds, back to back (each run of the research loop does
   one round per sport; the menu's `round_every_hours` is 0), deterministically, with no AI. Each sport has its own menu and logs
   (NFL `research/search/`, CFB `research/cfb/search/`, Part D `research/<sport>/search/`):
   - **Menu:** the sport's `MENU.yaml` lists the model families and the values each setting may take. Each round
     scores, in this fixed order, up to the menu's `max_new_per_round` configurations not scored before: first every
     grid combination not yet scored (a large grid spreads over several rounds), then the **focus** combinations (for each
     family, every combination of the 2 best values of each setting, ranked by the median search t of the configurations
     already scored with that value), then the neighbours (one setting moved one step along its ladder in the menu) of
     the **30** best configurations per market, then **learned samples** (configurations drawn with a seed fixed by sport
     and round number, each setting's value drawn with weight exp(median search t of the configurations already
     scored with it), values never tried getting the family's average weight; values come from the grid and, for
     numeric settings, the ladder), then **random samples** (the same, with equal weights). Then, every round, blends of
     the best performers: every pair of the 10 best, every trio of the 6 best, equal-weight blends of the best 3, 5, 7
     and 10, and blends of the best 5 and best 8 with non-negative weights summing to 1 fit on the training and search
     seasons. Nothing already scored is scored again, and a configuration whose
     search-season forecasts are identical to one already scored is logged as the same model and never ranked,
     blended or shortlisted. Since v10 no model type takes more than the menu's `max_share_per_type` (one half) of a
     round's cap while other types still have configurations to score; what is left of the cap is then filled in the
     same order.
   - **Automatic widening (since v10):** when fewer than the menu's `widen_below` configurations are left to score,
     the search widens its own menu instead of stopping, one generation at a time (at most
     `max_widenings_per_round` a round), deterministically and from its own search-season scores only. A generation
     adds (1) for each numeric setting, the midpoints between its 2 best ladder values (by median search t, values
     scored at least 3 times) and their ladder neighbours, and one step past the end of the ladder when a best value
     is at an end, within the setting's bounds in `research/lab/search.py`; (2) variants of the 6 best team signals
     not varied before, with the half-life halved and doubled and the season carry 0.2 lower and higher (same
     columns and football reason, so A3.3e and A3.5 still hold); (3) the best single model per market that is not yet
     a signal base, as a new base; (4) pairs of 4 more and trios of 2 more of the best signals; (5) since v12,
     **formula signals**: the next 8 of a fixed catalogue of team-column formulas (`formula_catalogue` in
     `research/lab/search.py`: each value column per each count column, play-type shares, plays per second, and
     per-game differences such as EPA minus passing EPA; offense and defense; the sport's usual half-life and carry)
     whose columns and side no signal in the library already has. They are built only from A3.3e's allowed columns,
     so no betting angle can be expressed (A3.5); their reason is a plain description of the formula, marked as having
     no hand-written football reason, so they compete only on search-season scores and, if shortlisted, confirmation. Each generation is
     appended to the sport's `AUTO.yaml` (never edited); `MENU.yaml` and `SIGNALS.yaml` are not changed by it. The
     search pauses only if a generation adds nothing at all.
   - **Search seasons only:** the search code is given data only up to the last search season (B2, C2); it never sees
     the confirmation seasons or the sealed season. Search scores are the A5 effect on the search seasons with
     t = effect ÷ (standard deviation ÷ √games). Every configuration scored is logged in the sport's search folder.
   - **Shortlist:** after each round, candidates are taken best search t first, only if t ≥ **2.5**, the effect is
     positive in **each** search sub-period, and the model's disagreements with the line correlate at most **0.95** with
     any candidate the search sent before or in the same round; and at most **2 per market in any 7 days**. A
     shortlisted model is written to the sport's candidates folder with its search numbers and the time it was sent,
     committed, and confirmed like any candidate.
   - Search scores are **exploratory, not attempts**: only the confirmation of a shortlisted candidate is an attempt
     (A6). The search may choose settings and blend weights using the training and search seasons; never later ones.
   - **What the search learns from:** only its own search-season scores. Confirmation, exam and paper-season results
     are never read by the search (feeding them back would turn the confirmation seasons into training data).
3e. **Signals.** A signal is an extra input added on top of a base rating model, declared in the sport's
   `SIGNALS.yaml` (NFL `research/search/`, CFB `research/cfb/search/`) with a football reason, and built **only** from
   the fields `research/lab/signals.py` allows: rolling per-team values of pre-game team statistics (offense or
   defense), rest, bye, short week, travel and divisional games, quarterback changes and, since v12, **injuries**
   (NFL only, spread only): home minus away of last game's quarterback unavailable, regular starters unavailable and
   regular starters questionable, from the week's official injury report and roster (B1), all published before
   kickoff. The code rejects any other field, so weather, dates, kickoff times, prices and situational spots cannot be
   expressed (A3.5 still applies to what may be proposed). Each round the search tests every signal alone on each of
   the menu's `signal_bases`, then pairs and trios of the signals with the best search t so far; a signal's weights
   are fit once on the training seasons' residuals (actual − base forecast). **Exception (v12):** the NFL training
   seasons (1999–2005) predate injury data, so a model with an injury signal fits its weights on the training seasons
   plus **2013–2016**, the newest search seasons and the first with the data; injury features are 0 before 2013. The
   confirmation seasons and the sealed season are never used to fit anything. Signal models are configurations like
   any other: search scores are free, and only shortlisted ones are confirmed and count as attempts.
4. Coefficients a candidate fits are fit **once, on the training seasons only** (blend weights found by the search: on
   the training and search seasons; injury-signal weights: on the training seasons plus 2013–2016, A3.3e), and then
   frozen. Team ratings and
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
- The research loop runs **back to back**: when a run finishes, it queues the next one, or first the Inspector
  General's exam for a sport that has a lab pass and an exam left (the exam then queues the loop again).
- Only the **best current lab pass** may sit an exam: smallest Holm-adjusted p, then the larger pooled effect, then the
  earlier ledger row. Every sport: the Inspector General's workflow starts the exam automatically after a lab run whose
  review finds a lab pass in that sport (the owner may also start it by hand). Budget and finality are the same either
  way.
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
- **Injuries (since v12):** nflverse's official weekly injury reports, weekly rosters (inactive, reserve and other
  statuses), snap counts and player ids, turned into one row per game (`injury_games.csv`, seasons **2013–2024**,
  snap counts start in 2013) by the locked code of the DeVig injury study (`research/injuries/nfl_injury_study_v1.py`,
  definitions in `NFL_INJURY_STUDY_V1_PREREG.md`). The Inspector General builds the same rows for the sealed and paper
  seasons in memory, like the rest of their data.

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
| Search | 2018, 2019, 2021 | the search (A3.3c) scores configurations here; each season is a search sub-period |
| (played through) | 2020 | COVID season (conference-only schedules, opt-outs, empty stadiums): ratings update through it, never scored, never fit on, never searched on |
| Gate 1 | 2022 | confirmation |
| Gate 2 | 2023 | confirmation |
| Gate 3 | 2024 | confirmation |
| Pooled | 2022-2024 | the pooled test of A7 |
| **Sealed** | **2025** | the exam (A8); not in the lab |

Splits reported, never used to pass: **2022** (free transfers and NIL), **2023-24** (clock keeps running after first
downs from 2023: fewer plays; 12-team playoff and larger conferences from 2024); **lines of 14 points or less vs more
than 14** (mismatches); **regular season vs postseason**.

No college football candidate ran before v5 (the CFB ledger was empty), so no CFB season had been scored when this
split was chosen. The 16 seed candidates of C6 were moved, unrun, into the CFB search menu
(`research/cfb/search/MENU.yaml`), where every one of them is a grid point.

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

### C6. Seed ideas (since v5: points of the CFB search menu, not separate candidates)
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

## Part D -- NBA, NHL and MLB, added in v11

Part D adds three sports that share one data source and one set of rules: **NBA** (`research/nba/`), **NHL**
(`research/nhl/`) and **MLB** (`research/mlb/`), each with its own candidates, search, ledger, exams, results
and reports, kept apart exactly as CFB is kept apart from the NFL. Part A applies unchanged except where this Part says
so explicitly (D3 adds a moneyline market and its metric; D7 says when the paper season can start).

**What was seen before this Part was written and locked:** the author downloaded the archive named in D1 and looked at
its column names, the number of games it lists per season and sport, and the first game of each file (one 2011 game
per sport, with its score and lines). Nothing else: no model was run, no line was compared with a result, no season
was scored. This is stated so the split below can be judged knowing it.

**Expected result, stated up front:** closing lines in these sports are very good forecasts, and the models this data
allows know only scores, schedules and the lines themselves (no injuries, lineups or starting pitchers: MLB models
here cannot see who is pitching, which is the most important input to an MLB price). The most likely outcome for all
three sports is that **no candidate passes the sealed exam**, and quite possibly none passes the lab.

### D1. Data
- **Source:** the public archive of closing lines and final scores in the GitHub repository
  `flancast90/sportsbookreview-scraper`, pinned to commit `1a820e50c6fbd0276cde073c22bfffae78930868`: files
  `data/nba_archive_10Y.json`, `data/nhl_archive_10Y.json`, `data/mlb_archive_10Y.json` (games of the 2011 to 2021
  seasons, scraped from sportsbookreview.com and patched by its author). The files' SHA-256 are fixed here:
  NBA `0c9858489d224c54dcf2f2d1b70c3a122675381d35ae03ce0a81204f739f0e98`,
  NHL `399b65039c909907011827907285ede97982b3ce89e6224c323c5031c2885168`,
  MLB `ee4904dee0ee1474e7ac75697cea2c28f0084e5fb576553e48627e4cf90dd77d`.
  The lab refuses to run on a file whose fingerprint differs; a different file needs a new version.
- **Season** = the year the season starts (the archive's own `season`: NBA and NHL 2011 = the 2011-12 season).
- **Fields used:** date, home and away team, final scores, the closing home spread (NBA only), the closing total, and
  the closing moneylines (NHL and MLB). Everything else is dropped from the lab's cache: opening lines, first-half /
  second-half lines, the juice on spreads and totals, and per-period scores.
- **Closing lines, checked before use** (a value failing its check counts as "no closing line" for that market; the
  game still has its result and still updates ratings):
  - NBA spread: home spread present, equal to minus the away spread, and at most 25 points either way. Expected home
    margin = minus the home spread.
  - Totals: NBA 150-280 points, NHL 4-8 goals, MLB 4-16 runs.
  - Moneylines (NHL, MLB): both present, each a valid American price (at most -100 or at least +100), and the two
    implied probabilities summing to between 1.00 and 1.15.
- **Eligible games:** games with both final scores and a closing line for that market that passes its check. A game
  listed twice (same date and teams) is kept once, the first time it appears.
- **Line coverage gate:** as C1: if fewer than 70% of a training or gate season's games have a closing line for a
  market, the lab refuses to run that market; only a new version may change the split.
- **Where the data is kept:** the archive is scraped from a sportsbook site, so a copy is not republished here. The
  lab's cache (`research/<sport>/data/*.csv`, seasons **2011-2020 only**) is built at the start of each lab job from the
  pinned file and is **never committed** (git-ignored). What is committed: `MANIFEST.json` (source, commit, file
  fingerprint, seasons held, the cache files' fingerprints and the counts of games and lines dropped by each check),
  and derived outputs (results, ledger, verdicts, reports). The sealed season is read only by the Inspector General's
  exam, in memory, and never written anywhere.

### D2. Season split (the same for all three sports)
| Use | Seasons | Notes |
|---|---|---|
| Warm-up | 2011 | ratings start here from average; never scored, never fit on |
| Training | 2012-2013 | the only seasons coefficients may be fit on; also sets the line-only baseline |
| Search | 2014, 2015, 2016 | the search (A3.3c) scores configurations here; each season is a search sub-period |
| Gate 1 | 2017 | confirmation |
| Gate 2 | 2018 | confirmation |
| Gate 3 | 2019 | confirmation (NBA and NHL: the season paused in March 2020 and finished in a bubble) |
| (played through) | 2020 | COVID seasons (empty or limited arenas, short MLB season): ratings update through it, never scored, never fit on, never searched on |
| Pooled | 2017-2019 | the pooled test of A7 |
| **Sealed** | **2021** | the exam (A8); not in the lab |

Reported, never used to pass: each gate on its own (no rule-era splits are declared for Part D). The 2012 NHL season
(48 games, after a lockout) and the 2011 NBA season (66 games) are used as they are.

### D3. Markets and how they are measured
- **NBA:** `spread` and `total`, exactly as B3 (`r` = home margin − closing expected home margin; combined points −
  closing total).
- **NHL and MLB:** `total` as B3 (in goals or runs), and **`moneyline`** in place of a spread (their spreads are fixed
  at 1.5 and priced by juice, which D1 drops):
  - the closing price as a probability: `q` = the home moneyline's implied probability ÷ (home + away implied
    probabilities), the vig removed in proportion;
  - forecast = the model's home win probability; everything is in **win-chance points** (percent): line = 100·q,
    `actual` = 100 if the home team won (overtime and shootouts included) else 0, so `r = actual − 100·q` and
    `d = forecast − 100·q`;
  - **Effect** exactly as A5, `E = mean(s·r) − mean(s0·r)`, in win-chance points per game: the extra share of games
    won by taking the model's side, beyond the line-only baseline, measured against the fair closing price. Bootstrap,
    p-value, gates, correction and exam as A5-A8, unchanged.
  - **Pricing** (replaces A4 for moneylines only): a pick on the home team costs `q` plus Kalshi's fee
    `0.07·q·(1 − q)`, on the away team `1 − q` plus its fee; it pays $1.00 if that team wins. ROI = profit ÷ cost;
    break-even is each pick's own cost (reported as their average). Reported, never sufficient to pass, as in A4.
- Totals keep A4's 50/50 pricing: the total's juice is dropped (D1), so in the NHL, where totals are usually 5.5 or 6
  with uneven juice, the 50/50 price is rough. The line-only baseline (A5) absorbs any average lean.
- "Home" is the home team the archive lists; no neutral sites are marked.

### D4. Multiple testing across sports
- As C4: Holm-Bonferroni over **every attempt of that sport** (`research/<sport>/LEDGER.csv`) decides; the global
  attempt count across all sports and each attempt's Holm-adjusted p over that global set are reported, never used.

### D5. Season, budget and mid-season
- v11 opens the **2026-27 research season** for NBA and NHL (ending when the 2027 NBA Finals / Stanley Cup Final end)
  and the **2027 research season** for MLB (ending when the 2027 World Series ends). Sealed exam season 2021, budget
  **3 exams per sport** (A8), recorded in each sport's `exam/EXAMS.csv`.
- An exam needs at least NBA 800, NHL 800, MLB 1,500 scored games in the sealed season, or it is recorded as an
  error (still spent).
- Paper-season mid-season point for the stop rule (A9.4): NBA and NHL after January 31, MLB after July 1.

### D6. Seed ideas (points of each sport's search menu, not separate candidates)
(a) a plain team rating (Elo) for the side market (NBA spread; NHL / MLB moneyline), the baseline every rating idea
is measured against; (b) a plain points-for / against totals model; (c) ideas from public, open rating methods
(FiveThirtyEight's NBA, NHL and MLB Elo rules; Simple Rating System / least-squares margins as in sports-reference;
opponent-adjusted points-for / against ratings), **each idea a setting of the menu**: K factor, home edge, preseason
reversion, margin-of-victory multiplier, a margin cap, home edge learned from recent seasons, regression toward the
market line, rating half-life, and for moneylines a win probability fit once on the training seasons from a margin
rating. A3.5 applies: no back-to-back, travel-fatigue, rest-advantage, revenge, lookahead or "schedule spot" filters
as candidates of their own (rest may enter only as a signal, A3.3e, if a later version lists it for these sports).

### D7. Paper season
- Promotion, the paper season and the stop rule are A9's. Paper tracking needs a logger that reads Kalshi's game
  markets for that sport (NBA spread and total ladders; NHL and MLB game winner and total ladders) and logs picks
  before the game starts. **Until that logger is merged for a sport**, a model promoted in it is recorded as promoted
  with an empty paper log, and its paper season starts on the day the logger is merged: no pick is back-filled, and
  nothing about the exam or promotion changes.

### D8. Small samples
As C7: no result is read from one team, one month or any slice smaller than 300 games, and no slice other than those
named in D2 is reported. Lessons (A10) are exploratory.

## Part E -- reserved

Reserved for another sport. Until a later version adds it, Part A applies only to NFL, CFB, NBA, NHL and MLB.

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

---

## Changes from v4 (2026-10-19)

1. **College football gets the search → confirm loop (A3.3c, C2)**, the owner's decision: its own menu
   (`research/cfb/search/MENU.yaml`: Elo, SRS, PPA ratings and pace × efficiency totals, 264 combinations covering all 16
   seed ideas), searched on 2018, 2019 and 2021, confirmed on 2022, 2023 and 2024 (2020 still played through, never
   scored). Training 2014–17, the sealed 2025 exam, its budget of 3, the line-coverage gate, the data rules (C1, C1a),
   the CFB-only correction (C4) and the small-sample rule (C7) are unchanged. No CFB candidate had run, so nothing was
   seen before the split was chosen.
2. **The exam starts automatically in every sport** when a review finds a lab pass in that sport (A8; v4 did this for
   the NFL only). Budgets and finality unchanged.

---

## Changes from v5 (2026-10-19)

The owner asked for a much bigger search:
1. **Bigger menus:** NFL about 4,300 configurations (finer Elo, team-rating and pace settings, and the SRS family
   added), college football about 1,000 (finer settings, team ratings on points and PPA added). Menus are data files
   the search reads; A3.3c already allowed adding to them.
2. **Wider refinement and more blends:** neighbours of the 30 best (was 10); pairs of the best 10, trios of the best 6,
   equal blends of 3/5/7/10, fitted blends of 5 and 8 (was pairs of 6, equal 3/5, fitted 5).
3. **Rounds at most daily** (was weekly), each scoring at most a fixed number of new configurations, in a fixed order,
   so a round stays deterministic and inside the workflow's time limit; a large grid finishes over several rounds.
4. **Stricter shortlist:** t ≥ 2.5 (was 2.0), because a bigger search makes a high best t likelier by luck; and the
   limit of 2 per market is now per 7 days, not per round, so daily rounds do not send more candidates to confirmation
   than weekly ones did. The attempt rate (A6) is unchanged; only the bar to be sent is higher.

Unchanged: every other rule, including all season splits, the correction, the bars, the exams and Part C's data rules.

---

## Changes from v6 (2026-10-19)

1. **The search learns (A3.3c, focus step)**, the owner's decision: each round, before the neighbours, every
   combination of the 2 best values of each setting found so far (ranked by the median search t of the configurations
   already scored with that value) is scored. This finds settings that work together, not only one change at a time.
2. **What the search learns from**, stated as a rule: only its own search-season scores. Confirmation, exam and
   paper-season results are never read by the search.
3. **Reporting (A10):** the run history on /lab shows counts only (tested → past gate 1 → past gate 2 → passed the lab
   → passed the exam → promoted; search rounds: scored → consistent → strong → sent). Every number stays in the
   repository files (results, ledger, search logs).

Nothing had run under v6 (no search round, no attempt) when v7 was adopted. Every other rule is unchanged.

---

## Changes from v7 (2026-10-19)

The owner asked for the loop to run around the clock, never retest the same model, and learn from every past run:
1. **Back to back** (was at most daily): each run of the loop does a search round and, when it finishes, queues the
   next run (or a sealed exam first when a sport has a lab pass and an exam left). An hourly start is only a safety net.
2. **Learned and random samples** each round (A3.3c), seeded by sport and round, so every round has new models to try
   and the search draws more often from settings that scored well before (search seasons only, as always).
3. **Look-alikes:** a configuration with forecasts identical to one already scored is logged as the same model and
   never ranked, blended or shortlisted.

Unchanged: the shortlist (t ≥ 2.5, at most 2 per market in any 7 days), so running more often sends no more candidates
to confirmation; every other rule. Search rounds 1-3 (NFL) ran under v6/v7 before this version.

---

## Changes from v8 (2026-10-20)

The owner asked for a researcher that keeps adding reasonable new signals to test:
1. **Signals (A3.3e):** a library of football-reasoned signals per sport, restricted by code to pre-game team
   statistics, rest, travel, divisional games and quarterback changes; the search tests each on base rating models,
   alone and in combination, weights fit on training seasons only. Seeded with 17 NFL and 4 college football signals.
2. **The researcher (A2):** a weekly Claude session that proposes new signals by pull request for the owner to approve,
   reading only the search side, never confirmation, exam or paper results. This is the first AI role in the lab; it
   sits outside the scoring loop, and nothing it writes is used unless the owner merges it.

Unchanged: every scoring, testing, correction, exam and promotion rule.

## Changes from v9 (2026-10-22)

The owner asked for a search that never stalls: both sports' searches had scored every configuration their menus
allowed (NFL 179,929 on 2026-10-21, college football 4,705) and paused until someone edited a menu by hand, and in
the NFL Elo settings had taken about 166,000 of the scores. v10:
1. **Automatic widening (A3.3c):** when fewer than `widen_below` new configurations are left, the search adds ladder
   values around the best settings, half-life and carry variants of the best signals, new signal bases and larger
   signal sets, logged in each sport's `AUTO.yaml`. It reads only search-season scores, as before.
2. **Share per model type (A3.3c):** no type takes more than half of a round while others still have work.

Unchanged: the search and confirmation seasons, the shortlist (t ≥ 2.5, positive in every search period, correlation
at most 0.95 with earlier candidates, at most 2 per market in any 7 days), and so the rate of attempts; every
scoring, testing, correction, exam and promotion rule. No rule is loosened (A1.4): more configurations are searched,
but the number of attempts and the bar each must clear are the same.

## Changes from v10 (2026-10-23)

The owner asked for testing chambers for the sports the /lab page listed as "under construction" (MLB, NBA, NHL).
v11 adds **Part D** for NBA, NHL and MLB: one public archive of closing lines and scores (2011-2021, pinned by commit
and fingerprint, never committed here), one season split for all three (warm-up 2011, training 2012-13, search 2014,
2015, 2016, gates 2017 / 2018 / 2019, 2020 played through, sealed 2021), and a **moneyline** market for NHL and MLB
measured in win-chance points against the vig-free closing price, with Kalshi-fee pricing at that price. A3.3c now
names Part D's search folders. Paper tracking for these sports starts when its Kalshi logger is merged (D7).

Unchanged: Part A's scoring, correction, lab-pass, exam and promotion rules for every sport; Parts B and C entirely
(the NFL and CFB budgets, splits, ledgers and searches are not touched). No rule is loosened (A1.4).

---

## Changes from v11 (2026-10-27)

The owner asked for injury data in the lab and for a generator of signals, both from outside work and automatic:
1. **Injury signals (A3.3e, B1), NFL only:** last game's quarterback unavailable, regulars unavailable, regulars
   questionable (home minus away, spread only), from the official injury reports, rosters and snap counts, built by
   the locked injury-study code. The owner chose how they are fit: the training seasons have no injury data, so these
   weights are fit on the training seasons plus 2013–2016 (the newest search seasons). Said plainly: an injury
   signal's search score is then partly measured on seasons its weights were fit on, so it can look better than it
   is in the search; confirmation (2017–2024) and the sealed exam, never fit on, are where it is judged. That is a
   new fitting window for a new kind of input, not a change to any rule A1.4 lists (budget, correction, fade bar).
   Background, outside the lab: the injury study (`research/injuries/`) found injuries did not beat the closing line
   on their own (2019–2024) but made a model that does not see the line more accurate.
2. **Formula signals (A3.3c(5)):** each automatic widening also adds the next 8 of a fixed catalogue of formulas
   built from the allowed team columns. No hand-written reason; they are scored like any signal and count only if
   shortlisted and confirmed.
3. **The researcher becomes a scout (A2):** it may read outside public models and analytics (listed in
   `research/scout/SOURCES.yaml`) and cites them; it starts in a fresh session each week, so it has never seen the
   lab's results; a weekly bot lists what changed in those sources.

Unchanged: every scoring, correction, gate, lab-pass, exam, promotion and stop rule; the shortlist (t ≥ 2.5, at most 2
per market in any 7 days), so the attempt rate does not rise; Parts C and D.
