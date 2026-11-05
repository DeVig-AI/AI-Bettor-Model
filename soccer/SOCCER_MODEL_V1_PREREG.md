# SOCCER_MODEL_V1 — pre-registration

Written 2026-11-05, before the model's first live number was locked. Locked in `FROZEN.sha256` with
`tools/soccer_model_live.py` and `soccer/soccer_v1_start.json`; any change to the model below becomes v2. Paper only:
nothing is bet, no account is used. New, not proven, and not a claimed edge over Kalshi.

## What it is
DeVig's own soccer model for the league matches of the Premier League, LaLiga, Serie A, the Bundesliga and Ligue 1,
under the key `devigsoccer` ("DeVig Soccer v1"). For each match it gives a home win, draw and away win chance over 90
minutes, the same three outcomes Kalshi prices. It is the champion of the `SOCCER.ml` slot
(`CHAMPION_CHALLENGER_V4_PREREG.md`): the app shows its chances beside Kalshi's, with no locked pick.

## Inputs (all known before kick-off; no prices, injuries, lineups or transfers)
Final scores from ESPN's public scoreboards (eng.1, esp.1, ita.1, ger.1, fra.1), league matches only, in kick-off
order. Each team (league + ESPN team id) carries an attack number a and a defence number d (log-goals scale); each
league carries a goal level mu and a home edge h.
- Expected goals: home = exp(mu + h + a_home − d_away), away = exp(mu + a_away − d_home) (no h at a neutral ground).
- After each final, with the error e = goals − expected goals for each side (each side's goals counted up to 4):
  the scorer's a moves by +k × e and the other side's d by −k × e. k = 0.015 × (1 + 0.5 × e^(−games this season / 6)),
  so a team's first games of a season move it more. The league's mu moves by 0.002 × (both errors) and h by
  0.002 × (home error − away error) / 2.
- A team that did not play in the league the season before (promoted, or back after time away) starts 0.2 below the
  league's current average attack and defence. Ratings carry fully into a new season (carry 1.0).
  Said plainly, a quirk found after the one-time score and kept, because it is what was scored: with no teams yet
  (2013-14, the first season), the average is taken over the teams already seen, so each new team started 0.2 below
  the ones before it and the first season's starting levels depended on the order teams first played. Rerun with every
  2013-14 team starting level instead (checked after the score, changing nothing): by 2019-20 no team's attack minus
  defence differs by more than 0.03 (teams spread about 0.15 apart), and the log loss is the same to 4 decimals on
  2019-2022 (0.9915) and 2023-2025 (0.9827). It never applies live: every league in the start file has rated teams.
- Chances: the two expected-goals numbers as independent Poisson goal counts (0-10 each) with the Dixon-Coles
  low-score adjustment ρ = −0.05, summed into home win / draw / away win and rescaled to add to 1.

## How it was chosen
On ESPN's league finals for 2013-14 through 2025-26 (season Y = the one starting in Y; 23,418 matches; 2019-20 is
short because Ligue 1 stopped; fetched with `soccer_model_live.py fetch`, never committed):
- 2013-2018 warm the ratings up and are scored nowhere.
- Settings searched by three-way log loss on 2019-2022 (7,199 matches; the COVID seasons are in it, as in the
  Lab's soccer Part). Round 1 (k {.02,.03,.04,.05}, early {0,1,2}, carry {.7,.85,1}, promoted start {.1,.2,.3},
  goal cap {4, none}, ρ {0,−.05,−.1,−.15}) landed on edges and showed the promoted start had no effect (new teams
  started level with an average that had drifted to the same number); it was changed to "below the league's
  current average" and round 2 widened the grid (k {.01,.015,.02,.025}, early {0,.5,1}, carry {.85,.95,1},
  promoted start {0,.1,.2,.3}, cap {4, none}, same ρ). The round-2 grid is the one in the script. Picked: the best,
  log loss 0.9915 (the next four within 0.0002). Carry 1.0 is the top of its range; carry above 1 has no meaning.
- League base rates (each league's home / draw / away share on 2013-2018) score 1.0754 on the same seasons.
- Scored once on 2023-2025 (5,255 matches): **log loss 0.9827, the likeliest outcome happened 52.7% of the time**
  (2023 0.973, 2024 0.981, 2025 0.994). League base rates (fit on 2013-2022): 1.0756. Said home / draw / away
  43.0% / 24.9% / 32.1% on average; happened 43.0% / 25.6% / 31.4%. A little too cautious on strong home
  favourites (said 64%, won 68%; said 74%, won 79%) and on rare home wins (said 16%, won 14%). Past ESPN results
  carry no prices here, so there is no comparison with a closing price.
- The Research Lab's soccer Part (Constitution v16, Part F) is not touched: this model is not a Lab candidate, reads
  no Lab file, and never stores a 2026-27 match (the Lab's sealed season). Its live runs read this season's finals
  from ESPN into memory only.

## Start file
Full carry means every rating depends on all seasons since 2013, so the repo keeps `soccer/soccer_v1_start.json`:
every team's a, d and last season in its league after 2025-26, and each league's mu and h (172 teams, numbers only,
no match rows), built by `soccer_model_live.py snapshot`. A live run starts from it and replays this season's
finals from ESPN.

## This season so far
At writing: 452 league finals of 2026-27 replayed, none graded yet. On the 48 league matches of the next 7 days,
all of which Kalshi lists, the model and Kalshi have the same likeliest outcome 94% of the time and are 3.6 points
of chance apart per outcome on average (a description, not a grade).

## Live
`tools/soccer_model_live.py` (hourly in models_compare.yml) writes `live/devig/soccer.json` for league matches in the
next 7 days; `tools/soccer_track.py` locks its and Kalshi's chances before each kick-off and grades them
(`live/devig/soccer_record.json`), as `CHAMPION_CHALLENGER_V4_PREREG.md` says.

## What would change it
A v2 (new file), never an edit here. The likely outcome is that it trails Kalshi's prices, which use far more than
final scores; that would be reported, not fixed in place.
