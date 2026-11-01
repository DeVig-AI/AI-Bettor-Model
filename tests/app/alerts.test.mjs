// DeVig alerts: the push encryption and signature (functions/lib/webpush.js) and every alert rule and API op
// (functions/api/alerts.js). No browser, network or real keys needed:
//   node --test tests/app/alerts.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { b64uDecode, b64uEncode, encrypt, endpointOk, keysOk, send, vapid } from "../../functions/lib/webpush.js";
import {
  cleanParlay, cleanPrefs, cleanTarget, followed, handle, labAlerts, labPasses, moneyline, moveAlerts, parlayAlerts,
  pickAlerts, run, targetAlerts,
} from "../../functions/api/alerts.js";

const te = new TextEncoder(), td = new TextDecoder();
const NOW = Date.parse("2026-11-01T16:00:00Z");
const hmac = async (k, d) => new Uint8Array(await crypto.subtle.sign("HMAC",
  await crypto.subtle.importKey("raw", k, {name: "HMAC", hash: "SHA-256"}, false, ["sign"]), d));
const cat = (...p) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };

// a browser's side of a subscription: its key pair and auth secret
async function device() {
  const kp = await crypto.subtle.generateKey({name: "ECDH", namedCurve: "P-256"}, true, ["deriveBits"]);
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return {kp, p256dh: b64uEncode(pub), auth: b64uEncode(auth), pub, secret: auth};
}
// what the browser does with an aes128gcm push body (RFC 8291), written out separately from the sender
async function open(body, d) {
  const salt = body.slice(0, 16), idlen = body[20], asPub = body.slice(21, 21 + idlen), ct = body.slice(21 + idlen);
  assert.equal(new DataView(body.buffer, body.byteOffset).getUint32(16), 4096);
  const asKey = await crypto.subtle.importKey("raw", asPub, {name: "ECDH", namedCurve: "P-256"}, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({name: "ECDH", public: asKey}, d.kp.privateKey, 256));
  const ikm = await hmac(await hmac(d.secret, shared), cat(te.encode("WebPush: info\0"), d.pub, asPub, new Uint8Array([1])));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, cat(te.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, cat(te.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const plain = new Uint8Array(await crypto.subtle.decrypt({name: "AES-GCM", iv: nonce}, key, ct));
  assert.equal(plain[plain.length - 1], 2, "last record delimiter");
  return td.decode(plain.slice(0, -1));
}
async function vapidKeys() {
  const kp = await crypto.subtle.generateKey({name: "ECDSA", namedCurve: "P-256"}, true, ["sign", "verify"]);
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  return {kp, keys: {publicKey: b64uEncode(pub), privateKey: (await crypto.subtle.exportKey("jwk", kp.privateKey)).d}};
}

test("encryption: only the device's key opens it, and it says what was sent", async () => {
  const d = await device();
  const msg = JSON.stringify({title: "KC is +105 on Kalshi", body: "You asked for +105 or better.", url: "/v2/#/game/NFL%7C1"});
  const body = await encrypt(msg, d.p256dh, d.auth);
  assert.equal(await open(body, d), msg);
  const other = await device();
  await assert.rejects(open(body, {...other, pub: d.pub, secret: d.secret}));   // wrong private key
  await assert.rejects(encrypt("x", "AAAA", d.auth), /bad subscription keys/);
});

test("VAPID: an ES256 token for the push service's origin, signed with DeVig's key, 12 hours", async () => {
  const {kp, keys} = await vapidKeys();
  const h = await vapid("https://fcm.googleapis.com/fcm/send/abc", keys, "https://devigai.pages.dev", NOW);
  const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(h);
  assert.ok(m, h);
  assert.equal(m[4], keys.publicKey);
  const claims = JSON.parse(td.decode(b64uDecode(m[2])));
  assert.deepEqual(claims, {aud: "https://fcm.googleapis.com", exp: NOW / 1000 + 12 * 3600, sub: "https://devigai.pages.dev"});
  assert.equal(JSON.parse(td.decode(b64uDecode(m[1]))).alg, "ES256");
  assert.ok(await crypto.subtle.verify({name: "ECDSA", hash: "SHA-256"}, kp.publicKey, b64uDecode(m[3]), te.encode(`${m[1]}.${m[2]}`)));
});

test("send: posts the encrypted body with the push headers; refuses other hosts", async () => {
  const d = await device(), {keys} = await vapidKeys();
  let got = null;
  const fetcher = async (url, init) => { got = {url, init}; return new Response(null, {status: 201}); };
  const ep = "https://web.push.apple.com/QGx1";
  assert.equal(await send({endpoint: ep, p256dh: d.p256dh, auth: d.auth}, {title: "Hi"}, keys, {fetcher, now: NOW, urgency: "high"}), 201);
  assert.equal(got.url, ep);
  assert.equal(got.init.headers["content-encoding"], "aes128gcm");
  assert.equal(got.init.headers.urgency, "high");
  assert.match(got.init.headers.authorization, /^vapid t=/);
  assert.equal(JSON.parse(await open(got.init.body, d)).title, "Hi");
  got = null;
  assert.equal(await send({endpoint: "https://evil.example/x", p256dh: d.p256dh, auth: d.auth}, {}, keys, {fetcher}), 410);
  assert.equal(got, null);
});

test("subscriptions: only browsers' push services, and real key sizes", async () => {
  for (const ok of ["https://fcm.googleapis.com/fcm/send/x", "https://updates.push.services.mozilla.com/wpush/v2/x",
    "https://web.push.apple.com/x", "https://wns2-bl2p.notify.windows.com/w/?token=x"]) assert.ok(endpointOk(ok), ok);
  for (const bad of ["http://fcm.googleapis.com/x", "https://fcm.googleapis.com.evil.com/x", "https://evil.com/push.apple.com",
    "https://localhost/x", "javascript:alert(1)", "", null]) assert.ok(!endpointOk(bad), String(bad));
  const d = await device();
  assert.ok(keysOk(d.p256dh, d.auth));
  assert.ok(!keysOk(d.auth, d.auth));
  assert.ok(!keysOk(d.p256dh, d.p256dh));
});

// ---------- the rules ----------
const rec = (o = {}) => ({devices: [{endpoint: "https://fcm.googleapis.com/x"}], prefs: cleanPrefs({tz: "America/New_York"}),
  targets: [], parlays: [], since: "2026-11-01T00:00:00Z", labSeen: [], sent: {}, ...o});
const mk = (ticker, bid, ask, extra = {}) => ({ticker, yes_bid_dollars: String(bid), yes_ask_dollars: String(ask), status: "active", ...extra});
const KC = "KXNFLGAME-26NOV01KCBUF-BUF";

test("prices: the app's moneyline from one market (home costs the ask, away 1 - the bid)", () => {
  assert.deepEqual(moneyline(mk(KC, 0.48, 0.5)), {home: -100, away: -108});
  assert.deepEqual(moneyline(mk(KC, 0.6, 0.62)), {home: -163, away: 150});
  assert.equal(moneyline(mk(KC, "", "")), null);
});

const DEC = (o = {}) => ({game_id: "nfl_2026_09_KC_BUF", sport: "NFL", away_team: "KC", home_team: "BUF",
  kickoff_time: "2026-11-01T21:25:00Z", locked_at: "2026-11-01T15:30:00Z",
  decision: {action: "ML", side: "KC", prob: 0.58, tier: "B"}, market_snapshot: {moneyline_home: -120, moneyline_away: 100}, ...o});
const GAMES = [{sport: "NFL", espn_id: "401", away: "KC", home: "BUF", kickoff: "2026-11-01T21:25:00Z", home_ticker: KC}];

test("picks: new locks in a followed sport, before the start, once", () => {
  let out = pickAlerts(rec(), [DEC()], GAMES, NOW);
  assert.equal(out.length, 1);
  assert.equal(out[0].title, "DeVig pick: KC to beat BUF");
  assert.match(out[0].body, /^DeVig gives KC 58%, Kalshi 48%\. KC @ BUF, Sun 4:25 PM\.$/);
  assert.equal(out[0].url, "/v2/#/game/NFL%7C401");
  assert.equal(pickAlerts(rec({sent: {[out[0].key]: [NOW, null]}}), [DEC()], GAMES, NOW).length, 0);           // once
  assert.equal(pickAlerts(rec({prefs: {...rec().prefs, picks: ["NBA"]}}), [DEC()], GAMES, NOW).length, 0);      // sport off
  assert.equal(pickAlerts(rec(), [DEC({decision: {action: "PASS", side: null}})], GAMES, NOW).length, 0);       // a pass
  assert.equal(pickAlerts(rec({since: "2026-11-01T15:45:00Z"}), [DEC()], GAMES, NOW).length, 0);                 // before alerts were on
  assert.equal(pickAlerts(rec(), [DEC({kickoff_time: "2026-11-01T15:00:00Z"})], GAMES, NOW).length, 0);         // started
});

const STATUS = {sport: "NFL", candidates: [{id: "a", name: "Rest edge", state: "failed"}, {id: "b", name: "QB form", state: "lab_pass"}],
  by_sport: {NBA: {candidates: [{id: "c", name: "Pace", state: "exam_pass"}]}}};

test("lab: a pass that's new since alerts were turned on; the exam pass is its own alert", () => {
  assert.deepEqual(labPasses(STATUS).map(p => p.key), ["lab:NFL:b:lab", "lab:NBA:c:lab", "lab:NBA:c:exam"]);
  const out = labAlerts(rec({labSeen: ["lab:NFL:b:lab", "lab:NBA:c:lab"]}), STATUS);
  assert.equal(out.length, 1);
  assert.equal(out[0].title, "Lab model passed the sealed exam (NBA)");
  assert.equal(out[0].url, "/v2/#/models");
  assert.equal(labAlerts(rec(), null).length, 0);
});

const T = {id: "t1", sport: "NFL", gid: "401", away: "KC", home: "BUF", kickoff: "2026-11-01T21:25:00Z", ticker: KC, side: "away", odds: 105};

test("price targets: fire at the number or better, then go; expire at the start", () => {
  let r = targetAlerts(rec({targets: [T]}), {[KC]: mk(KC, 0.5, 0.52)}, NOW);   // away +100: not yet
  assert.deepEqual([r.out.length, r.done], [0, []]);
  r = targetAlerts(rec({targets: [T]}), {[KC]: mk(KC, 0.52, 0.54)}, NOW);      // away 1/0.48 -> +108
  assert.equal(r.out[0].title, "KC is +108 on Kalshi");
  assert.deepEqual(r.done, ["t1"]);
  r = targetAlerts(rec({targets: [{...T, kickoff: "2026-11-01T15:00:00Z"}]}), {[KC]: mk(KC, 0.6, 0.62)}, NOW);
  assert.deepEqual([r.out.length, r.done], [0, ["t1"]]);
  assert.equal(cleanTarget({...T, odds: 50}), null);
  assert.equal(cleanTarget({...T, ticker: "KXNFLSPREAD-X-Y"}), null);
  assert.equal(cleanTarget({...T, side: "over"}), null);
  assert.equal(cleanTarget(T).odds, 105);
});

test("followed games: favorite teams, and ★ tracked by ESPN id or by the pick's game id", () => {
  const g2 = {...GAMES[0], espn_id: "402", away: "NYJ", home: "MIA", home_ticker: "KXNFLGAME-26NOV01NYJMIA-MIA"};
  assert.deepEqual(followed({prefs: {teams: {NFL: ["BUF"]}}}, [GAMES[0], g2], []).map(g => g.espn_id), ["401"]);
  assert.deepEqual(followed({tracked: {g: {"402": 1}}}, [GAMES[0], g2], []).map(g => g.espn_id), ["402"]);
  assert.deepEqual(followed({tracked: {g: {nfl_2026_09_KC_BUF: 1}}}, [GAMES[0], g2], [DEC()]).map(g => g.espn_id), ["401"]);
  assert.deepEqual(followed(null, [GAMES[0]], []), []);
});

test("line moves: 5+ points in 6 hours before the start; again only after another 5 and an hour", () => {
  const m = {[KC]: mk(KC, 0.6, 0.62)};                           // fair home ~ 0.62/(0.62+0.4)= 0.608
  let out = moveAlerts(rec(), GAMES, m, {[KC]: 0.52}, NOW);
  assert.equal(out.length, 1);
  assert.equal(out[0].title, "Line move: BUF 52% → 61%");
  assert.match(out[0].body, /moved 9 points in 6 hours/);
  assert.equal(moveAlerts(rec(), GAMES, m, {[KC]: 0.58}, NOW).length, 0);                  // only 3 points
  const sent = {[out[0].key]: [NOW - 2 * 3600e3, 0.57]};
  assert.equal(moveAlerts(rec({sent}), GAMES, m, {[KC]: 0.5}, NOW).length, 0);             // 4 from the last alert
  assert.equal(moveAlerts(rec({sent: {[out[0].key]: [NOW - 600e3, 0.5]}}), GAMES, m, {[KC]: 0.5}, NOW).length, 0); // too soon
  assert.equal(moveAlerts(rec({sent: {[out[0].key]: [NOW - 2 * 3600e3, 0.5]}}), GAMES, m, {[KC]: 0.5}, NOW).length, 1);
  out = moveAlerts(rec(), GAMES, {[KC]: mk(KC, 0.38, 0.4)}, {[KC]: 0.5}, NOW);             // down: the away team rose
  assert.match(out[0].title, /^Line move: KC 50% → 6\d%$/);
  assert.equal(moveAlerts(rec(), [{...GAMES[0], kickoff: "2026-11-01T15:00:00Z"}], m, {[KC]: 0.4}, NOW).length, 0);
});

const L1 = "KXNFLGAME-26NOV01KCBUF-KC", L2 = "KXNBAGAME-26NOV01BOSNYK-BOS";
const P = {id: "p1", label: "", legs: [{ticker: L1, side: "yes", label: "KC wins"}, {ticker: L2, side: "yes", label: "BOS wins"}],
  at: 0.5, from: 0.3, settle: true};

test("parlays: each leg as it settles, the chance reaching the mark, and the end", () => {
  let r = parlayAlerts(rec({parlays: [P]}), {[L1]: mk(L1, 0.5, 0.52), [L2]: mk(L2, 0.6, 0.62)});    // 0.51*0.61 = 31%
  assert.deepEqual([r.out.length, r.update], [0, {}]);
  r = parlayAlerts(rec({parlays: [P]}), {[L1]: mk(L1, 0, 0, {status: "finalized", result: "yes"}), [L2]: mk(L2, 0.6, 0.62)});
  assert.deepEqual(r.out.map(m => m.title), ["2-leg parlay: leg won", "2-leg parlay is at 61%"]);
  assert.match(r.out[0].body, /^KC wins\. 1 of 2 in, about 61% to hit now\.$/);
  assert.deepEqual(r.update, {p1: {...P, at: null}});                                     // the mark fired; legs still on
  r = parlayAlerts(rec({parlays: [P]}), {[L1]: mk(L1, 0, 0, {status: "finalized", result: "no"}), [L2]: mk(L2, 0.6, 0.62)});
  assert.equal(r.out[0].body, "KC wins. The parlay is done.");
  assert.deepEqual(r.update, {p1: null});
  r = parlayAlerts(rec({parlays: [{...P, at: 0.2, from: 0.3, settle: false}]}), {[L1]: mk(L1, 0.3, 0.32), [L2]: mk(L2, 0.6, 0.62)});
  assert.equal(r.out[0].title, "2-leg parlay is at 19%");                                  // falling through the mark
  assert.deepEqual(r.update, {p1: null});
  assert.equal(cleanParlay({...P, at: 1.5}), null);
  assert.equal(cleanParlay({...P, at: null, settle: false}), null);
  assert.equal(cleanParlay({...P, legs: [{ticker: "bad ticker!", side: "yes"}]}), null);
});

// ---------- the API and the checker, end to end with a fake KV ----------
function kv(init = {}) {
  const m = new Map(Object.entries(init).map(([k, v]) => [k, JSON.stringify(v)]));
  return {m, async get(k, t) { const v = m.get(k); return v == null ? null : t === "json" ? JSON.parse(v) : v; }, async put(k, v) { m.set(k, v); }};
}
const EMAIL = "fan@example.com", DOMAIN = "t.cloudflareaccess.com";
const rsa = await crypto.subtle.generateKey({name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256"}, true, ["sign", "verify"]);
const jwk = {...await crypto.subtle.exportKey("jwk", rsa.publicKey), kid: "k1"};
async function token(email) {     // a Cloudflare Access login, as in the other account tests
  const h = b64uEncode(te.encode(JSON.stringify({alg: "RS256", kid: "k1"})));
  const p = b64uEncode(te.encode(JSON.stringify({email, iss: `https://${DOMAIN}`, exp: Math.floor(Date.now() / 1000) + 600})));
  return `${h}.${p}.${b64uEncode(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", rsa.privateKey, te.encode(h + "." + p))))}`;
}

test("API: needs an account; turning on a device, a target, and a test send", async () => {
  const {userKey} = await import("../../functions/api/me.js");
  const {keys} = await vapidKeys();
  const key = await userKey(EMAIL), h = key.slice(5);
  const env = {ACCESS_TEAM_DOMAIN: DOMAIN, VAPID_PRIVATE_KEY: keys.privateKey, USERS: kv({[key]: {joined_at: "2026-10-01"}})};
  const req = async (method, body, auth = true) => new Request("https://devigai.pages.dev/api/alerts", {method,
    headers: {"content-type": "application/json", ...(auth ? {"cf-access-jwt-assertion": await token(EMAIL)} : {})},
    body: body ? JSON.stringify(body) : undefined});
  const fetcher = async url => String(url).endsWith("/cdn-cgi/access/certs") ? new Response(JSON.stringify({keys: [jwk]}))
    : String(url).includes("status.json") ? new Response(JSON.stringify(STATUS)) : new Response("{}", {status: 404});
  assert.equal((await handle(await req("GET", null, false), env, {fetcher, now: NOW})).status, 401);
  assert.equal((await handle(await req("GET"), {...env, USERS: kv()}, {fetcher, now: NOW})).status, 403);   // no account
  let r = await handle(await req("GET"), env, {fetcher, now: NOW});
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ready, true);
  const d = await device();
  const sub = {endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: {p256dh: d.p256dh, auth: d.auth}};
  r = await handle(await req("POST", {op: "device", sub, name: "Android"}), env, {fetcher, now: NOW});
  assert.equal(r.status, 200);
  const stored = JSON.parse(env.USERS.m.get(`alerts:${h}`));
  assert.equal(stored.devices.length, 1);
  assert.deepEqual(stored.labSeen, labPasses(STATUS).map(p => p.key));
  assert.deepEqual(JSON.parse(env.USERS.m.get("alerts:index")).users, [h]);
  r = await handle(await req("POST", {op: "device", sub: {...sub, endpoint: "https://evil.example/x"}}), env, {fetcher, now: NOW + 5000});
  assert.equal(r.status, 400);
  r = await handle(await req("POST", {op: "target", target: T}), env, {fetcher, now: NOW + 10000});
  assert.equal((await r.json()).targets.length, 1);
  r = await handle(await req("POST", {op: "target", target: T}), env, {fetcher, now: NOW + 10200});
  assert.equal(r.status, 429);                                                           // too fast
  const sent = [];
  r = await handle(await req("POST", {op: "test"}), env, {fetcher, now: NOW, sender: async (dev, msg) => { sent.push(msg.title); return 201; }});
  assert.deepEqual(await r.json(), {ok: true, results: [201]});
  assert.deepEqual(sent, ["DeVig alerts are on"]);
  // the checker URL: needs the run key when one is set, else runs at most every 90 seconds
  const runEnv = {...env, ALERTS_RUN_KEY: "k"};
  const runReq = k => new Request("https://devigai.pages.dev/api/alerts?run=1", {method: "POST", headers: k ? {"x-run-key": k} : {}});
  assert.equal((await handle(runReq("nope"), runEnv, {fetcher, now: NOW, cache: null})).status, 403);
  assert.equal((await handle(runReq("k"), runEnv, {fetcher, now: NOW, cache: null, sender: async () => 201})).status, 200);
  const first = await (await handle(runReq(), env, {fetcher, now: NOW, cache: null, sender: async () => 201})).json();
  const again = await (await handle(runReq(), env, {fetcher, now: NOW + 1000, cache: null})).json();
  assert.equal(first.skipped, undefined);
  assert.equal(again.skipped, "ran recently");
});

test("checker: sends what's due once, drops a fired target, forgets a gone device", async () => {
  const {keys} = await vapidKeys();
  const h = "abc123";
  const env = {VAPID_PRIVATE_KEY: keys.privateKey, USERS: kv({
    "alerts:index": {users: [h]},
    [`alerts:${h}`]: rec({targets: [T], parlays: [], devices: [{endpoint: "https://fcm.googleapis.com/a", p256dh: "x", auth: "y"},
      {endpoint: "https://fcm.googleapis.com/gone", p256dh: "x", auth: "y"}], labSeen: labPasses(STATUS).map(p => p.key)}),
    [`user:${h}`]: {prefs: {teams: {NFL: ["BUF"]}}, tracked: {g: {}}},
  })};
  const files = {"live/game_lines.json": {games: GAMES}, "nfl/lineboard_export.json": {docs: [{collection: "decisions", data: DEC()}]},
    "research/status.json": STATUS};
  const fetcher = async url => {
    url = String(url);
    for (const [k, v] of Object.entries(files)) if (url.includes(k)) return new Response(JSON.stringify(v));
    if (url.includes("/markets?tickers=")) return new Response(JSON.stringify({markets: [mk(KC, 0.52, 0.54)]}));
    if (url.includes("/candlesticks")) return new Response(JSON.stringify({candlesticks: [
      {end_period_ts: NOW / 1000 - 6 * 3600, yes_bid: {close_dollars: "0.46"}, yes_ask: {close_dollars: "0.48"}}]}));
    return new Response("{}", {status: 404});
  };
  const sent = [];
  const sender = async (dev, msg) => { if (dev.endpoint.endsWith("gone")) return 410; sent.push(msg.title); return 201; };
  const report = await run(env, {fetcher, now: NOW, sender});
  assert.deepEqual(report, {people: 1, sent: 3, gone: 1});
  assert.deepEqual(sent.sort(), ["DeVig pick: KC to beat BUF", "KC is +108 on Kalshi", "Line move: BUF 47% → 53%"].sort());
  const after = JSON.parse(env.USERS.m.get(`alerts:${h}`));
  assert.equal(after.targets.length, 0);
  assert.equal(after.devices.length, 1);
  assert.equal(after.sends, 3);
  sent.length = 0;
  await run(env, {fetcher, now: NOW + 600e3, sender});
  assert.deepEqual(sent, []);                                                            // nothing twice
});
