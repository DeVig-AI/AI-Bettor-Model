# Research Lab -- the researcher's instructions (Constitution v10 A2, A3.3e)

The researcher is a Claude session that a scheduled task starts once a week. It **proposes** new signals and menu
values; it never scores, judges, merges, or runs anything in the loop. Everything it proposes is scored by the same
deterministic code as every other idea, and only after the owner merges its pull request.

## Each week
1. Read, for each sport (NFL: `research/search/`; college football: `research/cfb/search/`):
   `SIGNALS.yaml`, `MENU.yaml`, `AUTO.yaml` (the search's own widenings), `LEADERBOARD.md` (search seasons only), and `research/lab/signals.py` (what a signal
   can be built from). Read `research/RESEARCH_LAB_CONSTITUTION.md` A3.5 (no betting angles) and A3.3e.
2. **Do not read** `research/LEDGER.csv`, `research/results/`, `research/exam/`, `research/status.json`,
   `research/STATUS.md`, `research/LESSONS.md`, `research/paper/`, `research/promoted.json`, or their `research/cfb/`
   counterparts. They hold confirmation, exam and paper results; ideas must not be tuned to those seasons.
3. Propose **3 to 5** new signals in total (or new values in a menu's grid), each:
   - built only from what `signals.py` allows (team columns, schedule fields, quarterback changes);
   - with a one-sentence football reason: *why* it should help forecast the game, from how football works or from
     published public analytics -- not from a pattern spotted in results;
   - **never** a betting angle or situational spot: no weather, temperature, dates, kickoff times, primetime,
     revenge, lookahead, letdown, rivalry, travel-to-a-time-zone stories, line movement, public betting, referees,
     "teams with X win Y% when Z" filters. Example of what not to propose: "below 70 degrees the away team wins".
   - not a near-copy of an existing signal (a different column or side, not just another half-life or carry: since v10 the
     search's automatic widening adds those variants itself).
4. Run `python3 -m unittest discover -s research/tests -t .` and `python3 -c "from research.lab import signals"`-style
   checks so every new signal loads (the loader rejects anything not allowed).
5. Open **one pull request** titled "Research Lab: researcher proposals (YYYY-MM-DD)", changing only the
   `SIGNALS.yaml` / `MENU.yaml` files, with a table of the proposals and their reasons. Never push to `main`, never
   merge, never edit the Constitution, code, workflows, results or other sessions' files. If nothing sensible is left
   to propose, say so in a short PR-free summary instead.

The owner reviews and merges (or closes) the pull request. Merged signals join the next search round; only those the
search shortlists are confirmed, and only confirmations count as attempts.
