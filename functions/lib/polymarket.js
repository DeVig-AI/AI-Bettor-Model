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
  let s = String(raw || "").trim();
  if (!s || s.length > 600) return null;
  // the app's Share button sends words around the link ("Check out this market on Polymarket: https://…")
  const inText = /(?<![\w.-])(?:https?:\/\/)?(?:www\.)?polymarket\.(?:com|us)\/[^\s<>"']+/i.exec(s);
  if (inText && !/^pm:/i.test(s)) s = inText[0].replace(/[).,!?]+$/, "");
  const pm = /^pm:([a-z0-9-]+)~([01])$/i.exec(s);
  if (pm) return SLUG.test(pm[1].toLowerCase()) ? {slug: pm[1].toLowerCase(), side: Number(pm[2])} : null;
  if (!/^https?:\/\//i.test(s) && !/^(www\.)?polymarket\.(com|us)\//i.test(s)) return null;
  let u;
  try { u = new URL(/^https?:/i.test(s) ? s : `https://${s}`); } catch (e) { return null; }
  // Polymarket US (the app in the States): a shared combo, polymarket.us/combos/<id>
  if (/^(www\.)?polymarket\.us$/i.test(u.hostname)) {
    const c = /^\/combos\/([A-Za-z0-9_-]{6,40})\/?$/.exec(u.pathname);
    return c ? {combo: c[1]} : null;
  }
  if (!/^(www\.)?polymarket\.com$/i.test(u.hostname)) return null;
  const parts = u.pathname.split("/").filter(Boolean).map(p => { try { return decodeURIComponent(p).toLowerCase(); } catch (e) { return ""; } });
  if (/^[a-z]{2}(-[a-z]{2})?$/.test(parts[0] || "") && parts.length > 1) parts.shift();   // a language: /en/event/…, /es/sports/…
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
  if (p.combo) return readUsCombo(p.combo, fetcher);
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

// ---------- Polymarket US combos (parlays) ----------
// polymarket.us has no public market API yet, but a shared combo's page carries the whole combo as data
// ({comboSlug, multiplier, seed: {groups: [{eventSlug, startTime, selections: [{title, compactTitle, status, chance}]}]}}).
const US = "https://polymarket.us";
const undef = v => (v === "$undefined" || v === undefined ? null : v);

// the combo object out of the page: each JSON object starting with "comboSlug", braces matched (strings skipped); the
// page carries more than one (a bare outline and the priced one), so the one with seed.groups wins
export function comboFromPage(html) {
  const t = String(html || "").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  let i = -1, first = null;
  while ((i = t.indexOf('{"comboSlug"', i + 1)) >= 0) {
    let depth = 0, str = false, o = null;
    for (let k = i; k < t.length && k < i + 400000; k++) {
      const c = t[k];
      if (str) { if (c === "\\") k++; else if (c === '"') str = false; continue; }
      if (c === '"') str = true;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) { try { o = JSON.parse(t.slice(i, k + 1)); } catch (e) { /* not this one */ } break; }
    }
    if (o && o.seed && Array.isArray(o.seed.groups)) return o;
    if (o && !first) first = o;
  }
  return first;
}

// one pick in a combo, in the reader's leg shape. A team to win reads as "pm:<game>~<0|1>" (side 0 is the first
// team in the game's slug) so the TV can follow it like a polymarket.com bet.
export function usLeg(g, x) {
  const title = String(undef(x.title) || undef(x.selectionTitle) || "Pick").replace(/\s+/g, " ").trim();
  const st = String(undef(x.status) || undef(x.outcome) || "").toLowerCase();
  const result = /^(won|win|winning_settled|yes)$/.test(st) ? "won" : /^(lost|lose|loss|no)$/.test(st) ? "lost" : null;
  const ch = num(x.chance && x.chance.originalValue);
  const slug = String(g.eventSlug || ""), teams = /^[a-z]+-([a-z0-9]{2,5})-([a-z0-9]{2,5})-\d{4}-\d{2}-\d{2}$/.exec(slug);
  const code = String(undef(x.compactTitle) || "").split(" ")[0].toLowerCase();
  const toWin = /to win$/i.test(title) && undef(x.totalSide) == null;
  const i = teams && toWin ? [teams[1], teams[2]].indexOf(code) : -1;
  return {
    ticker: i >= 0 ? `pm:${slug}~${i}` : `pmus:${String(x.marketSlug || slug).slice(0, 120)}`,
    event: slug || null, title, pick: title, side: "yes",
    status: result ? "finalized" : g.ended ? "closed" : g.live ? "active" : null,
    result, bid: null, ask: null, last: null,
    chance: result ? (result === "won" ? 1 : 0) : ch != null ? r4(ch / 100) : null,
    closes: null, strike: null, strike_type: null,
  };
}

async function readUsCombo(id, fetcher) {
  const r = await fetcher(`${US}/combos/${encodeURIComponent(id)}`, {headers: {accept: "text/html", "user-agent": "Mozilla/5.0 (DeVig link reader)"},
    cf: {cacheTtl: TTL, cacheEverything: true}});
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`polymarket.us ${r.status}`);
  const c = comboFromPage(await r.text());
  const groups = (c && c.seed && Array.isArray(c.seed.groups)) ? c.seed.groups : null;
  if (!groups) return null;
  const legs = [];
  for (const g of groups) for (const x of g.selections || []) legs.push(usLeg(g, x));
  if (!legs.length) return null;
  const mult = num(c.multiplier);
  const won = legs.filter(l => l.result === "won").length, lost = legs.filter(l => l.result === "lost").length;
  const chance = lost ? 0 : won === legs.length ? 1 : mult && mult > 1 ? r4(1 / mult) : null;
  const combo = {ticker: `pmus:${id}`, event: null, title: `Combo, ${legs.length} legs`, pick: `All ${legs.length} legs`, side: "yes",
    status: lost || won === legs.length ? "finalized" : "active", result: lost ? "lost" : won === legs.length ? "won" : null,
    bid: null, ask: null, last: null, chance, closes: null, strike: null, strike_type: null};
  const live = legs.every(l => l.chance != null) ? Math.round(legs.reduce((p, l) => p * l.chance, 1) * 1e6) / 1e6 : null;
  return {kind: "combo", source: "polymarket", ticker: `${US}/combos/${id}`, combo, legs, multiplied: live, won, lost, truncated: false};
}
