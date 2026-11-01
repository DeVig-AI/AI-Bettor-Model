// Fair price page: the odds math (web/src/lib/odds.ts, run straight from the TypeScript) and logged bets saved through
// /api/me (functions/api/me.js), including a save from the classic app, which doesn't send bets, keeping them.
// node --test tests/app/fair.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import * as O from "../../web/src/lib/odds.ts";
import { handle, cleanBets, userKey } from "../../functions/api/me.js";

const near = (a, b, tol = 5e-4) => assert.ok(Math.abs(a - b) < tol, `${a} vs ${b}`);

test("break-even, typed odds and fair odds", () => {
  near(O.breakeven(-110), 0.5238); near(O.breakeven(150), 0.4);
  assert.equal(O.breakeven(50), null);
  assert.equal(O.parseAmerican("−110"), -110); assert.equal(O.parseAmerican("+150"), 150);
  assert.equal(O.parseAmerican("150"), 150); assert.equal(O.parseAmerican("-50"), null); assert.equal(O.parseAmerican("abc"), null);
  near(O.americanFrom(0.5), -100, 1e-9); near(O.americanFrom(0.4), 150, 1e-9); near(O.americanFrom(0.75), -300, 1e-9);
});

test("no-vig: even lines split 50/50; the power method takes more off the long shot (same as classic)", () => {
  const e = O.noVig(-110, -110);
  near(e.mine, 0.5); near(e.vig, 0.0476);
  const d = O.noVig(250, -300);               // classic's devigTwoWay(-300, 250, "DraftKings").b = 0.2637
  near(d.mine, 0.2637); near(d.mine + d.other, 1, 1e-9);
  assert.ok(d.mine < O.breakeven(250) / (O.breakeven(250) + O.breakeven(-300)));
});

test("expected value, Kelly and beating the close", () => {
  near(O.expectedValue(0.5, 100), 0); near(O.expectedValue(0.55, -110), 0.05);
  near(O.kelly(0.55, 100), 0.1); assert.equal(O.kelly(0.45, 100), null);
  const c = O.closingValue(150, 0.45);        // +150 needed 40%; the market closed at 45%
  near(c.points, 0.05); near(c.ev, 0.125);
  near(O.profitUnits(-200, "won"), 0.5); assert.equal(O.profitUnits(-200, "lost"), -1); assert.equal(O.profitUnits(-200, "push"), 0);
});

// ---------- /api/me ----------
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
const BET = {id: "abc123", at: "2026-11-01T12:00:00Z", sport: "NHL", game: "401800001", away: "EDM", home: "NYR",
  kickoff: "2026-11-01T23:00:00Z", side: "away", odds: 135, other: -155, book: "FanDuel", stake: 20};

test("cleanBets keeps well-formed bets and tombstones, drops the rest", () => {
  const out = cleanBets({bets: {abc123: {...BET, extra: "x"}, gone1: {removed: 5}, "BAD ID": BET,
    odd1: {...BET, odds: 50}, side1: {...BET, side: "over"}}, updated: 9});
  assert.deepEqual(Object.keys(out.bets).sort(), ["abc123", "gone1"]);
  assert.equal(out.bets.abc123.extra, undefined); assert.equal(out.bets.abc123.stake, 20);
  assert.deepEqual(out.bets.gone1, {removed: 5});
  assert.equal(cleanBets(undefined), null);
});

test("bets are saved, returned, and kept when the classic app saves without them", async () => {
  const email = "fan@example.com";
  const m = new Map([[await userKey(email), JSON.stringify({joined_at: "2026-10-01"})]]);
  const env = {ACCESS_TEAM_DOMAIN: DOMAIN, USERS: {get: async (k, t) => (m.has(k) ? (t === "json" ? JSON.parse(m.get(k)) : m.get(k)) : null), put: async (k, v) => { m.set(k, v); }}};
  const fetcher = async url => new Response(JSON.stringify({keys: [jwk]}));
  const call = async (method, body) => handle(new Request("https://devigai.pages.dev/api/me", {method,
    headers: {"cf-access-jwt-assertion": await token(email)}, body: body && JSON.stringify(body)}), env, fetcher);
  const age = async () => { const k = await userKey(email); const r = JSON.parse(m.get(k)); r.saved_at = "2026-01-01T00:00:00Z"; m.set(k, JSON.stringify(r)); };

  assert.equal((await call("PUT", {tracked: {g: {x: 1}, p: {}}, prefs: {}, bets: {bets: {abc123: BET}, updated: 1}})).status, 200);
  await age();
  assert.equal((await call("PUT", {tracked: {g: {x: 1}, p: {}}, prefs: {}})).status, 200);   // classic: no bets field
  const d = await (await call("GET")).json();
  assert.equal(d.data.bets.bets.abc123.odds, 135);
  assert.deepEqual(d.data.tracked.g, {x: 1});
});
