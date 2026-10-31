// Odds math in docs/index.html (fair chances, Kalshi fee), read straight from the page: node --test tests/app/oddsmath.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SRC = readFileSync(new URL("../../docs/index.html", import.meta.url), "utf8");
const grab = name => SRC.match(new RegExp("function " + name + "\\([\\s\\S]*?\\n  }"))[0];
const M = new Function([grab("impliedProb"), grab("isExchange"), grab("devigTwoWay"), "var KALSHI_ORDER = 10;", grab("propFee"),
  "return {devigTwoWay, propFee};"].join("\n"))();
const near = (a, b, tol = 5e-4) => assert.ok(Math.abs(a - b) < tol, `${a} vs ${b}`);

test("even lines are 50/50 either way", () => {
  const d = M.devigTwoWay(-110, -110, "DraftKings");
  near(d.a, 0.5); near(d.b, 0.5); near(d.vig, 0.0476);
});

test("a sportsbook's long shot gets more of the vig taken off (power method)", () => {
  const d = M.devigTwoWay(-300, 250, "DraftKings");
  near(d.simpleB, 0.2759); near(d.b, 0.2637);
  assert.ok(d.b < d.simpleB); near(d.a + d.b, 1, 1e-9);
});

test("Kalshi has no built-in vig: the fair chance stays the proportional split", () => {
  const d = M.devigTwoWay(215, -260, "Kalshi");
  near(d.a, d.simpleA, 1e-12); near(d.a, 0.3053);
});

test("Kalshi fee: rounded up to the cent per order", () => {
  near(M.propFee(0.05, 0.05), 0.01, 1e-12);        // one 5c contract pays 1c, not 0.33c
  near(M.propFee(0.5, 0.5), 0.02, 1e-12);          // one 50c contract pays 2c, not 1.75c
  near(M.propFee(0.55, 55) * 100, 1.74, 1e-9);     // Kalshi's example: 100 contracts at 55c, $1.74
  near(M.propFee(0.5, 10), 0.0175, 1e-12);         // 20 contracts at 50c: exactly 35c, no extra cent
  assert.equal(M.propFee(0, 10), 0);
});
