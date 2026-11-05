// /api/live's NFL game page data: field spots, the scoreboard's situation and the summary's plays, drive, scoring
// and team stats; NBA plays with shot spots, the run, quarter scores and the box; NHL and MLB plays, periods and box.   node --test tests/app/live_api.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { nflSpot, nflGame, nbaShot, nbaGame, nhlGame, nhlEnds, mlbGame, soccerGame, scoreboard, handle, teamCode } from "../../functions/api/live.js";
import { scoreboard as espnScoreboard, summary, espnFetcher } from "./espn_nfl_fixture.mjs";
import { summary as nbaSummary } from "./espn_nba_fixture.mjs";
import { nhlSummary, mlbSummary, mlbScoreboard } from "./espn_more_fixture.mjs";

test("field spots are yards from the away goal line", () => {
  assert.equal(nflSpot("SEA 37", null, "SF", "SF", "SEA"), 63);       // in the home team's half
  assert.equal(nflSpot("SF 26", null, "SF", "SF", "SEA"), 26);
  assert.equal(nflSpot("50", null, "SF", "SF", "SEA"), 50);
  assert.equal(nflSpot("", 37, "SF", "SF", "SEA"), 63);               // yards to the end zone, away team on offense
  assert.equal(nflSpot("", 37, "SEA", "SF", "SEA"), 37);
  assert.equal(nflSpot("garbage", null, "SF", "SF", "SEA"), null);
});

test("the scoreboard carries the situation for a game in progress", () => {
  const [g] = scoreboard(espnScoreboard("2026-10-22T20:25:00Z"), "nfl");
  assert.equal(g.possession, "SF");
  assert.deepEqual(g.situation, {down: 3, distance: 14, text: "3rd & 14", spot_text: "SEA 37", red_zone: false,
    timeouts: {away: 2, home: 3}, offense: "SF", spot: 63, last_play: "B.Purdy pass incomplete short middle intended for G.Kittle."});
  const [fin] = scoreboard(espnScoreboard("2026-10-22T20:25:00Z", {state: "post"}), "nfl");
  assert.equal(fin.situation, undefined, "no field once it's over");
});

test("the summary becomes plays, drive, situation, scoring and stats", () => {
  const d = nflGame(summary(), teamCode("nfl"));
  assert.equal(d.away, "SF"); assert.equal(d.home, "SEA");
  assert.deepEqual(d.plays.map(p => p.id), ["p4", "p3", "p2", "p1"], "newest first");
  assert.equal(d.plays[0].down, "2nd & 14");
  assert.equal(d.plays[1].yards, 28);
  assert.ok(d.plays[3].scoring); assert.equal(d.plays[3].team, "SEA");
  assert.deepEqual(d.drive, {offense: "SF", summary: "5 plays, 37 yards, 2:42", plays: 5, yards: 37, start: 26, result: ""});
  assert.deepEqual(d.situation, {offense: "SF", down: 3, distance: 14, text: "3rd & 14", spot_text: "SEA 37", spot: 63});
  assert.equal(d.scoring.length, 2); assert.equal(d.scoring[1].team, "SEA"); assert.equal(d.scoring[1].home_score, 26);
  assert.deepEqual(d.team_stats[0], {label: "Total yards", away: "338", home: "301"});
  assert.equal(d.box[0].group, "Passing"); assert.equal(d.box[0].rows[0].name, "Brock Purdy");
});

test("a summary with almost nothing in it still answers", () => {
  const d = nflGame({});
  assert.deepEqual(d.plays, []); assert.deepEqual(d.scoring, []); assert.deepEqual(d.box, []);
  assert.equal(d.drive, undefined); assert.equal(d.team_stats, undefined);
});

test("event + game=1 adds the game page data; without it the box score is unchanged", async () => {
  const f = espnFetcher("2026-10-22T20:25:00Z");
  const withGame = await (await handle(new Request("https://x/api/live?sport=nfl&event=401&game=1"), f)).json();
  assert.ok(withGame.players["Brock Purdy"]);
  assert.equal(withGame.game.plays.length, 4);
  const plain = await (await handle(new Request("https://x/api/live?sport=nfl&event=401"), f)).json();
  assert.ok(plain.players["Brock Purdy"]);
  assert.equal(plain.game, undefined);
});

// ---------- NBA ----------
test("NBA shot spots: ESPN measures from the rim; kept on the court, moved to the baseline, the far half folded", () => {
  assert.deepEqual(nbaShot({x: 8, y: 20}), {x: 8, y: 25.3});
  assert.deepEqual(nbaShot({x: 46, y: 74}), {x: 4, y: 25.3});
  assert.deepEqual(nbaShot({x: 2, y: -3}), {x: 2, y: 2.3}, "a corner three sits behind the rim");
  assert.deepEqual(nbaShot({x: 25, y: 0}), {x: 25, y: 5.3}, "a dunk is at the rim");
  assert.equal(nbaShot({x: -214748340, y: -214748365}), null);
  assert.equal(nbaShot(null), null);
});

test("the NBA summary becomes plays with shots, the run, quarter scores and the box", () => {
  const d = nbaGame(nbaSummary(), teamCode("nba"));
  assert.equal(d.away, "LAL"); assert.equal(d.home, "BOS");
  assert.match(d.plays[0].text, /personal foul/, "newest first");
  assert.deepEqual(d.plays[1].shot, {x: 4, y: 25.3, made: true});
  assert.equal(d.plays[1].pts, 3); assert.equal(d.plays[1].home_score, 90);
  assert.equal(d.plays[2].shot, null, "no spot for a free throw");
  assert.deepEqual(d.plays[4].shot, {x: 16, y: 17.3, made: false});
  assert.deepEqual(d.run, {team: "BOS", points: 9});
  assert.deepEqual(d.linescore, {away: [29, 26, 25], home: [24, 31, 35]});
  assert.deepEqual(d.box[0].labels, ["MIN", "PTS", "REB", "AST", "FG", "3PT", "STL", "BLK", "TO", "+/-"]);
  assert.deepEqual(d.box[0].rows.map(r => r.name), ["Luka Doncic", "LeBron James"], "no row for a player who didn't play");
  assert.equal(d.box[0].rows[0].stats[1], "26");
  assert.equal(nbaGame(nbaSummary({next: true})).run, undefined, "a Lakers bucket ends the run");
});

// ---------- NHL, MLB, and the other sports' event answers ----------
test("NHL: goals, penalties and shots kept (faceoffs, hits, blocked shots left out), periods and box", () => {
  const d = nhlGame(nhlSummary({goal: true}), teamCode("nhl"));
  assert.deepEqual(d.plays.map(p => p.id), ["h7", "h4", "h3", "h2"]);
  assert.equal(d.plays[0].scoring, true); assert.equal(d.plays[0].home_score, 3);
  assert.deepEqual(d.linescore, {away: [0, 1], home: [1, 2]});
  assert.deepEqual(d.box.map(b => b.group), ["Forwards", "Goalies"]);
});

test("NHL rink: each team's end per period from its shots, spots turned toward the net attacked, goal keys, strength", () => {
  const sh = (id, tid, q, x, y, extra = {}) => Object.assign({id, team: {id: tid}, type: {text: "Shot"}, text: `Shot ${id}`, period: {number: q},
    clock: {displayValue: "10:00"}, shootingPlay: true, coordinate: {x, y}, scoringPlay: false, awayScore: 0, homeScore: 0,
    wallclock: `2026-11-03T23:${String(10 + q * 5 + Number(id.slice(1)) % 5).padStart(2, "0")}:00Z`}, extra);
  const raw = [
    sh("s1", "1", 1, 60, 10), sh("s2", "1", 1, 70, -5), sh("s3", "1", 1, -80, 0, {type: {text: "Missed Shot"}}), sh("s4", "1", 1, -75, 0, {type: {text: "Blocked Shot"}}),
    sh("s5", "2", 1, -65, 4), sh("s6", "2", 1, -58, -12),
    sh("s7", "1", 2, -66, 8), sh("s8", "1", 2, -71, 2),
    // period 3: one shot each, too few to tell, so it follows the alternation
    sh("s9", "1", 3, 50, 1, {type: {text: "Goal"}, text: "Clayton Keller Goal (4) Wrist Shot, assists: Mikhail Sergachev (13)", scoringPlay: true,
      awayScore: 1, homeScore: 0, strength: {abbreviation: "power-play"}}),
    sh("s10", "2", 3, -40, 3, {type: {text: "Goal"}, text: "Auston Matthews Goal (9) Empty Net", scoringPlay: true, awayScore: 1, homeScore: 1}),
    {id: "p1", team: {id: "2"}, type: {text: "Hooking", penaltyMinutes: 2}, text: "Liam O'Brien Hooking against Troy Stecher", period: {number: 2},
      clock: {displayValue: "4:00"}, wallclock: "2026-11-03T23:30:30Z", awayScore: 0, homeScore: 0},
  ];
  const ends = nhlEnds(raw);
  assert.deepEqual([1, 2, 3, 4].map(ends["1"]), [1, -1, 1, -1]);
  assert.deepEqual([1, 2, 3].map(ends["2"]), [-1, 1, -1]);
  const summary = {header: {competitions: [{competitors: [
    {homeAway: "home", team: {id: "2", abbreviation: "TOR"}, linescores: []}, {homeAway: "away", team: {id: "1", abbreviation: "UTA"}, linescores: []}]}]},
    plays: raw};
  const d = nhlGame(summary, teamCode("nhl"));
  const by = Object.fromEntries(d.plays.map(p => [p.id, p]));
  assert.equal(by.s3, undefined); assert.equal(by.s4, undefined);           // missed and blocked shots left out
  assert.deepEqual(by.s7.spot, {x: 66, y: -8});                              // period 2, other end: turned around
  assert.deepEqual(by.s9.spot, {x: 50, y: 1});
  assert.deepEqual(by.s10.spot, {x: 40, y: -3});
  assert.equal(by.s9.strength, "PP"); assert.equal(by.s10.strength, "EN");
  assert.deepEqual([by.p1.penalty, by.p1.pim, by.p1.spot], [true, 2, undefined]);
  assert.deepEqual(d.wp, []);
  assert.deepEqual(d.keys.map(k => [k.kind, k.q, k.away_score, k.home_score, k.strength]), [["G", 3, 1, 0, "PP"], ["G", 3, 1, 1, "EN"]]);
  assert.deepEqual(d.periods.map(p => p[0]), [1, 2, 3]);
});

test("MLB: at-bat results and scoring plays (pitches left out), innings, box and the scoreboard's situation", () => {
  const d = mlbGame(mlbSummary({hr: true}), teamCode("mlb"));
  assert.deepEqual(d.plays.map(p => p.id), ["b7", "b5", "b2", "b1"]);
  assert.equal(d.plays[0].pts, 3); assert.equal(d.plays[0].half, "Bottom");
  assert.equal(d.linescore.home.length, 7);
  assert.deepEqual(d.box[1].labels.slice(0, 3), ["IP", "H", "R"]);
  const [g] = scoreboard(mlbScoreboard("2026-10-22T23:08:00Z"), "mlb");
  assert.deepEqual(g.situation, {balls: 2, strikes: 1, outs: 1, bases: [true, true, false], pitcher: "B. Treinen", batter: "A. Judge",
    last_play: "Stanton walked, Soto to second."});
});

test("every sport answers an event with its game page data", async () => {
  const body = (sport, d) => async url => ({ok: true, status: 200, json: async () => /summary/.test(url) ? d : {events: []}});
  for (const [sport, d, n] of [["nhl", nhlSummary(), 3], ["mlb", mlbSummary(), 3], ["wnba", nbaSummary(), 7], ["cfb", summary(), 4]]) {
    const r = await (await handle(new Request(`https://x/api/live?sport=${sport}&event=9${n}${sport.length}&game=1`), body(sport, d))).json();
    assert.equal(r.game.plays.length, n, sport);
  }
});

test("wrap=1 returns ESPN's summary cut down to what the wrap-up reads", async () => {
  const { slimSummary } = await import("../../functions/api/live.js");
  const s = slimSummary(summary());
  assert.ok(Array.isArray(s.boxscore.teams) && Array.isArray(s.boxscore.players));
  assert.ok(s.header.competitions[0].competitors.every(c => c.homeAway && c.team.id));
  for (const p of [...s.scoringPlays, ...s.plays, ...s.drives.previous.flatMap(d => d.plays)])
    assert.deepEqual(Object.keys(p).sort(), ["awayScore", "clock", "homeScore", "id", "period", "scoringPlay", "text", "type"]);
  assert.ok(JSON.stringify(s).length <= JSON.stringify(summary()).length);
  assert.deepEqual(slimSummary({}).boxscore, { teams: [], players: [] });   // a sparse summary doesn't throw
});

test("date=YYYYMMDD asks ESPN for that day's scoreboard; a bad date is refused", async () => {
  const urls = [];
  const f = async url => { urls.push(url); return new Response(JSON.stringify({events: []}), {status: 200}); };
  assert.equal((await handle(new Request("https://x/api/live?sport=cfb&date=20261031"), f)).status, 200);
  assert.match(urls[0], /college-football\/scoreboard\?groups=80&limit=500&dates=20261031$/);
  await handle(new Request("https://x/api/live?sport=nba&date=20261030"), f);
  assert.match(urls[1], /basketball\/nba\/scoreboard\?dates=20261030$/);
  assert.equal((await handle(new Request("https://x/api/live?sport=nba&date=yesterday"), f)).status, 400);
});

// ---- ?schedule=: a team's next games (the team page's "Next 10 games")
import { schedule as nextGames, espnCode } from "../../functions/api/live.js";

test("schedule: next games not started, soonest first, codes in the app's spelling", () => {
  const ev = (id, date, state, us, them, usHome, extra = {}) => ({id, date, timeValid: true, seasonType: {type: 2}, competitions: [{
    neutralSite: false, status: {type: {state}},
    broadcasts: [{market: {type: "National"}, media: {shortName: "TNT"}}],
    competitors: [{homeAway: usHome ? "home" : "away", team: {id: "9", abbreviation: us}},
                  {homeAway: usHome ? "away" : "home", team: {id: "1", abbreviation: them, displayName: "Them"}}]}], ...extra});
  const d = {team: {id: "9"}, events: [
    ev("1", "2026-11-01T00:00Z", "post", "GS", "NO", true),
    ev("3", "2026-11-09T00:00Z", "pre", "GS", "SA", false, {timeValid: false}),
    ev("2", "2026-11-05T00:00Z", "pre", "GS", "NY", true),
  ]};
  const g = nextGames(d, "nba");
  assert.deepEqual(g.map(x => x.id), ["2", "3"]);
  assert.equal(g[0].opp, "NYK");
  assert.equal(g[0].home, true);
  assert.equal(g[0].tv, "TNT");
  assert.equal(g[1].opp, "SAS");
  assert.equal(g[1].home, false);
  assert.equal(g[1].time_tbd, true);
  assert.equal(nextGames({team: {id: "9"}, events: Array.from({length: 15}, (_, i) => ev(String(i), `2026-12-${String(i + 1).padStart(2, "0")}T00:00Z`, "pre", "GS", "NO", true))}, "nba").length, 10);
  assert.equal(espnCode("nba", "GSW"), "GS");
  assert.equal(espnCode("nfl", "WAS"), "WSH");
  assert.equal(espnCode("nhl", "TOR"), "TOR");
});

test("schedule: a bad team code is refused before ESPN is asked", async () => {
  let asked = false;
  const r = await handle(new Request("https://x/api/live?sport=nba&schedule=..%2Fx"), async () => { asked = true; return new Response("{}"); });
  assert.equal(r.status, 400);
  assert.equal(asked, false);
});

// ---- men's college basketball (cbb): every Division I game, with ESPN ids and names like college football
test("cbb reads ESPN's men's Division I scoreboard, with team ids and names, and box scores as basketball", async () => {
  const urls = [];
  const f = async url => { urls.push(url); return new Response(JSON.stringify({events: []}), {status: 200}); };
  assert.equal((await handle(new Request("https://x/api/live?sport=cbb&date=20261103"), f)).status, 200);
  assert.match(urls[0], /basketball\/mens-college-basketball\/scoreboard\?groups=50&limit=500&dates=20261103$/);
  const ev = {id: "401906848", date: "2026-11-03T23:00Z", status: {type: {state: "pre", shortDetail: "6:00 PM"}},
    competitions: [{competitors: [
      {homeAway: "home", score: "0", team: {id: "2633", abbreviation: "TENN", location: "Tennessee", color: "ff8200"}},
      {homeAway: "away", score: "0", team: {id: "2747", abbreviation: "WOF", location: "Wofford"}}]}]};
  const [g] = scoreboard({events: [ev]}, "cbb");
  assert.equal(g.home, "TENN"); assert.equal(g.away_id, "2747"); assert.equal(g.home_name, "Tennessee");
  const r = await (await handle(new Request("https://x/api/live?sport=cbb&event=9701&game=1"),
    async url => ({ok: true, status: 200, json: async () => /summary/.test(url) ? nbaSummary() : {events: []}}))).json();
  assert.equal(r.game.plays.length, 7);
});

test("soccer: goals, cards and substitutions on the right side, match stats and line-ups", () => {
  const ev = (type, min, team, names, extra = {}) => ({type: {type}, clock: {displayValue: min}, team: {id: team},
    participants: names.map(n => ({athlete: {displayName: n}})), wallclock: "2026-11-08T15:20:00Z", ...extra});
  const g = soccerGame({
    header: {competitions: [{competitors: [{homeAway: "home", team: {id: "1"}}, {homeAway: "away", team: {id: "2"}}]}]},
    keyEvents: [
      ev("kickoff", "0'", null, []),
      ev("goal", "16'", "2", ["Away Striker", "Away Mid"], {scoringPlay: true}),
      ev("yellow-card", "45'+2'", "1", ["Home Back"]),
      ev("substitution", "60'", "1", ["Home Sub", "Home Back"]),
      ev("penalty---scored", "70'", "1", ["Home Nine"], {scoringPlay: true}),
      ev("own-goal", "80'", "1", ["Away Back"], {scoringPlay: true}),
      ev("red-card", "88'", "2", ["Away Mid"]),
    ],
    boxscore: {teams: [
      {homeAway: "home", statistics: [{name: "possessionPct", displayValue: "56.4"}, {name: "totalShots", displayValue: "17"}, {name: "junk", displayValue: "1"}]},
      {homeAway: "away", statistics: [{name: "possessionPct", displayValue: "43.6"}, {name: "totalShots", displayValue: "10"}]},
    ]},
    rosters: [{homeAway: "home", formation: "4-3-3", roster: [
      {starter: true, jersey: "9", formationPlace: "11", athlete: {displayName: "Home Nine"}, position: {abbreviation: "F"}},
      {starter: true, jersey: "1", formationPlace: "1", athlete: {displayName: "Home Keeper"}, position: {abbreviation: "G"}},
      {starter: false, jersey: "14", subbedIn: true, athlete: {displayName: "Home Sub"}, position: {abbreviation: "M"}},
    ]}],
  });
  assert.deepEqual(g.events.map(e => [e.min, e.kind, e.side, e.who, e.other]), [
    ["16'", "goal", "away", "Away Striker", "Away Mid"],
    ["45'+2'", "yellow", "home", "Home Back", ""],
    ["60'", "sub", "home", "Home Sub", "Home Back"],                 // ESPN lists the player coming on first
    ["70'", "pen", "home", "Home Nine", ""],
    ["80'", "own", "home", "Away Back", ""],
    ["88'", "red", "away", "Away Mid", ""],
  ]);
  assert.deepEqual(g.stats, {home: {possession: 56.4, shots: 17}, away: {possession: 43.6, shots: 10}});
  assert.equal(g.lineups.home.formation, "4-3-3");
  assert.deepEqual(g.lineups.home.xi.map(p => p[0]), ["1", "9"]);      // in formation order, keeper first
  assert.deepEqual(g.lineups.home.subs, [["14", "Home Sub", "M", true]]);
  assert.deepEqual(soccerGame({}), {events: [], stats: {}, lineups: {}});
});
