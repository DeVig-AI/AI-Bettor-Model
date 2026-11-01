// /api/prices: live Kalshi prices for game-winner markets, so the Games board's refresh shows Kalshi now instead of
// the game-lines bot's last snapshot. No browser needed:
//   node --test tests/app/prices_api.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { handle, parseTickers } from "../../functions/api/prices.js";

const TB = "KXNFLGAME-26NOV01ATLTB-TB", LAL = "KXNBAGAME-26NOV01TORLAL-LAL";

test("only game-winner tickers get through, deduped and capped", () => {
  assert.deepEqual(parseTickers(`${TB}, ${TB.toLowerCase()},${LAL},DROP TABLE,KXNBAPTS-26OCT31ATLNOP-ATLAWIGGINS2-10`), [TB, LAL]);
  assert.deepEqual(parseTickers("KXNCAAFGAME-26NOV03BUFFMOH-MOH,KXNHLGAME-26NOV01WPGCAR-CAR"),
    ["KXNCAAFGAME-26NOV03BUFFMOH-MOH", "KXNHLGAME-26NOV01WPGCAR-CAR"]);
  assert.equal(parseTickers(Array.from({length: 60}, (_, i) => `KXNFLGAME-26NOV01ATLTB${i}-TB`).join(",")).length, 40);
  assert.deepEqual(parseTickers(""), []);
});

test("returns Kalshi's prices, names what's missing, and shares one request for 30 seconds", async () => {
  let calls = 0, t = 1_000_000;
  const fetcher = async url => {
    calls++;
    assert.match(url, /markets\?tickers=/);
    return new Response(JSON.stringify({markets: [{ticker: TB, status: "active", yes_bid_dollars: "0.5200", yes_ask_dollars: "0.5500"}]}));
  };
  const get = () => handle(new Request(`https://x/api/prices?tickers=${TB},${LAL}`), fetcher, () => t);
  const d = await (await get()).json();
  assert.equal(d.markets[TB].bid, 0.52); assert.equal(d.markets[TB].ask, 0.55);
  assert.deepEqual(d.missing, [LAL]);
  await get(); assert.equal(calls, 1);
  t += 31_000; await get(); assert.equal(calls, 2);
});

test("bad requests and Kalshi failures answer cleanly", async () => {
  assert.equal((await handle(new Request("https://x/api/prices?tickers=nope"))).status, 400);
  assert.equal((await handle(new Request("https://x/api/prices", {method: "POST"}))).status, 405);
  const down = async () => new Response("", {status: 503});
  assert.equal((await handle(new Request(`https://x/api/prices?tickers=KXNHLGAME-26NOV01EDMNYR-NYR`), down)).status, 502);
});
