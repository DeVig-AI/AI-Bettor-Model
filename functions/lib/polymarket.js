// Polymarket links for the bet link reader (functions/api/kalshi.js): a pasted polymarket.com link reads back in the
// same shape as a Kalshi one, from Polymarket's public market data (no account or key):
//   - a game or event page -> kind "event": every side of every market, so you pick the one you bet
//   - one market's link -> kind "event" too: a Polymarket market has two sides (Pistons / Heat, Over / Under) and the
//     link doesn't say which is yours
//   - "pm:<market slug>~<side>" -> kind "market": the side you picked, followed and graded like a Kalshi bet
// Polymarket has no parlays, so there's no combo here. Display only.
const GAMMA = "https://gamma-api.polymarket.com";
const TTL = 30, MAX_LEGS = 80;
const SLUG = /^[a-z0-9][a-z0-9-]{1,199}$/;

// a polymarket.com link -> {slug, market} (market: the link names one market inside the event), "pm:slug~1" ->
// {slug, side: 1}. Anything else -> null.
export function parsePoly(raw) {
  const s = String(raw || "").trim();
  if (!s || s.length > 600) return null;
  const pm = /^pm:([a-z0-9-]+)~([01])$/i.exec(s);
  if (pm) return SLUG.test(pm[1].toLowerCase()) ? {slug: pm[1].toLowerCase(), side: Number(pm[2])} : null;
  if (!/^https?:\/\//i.test(s) && !/^(www\.)?polymarket\.com\//i.test(s)) return null;
  let u;
  try { u = new URL(/^https?:/i.test(s) ? s : `https://${s}`); } catch (e) { return null; }
  if (!/^(www\.)?polymarket\.com$/i.test(u.hostname)) return null;
  const parts = u.pathname.split("/").filter(Boolean).map(p => { try { return decodeURIComponent(p).toLowerCase(); } catch (e) { return ""; } });
  let slug = null, market = null;
  if ((parts[0] === "event" || parts[0] === "market") && parts[1]) { slug = parts[1]; market = parts[2] || (parts[0] === "market" ? parts[1] : null); }
  else if (parts[0] === "sports" && parts.length > 1) slug = parts[parts.length - 1];   // polymarket.com/sports/nba/games/…/<game>
  if (!slug || !SLUG.test(slug) || (market && !SLUG.test(market))) return null;
  return market ? {slug, market} : {slug};
}

export const isPoly = raw => parsePoly(raw) != null;

const list = v => { if (Array.isArray(v)) return v; try { const a = JSON.parse(v); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
const num = v => { const n = parseFloat(v); return isFinite(n) ? n : null; };
const ok = v => v != null && v > 0 && v < 1;
const r4 = v => (v == null ? null : Math.round(v * 10000) / 10000);
const signed = n => (n > 0 ? `+${n}` : `${n}`);

// what side i of a market says, in words: "Pistons", "Heat +4.5", "Over 231.5", or the market's own name for Yes/No
export function sideWords(m, i) {
  const outs = list(m.outcomes).map(String);
  const o = outs[i] ?? "";
  const line = num(m.line);
  const type = m.sportsMarketType || "";
  if (/^(yes|no)$/i.test(o)) return {title: String(m.groupItemTitle || m.question || o).replace(/\?$/, ""), side: /^no$/i.test(o) ? "no" : "yes"};
  if (type === "moneyline") return {title: `${o} win`, side: "yes"};
  if (type === "spreads" && line != null) return {title: `${o} ${signed(i === 0 ? line : -line)}`, side: "yes"};
  if (type === "totals" && line != null) return {title: `${o} ${line}`, side: "yes"};
  const what = String(m.groupItemTitle || m.question || "");
  return {title: what && what !== o ? `${o} · ${what}` : o, side: "yes"};
}

// one side of a Polymarket market, in the Kalshi reader's leg shape. Polymarket's best bid/ask are for the first
// side; the second side's are the mirror (buying it = selling the first). A closed market whose price is 1 or 0 is
// won or lost; a split 50/50 (a void) has no result.
export function pricedPoly(m, i) {
  const prices = list(m.outcomePrices).map(num);
  const b0 = num(m.bestBid), a0 = num(m.bestAsk), l0 = num(m.lastTradePrice);
  const second = i === 1;
  const bid = second ? (ok(a0) ? 1 - a0 : null) : (ok(b0) ? b0 : null);
  const ask = second ? (ok(b0) ? 1 - b0 : null) : (ok(a0) ? a0 : null);
  const last = ok(l0) ? (second ? 1 - l0 : l0) : null;
  const p = prices[i];
  let result = null;
  if (m.closed && (p === 1 || p === 0)) result = p === 1 ? "won" : "lost";
  const chance = result ? (result === "won" ? 1 : 0)
    : bid != null && ask != null && ask - bid <= 0.1 ? (bid + ask) / 2 : ok(p) ? p : ask ?? bid ?? last;
  const w = sideWords(m, i);
  return {
    ticker: `pm:${m.slug}~${i}`,
    event: null,
    title: w.title,
    pick: w.title,
    side: w.side,
    status: m.closed ? "finalized" : m.active ? "active" : null,
    result,
    bid: r4(bid), ask: r4(ask), last: r4(last), chance: r4(chance),
    closes: m.gameStartTime ? null : (m.endDate || null),
    strike: null, strike_type: null,
  };
}

async function get(fetcher, path) {
  const r = await fetcher(`${GAMMA}${path}`, {headers: {accept: "application/json"}, cf: {cacheTtl: TTL, cacheEverything: true}});
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`polymarket ${r.status}`);
  return r.json();
}

// the game's main bet first, then spreads and totals by their line, then everything else
const ORDER = {moneyline: 0, spreads: 1, totals: 2};
function sorted(markets) {
  return markets.filter(m => m && m.slug && !m.archived && list(m.outcomes).length === 2)
    .map((m, k) => ({m, k}))
    .sort((a, b) => (ORDER[a.m.sportsMarketType] ?? 3) - (ORDER[b.m.sportsMarketType] ?? 3)
      || ((ORDER[a.m.sportsMarketType] ?? 3) < 3 ? Math.abs(num(a.m.line) ?? 0) - Math.abs(num(b.m.line) ?? 0) : 0) || a.k - b.k)
    .map(x => x.m);
}

// both sides of each market; for an event of Yes/No markets ("Who wins the title?"), every Yes before the No's
function sides(markets) {
  const ms = sorted(markets);
  const yesNo = ms.length > 1 && ms.every(m => /^yes$/i.test(String(list(m.outcomes)[0])));
  if (yesNo) return [...ms.map(m => pricedPoly(m, 0)), ...ms.map(m => pricedPoly(m, 1))];
  const legs = [];
  for (const m of ms) for (const i of [0, 1]) legs.push(pricedPoly(m, i));
  return legs;
}

// one market by its slug; Polymarket leaves finished ones out unless asked for closed markets
async function market(fetcher, slug) {
  for (const q of ["", "&closed=true"]) {
    const d = await get(fetcher, `/markets?slug=${encodeURIComponent(slug)}${q}`);
    if (Array.isArray(d) && d[0]) return d[0];
  }
  return null;
}

// {slug, market?, side?} from parsePoly -> the reader's answer, or null when Polymarket has nothing at that link
export async function readPoly(p, fetcher = fetch) {
  if (p.side != null) {
    const m = await market(fetcher, p.slug);
    if (!m || list(m.outcomes).length !== 2) return null;
    return {kind: "market", source: "polymarket", ticker: `pm:${p.slug}~${p.side}`, market: pricedPoly(m, p.side)};
  }
  if (p.market) {
    const m = await market(fetcher, p.market);
    if (m) return {kind: "event", source: "polymarket", ticker: `pm:${p.market}`, title: m.question || null, sub: null, markets: sides([m])};
  }
  const d = await get(fetcher, `/events?slug=${encodeURIComponent(p.slug)}`);
  const e = Array.isArray(d) ? d[0] : null;
  if (e) {
    const legs = sides(e.markets || []);
    return {kind: "event", source: "polymarket", ticker: `pm:${p.slug}`, title: e.title || null, sub: null,
      markets: legs.slice(0, MAX_LEGS), truncated: legs.length > MAX_LEGS};
  }
  const m = await market(fetcher, p.slug);
  if (m) return {kind: "event", source: "polymarket", ticker: `pm:${p.slug}`, title: m.question || null, sub: null, markets: sides([m])};
  return null;
}
