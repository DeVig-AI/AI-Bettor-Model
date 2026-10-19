# Research Lab queue

Hand-written ideas can wait here (Constitution v4 A3.3a-b): files `NNN-<id>.yaml`, the number is the order. The lab takes
them, at most 18 confirmations per run, moves them into `research/candidates/` and commits that before they run. Until
then a queued idea is free to edit, reorder or delete. A queued idea skips the search and goes straight to
confirmation, so it costs an attempt; adding a setting to `research/search/MENU.yaml` instead lets it compete in the
search first, which is free.
