// DeVig accounts: GET/POST/PUT /api/me saves one person's tracking, name tag and favorite teams.
// Runs as a Cloudflare Pages Function next to the site (devigai.pages.dev). Who the person is comes from
// Cloudflare Access (the email one-time-code login); the Access token is verified here before anything is read
// or written, so a request without a valid login gets 401 and the app falls back to saving on the device.
// Signing in is not enough to save: an account is opened only with the invite code (POST {invite}), so strangers
// who find the site can look around but can't use up the free storage everyone shares. Saves are also throttled.
//
// Needs, in the Pages project settings (see ACCOUNTS.md):
//   USERS               KV namespace binding (where the settings are stored)
//   ACCESS_TEAM_DOMAIN  e.g. devigai.cloudflareaccess.com
//   ACCESS_AUD          optional: the Access application's "Application Audience (AUD) Tag". Without it any login
//                       from this team's own Access apps is accepted (DeVig is the only one), checked by signature
//                       and issuer; with it, only logins for this exact app.
//   INVITE_CODE         secret; the code friends type once to open an account (several allowed, comma-separated)

const MAX_BODY = 250000;           // bytes; a season of tracking, tracked parlays and 500 logged bets stays under this
const MAX_PARLAYS = 60;            // tracked parlays kept (removed ones are kept as a small tombstone so devices agree)
const LEG_STR = ["desc", "book", "game", "when", "kind", "mk", "side", "player", "stat", "sport", "away", "home", "kickoff", "gkey"];
const LEG_NUM = ["odds", "point", "line"];
const MAX_BETS = 500;              // logged bets (My bets on the Fair price page), removed ones kept as a tombstone
const MAX_TRACKED = 2000;          // per kind (games, picks)
const MAX_TEAMS = 60;              // per sport
const SAVE_GAP_MS = 2000;          // at most one save every 2 seconds per person
const SAVES_PER_DAY = 300;         // per person; the free plan has 1,000 writes a day for everyone together
const MAX_TRIES = 5;               // wrong invite codes per person ...
const TRIES_WINDOW = 900;          // ... per 15 minutes
const memTries = new Map();        // fallback when the Cache API isn't there (local tests)
let certCache = {at: 0, keys: null, domain: null};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: {"content-type": "application/json", "cache-control": "no-store"}
  });
}

function b64urlBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlJson(s) {
  return JSON.parse(new TextDecoder().decode(b64urlBytes(s)));
}

async function accessKeys(domain, fetcher) {
  if (certCache.keys && certCache.domain === domain && Date.now() - certCache.at < 3600e3) return certCache.keys;
  const r = await fetcher(`https://${domain}/cdn-cgi/access/certs`);
  if (!r.ok) throw new Error("certs " + r.status);
  const keys = (await r.json()).keys || [];
  certCache = {at: Date.now(), keys, domain};
  return keys;
}

function tokenFrom(request) {
  const h = request.headers.get("cf-access-jwt-assertion");
  if (h) return h;
  const m = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(request.headers.get("cookie") || "");
  return m ? m[1] : null;
}

// The signed-in person's email, or null when the request has no valid Access login.
export async function accessUser(request, env, fetcher = fetch) {
  const token = tokenFrom(request);
  if (!token || !env.ACCESS_TEAM_DOMAIN) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  let header, payload;
  try { header = b64urlJson(parts[0]); payload = b64urlJson(parts[1]); } catch (e) { return null; }
  if (header.alg !== "RS256") return null;
  const domain = String(env.ACCESS_TEAM_DOMAIN).replace(/^https?:\/\//, "").replace(/\/+$/, "");
  let keys;
  try { keys = await accessKeys(domain, fetcher); } catch (e) { return null; }
  const jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", jwk, {name: "RSASSA-PKCS1-v1_5", hash: "SHA-256"}, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlBytes(parts[2]),
                                        new TextEncoder().encode(parts[0] + "." + parts[1]));
  if (!ok) return null;
  const now = Math.floor(Date.now() / 1000);
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (env.ACCESS_AUD && !aud.includes(env.ACCESS_AUD)) return null;
  if (typeof payload.exp !== "number" || payload.exp < now) return null;
  if (payload.nbf && payload.nbf > now + 60) return null;
  if (payload.iss !== `https://${domain}`) return null;
  if (!payload.email) return null;
  return String(payload.email).toLowerCase();
}

export async function userKey(email) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email));
  return "user:" + [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// My bets: {bets: {id: {at, sport, game, away, home, kickoff, side, odds, other, book, stake} | {removed}}, updated}.
// null when the request has none (the classic app doesn't send them), so a save from classic keeps what's stored.
export function cleanBets(b) {
  if (!b || typeof b !== "object" || !b.bets || typeof b.bets !== "object" || Array.isArray(b.bets)) return null;
  const out = {bets: {}, updated: Number(b.updated) || 0};
  const str = (v, n) => String(v == null ? "" : v).slice(0, n);
  for (const id of Object.keys(b.bets).slice(-MAX_BETS)) {
    const x = b.bets[id];
    if (!/^[a-z0-9]{1,24}$/.test(id) || !x || typeof x !== "object") continue;
    if (x.removed) { out.bets[id] = {removed: Number(x.removed) || 1}; continue; }
    const odds = Number(x.odds);
    if (!isFinite(odds) || (odds > -100 && odds < 100) || (x.side !== "home" && x.side !== "away")) continue;
    const other = Number(x.other), stake = Number(x.stake);
    out.bets[id] = {id, at: str(x.at, 30), sport: str(x.sport, 8), game: str(x.game, 40), away: str(x.away, 12), home: str(x.home, 12),
      kickoff: str(x.kickoff, 30), side: x.side, odds, other: x.other != null && isFinite(other) ? other : null,
      book: str(x.book, 24), stake: x.stake != null && isFinite(stake) && stake >= 0 ? stake : null};
  }
  return out;
}

// Keep only the shapes the app writes: tracked {g:{key:time}, p:{key:time}, parlays:{id:{at, stake, odds, legs}|{removed}},
// updated}, prefs {name, teams, updated}.
export function clean(body) {
  const out = {tracked: {g: {}, p: {}, updated: 0}, prefs: {name: "", teams: {}, mode: "simple", updated: 0}};
  const t = body && body.tracked;
  if (t && typeof t === "object") {
    for (const kind of ["g", "p"]) {
      const src = t[kind] && typeof t[kind] === "object" ? t[kind] : {};
      for (const k of Object.keys(src).slice(0, MAX_TRACKED)) {
        if (typeof k === "string" && k.length <= 200) out.tracked[kind][k] = Number(src[k]) || 1;
      }
    }
    const ps = t.parlays && typeof t.parlays === "object" && !Array.isArray(t.parlays) ? t.parlays : null;
    if (ps) {
      out.tracked.parlays = {};
      for (const id of Object.keys(ps).slice(-MAX_PARLAYS)) {
        const x = ps[id];
        if (!/^[a-z0-9]{1,24}$/.test(id) || !x || typeof x !== "object") continue;
        if (x.removed) { out.tracked.parlays[id] = {removed: Number(x.removed) || 1}; continue; }
        if (!Array.isArray(x.legs)) continue;
        out.tracked.parlays[id] = {at: String(x.at || "").slice(0, 30), stake: Number(x.stake) || 0, odds: Number(x.odds) || null,
          legs: x.legs.slice(0, 15).filter(l => l && typeof l === "object").map(l => {
            const o = {};
            for (const k of LEG_STR) if (l[k] != null) o[k] = String(l[k]).slice(0, 160);
            for (const k of LEG_NUM) if (l[k] != null && isFinite(Number(l[k]))) o[k] = Number(l[k]);
            return o;
          })};
      }
    }
    out.tracked.updated = Number(t.updated) || 0;
  }
  const p = body && body.prefs;
  if (p && typeof p === "object") {
    out.prefs.name = String(p.name || "").slice(0, 24);
    out.prefs.mode = p.mode === "advanced" ? "advanced" : "simple";
    const teams = p.teams && typeof p.teams === "object" ? p.teams : {};
    for (const sp of Object.keys(teams).slice(0, 20)) {
      if (!/^[A-Za-z0-9_-]{1,12}$/.test(sp) || !Array.isArray(teams[sp])) continue;
      out.prefs.teams[sp] = teams[sp].filter(x => typeof x === "string" && /^[A-Za-z0-9 .&'-]{1,40}$/.test(x)).slice(0, MAX_TEAMS);
    }
    out.prefs.updated = Number(p.updated) || 0;
  }
  return out;
}

async function digest(text) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

// Compares hashes, so the time taken doesn't hint at how much of a guess was right.
async function inviteOk(code, env) {
  const want = String(env.INVITE_CODE || "").split(",").map(c => c.trim().toLowerCase()).filter(Boolean);
  const got = await digest(String(code || "").trim().toLowerCase());
  let ok = false;
  for (const w of want) {
    const h = await digest(w);
    let diff = 0;
    for (let i = 0; i < h.length; i++) diff |= h[i] ^ got[i];
    ok = ok || diff === 0;
  }
  return ok;
}

// Wrong-code counter, kept in Cloudflare's cache (not KV) so guessing can't use up the shared write allowance.
async function tries(key, bump) {
  const url = "https://devig-invite-tries.invalid/" + key.slice(5);
  const cache = typeof caches !== "undefined" && caches.default;
  let n;
  if (cache) {
    const hit = await cache.match(url);
    n = hit ? Number(await hit.text()) || 0 : 0;
  } else {
    const m = memTries.get(url);
    n = m && m.until > Date.now() ? m.n : 0;
  }
  if (!bump) return n;
  n += 1;
  if (cache) await cache.put(url, new Response(String(n), {headers: {"cache-control": `max-age=${TRIES_WINDOW}`}}));
  else memTries.set(url, {n, until: Date.now() + TRIES_WINDOW * 1000});
  return n;
}

async function readJson(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) return {error: json({error: "too large"}, 413)};
  try { return {body: JSON.parse(text)}; } catch (e) { return {error: json({error: "not JSON"}, 400)}; }
}

export async function handle(request, env, fetcher = fetch) {
  if (!env.USERS) return json({error: "accounts are not set up yet"}, 503);
  const email = await accessUser(request, env, fetcher);
  if (!email) return json({error: "not signed in"}, 401);
  const key = await userKey(email);
  const rec = await env.USERS.get(key, "json");
  const joined = !!(rec && rec.joined_at);
  if (request.method === "GET") {
    return json({email, joined, data: joined ? {tracked: rec.tracked, prefs: rec.prefs, bets: rec.bets || null} : null});
  }
  if (request.method === "POST") {                      // open the account with the invite code
    if (joined) return json({ok: true, email, joined});
    if (!env.INVITE_CODE) return json({error: "invite codes are not set up yet"}, 503);
    if (await tries(key, false) >= MAX_TRIES) return json({error: "too many wrong codes, try again in 15 minutes"}, 429);
    const {body, error} = await readJson(request);
    if (error) return error;
    if (!(await inviteOk(body && body.invite, env))) {
      const n = await tries(key, true);
      return json({error: "wrong invite code", tries_left: Math.max(0, MAX_TRIES - n)}, 403);
    }
    const data = clean({});
    data.joined_at = data.saved_at = new Date().toISOString();
    await env.USERS.put(key, JSON.stringify(data));
    return json({ok: true, email, joined: true});
  }
  if (request.method === "PUT") {
    if (!joined) return json({error: "invite code needed"}, 403);
    const now = Date.now(), day = new Date(now).toISOString().slice(0, 10);
    const wait = SAVE_GAP_MS - (now - (Date.parse(rec.saved_at) || 0));
    if (wait > 0) return json({error: "slow down", retry_ms: wait}, 429);
    const writes = rec.day === day ? rec.writes || 0 : 0;
    if (writes >= SAVES_PER_DAY) return json({error: "daily save limit reached"}, 429);
    const {body, error} = await readJson(request);
    if (error) return error;
    const data = clean(body);
    const bets = cleanBets(body && body.bets) || rec.bets;
    if (bets) data.bets = bets;
    Object.assign(data, {joined_at: rec.joined_at, saved_at: new Date(now).toISOString(), day, writes: writes + 1});
    await env.USERS.put(key, JSON.stringify(data));
    return json({ok: true, email, saved_at: data.saved_at});
  }
  return json({error: "method not allowed"}, 405);
}

export async function onRequest(context) {
  return handle(context.request, context.env);
}
