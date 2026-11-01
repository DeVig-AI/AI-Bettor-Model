// DeVig win-chance graph for any sport: GET /api/winline?ticker=KXNBAGAME-26OCT20BOSDET-DET&start=<unix seconds>
// returns Kalshi's 1-minute price history for that team's win market as [[unix, chance]] (bid/ask midpoint, at
// most 150 points; &fine=1: 360, every minute of a game), plus the latest bid and ask. Display only. Answers are kept for a minute so viewers share them.
const KALSHI = "https://api.elections.kalshi.com/trade-api/v2";
const TTL = 60, MAX_POINTS = 150, FINE_POINTS = 360;
const mem = new Map();

function json(body, status = 200, maxAge = 0) {
  return new Response(JSON.stringify(body), {status, headers: {"content-type": "application/json",
    "cache-control": maxAge ? `public, max-age=${maxAge}` : "no-store"}});
}

function close(c, key) {
  const v = c[key];
  if (v && typeof v === "object") {
    if (v.close_dollars != null && v.close_dollars !== "") return parseFloat(v.close_dollars);
    const x = parseFloat(v.close);
    return isFinite(x) ? (x > 1 ? x / 100 : x) : null;
  }
  const d = parseFloat(c[key + "_close_dollars"]);
  return isFinite(d) ? d : null;
}

export function points(candles, max = MAX_POINTS) {
  let pts = [], last = null;
  for (const c of candles || []) {
    const b = close(c, "yes_bid"), a = close(c, "yes_ask");
    let v = b != null && a != null && b > 0 && b <= a && a < 1 ? (b + a) / 2 : close(c, "price");
    if (v != null && v >= 0 && v <= 1 && c.end_period_ts) pts.push([Number(c.end_period_ts), Math.round(v * 1000) / 1000]);
    if (b != null && a != null) last = {bid: b, ask: a};
  }
  if (pts.length > max) {                        // keep the shape, always keep the latest point
    const step = pts.length / max;
    pts = [...Array.from({length: max - 1}, (_, i) => pts[Math.floor(i * step)]), pts[pts.length - 1]];
  }
  return {points: pts, last};
}

export async function handle(request, fetcher = fetch) {
  if (request.method !== "GET") return json({error: "method not allowed"}, 405);
  const q = new URL(request.url).searchParams;
  const ticker = String(q.get("ticker") || "");
  const m = /^(KX(?:NFL|NBA|MLB|NHL|WNBA|NCAAF)GAME)-[A-Z0-9]{6,30}-[A-Z]{2,6}$/.exec(ticker);
  if (!m) return json({error: "bad ticker"}, 400);
  const now = Math.floor(Date.now() / 1000);
  let start = parseInt(q.get("start"), 10);
  if (!isFinite(start) || start < now - 2 * 86400) start = now - 6 * 3600;
  start = Math.floor(start / 300) * 300;           // round so viewers share one cached answer
  const max = q.get("fine") === "1" ? FINE_POINTS : MAX_POINTS;   // the 3D field matches plays to the minute
  const key = ticker + "|" + start + "|" + max;
  const hit = mem.get(key);
  if (hit && Date.now() - hit.at < TTL * 1000) return json(hit.data, 200, 30);
  try {
    const url = `${KALSHI}/series/${m[1]}/markets/${encodeURIComponent(ticker)}/candlesticks?start_ts=${start}&end_ts=${now}&period_interval=1`;
    const r = await fetcher(url, {headers: {accept: "application/json"}, cf: {cacheTtl: TTL, cacheEverything: true}});
    if (!r.ok) return json({error: "prices unavailable"}, 502);
    const data = {ticker, ...points((await r.json()).candlesticks, max)};
    mem.set(key, {at: Date.now(), data});
    if (mem.size > 80) mem.delete(mem.keys().next().value);
    return json(data, 200, 30);
  } catch (e) {
    return json({error: "prices unavailable"}, 502);
  }
}

export async function onRequest(context) {
  return handle(context.request);
}
