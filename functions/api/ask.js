// DeVig chat: POST /api/ask {messages} answers questions about the picks with a free AI. The app sends its rules and
// the synced picks/odds/track record with the question (askContext in the app), and this adds a general
// sports-betting guide on top. Signed-in accounts only (the invite code), with a daily cap per person.
//
// Which AI, first that works:
//   1. Google Gemini, if GEMINI_API_KEY is set (free key from Google AI Studio; about 1,000 answers a day free)
//   2. Cloudflare Workers AI through the AI binding: a small, cheap model so the free daily allowance covers a few
//      hundred answers (AI_MODEL picks another one)
// Accuracy is "good enough": the AI answers from what it's given, and every answer ends with a reminder that AI can
// make mistakes.
//
// Needs, in the Pages project settings (see ACCOUNTS.md): the USERS KV binding and Access variables (as for /api/me)
// and either a Workers AI binding named AI or a GEMINI_API_KEY secret (or both).
import { accessUser, userKey } from "./me.js";

// Workers AI models to try in order (names change over time; a missing one is skipped)
const CF_MODELS = ["@cf/meta/llama-3.1-8b-instruct-fast", "@cf/meta/llama-3.1-8b-instruct-fp8", "@cf/meta/llama-3.1-8b-instruct",
                   "@cf/meta/llama-3.2-3b-instruct"];
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const GEMINI_MODEL = "gemini-2.5-flash-lite";
const PER_DAY = 50;                // questions per person per day
const MAX_BODY = 60000;            // bytes of question + app data
const MAX_TOKENS = 700;

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
  "Never tell anyone how much to bet or that something is guaranteed. Keep answers short; the user is on a phone.",
  "Answer with what you have, even if it's incomplete, and say what's missing. End every answer with this line on its own: " +
  "\"AI can make mistakes, so double-check before betting.\"",
].join("\n");

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {status, headers: {"content-type": "application/json", "cache-control": "no-store"}});
}

export async function handle(request, env, fetcher = fetch) {
  if (request.method !== "POST") return json({error: "method not allowed"}, 405);
  if (!env.AI && !env.GEMINI_API_KEY) return json({error: "chat isn't switched on yet", code: "off"}, 503);
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

  if (env.GEMINI_API_KEY) {                       // OpenAI-style stream: data: {"choices":[{"delta":{"content":...}}]}
    try {
      const r = await fetcher(GEMINI_URL, {method: "POST", headers: {"content-type": "application/json", authorization: "Bearer " + env.GEMINI_API_KEY},
        body: JSON.stringify({model: env.GEMINI_MODEL || GEMINI_MODEL, messages, max_tokens: MAX_TOKENS, temperature: 0.4, stream: true})});
      if (r.ok && r.body) return sse(r.body);
      if (r.status === 429) quota = true;
    } catch (e) {}
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
