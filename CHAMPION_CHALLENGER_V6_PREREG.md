# Champion / challenger V6: backup lock runs for NBA

Written 2026-11-07, the owner's decision. Its SHA-256 is in `FROZEN.sha256`; any change is a V7. V1-V5
(`CHAMPION_CHALLENGER_V1_PREREG.md` .. `..._V5_...`) stay as they are. Everything in V5 holds except what is listed
below.

## Why

V5 locks each NBA game on its own day at the daily lock run (11am ET) or a manual run. On 2026-11-07 GitHub skipped
the 11am scheduled run, so that night's games (BKN @ ATL, NYK @ CLE, WAS @ OKC and others) had no pick until a manual
run at about 1pm ET. The night before could not lock them either: their teams' previous games were not final yet. A
skipped run should not leave a slate blank.

## Changes from V5

1. **Lock time.** V5 rule 3's "the daily lock run (11am ET, or a manual run)" becomes "the day's first lock run":
   11am ET, with backup runs at noon and 1pm ET that lock only when no lock run has finished yet that Eastern day,
   or a manual run. Each finished lock run writes its Eastern date to `nba/NBA_LOCK_RUNS.txt`. Everything else in
   rule 3 holds: game-day games only, from the latest official injury report at that time.
2. A backup run can be up to two hours later than 11am, so its injury report can be newer than the 11am one would
   have been. Tip-off is still hours away, and the test used a report about 30 minutes before tip, so this moves the
   live inputs closer to the tested ones, not further.

## Not changed

The model, its code (`nba/nba_live_tracker_lock_v2.py`), its cutoffs, the grader, every other slot and sport, and
the Research Lab's rules. No pick is back-filled. Not proven.
