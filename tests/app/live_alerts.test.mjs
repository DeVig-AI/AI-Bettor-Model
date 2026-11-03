import test from "node:test";
import assert from "node:assert/strict";
import { callOf, compose, gameEvents, isLate, mine, statusOf, trackedLegs, FRESH_S, PER_GAME } from "../../functions/lib/live-alerts.js";
import { cleanPrefs, isQuiet, run } from "../../functions/api/alerts.js";
import { priced } from "../../functions/api/kalshi.js";
import { b64uEncode } from "../../functions/lib/webpush.js";

async function vapidKeys() {
  const kp = await crypto.subtle.generateKey({name: "ECDSA", namedCurve: "P-256"}, true, ["sign", "verify"]);
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  return {keys: {publicKey: b64uEncode(pub), privateKey: (await crypto.subtle.exportKey("jwk", kp.privateKey)).d}};
}

const NOW = Date.parse("2026-11-08T20:00:00Z"), S = NOW / 1000;
const ALL = {start: true, half: true, lead: true, plays: true, winner: true, final: true};
const FB = {sport: "nfl", id: "401", kind: "football", kickoff: "2026-11-08T18:00:00Z"};
const st = (o = {}) => ({state: "in", half: false, final: false, away: "KC", home: "DEN", as: 10, hs: 7, ...o});
// plays newest first, like the game feed
const fbPlays = () => [
  {id: "5", team: "DEN", q: 2, clock: "2:10", type: "Pass Interception Return", text: "Nix pass intercepted by McDuffie", away_score: 10, home_score: 7, at: S - 30},
  {id: "4", team: "KC", q: 2, clock: "3:00", type: "Field Goal Good", text: "Butker 40 yard field goal is GOOD", scoring: true, away_score: 10, home_score: 7, at: S - 120},
  {id: "3", team: "KC", q: 2, clock: "9:00", type: "Rushing Touchdown", text: "Pacheco 2 yd run (Butker extra point is GOOD)", scoring: true, away_score: 7, home_score: 7, at: S - 300},
  {id: "2", team: "DEN", q: 1, clock: "4:00", type: "Passing Touchdown", text: "Nix pass to Sutton for 20 yds TOUCHDOWN (Lutz extra point is GOOD)", scoring: true, away_score: 0, home_score: 7, at: S - 2000},
  {id: "1", team: "KC", q: 1, clock: "15:00", type: "Kickoff", text: "Kickoff", away_score: 0, home_score: 0, at: S - 3000},
];

test("football calls match the live field's banner rules", () => {
  const ps = fbPlays();
  assert.deepEqual(callOf(ps[2], ps[3], "KC", "DEN"), {kind: "td", word: "TOUCHDOWN!", team: "KC", pts: 7});
  assert.deepEqual(callOf(ps[1], ps[2], "KC", "DEN"), {kind: "fg", word: "FIELD GOAL IS GOOD", team: "KC", pts: 3});
  assert.equal(callOf(ps[0], ps[1], "KC", "DEN").word, "INTERCEPTION!");
  assert.equal(callOf(ps[0], ps[1], "KC", "DEN").team, "KC");                       // the defense has it now
  assert.equal(callOf({id: "x", team: "KC", type: "Interception Return Touchdown", text: "", away_score: 0, home_score: 13}, ps[2], "KC", "DEN").word, "PICK SIX!");
});

test("football: fresh plays only, lead change merged into the call", () => {
  const ev = gameEvents(FB, st(), fbPlays(), NOW);
  const plays = ev.filter(e => e.k === "play");
  assert.deepEqual(plays.map(e => e.key), ["ls:nfl:401:p3", "ls:nfl:401:p4", "ls:nfl:401:p5"]);   // DEN's TD is old news
  const fg = plays.find(e => e.key.endsWith("p4"));
  assert.equal(fg.take.team, "KC");
  assert.equal(ev.some(e => e.k === "start"), false);                                // started 50 min ago
  const msgs = compose(ev, ALL, {sport: "nfl", url: "/g"});
  assert.deepEqual(msgs.map(m => m.title), ["TOUCHDOWN! KC +7", "FIELD GOAL IS GOOD KC +3", "INTERCEPTION! KC"]);
  assert.equal(msgs[1].body, "KC takes the lead. KC 10 – DEN 7 · Q2 3:00");
  // only lead changes picked: the field goal, worded as the lead
  assert.deepEqual(compose(ev, {lead: true}, {sport: "nfl"}).map(m => m.title), ["KC takes the lead"]);
  assert.deepEqual(compose(ev, {}, {sport: "nfl"}), []);
});

test("start, halftime and final with the game winner", () => {
  const early = [{id: "1", team: "KC", q: 1, clock: "15:00", type: "Kickoff", text: "Kickoff", away_score: 0, home_score: 0, at: S - 120}];
  assert.deepEqual(compose(gameEvents(FB, st({as: 0, hs: 0}), early, NOW), {start: true}, {sport: "nfl"}).map(m => m.title), ["KC @ DEN is starting"]);
  assert.deepEqual(compose(gameEvents(FB, st({half: true}), [], NOW), {half: true}, {sport: "nfl"}).map(m => m.title), ["Halftime: KC 10 – DEN 7"]);
  const late = [
    {id: "9", team: "KC", q: 4, clock: "0:00", type: "End of Game", text: "END GAME", away_score: 24, home_score: 21, at: S - 60},
    {id: "8", team: "KC", q: 4, clock: "0:41", type: "Field Goal Good", text: "field goal is GOOD", scoring: true, away_score: 24, home_score: 21, at: S - 200},
    {id: "7", team: "DEN", q: 4, clock: "5:00", type: "Passing Touchdown", text: "TOUCHDOWN", scoring: true, away_score: 21, home_score: 21, at: S - 900},
    {id: "6", team: "DEN", q: 4, clock: "9:00", type: "Field Goal Good", text: "field goal is GOOD", scoring: true, away_score: 21, home_score: 24, at: S - 1200},
    {id: "5", team: "KC", q: 3, clock: "1:00", type: "Rush", text: "run", away_score: 21, home_score: 14, at: S - 1500},
  ];
  const ev = gameEvents(FB, st({state: "post", final: true, as: 24, hs: 21}), late, NOW);
  const msgs = compose(ev, {winner: true, final: true}, {sport: "nfl"});
  assert.deepEqual(msgs.map(m => m.title), ["KC takes the lead with 0:41 left", "Final: KC 24 – DEN 21"]);
  assert.match(msgs[1].body, /KC took the lead with 0:41 left in Q4 and held on/);
  assert.equal(isLate({q: 4, clock: "2:01"}, "nfl", "football"), false);
  assert.equal(isLate({q: 5, clock: "8:00"}, "nfl", "football"), true);                 // any overtime score
  assert.equal(isLate({q: 5, clock: "2:00"}, "nba", "hoops"), false);
});

test("basketball: lead changes only late, runs of 10+ once", () => {
  const HB = {sport: "nba", id: "77", kind: "hoops", kickoff: "2026-11-08T18:00:00Z"};
  const p = (id, q, clock, team, pts, as, hs, ago) => ({id, q, clock, team, pts, away_score: as, home_score: hs, at: S - ago, type: "Shot"});
  const ps = [                                               // newest first
    p("8", 4, "0:30", "LAL", 2, 101, 100, 20),               // late go-ahead
    p("7", 4, "1:30", "BOS", 3, 99, 100, 60),                // BOS back in front in the 4th
    p("6", 2, "4:00", "LAL", 2, 99, 97, 90),                 // a 2nd-quarter lead change: not pinged
    p("5", 2, "4:30", "LAL", 3, 97, 97, 100),
    p("4", 2, "5:00", "LAL", 3, 94, 97, 110),
    p("3", 2, "5:30", "LAL", 2, 91, 97, 120),
    p("2", 2, "6:00", "BOS", 2, 89, 97, 130),
  ].map(x => ({...x}));
  const ev = gameEvents(HB, st({away: "LAL", home: "BOS"}), ps, NOW);
  const msgs = compose(ev, ALL, {sport: "nba"}).filter(m => !m.key.endsWith(":start"));
  assert.deepEqual(msgs.map(m => m.title), ["LAL on a 10–0 run", "BOS takes the lead", "LAL takes the lead with 0:30 left"]);
  assert.equal(msgs[0].key, "ls:nba:77:run3");
  assert.equal(compose(ev, {lead: true}, {sport: "nba"}).length, 2);
  // college: halves, and the lead only counts in the last 5:00 of the 2nd
  const cb = gameEvents({...HB, sport: "cbb"}, st({away: "LAL", home: "BOS"}),
    [p("2", 2, "4:59", "LAL", 2, 52, 51, 20), p("1", 2, "9:00", "BOS", 2, 50, 51, 40), p("0", 1, "9:00", "LAL", 2, 50, 49, 60)], NOW);
  assert.deepEqual(compose(cb, {lead: true}, {sport: "cbb"}).map(m => m.body), ["LAL 52 – BOS 51 · 2nd half 4:59"]);
});

test("a person's games: tracked, a tracked prop, a parlay leg; a favorite team alone doesn't count", () => {
  const games = [
    {sport: "NFL", espn_id: "401", away: "KC", home: "DEN", date: "2026-11-08", kickoff: "2026-11-08T18:00:00Z", event: "KXNFLGAME-26NOV08KCDEN"},
    {sport: "NBA", espn_id: "77", away: "LAL", home: "BOS", date: "2026-11-08", kickoff: "2026-11-09T00:30:00Z", event: "KXNBAGAME-26NOV08LALBOS"},
    {sport: "NBA", espn_id: "78", away: "NYK", home: "MIA", date: "2026-11-08", kickoff: "2026-11-09T00:30:00Z", event: "KXNBAGAME-26NOV08NYKMIA"},
    {sport: "NBA", espn_id: "79", away: "GSW", home: "PHX", date: "2026-11-08", kickoff: "2026-11-09T03:00:00Z", event: "KXNBAGAME-26NOV08GSWPHX"},
  ];
  const ids = (u, r = {}) => mine(u, r, games).map(g => g.espn_id);
  assert.deepEqual(ids({tracked: {g: {401: 1}}}), ["401"]);
  assert.deepEqual(ids({tracked: {g: {}, p: {"LAL @ BOS|2026-11-08|LeBron James|points|25.5|OVER": 1}}}), ["77"]);
  assert.deepEqual(ids({tracked: {g: {}, parlays: {a: {legs: [{ticker: "KXNBAPTS-26NOV08NYKMIA-NYKJBRUNSON11-25"}]}, b: {removed: 1}}}}), ["78"]);
  assert.deepEqual(ids({tracked: {g: {}}}, {parlays: [{legs: [{ticker: "KXNBAGAME-26NOV08GSWPHX-GSW", side: "yes"}]}]}), ["79"]);
  assert.deepEqual(ids({prefs: {teams: {NFL: ["KC"]}}, tracked: {g: {}}}), []);
});

test("saved parlay legs ping as they settle, once, only for recent games", () => {
  const user = {tracked: {parlays: {p1: {stake: 10, legs: [
    {desc: "KC ML", mk: "ml", side: "away", ticker: "KXNFLGAME-26NOV08KCDEN-KC", kickoff: "2026-11-08T18:00:00Z"},
    {desc: "Mahomes under 2.5 TD", mk: "prop", side: "UNDER", ticker: "KXNFLPASSTDS-26NOV08KCDEN-PM3", kickoff: "2026-11-08T18:00:00Z"},
    {desc: "Old leg", ticker: "KXNFLGAME-26NOV01KCBUF-KC", kickoff: "2026-11-01T18:00:00Z"}]}}}};
  const m = (ticker, result) => ({ticker, status: "finalized", result, yes_bid_dollars: "0", yes_ask_dollars: "0"});
  const mkts = {"KXNFLGAME-26NOV08KCDEN-KC": m("KXNFLGAME-26NOV08KCDEN-KC", "yes"), "KXNFLPASSTDS-26NOV08KCDEN-PM3": m("KXNFLPASSTDS-26NOV08KCDEN-PM3", "yes"),
    "KXNFLGAME-26NOV01KCBUF-KC": m("KXNFLGAME-26NOV01KCBUF-KC", "yes")};
  const out = trackedLegs(user, mkts, priced, NOW, {});
  assert.deepEqual(out.map(x => x.title), ["Parlay leg hit: KC ML", "Parlay leg missed: Mahomes under 2.5 TD"]);
  assert.equal(trackedLegs(user, mkts, priced, NOW, {[out[0].key]: [NOW, null], [out[1].key]: [NOW, null]}).length, 0);
});

test("quiet hours wrap past midnight in the person's time zone", () => {
  const p = cleanPrefs({tz: "America/New_York", quiet: {from: 23, to: 8}});
  assert.deepEqual(p.quiet, {from: 23, to: 8});
  assert.equal(isQuiet(p, Date.parse("2026-11-08T05:00:00Z")), true);                // midnight ET
  assert.equal(isQuiet(p, Date.parse("2026-11-08T14:00:00Z")), false);               // 9 AM ET
  assert.equal(cleanPrefs({quiet: {from: 5, to: 5}}).quiet, null);
  assert.deepEqual(cleanPrefs({}).live, {start: false, half: false, lead: false, plays: false, winner: false, final: false, legs: false});
  assert.equal(cleanPrefs({live: {plays: true, bogus: true}}).live.plays, true);
});

// ---------- the checker, end to end, with a made-up ESPN summary ----------
const kv = init => { const m = new Map(Object.entries(init).map(([k, v]) => [k, JSON.stringify(v)]));
  return {m, get: async (k, t) => (m.has(k) ? (t === "json" ? JSON.parse(m.get(k)) : m.get(k)) : null), put: async (k, v) => { m.set(k, v); }}; };
const espnPlay = (id, text, type, as, hs, ago, extra = {}) => ({id, text, type: {text: type}, awayScore: as, homeScore: hs,
  period: {number: 2}, clock: {displayValue: "3:00"}, wallclock: new Date(NOW - ago * 1000).toISOString(), start: {team: {id: "1"}}, ...extra});
const summary = () => ({
  header: {competitions: [{status: {type: {state: "in", name: "STATUS_IN_PROGRESS"}}, competitors: [
    {homeAway: "away", score: "7", team: {id: "1", abbreviation: "KC"}}, {homeAway: "home", score: "3", team: {id: "2", abbreviation: "DEN"}}]}]},
  drives: {previous: [{team: {id: "1"}, plays: [
    espnPlay("a", "Kickoff", "Kickoff", 0, 0, 3000),
    espnPlay("b", "Lutz field goal is GOOD", "Field Goal Good", 0, 3, 2000, {scoringPlay: true, start: {team: {id: "2"}}}),
    espnPlay("c", "Pacheco 2 yd run (Butker extra point is GOOD)", "Rushing Touchdown", 7, 3, 60, {scoringPlay: true}),
  ]}]},
});

test("checker: a tracked game's touchdown pings once; quiet hours hold it", async () => {
  const {keys} = await vapidKeys();
  const h = "u1";
  const recOf = prefs => ({devices: [{endpoint: "https://fcm.googleapis.com/a", p256dh: "x", auth: "y"}], prefs, targets: [], parlays: [],
    since: "2026-11-01T00:00:00Z", labSeen: [], sent: {}});
  const game = {sport: "NFL", espn_id: "401", away: "KC", home: "DEN", date: "2026-11-08", kickoff: "2026-11-08T19:00:00Z", state: "in", event: "KXNFLGAME-26NOV08KCDEN"};
  const fetcher = async url => {
    url = String(url);
    if (url.includes("live/game_lines.json")) return new Response(JSON.stringify({games: [game]}));
    if (url.includes("/summary?event=401")) return new Response(JSON.stringify(summary()));
    return new Response("{}", {status: 404});
  };
  const sent = [];
  const sender = async (dev, msg, k, o) => { sent.push([msg.title, msg.body, o.urgency, o.ttl]); return 201; };
  const env = {VAPID_PRIVATE_KEY: keys.privateKey, USERS: kv({"alerts:index": {users: [h]},
    [`alerts:${h}`]: recOf(cleanPrefs({live: {plays: true, lead: true}})), [`user:${h}`]: {tracked: {g: {401: 1}}}})};
  const r1 = await run(env, {fetcher, now: NOW, sender});
  assert.equal(r1.live, 1);
  assert.deepEqual(sent, [["TOUCHDOWN! KC +7", "KC takes the lead. KC 7 – DEN 3 · Q2 3:00", "high", 600]]);
  sent.length = 0;
  await run(env, {fetcher, now: NOW + 60e3, sender});
  assert.deepEqual(sent, []);                                                         // nothing twice
  const env2 = {VAPID_PRIVATE_KEY: keys.privateKey, USERS: kv({"alerts:index": {users: [h]},
    [`alerts:${h}`]: recOf(cleanPrefs({tz: "UTC", quiet: {from: 19, to: 23}, live: {plays: true}})), [`user:${h}`]: {tracked: {g: {401: 1}}}})};
  await run(env2, {fetcher, now: NOW, sender});
  assert.deepEqual(sent, []);                                                         // 8 PM UTC is inside quiet hours
  assert.ok(FRESH_S >= 5 * 60 && PER_GAME >= 5);
});
