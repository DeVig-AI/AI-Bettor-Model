// /api/scan: reads a bet screenshot with the AI (functions/api/scan.js). Signed-in, joined accounts only, a daily cap,
// and only well-formed legs come back.
import test from "node:test";
import assert from "node:assert/strict";
import { handle, parseAnswer, clean } from "../../functions/api/scan.js";
import { userKey } from "../../functions/api/me.js";

const DOMAIN = "t.cloudflareaccess.com";
const b64u = b => Buffer.from(b).toString("base64url");
const pair = await crypto.subtle.generateKey({name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256"}, true, ["sign", "verify"]);
const jwk = {...await crypto.subtle.exportKey("jwk", pair.publicKey), kid: "k1"};
async function token(email) {
  const h = b64u(JSON.stringify({alg: "RS256", kid: "k1"}));
  const p = b64u(JSON.stringify({email, iss: `https://${DOMAIN}`, exp: Math.floor(Date.now() / 1000) + 600}));
  const s = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(h + "." + p));
  return `${h}.${p}.${b64u(new Uint8Array(s))}`;
}
function kv(init = {}) {
  const m = new Map(Object.entries(init));
  return {get: async (k, t) => (m.has(k) ? (t === "json" ? JSON.parse(m.get(k)) : m.get(k)) : null), put: async (k, v) => { m.set(k, v); }, m};
}
const IMG = "data:image/png;base64,iVBORw0KGgo=";
const SLIP = {book: "FanDuel", legs: [
  {sport: "NBA", away: "POR", home: "UTA", market: "moneyline", side: "POR", point: null, odds: -150},
  {sport: "NBA", away: null, home: null, market: "total", side: "Over", point: "221.5", odds: "+105"},
  {market: "moneyline", side: "", odds: -110},                 // no side: dropped
  {market: "weird", side: "Lakers", odds: 12},                 // odds that aren't American: null; unknown market: other
], total_odds: 264, stake: "$10", payout: 36.4, notes: ""};

async function setup({joined = true, gemini, ai} = {}) {
  const email = "fan@example.com";
  const users = kv(joined ? {[await userKey(email)]: JSON.stringify({joined_at: "2026-10-01"})} : {});
  const env = {ACCESS_TEAM_DOMAIN: DOMAIN, USERS: users, ...(gemini ? {GEMINI_API_KEY: "g"} : {}), ...(ai ? {AI: ai} : {})};
  const fetcher = async (url, init) => {
    if (String(url).endsWith("/cdn-cgi/access/certs")) return new Response(JSON.stringify({keys: [jwk]}));
    if (String(url).includes("generativelanguage")) return gemini(JSON.parse(init.body));
    throw new Error("unexpected fetch " + url);
  };
  const req = async (body, auth = true) => new Request("https://devigai.pages.dev/api/scan", {method: "POST",
    headers: auth ? {"cf-access-jwt-assertion": await token(email)} : {}, body: JSON.stringify(body)});
  return {env, fetcher, req, users};
}

test("reads a slip with Gemini, sends the image, and cleans the legs", async () => {
  let sent;
  const s = await setup({gemini: b => { sent = b; return new Response(JSON.stringify({choices: [{message: {content: "```json\n" + JSON.stringify(SLIP) + "\n```"}}]})); }});
  const r = await handle(await s.req({image: IMG}), s.env, s.fetcher);
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(sent.messages[0].content[1].image_url.url, IMG);
  assert.equal(d.book, "FanDuel");
  assert.equal(d.legs.length, 3);
  assert.deepEqual(d.legs[1], {sport: "NBA", away: null, home: null, market: "total", side: "Over", point: 221.5, odds: 105});
  assert.equal(d.legs[2].market, "other");
  assert.equal(d.legs[2].odds, null);
  assert.equal(d.stake, 10);
  assert.equal(d.total_odds, 264);
});

test("falls back to Workers AI, accepting Meta's license once", async () => {
  const calls = [];
  const ai = {run: async (model, input) => {
    calls.push(input.prompt === "agree" ? "agree" : "read");
    if (input.prompt === "agree") return {response: "ok"};
    if (!calls.includes("agree")) throw new Error("5016: Prior to using this model, you must submit the prompt 'agree'");
    assert.ok(Array.isArray(input.image) && input.image.length > 0);
    return {response: JSON.stringify(SLIP)};
  }};
  const s = await setup({ai});
  const r = await handle(await s.req({image: IMG}), s.env, s.fetcher);
  assert.equal(r.status, 200);
  assert.deepEqual(calls, ["read", "agree", "read"]);
  assert.equal((await r.json()).legs[0].side, "POR");
});

test("accounts only, images only, and a daily cap", async () => {
  const ai = {run: async () => ({response: JSON.stringify(SLIP)})};
  let s = await setup({ai});
  assert.equal((await handle(await s.req({image: IMG}, false), s.env, s.fetcher)).status, 401);
  s = await setup({ai, joined: false});
  assert.equal((await handle(await s.req({image: IMG}), s.env, s.fetcher)).status, 403);
  s = await setup({ai});
  assert.equal((await handle(await s.req({image: "https://evil.example/x.png"}), s.env, s.fetcher)).status, 400);
  for (let i = 0; i < 20; i++) assert.equal((await handle(await s.req({image: IMG}), s.env, s.fetcher)).status, 200);
  const r = await handle(await s.req({image: IMG}), s.env, s.fetcher);
  assert.equal(r.status, 429);
  assert.equal((await r.json()).code, "limit");
  assert.equal((await handle(await s.req({image: IMG}), {USERS: kv()}, s.fetcher)).status, 503);
});

test("parseAnswer and clean handle junk", () => {
  assert.equal(parseAnswer("no json here"), null);
  assert.deepEqual(parseAnswer('sure! {"legs": []} hope that helps'), {legs: []});
  assert.equal(clean(null), null);
  assert.deepEqual(clean({legs: "x"}).legs, []);
});
