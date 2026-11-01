// Gap chart: ESPN's win chance and the plays that swing a game from /api/live (football), and the chart's math
// (web/src/lib/gap-math.ts). node --test tests/app/gap.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { nflSwing } from "../../functions/api/live.js";
import { forSide, gapRead, since, valueAt, yRange } from "../../web/src/lib/gap-math.ts";

const T = Date.parse("2026-11-01T17:00:00Z");
const p = (id, q, clock, sec, type, text, extra = {}) => ({id, period: {number: q}, clock: {displayValue: clock}, wallclock: new Date(T + sec * 1000).toISOString(),
  type: {text: type}, text, awayScore: 0, homeScore: 0, ...extra});

test("nflSwing: ESPN's chance by time, scores and turnovers (reversed-to-fumble counts, a doubled TD doesn't), quarters", () => {
  const drives = [{plays: [
    p("1", 1, "15:00", 0, "Kickoff", "kick"),
    p("2", 1, "10:10", 300, "Rushing Touchdown", "J.Allen up the middle for 1 yard, TOUCHDOWN.", {scoringPlay: true}),
    p("3", 2, "2:00", 900, "Fumble Recovery (Opponent)", "J.Allen pass ... The play was REVERSED. ... FUMBLES (R.Smith), RECOVERED by BLT-T.Tampa"),
    p("4", 2, "14:10", 600, "Sack Opp Fumble Recovery", "T.Huntley sacked ... FUMBLES"),
    p("5", 4, "12:18", 1500, "Passing Touchdown", "J.Allen pass short left to D.Moore for 11 yards, TOUCHDOWN."),
    p("6", 4, "12:18", 1500, "Passing Touchdown", "J.Allen pass short left to D.Moore for 11 yards, TOUCHDOWN."),
    p("7", 2, "5:00", 1000, "Penalty", "PENALTY on BUF ... Touchdown nullified. (No Play)"),
  ]}];
  const d = {winprobability: [{playId: "1", homeWinPercentage: 0.61}, {playId: "2", homeWinPercentage: 0.7}, {playId: "x", homeWinPercentage: 0.5}, {playId: "5", homeWinPercentage: 0.96}]};
  const s = nflSwing(d, drives);
  assert.deepEqual(s.wp, [[T / 1000, 0.61], [T / 1000 + 300, 0.7], [T / 1000 + 1500, 0.96]]);
  assert.deepEqual(s.keys.map((k) => `${k.kind} Q${k.q} ${k.clock}`), ["TD Q1 10:10", "FUM Q2 14:10", "FUM Q2 2:00", "TD Q4 12:18"]);
  assert.deepEqual(s.periods, [[1, T / 1000], [2, T / 1000 + 600], [4, T / 1000 + 1500]]);
});

test("gap chart math", () => {
  assert.deepEqual(forSide([[1, 0.64]], "away"), [[1, 0.36]]);
  assert.deepEqual(since([[1, 0.5], [5, 0.6], [9, 0.7]], 4), [[4, 0.5], [5, 0.6], [9, 0.7]]);
  assert.deepEqual(since([[1, 0.5]], 4), [[4, 0.5]]);
  assert.equal(valueAt([[1, 0.5], [5, 0.6]], 4), 0.5);
  assert.deepEqual(yRange([0.62, 0.66]), [0.5, 0.7]);
  assert.deepEqual(yRange([0.97, 0.99]), [0.8, 1]);
  assert.equal(gapRead(0.64, 0.72).text, "Kalshi is 8 points behind ESPN");
  assert.equal(gapRead(0.73, 0.72).text, "Kalshi and ESPN agree");
  assert.equal(gapRead(0.8, 0.7).text, "Kalshi is 10 points ahead of ESPN");
});
