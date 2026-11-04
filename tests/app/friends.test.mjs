// DeVig friends (functions/api/friends.js): sharing off by default, follow by code, a friend sees only the name tag
// and saved parlays, and a new code cuts off the old one. Fake KV and Access login; no network:
//   node --test tests/app/friends.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { handle, newCode, normCode, shownParlays } from "../../functions/api/friends.js";
import { userKey } from "../../functions/api/me.js";

const te = new TextEncoder();
const b64u = (b) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const DOMAIN = "t.cloudflareaccess.com";
const rsa = await crypto.subtle.generateKey({name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256"}, true, ["sign", "verify"]);
const jwk = {...await crypto.subtle.exportKey("jwk", rsa.publicKey), kid: "k1"};
async function token(email) {
  const h = b64u(te.encode(JSON.stringify({alg: "RS256", kid: "k1"})));
  const p = b64u(te.encode(JSON.stringify({email, iss: `https://${DOMAIN}`, exp: Math.floor(Date.now() / 1000) + 600})));
  return `${h}.${p}.${b64u(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", rsa.privateKey, te.encode(h + "." + p))))}`;
}
const fetcher = async () => new Response(JSON.stringify({keys: [jwk]}));
function kv(init = {}) {
  const m = new Map(Object.entries(init).map(([k, v]) => [k, JSON.stringify(v)]));
  return {m, async get(k, t) { const v = m.get(k); return v == null ? null : t === "json" ? JSON.parse(v) : v; },
    async put(k, v) { m.set(k, v); }, async delete(k) { m.delete(k); }};
}

const A = "ana@example.com", B = "ben@example.com";
const LEG = {desc: "KC to win", odds: -150, sport: "NFL", away: "KC", home: "BUF", kickoff: "2026-11-08T18:00:00Z", mk: "ml", side: "away"};
const userA = {joined_at: "2026-10-01", prefs: {name: "Ana", teams: {NFL: ["KC"]}}, bets: {bets: {x1: {stake: 50}}},
  tracked: {g: {secret: 1}, p: {}, parlays: {
    p1: {at: "2026-11-01T12:00:00Z", stake: 10, odds: 264, legs: [LEG, LEG]},
    p2: {at: "2026-11-03T12:00:00Z", stake: 5, odds: 120, legs: [LEG]},
    p3: {removed: 1}}}};

async function setup() {
  const ka = await userKey(A), kb = await userKey(B);
  const env = {ACCESS_TEAM_DOMAIN: DOMAIN, USERS: kv({[ka]: userA, [kb]: {joined_at: "2026-10-02", prefs: {name: "", teams: {}}}})};
  const call = async (who, method, body, qs = "") => {
    const r = await handle(new Request(`https://devigai.pages.dev/api/friends${qs}`, {method,
      headers: {"content-type": "application/json", ...(who ? {"cf-access-jwt-assertion": await token(who)} : {})},
      body: body ? JSON.stringify(body) : undefined}), env, fetcher);
    return {status: r.status, body: await r.json()};
  };
  return {env, call, ha: ka.slice(5)};
}

test("codes: 10 characters with no look-alikes, and typed codes are tidied", () => {
  for (let i = 0; i < 50; i++) assert.match(newCode(), /^[23456789a-hjkmnp-z]{10}$/);
  assert.equal(normCode(" ABCD-EFGH-JK "), "abcdefghjk");
  assert.equal(normCode("abc"), null);
  assert.equal(normCode("abcdefghij"), null);          // has an i
});

test("a friend sees saved parlays, newest first, never removed ones", () => {
  const s = shownParlays(userA);
  assert.deepEqual(s.map((p) => p.id), ["p2", "p1"]);
  assert.deepEqual(Object.keys(s[0]).sort(), ["at", "id", "legs", "odds", "stake"]);
});

test("API: sign-in and an account needed; sharing is off until turned on", async () => {
  const {env, call} = await setup();
  assert.equal((await call(null, "GET")).status, 401);
  assert.equal((await call("who@example.com", "GET")).status, 403);
  const r = await call(A, "GET");
  assert.deepEqual(r.body, {me: {code: null, share: false}, friends: []});
  assert.equal([...env.USERS.m.keys()].filter((k) => k.startsWith("fcode:")).length, 0);   // a GET writes nothing
});

test("API: share, follow by code, see name and parlays only; off hides them; a new code cuts off the old", async () => {
  const {env, call, ha} = await setup();
  let r = await call(A, "POST", {op: "share", on: true});
  const code = r.body.me.code;
  assert.ok(normCode(code) && r.body.me.share);
  assert.equal(env.USERS.m.get(`fcode:${code}`), ha);

  r = await call(B, "GET", null, `?code=${code.toUpperCase()}`);                     // the share link, before following
  assert.equal(r.body.friend.name, "Ana");
  assert.equal(r.body.friend.following, false);
  assert.equal(r.body.friend.parlays.length, 2);
  assert.equal((await call(A, "POST", {op: "follow", code})).status, 400);             // own code

  r = await call(B, "POST", {op: "follow", code});
  assert.deepEqual(r.body.following, [code]);
  r = await call(B, "GET");
  assert.equal(r.body.friends[0].name, "Ana");
  const sent = JSON.stringify(r.body);
  for (const secret of ["ana@example.com", "secret", "teams", "bets", "joined_at"]) assert.ok(!sent.includes(secret), secret);

  await call(A, "POST", {op: "share", on: false});
  r = await call(B, "GET");
  assert.deepEqual([r.body.friends[0].share, r.body.friends[0].parlays.length], [false, 0]);

  await call(A, "POST", {op: "share", on: true});                                      // same code comes back
  assert.equal((await call(A, "GET")).body.me.code, code);
  r = await call(A, "POST", {op: "code"});
  assert.notEqual(r.body.me.code, code);
  assert.equal(env.USERS.m.get(`fcode:${code}`), undefined);
  r = await call(B, "GET");
  assert.equal(r.body.friends[0].gone, true);
  assert.equal(r.body.friends[0].parlays.length, 0);

  r = await call(B, "POST", {op: "unfollow", code});
  assert.deepEqual(r.body.following, []);
});

test("API: unknown codes count against the person, then wait", async () => {
  const {call} = await setup();
  let last;
  for (let i = 0; i < 20; i++) last = await call(B, "POST", {op: "follow", code: "2345678abc"});
  assert.equal(last.status, 404);
  assert.equal((await call(B, "POST", {op: "follow", code: "2345678abd"})).status, 429);
  assert.equal((await call(B, "GET", null, "?code=2345678abd")).status, 429);
});
