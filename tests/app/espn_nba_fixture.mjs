// ESPN-shaped NBA feeds for the game page tests (scoreboard + game summary, LAL @ BOS in the 3rd quarter).
// Hand-built in the shape of site.api.espn.com's basketball responses; only the fields functions/api/live.js reads.

const LAL = {id: "13", abbreviation: "LAL"}, BOS = {id: "2", abbreviation: "BOS"};
const JUNK = {x: -214748340, y: -214748365};          // what ESPN puts on free throws

export function scoreboard(kickoffIso, {next = false} = {}) {
  return {events: [{id: "501", date: kickoffIso, status: {type: {state: "in", shortDetail: "3:02 - 3rd"}},
    competitions: [{competitors: [{homeAway: "home", score: "90", team: BOS}, {homeAway: "away", score: next ? "82" : "80", team: LAL}]}]}]};
}

let seq = 0;
const play = (team, text, pts, coordinate, extra = {}) => Object.assign({id: "pl" + (++seq), sequenceNumber: String(seq), text,
  type: {text: pts ? "Jump Shot" : "Jump Shot"}, period: {number: 3}, clock: {displayValue: "4:00"}, team: {id: team.id},
  scoringPlay: pts > 0, scoreValue: pts, shootingPlay: coordinate !== undefined, coordinate}, extra);

export function summary({next = false} = {}) {
  seq = 0;
  let a = 78, h = 81;
  const plays = [
    play(LAL, "Austin Reaves makes 12-foot floating jump shot", 2, {x: 30, y: 14}),
    play(BOS, "Jayson Tatum makes 26-foot three point jumper (Derrick White assists)", 3, {x: 8, y: 20}),
    play(LAL, "LeBron James misses 17-foot pullup jump shot", 0, {x: 16, y: 12}),
    play(BOS, "Jaylen Brown makes driving layup", 2, {x: 25, y: 3}),
    play(BOS, "Jaylen Brown makes free throw 1 of 1", 1, JUNK, {type: {text: "Free Throw - 1 of 1"}}),
    play(BOS, "Derrick White makes 25-foot three point jumper", 3, {x: 46, y: 74}),     // far half: folds to x 4, y 20
    play(BOS, "Jrue Holiday personal foul", 0, undefined, {type: {text: "Personal Foul"}}),
  ].concat(next ? [play(LAL, "LeBron James makes driving dunk (Luka Doncic assists)", 2, {x: 24, y: 4}, {type: {text: "Driving Dunk Shot"}})] : []);
  plays.forEach(p => { if (p.scoringPlay) { if (p.team.id === LAL.id) a += p.scoreValue; else h += p.scoreValue; } p.awayScore = a; p.homeScore = h; });
  return {
    header: {competitions: [{competitors: [
      {homeAway: "home", team: BOS, linescores: [{displayValue: "24"}, {displayValue: "31"}, {displayValue: String(h - 55)}]},
      {homeAway: "away", team: LAL, linescores: [{displayValue: "29"}, {displayValue: "26"}, {displayValue: String(a - 55)}]}]}]},
    plays,
    boxscore: {players: [
      {team: LAL, statistics: [{labels: ["MIN", "FG", "3PT", "FT", "OREB", "DREB", "REB", "AST", "STL", "BLK", "TO", "PF", "+/-", "PTS"],
        athletes: [{athlete: {displayName: "Luka Doncic"}, starter: true, stats: ["29", "9-18", "3-8", "5-6", "1", "5", "6", next ? "8" : "7", "1", "0", "3", "2", "-4", "26"]},
                   {athlete: {displayName: "LeBron James"}, starter: true, stats: ["28", "8-15", "1-4", "2-2", "2", "5", "7", "5", "0", "1", "2", "1", "-6", next ? "21" : "19"]},
                   {athlete: {displayName: "Bronny James"}, starter: false, stats: []}]}]},
      {team: BOS, statistics: [{labels: ["MIN", "FG", "3PT", "FT", "OREB", "DREB", "REB", "AST", "STL", "BLK", "TO", "PF", "+/-", "PTS"],
        athletes: [{athlete: {displayName: "Jayson Tatum"}, starter: true, stats: ["30", "8-17", "4-9", "1-1", "1", "7", "8", "4", "1", "0", "2", "2", "+6", "24"]}]}]},
    ]},
  };
}
