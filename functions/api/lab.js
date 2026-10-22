// DeVig Lab (owner only): GET /api/lab returns what the /lab page shows -- the latest run of every GitHub Actions
// workflow in this repo and the Research Lab's research/status.json (contract: research/STATUS_SCHEMA.md).
//
// Who may see it: the Cloudflare Access login is checked exactly as /api/me does (accessUser), and the signed-in
// email must equal OWNER_EMAIL. Everyone else -- signed out, another account, a bad token, OWNER_EMAIL not set --
// gets the site's ordinary "page not found", the same as any URL that doesn't exist, so nothing hints the page is there.
//
// Needs, in the Pages project settings:
//   OWNER_EMAIL          the owner's sign-in email (a plain variable; never written in the repo)
//   ACCESS_TEAM_DOMAIN   as for /api/me (ACCESS_AUD optional)
//   GITHUB_TOKEN         optional secret: fine-grained, this repo only, Actions + Contents read-only. Without it GitHub
//                        allows 60 requests an hour, which the 3-minute cache keeps under, and status.json comes from
//                        raw.githubusercontent.com (cached there up to 5 minutes); with it, Actions are re-read every
//                        minute, status.json is read through the API (fresh within ~15 s), and workflows that aren't in
//                        the recent-runs page get their own latest run looked up too.
import { accessUser } from "./me.js";

export const REPO = "DeVig-AI/AI-Bettor-Model";
const API = "https://api.github.com/repos/" + REPO;
const STATUS_URL = `https://raw.githubusercontent.com/${REPO}/main/research/status.json`;
const TTL = 180;                   // seconds before GitHub Actions is asked again (60 with a token)
const TTL_STATUS = 15;             // seconds before research/status.json is read again (it costs no rate limit without
                                   // a token; with one, it's read through the API, which skips raw's 5-minute cache)
const FRESH_MIN = 20;              // the page's refresh button re-asks GitHub Actions at most this often
const KEEP = 86400;                // a last good copy is kept this long to show (marked stale) when a fetch fails
const RUNS_PAGE = 50;              // recent runs read in one request (covers the busy bots and the occasional ones)
const MAX_LOOKUPS = 25;            // with a token: workflows missing from the page get their own latest run
const mem = new Map();             // fallback when the Cache API isn't there (local tests)

export const SECURE_HEADERS = {
  "x-robots-tag": "noindex, nofollow",
  "cache-control": "private, no-store",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
};

// The signed-in owner's email, or null for anyone else (or when OWNER_EMAIL isn't set).
export async function ownerOnly(request, env, who = accessUser) {
  const want = String((env && env.OWNER_EMAIL) || "").trim().toLowerCase();
  if (!want) return null;
  let got;
  try { got = await who(request, env); } catch (e) { return null; }
  if (!got || String(got).trim().toLowerCase() !== want) return null;
  return want;
}

// Plain fallback, only used when the site's own 404 page can't be read (local tests without assets).
export const NOT_FOUND_HTML = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Page not found</title>\n</head>\n' +
  '<body>\n<h1>Page not found</h1>\n<p><a href="/">DeVig</a></p>\n</body>\n</html>\n';

// Exactly what the site answers for a URL that doesn't exist: the static site's own 404 (docs/404.html).
export async function notFound(request, env) {
  if (env && env.ASSETS) {
    try {
      const r = await env.ASSETS.fetch(new Request(new URL(request.url).toString(), {method: "GET"}));
      if (r.status === 404) return r;
    } catch (e) { /* fall through */ }
  }
  return new Response(NOT_FOUND_HTML, {status: 404, headers: {"content-type": "text/html; charset=utf-8"}});
}

// ---- small cache: Cloudflare's Cache API when present, memory otherwise -------------------------------------------
async function remember(key, make, fresh, ttl = TTL) {
  const url = "https://devig-lab.invalid/" + key;
  const cache = typeof caches !== "undefined" && caches.default;
  let old = null;
  try {
    if (cache) { const hit = await cache.match(url); if (hit) old = await hit.json(); }
    else if (mem.has(url)) old = mem.get(url);
  } catch (e) { old = null; }
  // A refresh tap (fresh) re-reads status.json at once, but GitHub Actions only if its copy is FRESH_MIN s old.
  const age = old ? Date.now() - old.at : Infinity;
  const forced = fresh && age >= (key === "research" ? 0 : FRESH_MIN) * 1000;
  if (old && !forced && age < ttl * 1000) return {...old.value, fetched_at: new Date(old.at).toISOString(), stale: false};
  try {
    const value = await make();
    const rec = {at: Date.now(), value};
    if (cache) await cache.put(url, new Response(JSON.stringify(rec), {headers: {"cache-control": `max-age=${KEEP}`}}));
    else mem.set(url, rec);
    return {...value, fetched_at: new Date(rec.at).toISOString(), stale: false};
  } catch (e) {
    const error = String((e && e.message) || e).slice(0, 200);
    if (old) return {...old.value, fetched_at: new Date(old.at).toISOString(), stale: true, error};
    return {stale: true, error, fetched_at: null};
  }
}

export function _clearCache() { mem.clear(); }

// ---- GitHub Actions --------------------------------------------------------------------------------------------
async function gh(path, env, fetcher) {
  const headers = {"accept": "application/vnd.github+json", "user-agent": "devig-lab", "x-github-api-version": "2022-11-28"};
  if (env.GITHUB_TOKEN) headers.authorization = "Bearer " + String(env.GITHUB_TOKEN).trim();
  const r = await fetcher(API + path, {headers});
  if (!r.ok) throw new Error(`GitHub ${r.status}` + (r.status === 403 || r.status === 429 ? " (rate limit?)" : ""));
  return r.json();
}

export function runState(run) {
  if (!run) return "none";
  const s = run.status, c = run.conclusion;
  if (s === "in_progress") return "running";
  if (s !== "completed") return "queued";            // queued, waiting, pending, requested
  if (c === "success") return "success";
  if (c === "failure" || c === "timed_out" || c === "startup_failure") return "failed";
  if (c === "cancelled") return "cancelled";
  return "skipped";                                  // skipped, neutral, stale, action_required
}

// Research / Props / Games & App, from the workflow's name and file.
export function groupOf(wf) {
  const s = `${wf.path || ""} ${wf.name || ""}`.toLowerCase();
  if (/research|\blab\b|inspector|constitution/.test(s)) return "Research";
  if (/props/.test(s)) return "Props";
  return "Games & App";
}

function slimRun(r) {
  const start = r.run_started_at || r.created_at;
  const done = r.status === "completed";
  return {
    id: r.id, number: r.run_number, state: runState(r), event: r.event, branch: r.head_branch,
    started_at: start, updated_at: r.updated_at,
    duration_s: done && start && r.updated_at ? Math.max(0, Math.round((Date.parse(r.updated_at) - Date.parse(start)) / 1000)) : null,
    url: typeof r.html_url === "string" && r.html_url.startsWith("https://github.com/") ? r.html_url : null,
  };
}

export async function loadGithub(env, fetcher = fetch) {
  const [wfs, runs] = await Promise.all([
    gh("/actions/workflows?per_page=100", env, fetcher),
    gh(`/actions/runs?per_page=${RUNS_PAGE}&exclude_pull_requests=true`, env, fetcher),
  ]);
  const latest = new Map();
  for (const r of runs.workflow_runs || []) {          // newest first
    if (!latest.has(r.workflow_id)) latest.set(r.workflow_id, r);
  }
  const list = (wfs.workflows || []).filter(w => w.state === "active" || latest.has(w.id));
  if (env.GITHUB_TOKEN) {
    const missing = list.filter(w => !latest.has(w.id)).slice(0, MAX_LOOKUPS);
    await Promise.all(missing.map(async w => {
      try {
        const one = await gh(`/actions/workflows/${w.id}/runs?per_page=1&exclude_pull_requests=true`, env, fetcher);
        if (one.workflow_runs && one.workflow_runs[0]) latest.set(w.id, one.workflow_runs[0]);
      } catch (e) { /* shown as "no recent run" */ }
    }));
  }
  const workflows = list.map(w => {
    const r = latest.get(w.id);
    return {
      id: w.id, name: String(w.name || w.path || "workflow").slice(0, 160), path: w.path || "",
      group: groupOf(w), disabled: w.state !== "active",
      url: `https://github.com/${REPO}/actions/workflows/${String(w.path || "").split("/").pop()}`,
      last: r ? slimRun(r) : null,
    };
  }).sort((a, b) => (Date.parse(b.last && b.last.started_at) || 0) - (Date.parse(a.last && a.last.started_at) || 0));
  const failing = workflows.filter(w => !w.disabled && w.last && w.last.state === "failed").map(w => w.id);
  return {workflows, failing, authed: !!env.GITHUB_TOKEN};
}

// ---- Research Lab status.json ----------------------------------------------------------------------------------
const STATES = ["queued", "running", "failed", "lab_pass", "exam_pass", "exam_fail", "promoted", "stopped"];
const MARKETS = ["spread", "total", "props"];
const KINDS = ["helped", "faded", "no_effect"];
const STEP_STATES = [...STATES, "info"];
const str = (v, n = 300) => (v === undefined || v === null ? "" : String(v).slice(0, n));
const num = v => (typeof v === "number" && isFinite(v) ? v : null);
const ci = v => (Array.isArray(v) && v.length === 2 && num(v[0]) !== null && num(v[1]) !== null ? [v[0], v[1]] : null);
const link = v => (typeof v === "string" && v.startsWith("https://github.com/") ? v.slice(0, 500) : null);
const arr = (v, n) => (Array.isArray(v) ? v.slice(0, n) : []);

const iso = v => str(v, 40);
const frac = v => (num(v) !== null ? v : null);

const SPORT = v => str(v, 12).toUpperCase().replace(/[^A-Z0-9]/g, "");

// Keep only the contract's fields, with their types; anything else is dropped. The top level is one sport's block
// (NFL); `by_sport` holds the other sports' blocks, each cleaned the same way (one level deep only).
export function cleanStatus(s, nested = false) {
  if (!s || typeof s !== "object") return null;
  const by = {};
  if (!nested && s.by_sport && typeof s.by_sport === "object") {
    Object.keys(s.by_sport).slice(0, 6).forEach(k => {
      const b = cleanStatus(s.by_sport[k], true);
      if (b && SPORT(k)) by[SPORT(k)] = b;
    });
  }
  const at = s.attempts && typeof s.attempts === "object" ? s.attempts : null;
  const c = s.counts || {};
  const L = s.links && typeof s.links === "object" ? s.links : {};
  return {
    updated_at: iso(s.updated_at), scope: str(s.scope, 24), note: str(s.note, 300),
    sport: SPORT(s.sport || s.scope), sport_name: str(s.sport_name, 40),
    attempts: at ? {this_sport: num(at.this_sport), all_sports: num(at.all_sports), note: str(at.note, 300)} : null,
    effect_name: str(s.effect_name, 80), effect_unit: str(s.effect_unit, 12),
    constitution: s.constitution && typeof s.constitution === "object"
      ? {version: str(s.constitution.version, 20), sha256: str(s.constitution.sha256, 64)} : null,
    counts: {tried: num(c.tried), running: num(c.running), lab_pass: num(c.lab_pass), exam_pass: num(c.exam_pass),
             exam_budget_left: num(c.exam_budget_left), exam_budget_total: num(c.exam_budget_total)},
    exam_name: str(s.exam_name, 60),
    links: {constitution: link(L.constitution), ledger: link(L.ledger), lessons: link(L.lessons)},
    candidates: arr(s.candidates, 300).filter(x => x && typeof x === "object").map(x => {
      const k = x.kalshi && typeof x.kalshi === "object" ? x.kalshi : null;
      const ex = x.exam && typeof x.exam === "object" ? x.exam : null;
      return {
        id: str(x.id, 80), name: str(x.name, 160) || str(x.id, 80), market: MARKETS.includes(x.market) ? x.market : "other",
        family: str(x.family, 80), reason: str(x.reason, 1000),
        state: STATES.includes(x.state) ? x.state : "queued", fail_reason: str(x.fail_reason, 40),
        gate_now: num(x.gate_now), started_at: iso(x.started_at), eta_at: iso(x.eta_at),
        gates: arr(x.gates, 6).filter(g => g && typeof g === "object").map(g => ({
          name: str(g.name, 40), effect: num(g.effect), ci: ci(g.ci), games: num(g.games),
          passed: g.passed === true ? true : g.passed === false ? false : null})),
        pooled: x.pooled && typeof x.pooled === "object"
          ? {name: str(x.pooled.name, 40), effect: num(x.pooled.effect), ci: ci(x.pooled.ci), adj_p: num(x.pooled.adj_p),
             adj_p_all_sports: num(x.pooled.adj_p_all_sports)} : null,
        attempts: num(x.attempts), p_bar: num(x.p_bar), fade_ratio: frac(x.fade_ratio), fade_needed: frac(x.fade_needed),
        kalshi: k ? {picks: num(k.picks), win_rate: frac(k.win_rate), break_even: frac(k.break_even), roi: frac(k.roi)} : null,
        rule_split: arr(x.rule_split, 10).filter(r => r && typeof r === "object").map(r => ({
          label: str(r.label, 60), effect: num(r.effect), note: str(r.note, 80)})),
        exam: ex ? {state: ["not_taken", "passed", "failed"].includes(ex.state) ? ex.state : "not_taken",
                    effect: num(ex.effect), ci: ci(ex.ci), note: str(ex.note, 300), taken_at: iso(ex.taken_at)} : null,
        verdict: str(x.verdict, 400), graded_at: iso(x.graded_at), run_number: num(x.run_number),
        run_url: link(x.run_url), file_url: link(x.file_url), updated_at: iso(x.updated_at),
      };
    }),
    lessons: arr(s.lessons, 400).filter(x => x && typeof x === "object").map(x => ({   // search lessons: one per signal
      text: str(x.text, 600), kind: KINDS.includes(x.kind) ? x.kind : "no_effect", at: iso(x.at),
      candidates: arr(x.candidates, 20).map(v => str(v, 80)),
      ...(x.source === "search" ? {source: "search", from: str(x.from, 80)} : {})})),
    runs: arr(s.runs, 10).filter(x => x && typeof x === "object").map(x => ({
      kind: ["lab", "exam", "review", "paper", "search"].includes(x.kind) ? x.kind : "lab", name: str(x.name, 80),
      started_at: iso(x.started_at), finished_at: iso(x.finished_at), duration_s: num(x.duration_s),
      run_number: num(x.run_number), run_url: link(x.run_url), summary: str(x.summary, 300),
      funnel: arr(x.funnel, 8).filter(f => f && typeof f === "object").map(f => ({label: str(f.label, 40), count: num(f.count)})),
      steps: arr(x.steps, 60).filter(t => t && typeof t === "object").map(t => ({
        at: iso(t.at), id: str(t.id, 80), name: str(t.name, 160), text: str(t.text, 300),
        state: STEP_STATES.includes(t.state) ? t.state : "info", fail_reason: str(t.fail_reason, 40),
        gates: arr(t.gates, 3).map(g => (g === true ? true : g === false ? false : null))}))})),
    promoted: arr(s.promoted, 50).filter(x => x && typeof x === "object").map(x => ({
      name: str(x.name, 160), picks: num(x.picks), wins: num(x.wins), losses: num(x.losses), roi: num(x.roi),
      vs_kalshi_note: str(x.vs_kalshi_note, 400)})),
    ...(nested ? {} : {by_sport: by,
      sports: arr(s.sports, 6).filter(x => x && typeof x === "object" && SPORT(x.key))
        .map(x => ({key: SPORT(x.key), name: str(x.name, 40) || SPORT(x.key)}))}),
  };
}

export async function loadResearch(env, fetcher = fetch) {
  const r = env.GITHUB_TOKEN
    ? await fetcher(API + "/contents/research/status.json?ref=main", {headers: {
        "accept": "application/vnd.github.raw", "user-agent": "devig-lab", "x-github-api-version": "2022-11-28",
        "authorization": "Bearer " + String(env.GITHUB_TOKEN).trim()}})
    : await fetcher(STATUS_URL, {headers: {"user-agent": "devig-lab"}});
  if (r.status === 404) return {status: null};
  if (!r.ok) throw new Error("status.json " + r.status);
  let body;
  try { body = JSON.parse(await r.text()); } catch (e) { throw new Error("status.json is not valid JSON"); }
  return {status: cleanStatus(body)};
}

export async function labData(env, fetcher = fetch, fresh = false) {
  const [github, research] = await Promise.all([
    remember("github", () => loadGithub(env, fetcher), fresh, env.GITHUB_TOKEN ? 60 : TTL),
    remember("research", () => loadResearch(env, fetcher), fresh, TTL_STATUS),
  ]);
  return {generated_at: new Date().toISOString(), github, research};
}

export async function handle(request, env, deps = {}) {
  const who = deps.accessUser || accessUser;
  const fetcher = deps.fetch || fetch;
  if (request.method !== "GET" || !(await ownerOnly(request, env, who))) return notFound(request, env);
  const data = await labData(env, fetcher, new URL(request.url).searchParams.get("fresh") === "1");
  return new Response(JSON.stringify(data), {
    status: 200, headers: {"content-type": "application/json; charset=utf-8", ...SECURE_HEADERS},
  });
}

export async function onRequest(context) {
  return handle(context.request, context.env);
}
