// DeVig Kalshi link reader: GET /api/kalshi?link=<a kalshi.com link or a ticker> returns what that link is and its
// prices now, from Kalshi's public market data (no Kalshi account or key):
//   - a combo (Kalshi's multi-leg "combo" markets, e.g. links with marketTicker=KXMVE...): the combo's own price and
//     every leg with its pick, price and result, plus the legs' chances multiplied together
//   - one market: its pick, price, status and result
//   - an event (a game page link): each of its markets
// Display only. Answers are kept for 30 seconds so many viewers share one Kalshi request.
const KALSHI = "https://api.elections.kalshi.com/trade-api/v2";
const TTL = 30, MAX_LEGS = 80, MAX_EVENT_MARKETS = 40;
const TICKER = /^[A-Z0-9][A-Z0-9._-]{2,99}$/;
const mem = new Map();

function json(body, status = 200, maxAge = 0) {
  return new Response(JSON.stringify(body), {status, headers: {"content-type": "application/json",
    "cache-control": maxAge ? `public, max-age=${maxAge}` : "no-store"}});
}

// "https://kalshi.com/markets/kxmvecrosscategory/x/KXMVE...-S2026...?marketTicker=KXMVE...-ZNG" -> the market ticker;
// "https://kalshi.com/markets/kxnbagame/professional-basketball-game/kxnbagame-26oct31poruta" -> the event ticker.
// A bare ticker works too. Anything else -> null.
export function parseLink(raw) {
  const s = String(raw || "").trim();
  if (!s || s.length > 600) return null;
  let t = null;
  if (/^https?:\/\//i.test(s) || /^(www\.)?kalshi\.com\//i.test(s)) {
    let u;
    try { u = new URL(/^https?:/i.test(s) ? s : `https://${s}`); } catch (e) { return null; }
    if (!/(^|\.)kalshi\.com$/i.test(u.hostname)) return null;
    t = u.searchParams.get("marketTicker") || u.searchParams.get("market_ticker");
    if (!t) {
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts[0] !== "markets" && parts[0] !== "events") return null;
      t = parts.length > 1 ? parts[parts.length - 1] : null;
    }
  } else t = s;
  t = t ? decodeURIComponent(t).trim().toUpperCase() : null;
  return t && TICKER.test(t) ? t : null;
}

// Kalshi sends prices either as dollars ("0.5400") or, in older fields, as cents (54)
function dollars(m, key) {
  const d = parseFloat(m[key + "_dollars"]);
  if (isFinite(d)) return d;
  const c = parseFloat(m[key]);
  return isFinite(c) ? (c > 1 ? c / 100 : c) : null;
}
const ok = v => v != null && v > 0 && v < 1;
const settled = m => ["finalized", "settled", "determined"].includes(m.status) && (m.result === "yes" || m.result === "no");

// One market, seen from one side ("yes" or "no"). Prices are for that side: buying No costs 1 - Yes's bid.
// chance = the midpoint of buy and sell (or the last trade when one side has no offer); null when there's nothing.
export function priced(m, side = "yes") {
  const yb = dollars(m, "yes_bid"), ya = dollars(m, "yes_ask"), yl = dollars(m, "last_price");
  const no = side === "no";
  const bid = no ? (ok(ya) ? 1 - ya : null) : (ok(yb) ? yb : null);
  const ask = no ? (ok(yb) ? 1 - yb : null) : (ok(ya) ? ya : null);
  const last = ok(yl) ? (no ? 1 - yl : yl) : null;
  let result = null;
  if (settled(m)) result = m.result === side ? "won" : "lost";
  const chance = result ? (result === "won" ? 1 : 0)
    : bid != null && ask != null ? (bid + ask) / 2 : ask ?? bid ?? last;
  const round = v => (v == null ? null : Math.round(v * 10000) / 10000);
  return {
    ticker: m.ticker || null,
    event: m.event_ticker || null,
    title: m.title || null,
    pick: (no ? "No: " : "") + (m.yes_sub_title || m.subtitle || m.title || m.ticker || ""),
    side,
    status: m.status || null,
    result,
    bid: round(bid), ask: round(ask), last: round(last), chance: round(chance),
    closes: m.close_time || null,
  };
}

// the legs' chances multiplied: what the combo would cost if the legs had nothing to do with each other
export function multiply(legs) {
  if (!legs.length || legs.some(l => l.chance == null)) return null;
  return Math.round(legs.reduce((p, l) => p * l.chance, 1) * 1e6) / 1e6;
}

async function get(fetcher, path) {
  const r = await fetcher(`${KALSHI}${path}`, {headers: {accept: "application/json"}, cf: {cacheTtl: TTL, cacheEverything: true}});
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`kalshi ${r.status}`);
  return r.json();
}

export async function read(ticker, fetcher = fetch) {
  const one = await get(fetcher, `/markets/${encodeURIComponent(ticker)}`);
  const m = one && one.market;
  if (m && Array.isArray(m.mve_selected_legs) && m.mve_selected_legs.length) {
    const wanted = m.mve_selected_legs.slice(0, MAX_LEGS);
    const tks = [...new Set(wanted.map(l => String(l.market_ticker || "")).filter(t => TICKER.test(t)))];
    const byT = {};
    for (let i = 0; i < tks.length; i += 40) {
      const part = tks.slice(i, i + 40);
      const d = await get(fetcher, `/markets?tickers=${encodeURIComponent(part.join(","))}&limit=40`);
      for (const x of (d && d.markets) || []) byT[x.ticker] = x;
    }
    const legs = wanted.map(l => {
      const x = byT[l.market_ticker];
      const side = l.side === "no" ? "no" : "yes";
      return x ? priced(x, side) : {ticker: l.market_ticker, event: l.event_ticker || null, title: null, pick: l.market_ticker,
        side, status: null, result: null, bid: null, ask: null, last: null, chance: null, closes: null};
    });
    const combo = priced(m, "yes");
    return {kind: "combo", ticker, combo: {...combo, pick: `All ${legs.length} legs`}, legs, multiplied: multiply(legs),
      won: legs.filter(l => l.result === "won").length, lost: legs.filter(l => l.result === "lost").length,
      truncated: m.mve_selected_legs.length > wanted.length};
  }
  if (m) return {kind: "market", ticker, market: priced(m, "yes")};
  const ev = await get(fetcher, `/events/${encodeURIComponent(ticker)}?with_nested_markets=true`);
  const e = ev && (ev.event || null);
  if (e) {
    const list = (e.markets && e.markets.length ? e.markets : ev.markets || []).slice(0, MAX_EVENT_MARKETS);
    return {kind: "event", ticker, title: e.title || null, sub: e.sub_title || null, markets: list.map(x => priced(x, "yes"))};
  }
  return null;
}

export async function handle(request, fetcher = fetch, now = Date.now) {
  if (request.method !== "GET") return json({error: "method not allowed"}, 405);
  const ticker = parseLink(new URL(request.url).searchParams.get("link"));
  if (!ticker) return json({error: "That doesn't look like a Kalshi link.", code: "bad_link"}, 400);
  const hit = mem.get(ticker);
  if (hit && now() - hit.at < TTL * 1000) return json(hit.data, 200, 15);
  try {
    const found = await read(ticker, fetcher);
    if (!found) return json({error: "Kalshi doesn't have a market or event with that link.", code: "not_found"}, 404);
    const data = {fetched_at: new Date(now()).toISOString().replace(/\.\d+Z$/, "Z"), ...found};
    mem.set(ticker, {at: now(), data});
    if (mem.size > 200) mem.delete(mem.keys().next().value);
    return json(data, 200, 15);
  } catch (e) {
    return json({error: "Kalshi isn't answering right now. Try again in a minute.", code: "unavailable"}, 502);
  }
}

export async function onRequest(context) {
  return handle(context.request);
}
