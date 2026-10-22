// ESPN-shaped NHL and MLB feeds for the game page tests (WNBA reuses the NBA fixture's shapes).
// Hand-built in the shape of site.api.espn.com's hockey and baseball responses; only the fields functions/api/live.js reads.

const TOR = {id: "21", abbreviation: "TOR"}, BOS = {id: "1", abbreviation: "BOS"};
const NYY = {id: "10", abbreviation: "NYY"}, LAD = {id: "19", abbreviation: "LAD"};

export function nhlScoreboard(kickoffIso, {goal = false} = {}) {
  return {events: [{id: "601", date: kickoffIso, status: {type: {state: "in", shortDetail: "8:14 - 2nd"}},
    competitions: [{competitors: [{homeAway: "home", score: goal ? "3" : "2", team: BOS}, {homeAway: "away", score: "1", team: TOR}]}]}]};
}
export function nhlSummary({goal = false} = {}) {
  const p = (id, team, type, text, extra = {}) => Object.assign({id, team: {id: team.id}, type: {text: type}, text, period: {number: 2},
    clock: {displayValue: "10:00"}, scoringPlay: false, awayScore: 1, homeScore: 2}, extra);
  const plays = [
    p("h1", TOR, "Faceoff", "Auston Matthews faceoff won against Elias Lindholm"),
    p("h2", BOS, "Goal", "David Pastrnak Goal (5) Wrist Shot, assists: Charlie McAvoy", {period: {number: 1}, scoringPlay: true, awayScore: 0, homeScore: 1}),
    p("h3", TOR, "Penalty", "Morgan Rielly Tripping (2 min)", {clock: {displayValue: "12:31"}}),
    p("h4", TOR, "Shot", "Mitch Marner Wrist Shot saved by Jeremy Swayman", {clock: {displayValue: "11:02"}}),
    p("h5", BOS, "Blocked Shot", "Brad Marchand shot blocked by Jake McCabe"),
    p("h6", BOS, "Hit", "Nikita Zadorov hit Max Domi"),
  ].concat(goal ? [p("h7", BOS, "Goal", "Brad Marchand Goal (3) Snap Shot, Power Play, assists: David Pastrnak",
    {clock: {displayValue: "8:14"}, scoringPlay: true, awayScore: 1, homeScore: 3})] : []);
  return {
    header: {competitions: [{competitors: [
      {homeAway: "home", team: BOS, linescores: [{displayValue: "1"}, {displayValue: goal ? "2" : "1"}]},
      {homeAway: "away", team: TOR, linescores: [{displayValue: "0"}, {displayValue: "1"}]}]}]},
    plays,
    boxscore: {players: [{team: BOS, statistics: [
      {name: "forwards", labels: ["G", "A", "+/-", "S", "PIM", "TOI"], athletes: [{athlete: {displayName: "David Pastrnak"}, stats: ["1", goal ? "1" : "0", "1", "4", "0", "15:20"]}]},
      {name: "goalies", labels: ["GA", "SA", "SV", "SV%", "TOI"], athletes: [{athlete: {displayName: "Jeremy Swayman"}, stats: ["1", "18", "17", ".944", "28:00"]}]}]}]},
  };
}

export function mlbScoreboard(kickoffIso, {hr = false} = {}) {
  return {events: [{id: "701", date: kickoffIso, status: {type: {state: "in", shortDetail: "Bot 7th"}},
    competitions: [{competitors: [{homeAway: "home", score: hr ? "5" : "2", team: NYY}, {homeAway: "away", score: "3", team: LAD}],
      situation: hr ? {balls: 0, strikes: 0, outs: 1, onFirst: false, onSecond: false, onThird: false,
                       pitcher: {athlete: {shortName: "B. Treinen"}}, batter: {athlete: {shortName: "A. Volpe"}},
                       lastPlay: {text: "Judge homered to left center (412 feet), Soto and Stanton scored."}}
                    : {balls: 2, strikes: 1, outs: 1, onFirst: true, onSecond: true, onThird: false,
                       pitcher: {athlete: {shortName: "B. Treinen"}}, batter: {athlete: {shortName: "A. Judge"}},
                       lastPlay: {text: "Stanton walked, Soto to second."}}}]}]};
}
export function mlbSummary({hr = false} = {}) {
  const p = (id, team, type, text, extra = {}) => Object.assign({id, team: {id: team.id}, type: {text: type, type: type.toLowerCase().replace(/ /g, "-")},
    text, period: {number: 7, type: "Bottom"}, scoringPlay: false, awayScore: 3, homeScore: 2}, extra);
  const plays = [
    p("b1", LAD, "Play Result", "Ohtani struck out swinging.", {period: {number: 7, type: "Top"}}),
    p("b2", NYY, "Play Result", "Soto singled to right.", {}),
    p("b3", NYY, "Ball", "Ball 1"),
    p("b4", NYY, "Strike Looking", "Strike 1 Looking"),
    p("b5", NYY, "Play Result", "Stanton walked, Soto to second."),
    p("b6", NYY, "Ball", "Ball 2"),
  ].concat(hr ? [p("b7", NYY, "Play Result", "Judge homered to left center (412 feet), Soto and Stanton scored.",
    {scoringPlay: true, scoreValue: 3, homeScore: 5})] : []);
  return {
    header: {competitions: [{competitors: [
      {homeAway: "home", team: NYY, linescores: [0, 1, 0, 0, 1, 0, hr ? 3 : 0].map(v => ({displayValue: String(v)}))},
      {homeAway: "away", team: LAD, linescores: [1, 0, 0, 2, 0, 0, 0].map(v => ({displayValue: String(v)}))}]}]},
    plays,
    boxscore: {players: [{team: NYY, statistics: [
      {name: "batting", labels: ["H-AB", "AB", "R", "H", "RBI", "HR", "BB", "K", "AVG"],
       athletes: [{athlete: {displayName: "Aaron Judge"}, stats: [hr ? "2-3" : "1-2", hr ? "3" : "2", hr ? "1" : "0", hr ? "2" : "1", hr ? "3" : "0", hr ? "1" : "0", "1", "1", ".311"]}]},
      {name: "pitching", labels: ["IP", "H", "R", "ER", "BB", "K", "HR", "PC-ST", "ERA"],
       athletes: [{athlete: {displayName: "Gerrit Cole"}, stats: ["6.0", "5", "3", "3", "2", "8", "1", "98-64", "3.41"]}]}]}]},
  };
}
