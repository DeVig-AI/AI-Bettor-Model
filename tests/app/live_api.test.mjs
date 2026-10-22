// /api/live's NFL game page data: field spots, the scoreboard's situation and the summary's plays, drive, scoring
// and team stats.   node --test tests/app/live_api.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { nflSpot, nflGame, scoreboard, handle, teamCode } from "../../functions/api/live.js";
import { scoreboard as espnScoreboard, summary, espnFetcher } from "./espn_nfl_fixture.mjs";

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
