# DeVig Research Lab (NFL)

Research lab → Inspector General → Constitution → paper season. GitHub Actions does all the compute,
deterministically; there is no AI anywhere in the loop. Results are public in this repo; the public app does not show,
link or mention the lab, and the Ask AI chat never reads these files. The owner follows it on the private `/lab` page,
which reads `status.json` (contract: `STATUS_SCHEMA.md`).

**Expected result: most likely nothing passes the sealed exam.** Every number is reported plainly either way.

| File | What it is |
|---|---|
| `RESEARCH_LAB_CONSTITUTION.md` | The rules: data split, pricing, metric, multiple-testing rule, exam budget, promotion and stop rules. Hash-locked in `FROZEN.sha256`; changes = a new version, logged in `CONSTITUTION_LOG.md` and `FROZEN_CHANGES.md`. |
| `queue/NNN-<id>.yaml` | Ideas waiting their turn, in order. Free to edit, reorder or delete until the lab takes them (18 per run). |
| `candidates/*.yaml` | One file per idea that has been taken to run; locked once it has run. |
| `LEDGER.csv` | Every attempt, never edited or deleted (append-only; the frozen guard checks it). |
| `results/<id>.json` | Every number for one candidate: three gates, pooled, rule eras, pick record at Kalshi pricing. |
| `status.json`, `STATUS.md` | Generated after every run (the /lab page and a readable copy). |
| `LESSONS.md` | Generated, EXPLORATORY: did each idea help, fade or do nothing against the model it builds on. |
| `exam/EXAMS.csv` | Sealed 2025 exams (at most 3; each final). |
| `promoted.json`, `paper/<name>.csv` | Promoted models ("Promoted, not proven") and their pre-kickoff Kalshi paper log. |
| `data/nfl/` | The lab's cache of nflverse data, seasons 1999–2024 only. 2025 is sealed and never stored here. |
| `constitution/` | Earlier Constitution versions, unchanged (v1). |
| `lab/` | The code: `lab.py` (runner), `inspector.py` (Inspector General), `models.py`, `metrics.py`, `data.py`, `report.py`. |

## How it runs
- **Research Lab -- nightly run** (`.github/workflows/research_lab.yml`, 3:37am ET and on demand): takes the next
  ideas from `queue/` (up to 18 per run, counting any registered candidate that hasn't run), commits that move, marks
  them running on /lab, runs them through the gates (Constitution v2: 2006–12, 2013–18, 2019–24; training 1999–2005),
  writes their results and ledger rows, locks their files, then runs the Inspector General's review. Nights with
  nothing new stop after one check. The 18 v1 candidates ran under v1's seasons; their rows say so.
- **Research Lab -- Inspector General** (`.github/workflows/research_inspector_general.yml`): `review` on demand;
  `exam` only when the owner starts it (spends 1 of 3 sealed exams on the best lab pass, recorded and pushed before the
  sealed data is downloaded); `paper` every 3 hours, which does nothing until a model is promoted.

## Adding an idea
Add `research/queue/<next number>-<new-id>.yaml` (copy a similar one, change the parameters, write the reason) and
commit it to `main`; it runs when its turn comes, 18 per night. Every file is an attempt in the Holm correction, so each one makes it
harder for every candidate to pass: add ideas sparingly, and never known betting angles (Constitution A3.5).

## Locally
```
python3 -m unittest discover -s research/tests -t .   # synthetic data only
python3 -m research.lab.lab pending
```
Running the lab itself is the workflow's job, so results are produced once, in public, in the order they were registered.

## Other sports
The Constitution's Part A is shared; each sport has its own Part. **College football** is Part C (since v2; v3 adds
where its data is kept): everything lives under `research/cfb/` (candidates, results, `LEDGER.csv`, `exam/`,
`STATUS.md`, `LESSONS.md`). Its data comes from CollegeFootballData with the `CFB_API_KEY` secret, only in GitHub
Actions (`Research CFB -- data`: history once, then weekly in season); by the provider's terms the data files are
never committed and live in the private Actions cache, while `research/cfb/data/MANIFEST.json` (fingerprints) and
`CALLS.csv` (every API call) are. The nightly lab runs NFL, then CFB; the Inspector General takes `sport: NFL|CFB`.
Each sport's correction counts its own attempts; the count across all sports is reported next to it.
`status.json` keeps NFL at the top level and other sports under `by_sport` (see `STATUS_SCHEMA.md`); /lab has a
sport switch.

```
python3 -m research.lab.lab pending --sport CFB
python3 -m research.lab.inspector review --sport CFB
```
