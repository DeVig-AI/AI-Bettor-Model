// Streaks (web/src/lib/streak-math.ts): which prop lines a player hit in each of their last 10 played games, the
// hardest line kept per player and stat, and the note on past streaks. node --test tests/app/streaks.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { streaks, streakNote } from "../../web/src/lib/streak-math.ts";

const L = { date: 0, min: 1, pts: 2, reb: 3 };
const HIT = [["points", "Points", ["pts"]], ["pts_reb", "Pts + Reb", ["pts", "reb"]]];
// newest first, like the stats files
const log = (pts, mins = 30) => pts.map((p, i) => [`2026-01-${String(30 - i).padStart(2, "0")}`, mins, p, 5]);
const line = (stat, ln, o = {}) => ({ key: `${stat}|${ln}`, player: "Jalen Sué", stat, line: ln, bid: 0.8, ask: 0.82, oi: 100, ticker: null, ...o });
const P = (rows) => [{ id: 7, name: "Jalen Sue", team: "ORL", log: rows }];

test("keeps the hardest line still 10-for-10, with the last 10 oldest first", () => {
  const rows = log([25, 22, 21, 30, 20, 22, 24, 26, 21, 23, 2]);
  const out = streaks("NBA", [line("points", 14.5), line("points", 19.5), line("points", 24.5)], P(rows), L, HIT);
  assert.equal(out.length, 1);
  assert.equal(out[0].l.line, 19.5);
  assert.equal(out[0].need, 20);
  assert.deepEqual(out[0].last, [23, 21, 26, 24, 22, 20, 30, 21, 22, 25]);
  assert.equal(out[0].team, "ORL");
  assert.equal(out[0].pid, "7");
  assert.ok(Math.abs(out[0].mid - 0.81) < 1e-9);
});

test("games not played are skipped; fewer than 10 played is no streak", () => {
  const rows = log([25, 0, 22, 21, 30, 20, 22, 24, 26, 21, 23]);
  rows[1][1] = 0; // a DNP
  assert.equal(streaks("NBA", [line("points", 19.5)], P(rows), L, HIT).length, 1);
  assert.equal(streaks("NBA", [line("points", 19.5)], P(log([25, 25, 25])), L, HIT).length, 0);
});

test("one miss in the last 10 is no streak; summed stats work", () => {
  const rows = log([25, 22, 21, 30, 19, 22, 24, 26, 21, 23]);
  assert.equal(streaks("NBA", [line("points", 19.5)], P(rows), L, HIT).length, 0);
  assert.equal(streaks("NBA", [line("pts_reb", 23.5)], P(rows), L, HIT)[0].need, 24);
});

test("wide, crossed or missing prices, unknown stats and unknown players are left out", () => {
  const rows = log(Array(10).fill(30));
  const bad = [line("points", 9.5, { bid: 0.7, ask: 0.8 }), line("points", 10.5, { bid: 0.9, ask: 0.88 }),
    line("points", 11.5, { bid: null }), line("assists", 2.5), line("points", 12.5, { player: "Someone Else" })];
  assert.equal(streaks("NBA", bad, P(rows), L, HIT).length, 0);
});

test("NFL logs count every row as played", () => {
  const NL = { date: 0, rec: 1 };
  const rows = Array.from({ length: 10 }, (_, i) => [`2026-10-${10 + i}`, 5]);
  const out = streaks("NFL", [line("receptions", 3.5)], P(rows), NL, [["receptions", "Receptions", ["rec"]]]);
  assert.equal(out.length, 1);
});

test("the note reads the measured interval and refuses small samples", () => {
  const s = { rungs: 1315, games: 974, hit: 0.8624, kalshi: 0.8744, diff_95: [-0.0298, 0.0055], seasons: ["2025-26"] };
  const n = streakNote("NBA", s);
  assert.equal(n[1], "on 2025-26 NBA games, a line a player had hit 10 games in a row hit the next one 86% of the time, when Kalshi had it at 87%");
  assert.match(n[2], /1,315 lines\), about as often as the price said\./);
  assert.match(streakNote("NBA", { ...s, diff_95: [-0.03, -0.01] })[2], /less often than the price said/);
  assert.match(streakNote("NHL", { ...s, rungs: 15 })[0], /^Too few past NHL streaks to measure \(15 lines\)/);
  assert.match(streakNote("NFL", undefined)[0], /aren't measured yet/);
});
