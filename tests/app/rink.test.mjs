// The NHL rink's arithmetic (web/src/lib/rink-math.ts): spots on the rink as drawn, labels, goals to replay, shots.
//   node --test tests/app/rink.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { rinkSpot, recentGoals, shotCounts, assistsOf, rinkLabel, scoreAfter, isGoal } from "../../web/src/lib/rink-math.ts";

const P = (o) => ({id: "x", team: "UTA", q: 1, clock: "10:00", text: "", type: "Shot", scoring: false, away_score: 0, home_score: 0, ...o});

test("spots: home attacks the right net, away the left, each with their left toward the far boards", () => {
  assert.deepEqual(rinkSpot({x: 80, y: 10}, true), {x: 180, y: 32.5});
  assert.deepEqual(rinkSpot({x: 80, y: 10}, false), {x: 20, y: 52.5});
});

test("goals to replay: newest six, oldest first, no shootout goals; shots count goals", () => {
  const plays = Array.from({length: 8}, (_, i) => P({id: `g${i}`, scoring: true, type: "Goal", at: 100 + i, team: i % 2 ? "TOR" : "UTA"}))
    .concat([P({id: "so", scoring: true, type: "Shootout", at: 999}), P({id: "s1", team: "TOR"})]);
  assert.deepEqual(recentGoals(plays).map(p => p.id), ["g2", "g3", "g4", "g5", "g6", "g7"]);
  assert.equal(isGoal(plays[8]), false);
  assert.deepEqual(shotCounts(plays, "UTA", "TOR"), {away: 5, home: 5});
});

test("labels: goals, saved shots, penalties; assists by last name", () => {
  const g = P({scoring: true, type: "Goal", text: "Dylan Guenther Goal (6) Snap Shot, assists: Mikhail Sergachev (13), Clayton Keller (15)"});
  assert.equal(rinkLabel(g), "Guenther goal, snap shot");
  assert.equal(rinkLabel({...g, strength: "PP"}), "Guenther goal, power play");
  assert.deepEqual(assistsOf(g), ["Sergachev", "Keller"]);
  assert.deepEqual(assistsOf(P({text: "Joe Goal (1), assists: none"})), []);
  assert.equal(rinkLabel(P({text: "Easton Cowan Wrist Shot saved by Sebastian Cossa"})), "Cowan wrist shot, saved");
  assert.equal(rinkLabel(P({penalty: true, pim: 2, type: "Hooking", text: "Liam O'Brien Hooking against Troy Stecher"})), "O'Brien hooking, 2 min");
  assert.equal(rinkLabel(P({penalty: true, pim: 2, type: "Penalty", text: "Morgan Rielly Tripping (2 min)"})), "Morgan Rielly Tripping, 2 min");
  assert.equal(scoreAfter(P({away_score: 3, home_score: 2}), "UTA", "TOR"), "UTA 3 – TOR 2");
});
