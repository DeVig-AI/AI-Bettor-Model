// DeVig Lab (owner only): GET /lab is a private phone dashboard -- what GitHub Actions is doing across this repo and how
// the Research Lab is going. The page reads /api/lab (functions/api/lab.js), which holds the data and the owner check.
//
// Anyone who isn't the signed-in owner gets the site's ordinary "page not found" (same as /api/lab), so the page is
// invisible. It is never linked from the app and isn't a static file, so it's not in the sitemap or manifest either.
//
// Signing in: Cloudflare Access guards only /login and sets its login cookie for the whole site (that's how /api/me
// sees it too). Open /login?next=/lab: after the email code it lands here. When the login runs out while the page is
// open, /api/lab starts answering 404 and the page shows a "Sign in again" button that goes the same way.
import { ownerOnly, notFound, SECURE_HEADERS } from "./api/lab.js";
import { accessUser } from "./api/me.js";

const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; " +
  "frame-ancestors 'none'";

export async function handle(request, env, deps = {}) {
  const who = deps.accessUser || accessUser;
  if (request.method !== "GET" || !(await ownerOnly(request, env, who))) return notFound(request, env);
  return new Response(PAGE, {
    status: 200,
    headers: {"content-type": "text/html; charset=utf-8", "content-security-policy": CSP, ...SECURE_HEADERS},
  });
}

export async function onRequest(context) {
  return handle(context.request, context.env);
}

const LOGO = '<svg class="dv-logo" viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" rx="24" fill="#16171B"/>' +
  '<path d="M28 27 L49 75 L68 36" fill="none" stroke="#E8A64E" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>' +
  '<rect x="66" y="16" width="12" height="12" rx="2" fill="#9C7A55" transform="rotate(18 72 22)"/></svg>';

export const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<meta name="theme-color" content="#08090B">
<title>DeVig Lab</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  /* Design B ("minimal dark"), same tokens as tools/devig_source.html */
  :root{
    --bg:#08090B; --surface:#111214; --surface-2:#18191D;
    --ink:#F4F4F5; --ink-soft:#A1A1AA; --ink-faint:#80808A;
    --accent:#E8A64E; --accent-strong:#F2BD78; --accent-ink:#1A1206; --accent-wash:#2A2013;
    --line:#1E1F24; --line-strong:#2C2D33;
    --good:#6EDC9A; --good-wash:#11261A;
    --bad:#F08A8A; --bad-wash:#2E1515;
    --radius:14px;
    --font-mono:'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,monospace;
    --font-sans:'IBM Plex Sans',system-ui,-apple-system,sans-serif;
    color-scheme:dark;
  }
  *{box-sizing:border-box}
  html,body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--font-sans);font-size:15px;line-height:1.45}
  body{padding:0 16px calc(32px + env(safe-area-inset-bottom));max-width:720px;margin:0 auto;overflow-x:hidden}
  a{color:var(--accent-strong)}
  a:focus-visible,button:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:8px}
  .mono{font-family:var(--font-mono)}
  .soft{color:var(--ink-soft)} .faint{color:var(--ink-faint)}
  header{position:sticky;top:0;z-index:5;background:var(--bg);display:flex;align-items:center;gap:12px;
         padding:calc(10px + env(safe-area-inset-top)) 0 10px;border-bottom:1px solid var(--line)}
  .dv-logo{width:36px;height:36px;flex:none;display:block}
  header h1{margin:0;font-size:20px;font-weight:600;letter-spacing:.2px}
  header .when{font-size:12px;color:var(--ink-soft);font-family:var(--font-mono)}
  header .grow{flex:1;min-width:0}
  .btn{min-height:44px;min-width:44px;padding:0 14px;border-radius:12px;border:1px solid var(--line-strong);
       background:var(--surface-2);color:var(--ink);font:inherit;font-weight:500;cursor:pointer;display:inline-flex;
       align-items:center;justify-content:center;gap:6px;text-decoration:none}
  .btn:hover{border-color:var(--accent)}
  .btn svg{width:18px;height:18px}
  .btn.primary{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}
  .spin svg{animation:spin 1s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  @media (prefers-reduced-motion:reduce){.spin svg{animation:none}}
  section{margin-top:22px}
  h2{font-size:13px;font-family:var(--font-mono);font-weight:600;text-transform:uppercase;letter-spacing:.8px;
     color:var(--ink-soft);margin:0 0 10px}
  h3{font-size:12px;font-family:var(--font-mono);font-weight:500;color:var(--ink-faint);margin:14px 0 6px;
     text-transform:uppercase;letter-spacing:.6px}
  .card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:14px}
  .note{margin-top:12px;padding:10px 12px;border-radius:12px;border:1px solid var(--line-strong);background:var(--surface-2);
        font-size:13px;color:var(--ink-soft)}
  .note.warn{border-color:#5a4422;background:var(--accent-wash);color:var(--accent-strong)}
  .alert{margin-top:12px;padding:12px;border-radius:12px;background:var(--bad-wash);border:1px solid #5b2626;color:var(--ink)}
  .alert b{color:var(--bad)}
  .alert ul{margin:6px 0 0;padding:0;list-style:none}
  .alert li a{display:flex;align-items:center;min-height:44px;gap:8px;color:var(--ink);text-decoration:none;
              border-top:1px solid #4a2020}
  .alert li a span:first-child{color:var(--bad);font-weight:700}
  .big{font-family:var(--font-mono);font-size:22px;font-weight:600;line-height:1.3;word-break:break-word}
  .big .sep{color:var(--ink-faint);font-weight:400}
  .budget{margin-top:6px;font-size:13px;color:var(--ink-soft)}
  .budget b{color:var(--accent-strong);font-family:var(--font-mono)}
  .funnel{margin-top:12px;display:grid;gap:6px}
  .fbar{display:grid;grid-template-columns:86px 1fr 40px;align-items:center;gap:8px;font-size:12px}
  .fbar .track{height:12px;border-radius:6px;background:var(--surface-2);overflow:hidden;border:1px solid var(--line)}
  .fbar .fill{height:100%;border-radius:6px}
  .fbar .n{font-family:var(--font-mono);text-align:right}
  .empty{text-align:center;padding:22px 14px}
  .empty .ico{font-size:28px;color:var(--ink-faint)}
  .empty p{margin:6px 0 0;color:var(--ink-soft);font-size:14px}
  .list{display:grid;gap:8px}
  .cand{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden}
  .cand>button{all:unset;box-sizing:border-box;display:grid;grid-template-columns:1fr auto;gap:6px 10px;width:100%;
               padding:12px 14px;min-height:44px;cursor:pointer}
  .cand>button:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
  .cand .nm{font-weight:600;min-width:0;overflow-wrap:anywhere}
  .cand .chips{display:flex;flex-wrap:wrap;gap:6px;grid-column:1/-1}
  .cand .meta{grid-column:1/-1;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
  .cand .chev{color:var(--ink-faint);transition:transform .15s}
  .cand[data-open="1"] .chev{transform:rotate(90deg)}
  .detail{padding:0 14px 14px;border-top:1px solid var(--line);font-size:14px}
  .detail p{margin:10px 0 0}
  .chip{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-family:var(--font-mono);padding:2px 8px;
        border-radius:999px;border:1px solid var(--line-strong);color:var(--ink-soft);white-space:nowrap}
  /* state chips: lightness, fill/outline and an icon all differ, not just hue */
  .st-queued{color:var(--ink-faint);border-style:dashed}
  .st-running{color:var(--accent-strong);border-color:#6b5025;background:var(--accent-wash)}
  .st-failed{color:#1a0b0b;background:var(--bad);border-color:var(--bad);font-weight:600}
  .st-lab_pass{color:var(--good);border-color:#2f6b47}
  .st-exam_pass{color:#08200f;background:var(--good);border-color:var(--good);font-weight:600}
  .st-exam_fail{color:var(--bad);border-color:#6b2f2f}
  .st-promoted{color:var(--accent-ink);background:var(--accent);border-color:var(--accent);font-weight:700}
  .st-stopped{color:var(--ink-faint);text-decoration:line-through}
  .pips{display:inline-flex;gap:4px;align-items:center}
  .pip{width:18px;height:18px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;
       font-size:11px;font-weight:700;line-height:1}
  .pip.pass{background:var(--good);color:#08200f}
  .pip.fail{background:var(--bad-wash);color:var(--bad);border:1.5px solid var(--bad)}
  .pip.pend{border:1.5px dashed var(--ink-faint);color:var(--ink-faint)}
  .ival{display:inline-flex;align-items:center;gap:6px;font-family:var(--font-mono);font-size:12px;color:var(--ink-soft)}
  .ival svg{width:84px;height:16px;flex:none}
  table{width:100%;border-collapse:collapse;margin-top:10px;font-size:13px}
  th,td{text-align:left;padding:6px 4px;border-bottom:1px solid var(--line)}
  th{font-weight:500;color:var(--ink-faint);font-family:var(--font-mono);font-size:11px}
  td.num{font-family:var(--font-mono);white-space:nowrap}
  .tablewrap{overflow-x:auto}
  .lesson{background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--line-strong);
          border-radius:12px;padding:12px}
  .lesson .tag{font-size:11px;font-family:var(--font-mono);color:var(--accent-strong);text-transform:uppercase;letter-spacing:.6px}
  .lesson.k-helped{border-left-color:var(--good)} .lesson.k-faded{border-left-color:var(--bad)}
  .lesson p{margin:6px 0 0}
  .promo .rec{font-family:var(--font-mono);font-size:18px;font-weight:600}
  .promo .tag{font-size:11px;font-family:var(--font-mono);color:var(--accent-ink);background:var(--accent);
              padding:2px 8px;border-radius:999px;display:inline-block}
  .wf{display:grid;grid-template-columns:22px 1fr auto;gap:4px 10px;align-items:center;min-height:52px;
      padding:10px 12px;text-decoration:none;color:var(--ink);border-top:1px solid var(--line)}
  .wf:first-child{border-top:0}
  .wf:hover{background:var(--surface-2)}
  .wf .t{min-width:0;overflow-wrap:anywhere;font-size:14px}
  .wf .t small{display:block;font-size:12px;color:var(--ink-soft);font-family:var(--font-mono)}
  .wf .ext{color:var(--ink-faint);font-size:13px}
  .dot{width:18px;height:18px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;
       font-size:11px;font-weight:700;line-height:1}
  .dot.success{background:var(--good);color:#08200f}
  .dot.failed{background:var(--bad);color:#1a0b0b}
  .dot.running{border:2px solid var(--accent);border-top-color:transparent}
  .dot.queued{border:2px dashed var(--ink-faint)}
  .dot.cancelled,.dot.skipped,.dot.none{border:2px solid var(--ink-faint);color:var(--ink-faint)}
  .group{padding:0;overflow:hidden}
  footer{margin-top:28px;padding-top:14px;border-top:1px solid var(--line);display:flex;flex-wrap:wrap;gap:4px 16px;font-size:14px}
  footer a{display:inline-flex;align-items:center;min-height:44px}
  .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
</style>
</head>
<body>
<header>
  ${LOGO}
  <div class="grow"><h1>Lab</h1><div class="when" id="when" aria-live="polite">loading…</div></div>
  <button class="btn" id="refresh" type="button" aria-label="Refresh">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/></svg>
  </button>
</header>
<main>
  <div id="notes"></div>
  <div id="alerts"></div>
  <section aria-labelledby="h-research"><h2 id="h-research">Research</h2><div id="research"></div></section>
  <section aria-labelledby="h-cands" id="sec-cands" hidden><h2 id="h-cands">Candidates</h2><div class="list" id="cands"></div></section>
  <section aria-labelledby="h-lessons" id="sec-lessons" hidden><h2 id="h-lessons">Lessons</h2><div class="list" id="lessons"></div></section>
  <section aria-labelledby="h-promoted" id="sec-promoted" hidden><h2 id="h-promoted">Promoted models</h2><div class="list" id="promoted"></div></section>
  <section aria-labelledby="h-gh"><h2 id="h-gh">GitHub activity</h2><div id="gh"></div></section>
</main>
<footer>
  <a href="https://github.com/DeVig-AI/AI-Bettor-Model/tree/main/research" rel="noreferrer">Research files</a>
  <a href="https://github.com/DeVig-AI/AI-Bettor-Model/blob/main/research/CONSTITUTION.md" rel="noreferrer">Constitution</a>
  <a href="https://github.com/DeVig-AI/AI-Bettor-Model/blob/main/research/STATUS_SCHEMA.md" rel="noreferrer">Status format</a>
  <a href="https://github.com/DeVig-AI/AI-Bettor-Model/actions" rel="noreferrer">All runs</a>
</footer>
<script>
(function(){
  "use strict";
  var KEY = "devig-lab-last", REFRESH_MS = 60000;
  var data = null, loadedAt = 0, loading = false, timer = null, open = {};
  var $ = function(id){ return document.getElementById(id); };
  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function safeUrl(u){ return typeof u === "string" && /^https:\\/\\/github\\.com\\//.test(u) ? u : null; }
  function ago(iso){
    var t = Date.parse(iso); if (!t) return "—";
    var s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return Math.floor(s / 60) + " min ago";
    if (s < 86400) return Math.floor(s / 3600) + " h ago";
    return Math.floor(s / 86400) + " d ago";
  }
  function dur(s){
    if (s == null) return "";
    if (s < 60) return s + "s";
    if (s < 3600) return Math.floor(s / 60) + "m " + (s % 60) + "s";
    return Math.floor(s / 3600) + "h " + Math.floor(s % 3600 / 60) + "m";
  }
  function n(v){ return typeof v === "number" ? v : 0; }
  function fx(v, d){ return typeof v === "number" ? (v > 0 ? "+" : "") + v.toFixed(d == null ? 3 : d) : "—"; }
  function pct(v){ return typeof v === "number" ? (v > 0 ? "+" : "") + (Math.abs(v) <= 1.5 ? (v * 100).toFixed(1) : v.toFixed(1)) + "%" : "—"; }

  var STATE = {
    queued:   ["◌", "queued"],   running: ["◐", "running"],  failed: ["✕", "failed"],
    lab_pass: ["✓", "lab pass"], exam_pass: ["★", "exam pass"], exam_fail: ["✕", "exam fail"],
    promoted: ["▲", "promoted"], stopped: ["■", "stopped"]
  };
  var RUN = {success:["✓","succeeded"], failed:["✕","failed"], running:["","running"], queued:["","queued"],
             cancelled:["–","cancelled"], skipped:["–","skipped"], none:["","no recent run"]};
  var GROUPS = ["Research", "Props", "Game lines", "App"];

  function stateChip(st){ var s = STATE[st] || STATE.queued;
    return '<span class="chip st-' + esc(st) + '"><span aria-hidden="true">' + s[0] + '</span>' + esc(s[1]) + '</span>'; }
  function pip(g){
    var cls = g && g.passed === true ? "pass" : g && g.passed === false ? "fail" : "pend";
    var ch = cls === "pass" ? "✓" : cls === "fail" ? "✕" : "";
    var label = (g && g.name ? g.name : "gate") + ": " + (cls === "pass" ? "passed" : cls === "fail" ? "failed" : "pending");
    return '<span class="pip ' + cls + '" role="img" aria-label="' + esc(label) + '" title="' + esc(label) + '">' + ch + '</span>';
  }
  // the pooled effect as a dot with its interval, around a 0 line in the middle
  function interval(p){
    if (!p || typeof p.effect !== "number") return '<span class="ival">no pooled effect yet</span>';
    var lo = p.ci ? p.ci[0] : p.effect, hi = p.ci ? p.ci[1] : p.effect;
    var m = Math.max(Math.abs(lo), Math.abs(hi), Math.abs(p.effect)) || 1;
    var x = function(v){ return 42 + v / m * 38; };
    var col = lo > 0 ? "#6EDC9A" : hi < 0 ? "#F08A8A" : "#A1A1AA";
    var label = "pooled effect " + fx(p.effect) + (p.ci ? ", interval " + fx(lo) + " to " + fx(hi) : "");
    return '<span class="ival"><svg viewBox="0 0 84 16" role="img" aria-label="' + esc(label) + '">' +
      '<line x1="42" y1="1" x2="42" y2="15" stroke="#80808A" stroke-width="1" stroke-dasharray="2 2"/>' +
      '<line x1="' + x(lo).toFixed(1) + '" y1="8" x2="' + x(hi).toFixed(1) + '" y2="8" stroke="' + col + '" stroke-width="3" stroke-linecap="round"/>' +
      '<circle cx="' + x(p.effect).toFixed(1) + '" cy="8" r="3.5" fill="' + col + '" stroke="#08090B" stroke-width="1"/></svg>' +
      esc(fx(p.effect)) + '</span>';
  }

  function renderNotes(state){
    var h = "";
    if (state.signin) h += '<div class="note warn" role="status">Your sign-in ran out. <a class="btn primary" style="margin-top:8px" href="/login?next=/lab">Sign in again</a></div>';
    if (state.offline) h += '<div class="note warn" role="status">Couldn’t reach the server — showing what was loaded ' + esc(ago(state.offline)) + ' (stale).</div>';
    $("notes").innerHTML = h;
  }

  function renderAlerts(gh){
    var wfs = (gh && gh.workflows) || [], bad = wfs.filter(function(w){ return (gh.failing || []).indexOf(w.id) >= 0; });
    if (!bad.length){ $("alerts").innerHTML = ""; return; }
    $("alerts").innerHTML = '<div class="alert" role="alert"><b>' + bad.length + ' workflow' + (bad.length > 1 ? "s" : "") +
      ' failing</b> — latest run failed<ul>' + bad.map(function(w){
        var u = safeUrl(w.last && w.last.url) || safeUrl(w.url);
        return '<li><a href="' + esc(u) + '" rel="noreferrer"><span aria-hidden="true">✕</span><span>' + esc(w.name) +
          ' <span class="faint">· ' + esc(ago(w.last && w.last.started_at)) + '</span></span></a></li>';
      }).join("") + '</ul></div>';
  }

  function renderResearch(r){
    var s = r && r.status, box = $("research");
    ["sec-cands", "sec-lessons", "sec-promoted"].forEach(function(id){ $(id).hidden = true; });
    if (!r || (!s && r.error && !r.fetched_at)){
      box.innerHTML = '<div class="card empty"><div class="ico" aria-hidden="true">⚠</div><p>Couldn’t read research/status.json' +
        (r && r.error ? ": " + esc(r.error) : "") + '.</p></div>';
      return;
    }
    if (!s){
      box.innerHTML = '<div class="card empty"><div class="ico" aria-hidden="true">⚗</div><p><b>Lab hasn’t run yet.</b></p>' +
        '<p>Candidates, gates and lessons show up here once the Research Lab writes research/status.json.</p></div>';
      return;
    }
    var c = s.counts || {}, tried = n(c.tried);
    var bars = [["tried", tried, "#A1A1AA"], ["running", n(c.running), "#E8A64E"], ["passed lab", n(c.lab_pass), "#2f9e5f"], ["passed exam", n(c.exam_pass), "#6EDC9A"]];
    var max = Math.max(1, tried);
    box.innerHTML = '<div class="card">' +
      '<div class="big">' + tried + ' tried <span class="sep">·</span> ' + n(c.lab_pass) + ' passed lab <span class="sep">·</span> ' + n(c.exam_pass) + ' passed exam</div>' +
      '<div class="budget">Sealed-exam budget left: <b>' + (typeof c.exam_budget_left === "number" ? c.exam_budget_left : "—") + '</b>' +
      (s.constitution && s.constitution.version ? ' <span class="faint">· Constitution ' + esc(s.constitution.version) + '</span>' : "") + '</div>' +
      '<div class="funnel" role="img" aria-label="' + esc(bars.map(function(b){ return b[1] + " " + b[0]; }).join(", ")) + '">' +
      bars.map(function(b){ return '<div class="fbar" aria-hidden="true"><span class="soft">' + b[0] + '</span><span class="track"><span class="fill" style="display:block;width:' +
        (b[1] / max * 100).toFixed(1) + '%;background:' + b[2] + '"></span></span><span class="n">' + b[1] + '</span></div>'; }).join("") +
      '</div><div class="faint" style="font-size:12px;margin-top:8px">Lab status updated ' + esc(ago(s.updated_at)) + '</div></div>';

    var cands = s.candidates || [];
    if (cands.length){
      $("sec-cands").hidden = false;
      $("cands").innerHTML = cands.map(function(x, i){
        var id = "c" + i, key = x.id || x.name, isOpen = !!open[key];
        var gates = (x.gates || []).slice(0, 3); while (gates.length < 3) gates.push(null);
        var det = '<div class="detail" id="' + id + '"' + (isOpen ? "" : " hidden") + '>' +
          (x.reason ? '<p><span class="faint">Why:</span> ' + esc(x.reason) + '</p>' : "") +
          ((x.gates || []).length ? '<div class="tablewrap"><table><thead><tr><th scope="col">Gate</th><th scope="col">Effect</th><th scope="col">Interval</th><th scope="col">Games</th><th scope="col">Result</th></tr></thead><tbody>' +
            x.gates.map(function(g){ return '<tr><td>' + esc(g.name) + '</td><td class="num">' + esc(fx(g.effect)) + '</td><td class="num">' +
              (g.ci ? esc(fx(g.ci[0]) + " … " + fx(g.ci[1])) : "—") + '</td><td class="num">' + (g.games == null ? "—" : esc(g.games)) + '</td><td>' +
              (g.passed === true ? "✓ pass" : g.passed === false ? "✕ fail" : "pending") + '</td></tr>'; }).join("") + '</tbody></table></div>' : "") +
          (x.pooled ? '<p><span class="faint">Pooled:</span> <span class="mono">' + esc(fx(x.pooled.effect)) +
            (x.pooled.ci ? " [" + esc(fx(x.pooled.ci[0])) + ", " + esc(fx(x.pooled.ci[1])) + "]" : "") +
            (typeof x.pooled.adj_p === "number" ? " · adj p " + esc(x.pooled.adj_p.toPrecision(2)) : "") + '</span></p>' : "") +
          (x.verdict ? '<p><b>' + esc(x.verdict) + '</b></p>' : "") +
          '<p class="faint" style="font-size:12px">' + esc([x.family, x.id].filter(Boolean).join(" · ")) + (x.updated_at ? " · updated " + esc(ago(x.updated_at)) : "") + '</p>' +
          (safeUrl(x.run_url) ? '<p><a class="btn" href="' + esc(x.run_url) + '" rel="noreferrer">Open the run on GitHub</a></p>' : "") + '</div>';
        return '<div class="cand" data-open="' + (isOpen ? 1 : 0) + '" data-key="' + esc(key) + '">' +
          '<button type="button" aria-expanded="' + isOpen + '" aria-controls="' + id + '">' +
          '<span class="nm">' + esc(x.name) + '</span><span class="chev" aria-hidden="true">›</span>' +
          '<span class="chips"><span class="chip">' + esc(x.market) + '</span>' + stateChip(x.state) + '</span>' +
          '<span class="meta"><span class="pips">' + gates.map(pip).join("") + '</span>' + interval(x.pooled) + '</span>' +
          '</button>' + det + '</div>';
      }).join("");
    }
    var les = s.lessons || [];
    if (les.length){
      $("sec-lessons").hidden = false;
      var KL = {helped: "helped", faded: "faded", no_effect: "no effect"};
      $("lessons").innerHTML = les.map(function(l){
        return '<div class="lesson k-' + esc(l.kind) + '"><span class="tag">Exploratory — not proof</span> <span class="chip">' + esc(KL[l.kind] || l.kind) +
          '</span><p>' + esc(l.text) + '</p>' + ((l.candidates || []).length ? '<p class="faint" style="font-size:12px">' + esc(l.candidates.join(", ")) + '</p>' : "") + '</div>';
      }).join("");
    }
    var pro = s.promoted || [];
    if (pro.length){
      $("sec-promoted").hidden = false;
      $("promoted").innerHTML = pro.map(function(p){
        var w = n(p.wins), l = n(p.losses), rate = w + l ? w / (w + l) : null;
        var above = typeof p.roi === "number" ? (p.roi > 0 ? "above break-even" : p.roi < 0 ? "below break-even" : "at break-even") : "";
        return '<div class="card promo"><span class="tag">Promoted, not proven</span><div style="font-weight:600;margin-top:8px">' + esc(p.name) + '</div>' +
          '<div class="rec">' + w + '–' + l + (rate == null ? "" : ' <span class="soft" style="font-size:14px">(' + (rate * 100).toFixed(1) + '%)</span>') + '</div>' +
          '<div class="soft" style="font-size:13px">' + (p.picks == null ? "" : esc(p.picks) + ' picks · ') + 'ROI ' + esc(pct(p.roi)) + (above ? ' · ' + above : "") + '</div>' +
          (p.vs_kalshi_note ? '<p class="faint" style="font-size:13px;margin:6px 0 0">' + esc(p.vs_kalshi_note) + '</p>' : "") + '</div>';
      }).join("");
    }
  }

  function renderGithub(gh){
    var box = $("gh");
    if (!gh || !gh.workflows){
      box.innerHTML = '<div class="card empty"><div class="ico" aria-hidden="true">⚠</div><p>Couldn’t read GitHub Actions' + (gh && gh.error ? ": " + esc(gh.error) : "") + '.</p></div>';
      return;
    }
    var h = gh.stale ? '<div class="note warn" style="margin:0 0 10px">GitHub didn’t answer (' + esc(gh.error || "error") + ') — runs as of ' + esc(ago(gh.fetched_at)) + '.</div>' : "";
    GROUPS.forEach(function(g){
      var rows = gh.workflows.filter(function(w){ return w.group === g; });
      if (!rows.length) return;
      h += '<h3>' + esc(g) + '</h3><div class="card group">' + rows.map(function(w){
        var r = w.last, st = r ? r.state : "none", lab = RUN[st] || RUN.none;
        var u = safeUrl(r && r.url) || safeUrl(w.url);
        var when = r ? " · " + ago(r.started_at) + (r.duration_s != null ? " · " + dur(r.duration_s) : "") : "";
        return '<a class="wf" href="' + esc(u) + '" rel="noreferrer"><span class="dot ' + esc(st) + '" role="img" aria-label="' + esc(lab[1]) + '">' + lab[0] + '</span>' +
          '<span class="t">' + esc(w.name) + '<small>' + esc(lab[1]) + esc(when) + (w.disabled ? " · disabled" : "") + '</small></span><span class="ext" aria-hidden="true">↗</span></a>';
      }).join("") + '</div>';
    });
    h += '<p class="faint" style="font-size:12px">From GitHub ' + esc(ago(gh.fetched_at)) + (gh.authed ? "" : " · no token (60 requests/hour)") + '</p>';
    box.innerHTML = h;
  }

  function render(state){
    state = state || {};
    renderNotes(state);
    if (!data){ $("when").textContent = state.signin ? "signed out" : "couldn’t load"; return; }
    renderAlerts(data.github);
    renderResearch(data.research);
    renderGithub(data.github);
    tick();
  }
  function tick(){ if (loadedAt) $("when").textContent = "updated " + ago(new Date(loadedAt).toISOString()); }

  var last = {};
  function load(){
    if (loading) return;
    loading = true; $("refresh").classList.add("spin"); $("refresh").setAttribute("aria-busy", "true");
    fetch("/api/lab", {credentials: "same-origin", cache: "no-store", headers: {accept: "application/json"}})
      .then(function(r){
        if (r.status === 404) return {signin: true};
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json().then(function(d){ return {d: d}; });
      })
      .then(function(res){
        if (res.signin){ last = {signin: true}; render(last); return; }
        data = res.d; loadedAt = Date.now(); last = {};
        try { localStorage.setItem(KEY, JSON.stringify({at: loadedAt, data: data})); } catch (e) {}
        render(last);
      })
      .catch(function(){ last = {offline: loadedAt ? new Date(loadedAt).toISOString() : "a while ago"}; render(last); })
      .then(function(){ loading = false; $("refresh").classList.remove("spin"); $("refresh").removeAttribute("aria-busy"); });
  }
  function schedule(){
    clearInterval(timer); timer = null;
    if (document.visibilityState === "visible") timer = setInterval(load, REFRESH_MS);
  }

  $("refresh").addEventListener("click", load);
  $("cands").addEventListener("click", function(e){
    var b = e.target.closest(".cand > button"); if (!b) return;
    var card = b.parentNode, key = card.getAttribute("data-key"), det = card.querySelector(".detail");
    var on = card.getAttribute("data-open") !== "1";
    card.setAttribute("data-open", on ? "1" : "0"); b.setAttribute("aria-expanded", String(on)); det.hidden = !on;
    if (on) open[key] = 1; else delete open[key];
  });
  document.addEventListener("visibilitychange", function(){
    if (document.visibilityState === "visible" && Date.now() - loadedAt > REFRESH_MS) load();
    schedule();
  });
  setInterval(tick, 15000);

  try {
    var saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (saved && saved.data){ data = saved.data; loadedAt = saved.at; render({}); }
  } catch (e) {}
  load(); schedule();
})();
</script>
</body>
</html>
`;
