// /api/live's NFL game page data: field spots, the scoreboard's situation and the summary's plays, drive, scoring
// and team stats; NBA plays with shot spots, the run, quarter scores and the box; NHL and MLB plays, periods and box.   node --test tests/app/live_api.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { nflSpot, nflGame, nbaShot, nbaGame, nhlGame, mlbGame, scoreboard, handle, teamCode } from "../../functions/api/live.js";
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
test("NBA shot spots: kept on the court, the far half folded onto the near one", () => {
  assert.deepEqual(nbaShot({x: 8, y: 20}), {x: 8, y: 20});
  assert.deepEqual(nbaShot({x: 46, y: 74}), {x: 4, y: 20});
  assert.equal(nbaShot({x: -214748340, y: -214748365}), null);
  assert.equal(nbaShot(null), null);
});

test("the NBA summary becomes plays with shots, the run, quarter scores and the box", () => {
  const d = nbaGame(nbaSummary(), teamCode("nba"));
  assert.equal(d.away, "LAL"); assert.equal(d.home, "BOS");
  assert.match(d.plays[0].text, /personal foul/, "newest first");
  assert.deepEqual(d.plays[1].shot, {x: 4, y: 20, made: true});
  assert.equal(d.plays[1].pts, 3); assert.equal(d.plays[1].home_score, 90);
  assert.equal(d.plays[2].shot, null, "no spot for a free throw");
  assert.deepEqual(d.plays[4].shot, {x: 16, y: 12, made: false});
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
