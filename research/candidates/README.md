# Research Lab candidates

One file per candidate (Constitution A3): model family, every parameter value, the candidate it builds on (`parent`),
and a one-line reason. A file is committed before it runs and locked (FROZEN.sha256) once it has run. To try a new
idea, add a new file with a new `id`; never edit one that has run. Every file counts as an attempt in the
multiple-testing correction, so add ideas sparingly.

Families (code in `research/lab/models.py`):
- `elo` (market `spread`): team ratings, forecast = Elo gap ÷ `elo_per_point` = expected home margin.
  `mov`: none | 538 | nfelo · `qb`: none | 538 · `hfa_mode`: fixed | rolling (`hfa_seasons` seasons of home margins).
- `pace_eff` (market `total`): plays × points per play, offence against defence, rolling with half-life `halflife`
  games; `efficiency`: points | epa; `calibrate`: one linear fit on the training seasons.

No known betting angles (weather, low-total dogs, key numbers, ...): Constitution A3.5.
