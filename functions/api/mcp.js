// DeVig MCP server: POST /api/mcp speaks the Model Context Protocol (Streamable HTTP, JSON responses), so an AI app
// like Claude Desktop or Ollama-based agents can read DeVig's board with the same tools Ask uses
// (functions/lib/devig-tools.js). Read-only, public data only (the board the site already shows to everyone).
// web_search is left out here: it spends DeVig's quota. Add it to a client as a remote MCP server:
//   https://devigai.pages.dev/api/mcp
import { TOOLS, runTool } from "../lib/devig-tools.js";

const VERSION = "2025-06-18";
const PUBLIC = TOOLS.filter(t => !["web_search", "track_record", "injuries"].includes(t.function.name));
const HEADERS = {"content-type": "application/json", "cache-control": "no-store", "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, mcp-protocol-version, mcp-session-id"};

const reply = (id, result) => ({jsonrpc: "2.0", id, result});
const fail = (id, code, message) => ({jsonrpc: "2.0", id: id ?? null, error: {code, message}});

export async function answer(msg, fetcher = fetch) {
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return fail(msg && msg.id, -32600, "invalid request");
  const {id, method, params = {}} = msg;
  if (id === undefined) return null;                                 // a notification: nothing to send back
  if (method === "initialize") {
    return reply(id, {protocolVersion: params.protocolVersion || VERSION, capabilities: {tools: {}},
      serverInfo: {name: "devig", version: "1.0.0"},
      instructions: "DeVig's sports odds board: Kalshi prices, spreads and totals by game, plus a betting glossary. Information only, never a bet."});
  }
  if (method === "ping") return reply(id, {});
  if (method === "tools/list") {
    return reply(id, {tools: PUBLIC.map(t => ({name: t.function.name, description: t.function.description, inputSchema: t.function.parameters}))});
  }
  if (method === "tools/call") {
    if (!PUBLIC.some(t => t.function.name === params.name)) return fail(id, -32602, `unknown tool ${params.name}`);
    const out = await runTool(params.name, params.arguments, {fetcher});
    return reply(id, {content: [{type: "text", text: JSON.stringify(out)}], isError: !!out.error});
  }
  return fail(id, -32601, `method not found: ${method}`);
}

export async function handle(request, fetcher = fetch) {
  if (request.method === "OPTIONS") return new Response(null, {status: 204, headers: HEADERS});
  if (request.method !== "POST") return new Response(JSON.stringify(fail(null, -32000, "POST JSON-RPC to this address")), {status: 405, headers: HEADERS});
  const text = await request.text();
  if (text.length > 20000) return new Response(JSON.stringify(fail(null, -32600, "too big")), {status: 413, headers: HEADERS});
  let body;
  try { body = JSON.parse(text); } catch (e) { return new Response(JSON.stringify(fail(null, -32700, "not JSON")), {status: 400, headers: HEADERS}); }
  const batch = Array.isArray(body);
  const outs = (await Promise.all((batch ? body.slice(0, 10) : [body]).map(m => answer(m, fetcher)))).filter(Boolean);
  if (!outs.length) return new Response(null, {status: 202, headers: HEADERS});
  return new Response(JSON.stringify(batch ? outs : outs[0]), {headers: HEADERS});
}

export async function onRequest(context) {
  return handle(context.request);
}
