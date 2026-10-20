# NFL_PROPS_DIAGNOSIS_V1 — plan (fixed before any slice result)

Written 2026-10-19 and committed **before any slice number was computed**. Its SHA-256 is recorded in the results.
Any change after this commit voids it; a changed plan becomes v2 and says why.

## What this is
Lead-finding, not a new model. The frozen NFL props model v1 is less right than Kalshi's price on past games
(`nfl/props_history/backtest_v1_results.md`: log loss 0.567 vs 0.536, 11,233 rows, 80 games, 2026 weeks 1–6). The
calibrated v2 put ~95% of its weight on Kalshi's price (`v2_study_results.md`), and live on 2026-10-18 the HIGH picks
were given 57% and won 44% (needed 43.5%). The question here: **is the model wrong everywhere about equally (it simply
knows less than Kalshi), or is it wrong in a specific, nameable place that a specific input or adjustment could fix?**
The owner's rule: only build or test something that comes out of a real lead in the data. Nothing is built here.

## Data (nothing new about the props themselves)
- **Rows:** exactly the back-test main set: `nfl/props_history/kalshi_props_history_v1.csv` scored with the frozen v1
  model the way `nfl/kalshi_props_backtest_v1.py` / `kalshi_props_v2_study.py` score it (same player matching, same
  expected values, frozen 2026 tables, same filters: model chance, 21+ prior games in role, 10 pickable stats,
  0 < bid < ask < 1, ask − bid ≤ 0.10, open interest ≥ 100). The script checks it reproduces
  `v2_study_rows.csv` (same row count and model chances) and stops if not.
- **Kalshi mid** = (bid + ask) / 2 of the pre-kickoff snapshot already in the CSV.
- **Extra columns** per row, all known before kickoff:
  - the model's expected value for the stat and the player's id and team (kept from the scoring step);
  - recent usage from nflverse play-by-play (games before the game date only);
  - opponent defense, season-to-date, from nflverse play-by-play (current-season games before the game date only);
  - game total, spread and team implied points from **Kalshi's own pre-game NFL game markets** (KXNFLTOTAL,
    KXNFLSPREAD, KXNFLGAME), collected by a new read-only collector `nfl/kalshi_game_lines_history_v1.py` in GitHub
    Actions with the same snapshot rule as the props: the last hourly candle closing ≥ 40 minutes before kickoff.
    Raw ladders are saved to `nfl/props_history/kalshi_game_lines_history_v1.csv`. Market and team-code handling
    reuses `kalshi_games_v1.py` (team code aliases) and the props collector's settled-market / candle helpers
    (`kalshi_games_v1.py` itself only reads open markets, so its fetch functions cannot see past games).

## Slices — the complete list. No slice is added, removed or re-cut after results are seen.
Bin edges that are quantiles are computed on all main-set rows together (both halves) from pre-game values only;
no outcome is used to place a bin edge. A row with a missing value goes to an `n/a` bin, which is reported but
can never be a lead.

1. **stat** — the 10 pickable stats.
2. **lean side** — Over lean (model chance > Kalshi mid) vs Under lean (model chance < mid). Exact ties: `n/a`.
3. **line − model expected value** — quintiles of (line − expected value), cut **within each stat** (yards and
   counts are on different scales), Q1 = line furthest below the model's expected value.
4. **|model − Kalshi mid|** — bins [0, 0.05), [0.05, 0.10), [0.10, 0.15), [0.15, 0.20), ≥ 0.20 (the app's picks
   stop at 0.20, but the main set is not gap-limited).
5. **player prior games in role** — 21–40, 41–80, 81+.
6. **change in recent usage** — ratio of the player's share in his last 3 games in the role to his share in the 16
   games in the role before those 3 (all before the game date; across seasons). Share = targets / team targets for
   receiving yards and receptions; carries / team carries for rushing yards and rushing attempts; (carries +
   targets) / (team carries + team targets) for rush + rec yards; for QB stats (passing yards, TDs, attempts,
   completions, interceptions) the ratio of his average pass attempts per game. Terciles cut within these three
   groups (receiver, rusher/skill, QB). Fewer than 6 earlier games in the role: `n/a`.
   *Deviation from "season share", stated up front:* the data are 2026 weeks 1–6, so a player has at most 5
   current-season games — "last 3 vs season" would compare a window with itself. The 16-game baseline is the
   model's own long window.
7. **game total** — terciles of Kalshi's pre-game expected total (the line where the total ladder's mid crosses 50%).
8. **spread** — terciles of the player's team's expected margin (the home margin where the spread ladders' mids
   cross 50%, from both teams' ladders; if the ladders cannot be read, converted from the moneyline mid with a
   normal margin, sd 13.5). Positive = player's team favored.
9. **team implied points** — terciles of (total + team margin) / 2 for the player's team.
10. **opponent defense vs that stat** — terciles, within stat, of the opponent's season-to-date (2026, games before
    the game date) amount of that stat allowed per game (to all opposing players combined; rush + rec yards = rushing
    + receiving yards allowed). Week 1 rows: `n/a`.
11. **home / away** — the player's team is the home or the away team.

## Numbers reported for every slice bin (all rows, and each half)
Rows, games; model log loss and Kalshi-mid log loss (chances clipped to [0.01, 0.99]) and their difference with a
95% game-bootstrap interval; calibration: average model chance, actual hit rate, average Kalshi mid.

## Halves (fixed now)
The 80 games (key `date_away_home`) are sorted and shuffled with `numpy.random.default_rng(20261020)`; the first
half (40 games) is **discovery**, the second **confirmation**. Bootstraps resample games within a half with
replacement, 4,000 draws, seed 20261021.

## Lead criterion (fixed now)
Two kinds of lead are checked in every eligible bin (not `n/a`, ≥ 300 rows in **each** half):

**A — the model's error is different there.** Calibration gap g = average model chance − actual hit rate.
D = g(bin) − g(all rows of that half), with its bootstrap interval (bin and all-rows recomputed on each resample).
A-lead if, in discovery, |D| ≥ 0.05 and the interval excludes 0, **and** in confirmation D has the same sign with the
interval excluding 0. Applies to slices 1, 3, 5, 6, 7, 8, 9, 10, 11. It is **not** applied to slices 2 and 4: they are
cut on the model − Kalshi gap itself, so a model that simply knows less than Kalshi shows a calibration gap there by
construction (too high where it leans Over, too low where it leans Under). Counting those would find a "lead" that is
just the known result.

**B — the model beats Kalshi there.** Realized edge E = average over rows of s·(y − mid), s = +1 where the model leans
Over, −1 where it leans Under (ties dropped): how far the outcome moved from Kalshi's price in the direction the model
pointed. A model that knows less than Kalshi everywhere has E ≤ 0 in every slice. B-lead if E > 0 with the interval
excluding 0 in discovery **and** in confirmation (no size threshold: any reliable positive edge over the mid is
news). Applies to all 11 slices.

**Chance hits.** Reported two ways: (a) the analytic rate — with two independent 95% intervals and a same-sign
requirement a null bin passes with probability ≈ 0.025 × 0.025 × 2 ≈ 0.00125 (A's 5-point size bar makes it
smaller), times the number of eligible bins; (b) a placebo: 200 times, rows are assigned to random fake bins of the
same sizes as a real slice family (3, 5, …), the same A and B checks run, and the average number of placebo hits per
run is reported. A real slice family is only interesting if its hits clearly exceed the placebo.

## What gets reported, fixed now
- Everything: every bin's numbers, every lead check, the placebo count — including "no leads found".
- **If no bin qualifies** (A or B): the report says plainly that the model is uniformly less informed than Kalshi —
  its errors are not concentrated anywhere these slices can see — and that new inputs of these kinds are unlikely to
  save it.
- **If a lead is found:** describe it, propose (not build) the minimal fix, and write down a locked confirmation that
  uses only games after the fix date. The owner decides whether to do it.
- The live 2026-10-18 HIGH picks (57% given, 44% won) are context only and are not tested here.

## Files
- `nfl/NFL_PROPS_DIAGNOSIS_V1_PLAN.md` (this file, committed first)
- `nfl/kalshi_game_lines_history_v1.py` — read-only Kalshi game-line collector (GitHub Actions)
- `nfl/nfl_props_diagnosis_v1.py` — the analysis
- `.github/workflows/nfl_props_diagnosis.yml` — runs both in GitHub Actions, commits outputs
- Outputs in `nfl/props_history/`: `kalshi_game_lines_history_v1.csv`, `diagnosis_v1_rows.csv`,
  `diagnosis_v1_results.json`, `diagnosis_v1_results.md`

The app is not changed. No frozen file is changed.
