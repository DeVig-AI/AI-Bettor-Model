// Prop pace: a player prop mid-game against the line and the player's usual by now (web/src/lib/pace-math.ts).
// node --test tests/app/pace.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { pace, usualOf } from "../../web/src/lib/pace-math.ts";

test("usual: the last 15 games before tonight, summed columns, needs 3 games", () => {
  const at = { date: 0, rush_yds: 1, rec_yds: 2 };
  const log = [["2026-11-01", 200, 0], ["2026-10-25", 60, 20], ["2026-10-18", 40, 40], ["2026-10-11", 100, "x"], ["2026-10-04", 70, 10]];
  assert.equal(usualOf(log, at, ["rush_yds", "rec_yds"], "2026-11-01"), 80); // tonight and the bad row left out
  assert.equal(usualOf(log, at, ["rush_yds"], "2026-10-12"), null); // only 1 game before
  assert.equal(usualOf(log, at, ["sacks"], "2026-11-01"), null);
});

test("pace: hit, missed, ahead, behind, on pace, early; a No leg flips", () => {
  assert.equal(pace(230, 225, "yes", 240, 0.8).status, "hit");
  assert.equal(pace(230, 225, "no", 240, 0.8).status, "missed");
  assert.equal(pace(200, 225, "yes", 240, null).status, "missed");
  assert.equal(pace(200, 225, "no", 240, null).status, "hit");
  const half = pace(140, 225, "yes", 240, 0.5);
  assert.deepEqual([half.status, half.need, half.usual], ["ahead", 85, 120]);
  assert.equal(pace(80, 225, "yes", 240, 0.5).status, "behind");
  assert.equal(pace(110, 225, "yes", 240, 0.5).status, "on");
  assert.equal(pace(80, 225, "no", 240, 0.5).status, "ahead");
  assert.equal(pace(0, 1, "yes", 0.6, 0.5).status, "on"); // a one-touchdown prop at the half isn't "behind"
  assert.equal(pace(10, 225, "yes", 240, 0.1).status, "early");
  assert.equal(pace(10, 225, "yes", null, 0.5).usual, null);
});
