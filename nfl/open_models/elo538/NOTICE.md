# FiveThirtyEight NFL Elo game model (vendored, unchanged)

Source: https://github.com/fivethirtyeight/nfl-elo-game (branch `master`), downloaded 2026-10-19.
Copyright (c) 2021 ABC News Internet Ventures. MIT License: see `LICENSE` in this folder, kept as published.

Every file here is an unmodified copy. `tools/models_compare.py` calls `Forecast.forecast` as-is, feeding it their
1920-2020 games (`data/nfl_games.csv`) followed by nflverse results from 2021 on. Checked on download: their code
reproduces all 16,810 of their published `elo_prob1` values (largest difference 1.7e-6).

| file | sha256 |
|---|---|
| LICENSE | 5c607ded77b85e160aad53f838aa3d65f6a8e2c0a5ae241884d9c4bccb2eacb5 |
| README.md | c6db43f511df8b11a677a691c8c319d265aa5f1c1c041dd7cd4699c36b6b2e90 |
| forecast.py | 9d572f614b15b69b2fb2ac2ddbae4000647366a00fbb9386584adef4322fbb59 |
| util.py | fcdf0e41f99d39f0f07f7b15a39e371784b34511baee8e6be0d7d75411a94855 |
| eval.py | 29f0666c3f36bf541e222893d82d457ce59856d812db4209af4aa1d092cf991c |
| data/initial_elos.csv | d9e5ef0c9d762128fd2a9da0107989de4ab5c9f1e52411864adae19c6528bdf1 |
| data/nfl_games.csv | af16cf3c5848393057fad07feea278f0a85ab7b57ddbfe42ed96b5c80e7d519d |

This is their plain game model. FiveThirtyEight's later published forecasts added QB, rest and travel adjustments
that are not in this open code, so its numbers differ from what 538 used to publish after 2019.
