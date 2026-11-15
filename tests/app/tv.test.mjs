// DeVig on the TV (functions/api/tv.js + functions/lib/tv.js): a private TV code, settings, and the dock's feed —
// open bets read leg by leg against ESPN. Fake KV, Access login and ESPN/Kalshi; no network:
//   node --test tests/app/tv.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { handle, newCode, normCode } from "../../functions/api/tv.js";
import { buildFeed, cleanSettings, findGame, findPlayer, kalshiLeg, legState, openBets, trackedLeg } from "../../functions/lib/tv.js";
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
function kv(init = {}) {
  const m = new Map(Object.entries(init).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));
  return {m, async get(k, t) { const v = m.get(k); return v == null ? null : t === "json" ? JSON.parse(v) : v; },
    async put(k, v) { m.set(k, v); }, async delete(k) { m.delete(k); }};
}

// ---------- ESPN fixtures ----------
const NOW = Date.parse("2026-11-15T01:30:00Z");
const comp = (id, away, home, as, hs, state, detail, date = "2026-11-15T00:30:00Z") => ({id, date,
  status: {type: {state, shortDetail: detail}},
  competitions: [{competitors: [{homeAway: "away", score: String(as), team: {abbreviation: away}}, {homeAway: "home", score: String(hs), team: {abbreviation: home}}]}]});
const NBA = {events: [comp("401", "DET", "MIA", 48, 54, "in", "6:12 - 3rd"), comp("402", "NY", "BOS", 71, 66, "in", "1:15 - 3rd"),
  comp("403", "DAL", "CLE", 0, 0, "pre", "7:30 PM", "2026-11-15T02:30:00Z"), comp("404", "LAL", "PHX", 110, 101, "post", "Final")]};
const NFL = {events: [comp("501", "BUF", "MIA", 0, 0, "pre", "Sun 1:00 PM", "2026-11-15T18:00:00Z")]};
const box = (rows) => ({boxscore: {players: [{statistics: [{keys: ["points", "rebounds", "assists"], athletes: rows.map(([n, p, r, a]) => ({athlete: {displayName: n}, stats: [String(p), String(r), String(a)]}))}]}]}});
const SUMMARY = {"401": box([["Tyler Herro", 22, 4, 3], ["Bam Adebayo", 12, 9, 2]]), "402": box([["Jalen Brunson", 18, 2, 5]])};
const espn = async (url) => {
  const u = String(url);
  if (u.includes("/nba/scoreboard")) return new Response(JSON.stringify(NBA));
  if (u.includes("/nfl/scoreboard")) return new Response(JSON.stringify(NFL));
  const ev = /summary\?event=(\d+)/.exec(u);
  if (ev) return new Response(JSON.stringify(SUMMARY[ev[1]] || {}));
  if (u.includes("cloudflareaccess")) return new Response(JSON.stringify({keys: [jwk]}));
  return new Response("{}", {status: 404});
};

const LEGS = [
  {desc: "Herro over 19.5 points", mk: "prop", side: "OVER", player: "Tyler Herro", stat: "points", line: 19.5, sport: "NBA", away: "DET", home: "MIA", kickoff: "2026-11-15T00:30:00Z"},
  {desc: "Brunson over 5.5 assists", mk: "prop", side: "OVER", player: "Jalen Brunson", stat: "assists", line: 5.5, sport: "NBA", away: "NYK", home: "BOS", kickoff: "2026-11-15T00:30:00Z"},
  {desc: "Heat ML", mk: "ml", side: "home", sport: "NBA", away: "DET", home: "MIA", kickoff: "2026-11-15T00:30:00Z"},
];
const USER = {joined_at: "2026-10-01", prefs: {name: "Rey", teams: {NFL: ["MIA"], NBA: ["MIA"]}},
  tracked: {g: {}, p: {}, parlays: {a1: {at: "2026-11-14T20:00:00Z", stake: 25, odds: 450, legs: LEGS}, old: {at: "2026-11-01T00:00:00Z", legs: [{...LEGS[2], kickoff: "2026-11-01T00:30:00Z"}]}, gone: {removed: 1}}},
  saved: {items: [], gone: {}}};

test("codes: 8 characters a remote can type, tidied when typed", () => {
  for (let i = 0; i < 50; i++) assert.match(newCode(), /^[23456789a-hjkmnp-z]{8}$/);
  assert.equal(normCode(" ABCD-EFGH "), "abcdefgh");
  assert.equal(normCode("abcdefgi"), null);
});

test("settings: unknown values fall back to the defaults", () => {
  const s = cleanSettings({show: "everything", delay: 7, sports: ["nba", "soccer"], props: false});
  assert.equal(s.show, "teams"); assert.equal(s.delay, 30); assert.deepEqual(s.sports, ["nba"]); assert.equal(s.props, false);
});

test("Kalshi legs: props, games, totals, and No sides read from the ticker", () => {
  const p = kalshiLeg({ticker: "KXNBAPTS-26NOV14DETMIA-MIATHERRO14-20", event: "KXNBAPTS-26NOV14DETMIA", title: "Tyler Herro: 20+ points", side: "yes", result: null, strike: 19.5});
  assert.equal(p.kind, "prop"); assert.equal(p.sport, "nba"); assert.equal(p.stat, "points"); assert.equal(p.player, "Tyler Herro");
  assert.equal(p.strike, 19.5); assert.equal(p.label, "Herro 20+ pts");
  const g = kalshiLeg({ticker: "KXNBAGAME-26NOV14DETMIA-MIA", title: "Detroit at Miami Winner?", side: "yes"});
  assert.equal(g.kind, "game"); assert.equal(g.team, "MIA"); assert.equal(g.label, "MIA to win");
  const t = kalshiLeg({ticker: "KXNBATOTAL-26NOV14DETMIA-224", title: "Over 224.5 points scored?", side: "no", strike: 224.5});
  assert.equal(t.kind, "total"); assert.equal(t.side, "no");
  assert.equal(kalshiLeg({ticker: "WEIRD", title: "x"}).kind, "other");
});

test("matching: Kalshi's joined team codes and ESPN's spellings find the game; unsure player matches don't", () => {
  const games = [{sport: "nba", id: "1", away: "NYK", home: "BOS", kickoff: "2026-11-15T00:30:00Z"}, {sport: "nba", id: "2", away: "GSW", home: "NOP", kickoff: "2026-11-15T00:30:00Z"}];
  assert.equal(findGame({sport: "nba", teams: "NYBOS", date: "2026-11-14"}, games).id, "1");
  assert.equal(findGame({sport: "nba", teams: "GSNO", date: "2026-11-14"}, games).id, "2");
  assert.equal(findGame({sport: "nba", teams: "NYBOS", date: "2026-11-20"}, games), null);                // a different day
  assert.equal(findGame({sport: "nba", away: "NYK", home: "BOS", kickoff: "2026-11-15T00:00:00Z"}, games).id, "1");
  const b = {"Jaren Jackson Jr.": {points: 9}, "Jalen Brunson": {points: 18}, "Jalen Green": {points: 4}};
  assert.equal(findPlayer("Jaren Jackson", b).points, 9);
  assert.equal(findPlayer("J. Brunson", b).points, 18);
  assert.equal(findPlayer("J. Green", b).points, 4);
  assert.equal(findPlayer("Nobody Here", b), null);
});

test("leg states: an over hits as soon as it passes; unders and moneylines wait for the final; stat fixes undo a hit", () => {
  const live = {state: "in", away: "DET", home: "MIA", away_score: 48, home_score: 54};
  const over = trackedLeg(LEGS[0]);
  assert.equal(legState(over, live, {"Tyler Herro": {points: 22}}).state, "won");
  assert.deepEqual(legState(over, live, {"Tyler Herro": {points: 18}}), {state: "live", now: 18, need: "20+", note: "18 of 20+"});
  assert.equal(legState(over, {...live, state: "post"}, {"Tyler Herro": {points: 18}}).state, "lost");
  const under = trackedLeg({...LEGS[0], side: "UNDER"});
  assert.equal(legState(under, live, {"Tyler Herro": {points: 18}}).state, "live");
  assert.equal(legState(under, live, {"Tyler Herro": {points: 22}}).state, "lost");
  assert.equal(legState(under, {...live, state: "post"}, {"Tyler Herro": {points: 18}}).state, "won");
  const ml = trackedLeg(LEGS[2]);
  assert.deepEqual(legState(ml, live, null), {state: "live", note: "up 6"});
  assert.equal(legState(ml, {...live, state: "post"}, null).state, "won");
  assert.equal(legState(ml, {...live, state: "pre"}, null).state, "pre");
  assert.equal(legState(ml, null, null).state, "unknown");
  assert.equal(legState({...ml, result: "lost"}, live, null).state, "lost");                         // Kalshi settled it
  assert.equal(legState(over, {...live, state: "post"}, {}).state, "unknown");                        // never played: not a guess
});

test("open bets: recent ★ parlays only, with what they pay", () => {
  const b = openBets(USER, NOW);
  assert.deepEqual(b.map(x => x.id), ["p:a1"]);
  assert.equal(b[0].pays, 137.5);
});

test("feed: parlay legs, my games first, then ★ teams; finished games without legs drop off", async () => {
  const f = await buildFeed({user: USER, settings: {show: "teams", sports: ["nba", "nfl"]}, now: NOW, fetcher: espn, readKalshi: async () => null, parseLink: () => null});
  const p = f.bets[0];
  assert.equal(p.n, 3); assert.equal(p.won, 1); assert.equal(p.lost, 0); assert.equal(p.done, null);
  assert.deepEqual(p.legs.map(l => [l.label, l.state, l.note]), [["Herro 20+ pts", "won", "22"], ["Brunson 6+ ast", "live", "5 of 6+"], ["MIA to win", "live", "up 6"]]);
  assert.deepEqual(f.games.map(g => `${g.away}@${g.home}:${g.mine}${g.fav ? "★" : ""}`), ["DET@MIA:2★", "NYK@BOS:1", "BUF@MIA:0★"]);
  const all = await buildFeed({user: USER, settings: {show: "all", sports: ["nba"]}, now: NOW, fetcher: espn, readKalshi: async () => null, parseLink: () => null});
  assert.ok(!all.games.some(g => g.away === "LAL"));                                               // a final with no legs
  assert.ok(!all.games.some(g => g.away === "DAL"));                                               // not started, no legs, not ★
});

test("feed: a saved Kalshi combo is read leg by leg", async () => {
  const user = {...USER, tracked: {g: {}, p: {}}, saved: {items: [{link: "https://kalshi.com/x?marketTicker=KXMVE-1", label: "Heat night", savedAt: "2026-11-14T22:00:00Z"}]}};
  const combo = {kind: "combo", legs: [
    {ticker: "KXNBAPTS-26NOV14DETMIA-MIATHERRO14-25", event: "KXNBAPTS-26NOV14DETMIA", title: "Tyler Herro: 25+ points", side: "yes", result: null, strike: 24.5},
    {ticker: "KXNBAGAME-26NOV14DETMIA-DET", title: "Detroit at Miami Winner?", side: "no", result: null}]};
  const f = await buildFeed({user, settings: {show: "bets"}, now: NOW, fetcher: espn, readKalshi: async () => combo, parseLink: () => "KXMVE-1"});
  assert.equal(f.bets[0].label, "Heat night");
  assert.deepEqual(f.bets[0].legs.map(l => [l.label, l.state, l.note]), [["Herro 25+ pts", "live", "22 of 25+"], ["No: DET to win", "live", "down 6"]]);
  assert.deepEqual(f.games.map(g => g.key), ["nba:401"]);
});

test("API: make a code, the TV reads with it, settings stick, a new code cuts off the old one", async () => {
  const ka = await userKey("rey@example.com"), h = ka.slice(5);
  const env = {ACCESS_TEAM_DOMAIN: DOMAIN, USERS: kv({[ka]: USER})};
  const call = async (who, method, body, qs = "", ip = "1.1.1.1") => {
    const r = await handle(new Request(`https://devigai.pages.dev/api/tv${qs}`, {method,
      headers: {"content-type": "application/json", "cf-connecting-ip": ip, ...(who ? {"cf-access-jwt-assertion": await token(who)} : {})},
      body: body ? JSON.stringify(body) : undefined}), env, espn);
    return {status: r.status, body: await r.json()};
  };
  assert.equal((await call(null, "GET")).status, 401);
  assert.deepEqual((await call("rey@example.com", "GET")).body.code, null);
  const c1 = (await call("rey@example.com", "POST", {op: "code"})).body.code;
  assert.ok(normCode(c1));
  assert.equal(env.USERS.m.get(`tvcode:${c1}`), h);
  let r = await call(null, "GET", null, `?key=${c1.toUpperCase().slice(0, 4)}-${c1.slice(4)}`);
  assert.equal(r.status, 200); assert.equal(r.body.bets.length, 1);
  assert.ok(!JSON.stringify(r.body).includes("rey@example.com"));
  r = await call("rey@example.com", "POST", {op: "settings", settings: {show: "bets", delay: 45}});
  assert.equal(r.body.settings.delay, 45);
  const c2 = (await call("rey@example.com", "POST", {op: "code"})).body.code;
  assert.notEqual(c1, c2);
  assert.equal((await call(null, "GET", null, `?key=${c1}`, "2.2.2.2")).status, 404);
  r = await call(null, "GET", null, `?key=${c2}`, "2.2.2.2");
  assert.equal(r.body.settings.delay, 45); assert.equal(r.body.settings.show, "bets");
  await call("rey@example.com", "POST", {op: "off"});
  assert.equal((await call(null, "GET", null, `?key=${c2}`, "3.3.3.3")).status, 404);
  for (let i = 0; i < 20; i++) await call(null, "GET", null, "?key=zzzzzzzz", "9.9.9.9");
  assert.equal((await call(null, "GET", null, `?key=${c2}`, "9.9.9.9")).status, 429);              // guessing is cut off
});
