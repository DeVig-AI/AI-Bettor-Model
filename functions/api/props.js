// DeVig live props prices (and one line's price history: ?history=TICKER, below): GET /api/props?tickers=KXNBAAST-26OCT31PHICHA-CHADSCHRODERPG-6,KXNBAPTS-...
// returns Kalshi's current buy and sell prices for up to 40 player-prop markets, with Kalshi's own wording
// ("Dennis Schröder: 6+ assists"), so the app compares DeVig's model to the price people actually see instead of the
// props bot's snapshot (which is refreshed only every few hours). Public market data: no Kalshi account or key.
// Display only. Answers are kept for 30 seconds so many viewers share one Kalshi request.
const KALSHI = "https://api.elections.kalshi.com/trade-api/v2";
const TTL = 30, MAX_TICKERS = 40;
// player-prop series DeVig reads: KX + league + stat, e.g. KXNBAAST, KXNBAPTS, KXNFLRSHYDS, KXNHLGOAL
const TICKER = /^KX(?:NBA|WNBA|NFL|NHL|MLB)[A-Z0-9]{2,12}-[A-Z0-9]{6,30}-[A-Z0-9]{2,40}-[0-9]{1,4}(?:P[0-9]{1,2})?$/;   // NFL fantasy lines end like 22P5 (22.5)
// team props (functions/api/team-props.js): KXNFLTEAMTOTAL-26NOV16LACBAL-BAL22, KXNBASPREAD-...-PHX9, KXNHLTOTAL-...-6
const TEAM_TICKER = /^KX(?:NBA|WNBA|NFL|NHL|MLB|NCAAMB|NCAAF)(?:TEAMTOTAL|SPREAD|TOTAL)-[0-9]{2}[A-Z]{3}[0-9]{2}[A-Z0-9]{2,16}-[A-Z0-9]{1,12}$/;
const mem = new Map();

function json(body, status = 200, maxAge = 0) {
  return new Response(JSON.stringify(body), {status, headers: {"content-type": "application/json",
    "cache-control": maxAge ? `public, max-age=${maxAge}` : "no-store"}});
}

// Kalshi sends prices either as dollars ("0.5400") or, in older fields, as cents (54)
function dollars(m, key) {
  const d = parseFloat(m[key + "_dollars"]);
  if (isFinite(d)) return d;
  const c = parseFloat(m[key]);
  return isFinite(c) ? (c > 1 ? c / 100 : c) : null;
}

export function parseTickers(raw) {
  const out = [];
  for (const t of String(raw || "").split(",")) {
    const s = t.trim().toUpperCase();
    if (s && (TICKER.test(s) || TEAM_TICKER.test(s)) && !out.includes(s)) out.push(s);
  }
  return out.slice(0, MAX_TICKERS);
}

// One market -> what the app needs. A side with no offer comes back null (shown as "no price"), never 0 or 1.
export function market(m) {
  const bid = dollars(m, "yes_bid"), ask = dollars(m, "yes_ask"), last = dollars(m, "last_price");
  const ok = v => v != null && v > 0 && v < 1;
  return {
    status: m.status || null,
    title: m.title || null,                      // Kalshi's wording, e.g. "Dennis Schröder: 6+ assists"
    bid: ok(bid) ? bid : null,                   // best price to sell Yes = 1 - price to buy No
    ask: ok(ask) ? ask : null,                   // best price to buy Yes
    last: ok(last) ? last : null,
    spread: ok(bid) && ok(ask) && ask >= bid ? Math.round((ask - bid) * 100) / 100 : null,
  };
}

// Price history for one line: GET /api/props?history=TICKER -> hourly middle of Kalshi's buy and sell price over the
// last 5 days, from Kalshi's public candlesticks. Hours with no real market (an empty side, or more than 15¢ between buy
// and sell) are left out, so the line only shows prices someone could actually trade at.
const HIST_TTL = 300, HIST_DAYS = 5;
export function historyPoints(candles) {
  const out = [];
  for (const c of candles || []) {
    const bid = parseFloat(c.yes_bid?.close_dollars), ask = parseFloat(c.yes_ask?.close_dollars);
    if (!(bid > 0 && ask < 1 && ask >= bid && ask - bid <= 0.15)) continue;
    out.push([c.end_period_ts, Math.round(((bid + ask) / 2) * 1000) / 1000]);
  }
  return out;
}

async function history(ticker, fetcher, now) {
  const hit = mem.get("h:" + ticker);
  if (hit && now() - hit.at < HIST_TTL * 1000) return json(hit.data, 200, 120);
  const end = Math.floor(now() / 1000), start = end - HIST_DAYS * 86400;
  const series = ticker.split("-")[0];
  try {
    const url = `${KALSHI}/series/${series}/markets/${ticker}/candlesticks?start_ts=${start}&end_ts=${end}&period_interval=60`;
    const r = await fetcher(url, {headers: {accept: "application/json"}, cf: {cacheTtl: HIST_TTL, cacheEverything: true}});
    if (!r.ok) return json({error: "history unavailable"}, 502);
    const data = {ticker, points: historyPoints((await r.json()).candlesticks)};
    mem.set("h:" + ticker, {at: now(), data});
    if (mem.size > 200) mem.delete(mem.keys().next().value);
    return json(data, 200, 120);
  } catch (e) {
    return json({error: "history unavailable"}, 502);
  }
}

export async function handle(request, fetcher = fetch, now = Date.now) {
  if (request.method !== "GET") return json({error: "method not allowed"}, 405);
  const h = new URL(request.url).searchParams.get("history");
  if (h != null) {
    const [t] = parseTickers(h);
    return t ? history(t, fetcher, now) : json({error: "no valid ticker"}, 400);
  }
  const tickers = parseTickers(new URL(request.url).searchParams.get("tickers"));
  if (!tickers.length) return json({error: "no valid tickers"}, 400);
  const key = tickers.slice().sort().join(",");
  const hit = mem.get(key);
  if (hit && now() - hit.at < TTL * 1000) return json(hit.data, 200, 15);
  try {
    const url = `${KALSHI}/markets?tickers=${encodeURIComponent(tickers.join(","))}&limit=${MAX_TICKERS}`;
    const r = await fetcher(url, {headers: {accept: "application/json"}, cf: {cacheTtl: TTL, cacheEverything: true}});
    if (!r.ok) return json({error: "prices unavailable"}, 502);
    const markets = {};
    for (const m of (await r.json()).markets || []) if (tickers.includes(m.ticker)) markets[m.ticker] = market(m);
    const data = {fetched_at: new Date(now()).toISOString().replace(/\.\d+Z$/, "Z"), markets,
                  missing: tickers.filter(t => !markets[t])};
    mem.set(key, {at: now(), data});
    if (mem.size > 200) mem.delete(mem.keys().next().value);
    return json(data, 200, 15);
  } catch (e) {
    return json({error: "prices unavailable"}, 502);
  }
}

export async function onRequest(context) {
  return handle(context.request);
}
