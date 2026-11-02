# DeVig local AI

The owner's own computer answers for the site through Ollama:

- **Ask** (`functions/api/ask.js`): `qwen3:4b-instruct` answers chat questions **first**, using DeVig's lookup tools
  (`functions/lib/devig-tools.js`: games and picks, the model's reasoning, record, injuries, player props, a bettor
  glossary, and web search when `OLLAMA_API_KEY` is set). Off or busy → Gemini → Cloudflare Workers AI.
- **Screenshot reader** (`functions/api/scan.js`): `qwen2.5vl:3b` as a backup when Gemini is out.

    site ──HTTPS──> Tailscale Funnel / Cloudflare Tunnel ──> gate.mjs (127.0.0.1:11435, checks the key) ──> Ollama (127.0.0.1:11434)

1. Ollama with `ollama pull qwen3:4b-instruct` (Ask, about 5-15 s an answer on an 8 GB M1) and optionally
   `ollama pull qwen2.5vl:3b` (screenshots). Use the **instruct** build: plain `qwen3:4b` thinks out loud first and
   takes 30-60 s.
2. `sh scripts/local-ai/install-gate.sh` starts the gate at login and makes the key `~/.devig-local-ai-key`.
3. A tunnel to `http://127.0.0.1:11435` (never straight to Ollama), e.g. `tailscale funnel --bg 11435`.
4. Cloudflare Pages → devigai → Settings → Variables and Secrets (Production):
   `LOCAL_AI_URL` = the tunnel's https address, `LOCAL_AI_KEY` (Secret) = the key file's contents, and optionally
   `OLLAMA_API_KEY` (Secret, free at ollama.com/settings/keys) for Ask's web search. Redeploy.

The gate only passes `POST /api/chat` and `POST /v1/chat/completions` with the key and an allowed model (`MODELS`,
default `qwen2.5vl:3b,qwen3:4b-instruct`), one at a time. The key never goes in this repo.

## MCP

The same DeVig tools (minus web search and the app-only ones) are a public, read-only MCP server at
`https://devigai.pages.dev/api/mcp` (Streamable HTTP). Add it as a remote MCP server in any MCP client.
