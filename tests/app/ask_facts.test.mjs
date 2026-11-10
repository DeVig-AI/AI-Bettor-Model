// Ask's worked-out facts (functions/lib/ask-facts.js): a player's game log against tonight's lines, past Kalshi prices,
// streaks, two teams side by side, and Gemini's tool loop (askGemini in functions/api/ask.js).
import test from "node:test";
import assert from "node:assert/strict";
import { runTool } from "../../functions/lib/devig-tools.js";
import { askGemini } from "../../functions/api/ask.js";
import { ladderFact, lineWords } from "../../functions/lib/ask-facts.js";

const LATER = "2099-01-01T00:00:00Z";
const NBA_IDX = {log_cols: ["date", "opp", "ha", "min", "pts", "reb", "season"],
  hit_stats: [["points", "Points", ["pts"]], ["rebounds", "Rebounds", ["reb"]]],
  teams: [{code: "GSW", name: "Golden State Warriors", rank: 10, rating: 3.2}, {code: "NOP", name: "New Orleans Pelicans", rank: 25, rating: -4}]};
// newest first; one DNP (0 min) that must not count; the last two games are last season
const pts = [20, 25, 18, 30, 22, 19, 21, 24, 26, 18, 9, 11];
const LOG = pts.map((p, i) => [`2026-11-${String(20 - i).padStart(2, "0")}`, "X", "H", 30, p, 4, i < 10 ? 2027 : 2026]);
LOG.splice(3, 0, ["2026-11-16", "X", "H", 0, 0, 0, 2027]);
const GSW = {code: "GSW", name: "Golden State Warriors", this: {gp: 10, record: "7-3", margin: 5, oppg: 113, pace: 103},
  ranks: {drtg: 14}, games: [], players: [{id: 1, name: "Stephen Curry", this: {gp: 10, min: 30}, log: LOG}]};
const NOP = {code: "NOP", name: "New Orleans Pelicans", this: {gp: 10, record: "4-6", margin: -6, oppg: 120.8, pace: 107.1},
  ranks: {drtg: 22}, games: [], players: []};
const LADDER = {min_n: 100, sports: {NBA: {seasons: ["2025-26"], table: {over: {all: {"6": {n: 5196, paid: 0.6575, hit: 0.6207}},
  points: {"6": {n: 50, paid: 0.66, hit: 0.7}}}}}}};
const STREAKS = {sports: {NBA: {rungs: 1305, hit: 0.8628, kalshi: 0.8745, diff_95: [-0.0294, 0.0059], seasons: ["2025-26"]}}};
const EXPORT = {docs: [{collection: "props_model", data: {away_team: "NOP", home_team: "GSW", kickoff_time: LATER, paper_picks: [], rows: [
  {player: "Stephen Curry", stat: "points", line: 17.5, k: {bid: 0.62, ask: 0.66}, model_p: 0.7},
  {player: "Stephen Curry", stat: "points", line: 24.5, k: {bid: 0.3, ask: 0.34}, model_p: 0.35},
]}}]};
const FILES = {"nba/props_model_export.json": EXPORT, "stats/nba/index.json": NBA_IDX, "stats/nba/team_GSW.json": GSW,
  "stats/nba/team_NOP.json": NOP, "stats/props_ladder.json": LADDER, "stats/props_streaks.json": STREAKS,
  "live/game_lines.json": {games: [{sport: "NBA", away: "NOP", home: "GSW", ml: {away: 150, home: -180}, home_wp: 0.62,
    spread: {home_point: -4.5}}]}};
const asked = [];
const web = async url => {
  const path = String(url).split("/main/")[1];
  asked.push(path);
  return FILES[path] ? new Response(JSON.stringify(FILES[path])) : new Response("{}", {status: 404});
};

test("Kalshi's N+ lines read as N+, other lines as over", () => {
  assert.deepEqual(lineWords("points", 17.5), {bet: "18+ points", need: 18});
  assert.equal(lineWords("total", 220).bet, "over 220 total");
});

test("player props: hit counts from his played games, this season apart, a sentence that says it", async () => {
  const r = await runTool("player_props", {player: "Stephen Curry", stat: "points"}, {fetcher: web});
  assert.equal(r.team, "GSW");
  assert.equal(r.opponent.team, "NOP");
  assert.equal(r.opponent.defense_rank, 22);
  const rec = r.recent.points;
  assert.deepEqual(rec.last_games_oldest_first, [...pts.slice(0, 10)].reverse());   // the DNP is skipped
  assert.equal(rec.avg_last10, 22.3);
  assert.equal(rec.avg_before_last10, 10);
  const [a, b] = r.lines;
  assert.equal(a.bet, "18+ points");
  assert.equal(a.hit_last10, "10 of 10");
  assert.equal(a.hit_this_season, "10 of 10");
  assert.equal(b.bet, "25+ points");
  assert.equal(b.hit_last10, "3 of 10");
  assert.match(a.says, /reached 18\+ points in 10 of his last 10 games/);
  assert.match(a.says, /Kalshi has it at 64% \(-194 to buy yes\)/);
  assert.match(a.says, /well above the line/);
  assert.match(b.says, /a little below the line/);
  assert.match(b.says, /He hit it 30% of those games, close to Kalshi's 32%/);
  // too few points lines at that price: falls back to all props
  assert.match(a.past_lines_at_this_price, /\(all props\).*cost 66%.*hit 62% \(5,196 lines/);
  assert.match(a.past_lines_at_this_price, /less often than the price said/);
  // a 10-for-10 line brings what past streaks did
  assert.ok(r.facts.some(f => /hit 10 games in a row hit the next one 86%.*Kalshi had it at 87%.*already in the price/.test(f)));
  assert.ok(!r.facts.some(f => /has started/.test(f)));
});

test("each stats file is fetched once per question", async () => {
  asked.length = 0;
  await runTool("player_props", {player: "Stephen Curry"}, {fetcher: web});
  assert.equal(asked.length, new Set(asked).size);
});

test("a started game says its prices are live; a near-certain price isn't explained by the ladder", async () => {
  const live = structuredClone(EXPORT);
  live.docs[0].data.kickoff_time = "2020-01-01T00:00:00Z";
  live.docs[0].data.rows[0].k = {bid: 0.99, ask: 1};
  const f = async url => String(url).includes("props_model_export") && String(url).includes("nba")
    ? new Response(JSON.stringify(live)) : web(url);
  const r = await runTool("player_props", {player: "Stephen Curry", stat: "points"}, {fetcher: f});
  assert.ok(r.facts.some(x => /has started: Kalshi's prices are live/.test(x)));
  assert.equal(r.lines[0].note, "Kalshi has this as all but decided.");
  assert.equal(r.lines[0].past_lines_at_this_price, undefined);
});

test("ladder fact needs enough lines, and says when the price was about right", () => {
  const L = {min_n: 100, sports: {NBA: {seasons: ["s"], table: {over: {all: {"3": {n: 99, paid: 0.3, hit: 0.3}}, x: {"5": {n: 500, paid: 0.55, hit: 0.555}}}}}}};
  assert.equal(ladderFact(L, "NBA", "points", 0.35), null);
  assert.match(ladderFact({...L, sports: {NBA: {seasons: ["s"], table: {over: {all: {"5": {n: 500, paid: 0.55, hit: 0.555}}}}}}}, "NBA", "x", 0.55),
    /about as often as the price said/);
  assert.equal(ladderFact(L, "NFL", "points", 0.5), null);
});

test("team stats: two teams side by side, ratings in words, the board's line, nicknames without the app", async () => {
  const r = await runTool("team_stats", {team: "Warriors vs Pelicans"}, {fetcher: web});
  assert.equal(r.game_line.game, "NOP at GSW");
  const c = r.compare.join("\n");
  assert.match(c, /Records: GSW 7-3, NOP 4-6/);
  assert.match(c, /GSW rates 10th of 2, 3.2 points a game better than an average team; NOP rates 25th of 2, 4 points a game worse/);
  assert.match(c, /So GSW is about 7.2 points a game better than NOP/);
  assert.match(c, /NOP's rating \(-4\) is better than its margin \(-6\) because it has played stronger opponents/);
  assert.match(c, /GSW is the favorite at 62% with Kalshi's fee removed/);
  assert.match(c, /Only about 10 games each/);
  const one = await runTool("team_stats", {team: "Pelicans"}, {fetcher: web});
  assert.equal(one.team, "NOP");
  assert.match(one.facts[0], /are 4-6 and are outscored by opponents by 6 points a game/);
  const g = await runTool("find_games", {team: "Warriors"}, {fetcher: web});
  assert.equal(g.count, 1);
});

test("askGemini: looks a player up, sends the result back with its call id, then answers", async () => {
  const sent = [];
  const f = async (url, init) => {
    if (!String(url).includes("generativelanguage")) return web(url);
    const body = JSON.parse(init.body);
    sent.push(body);
    if (sent.length === 1) return new Response(JSON.stringify({choices: [{message: {role: "assistant", content: null,
      tool_calls: [{id: "c1", type: "function", function: {name: "player_props", arguments: "{\"player\":\"Curry\",\"stat\":\"points\"}"},
        extra_content: {google: {thought_signature: "sig"}}}]}}]}));
    return new Response(JSON.stringify({choices: [{message: {role: "assistant", content: "He's hit 18+ in 10 of 10."}}]}));
  };
  const a = await askGemini([{role: "system", content: "s"}, {role: "user", content: "why is curry 18+ so pricey"}], null,
    "gemini-flash-latest", {GEMINI_API_KEY: "k"}, f);
  assert.equal(a.text, "He's hit 18+ in 10 of 10.");
  assert.ok(sent[0].tools.some(t => t.function.name === "team_stats"));
  const back = sent[1].messages;
  assert.equal(back.at(-2).tool_calls[0].extra_content.google.thought_signature, "sig");   // Gemini 3 needs it back
  assert.equal(back.at(-1).role, "tool");
  assert.equal(back.at(-1).tool_call_id, "c1");
  assert.match(back.at(-1).content, /10 of 10/);
});

test("askGemini: out of quota, a missing model, and a broken answer", async () => {
  const msgs = [{role: "user", content: "hi"}];
  const env = {GEMINI_API_KEY: "k"};
  assert.deepEqual(await askGemini(msgs, null, "m", env, async () => new Response("{}", {status: 429})), {quota: true});
  assert.equal(await askGemini(msgs, null, "m", env, async () => new Response("{}", {status: 404})), null);
  // rejects the tools: asks again without them
  const bodies = [];
  const f = async (u, init) => { const b = JSON.parse(init.body); bodies.push(b);
    return b.tools ? new Response("{}", {status: 400}) : new Response(JSON.stringify({choices: [{message: {content: "ok"}}]})); };
  assert.deepEqual(await askGemini(msgs, null, "m", env, f), {text: "ok"});
  assert.equal(bodies.length, 2);
  assert.deepEqual(await askGemini(msgs, null, "m", env, async () => new Response("{}", {status: 500})), {fail: true});
});
