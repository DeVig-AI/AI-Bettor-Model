# Research inputs (collected, not yet used by the lab)

Free, public box scores for the Research Lab's NBA, NHL and MLB chambers (and WNBA, for later), collected weekly by
GitHub Actions (`.github/workflows/research_inputs.yml`, code in `tools/research_inputs.py`). One gzipped CSV per
season; `<season>` is the year the season starts (NBA/NHL 2016 = 2016-17). No prices or lines are stored here.

| Folder | Files | Source |
|---|---|---|
| `nba/`, `wnba/` | `team_games_<season>.csv.gz` (score, shooting, rebounds, turnovers, fouls), `player_games_<season>.csv.gz` (minutes, starter, played or not and why not) | ESPN box scores as published by [sportsdataverse](https://github.com/sportsdataverse/sportsdataverse-data) |
| `nhl/` | `goalie_games_<season>.csv.gz` (started, time on ice, shots against, saves, goals against) | the NHL's public API; skaters are in `nhl/data/` |
| `mlb/` | `games_<season>.csv.gz` (teams, score, park, day/night, both starting pitchers; no umpires) | Retrosheet game logs |

- **The lab does not read these files yet.** Using any of them in a model is a new input, so it needs a new
  Constitution version that lists it (A3.3e), written before any of it is compared with a line.
- **The sealed exam season (2021 for NBA, NHL and MLB, Part D1) is never fetched or stored**, and nothing before 2011.
- Each folder's `MANIFEST.json` lists the seasons held and their game counts; `DONE.txt` lists finished seasons that are
  not fetched again.

The information used here was obtained free of charge from and is copyrighted by Retrosheet. Interested parties may
contact Retrosheet at www.retrosheet.org.
