// Saved bets (Kalshi links and DeVig slips) on the account: two devices merge, removals stick, friends see a tidy
// copy. The server (functions/api/me.js) and the app (web/src/lib/saved-merge.ts) must merge the same way. No network:
//   node --test tests/app/saved_sync.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { cleanSaved, mergeSaved, handle as me, userKey } from "../../functions/api/me.js";
import { shownSaved, handle as friends } from "../../functions/api/friends.js";
import { mergeSaved as mergeApp } from "../../web/src/lib/saved-merge.ts";

const K = (n) => `https://kalshi.com/markets/kxmve/x/KXMVE-${n}?marketTicker=KXMVE-${n}-A&referral=abc`;
const item = (n, at, extra = {}) => ({link: K(n), label: `Combo, ${n} legs`, savedAt: at, ...extra});

test("two devices: every saved bet either has, newest first, on server and app alike", () => {
  const phone = {items: [item(14, "2026-11-04T20:00:00Z", {snap: {letter: "F"}}), item(3, "2026-11-01T12:00:00Z")], gone: {}};
  const laptop = {items: [item(5, "2026-11-03T12:00:00Z"), item(14, "2026-11-04T21:00:00Z", {outcome: {won: false}})], gone: {}};
  const m = mergeSaved(phone, laptop);
  assert.deepEqual(m.items.map((s) => s.label), ["Combo, 14 legs", "Combo, 5 legs", "Combo, 3 legs"]);
  assert.equal(m.items[0].savedAt, "2026-11-04T20:00:00Z");       // the earlier save ...
  assert.deepEqual([m.items[0].snap, m.items[0].outcome], [{letter: "F"}, {won: false}]);   // ... knowing both
  assert.deepEqual(mergeApp(phone, laptop), m);
  assert.deepEqual(mergeApp(laptop, phone).items.map((s) => s.link), m.items.map((s) => s.link));
});

test("a removed bet stays removed on every device, unless it's saved again later", () => {
  const a = {items: [item(5, "2026-11-03T12:00:00Z")], gone: {}};
  const b = {items: [], gone: {[K(5)]: Date.parse("2026-11-04T00:00:00Z")}};
  assert.equal(mergeSaved(a, b).items.length, 0);
  assert.equal(mergeApp(a, b).items.length, 0);
  const again = {items: [item(5, "2026-11-05T00:00:00Z")], gone: {}};
  assert.equal(mergeSaved(b, again).items.length, 1);
  assert.equal(mergeApp(b, again).items.length, 1);
});

test("cleanSaved: keeps the shape, drops junk and oversized parts; none sent means keep what's stored", () => {
  assert.equal(cleanSaved(null), null);
  assert.equal(cleanSaved({bets: {}}), null);
  const c = cleanSaved({items: [item(3, "2026-11-01T12:00:00Z", {snap: {letter: "C"}, outcome: {x: "y".repeat(7000)}, extra: 1}),
    item(3, "2026-11-02T00:00:00Z"), {link: 5}, {link: "x".repeat(700)}], gone: {[K(9)]: "17", bad: []}});
  assert.equal(c.items.length, 1);
  assert.deepEqual(Object.keys(c.items[0]).sort(), ["label", "link", "savedAt", "snap"]);
  assert.deepEqual(c.gone, {[K(9)]: 17, bad: 1});
  assert.equal(cleanSaved({items: Array.from({length: 40}, (_, i) => item(i, "2026-11-01T00:00:00Z"))}).items.length, 30);
});

test("friends see Kalshi bets with the link tidied, never DeVig slips or other sites", () => {
  const user = {saved: {items: [item(3, "2026-11-01T12:00:00Z", {snap: {letter: "C"}}), {link: "slip:KX~yes", label: "Your parlay", savedAt: "x"},
    {link: "https://evil.example/markets/x", label: "x", savedAt: "x"}, {link: "kalshi.com/markets/kxnbagame/g/kxnbagame-26oct31poruta?utm=1", label: "Game", savedAt: "y"}]}};
  const s = shownSaved(user);
  assert.deepEqual(s.map((x) => x.link), ["https://kalshi.com/markets/kxmve/x/KXMVE-3?marketTicker=KXMVE-3-A",
    "https://kalshi.com/markets/kxnbagame/g/kxnbagame-26oct31poruta"]);
  assert.deepEqual(s[0].snap, {letter: "C"});
  assert.deepEqual(shownSaved({}), []);
});

// ---------- through the API: fake KV and Access login ----------
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
const kv = () => { const m = new Map(); return {m, async get(k, t) { const v = m.get(k); return v == null ? null : t === "json" ? JSON.parse(v) : v; },
  async put(k, v) { m.set(k, v); }, async delete(k) { m.delete(k); }}; };

test("API: the phone's saved bets reach the laptop, the laptop's removal reaches the phone, and a friend sees them", async () => {
  const A = "ana@example.com", B = "ben@example.com";
  const env = {ACCESS_TEAM_DOMAIN: DOMAIN, USERS: kv()};
  for (const e of [A, B]) env.USERS.m.set(await userKey(e), JSON.stringify({joined_at: "2026-10-01", saved_at: "2026-10-01T00:00:00Z", prefs: {name: e === A ? "Ana" : "Ben", teams: {}}}));
  const call = async (h, who, method, body, qs = "") => {
    const r = await h(new Request(`https://devigai.pages.dev/api/x${qs}`, {method,
      headers: {"content-type": "application/json", "cf-access-jwt-assertion": await token(who)}, body: body ? JSON.stringify(body) : undefined}), env, fetcher);
    return {status: r.status, body: await r.json()};
  };
  const rewind = async () => { const k = await userKey(A); const r = JSON.parse(env.USERS.m.get(k)); r.saved_at = "2026-10-01T00:00:00Z"; env.USERS.m.set(k, JSON.stringify(r)); };
  let r = await call(me, A, "PUT", {tracked: {}, prefs: {name: "Ana"}, saved: {items: [item(14, "2026-11-04T20:00:00Z"), item(3, "2026-11-01T12:00:00Z")], gone: {}}});
  assert.equal(r.status, 200);
  assert.equal(r.body.data.saved.items.length, 2);
  await rewind();
  r = await call(me, A, "PUT", {tracked: {}, prefs: {name: "Ana"}, saved: {items: [], gone: {[K(3)]: Date.now()}}});    // the laptop removes one
  assert.deepEqual(r.body.data.saved.items.map((s) => s.label), ["Combo, 14 legs"]);
  await rewind();
  r = await call(me, A, "PUT", {tracked: {}, prefs: {name: "Ana"}});                                                   // classic: no saved field
  assert.equal(r.body.data.saved.items.length, 1);
  r = await call(me, A, "GET");
  assert.equal(r.body.data.saved.items[0].label, "Combo, 14 legs");

  const code = (await call(friends, A, "POST", {op: "share", on: true})).body.me.code;
  await call(friends, B, "POST", {op: "follow", code});
  r = await call(friends, B, "GET");
  assert.deepEqual(r.body.friends[0].saved.map((s) => s.label), ["Combo, 14 legs"]);
  assert.ok(!JSON.stringify(r.body).includes("referral"));
  await call(friends, A, "POST", {op: "share", on: false});
  assert.deepEqual((await call(friends, B, "GET")).body.friends[0].saved, []);
});

test("needsUpload: an account with no saved bets, or missing one, gets this device's copy", async () => {
  const { needsUpload } = await import("../../web/src/lib/saved-merge.ts");
  const a = { link: "https://kalshi.com/m/A", label: "A", savedAt: "2026-11-04T10:00:00Z" };
  const b = { link: "https://kalshi.com/m/B", label: "B", savedAt: "2026-11-04T11:00:00Z" };
  assert.equal(needsUpload({ items: [a], gone: {} }, null), true);
  assert.equal(needsUpload({ items: [a], gone: {} }, { items: [a, b], gone: {} }), false);
  assert.equal(needsUpload({ items: [a, b], gone: {} }, { items: [b], gone: {} }), true);
  assert.equal(needsUpload({ items: [], gone: {} }, { items: [], gone: {} }), false);
  assert.equal(needsUpload({ items: [], gone: { [a.link]: Date.now() } }, { items: [], gone: {} }), true);
});
