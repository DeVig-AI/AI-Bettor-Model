// DeVig local AI gate: the only door from the internet to Ollama on the owner's computer.
// The tunnel points here (not at Ollama). It lets through two things, with DeVig's key and an allowed model only:
// a screenshot read (POST /v1/chat/completions) and an Ask answer with DeVig's tools (POST /api/chat). Everything else gets 404/401, so nobody can
// pull, delete or list models, or use the computer for anything else. No dependencies: `node gate.mjs`.
//   DEVIG_AI_KEY_FILE  file holding the key (default ~/.devig-local-ai-key); the site sends it as LOCAL_AI_KEY
//   OLLAMA             default http://127.0.0.1:11434     PORT  default 11435 (localhost only)
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { homedir } from "node:os";

const KEY = readFileSync(process.env.DEVIG_AI_KEY_FILE || `${homedir()}/.devig-local-ai-key`, "utf8").trim();
if (KEY.length < 32) throw new Error("the key file needs a long random key");
const OLLAMA = process.env.OLLAMA || "http://127.0.0.1:11434";
const PORT = Number(process.env.PORT) || 11435;
const MODELS = new Set((process.env.MODELS || "qwen2.5vl:3b,qwen3:4b-instruct").split(","));
const MAX_BODY = 5_000_000;
const PATHS = new Set(["/v1/chat/completions", "/api/chat"]);
let busy = 0;                                   // one read at a time: an 8 GB computer can't do two

const ok = a => { const x = Buffer.from(a), y = Buffer.from(`Bearer ${KEY}`); return x.length === y.length && timingSafeEqual(x, y); };
const send = (res, code, body) => { res.writeHead(code, {"content-type": "application/json"}); res.end(JSON.stringify(body)); };

createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") return send(res, 200, {ok: true});
  if (req.method !== "POST" || !PATHS.has(req.url)) return send(res, 404, {error: "not found"});
  if (!ok(String(req.headers.authorization || ""))) return send(res, 401, {error: "bad key"});
  if (busy) return send(res, 503, {error: "busy"});
  const chunks = []; let size = 0;
  req.on("data", c => { size += c.length; if (size > MAX_BODY) { send(res, 413, {error: "too big"}); req.destroy(); } else chunks.push(c); });
  req.on("end", async () => {
    if (res.writableEnded) return;
    let body;
    try { body = JSON.parse(Buffer.concat(chunks)); } catch { return send(res, 400, {error: "not JSON"}); }
    if (!MODELS.has(body.model)) return send(res, 400, {error: "model not allowed"});
    body.stream = false;
    busy++;
    try {
      const r = await fetch(`${OLLAMA}${req.url}`, {method: "POST", headers: {"content-type": "application/json"},
        body: JSON.stringify(body), signal: AbortSignal.timeout(120_000)});
      send(res, r.status, await r.json().catch(() => ({error: "bad answer"})));
    } catch (e) { send(res, 502, {error: "ollama is not running"}); }
    finally { busy--; }
  });
}).listen(PORT, "127.0.0.1", () => console.log(`DeVig AI gate on 127.0.0.1:${PORT} -> ${OLLAMA}`));
