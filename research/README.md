# DeVig Research Lab (NFL; college football in `cfb/`, same loop)

A closed loop: **search → confirm → sealed exam → paper season (with automatic removal)**. GitHub Actions does all
the compute, deterministically; there is no AI anywhere in the loop. Results are public in this repo; the public app
does not show, link or mention the lab, and the Ask AI chat never reads these files. The owner follows it on the
private `/lab` page, which reads `status.json` (contract: `STATUS_SCHEMA.md`).

1. **Search** (weekly): scores every model setting and blend on the menu (`search/MENU.yaml`) on 2006–16 only, then
   refines around the best and blends the top performers. Search scores are exploratory and free: they never count.
2. **Confirm** (nightly): at most 2 per market per round that look real in search (t ≥ 2, positive in all three
   search periods, not a near-copy of an earlier one) are tested on 2017–24, which the search never sees. Each
   confirmation is an attempt in the Holm correction.
3. **Sealed exam** (automatic): the best lab pass, if any, sits one of 3 exams on 2025. Final.
4. **Paper season**: a pass is promoted ("Gauntlet-N", "Promoted, not proven"), tracked at Kalshi prices before
   kickoff, and stopped automatically if it falls clearly behind.

**Expected result: most likely nothing passes the sealed exam.** Every number is reported plainly either way.

| File | What it is |
|---|---|
| `RESEARCH_LAB_CONSTITUTION.md` | The rules: data split, pricing, metric, multiple-testing rule, exam budget, promotion and stop rules. Hash-locked in `FROZEN.sha256`; changes = a new version, logged in `CONSTITUTION_LOG.md` and `FROZEN_CHANGES.md`. |
| `search/` | The menu, every configuration scored (`SCORES.csv`), each round (`ROUNDS.csv`), and `LEADERBOARD.md` with what the search learned. |
| `queue/NNN-<id>.yaml` | Hand-written ideas waiting to be confirmed directly (each costs an attempt). |
| `candidates/*.yaml` | One file per idea sent to confirmation (by the search, the queue or by hand); locked once it has run. |
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
- **Research Lab -- nightly run** (`.github/workflows/research_lab.yml`, 3:37am ET and on demand): a search round when a
  week has passed (or when started with "search"), then confirmation of every candidate without a ledger row (at most
  18), then the Inspector General's review. Nights with nothing to do stop after one quick check.
- **Research Lab -- Inspector General** (`.github/workflows/research_inspector_general.yml`): starts after each lab run
  and sits the sealed exam only if a lab pass exists; `review`, `exam` and `paper` by hand; `paper` every 3 hours, which
  does nothing until a model is promoted.

## Adding an idea
Best: add a family or a setting value to `research/search/MENU.yaml`; it competes in the next search round for free.
Or put `research/queue/<number>-<new-id>.yaml` in the queue to confirm it directly, which costs an attempt. Never known
betting angles (Constitution A3.5).

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
`CALLS.csv` (every API call) are. College football runs the same loop since v5 (its own menu in `research/cfb/search/`; search 2018, 2019, 2021; confirmation 2022, 2023, 2024). The nightly lab runs NFL, then CFB; the Inspector General takes `sport: NFL|CFB`.
Each sport's correction counts its own attempts; the count across all sports is reported next to it.
`status.json` keeps NFL at the top level and other sports under `by_sport` (see `STATUS_SCHEMA.md`); /lab has a
sport switch.

```
python3 -m research.lab.lab pending --sport CFB
python3 -m research.lab.inspector review --sport CFB
```
