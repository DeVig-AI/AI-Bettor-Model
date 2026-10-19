# First back-test run on INCOMPLETE data (kept for the record)

On 2026-10-19 09:00 UTC the workflow ran the back-test although ~1,560 events (all six series, Nov 2025 to mid-Jan
2026) had come back with no markets: the collector's "complete" flag did not count events whose markets could not
be read. A probe (nba/props_history/probe/probe_v1.json) showed Kalshi does serve those markets, so they were
collected and the pre-registered back-test was run again on the full history. These files are that first run,
moved here unread and unchanged; its numbers are reported next to the final ones.
