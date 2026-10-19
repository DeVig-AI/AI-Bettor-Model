# Research Lab queue

Ideas waiting to run (Constitution v2 A3.3a). Files are `NNN-<id>.yaml`; the number is the order. Before each run the
lab moves the next ones, at most 18 per run, into `research/candidates/` (dropping the number) and commits that move;
then they run and count as attempts. Until then a queued idea is free to edit, reorder (rename the number) or delete.

Families: `team_rating` (opponent-adjusted offense/defense ratings; `metric`: points | epa | pass_epa | early_epa |
success | noto_epa | comp_epa; `pace` for totals: none | plays | seconds; `halflife` in games; `def_weight`;
`season_carry`), `blend` (weighted average of other candidates' forecasts), plus the v1 families (`elo`, `pace_eff`).
Coefficients that turn ratings into points are fit on the training seasons only (1999–2005).
