# NFL injury study v1 -- pre-registration

Written and committed **before any result of this study was computed**. Only the data files' availability and
column names were checked (injury reports exist from 2009, snap counts from 2013). Once this file and the script
`research/injuries/nfl_injury_study_v1.py` are committed, they are locked (`FROZEN.sha256`); the study runs once,
and its numbers are reported as they come out, including the ones that make injuries look useless.

**Expected result, stated up front:** the closing line already prices injuries (teams' injury reports are public
days before kickoff and the market moves on them within minutes). The most likely outcome is that injury features
**help a model that does not know the line** (question B) but add **nothing beyond the closing line** (question A).

This is not a Research Lab candidate. The Lab's signals (Constitution v9 A3.3e) cannot use injury reports, and its
training seasons (1999-2005) predate them, so this is a stand-alone study. It never touches the Lab's sealed 2025
season: every file it reads is cut at 2024.

## Data (all public, nflverse)
- Schedule, final scores and closing lines: `nflverse-data` releases `schedules/games.csv` (`spread_line` = closing
  expected home margin, as the Lab uses), regular season and playoffs.
- Injury reports: `injuries/injuries_<season>.csv` (`report_status`: Out, Doubtful, Questionable), the official
  pre-game report for that week.
- Snap counts: `snap_counts/snap_counts_<season>.csv` (each player's share of offensive / defensive snaps per game).
- Weekly rosters: `weekly_rosters/roster_weekly_<season>.csv` (each player's status with his team that week: ACT
  active, INA game-day inactive, RES injured reserve, PUP, SUS, CUT, ...). Needed because a player put on injured
  reserve leaves the injury report (checked on one known case before writing this: Dak Prescott, 2020, never on the
  report; roster status INA in week 6, then RES).
- Player ids: `players/players.csv` (`gsis_id` <-> `pfr_id`), to join reports to snap counts; then name + team.
- Seasons **2013-2024** (snap counts start in 2013). Games: regular season and playoffs with final scores and a
  closing line.

## Features (per team, per game, from information published before kickoff)
- **Regular:** a player who played at least 50% of his team's offensive or defensive snaps in at least half of the
  team's previous games **this season**, up to the last 3 (1 of 1, 1 of 2, 2 of 3); nothing from the game itself or
  later. Same season only, so players who left in the off-season are not counted as missing in week 1 (a first
  check of the features, before any outcome was computed, found up to 14 "missing" regulars per team when last
  season's games counted). Week 1 therefore has no injury features.
- **Last game's QB:** the quarterback with the most offensive snaps in the team's previous game this season.
- **Unavailable:** listed **Out or Doubtful** on this week's report, **or** on that week's team roster with any
  status other than ACT (INA, RES, PUP, SUS, CUT, ...), **or** missing from that week's team roster (traded,
  released). Game-day inactives (INA) are named about 90 minutes before kickoff, so they are known before the
  closing line. A roster snapshot taken after the game could in principle show a status from the game itself; that
  risk is stated here and not otherwise handled.
- `qb_out` = 1 if last game's QB is unavailable, else 0.
- `reg_out` = number of regulars (not that QB) unavailable.
- `reg_q` = number of regulars (not that QB) listed Questionable and not unavailable.
- Game features: home minus away of each (`d_qb`, `d_out`, `d_q`).
- **Base (no injuries, no line):** `d_form` = home minus away average point margin over each team's previous 8 games
  (any season; a team with none starts at 0), and `d_rest` = home minus away rest days (from the schedule).
- A player in the report but not in snap counts is simply not a regular; the share of report rows matched is reported.

## Split
| Use | Seasons |
|---|---|
| Fit (all coefficients) | 2013-2018 |
| Test (reported) | 2019-2024 |

## Question A -- beyond the closing line (the money question). **Primary.**
- `r` = home margin minus `spread_line` (cover margin, points), as Lab A5.
- Fit `r ~ 1 + d_qb + d_out + d_q` by least squares on 2013-2018. On each test game, the model's side is
  `sign(b_qb·d_qb + b_out·d_out + b_q·d_q)` (the intercept is left out: it is the always-home/always-away bias, the
  Lab's line-only baseline); no injury difference = no pick.
- **Effect** `E = mean over all test games of side·r` minus the same for the line-only baseline (sign of the
  training-season mean of r on every game), Lab A5. Game bootstrap, 10,000 resamples, seed 20261019; one-sided
  p = 1 − Φ(E / SE).
- **Pass:** E > 0 and p < 0.05. Also reported (never used to pass): the pick record and ROI at Kalshi pricing (cost
  0.5175 per $1 contract, break-even 51.75%), and E for 2019-21 and 2022-24 separately.

## Question B -- does a model that does not see the line get better? (the "train the model on injuries" question)
- Logistic regression of home win (ties dropped) on the base features, and on base + `d_qb`, `d_out`, `d_q`; plain
  maximum likelihood (no penalty), fit on 2013-2018.
- Reported on 2019-2024: log loss, Brier score and accuracy of both; the log-loss difference with a paired game
  bootstrap (10,000, seed 20261019) 95% interval.
- **Helps** if base + injuries has lower test log loss and the 95% interval of the difference excludes 0.
- Also reported: the margin coefficients in points from a least-squares fit of home margin on the same features
  (2013-2018), and the same fit of `spread_line` (how many points the market moves for each), to show whether the
  market already prices them.

## Output
`research/injuries/results_v1.json` and `results_v1.md`, written by the script. Nothing feeds a DeVig pick, the
app or a paper test. If injuries help B, a future NFL model version would need its own pre-registration.
