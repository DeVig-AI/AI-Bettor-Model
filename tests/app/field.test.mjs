// The v2 3D field on NFL and college football game pages: ESPN plays carry when they happened and where they started
// and ended, Kalshi's price history comes by the minute, and the app matches the two.
// node --test tests/app/field.test.mjs   (needs node 23.6+ to read the app's TypeScript)
import { test } from "node:test";
import assert from "node:assert/strict";
import { nflGame } from "../../functions/api/live.js";
import { points } from "../../functions/api/winline.js";
import { allMoves, biggestMoves, kindOf, latestDrive, playLabel, priceAt, spotText } from "../../web/src/lib/field-math.ts";

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
  assert.equal(spotText(38, "BAL", "BUF"), "BAL 38"); assert.equal(spotText(75, "BAL", "BUF"), "BUF 25"); assert.equal(spotText(50, "BAL", "BUF"), "midfield");
});

test("winline keeps every minute of a game when asked (fine=1), 150 points otherwise", () => {
  const c = Array.from({length: 300}, (_, i) => ({end_period_ts: 1000 + i * 60, yes_bid: {close_dollars: "0.50"}, yes_ask: {close_dollars: "0.52"}}));
  assert.equal(points(c).points.length, 150);
  assert.equal(points(c, 360).points.length, 300);
});
