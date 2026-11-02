// Ask's lookup tools (functions/lib/devig-tools.js), the Mac model's tool loop (askLocal in functions/api/ask.js) and
// the public MCP server (functions/api/mcp.js).
import test from "node:test";
import assert from "node:assert/strict";
import { runTool, splitAppMessage, termsIn, TOOLS } from "../../functions/lib/devig-tools.js";
import { askLocal } from "../../functions/api/ask.js";
import { answer } from "../../functions/api/mcp.js";

const APP = {now: "2026-11-02T20:00:00Z", models: {NFL: "NFL Model 2.0"}, games: [
  {sport: "NFL", game: "BUF at KC", teams: "Buffalo Bills at Kansas City Chiefs", devig_pick: {action: "ML", side: "KC"}},
  {sport: "NBA", game: "TOR at LAL", teams: "Toronto Raptors at Los Angeles Lakers", devig_pick: {action: "PASS"}},
], record: [{sport: "NFL", won: 31, lost: 17, units: 2.4}, {sport: "NBA", won: 5, lost: 5, units: -0.3}],
  injuries: ["NFL BUF at KC: Joe Doe (BUF) Out"]};
const first = q => `RULES:\nr\n\nAPP DATA (JSON):\n${JSON.stringify(APP)}\n\nQUESTION: ${q}`;

const PROPS = {docs: [
  {collection: "props_model_report", data: {wins: 358, paper_picks_graded: 709, roi: 0.0193, backtest: "Kalshi was more right."}},
  {collection: "props_model", data: {game_key: "g", away_team: "TOR", home_team: "LAC", kickoff_time: "2026-11-03T03:00:00Z",
    paper_picks: [], rows: [
      {player: "Scottie Barnes", stat: "points", line: 24.5, k: {bid: 0.41, ask: 0.42}, model_p: 0.4486, expected: 23.99, n_games: 378, injury: "Day-To-Day"},
      {player: "Scottie Barnes", stat: "rebounds", line: 7.5, k: {bid: 0.5, ask: 0.52}, model_p: 0.5},
      {player: "Harrison Barnes", stat: "points", line: 9.5, k: {bid: 0.5, ask: 0.55}, model_p: 0.5},
    ]}},
]};
const web = async url => {
  if (String(url).includes("nba/props_model_export.json")) return new Response(JSON.stringify(PROPS));
  return new Response("{}", {status: 404});
};

test("the app's data block splits from the question", () => {
  const s = splitAppMessage(first("why KC?"));
  assert.equal(s.question, "why KC?");
  assert.equal(s.app.games.length, 2);
  assert.equal(splitAppMessage("just a question"), null);
});

test("bettor slang in a question comes with its meaning", () => {
  const t = termsIn("is the bills -3 a good spot or should I tease them, whats clv");
  assert.ok(t.some(x => x.startsWith("TEASER")));
  assert.ok(t.some(x => x.startsWith("CLV")));
  assert.deepEqual(termsIn("who wins tonight"), []);
});

test("find_games matches a nickname and survives a wrong sport guess", async () => {
  const r = await runTool("find_games", {team: "chiefs", sport: "basketball"}, {app: APP});
  assert.equal(r.count, 1);
  assert.equal(r.games[0].game, "BUF at KC");
  assert.equal((await runTool("find_games", {team: "Jets"}, {app: APP})).count, 0);
});

test("track record and injuries read the app's data", async () => {
  assert.equal((await runTool("track_record", {sport: "football"}, {app: APP})).record[0].won, 31);
  assert.equal((await runTool("injuries", {team: "Bills"}, {app: APP})).injuries.length, 1);
});

test("player props: a misspelled name finds the right player and Kalshi's price", async () => {
  const r = await runTool("player_props", {player: "Scottie barns", stat: "pts"}, {fetcher: web});
  assert.equal(r.player, "Scottie Barnes");
  assert.equal(r.lines.length, 1);
  assert.equal(r.lines[0].bet, "25+ points");
  assert.equal(r.lines[0].kalshi_yes_cost_cents, 42);
  assert.equal(r.lines[0].devig_props_model_chance, 0.4486);
  assert.equal(r.injury, "Day-To-Day");
  assert.match(r.how_the_props_model_does, /358 of 709/);
});

test("web search is off without a key, and calls Ollama's search with one", async () => {
  assert.match((await runTool("web_search", {query: "x"}, {})).note, /isn't switched on/);
  let seen;
  const f = async (url, init) => { seen = {url, auth: init.headers.authorization};
    return new Response(JSON.stringify({results: [{title: "T", url: "https://x", content: "news"}]})); };
  const r = await runTool("web_search", {query: "Barnes injury"}, {env: {OLLAMA_API_KEY: "k"}, fetcher: f});
  assert.equal(seen.url, "https://ollama.com/api/web_search");
  assert.equal(seen.auth, "Bearer k");
  assert.equal(r.results[0].text, "news");
});

test("askLocal: the Mac model calls a tool, gets the app's data, then answers", async () => {
  const sent = [];
  const f = async (url, init) => {
    const body = JSON.parse(init.body);
    sent.push({url, body});
    if (sent.length === 1) return new Response(JSON.stringify({message: {role: "assistant", content: "",
      tool_calls: [{function: {name: "find_games", arguments: {team: "Chiefs"}}}]}}));
    return new Response(JSON.stringify({message: {role: "assistant", content: "KC is DeVig's pick."}}));
  };
  const a = await askLocal([{role: "user", content: first("why does the model like the chiefs ML?")}],
    {LOCAL_AI_URL: "https://mac.example/", LOCAL_AI_KEY: "key"}, f);
  assert.equal(a, "KC is DeVig's pick.");
  assert.equal(sent[0].url, "https://mac.example/api/chat");
  assert.equal(sent[0].body.model, "qwen3:4b-instruct");
  assert.equal(sent[0].body.think, false);
  assert.equal(sent[0].body.messages[1].content, "why does the model like the chiefs ML?");   // the board stays here
  assert.match(sent[0].body.messages[0].content, /ML: bet on a team to win/);               // slang explained up front
  const tool = sent[1].body.messages.at(-1);
  assert.equal(tool.role, "tool");
  assert.match(tool.content, /BUF at KC/);
});

test("askLocal falls through when the Mac is off, busy or unset", async () => {
  const q = [{role: "user", content: "hi"}];
  assert.equal(await askLocal(q, {}, async () => { throw new Error("no"); }), null);
  assert.equal(await askLocal(q, {LOCAL_AI_URL: "https://m", LOCAL_AI_KEY: "k"}, async () => new Response("{}", {status: 503})), null);
  assert.equal(await askLocal(q, {LOCAL_AI_URL: "https://m", LOCAL_AI_KEY: "k"}, async () => { throw new Error("offline"); }), null);
});

test("MCP: initialize, list the public tools, call one", async () => {
  const init = await answer({jsonrpc: "2.0", id: 1, method: "initialize", params: {protocolVersion: "2025-06-18"}});
  assert.equal(init.result.serverInfo.name, "devig");
  const list = await answer({jsonrpc: "2.0", id: 2, method: "tools/list"});
  const names = list.result.tools.map(t => t.name);
  assert.ok(names.includes("find_games") && names.includes("player_props") && names.includes("explain_term"));
  assert.ok(!names.includes("web_search"));
  const call = await answer({jsonrpc: "2.0", id: 3, method: "tools/call", params: {name: "explain_term", arguments: {term: "juice"}}});
  assert.match(call.result.content[0].text, /bookmaker's cut/);
  assert.equal((await answer({jsonrpc: "2.0", id: 4, method: "tools/call", params: {name: "web_search"}})).error.code, -32602);
  assert.equal(await answer({jsonrpc: "2.0", method: "notifications/initialized"}), null);
  assert.ok(TOOLS.length >= 6);
});
