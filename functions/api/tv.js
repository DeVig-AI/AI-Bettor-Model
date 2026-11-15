// DeVig on the TV: GET/POST /api/tv links a TV (the living-room launcher's score dock) to someone's account with a
// private TV code, and serves the dock what to show (functions/lib/tv.js builds it).
//
// Signed in (Cloudflare Access, as /api/me):
//   GET                         {code, settings}          code: null until one is made
//   POST {op: "code"}           a new code; the old one stops working right away
//   POST {op: "off"}            no code: every TV linked to this account stops
//   POST {op: "settings", settings}
// The TV, with no login:
//   GET ?key=<code>             {at, settings, games, bets}: open bets leg by leg, the person's games, live scores
// A TV code reads only what the dock shows (open bets, ★ teams, these settings). It can't change anything, and it
// never carries the email, the rest of the tracking or other saved data. Codes that don't exist are counted per
// address so they can't be guessed.
//
// KV (the same USERS namespace as /api/me):
//   tv:<hash>      {code, settings, day, writes}
//   tvcode:<code>  <hash>
import { accessUser, userKey } from "./me.js";
import { parseLink, read } from "./kalshi.js";
import { buildFeed, cleanSettings } from "../lib/tv.js";
import { parsePoly, readPoly } from "../lib/polymarket.js";

const CODE_CHARS = "23456789abcdefghjkmnpqrstuvwxyz";   // no 0/o, 1/l/i: typed with a TV remote
const CODE_RE = /^[23456789a-hjkmnp-z]{8}$/;
const WRITES_PER_DAY = 40, MAX_MISSES = 20, MISS_WINDOW = 900e3, FEED_TTL = 5e3, KALSHI_TTL = 30e3;
const misses = new Map(), feeds = new Map(), kalshi = new Map();

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {status, headers: {"content-type": "application/json", "cache-control": "no-store",
    "access-control-allow-origin": "*"}});
}

export function newCode(rand = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  let out = "";
  while (out.length < 8) for (const b of rand(16)) if (b < 248 && out.length < 8) out += CODE_CHARS[b % 31];
  return out;
}
export function normCode(c) {
  const s = String(c || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return CODE_RE.test(s) ? s : null;
}

function missed(ip, bump, now = Date.now()) {
  const r = misses.get(ip);
  const cur = r && now - r.at < MISS_WINDOW ? r : {at: now, n: 0};
  if (bump) { cur.n += 1; misses.set(ip, cur); if (misses.size > 2000) misses.delete(misses.keys().next().value); }
  return cur.n;
}

async function cachedKalshi(ticker, fetcher) {
  const hit = kalshi.get(ticker);
  if (hit && Date.now() - hit.at < KALSHI_TTL) return hit.d;
  const d = await read(ticker, fetcher);
  kalshi.set(ticker, {at: Date.now(), d});
  if (kalshi.size > 300) kalshi.delete(kalshi.keys().next().value);
  return d;
}

// a saved Polymarket side, cached like the Kalshi reads
async function cachedPoly(link, fetcher) {
  const hit = kalshi.get(link);
  if (hit && Date.now() - hit.at < KALSHI_TTL) return hit.d;
  const p = parsePoly(link), d = p ? await readPoly(p, fetcher) : null;
  kalshi.set(link, {at: Date.now(), d});
  if (kalshi.size > 300) kalshi.delete(kalshi.keys().next().value);
  return d;
}

async function tvFeed(request, env, fetcher, key) {
  const ip = request.headers.get("cf-connecting-ip") || "?";
  if (missed(ip, false) >= MAX_MISSES) return json({error: "too many codes tried, wait 15 minutes"}, 429);
  const code = normCode(key);
  const h = code ? await env.USERS.get(`tvcode:${code}`) : null;
  if (!h) { missed(ip, true); return json({error: "no account has that TV code"}, 404); }
  const hit = feeds.get(h);
  if (hit && Date.now() - hit.at < FEED_TTL) return json(hit.body);
  const [user, rec] = await Promise.all([env.USERS.get(`user:${h}`, "json"), env.USERS.get(`tv:${h}`, "json")]);
  if (!user || !rec || rec.code !== code) return json({error: "no account has that TV code"}, 404);
  const body = await buildFeed({user, settings: rec.settings, now: Date.now(), fetcher,
    readKalshi: t => cachedKalshi(t, fetcher), parseLink, readPoly: l => cachedPoly(l, fetcher)});
  feeds.set(h, {at: Date.now(), body});
  if (feeds.size > 200) feeds.delete(feeds.keys().next().value);
  return json(body);
}

export async function handle(request, env, fetcher = fetch) {
  if (!env.USERS) return json({error: "accounts are not set up yet"}, 503);
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, {status: 204, headers: {"access-control-allow-origin": "*"}});
  if (request.method === "GET" && url.searchParams.has("key")) return tvFeed(request, env, fetcher, url.searchParams.get("key"));

  const email = await accessUser(request, env, fetcher);
  if (!email) return json({error: "not signed in"}, 401);
  const key = await userKey(email), h = key.slice(5);
  const user = await env.USERS.get(key, "json");
  if (!user || !user.joined_at) return json({error: "an account is needed"}, 403);
  const rec = (await env.USERS.get(`tv:${h}`, "json")) || {code: null, settings: cleanSettings(null)};
  const view = () => ({code: rec.code, settings: cleanSettings(rec.settings)});
  if (request.method === "GET") return json(view());
  if (request.method !== "POST") return json({error: "method not allowed"}, 405);

  let body;
  try { body = JSON.parse((await request.text()).slice(0, 2000)); } catch (e) { return json({error: "not JSON"}, 400); }
  const day = new Date().toISOString().slice(0, 10);
  const writes = rec.day === day ? rec.writes || 0 : 0;
  if (writes >= WRITES_PER_DAY) return json({error: "too many changes today, try tomorrow"}, 429);
  const op = body && body.op;
  if (op === "code" || op === "off") {
    if (rec.code) await env.USERS.delete(`tvcode:${rec.code}`);
    rec.code = op === "code" ? newCode() : null;
    if (rec.code) await env.USERS.put(`tvcode:${rec.code}`, h);
  } else if (op === "settings") {
    rec.settings = cleanSettings(body.settings);
  } else return json({error: "unknown op"}, 400);
  Object.assign(rec, {day, writes: writes + 1});
  await env.USERS.put(`tv:${h}`, JSON.stringify(rec));
  feeds.delete(h);
  return json({ok: true, ...view()});
}

export async function onRequest(context) {
  return handle(context.request, context.env);
}
