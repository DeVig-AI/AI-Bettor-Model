# NBA roster changes: does the model need them?

Model C (the NBA moneyline model, `nba/nba_live_tracker_lock.py`, frozen) builds its form numbers from each team's
last 10 games, and those roll straight across seasons. On opening night a team is judged on last April, whoever
left over the summer.

`roster_backtest_v1.py` tested three fixes on 2022-23 to 2025-26, walk-forward, on the 623 games where a team's
10-game window still reached into last season (sportsdataverse ESPN player box scores; opening roster = players in a
team's first 5 games):

| Early-season games (n = 623) | Log loss | Accuracy | vs Model C (95% range) |
|---|---|---|---|
| Model C as is | 0.6356 | 63.4% | |
| Shrink last season's part of the window by roster turnover | 0.6348 | 64.9% | -0.0008 (-0.0072 to +0.0057) |
| Shrink + talent change as two new features | 0.6427 | 63.1% | +0.0071 (-0.0019 to +0.0161) |
| Shrink + talent change added straight into the form numbers | 0.6388 | 63.6% | +0.0032 (-0.0103 to +0.0174) |

None is clearly better (every range crosses zero), so the frozen model stays as it is. What changed instead:
`nba/nba_roster_changes_v1.py` writes `nba/roster_changes.json` every day (share of each team's late-season minutes
still on the roster, main arrivals and departures), and the app shows it on NBA games through November, with a
"Roster changed" tag on picks where either team brought back under 60% of those minutes.

Full numbers: `roster_backtest_v1_results.json`. Rerun: `python3 roster_backtest_v1.py <dir with player_box_YYYY.csv>`.
