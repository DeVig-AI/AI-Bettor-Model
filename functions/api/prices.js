// DeVig live game prices: GET /api/prices?tickers=KXNFLGAME-26NOV01ATLTB-TB,KXNBAGAME-...
// returns Kalshi's current buy and sell prices for up to 40 game-winner markets (each ticker is one team's "wins"
// market). The Games board calls this when someone presses refresh, and every couple of minutes while it's open, so the
// prices shown are Kalshi's now instead of the game-lines bot's last snapshot (written about every 30 minutes).
// Public market data: no Kalshi account or key. Display only. Answers are kept for 30 seconds so many viewers share one
// Kalshi request.
import { market } from "./props.js";

const KALSHI = "https://api.elections.kalshi.com/trade-api/v2";
const TTL = 30, MAX_TICKERS = 40;
// game-winner series: KX + league + GAME, then the event, then the team, e.g. KXNFLGAME-26NOV01ATLTB-TB
const TICKER = /^KX(?:NFL|NBA|WNBA|NHL|MLB|NCAAF|NCAAMB)GAME-[A-Z0-9]{6,30}-[A-Z0-9]{1,8}$/;
const mem = new Map();

function json(body, status = 200, maxAge = 0) {
  return new Response(JSON.stringify(body), {status, headers: {"content-type": "application/json",
    "cache-control": maxAge ? `public, max-age=${maxAge}` : "no-store"}});
}

export function parseTickers(raw) {
  const out = [];
  for (const t of String(raw || "").split(",")) {
    const s = t.trim().toUpperCase();
    if (s && TICKER.test(s) && !out.includes(s)) out.push(s);
  }
  return out.slice(0, MAX_TICKERS);
}

export async function handle(request, fetcher = fetch, now = Date.now) {
  if (request.method !== "GET") return json({error: "method not allowed"}, 405);
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
