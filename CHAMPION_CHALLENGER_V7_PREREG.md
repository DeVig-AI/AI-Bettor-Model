# Champion / challenger V7: an NBA lock window instead of fixed lock times

Written 2026-11-10, the owner's decision. Its SHA-256 is in `FROZEN.sha256`; any change is a V8. V1-V6
(`CHAMPION_CHALLENGER_V1_PREREG.md` .. `..._V6_...`) stay as they are. Everything in V6 holds except what is listed
below.

## Why

V6 added backup lock runs at noon and 1pm ET. On 2026-11-10 GitHub skipped all three lock runs (15:00, 16:00 and
17:00 UTC). The only run in that stretch was the every-3-hours grading run, which started at 16:50 UTC (11:50am ET),
almost two hours late. Because a run locked only when its cron line was one of the three lock lines, that run graded
and did not lock, so the night's slate had no picks. Scheduled runs on the hour are the ones GitHub drops or delays most.

## Changes from V6

1. **Lock window.** "The day's first lock run" is now the first run that finishes a lock between 10:00am and 6:59pm
   Eastern, whichever schedule line started it (or a manual run, at any time). Any scheduled run in that window locks
   when no lock run has finished yet that Eastern day, as read from `nba/NBA_LOCK_RUNS.txt` on the latest `main`.
   The window starts at 10am because the 15:00 UTC run is 10am ET in winter (11am in summer); it ends at 7pm, the usual
   first tip-off.
2. **More backups.** Besides 15:00 UTC, backup runs start every 30 minutes at :23 and :53 past the hour, 15:23 to
   23:53 UTC. A backup run that finds the day already locked (or the clock outside the window) stops before doing
   anything.
3. As in V5 and V6, only game-day games lock, from the latest official injury report at that time, and a game that has
   already started is never locked (the existing pregame check in `nba/nba_live_tracker_lock_v2.py`). A late lock can
   miss early tip-offs; it never adds a pick after tip.

## Not changed

The model, its code (`nba/nba_live_tracker_lock_v2.py`), its cutoffs, the grader, every other slot and sport, and
the Research Lab's rules. No pick is back-filled. Not proven.
