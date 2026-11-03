// The v2 3D field on NFL and college football game pages: ESPN plays carry when they happened and where they started
// and ended, Kalshi's price history comes by the minute, and the app matches the two.
// node --test tests/app/field.test.mjs   (needs node 23.6+ to read the app's TypeScript)
import { test } from "node:test";
import assert from "node:assert/strict";
import { nflGame } from "../../functions/api/live.js";
import { points } from "../../functions/api/winline.js";
import { allMoves, biggestMoves, callText, callsOf, kindOf, latestDrive, periodLabel, playLabel, priceAt, spotText } from "../../web/src/lib/field-math.ts";

const BAL = {id: "33", abbreviation: "BAL"}, BUF = {id: "2", abbreviation: "BUF"};
const T0 = Date.parse("2026-11-01T19:00:00Z");
const play = (id, text, type, yards, ytez0, ytez1, sec, extra = {}) => ({id, text, type: {text: type}, statYardage: yards,
  period: {number: 3}, clock: {displayValue: "7:00"}, wallclock: new Date(T0 + sec * 1000).toISOString(),
  start: {down: 1, distance: 10, yardsToEndzone: ytez0, team: {id: "2"}}, end: {yardsToEndzone: ytez1, team: {id: "2"}}, ...extra});
const summary = () => ({
  header: {competitions: [{competitors: [{homeAway: "away", team: BAL}, {homeAway: "home", team: BUF}]}]},
  drives: {previous: [{team: BUF, plays: [play("a", "T.Bass 52 yard field goal is GOOD.", "Field Goal Good", 0, 34, 34, 0, {scoringPlay: true})]}],
    current: {team: BUF, plays: [
      {id: "k", text: "Kickoff", type: {text: "Kickoff"}, start: {team: {id: "33"}}},
      play("c1", "J.Cook up the middle to BUF 30 for 5 yards.", "Rush", 5, 75, 70, 600),
      play("c2", "(Shotgun) J.Allen pass short middle to D.Kincaid to BUF 42 for 12 yards.", "Pass Reception", 12, 70, 58, 640),
      play("c3", "J.Allen pass incomplete deep left to K.Coleman.", "Pass Incompletion", 0, 58, 58, 700),
      play("c4", "(Shotgun) J.Allen pass deep right to K.Coleman to BAL 44 for 17 yards.", "Pass Reception", 17, 58, 44, 760),
    ]}},
});

test("NFL plays carry when they happened, where they started and ended, the first-down line and their drive", () => {
  const g = nflGame(summary());
  const c4 = g.plays.find(p => p.id === "c4"), c1 = g.plays.find(p => p.id === "c1");
  assert.equal(c4.at, Math.round(T0 / 1000) + 760);
  // BUF is home: yards to its end zone are yards from the away (BAL) goal line, where the field starts
  assert.equal(c4.from, 58); assert.equal(c4.to, 44);
  assert.equal(c1.fd, 65, "BUF drives toward the BAL goal line (0), so first down is 10 yards lower");
  assert.equal(c1.drive, 1); assert.equal(g.plays.find(p => p.id === "a").drive, 0);
  const k = g.plays.find(p => p.id === "k");
  assert.equal(k.at, undefined); assert.equal(k.from, undefined);
});

test("the drive to draw is the newest one, oldest play first, kickoffs left out", () => {
  const d = latestDrive(nflGame(summary()).plays);
  assert.deepEqual(d.map(p => p.id), ["c1", "c2", "c3", "c4"]);
  assert.equal(kindOf(d[2]), "incomplete"); assert.equal(kindOf(d[0]), "gain");
});

test("a play's move is Kalshi's price just before it and a minute or so after, for the side we follow", () => {
  const t = Math.round(T0 / 1000);
  // minute candles end on the minute; the price jumps from 59 to 64 in the minute after the 17-yard catch
  const pts = Array.from({length: 20}, (_, i) => [t + i * 60, i * 60 <= 760 ? 0.59 : 0.64]);
  assert.equal(priceAt(pts, t - 1), null);
  assert.equal(priceAt(pts, t + 61), 0.59);
  const plays = nflGame(summary()).plays;
  const moves = allMoves(plays, pts, "home", t + 1200);
  const c4 = moves.find(m => m.play.id === "c4");
  assert.deepEqual([c4.before, c4.after, c4.delta], [59, 64, 5]);
  const away = allMoves(plays, pts, "away", t + 1200).find(m => m.play.id === "c4");
  assert.deepEqual([away.before, away.after, away.delta], [41, 36, -5]);
  assert.deepEqual(biggestMoves(moves).map(m => m.play.id), ["c4"], "small moves are left out");
});

test("two plays in one stretch of time don't both claim its move", () => {
  const mk = (id, at) => ({id, at, text: id, type: "Rush", team: "BUF", q: 1, clock: "", yards: 1, down: "", scoring: false});
  const pts = [[100, 0.5], [160, 0.5], [220, 0.6], [280, 0.6]];
  const moves = allMoves([mk("x", 150), mk("y", 170)], pts, "home", 400);
  assert.equal(moves.length, 2);
  assert.equal(biggestMoves(moves).length, 1);
});

test("play labels and spots read like a person would say them", () => {
  const p = (text, type, yards = 0) => ({text, type, yards, scoring: false});
  assert.equal(playLabel(p("(Shotgun) J.Allen pass deep right to K.Coleman to BAL 44 for 17 yards.", "Pass Reception", 17)), "Allen to Coleman, 17 yds");
  assert.equal(playLabel(p("J.Allen pass deep left intended for K.Coleman INTERCEPTED by K.Hamilton at BAL 30.", "Interception Return")), "Allen intercepted by Hamilton");
  assert.equal(playLabel(p("J.Allen sacked at BUF 39 for -3 yards (O.Oweh).", "Sack", -3)), "Allen sacked, −3 yds");
  assert.equal(playLabel(p("J.Cook up the middle to BUF 30 for 5 yards (R.Smith).", "Rush", 5)), "Cook run, 5 yds");
  assert.equal(playLabel(p("T.Bass 52 yard field goal is GOOD, Center-R.Ferguson.", "Field Goal Good")), "Bass field goal is good");
  assert.equal(playLabel(p(" R.Davis left tackle to BLT 44 for 5 yards (J.Jenkins).", "Rush", 5)), "Davis run, 5 yds");
  assert.equal(playLabel(p("J.Cook up the middle to BLT 35 for 9 yards (M.Starks). PENALTY on BUF-J.Hawes, Offensive Holding, 10 yards, enforced at BLT 44 - No Play.", "Penalty", -10)),
    "Penalty on BUF: offensive holding");
  const fum = {...p("(Shotgun) J.Allen pass short middle to D.Moore to BLT 20 for 19 yards (M.Starks). FUMBLES, recovered by BLT.", "Fumble Recovery (Opponent)"), yards: 0};
  assert.equal(playLabel(fum), "Allen to Moore, fumble lost"); assert.equal(kindOf(fum), "turnover");
  assert.equal(spotText(38, "BAL", "BUF"), "BAL 38"); assert.equal(spotText(75, "BAL", "BUF"), "BUF 25"); assert.equal(spotText(50, "BAL", "BUF"), "midfield");
});

test("winline keeps every minute of a game when asked (fine=1), 150 points otherwise", () => {
  const c = Array.from({length: 300}, (_, i) => ({end_period_ts: 1000 + i * 60, yes_bid: {close_dollars: "0.50"}, yes_ask: {close_dollars: "0.52"}}));
  assert.equal(points(c).points.length, 150);
  assert.equal(points(c, 360).points.length, 300);
});

// the field's call on a big play (2026-11-03): ESPN's play types and words, the points from the score change
const fp = (id, team, type, text, a, h, scoring = false) => ({id, team, q: 2, clock: "5:00", text, type, yards: null, down: "", scoring, away_score: a, home_score: h});
const calls = (...newestFirst) => callsOf(newestFirst, "MIA", "BUF");

test("a touchdown and its extra point or two-point try", () => {
  const xp = calls(fp("t", "BUF", "Passing Touchdown", "J.Allen pass deep left to D.Kincaid for 23 yards, TOUCHDOWN. T.Bass extra point is GOOD.", 10, 36, true),
    fp("p", "BUF", "Pass Reception", "J.Allen pass to K.Shakir for 9 yards.", 10, 29)).get("t");
  assert.equal(xp.word, "TOUCHDOWN!");
  assert.equal(xp.team, "BUF");
  assert.deepEqual(xp.pts.map((p) => p.n), [6, 1]);
  assert.deepEqual([xp.before, xp.after], [[10, 29], [10, 36]]);
  assert.equal(callText(xp), "Touchdown, +7");
  const two = calls(fp("t", "MIA", "Rushing Touchdown", "D.Achane 4 yd run, TOUCHDOWN. TWO-POINT CONVERSION ATTEMPT. ATTEMPT SUCCEEDS.", 18, 29, true),
    fp("p", "MIA", "Rush", "D.Achane for 3 yards.", 10, 29)).get("t");
  assert.deepEqual(two.pts.map((p) => [p.n, p.label]), [[6, "Touchdown"], [2, "Two-point conversion"]]);
  const failed = calls(fp("t", "MIA", "Rushing Touchdown", "TOUCHDOWN. TWO-POINT CONVERSION ATTEMPT. ATTEMPT FAILS.", 16, 29, true), fp("p", "MIA", "Rush", "", 10, 29)).get("t");
  assert.deepEqual(failed.pts.map((p) => p.n), [6]);
  // the oldest play in the feed has no play before it: the words tell the extra point (college: "kick attempt good")
  const cfb = calls(fp("t", "MIA", "Rushing Touchdown", "#0 D.June rush middle for 1 yard gain to the BUF00 TOUCHDOWN #90 R.Verhoff kick attempt good", 7, 0, true)).get("t");
  assert.deepEqual([cfb.pts.map((p) => p.n), cfb.before], [[6, 1], null]);
});

test("defensive and return scores belong to the team that scored", () => {
  const pick6 = calls(fp("t", "MIA", "Interception Return Touchdown", "INTERCEPTED by R.Lane. R.Lane for 92 yards, TOUCHDOWN. extra point is GOOD.", 10, 36, true),
    fp("p", "MIA", "Rush", "", 10, 29)).get("t");
  assert.deepEqual([pick6.word, pick6.team], ["PICK SIX!", "BUF"]);
  const scoop = calls(fp("t", "MIA", "Fumble Return Touchdown", "James Mitchell 0 Yd Fumble Recovery", 10, 36, true)).get("t");
  assert.deepEqual([scoop.word, scoop.team], ["SCOOP AND SCORE!", "BUF"]);
  const safety = calls(fp("s", "MIA", "Safety", "Demetrius Knight Jr. Safety", 10, 31, true), fp("p", "MIA", "Rush", "", 10, 29)).get("s");
  assert.deepEqual([safety.word, safety.team, safety.pts.map((p) => p.n)], ["SAFETY!", "BUF", [2]]);
});

test("field goals, misses, blocks and turnovers", () => {
  const c = calls(
    fp("fg", "BUF", "Field Goal Good", "T.Bass 56 yard field goal is GOOD, Center-R.Ferguson.", 10, 32, true),
    fp("miss", "MIA", "Field Goal Missed", "T.Loop 34 yard field goal is No Good, Hit Left Upright.", 10, 29),
    fp("blk", "MIA", "Blocked Field Goal", "J.Myers 33 yard field goal is BLOCKED (A.Booker).", 10, 29),
    fp("int", "MIA", "Pass Interception Return", "T.Tagovailoa pass short middle INTERCEPTED by T.Bernard at BUF 17.", 10, 29),
    fp("fum", "MIA", "Sack Opp Fumble Recovery", "T.Huntley sacked. FUMBLES, RECOVERED by BUF-K.Elarms-Orr.", 10, 29),
    fp("own", "MIA", "Fumble Recovery (Own)", "FUMBLES, recovered by MIA-C.Dike.", 10, 29),
    fp("run", "MIA", "Rush", "D.Achane for 3 yards.", 10, 29));
  assert.deepEqual([c.get("fg").word, c.get("fg").pts.map((p) => p.n), c.get("fg").team], ["FIELD GOAL IS GOOD", [3], "BUF"]);
  assert.deepEqual([c.get("miss").word, c.get("miss").team, c.get("miss").after], ["NO GOOD", "MIA", null]);
  assert.deepEqual([c.get("blk").word, c.get("blk").team], ["BLOCKED!", "BUF"]);
  assert.deepEqual([c.get("int").word, c.get("int").team, callText(c.get("int"))], ["INTERCEPTION!", "BUF", "Interception"]);
  assert.deepEqual([c.get("fum").word, c.get("fum").team], ["FUMBLE!", "BUF"]);
  assert.equal(c.has("own"), false);
  assert.equal(c.has("run"), false);
});

test("period names: quarters, college halves, overtimes", () => {
  assert.deepEqual([1, 4, 5, 6].map((q) => periodLabel(q, "NFL")), ["Q1", "Q4", "OT", "2OT"]);
  assert.deepEqual([1, 2, 3, 4].map((q) => periodLabel(q, "CBB")), ["1H", "2H", "OT", "2OT"]);
});
