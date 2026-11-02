// DeVig chat: POST /api/ask {messages} answers questions about the picks with a free AI. The app sends its rules and
// the synced picks/odds/track record with the question (askContext in the app), and this adds a general
// sports-betting guide on top. Signed-in accounts only (the invite code), with a daily cap per person.
//
// Which AI, first that works:
//   0. The model on the owner's Mac (Ollama, qwen3:4b-instruct) through the DeVig gate, if LOCAL_AI_URL and
//      LOCAL_AI_KEY are set. It answers with tools (functions/lib/devig-tools.js): it looks up the game, record,
//      injuries or a slang word itself instead of reading the whole board, so a small model stays fast and on point.
//      Off, busy (one question at a time) or slow: the next AI answers instead.
//   1. Google Gemini, if GEMINI_API_KEY is set (free key from Google AI Studio; about 1,000 answers a day free)
//   2. Cloudflare Workers AI through the AI binding: a small, cheap model so the free daily allowance covers a few
//      hundred answers (AI_MODEL picks another one)
// Accuracy is "good enough": the AI answers from what it's given, and every answer ends with a reminder that AI can
// make mistakes.
//
// Needs, in the Pages project settings (see ACCOUNTS.md): the USERS KV binding and Access variables (as for /api/me)
// and either a Workers AI binding named AI or a GEMINI_API_KEY secret (or both).
import { accessUser, userKey } from "./me.js";
import { LINGO, LOCAL_GUIDE, TOOLS, runTool, splitAppMessage, termsIn } from "../lib/devig-tools.js";

// Workers AI models to try in order (names change over time; a missing one is skipped)
const CF_MODELS = ["@cf/meta/llama-3.1-8b-instruct-fast", "@cf/meta/llama-3.1-8b-instruct-fp8", "@cf/meta/llama-3.1-8b-instruct",
                   "@cf/meta/llama-3.2-3b-instruct"];
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
// Google retires model versions (the 2.5 family shut down 2026-10-16), so try the always-current alias first and
// named versions after it; a model that's gone (404/400) just moves on to the next one
const GEMINI_MODELS = ["gemini-flash-lite-latest", "gemini-flash-latest", "gemini-3.5-flash"];
const PER_DAY = 50;                // questions per person per day
const MAX_BODY = 60000;            // bytes of question + app data
const MAX_TOKENS = 700;
const LOCAL_MODEL = "qwen3:4b-instruct";
const LOCAL_BUDGET = 60_000;        // the Mac gets this long for the whole answer, tools included
const LOCAL_ROUNDS = 4;             // tool rounds before it must answer

export const BETTING_GUIDE = [
  "GENERAL SPORTS-BETTING KNOWLEDGE (use it to explain; label it as general, not as the app's data):",
  "- Odds and probability: -150 needs a 60% win rate to break even, +150 needs 40%. Break-even = risk / (risk + win).",
  "- The vig (juice): both sides of a market add up to more than 100%; removing it gives the fair (no-vig) chance. -110/-110 means each side needs 52.4%.",
  "- A pick that wins often can still lose money if the price is too steep; value = your chance minus the break-even chance.",
  "- Closing line value: getting a better number than the final line before kickoff is the best known sign of a good bettor; most bettors lose to the closing line.",
  "- Line shopping: the same bet pays differently at different books and exchanges (Kalshi, Polymarket); a half point or 10 cents matters over many bets.",
  "- Key numbers: in the NFL, games land most often on margins of 3 and 7 (then 10, 6, 4, 14), so moving a spread across 3 or 7 is worth more than other half points. NBA and MLB margins have no strong key numbers like that.",
  "- Parlays multiply the house edge with every leg; same-game legs are often correlated and priced against you. Teasers only make sense when they cross key numbers (the classic one: NFL underdogs +1.5 to +2.5 teased through 3 and 7).",
  "- Player props: books shade popular overs; lines move on injury and lineup news; a player's recent games are noisy and regress toward their average.",
  "- Small samples lie: 10-20 picks can't show skill; even hundreds can be luck. Past results don't guarantee future ones.",
  "- Common traps: chasing losses, betting more after wins, trusting 'locks', and stories about trends that weren't tested.",
  "- Betting is entertainment with an expected loss. If it stops being fun or someone can't stop, the US helpline is 1-800-GAMBLER.",
  "Bettor lingo (read questions the way a bettor means them): " +
    Object.entries(LINGO).map(([k, v]) => `${k.split(" / ")[0].toUpperCase()} = ${v}`).join(" "),
  "Work out exactly what the user means in betting terms and answer that specific thing from the game's data.",
  "Never tell anyone how much to bet or that something is guaranteed. Keep answers short; the user is on a phone.",
  "Answer with what you have, even if it's incomplete, and say what's missing. End every answer with this line on its own: " +
  "\"AI can make mistakes, so double-check before betting.\"",
].join("\n");

// The Mac: Ollama's /api/chat through the gate, with tools. The app's data stays here; the model asks for the part it
// needs. Returns the answer text, or null to fall through to the cloud AIs.
export async function askLocal(msgs, env, fetcher = fetch, budget = LOCAL_BUDGET) {
  if (!env.LOCAL_AI_URL || !env.LOCAL_AI_KEY) return null;
  const first = splitAppMessage(msgs[0].content);
  const app = first ? first.app : null;
  const convo = msgs.map((m, i) => (i === 0 && first ? {role: "user", content: first.question} : m));
  const today = app && app.now ? `Now: ${app.now}.` : "";
  const terms = termsIn(convo[convo.length - 1].content);
  const said = terms.length ? `\nBettor terms in this question:\n${terms.join("\n")}` : "";
  const messages = [{role: "system", content: `${LOCAL_GUIDE}\n${today}${said}`}, ...convo];
  const end = Date.now() + budget;
  for (let round = 0; round <= LOCAL_ROUNDS; round++) {
    const left = end - Date.now();
    if (left < 2000) return null;
    let d;
    try {
      const r = await fetcher(`${env.LOCAL_AI_URL.replace(/\/$/, "")}/api/chat`, {method: "POST",
        headers: {"content-type": "application/json", authorization: "Bearer " + env.LOCAL_AI_KEY},
        body: JSON.stringify({model: env.LOCAL_CHAT_MODEL || LOCAL_MODEL, messages, stream: false, think: false,
          tools: round < LOCAL_ROUNDS ? TOOLS : undefined, options: {temperature: 0.3, num_ctx: 8192, num_predict: MAX_TOKENS}}),
        signal: AbortSignal.timeout(left)});
      if (!r.ok) return null;                       // busy (503), off, or a bad key: the cloud answers
      d = await r.json();
    } catch (e) { return null; }
    const m = d && d.message;
    if (!m) return null;
    const calls = Array.isArray(m.tool_calls) ? m.tool_calls : [];
    if (!calls.length) return typeof m.content === "string" && m.content.trim() ? m.content.trim() : null;
    messages.push({role: "assistant", content: m.content || "", tool_calls: calls});
    for (const c of calls.slice(0, 3)) {
      const f = c.function || {};
      let args = f.arguments;
      if (typeof args === "string") { try { args = JSON.parse(args); } catch (e) { args = {}; } }
      const out = await runTool(f.name, args, {app, env, fetcher});
      messages.push({role: "tool", tool_name: f.name, content: JSON.stringify(out).slice(0, 6000)});
    }
  }
  return null;
}

// one finished answer as the same OpenAI-style stream the app already reads
function sseText(text) {
  return `data: ${JSON.stringify({choices: [{delta: {content: text}}]})}\n\ndata: [DONE]\n\n`;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {status, headers: {"content-type": "application/json", "cache-control": "no-store"}});
}

export async function handle(request, env, fetcher = fetch) {
  if (request.method !== "POST") return json({error: "method not allowed"}, 405);
  if (!env.AI && !env.GEMINI_API_KEY && !env.LOCAL_AI_URL) return json({error: "chat isn't switched on yet", code: "off"}, 503);
  if (!env.USERS) return json({error: "accounts aren't switched on yet", code: "off"}, 503);
  const email = await accessUser(request, env, fetcher);
  if (!email) return json({error: "sign in to chat", code: "account"}, 401);
  const key = await userKey(email);
  const rec = await env.USERS.get(key, "json");
  if (!rec || !rec.joined_at) return json({error: "open your account with the invite code to chat", code: "account"}, 403);

  const text = await request.text();
  if (text.length > MAX_BODY) return json({error: "question too long"}, 413);
  let body;
  try { body = JSON.parse(text); } catch (e) { return json({error: "not JSON"}, 400); }
  const msgs = (Array.isArray(body && body.messages) ? body.messages : []).filter(m =>
    m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-12)
    .map(m => ({role: m.role, content: m.content.slice(0, 55000)}));
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return json({error: "no question"}, 400);

  const day = new Date().toISOString().slice(0, 10), countKey = "ask:" + key.slice(5) + ":" + day;
  const used = Number(await env.USERS.get(countKey)) || 0;
  if (used >= PER_DAY) return json({error: `that's today's ${PER_DAY} questions; more tomorrow`, code: "limit"}, 429);
  await env.USERS.put(countKey, String(used + 1), {expirationTtl: 2 * 86400});

  const messages = [{role: "system", content: BETTING_GUIDE}, ...msgs];
  const sse = body => new Response(body, {headers: {"content-type": "text/event-stream", "cache-control": "no-store"}});
  let quota = false;

  const local = await askLocal(msgs, env, fetcher);
  if (local) return sse(sseText(local));

  if (env.GEMINI_API_KEY) {                       // OpenAI-style stream: data: {"choices":[{"delta":{"content":...}}]}
    const models = env.GEMINI_MODEL ? [env.GEMINI_MODEL, ...GEMINI_MODELS] : GEMINI_MODELS;
    for (const model of models) {
      try {
        // Gemini 3 models think first and the thinking counts against max_tokens: keep it low and leave room for it
        const r = await fetcher(GEMINI_URL, {method: "POST", headers: {"content-type": "application/json", authorization: "Bearer " + env.GEMINI_API_KEY},
          body: JSON.stringify({model, messages, max_tokens: MAX_TOKENS + 1500, reasoning_effort: "low", temperature: 0.4, stream: true})});
        if (r.ok && r.body) return sse(r.body);
        if (r.status === 429) { quota = true; break; }
        if (r.status !== 404 && r.status !== 400) break;
      } catch (e) { break; }
    }
  }
  if (env.AI) {                                   // Workers AI stream: data: {"response":...}
    const models = env.AI_MODEL ? [env.AI_MODEL, ...CF_MODELS] : CF_MODELS;
    for (const model of models) {
      try {
        return sse(await env.AI.run(model, {messages, max_tokens: MAX_TOKENS, temperature: 0.4, stream: true}));
      } catch (e) {
        const msg = String(e && e.message || e);
        if (/limit|quota|neuron|429|capacity/i.test(msg)) { quota = true; break; }
        // anything else (e.g. a model that no longer exists): try the next one
      }
    }
  }
  return json({error: quota ? "the free AI has used up today's answers; try again tomorrow" : "the AI couldn't answer right now",
               code: quota ? "quota" : "ai"}, quota ? 429 : 502);
}

export async function onRequest(context) {
  return handle(context.request, context.env);
}
