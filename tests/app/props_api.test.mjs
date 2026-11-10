// /api/props: live Kalshi prices for player props, so the app stops comparing DeVig's model to a snapshot that can be
// hours old. No browser needed:
//   node --test tests/app/props_api.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { handle, parseTickers, market, historyPoints } from "../../functions/api/props.js";

const SCH = "KXNBAAST-26OCT31PHICHA-CHADSCHRODERPG-6";
const WIG = "KXNBAPTS-26OCT31ATLNOP-ATLAWIGGINS2-10";

test("only real prop tickers get through, deduped and capped", () => {
  assert.deepEqual(parseTickers(`${SCH}, ${SCH.toLowerCase()},${WIG},DROP TABLE,KXNBAGAME-26OCT31PORUTA-UTA`), [SCH, WIG]);
  assert.equal(parseTickers(Array.from({length: 60}, (_, i) => `${SCH.slice(0, -1)}${i + 1}`).join(",")).length, 40);
  assert.deepEqual(parseTickers(""), []);
  assert.deepEqual(parseTickers("KXNFLFFPTS-26NOV01ARIDAL-DALCLAMB88-22P5"), ["KXNFLFFPTS-26NOV01ARIDAL-DALCLAMB88-22P5"]);
});

test("prices read in dollars or cents; an empty side is null, never 0 or 1", () => {
  assert.deepEqual(market({status: "active", title: "Dennis Schröder: 6+ assists", yes_bid_dollars: "0.5400", yes_ask_dollars: "0.5500", last_price_dollars: "0.5400"}),
    {status: "active", title: "Dennis Schröder: 6+ assists", bid: 0.54, ask: 0.55, last: 0.54, spread: 0.01});
  assert.deepEqual(market({yes_bid: 33, yes_ask: 36, last_price: 34}),
    {status: null, title: null, bid: 0.33, ask: 0.36, last: 0.34, spread: 0.03});
  const empty = market({yes_bid_dollars: "0.0000", yes_ask_dollars: "1.0000"});
  assert.equal(empty.bid, null); assert.equal(empty.ask, null); assert.equal(empty.spread, null);
});

test("handler asks Kalshi once, reports missing tickers, and shares the answer for 30 seconds", async () => {
  let calls = 0, t = 1_800_000_000_000;
  const fetcher = async url => {
    calls++;
    assert.match(url, /\/markets\?tickers=/);
    return new Response(JSON.stringify({markets: [
      {ticker: SCH, status: "active", title: "Dennis Schröder: 6+ assists", yes_bid_dollars: "0.5400", yes_ask_dollars: "0.5500"}]}));
  };
  const req = () => new Request(`https://devigai.pages.dev/api/props?tickers=${SCH},${WIG}`);
  const r1 = await (await handle(req(), fetcher, () => t)).json();
  assert.equal(r1.markets[SCH].ask, 0.55);
  assert.deepEqual(r1.missing, [WIG]);
  t += 10_000;
  await handle(req(), fetcher, () => t);
  assert.equal(calls, 1);                       // cached
  t += 40_000;
  await handle(req(), fetcher, () => t);
  assert.equal(calls, 2);                       // expired, asked again
});

test("bad input and Kalshi outages give clear errors", async () => {
  assert.equal((await handle(new Request("https://x/api/props?tickers=nope"))).status, 400);
  assert.equal((await handle(new Request(`https://x/api/props?tickers=${SCH}`, {method: "POST"}))).status, 405);
  const down = async () => new Response("", {status: 503});
  assert.equal((await handle(new Request(`https://x/api/props?tickers=${WIG}`), down, () => 1)).status, 502);
});

test("history keeps only hours with a real market and asks Kalshi's candlesticks for that series", async () => {
  const c = (bid, ask, ts) => ({end_period_ts: ts, yes_bid: {close_dollars: String(bid)}, yes_ask: {close_dollars: String(ask)}});
  assert.deepEqual(historyPoints([c(0, 0.99, 1), c(0.45, 0.55, 2), c(0.2, 0.5, 3), c(0.46, 0.48, 4), c(0.5, 1, 5)]),
    [[2, 0.5], [4, 0.47]]);
  let asked = "";
  const fetcher = async url => { asked = url; return new Response(JSON.stringify({candlesticks: [c(0.4, 0.42, 9)]})); };
  const T = "KXNFLRECYDS-26NOV12WASNYG-NYGMNABERS1-70";
  const r = await handle(new Request(`https://x/api/props?history=${T}`), fetcher, () => 1_800_000_000_000);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), {ticker: T, points: [[9, 0.41]]});
  assert.match(asked, /\/series\/KXNFLRECYDS\/markets\/KXNFLRECYDS-26NOV12WASNYG-NYGMNABERS1-70\/candlesticks\?/);
  assert.equal((await handle(new Request("https://x/api/props?history=nope"), fetcher)).status, 400);
});
