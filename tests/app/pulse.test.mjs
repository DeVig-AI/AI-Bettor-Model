// Parlay pulse: the chance a parlay hits over time (web/src/lib/pulse-math.ts) and /api/winline for any sports market.
// node --test tests/app/pulse.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { pulse, legAt, shortLeg } from "../../web/src/lib/pulse-math.ts";
import { handle, points } from "../../functions/api/winline.js";

const T = 1_800_000_000;
const leg = (o) => ({ title: "Buffalo wins", pick: "Buffalo", side: "yes", result: null, chance: null, points: [], ...o });

test("pulse multiplies the legs and ends on the prices now", () => {
  const a = leg({ points: [[T, 0.5], [T + 3600, 0.6]], chance: 0.62 });
  const b = leg({ title: "Over 44.5", points: [[T, 0.4], [T + 3600, 0.5]], chance: 0.5 });
  const p = pulse([a, b], T - 7200, T + 7200);
  assert.equal(p.line[0][0], T);                       // starts where the history does, not before
  assert.equal(p.start[1], 0.2);
  assert.equal(p.end[0], T + 7200);
  assert.equal(p.end[1], 0.31);                        // 0.62 x 0.5
  assert.equal(p.high[1], 0.31);
});

test("a No leg is flipped; a settled leg is 1 or 0 from the minute it settled, and marked", () => {
  const no = leg({ side: "no", points: [[T, 0.3]], chance: 0.7 });
  assert.equal(legAt(no, T + 60, T + 600), 0.7);
  const det = leg({ title: "Detroit wins", result: "won", points: [[T, 0.6], [T + 1800, 0.99]] });
  const lost = leg({ title: "Dennis Schröder: 6+ assists", result: "lost", points: [[T, 0.5], [T + 3600, 0.02]] });
  assert.equal(legAt(det, T + 1800, T + 7200), 1);
  assert.equal(legAt(lost, T + 4000, T + 7200), 0);
  const p = pulse([det, lost], T, T + 7200);
  assert.deepEqual(p.marks.map((m) => [m.label, m.won]), [["Detroit won", true], ["Schröder lost", false]]);
  assert.equal(p.end[1], 0);
});

test("short leg names", () => {
  assert.equal(shortLeg({ title: "Buffalo wins", pick: "Buffalo", side: "yes" }), "Buffalo");
  assert.equal(shortLeg({ title: "Buffalo wins", pick: "Buffalo", side: "no" }), "No on Buffalo");
  assert.equal(shortLeg({ title: "Dennis Schröder: 6+ assists", pick: "x", side: "yes" }), "Schröder");
});

test("no line without at least two points, or with a leg that has no price at all", () => {
  assert.equal(pulse([], T, T + 60).line.length, 0);
  assert.equal(pulse([leg({})], T, T + 3600).line.length, 0);
});

test("winline: thin minutes (2¢ bid, 98¢ ask) aren't prices; prop and spread tickers are allowed", async () => {
  const c = (ts, b, a, last) => ({ end_period_ts: ts, yes_bid: { close_dollars: String(b) }, yes_ask: { close_dollars: String(a) }, price: last == null ? {} : { close_dollars: String(last) } });
  const { points: pts } = points([c(1, 0.02, 0.98), c(2, 0.02, 0.98, 0.61), c(3, 0.6, 0.62)]);
  assert.deepEqual(pts, [[2, 0.61], [3, 0.61]]);
  const seen = [];
  const fetcher = async (u) => { seen.push(u); return new Response(JSON.stringify({ candlesticks: [] })); };
  for (const t of ["KXNBAAST-26OCT31PHICHA-CHADSCHRODERPG-6", "KXNFLSPREAD-26NOV01BALBUF-BUF7", "KXNFLGAME-26NOV01BALBUF-BUF"]) {
    const r = await handle(new Request(`https://x/api/winline?ticker=${t}`), fetcher);
    assert.equal(r.status, 200, t);
  }
  assert.match(seen[0], /\/series\/KXNBAAST\/markets\/KXNBAAST-26OCT31PHICHA-CHADSCHRODERPG-6\//);
  assert.equal((await handle(new Request("https://x/api/winline?ticker=KXBTC-26NOV01-T100000"), fetcher)).status, 400);
  assert.equal((await handle(new Request("https://x/api/winline?ticker=../x"), fetcher)).status, 400);
});
