// /api/kalshi: read a pasted Kalshi link (combo, one market, or a game page). No browser or network needed:
//   node --test tests/app/kalshi_api.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { handle, parseLink, priced, multiply, candles } from "../../functions/api/kalshi.js";

const COMBO = "KXMVECROSSCATEGORY-S20266MUJGEYGGMBSSJPK-ZNGMGDKXX";

test("links and tickers: the market ticker wins, then the last path part; other sites are refused", () => {
  assert.equal(parseLink(`https://kalshi.com/markets/kxmvecrosscategory/arizona-st-vs-byu/KXMVECROSSCATEGORY-S20266MUJGEYGGMBSSJPK?utm_source=x&marketTicker=${COMBO}`), COMBO);
  assert.equal(parseLink("https://kalshi.com/markets/kxnbagame/professional-basketball-game/kxnbagame-26oct31poruta"), "KXNBAGAME-26OCT31PORUTA");
  assert.equal(parseLink("kalshi.com/markets/kxnbagame/x/kxnbagame-26oct31poruta"), "KXNBAGAME-26OCT31PORUTA");
  assert.equal(parseLink(" kxnbagame-26oct31poruta-uta "), "KXNBAGAME-26OCT31PORUTA-UTA");
  assert.equal(parseLink("https://evil.com/markets/x/KXNBAGAME-26OCT31PORUTA"), null);
  assert.equal(parseLink("https://kalshi.com.evil.com/markets/x/y"), null);
  assert.equal(parseLink("https://kalshi.com/markets"), null);
  assert.equal(parseLink("drop table; --"), null);
  assert.equal(parseLink(""), null);
});

test("prices from the side you picked; a settled market is won or lost; no offer is null, never 0 or 1", () => {
  const m = {ticker: "T", title: "Atlanta wins", yes_sub_title: "Atlanta", status: "active", yes_bid_dollars: "0.4000", yes_ask_dollars: "0.4400"};
  assert.deepEqual([priced(m).bid, priced(m).ask, priced(m).chance], [0.4, 0.44, 0.42]);
  const no = priced(m, "no");
  assert.deepEqual([no.pick, no.bid, no.ask, no.chance], ["No: Atlanta", 0.56, 0.6, 0.58]);
  const done = {...m, status: "finalized", result: "no", yes_bid_dollars: "0.0000", yes_ask_dollars: "1.0000"};
  assert.deepEqual([priced(done).result, priced(done).chance, priced(done).bid, priced(done).ask], ["lost", 0, null, null]);
  assert.equal(priced(done, "no").result, "won");
  assert.equal(priced({yes_bid: 33, yes_ask: 36}).chance, 0.345);
  assert.equal(multiply([{chance: 0.5}, {chance: 0.4}]), 0.2);
  assert.equal(multiply([{chance: 0.5}, {chance: null}]), null);
});

function kalshi(calls) {
  const legs = [{event_ticker: "E1", market_ticker: "E1-A", side: "yes"}, {event_ticker: "E2", market_ticker: "E2-B", side: "no"}];
  return async url => {
    calls.push(url);
    const u = new URL(url);
    const body = u.pathname.endsWith(`/markets/${COMBO}`)
      ? {market: {ticker: COMBO, status: "active", yes_bid_dollars: "0.1000", yes_ask_dollars: "0.1200", mve_selected_legs: legs}}
      : u.pathname.endsWith("/markets") && u.searchParams.get("tickers")
        ? {markets: [{ticker: "E1-A", yes_sub_title: "Atlanta", status: "active", yes_bid_dollars: "0.4900", yes_ask_dollars: "0.5100"},
                     {ticker: "E2-B", yes_sub_title: "Boston", status: "finalized", result: "no"}]}
        : u.pathname.endsWith("/events/KXNBAGAME-26NOV04ATLWAS")
          ? {event: {title: "Atlanta vs Washington"}, markets: [{ticker: "X-ATL", yes_sub_title: "Atlanta", yes_bid_dollars: "0.4", yes_ask_dollars: "0.5"}]}
          : null;
    return body ? new Response(JSON.stringify(body), {status: 200}) : new Response("{}", {status: 404});
  };
}

test("a combo: every leg from its own side, the result so far, and the legs multiplied", async () => {
  const calls = [];
  const r = await handle(new Request(`https://x/api/kalshi?link=${encodeURIComponent("https://kalshi.com/markets/kxmve/x/S?marketTicker=" + COMBO)}`), kalshi(calls), () => 1e12);
  const d = await r.json();
  assert.equal(r.status, 200);
  assert.equal(d.kind, "combo");
  assert.deepEqual(d.legs.map(l => [l.pick, l.result, l.chance]), [["Atlanta", null, 0.5], ["No: Boston", "won", 1]]);
  assert.equal(d.multiplied, 0.5);
  assert.deepEqual([d.won, d.lost, d.combo.chance], [1, 0, 0.11]);
  assert.equal(calls.length, 2);
  await handle(new Request(`https://x/api/kalshi?link=${COMBO}`), kalshi(calls), () => 1e12 + 5000);
  assert.equal(calls.length, 2, "shared for 30 seconds");
});

test("a game page link reads the event; unknown and bad links say so", async () => {
  const calls = [];
  const ev = await (await handle(new Request("https://x/api/kalshi?link=kxnbagame-26nov04atlwas"), kalshi(calls))).json();
  assert.equal(ev.kind, "event");
  assert.deepEqual(ev.markets.map(m => [m.pick, m.chance]), [["Atlanta", 0.45]]);
  assert.equal((await handle(new Request("https://x/api/kalshi?link=KXNOPE-1"), kalshi(calls))).status, 404);
  assert.equal((await handle(new Request("https://x/api/kalshi?link=https://evil.com/a/b"), kalshi(calls))).status, 400);
  assert.equal((await handle(new Request("https://x/api/kalshi?link=KXNOPE-1", {method: "POST"}), kalshi(calls))).status, 405);
});

test("a prop's strike rides along: 224.5 'greater' is 225+", () => {
  const p = priced({ticker: "KXNFLPASSYDS-26NOV01TENCIN-CINJBURROW9-225", title: "Joe Burrow: 225+ passing yards", floor_strike: 224.5, strike_type: "greater"});
  assert.deepEqual([p.strike, p.strike_type], [224.5, "greater"]);
  assert.deepEqual([priced({}).strike, priced({}).strike_type], [null, null]);
});

test("history: hourly Yes chances from Kalshi's candles (midpoint, else the last trade)", async () => {
  assert.deepEqual(candles({candlesticks: [
    {end_period_ts: 100, yes_bid: {close_dollars: "0.40"}, yes_ask: {close_dollars: "0.44"}, price: {close_dollars: "0.41"}},
    {end_period_ts: 200, yes_bid: {close_dollars: "0.0000"}, yes_ask: {close_dollars: "1.0000"}, price: {close_dollars: "0.0100"}},
    {end_period_ts: 300, yes_bid: {}, yes_ask: {}, price: {}},
  ]}), [{t: 100, p: 0.42}, {t: 200, p: 0.01}]);
  const calls = [];
  const f = async url => { calls.push(url); return new Response(JSON.stringify({candlesticks: [{end_period_ts: 5, price: {close_dollars: "0.5"}}]}), {status: 200}); };
  const r = await handle(new Request("https://x/api/kalshi?history=KXNBAGAME-26OCT31PHICHA-CHA&from=1793400000"), f, () => 1793500000e3);
  assert.deepEqual(await r.json(), {ticker: "KXNBAGAME-26OCT31PHICHA-CHA", points: [{t: 5, p: 0.5}]});
  assert.match(calls[0], /\/series\/KXNBAGAME\/markets\/KXNBAGAME-26OCT31PHICHA-CHA\/candlesticks\?start_ts=1793400000&end_ts=1793500000&period_interval=60$/);
  assert.equal((await handle(new Request("https://x/api/kalshi?history=nope"), f)).status, 400);
});
