# DeVig local AI

Lets the site's screenshot reader (`functions/api/scan.js`) use a vision model on the owner's own computer as a
backup when Gemini is out. Order: Gemini → this computer (if it's on) → Cloudflare Workers AI.

    site ──HTTPS──> Cloudflare Tunnel ──> gate.mjs (127.0.0.1:11435, checks the key) ──> Ollama (127.0.0.1:11434)

1. Ollama with `ollama pull qwen2.5vl:3b` (fits 8 GB; about 30 s a slip).
2. `sh scripts/local-ai/install-gate.sh` starts the gate at login and makes the key `~/.devig-local-ai-key`.
3. A Cloudflare Tunnel to `http://127.0.0.1:11435` (never straight to Ollama).
4. Cloudflare Pages → devigai → Settings → Variables and Secrets (Production):
   `LOCAL_AI_URL` = the tunnel's https address, `LOCAL_AI_KEY` (Secret) = the key file's contents. Redeploy.

The gate only passes `POST /v1/chat/completions` with the key and an allowed model (`MODELS`, default qwen2.5vl:3b),
one at a time. The key never goes in this repo.
