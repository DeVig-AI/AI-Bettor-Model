// Team props: /api/team-props (Kalshi's team total, winning margin and game total ladders for one game) and the
// drawer's math (web/src/lib/team-props-math.ts). No browser needed:
//   node --test tests/app/team_props.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { handle, ladders, parseGame } from "../../functions/api/team-props.js";
import { parseTickers } from "../../functions/api/props.js";
import { allowedOf, expected, fifty, hitCount, mainRung, valuesOf } from "../../web/src/lib/team-props-math.ts";

const G = "KXNFLGAME-26NOV16LACBAL-BAL";
const m = (ticker, strike, bid, ask, extra = {}) =>
  ({ ticker, floor_strike: strike, strike_type: "greater", yes_bid_dollars: String(bid), yes_ask_dollars: String(ask), ...extra });

test("parseGame splits the home team off the event", () => {
  assert.deepEqual(parseGame(G), { league: "KXNFL", event: "26NOV16LACBAL", home: "BAL", away: "LAC" });
  assert.deepEqual(parseGame("kxncaambgame-26nov10kuuk-uk"), { league: "KXNCAAMB", event: "26NOV10KUUK", home: "UK", away: "KU" });
  assert.equal(parseGame("KXNFLGAME-26NOV16LACBAL-NYG"), null);
  assert.equal(parseGame("KXNFLGAME-26NOV16BAL-BAL"), null);
  assert.equal(parseGame("nonsense"), null);
});

test("ladders: need = strike + 0.5, split by team, sorted, junk rows dropped", () => {
  const g = parseGame(G);
  const out = ladders([
    m("KXNFLTEAMTOTAL-26NOV16LACBAL-BAL24", 24.5, 0.38, 0.41),
    m("KXNFLTEAMTOTAL-26NOV16LACBAL-BAL21", 21.5, 0.52, 0.55),
    m("KXNFLTEAMTOTAL-26NOV16LACBAL-LAC17", 17.5, 0.5, 0.53),
    m("KXNFLTEAMTOTAL-26NOV16LACBAL-LAC20", 20.5, 0.5, 0.4), // ask under bid
    m("KXNFLTEAMTOTAL-26NOV16LACBAL-LAC27", 27.5, 0.1, 0.12, { strike_type: "less" }),
  ], "tt", g);
  assert.deepEqual(out.BAL.map((r) => r[0]), [22, 25]);
  assert.deepEqual(out.LAC, [[18, 0.5, 0.53, "KXNFLTEAMTOTAL-26NOV16LACBAL-LAC17"]]);
  const tot = ladders([m("KXNFLTOTAL-26NOV16LACBAL-42", 41.5, 0.4, 0.43), m("KXNFLTOTAL-26NOV16LACBAL-39", 38.5, 0.5, 0.52)], "total", g);
  assert.deepEqual(tot.map((r) => r[0]), [39, 42]);
});

test("handle fetches the three series once and caches for 60 seconds", async () => {
  const urls = [];
  const fetcher = async (url) => {
    urls.push(url);
    const s = url.match(/event_ticker=KXNFL(\w+?)-/)[1];
    const markets = s === "TOTAL" ? [m("KXNFLTOTAL-26NOV16LACBAL-39", 38.5, 0.5, 0.52)]
      : s === "SPREAD" ? [m("KXNFLSPREAD-26NOV16LACBAL-BAL3", 3.5, 0.55, 0.58)]
      : [m("KXNFLTEAMTOTAL-26NOV16LACBAL-LAC17", 17.5, 0.5, 0.53)];
    return new Response(JSON.stringify({ markets }));
  };
  let t = 1_800_000_000_000;
  const req = new Request(`https://x/api/team-props?game=${G}`);
  const r = await handle(req, fetcher, () => t);
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(urls.length, 3);
  assert.equal(d.home, "BAL");
  assert.equal(d.by.BAL[0][0], 4);
  assert.equal(d.tt.LAC[0][0], 18);
  assert.equal(d.total[0][0], 39);
  t += 30_000;
  await handle(req, fetcher, () => t);
  assert.equal(urls.length, 3);
  assert.equal((await handle(new Request("https://x/api/team-props?game=bad"), fetcher)).status, 400);
  const down = await handle(new Request("https://x/api/team-props?game=KXNBAGAME-26NOV10BOSNYK-NYK"), async () => new Response("", { status: 500 }));
  assert.equal(down.status, 502);
});

test("team tickers pass the price and history filter", () => {
  const t = ["KXNFLTEAMTOTAL-26NOV16LACBAL-BAL22", "KXNFLSPREAD-26NOV16LACBAL-LAC8", "KXNFLTOTAL-26NOV16LACBAL-39"];
  assert.deepEqual(parseTickers(t.join(",")), t);
});

const R = (need, mid) => [need, mid - 0.01, mid + 0.01, `T${need}`];

test("mainRung is the line closest to even; fifty interpolates where the ladder crosses 50%", () => {
  const rs = [R(19, 0.7), R(22, 0.52), R(25, 0.36)];
  assert.equal(mainRung(rs)[0], 22);
  assert.equal(mainRung([]), null);
  assert.ok(Math.abs(fifty(rs) - (21.5 + (0.02 / 0.16) * 3)) < 1e-9);
  assert.equal(fifty([R(22, 0.4)]), null);
});

test("expected splits the game total by the margin", () => {
  const e = expected({ away: "LAC", home: "BAL", total: [R(40, 0.6), R(42, 0.4)], tt: {},
    by: { BAL: [R(3, 0.6), R(5, 0.4)], LAC: [R(1, 0.3)] } });
  assert.equal(e.fav, "BAL");
  assert.ok(Math.abs(e.total - 40.5) < 1e-9 && Math.abs(e.margin - 3.5) < 1e-9);
  assert.equal(e.pts.BAL, 22);
  assert.equal(e.pts.LAC, 18.5);
});

test("valuesOf / allowedOf count points, margin and total; unplayed games skipped", () => {
  const games = [["2026-11-09", "PIT", "H", 24, 17, "W", "R", 2026], ["2026-11-02", "CIN", "A", 13, 20, "L", "R", 2026],
    ["2026-11-16", "LAC", "H", null, null, "", "R", 2026]];
  assert.deepEqual(valuesOf(games, "tt").map((g) => g.v), [24, 13]);
  assert.deepEqual(valuesOf(games, "by").map((g) => g.v), [7, -7]);
  assert.deepEqual(valuesOf(games, "total").map((g) => g.v), [41, 33]);
  assert.deepEqual(allowedOf(games, "tt").map((g) => g.v), [17, 20]);
  assert.deepEqual(allowedOf(games, "by").map((g) => g.v), [-7, 7]);
  assert.equal(hitCount([24, 13, 22], 22), 2);
});
