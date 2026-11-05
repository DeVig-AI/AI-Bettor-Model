// DeVig friends: GET/POST /api/friends lets people with an account see each other's saved parlays.
// Sharing is off until the person turns it on. Turning it on gives them a random friend code (a share link carries
// it); anyone with an account who has the code can follow them and see their saved parlays, with stakes, read-only.
// A new code cuts off everyone who had the old one. Nothing else on the account (email, tracking, logged bets,
// favorite teams) is ever sent to a friend: only the name tag, the saved parlays and the saved Kalshi bets.
//
// Stored in the same KV namespace as /api/me (USERS):
//   friends:<hash>   {code, share, following: [code], day, writes}   one per person (<hash> as in user:<hash>)
//   fcode:<code>     <hash>                                           so a code finds its person
//
// GET                 {me: {code, share}, friends: [{code, name, share, parlays}]}
// GET ?code=X         {friend: {code, name, share, parlays, following}} (a share link, before following)
// POST {op: "share", on}  |  {op: "code"}  |  {op: "follow", code}  |  {op: "unfollow", code}

import { accessUser, userKey } from "./me.js";

const MAX_FOLLOWING = 30;
const WRITES_PER_DAY = 40;          // per person; friend changes are rare, and the free plan's writes are shared
const MAX_MISSES = 20;              // codes that don't exist, per person ...
const MISS_WINDOW = 900;            // ... per 15 minutes, so codes can't be guessed
const CODE_CHARS = "23456789abcdefghjkmnpqrstuvwxyz";   // no 0/o, 1/l/i
const CODE_RE = /^[23456789a-hjkmnp-z]{10}$/;
const memMisses = new Map();

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {status, headers: {"content-type": "application/json", "cache-control": "no-store"}});
}

export function newCode(rand = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  // 31 characters: reject bytes past the last whole multiple so every character is equally likely
  let out = "";
  while (out.length < 10) for (const b of rand(16)) if (b < 248 && out.length < 10) out += CODE_CHARS[b % 31];
  return out;
}

export function normCode(c) {
  const s = String(c || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return CODE_RE.test(s) ? s : null;
}

// what a friend sees of one saved parlay
export function shownParlays(user) {
  const ps = user && user.tracked && user.tracked.parlays;
  if (!ps || typeof ps !== "object") return [];
  return Object.entries(ps)
    .filter(([, x]) => x && !x.removed && Array.isArray(x.legs))
    .map(([id, x]) => ({id, at: x.at || "", stake: Number(x.stake) || 0, odds: Number(x.odds) || null, legs: x.legs}))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

// what a friend sees of the Kalshi combos and bets someone saved (Saved bets): the label, when, the grade and how it
// ended, and the link cut to what finds the market (no referral or tracking bits). DeVig slips are left out: each is
// also a saved parlay above.
export function shownSaved(user) {
  const items = user && user.saved && Array.isArray(user.saved.items) ? user.saved.items : [];
  const out = [];
  for (const s of items) {
    if (!s || typeof s.link !== "string" || s.link.startsWith("slip:")) continue;
    let link;
    try {
      const u = new URL(/^https?:/i.test(s.link) ? s.link : `https://${s.link}`);
      if (!/(^|\.)kalshi\.com$/i.test(u.hostname)) continue;
      const t = u.searchParams.get("marketTicker") || u.searchParams.get("market_ticker");
      link = `https://kalshi.com${u.pathname}${t ? `?marketTicker=${encodeURIComponent(t)}` : ""}`;
    } catch (e) { continue; }
    const o = {link, label: String(s.label || "").slice(0, 120), savedAt: String(s.savedAt || "")};
    if (s.snap && typeof s.snap === "object") o.snap = s.snap;
    if (s.outcome && typeof s.outcome === "object") o.outcome = s.outcome;
    out.push(o);
  }
  return out;
}

async function misses(h, bump) {
  const url = "https://devig-friend-misses.invalid/" + h;
  const cache = typeof caches !== "undefined" && caches.default;
  let n;
  if (cache) { const hit = await cache.match(url); n = hit ? Number(await hit.text()) || 0 : 0; }
  else { const m = memMisses.get(url); n = m && m.until > Date.now() ? m.n : 0; }
  if (!bump) return n;
  n += 1;
  if (cache) await cache.put(url, new Response(String(n), {headers: {"cache-control": `max-age=${MISS_WINDOW}`}}));
  else memMisses.set(url, {n, until: Date.now() + MISS_WINDOW * 1000});
  return n;
}

// one friend, as the follower sees them: their name and parlays only while their sharing is on
async function friendView(env, code) {
  const h = await env.USERS.get(`fcode:${code}`);
  if (!h) return null;
  const fr = await env.USERS.get(`friends:${h}`, "json");
  if (!fr || fr.code !== code) return null;              // an old code that was replaced
  const user = await env.USERS.get(`user:${h}`, "json");
  const name = String((user && user.prefs && user.prefs.name) || "").slice(0, 24) || "A friend";
  if (!fr.share || !user) return {code, name, share: false, parlays: [], saved: []};
  return {code, name, share: true, parlays: shownParlays(user), saved: shownSaved(user)};
}

export async function handle(request, env, fetcher = fetch) {
  if (!env.USERS) return json({error: "accounts are not set up yet"}, 503);
  const email = await accessUser(request, env, fetcher);
  if (!email) return json({error: "not signed in"}, 401);
  const key = await userKey(email), h = key.slice(5);
  const user = await env.USERS.get(key, "json");
  if (!user || !user.joined_at) return json({error: "an account is needed"}, 403);
  const rec = (await env.USERS.get(`friends:${h}`, "json")) || {code: null, share: false, following: []};
  const url = new URL(request.url);

  if (request.method === "GET") {
    const one = url.searchParams.get("code");
    if (one != null) {
      const code = normCode(one);
      if (await misses(h, false) >= MAX_MISSES) return json({error: "too many codes tried, wait 15 minutes"}, 429);
      const f = code && code !== rec.code ? await friendView(env, code) : null;
      if (code && code === rec.code) return json({error: "that's your own code"}, 400);
      if (!f) { await misses(h, true); return json({error: "no one has that code"}, 404); }
      return json({friend: {...f, following: rec.following.includes(code)}});
    }
    const friends = [];
    for (const c of rec.following) {
      const f = await friendView(env, c);
      friends.push(f || {code: c, name: "A friend", share: false, parlays: [], gone: true});
    }
    return json({me: {code: rec.code, share: !!rec.share}, friends});
  }

  if (request.method !== "POST") return json({error: "method not allowed"}, 405);
  let body;
  try { body = JSON.parse((await request.text()).slice(0, 2000)); } catch (e) { return json({error: "not JSON"}, 400); }
  const day = new Date().toISOString().slice(0, 10);
  const writes = rec.day === day ? rec.writes || 0 : 0;
  if (writes >= WRITES_PER_DAY) return json({error: "too many changes today, try tomorrow"}, 429);
  const puts = [];
  const op = body && body.op;

  if (op === "share" || op === "code") {
    if (op === "share") rec.share = !!body.on;
    if (op === "code" || (rec.share && !rec.code)) {
      if (rec.code) puts.push(["delete", `fcode:${rec.code}`]);
      rec.code = newCode();
      puts.push(["put", `fcode:${rec.code}`, h]);
    }
  } else if (op === "follow") {
    const code = normCode(body.code);
    if (!code) return json({error: "that isn't a friend code"}, 400);
    if (code === rec.code) return json({error: "that's your own code"}, 400);
    if (!rec.following.includes(code)) {
      if (await misses(h, false) >= MAX_MISSES) return json({error: "too many codes tried, wait 15 minutes"}, 429);
      if (!(await friendView(env, code))) { await misses(h, true); return json({error: "no one has that code"}, 404); }
      if (rec.following.length >= MAX_FOLLOWING) return json({error: `you can follow up to ${MAX_FOLLOWING} people`}, 400);
      rec.following = [...rec.following, code];
    }
  } else if (op === "unfollow") {
    const code = normCode(body.code);
    rec.following = rec.following.filter((c) => c !== code);
  } else {
    return json({error: "unknown op"}, 400);
  }
  Object.assign(rec, {day, writes: writes + 1});
  for (const [kind, k, v] of puts) kind === "put" ? await env.USERS.put(k, v) : await env.USERS.delete(k);
  await env.USERS.put(`friends:${h}`, JSON.stringify(rec));
  return json({ok: true, me: {code: rec.code, share: !!rec.share}, following: rec.following});
}

export async function onRequest(context) {
  return handle(context.request, context.env);
}
