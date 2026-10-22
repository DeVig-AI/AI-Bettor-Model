// ESPN-shaped NFL feeds for the game page tests (scoreboard + game summary, a SF @ SEA drive in the 4th quarter).
// Hand-built in the shape of site.api.espn.com's football responses; only the fields functions/api/live.js reads.

const SF = {id: "25", abbreviation: "SF"}, SEA = {id: "26", abbreviation: "SEA"};

// next: one play later (G.Kittle for 19 yards: 1st & 10 at the SEA 18); td: then C.McCaffrey's touchdown (SF 28-26)
export function scoreboard(kickoffIso, {state = "in", situation = true, next = false, td = false} = {}) {
  return {events: [{id: "401", date: kickoffIso, status: {type: {state, shortDetail: state === "in" ? "4th - 11:49" : "Final"}},
    competitions: [{
      competitors: [{homeAway: "home", score: "26", team: SEA}, {homeAway: "away", score: td ? "28" : "21", team: SF}],
      situation: !situation || td ? undefined : next
        ? {down: 1, distance: 10, shortDownDistanceText: "1st & 10", possessionText: "SEA 18", isRedZone: true,
           homeTimeouts: 3, awayTimeouts: 2, possession: "25", lastPlay: {text: KITTLE}}
        : {down: 3, distance: 14, yardLine: 63, downDistanceText: "3rd & 14 at SEA 37",
           shortDownDistanceText: "3rd & 14", possessionText: "SEA 37", isRedZone: false, homeTimeouts: 3, awayTimeouts: 2,
           possession: "25", lastPlay: {text: "B.Purdy pass incomplete short middle intended for G.Kittle."}},
    }]}]};
}

const play = (id, team, text, extra = {}) => Object.assign({id, text, type: {text: "Pass Reception"}, period: {number: 4},
  clock: {displayValue: "12:00"}, scoringPlay: false, statYardage: 0, awayScore: 21, homeScore: 26,
  start: {down: 1, distance: 10, shortDownDistanceText: "1st & 10", team: {id: team.id}}}, extra);

const KITTLE = "(Shotgun) B.Purdy pass short middle to G.Kittle to SEA 18 for 19 yards.";
export function summary({next = false, td = false} = {}) {
  const d = {
    header: {competitions: [{competitors: [{homeAway: "home", team: SEA}, {homeAway: "away", team: SF}]}]},
    drives: {
      previous: [{id: "d1", team: SEA, description: "8 plays, 75 yards, 4:10", result: "TD", displayResult: "Touchdown",
        plays: [play("p1", SEA, "K.Walker 1 yard rush for a TOUCHDOWN. J.Myers extra point is BLOCKED.",
          {type: {text: "Rushing Touchdown"}, clock: {displayValue: "14:31"}, scoringPlay: true, statYardage: 1,
           start: {down: 1, distance: 1, shortDownDistanceText: "1st & Goal", team: {id: "26"}}})]}],
      current: {id: "d2", team: SF, description: "5 plays, 37 yards, 2:42", offensivePlays: 5, yards: 37,
        start: {yardLine: 26, text: "SF 26"},
        plays: [
          play("p2", SF, "B.Purdy pass short right to C.McCaffrey to SF 35 for 9 yards.", {clock: {displayValue: "13:41"}, statYardage: 9}),
          play("p3", SF, "(Shotgun) B.Purdy pass deep right to B.Aiyuk pushed ob at SEA 33 for 28 yards.",
            {clock: {displayValue: "12:31"}, statYardage: 28, start: {down: 1, distance: 10, shortDownDistanceText: "1st & 10", team: {id: "25"}}}),
          play("p4", SF, "B.Purdy pass incomplete short middle intended for G.Kittle.",
            {type: {text: "Pass Incompletion"}, clock: {displayValue: "11:49"},
             start: {down: 2, distance: 14, shortDownDistanceText: "2nd & 14", team: {id: "25"}},
             end: {down: 3, distance: 14, shortDownDistanceText: "3rd & 14", possessionText: "SEA 37", yardsToEndzone: 37, team: {id: "25"}}}),
        ]},
    },
    scoringPlays: [
      {team: SF, period: {number: 4}, clock: {displayValue: "14:58"}, type: {abbreviation: "TD"}, text: "B.Aiyuk 22 Yd pass from B.Purdy (J.Moody Kick)", awayScore: 21, homeScore: 20},
      {team: SEA, period: {number: 4}, clock: {displayValue: "14:31"}, type: {abbreviation: "TD"}, text: "K.Walker 1 Yd Run (Kick blocked)", awayScore: 21, homeScore: 26},
    ],
    boxscore: {
      teams: [
        {team: SF, statistics: [{name: "totalYards", displayValue: "338"}, {name: "firstDowns", displayValue: "19"}, {name: "turnovers", displayValue: "1"}]},
        {team: SEA, statistics: [{name: "totalYards", displayValue: "301"}, {name: "firstDowns", displayValue: "17"}, {name: "turnovers", displayValue: "0"}]},
      ],
      players: [{team: SF, statistics: [{name: "passing", keys: ["completions/passingAttempts", "passingYards", "yardsPerPassAttempt", "passingTouchdowns", "interceptions"],
        labels: ["C/ATT", "YDS", "AVG", "TD", "INT"], athletes: [{athlete: {displayName: "Brock Purdy"}, stats: ["20/29", "236", "8.1", "2", "0"]}]}]}],
    },
  };
  if (next || td) d.drives.current.plays.push(play("p5", SF, KITTLE, {clock: {displayValue: "11:12"}, statYardage: 19,
    start: {down: 3, distance: 14, shortDownDistanceText: "3rd & 14", team: {id: "25"}},
    end: {down: 1, distance: 10, shortDownDistanceText: "1st & 10", possessionText: "SEA 18", yardsToEndzone: 18, team: {id: "25"}}}));
  if (td) d.drives.current.plays.push(play("p6", SF, "C.McCaffrey right tackle for 18 yards, TOUCHDOWN. (J.Moody Kick)",
    {type: {text: "Rushing Touchdown"}, clock: {displayValue: "10:40"}, statYardage: 18, scoringPlay: true, awayScore: 28, homeScore: 26,
     start: {down: 1, distance: 10, shortDownDistanceText: "1st & 10", team: {id: "25"}}}));
  return d;
}

// A fetcher for functions/api/live.js's handle(): ESPN URLs -> these feeds.
export function espnFetcher(kickoffIso, opts) {
  return async url => {
    const body = /\/summary\?event=401/.test(url) ? summary() : /\/football\/nfl\/scoreboard/.test(url) ? scoreboard(kickoffIso, opts) : null;
    return body ? {ok: true, status: 200, json: async () => body} : {ok: false, status: 404, json: async () => ({})};
  };
}
