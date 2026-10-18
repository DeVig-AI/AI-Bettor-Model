// DeVig accounts: GET/PUT /api/me saves one person's tracking, name tag and favorite teams.
// Runs as a Cloudflare Pages Function next to the site (devigai.pages.dev). Who the person is comes from
// Cloudflare Access (the email one-time-code login); the Access token is verified here before anything is read
// or written, so a request without a valid login gets 401 and the app falls back to saving on the device.
//
// Needs, in the Pages project settings (see ACCOUNTS.md):
//   USERS               KV namespace binding (where the settings are stored)
//   ACCESS_TEAM_DOMAIN  e.g. devigai.cloudflareaccess.com
//   ACCESS_AUD          the Access application's "Application Audience (AUD) Tag"

const MAX_BODY = 20000;            // bytes; a full season of tracking is far smaller
const MAX_TRACKED = 2000;          // per kind (games, picks)
const MAX_TEAMS = 60;              // per sport
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
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null;
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
  if (!aud.includes(env.ACCESS_AUD)) return null;
  if (typeof payload.exp !== "number" || payload.exp < now) return null;
  if (payload.nbf && payload.nbf > now + 60) return null;
  if (payload.iss && payload.iss !== `https://${domain}`) return null;
  if (!payload.email) return null;
  return String(payload.email).toLowerCase();
}

async function userKey(email) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email));
  return "user:" + [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// Keep only the shapes the app writes: tracked {g:{key:time}, p:{key:time}, updated}, prefs {name, teams, updated}.
export function clean(body) {
  const out = {tracked: {g: {}, p: {}, updated: 0}, prefs: {name: "", teams: {}, updated: 0}};
  const t = body && body.tracked;
  if (t && typeof t === "object") {
    for (const kind of ["g", "p"]) {
      const src = t[kind] && typeof t[kind] === "object" ? t[kind] : {};
      for (const k of Object.keys(src).slice(0, MAX_TRACKED)) {
        if (typeof k === "string" && k.length <= 200) out.tracked[kind][k] = Number(src[k]) || 1;
      }
    }
    out.tracked.updated = Number(t.updated) || 0;
  }
  const p = body && body.prefs;
  if (p && typeof p === "object") {
    out.prefs.name = String(p.name || "").slice(0, 24);
    const teams = p.teams && typeof p.teams === "object" ? p.teams : {};
    for (const sp of Object.keys(teams).slice(0, 20)) {
      if (!/^[A-Za-z0-9_-]{1,12}$/.test(sp) || !Array.isArray(teams[sp])) continue;
      out.prefs.teams[sp] = teams[sp].filter(x => typeof x === "string" && /^[A-Za-z0-9 .&'-]{1,40}$/.test(x)).slice(0, MAX_TEAMS);
    }
    out.prefs.updated = Number(p.updated) || 0;
  }
  return out;
}

export async function handle(request, env, fetcher = fetch) {
  if (!env.USERS) return json({error: "accounts are not set up yet"}, 503);
  const email = await accessUser(request, env, fetcher);
  if (!email) return json({error: "not signed in"}, 401);
  const key = await userKey(email);
  if (request.method === "GET") {
    return json({email, data: await env.USERS.get(key, "json")});
  }
  if (request.method === "PUT") {
    const text = await request.text();
    if (text.length > MAX_BODY) return json({error: "too large"}, 413);
    let body;
    try { body = JSON.parse(text); } catch (e) { return json({error: "not JSON"}, 400); }
    const data = clean(body);
    data.saved_at = new Date().toISOString();
    await env.USERS.put(key, JSON.stringify(data));
    return json({ok: true, email, saved_at: data.saved_at});
  }
  return json({error: "method not allowed"}, 405);
}

export async function onRequest(context) {
  return handle(context.request, context.env);
}
