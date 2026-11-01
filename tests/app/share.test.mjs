// Share card words for a finished parlay (web/src/lib/share-math.ts). node --test tests/app/share.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { shareText } from "../../web/src/lib/share-math.ts";

const leg = (label, result, weakest = false) => ({ label, result, score: null, weakest });

test("lost by one leg, and it was DeVig's weakest", () => {
  const t = shareText([leg("BUF to win", "won"), leg("DET to win", "won"), leg("ARI to win", "lost", true), leg("KC to win", "won")], 0.124, "Sun, Nov 1");
  assert.equal(t.kicker, "Sun, Nov 1 · 4-leg parlay");
  assert.equal(t.head, "3 of 4 hit");
  assert.equal(t.sub, "Lost by one leg. Kalshi had it at about 1 in 8 at kickoff.");
  assert.equal(t.weak, "DeVig flagged ARI to win as the weakest leg. It's the one that lost.");
  assert.match(t.text, /^3 of 4 hit on a 4-leg parlay\. Lost by one leg\./);
});

test("every leg hit; the weakest came through; short odds read as a percent; no odds when unknown", () => {
  const t = shareText([leg("A", "won", true), leg("B", "won")], 0.62, "Sat");
  assert.deepEqual([t.head, t.sub, t.weak], ["Every leg hit", "Cashed. Kalshi had it at 62% at kickoff.", "DeVig flagged A as the weakest leg. It came through."]);
  const u = shareText([leg("A", "lost"), leg("B", "lost"), leg("C", "won")], null, "Sat");
  assert.deepEqual([u.head, u.sub, u.weak], ["1 of 3 hit", "2 legs lost.", null]);
});
