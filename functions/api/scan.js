// DeVig screenshot reader: POST /api/scan {image: "data:image/jpeg;base64,..."} reads a screenshot of a bet slip or
// odds screen (any sportsbook, Kalshi, a parlay) and returns the legs it can see, as JSON:
//   {book, legs: [{sport, away, home, market, side, point, odds}], total_odds, stake, payout, notes}
// The app then matches the legs to today's games and does the math. The classic app did this with Claude inside
// claude.ai; on the site it uses the same free AI as Ask (/api/ask), so the same account rule and keys apply:
//   1. Google Gemini, if GEMINI_API_KEY is set (reads images well)
//   2. Cloudflare Workers AI through the AI binding (a vision model; weaker, used when Gemini isn't set up or is out)
// Signed-in accounts only (the invite code), with a daily cap per person. The image isn't stored.
import { accessUser, userKey } from "./me.js";

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const GEMINI_MODEL = "gemini-2.5-flash";
const CF_VISION = ["@cf/meta/llama-3.2-11b-vision-instruct"];
const PER_DAY = 20;                     // screenshots per person per day
const MAX_BODY = 4_000_000;             // the app shrinks photos to about 1600px JPEG first (~300 KB)
const IMAGE = /^data:image\/(jpeg|png|webp|gif);base64,([A-Za-z0-9+/=]+)$/;
const MARKETS = new Set(["moneyline", "spread", "total", "prop", "other"]);

export const PROMPT = [
  "You are reading a screenshot of a sports bet: a sportsbook or Kalshi bet slip, a parlay, or an odds screen.",
  "Reply with ONLY a JSON object of this exact shape, nothing else:",
  '{"book": string|null, "legs": [{"sport": string|null, "away": string|null, "home": string|null, ' +
  '"market": "moneyline"|"spread"|"total"|"prop"|"other", "side": string, "point": number|null, "odds": number|null}], ' +
  '"total_odds": number|null, "stake": number|null, "payout": number|null, "notes": string}',
  "One leg per selection. \"side\" is what was picked, as shown (a team name or abbreviation, \"Over\", \"Under\", or a player and stat).",
  "\"away\" and \"home\" are the two teams of that leg's game if shown (\"A @ B\" or \"A at B\" means A is away; \"A vs B\" with no other sign: A away).",
  "\"odds\" is that leg's American odds as a signed integer (-110, 145). Kalshi shows cents: 62¢ means a 62% price; write it as American odds (-163).",
  "\"total_odds\" is the whole parlay's American odds if shown; \"stake\" and \"payout\" are dollar amounts if shown.",
  "Only include a number you can actually read on the image; never guess. Use null for anything you can't read.",
  "If nothing is legible, return \"legs\": [] and say why in \"notes\".",
].join("\n");

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {status, headers: {"content-type": "application/json", "cache-control": "no-store"}});
}

// the AI's answer -> the first JSON object in it, or null
export function parseAnswer(text) {
  const s = String(text || "").replace(/```(?:json)?/gi, "");
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { return null; }
}

const num = v => (typeof v === "number" && isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && isFinite(+v.replace(/[,$+]/g, "")) ? +v.replace(/[,$]/g, "") : null);
const str = (v, n = 80) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
// American odds are at least 100 away from zero; anything else isn't readable odds
const odds = v => { const n = num(v); return n != null && Math.abs(n) >= 100 && Math.abs(n) < 1e6 ? Math.round(n) : null; };

// keep only well-formed legs and fields, so the app never shows something the AI made up in the wrong shape
export function clean(d) {
  if (!d || typeof d !== "object") return null;
  const legs = (Array.isArray(d.legs) ? d.legs : []).slice(0, 25).map(l => l && typeof l === "object" ? {
    sport: str(l.sport, 12),
    away: str(l.away, 40),
    home: str(l.home, 40),
    market: MARKETS.has(l.market) ? l.market : "other",
    side: str(l.side, 80),
    point: num(l.point),
    odds: odds(l.odds),
  } : null).filter(l => l && l.side);
  return {book: str(d.book, 40), legs, total_odds: odds(d.total_odds), stake: num(d.stake), payout: num(d.payout),
          notes: str(d.notes, 300) || ""};
}

export async function handle(request, env, fetcher = fetch) {
  if (request.method !== "POST") return json({error: "method not allowed"}, 405);
  if (!env.AI && !env.GEMINI_API_KEY) return json({error: "screenshot reading isn't switched on yet", code: "off"}, 503);
  if (!env.USERS) return json({error: "accounts aren't switched on yet", code: "off"}, 503);
  const email = await accessUser(request, env, fetcher);
  if (!email) return json({error: "sign in to read screenshots", code: "account"}, 401);
  const key = await userKey(email);
  const rec = await env.USERS.get(key, "json");
  if (!rec || !rec.joined_at) return json({error: "open your account with the invite code to read screenshots", code: "account"}, 403);

  const text = await request.text();
  if (text.length > MAX_BODY) return json({error: "that image is too big", code: "big"}, 413);
  let body;
  try { body = JSON.parse(text); } catch (e) { return json({error: "not JSON"}, 400); }
  const m = IMAGE.exec(String(body && body.image || ""));
  if (!m) return json({error: "send a JPEG, PNG, WebP or GIF image", code: "image"}, 400);

  const day = new Date().toISOString().slice(0, 10), countKey = "scan:" + key.slice(5) + ":" + day;
  const used = Number(await env.USERS.get(countKey)) || 0;
  if (used >= PER_DAY) return json({error: `that's today's ${PER_DAY} screenshots; more tomorrow`, code: "limit"}, 429);
  await env.USERS.put(countKey, String(used + 1), {expirationTtl: 2 * 86400});

  let quota = false, answer = null;
  if (env.GEMINI_API_KEY) {
    try {
      const r = await fetcher(GEMINI_URL, {method: "POST", headers: {"content-type": "application/json", authorization: "Bearer " + env.GEMINI_API_KEY},
        body: JSON.stringify({model: env.GEMINI_VISION_MODEL || GEMINI_MODEL, temperature: 0, max_tokens: 1500,
          response_format: {type: "json_object"},
          messages: [{role: "user", content: [{type: "text", text: PROMPT}, {type: "image_url", image_url: {url: m[0]}}]}]})});
      if (r.ok) answer = (await r.json())?.choices?.[0]?.message?.content ?? null;
      else if (r.status === 429) quota = true;
    } catch (e) {}
  }
  if (answer == null && env.AI) {
    const bytes = [...Uint8Array.from(atob(m[2]), c => c.charCodeAt(0))];
    for (const model of CF_VISION) {
      const run = () => env.AI.run(model, {messages: [{role: "user", content: PROMPT}], image: bytes, max_tokens: 1500, temperature: 0});
      try {
        let out;
        try { out = await run(); } catch (e) {
          // Meta's vision model needs its license accepted once per Cloudflare account
          if (!/agree|5016/i.test(String(e && e.message || e))) throw e;
          await env.AI.run(model, {prompt: "agree"});
          out = await run();
        }
        answer = out && (out.response ?? out.result?.response) || null;
        if (answer != null) break;
      } catch (e) {
        if (/limit|quota|neuron|429|capacity/i.test(String(e && e.message || e))) { quota = true; break; }
      }
    }
  }
  if (answer == null) {
    return json({error: quota ? "the free AI has used up today's reads; try again tomorrow" : "the AI couldn't read it right now",
                 code: quota ? "quota" : "ai"}, quota ? 429 : 502);
  }
  const d = clean(typeof answer === "object" ? answer : parseAnswer(answer));
  if (!d) return json({error: "the AI's answer wasn't readable; try again", code: "ai"}, 502);
  return json(d);
}

export async function onRequest(context) {
  return handle(context.request, context.env);
}
