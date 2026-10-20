// DeVig Lab (owner only): GET /lab is a private phone dashboard -- what GitHub Actions is doing across this repo and how
// the Research Lab is going. The page reads /api/lab (functions/api/lab.js), which holds the data and the owner check.
//
// Anyone who isn't the signed-in owner gets the site's ordinary "page not found" (same as /api/lab), so the page is
// invisible. It is never linked from the app and isn't a static file, so it's not in the sitemap or manifest either.
//
// Signing in: Cloudflare Access guards only /login and sets its login cookie for the whole site (that's how /api/me
// sees it too). Open /login?next=/lab: after the email code it lands here. When the login runs out while the page is
// open, /api/lab starts answering 404 and the page shows a "Sign in again" button that goes the same way.
// The page also shows /login?next=/lab as its own address, so saving it to the Home Screen (or a bookmark) keeps that
// route rather than the bare /lab.
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
<link rel="apple-touch-icon" href="/icons/icon-180.png">
<meta name="apple-mobile-web-app-title" content="DeVig Lab">
<title>DeVig Lab</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  /* Design B ("minimal dark"), same tokens as tools/devig_source.html; layout follows the owner-approved Lab sketch */
  :root{
    --bg:#08090B; --surface:#111214; --surface-2:#18191D;
    --ink:#F4F4F5; --ink-soft:#A1A1AA; --ink-faint:#80808A;
    --accent:#E8A64E; --accent-strong:#F2BD78; --accent-ink:#1A1206; --accent-wash:#2A2013;
    --line:#1E1F24; --line-strong:#2C2D33;
    --good:#6EDC9A; --bad:#F08A8A; --bad-wash:#2E1515; --bad-line:#5A2626;
    --mono:'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,monospace;
    --sans:'IBM Plex Sans',system-ui,-apple-system,sans-serif;
    color-scheme:dark;
  }
  *{box-sizing:border-box}
  html,body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--sans);font-size:15px;line-height:1.45}
  body{max-width:560px;margin:0 auto;overflow-x:hidden;padding-bottom:env(safe-area-inset-bottom)}
  a{color:var(--accent)} a:hover{color:var(--accent-strong)}
  a:focus-visible,button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  .mono{font-family:var(--mono)} .soft{color:var(--ink-soft)} .faint{color:var(--ink-faint)}
  header{position:sticky;top:0;z-index:5;background:var(--bg);display:flex;align-items:center;justify-content:space-between;gap:12px;
         padding:calc(16px + env(safe-area-inset-top)) 20px 14px;border-bottom:1px solid var(--line)}
  .brand{display:flex;align-items:center;gap:10px;min-width:0}
  .dv-logo{width:30px;height:30px;flex:none;display:block}
  header h1{margin:0;font-size:18px;font-weight:700;letter-spacing:-.01em;line-height:1.2}
  #when{font-size:12px;color:var(--ink-soft)}
  .round{width:44px;height:44px;flex:none;border-radius:22px;border:1px solid var(--line-strong);background:var(--surface);color:var(--ink);
         display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0}
  .round svg{width:18px;height:18px}
  .spin svg{animation:spin 1s linear infinite} @keyframes spin{to{transform:rotate(360deg)}}
  @media (prefers-reduced-motion:reduce){.spin svg{animation:none}}
  main{display:flex;flex-direction:column;gap:18px;padding:16px 16px 28px}
  .card{background:var(--surface);border:1px solid var(--line);border-radius:18px}
  .pad{padding:18px}
  .note{padding:10px 12px;border-radius:12px;border:1px solid #5a4422;background:var(--accent-wash);color:var(--accent-strong);font-size:13px}
  .note a{display:inline-flex;align-items:center;min-height:44px;font-weight:600}
  .alert{text-decoration:none;display:flex;align-items:center;gap:12px;background:var(--bad-wash);border:1px solid var(--bad-line);
         border-radius:14px;padding:12px 14px;color:var(--ink);min-height:44px}
  .alert:hover{color:var(--ink)}
  .alert .grow{flex:1;min-width:0}
  .alert b{display:block;font-size:14px;font-weight:600;overflow-wrap:anywhere}
  .alert small{font-size:12px;color:#D9B3B3}
  .alert .go{font-size:13px;font-weight:600;color:var(--bad)}
  .alertwrap{position:relative}
  .alertwrap .alert{padding-right:56px}
  .alertx{position:absolute;top:50%;right:6px;transform:translateY(-50%);width:44px;height:44px;border:0;background:transparent;
          color:#D9B3B3;font-size:20px;line-height:1;cursor:pointer;border-radius:22px}
  .alertx:hover{background:#2a1515;color:var(--ink)}
  .kicker{font-size:12px;font-weight:600;color:var(--ink-soft);letter-spacing:.08em;text-transform:uppercase}
  .row{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
  .sumcard{display:flex;flex-direction:column;gap:16px}
  .nums{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
  .nums b{display:block;font-family:var(--mono);font-size:34px;font-weight:600;line-height:1}
  .nums span{font-size:12px;color:var(--ink-soft)}
  .seg{display:flex;height:10px;border-radius:5px;overflow:hidden;gap:2px}
  .legend{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12px;color:var(--ink-soft);margin-top:8px}
  .exam{display:flex;justify-content:space-between;align-items:center;background:var(--surface-2);border-radius:12px;padding:10px 12px;font-size:13px}
  .exam b{font-family:var(--mono);font-weight:600}
  .small{font-size:12px;color:var(--ink-faint);line-height:1.45}
  h2{margin:0;font-size:17px;font-weight:600}
  .sechead{display:flex;justify-content:space-between;align-items:baseline;gap:8px;padding:0 4px}
  .sechead .r{font-size:12px;color:var(--ink-faint);text-align:right}
  .stack{display:flex;flex-direction:column;gap:10px}
  .cand{text-decoration:none;color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:14px;
        display:flex;flex-direction:column;gap:12px}
  .cand:hover{color:var(--ink);border-color:var(--line-strong)}
  .cand.hi{border-color:#3A2E1A}
  .cand .top{display:flex;justify-content:space-between;align-items:center;gap:8px}
  .cand .nm{font-size:15px;font-weight:600;overflow-wrap:anywhere}
  .chips{display:flex;flex-wrap:wrap;gap:6px;font-size:11px;margin-top:6px}
  .chip{border:1px solid var(--line-strong);color:var(--ink-soft);border-radius:6px;padding:2px 7px;white-space:nowrap}
  .chip.s{border:0;font-weight:600}
  .sports{margin:0 0 10px}.sports .chip{background:none;font:inherit;font-size:13px;padding:6px 14px;cursor:pointer;min-height:44px}
  .sports .chip.on{border-color:var(--accent);color:var(--accent)}
  .s-lab_pass,.s-exam_pass{background:var(--accent-wash);color:var(--accent-strong)}
  .s-promoted{background:var(--accent);color:var(--accent-ink)}
  .s-running{background:var(--surface-2);color:var(--ink)}
  .s-failed,.s-exam_fail{background:var(--bad-wash);color:var(--bad)}
  .s-queued,.s-stopped{background:transparent;color:var(--ink-faint);border:1px dashed var(--line-strong)!important}
  .pips{display:flex;gap:5px;flex:none}
  .pips svg{width:20px;height:20px;display:block}
  .ival{display:flex;align-items:center;gap:10px}
  .ival svg{width:120px;height:16px;flex:none}
  .ival span{font-family:var(--mono);font-size:12px}
  .btn{min-height:44px;border-radius:14px;border:1px solid var(--line-strong);background:transparent;color:var(--ink);font:inherit;
       font-size:14px;font-weight:600;cursor:pointer;width:100%;display:flex;align-items:center;justify-content:center;text-decoration:none;padding:0 12px}
  .btn:hover{color:var(--ink);border-color:var(--ink-faint)}
  .btn.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink);font-weight:700;min-height:48px;font-size:15px}
  .btn.primary:hover{color:var(--accent-ink)}
  .tabs{position:sticky;top:0;z-index:5;display:flex;gap:4px;padding:6px 0;margin:4px 0 2px;background:var(--bg);overflow-x:auto;scrollbar-width:none}
  .tabs::-webkit-scrollbar{display:none}
  .tabs button{flex:1 1 0;min-width:0;background:none;border:1px solid var(--line);border-radius:999px;color:var(--ink-soft);font:inherit;font-size:13px;
    font-weight:600;padding:0 6px;min-height:44px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .tabs button[aria-selected="true"]{background:var(--accent);border-color:var(--accent);color:#1A1206}
  .tabs .ct{font-family:var(--mono);font-weight:500;opacity:.75;margin-left:3px}
  .tabs .nw{display:inline-block;min-width:18px;border-radius:9px;background:var(--good);color:#06150c;font-size:11px;padding:1px 5px;margin-left:5px}
  .filt{display:flex;gap:6px;overflow-x:auto;padding:2px 0 4px;scrollbar-width:none}
  .filt::-webkit-scrollbar{display:none}
  .filt button{flex:none;background:var(--surface);border:1px solid var(--line-strong);border-radius:999px;color:var(--ink-soft);font:inherit;font-size:13px;
    padding:0 12px;min-height:36px;cursor:pointer}
  .filt button[aria-pressed="true"]{border-color:var(--accent);color:var(--accent)}
  .pane[hidden]{display:none}
  .lessons{display:flex;flex-direction:column;gap:8px}
  .lesson .when{display:flex;justify-content:space-between;gap:8px;font-size:12px;color:var(--ink-faint);margin-top:8px}
  .lesson .new{background:var(--good);color:#06150c;border-radius:6px;font-size:10.5px;font-weight:700;padding:1px 6px;letter-spacing:.04em}
  .lesson a{color:var(--accent);text-decoration:none}
  .lesson{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:14px;
          display:flex;flex-direction:column;gap:8px}
  .lesson .k{font-size:11px;font-weight:600;letter-spacing:.06em}
  .lesson .t{font-size:14px;line-height:1.45}
  .k-helped{color:var(--good)} .k-faded{color:var(--bad)} .k-no_effect{color:var(--ink-soft)}
  .promo .tag{font-size:11px;font-weight:700;color:var(--accent-ink);background:var(--accent);padding:2px 8px;border-radius:6px;display:inline-block}
  .promo .rec{font-family:var(--mono);font-size:22px;font-weight:600;margin-top:4px}
  .gh{display:flex;flex-direction:column;overflow:hidden;border-radius:16px}
  .gh .grp{padding:14px 14px 6px;font-size:11px;font-weight:600;color:var(--ink-faint);letter-spacing:.08em;text-transform:uppercase;border-top:1px solid var(--line)}
  .gh .grp:first-child{border-top:0;padding-top:12px}
  .wf{text-decoration:none;color:var(--ink);display:flex;align-items:center;gap:12px;min-height:52px;padding:8px 14px;border-top:1px solid var(--line)}
  .wf:hover{color:var(--ink);background:var(--surface-2)}
  .wf.bad{background:#1A0F0F}
  .wf svg{width:12px;height:12px;flex:none}
  .wf .n{flex:1;min-width:0;font-size:14px;overflow-wrap:anywhere}
  .wf .m{font-size:12px;color:var(--ink-soft);font-family:var(--mono);white-space:nowrap;text-align:right}
  .wf.bad .m{color:var(--bad)} .wf.run .m{color:var(--accent)}
  .gh .more{border:0;border-top:1px solid var(--line);border-radius:0;color:var(--ink-soft);font-size:13px;min-height:48px}
  .runs{display:flex;flex-direction:column;overflow:hidden;border-radius:16px}
  .runs .hd{padding:14px;display:flex;flex-direction:column;gap:4px}
  .runs .hd a{font-weight:600;text-decoration:none}
  .runs .sum{font-size:13px;color:var(--ink-soft)}
  .step{display:flex;gap:10px;align-items:flex-start;padding:10px 14px;border-top:1px solid var(--line);text-decoration:none;color:var(--ink)}
  .step:hover{color:var(--ink);background:var(--surface-2)}
  .step .tm{font-family:var(--mono);font-size:12px;color:var(--ink-faint);flex:none;width:62px;padding-top:2px}
  .step .bd{flex:1;min-width:0}
  .step .nm{font-size:14px;font-weight:600;overflow-wrap:anywhere}
  .step .tx{font-family:var(--mono);font-size:11px;color:var(--ink-soft);overflow-wrap:anywhere;margin-top:2px}
  .step .chip,.step .pips{flex:none;margin-top:1px}
  .runs .more{border:0;border-top:1px solid var(--line);border-radius:0;color:var(--ink-soft);font-size:13px;min-height:48px}
  .funnel{display:flex;flex-wrap:wrap;align-items:center;gap:8px 6px;padding:0 14px 14px}
  .funnel .f{display:flex;flex-direction:column;min-width:0}
  .funnel b{font-family:var(--mono);font-size:22px;font-weight:600;line-height:1.1}
  .funnel span{font-size:11px;color:var(--ink-soft)}
  .funnel .ar{color:var(--ink-faint);font-size:14px;padding:0 2px}
  .older{display:flex;flex-direction:column;gap:2px;padding:0 4px}
  .older a,.older span{font-size:12px;color:var(--ink-soft);text-decoration:none;min-height:32px;display:flex;align-items:center}
  .empty{text-align:center;padding:26px 18px}
  .empty b{display:block;font-size:16px;margin-top:8px}
  .empty p{margin:6px 0 0;color:var(--ink-soft);font-size:14px}
  footer{display:flex;flex-wrap:wrap;gap:0 16px;padding:4px 4px 0;font-size:13px}
  footer a{display:inline-flex;align-items:center;min-height:44px}
  footer .only{flex-basis:100%;font-size:12px;color:var(--ink-faint)}
  /* candidate detail */
  .back{color:var(--ink-soft);text-decoration:none;min-height:44px;display:inline-flex;align-items:center;gap:4px;padding:0 8px 0 0;font-size:14px}
  .back svg{width:18px;height:18px}
  .dtitle{margin:0;font-size:26px;font-weight:700;letter-spacing:-.01em;overflow-wrap:anywhere}
  .reason{font-size:14px;color:var(--ink-soft);line-height:1.5}
  .ig{border:1px solid var(--accent);background:#1A140B;border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:6px}
  .ig .k{font-size:12px;color:var(--accent-strong);font-weight:600;letter-spacing:.06em}
  .ig .v{font-size:16px;font-weight:600;line-height:1.4}
  .gates{padding:16px;display:flex;flex-direction:column;gap:14px}
  .gates h2{font-size:15px}
  .scale{display:flex;justify-content:space-between;font-family:var(--mono);font-size:11px;color:var(--ink-faint);padding:0 2px}
  .gate .row{font-size:13px}
  .gate .row b{font-weight:600}
  .gate .row .mono{text-align:right}
  .gate svg{width:100%;height:18px;display:block;margin-top:6px}
  .gate.pool{padding-top:10px;border-top:1px solid var(--line)}
  .gate.pool b{font-weight:700;color:var(--accent-strong)}
  .gate.pool svg{height:22px}
  .checks .ck{display:flex;gap:12px;align-items:flex-start;padding:14px 16px;border-top:1px solid var(--line)}
  .checks .ck:first-child{border-top:0}
  .ck .g{font-weight:700;width:14px;flex:none;text-align:center}
  .ck .t{font-size:14px;font-weight:600}
  .ck .d{font-size:12px;color:var(--ink-soft)}
  .sealed{background:var(--surface);border:1px dashed var(--line-strong);border-radius:18px;padding:16px;display:flex;flex-direction:column;gap:8px}
  .sealed .h{display:flex;align-items:center;gap:10px;font-size:15px;font-weight:600}
  .sealed .h svg{width:20px;height:20px}
  .sealed p{margin:0;font-size:13px;color:var(--ink-soft);line-height:1.5}
</style>
</head>
<body>
<header>
  <div class="brand">${LOGO}<div><h1>Lab</h1><div id="when" aria-live="polite">Loading…</div></div></div>
  <button class="round" id="refresh" type="button" aria-label="Refresh">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>
  </button>
</header>
<main id="main"></main>
<script>
(function(){
  "use strict";
  // Show the sign-in route as this page's address, so a bookmark or Home Screen icon saves /login?next=/lab: opening
  // it signs in again when the login has run out (instead of the bare /lab, which then looks like a missing page).
  try { if (location.pathname === "/lab") history.replaceState(null, "", "/login?next=/lab" + location.hash); } catch (e) {}
  var KEY = "devig-lab-last", REFRESH_MS = 60000, REPO = "https://github.com/DeVig-AI/AI-Bettor-Model";
  var data = null, loadedAt = 0, loading = false, timer = null, problem = {};
  var showAllCands = false, showAllWf = false, showAllSteps = false, REFRESH_LIVE = 15000;
  // the overview's tabs and filters (remembered on this device); lessons newer than the last visit are marked New
  function getLS(k, d){ try { return localStorage.getItem(k) || d; } catch (e) { return d; } }
  function setLS(k, v){ try { localStorage.setItem(k, v); } catch (e) {} }
  var labTab = getLS("labTab", "cands"), candFilter = "all", lessonFilter = "all";
  var lessonsSeen = getLS("labLessonsSeen", "");          // what "New" is measured from during this visit
  var lessonsSeenNext = lessonsSeen;
  var $ = function(id){ return document.getElementById(id); };
  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function gh(u){ return typeof u === "string" && /^https:\\/\\/github\\.com\\//.test(u) ? u : null; }
  function secs(iso){ var t = Date.parse(iso); return t ? Math.max(0, (Date.now() - t) / 1000) : null; }
  function ago(iso, short){
    var s = secs(iso); if (s == null) return "—";
    if (s < 60) return "just now";
    if (s < 3600) return Math.floor(s / 60) + (short ? "m" : " min") + " ago";
    if (s < 86400) return Math.floor(s / 3600) + (short ? "h" : " h") + " ago";
    return Math.floor(s / 86400) + (short ? "d" : " d") + " ago";
  }
  function dur(s){
    if (s == null) return "";
    if (s < 60) return s + "s";
    if (s < 3600) return Math.round(s / 60) + "m";
    return Math.floor(s / 3600) + "h " + Math.round(s % 3600 / 60) + "m";
  }
  function n(v){ return typeof v === "number" ? v : 0; }
  function sgn(v, d){ if (typeof v !== "number") return "—"; var t = Math.abs(v).toFixed(d);
    return (v > 0 && +t ? "+" : v < 0 && +t ? "−" : "") + t; }
  function pct(v, d){ return typeof v === "number" ? (v * 100).toFixed(d == null ? 1 : d) + "%" : "—"; }

  // ---- shapes --------------------------------------------------------------------------------------------------
  var PIP = {
    pass: '<circle cx="10" cy="10" r="9" fill="#6EDC9A"/><path d="M6 10.5l2.6 2.5L14 7.5" fill="none" stroke="#08090B" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    fail: '<circle cx="10" cy="10" r="8" fill="none" stroke="#F08A8A" stroke-width="2"/><path d="M7 7l6 6M13 7l-6 6" stroke="#F08A8A" stroke-width="2" stroke-linecap="round"/>',
    run:  '<circle cx="10" cy="10" r="8" fill="none" stroke="#E8A64E" stroke-width="2" stroke-dasharray="3 3"/>',
    wait: '<circle cx="10" cy="10" r="8" fill="none" stroke="#2C2D33" stroke-width="2"/>'
  };
  var PIPWORD = {pass: "passed", fail: "failed", run: "running", wait: "waiting"};
  function gateKinds(c){
    var g = (c.gates || []).slice(0, 3), out = [];
    var runAt = c.state === "running" ? (typeof c.gate_now === "number" ? c.gate_now - 1 : -1) : -2;
    for (var i = 0; i < 3; i++){
      var x = g[i];
      if (x && x.passed === true) out.push("pass");
      else if (x && x.passed === false) out.push("fail");
      else {
        if (runAt === -1) runAt = i;               // running, no gate given: the first one not done
        out.push(i === runAt ? "run" : "wait");
      }
    }
    return out;
  }
  function pips(c){
    var k = gateKinds(c);
    return '<div class="pips" role="img" aria-label="Gates: ' + k.map(function(x){ return PIPWORD[x]; }).join(", ") + '">' +
      k.map(function(x){ return '<svg viewBox="0 0 20 20" aria-hidden="true">' + PIP[x] + '</svg>'; }).join("") + '</div>';
  }
  var STATE = {
    queued: "◌ Queued", running: "● Running", failed: "✕ Failed", lab_pass: "★ Lab pass", exam_pass: "★ Exam pass",
    exam_fail: "✕ Exam fail", promoted: "▲ Promoted", stopped: "■ Stopped"
  };
  function stateChip(c){
    var t = STATE[c.state] || STATE.queued;
    if (c.state === "running"){ var k = gateKinds(c).indexOf("run"); if (k >= 0) t += " · gate " + (k + 1); }
    if ((c.state === "failed" || c.state === "exam_fail") && c.fail_reason) t += " · " + c.fail_reason;
    return '<span class="chip s s-' + esc(c.state) + '">' + esc(t) + '</span>';
  }
  function marketName(m){ return {spread: "Spread", total: "Total", props: "Props"}[m] || "Other"; }

  // one scale for every interval bar, so cards compare at a glance; at least ±1 (±4 on the detail screen)
  function scaleOf(cands, floor){
    var m = floor;
    cands.forEach(function(c){
      [c.pooled].concat(c.gates || []).forEach(function(g){
        if (!g) return;
        [g.effect].concat(g.ci || []).forEach(function(v){ if (typeof v === "number") m = Math.max(m, Math.abs(v)); });
      });
    });
    return Math.ceil(m);
  }
  function decimals(scale){ return scale <= 1 ? 3 : 1; }
  function bar(g, scale, w, h, big, passed){
    var x = function(v){ return (w / 2 + Math.max(-1, Math.min(1, v / scale)) * (w / 2 - 8)).toFixed(1); };
    var lo = g.ci ? g.ci[0] : g.effect, hi = g.ci ? g.ci[1] : g.effect, y = h / 2;
    var col = lo > 0 ? "#E8A64E" : hi < 0 ? "#F08A8A" : "#80808A";
    var dot = lo > 0 ? "#F2BD78" : hi < 0 ? "#F08A8A" : "#A1A1AA";
    if (passed === true) col = dot = "#6EDC9A"; else if (passed === false) col = dot = "#F08A8A";   // a gate: its verdict
    var op = passed === true || passed === false ? ' opacity="0.55"' : "";
    return '<line x1="0" y1="' + y + '" x2="' + w + '" y2="' + y + '" stroke="#1E1F24" stroke-width="2"/>' +
      '<line x1="' + w / 2 + '" y1="0" x2="' + w / 2 + '" y2="' + h + '" stroke="#80808A"/>' +
      '<line x1="' + x(lo) + '" y1="' + y + '" x2="' + x(hi) + '" y2="' + y + '" stroke="' + col + '" stroke-width="' + (big ? 7 : passed != null ? 5 : 4) + '" stroke-linecap="round"' + op + '/>' +
      '<circle cx="' + x(g.effect) + '" cy="' + y + '" r="' + (big ? 8 : 5) + '" fill="' + dot + '"/>';
  }
  function effText(g, unit, d){
    return sgn(g.effect, d) + (unit ? " " + esc(unit) : "") + (g.ci ? ' <span class="faint">[' + sgn(g.ci[0], d) + ", " + sgn(g.ci[1], d) + "]</span>" : "");
  }

  // ---- overview --------------------------------------------------------------------------------------------------
  // The banner can be closed (✕). It stays closed on this phone until a workflow fails in a run not seen before.
  var DISMISS = "devig-lab-dismissed";
  function failKey(w){ return w.id + ":" + (w.last && w.last.id); }
  function dismissed(){ try { return JSON.parse(localStorage.getItem(DISMISS) || "[]"); } catch (e) { return []; } }
  function failingNow(g){
    return (g && g.workflows || []).filter(function(w){ return (g.failing || []).indexOf(w.id) >= 0; });
  }
  function viewAlert(g){
    if (!g || !g.workflows) return "";
    var gone = dismissed();
    var bad = failingNow(g).filter(function(w){ return gone.indexOf(failKey(w)) < 0; });
    if (!bad.length) return "";
    var total = g.workflows.filter(function(w){ return !w.disabled; }).length;
    return '<div class="alertwrap"><a class="alert" href="#activity" role="alert">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F08A8A" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 3l10 18H2z"/><path d="M12 10v5"/><path d="M12 18v.5"/></svg>' +
      '<span class="grow"><b>' + esc(shortName(bad[0].name)) + (bad.length > 1 ? " and " + (bad.length - 1) + " more" : "") + ' failed</b>' +
      '<small>' + esc(ago(bad[0].last && bad[0].last.started_at)) + " · " + bad.length + " of " + total + ' workflows red</small></span>' +
      '<span class="go">View</span></a>' +
      '<button class="alertx" type="button" id="alertx" aria-label="Close this alert">✕</button></div>';
  }

  function counted(s){
    var by = {}; (s.candidates || []).forEach(function(c){ by[c.state] = (by[c.state] || 0) + 1; });
    return by;
  }
  function viewSummary(s){
    var c = s.counts || {}, by = counted(s);
    var segs = [
      ["failed", n(by.failed) + n(by.exam_fail) + n(by.stopped), "#5A2626", "#F08A8A", "■"],
      ["running", n(by.running), "#2C2D33", "#80808A", "■"],
      ["lab pass", n(by.lab_pass) + n(by.exam_pass) + n(by.promoted), "#E8A64E", "#E8A64E", "■"],
      ["queued", n(by.queued), "#1E1F24", "#80808A", "□"]
    ].filter(function(x){ return x[1] > 0; });
    var tried = typeof c.tried === "number" ? c.tried : (s.candidates || []).length;
    var examName = s.exam_name || "Sealed exam";
    var left = typeof c.exam_budget_left === "number" ? c.exam_budget_left : null;
    var tot = typeof c.exam_budget_total === "number" ? c.exam_budget_total : null;
    return '<section class="card pad sumcard" aria-label="Research summary">' +
      '<div class="row"><div class="kicker">Research' + (s.scope ? " · " + esc(s.scope) : "") + '</div>' +
      (s.constitution && s.constitution.version ? '<div class="mono faint" style="font-size:12px">Constitution ' + esc(s.constitution.version) + '</div>' : "") + '</div>' +
      '<div class="nums"><div><b>' + tried + '</b><span>tried</span></div>' +
      '<div><b style="color:var(--accent)">' + n(c.lab_pass) + '</b><span>passed lab</span></div>' +
      '<div><b>' + n(c.exam_pass) + '</b><span>passed exam</span></div></div>' +
      (segs.length ? '<div><div class="seg" role="img" aria-label="' + esc(segs.map(function(x){ return x[1] + " " + x[0]; }).join(", ")) + '">' +
        segs.map(function(x){ return '<div style="flex-grow:' + x[1] + ";background:" + x[2] + (x[0] === "queued" ? ";border:1px dashed #2C2D33" : "") + '"></div>'; }).join("") +
        '</div><div class="legend" aria-hidden="true">' + segs.map(function(x){ return '<span><span style="color:' + x[3] + '">' + x[4] + "</span> " + x[1] + " " + x[0] + "</span>"; }).join("") + '</div></div>' : "") +
      '<div class="exam"><span class="soft">' + esc(examName) + '</span><b>' + (left == null ? "—" : left + (tot == null ? "" : " of " + tot) + " left") + '</b></div>' +
      '<div class="small">Bar to pass rises with every attempt (adjusted for ' + tried + ' tries).' + (s.note ? " " + esc(s.note) : "") +
      ' <span class="faint">Lab status ' + esc(ago(s.updated_at)) + '.</span></div></section>';
  }

  var ORDER = {promoted: 0, exam_pass: 1, lab_pass: 2, running: 3, exam_fail: 4, failed: 5, stopped: 6, queued: 7};
  function sorted(cands){
    return cands.slice().sort(function(a, b){
      return (ORDER[a.state] - ORDER[b.state]) || ((Date.parse(b.updated_at) || 0) - (Date.parse(a.updated_at) || 0));
    });
  }
  function candCard(c, scale, unit){
    var d = decimals(scale), hi = c.state === "lab_pass" || c.state === "exam_pass" || c.state === "promoted";
    var bottom;
    if (c.state === "running" || c.state === "queued"){
      var left = Date.parse(c.eta_at) ? Math.max(1, Math.round((Date.parse(c.eta_at) - Date.now()) / 60000)) : null;
      bottom = '<div class="small">' + (c.state === "queued" ? "Waiting to start" : (c.started_at ? "Started " + esc(ago(c.started_at)) + " on GitHub" : "Running on GitHub") +
        (left != null ? " · about " + left + " min left" : "")) + '</div>';
    } else if (c.pooled && typeof c.pooled.effect === "number"){
      bottom = '<div class="ival"><svg viewBox="0 0 120 16" aria-hidden="true">' + bar(c.pooled, scale, 120, 16) + '</svg>' +
        '<span' + (c.pooled.ci && c.pooled.ci[0] > 0 ? "" : ' class="soft"') + '>' + effText(c.pooled, unit, d) + '</span></div>';
    } else bottom = '<div class="small">No pooled result yet</div>';
    return '<a class="cand' + (hi ? " hi" : "") + '" href="#c/' + encodeURIComponent(c.id || c.name) + '">' +
      '<div class="top"><div style="min-width:0"><div class="nm">' + esc(c.name) + '</div>' +
      '<div class="chips"><span class="chip">' + marketName(c.market) + '</span>' + stateChip(c) + '</div></div>' + pips(c) + '</div>' +
      bottom + '</a>';
  }
  var CF = {passed: ["lab_pass", "exam_pass", "promoted"], failed: ["failed", "exam_fail", "stopped"], waiting: ["running", "queued"]};
  function viewCandidates(s){
    var all = sorted(s.candidates || []);
    if (!all.length) return "";
    var cnt = {all: all.length, passed: 0, failed: 0, waiting: 0};
    all.forEach(function(c){ Object.keys(CF).forEach(function(k){ if (CF[k].indexOf(c.state) >= 0) cnt[k]++; }); });
    var cands = all.filter(function(c){ return candFilter === "all" || (CF[candFilter] || []).indexOf(c.state) >= 0; });
    var filt = '<div class="filt" role="group" aria-label="Show candidates">' + [["all", "All"], ["passed", "Passed"], ["failed", "Failed"], ["waiting", "Running / queued"]].map(function(f){
      return '<button type="button" data-cf="' + f[0] + '" aria-pressed="' + (candFilter === f[0]) + '">' + f[1] + ' ' + cnt[f[0]] + '</button>';
    }).join("") + '</div>';
    if (!cands.length) return '<section class="stack" aria-labelledby="h-c"><div class="sechead"><h2 id="h-c">Candidates</h2></div>' + filt +
      '<div class="small" style="padding:0 4px">None in this group.</div></section>';
    var scale = scaleOf(cands, 1), unit = s.effect_unit || "pts", SHOW = 4;
    var shown = showAllCands ? cands : cands.slice(0, SHOW), rest = cands.slice(SHOW);
    var gnames = ((cands[0].gates || []).slice(0, 3)).map(function(g){ return g.name; }).filter(Boolean);
    var more = "";
    if (rest.length && !showAllCands){
      var by = {}; rest.forEach(function(c){ var k = (STATE[c.state] || "").replace(/^\\S+ /, "").toLowerCase(); by[k] = (by[k] || 0) + 1; });
      more = '<button class="btn" type="button" id="morecands">Show ' + rest.length + " more · " +
        Object.keys(by).map(function(k){ return by[k] + " " + k; }).join(", ") + '</button>';
    }
    return '<section class="stack" aria-labelledby="h-c"><div class="sechead"><h2 id="h-c">Candidates</h2>' +
      (gnames.length ? '<div class="r">gates ' + esc(gnames.join(" · ")) + '</div>' : "") + '</div>' + filt +
      shown.map(function(c){ return candCard(c, scale, unit); }).join("") + more + '</section>';
  }
  function clock(iso){
    var t = Date.parse(iso); if (!t) return "";
    var d = new Date(t), p = function(v){ return (v < 10 ? "0" : "") + v; };
    return p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
  }
  function stepChip(t){
    if (t.state === "info") return "";
    var w = (STATE[t.state] || "").replace(/^\\S+ /, "");
    if ((t.state === "failed" || t.state === "exam_fail") && t.fail_reason) w += " · " + t.fail_reason;
    return '<span class="chip s s-' + esc(t.state) + '">' + esc(w) + '</span>';
  }
  function viewRuns(s){
    var runs = s.runs || [];
    if (!runs.length) return "";
    var r = runs[0], steps = r.steps || [], SHOWN = 6;
    var live = !r.finished_at;
    var head = '<div class="hd"><div class="row"><span class="kicker">' + (live ? "Running now" : "Last run") + '</span>' +
      '<span class="mono faint" style="font-size:12px">' + esc(ago(r.started_at)) + (r.duration_s != null ? " · took " + dur(r.duration_s) : "") + '</span></div>' +
      (gh(r.run_url) ? '<a href="' + esc(r.run_url) + '" rel="noreferrer">' + esc(r.name) + ' on GitHub</a>' : '<b>' + esc(r.name) + '</b>') +
      (r.funnel && r.funnel.length ? "" : '<div class="sum">' + esc(r.summary) + '</div>') + '</div>' +
      (r.funnel && r.funnel.length ? '<div class="funnel" role="img" aria-label="' + esc(r.summary) + '">' +
        r.funnel.map(function(f, i){
          return (i ? '<span class="ar" aria-hidden="true">→</span>' : "") + '<div class="f"><b' +
            (i && f.count > 0 && i === r.funnel.length - 1 ? ' style="color:var(--accent)"' : "") + '>' +
            esc(typeof f.count === "number" ? f.count.toLocaleString() : "—") + '</b><span>' + esc(f.label) + '</span></div>';
        }).join("") + '</div>' : "");
    var list = (showAllSteps ? steps : steps.slice(0, SHOWN)).map(function(t){
      return '<a class="step" href="#c/' + encodeURIComponent(t.id) + '"><span class="tm">' + esc(clock(t.at)) + '</span>' +
        '<span class="bd"><span class="nm">' + esc(t.name || t.id) + '</span><div class="tx">' + esc(t.text) + '</div></span>' +
        (t.gates && t.gates.length ? pips({state: t.state, gates: t.gates.map(function(g){ return {passed: g}; })}) : stepChip(t)) + '</a>';
    }).join("");
    var more = steps.length > SHOWN && !showAllSteps ? '<button class="btn more" type="button" id="moresteps">Show all ' + steps.length + ' steps</button>' : "";
    var older = runs.slice(1, 6).map(function(o){
      var t = esc(o.name) + " · " + esc(ago(o.started_at)) + " · " + esc(o.summary);
      return gh(o.run_url) ? '<a href="' + esc(o.run_url) + '" rel="noreferrer">' + t + '</a>' : '<span>' + t + '</span>';
    }).join("");
    return '<section class="stack" aria-labelledby="h-r"><div class="sechead"><h2 id="h-r">What the lab did</h2>' +
      '<div class="r">counts only</div></div><div class="card runs">' + head + list + more + '</div>' +
      (older ? '<div class="older"><div class="small">Earlier</div>' + older + '</div>' : "") + '</section>';
  }
  function when(iso){
    var t = Date.parse(iso); if (!t) return "";
    return new Date(t).toLocaleString([], {month: "short", day: "numeric", hour: "numeric", minute: "2-digit"});
  }
  function isNew(l){ return !!(lessonsSeen && l.at && l.at > lessonsSeen); }
  function viewLessons(s){
    var les = (s.lessons || []).slice().sort(function(a, b){ return String(b.at || "").localeCompare(String(a.at || "")); });
    var names = {}; (s.candidates || []).forEach(function(c){ names[c.id] = c.name; });
    var K = {helped: "▲ HELPED", faded: "▼ FADED", no_effect: "● NO EFFECT"};
    var cnt = {all: les.length, helped: 0, faded: 0, no_effect: 0};
    les.forEach(function(l){ cnt[l.kind] = (cnt[l.kind] || 0) + 1; });
    var shown = les.filter(function(l){ return lessonFilter === "all" || l.kind === lessonFilter; });
    var newest = les.length && les[0].at ? les[0].at : null;
    var filt = '<div class="filt" role="group" aria-label="Show lessons">' + [["all", "All"], ["helped", "Helped"], ["faded", "Faded"], ["no_effect", "No effect"]].map(function(f){
      return '<button type="button" data-lf="' + f[0] + '" aria-pressed="' + (lessonFilter === f[0]) + '">' + f[1] + ' ' + n(cnt[f[0]]) + '</button>';
    }).join("") + '</div>';
    return '<section class="stack" aria-labelledby="h-l"><div class="sechead"><h2 id="h-l">Lessons</h2>' +
      '<div class="r" style="color:var(--accent);font-weight:600">Exploratory · not proof</div></div>' +
      '<div class="small" style="padding:0 4px">' + (newest ? "Newest " + esc(when(newest)) + " · " + esc(ago(newest)) : "No lessons yet") +
      " · lab status " + esc(ago(s.updated_at)) + '</div>' + (les.length ? filt : "") +
      '<div class="lessons" aria-label="Lessons, newest first">' + shown.map(function(l){
        var from = (l.candidates || []).map(function(id){ return '<a href="#c/' + encodeURIComponent(id) + '">' + esc(names[id] || id) + '</a>'; });
        return '<div class="lesson"><div class="k k-' + esc(l.kind) + '">' + (K[l.kind] || K.no_effect) + '</div><div class="t">' + esc(l.text) + '</div>' +
          '<div class="when"><span>' + (from.length ? "from " + from.join(", ") : "") + '</span><span>' + (isNew(l) ? '<span class="new">NEW</span> ' : "") +
          (l.at ? esc(when(l.at)) + " · " + esc(ago(l.at)) : "time not recorded") + '</span></div></div>';
      }).join("") + (les.length && !shown.length ? '<div class="small">None in this group.</div>' : "") + '</div></section>';
  }
  function viewPromoted(s){
    var pro = s.promoted || [];
    if (!pro.length) return "";
    return '<section class="stack" aria-labelledby="h-p"><div class="sechead"><h2 id="h-p">Promoted models</h2></div>' + pro.map(function(p){
      var w = n(p.wins), l = n(p.losses), rate = w + l ? w / (w + l) : null;
      var vs = typeof p.roi === "number" ? (p.roi > 0 ? "above break-even" : p.roi < 0 ? "below break-even" : "at break-even") : "";
      return '<div class="card pad promo"><span class="tag">Promoted, not proven</span><div style="font-weight:600;margin-top:10px">' + esc(p.name) + '</div>' +
        '<div class="rec">' + w + "–" + l + (rate == null ? "" : ' <span class="soft" style="font-size:14px">' + pct(rate) + '</span>') + '</div>' +
        '<div class="soft" style="font-size:13px">' + (p.picks == null ? "" : esc(p.picks) + " picks · ") + "ROI " + (typeof p.roi === "number" ? sgn(p.roi * 100, 1) + "%" : "—") + (vs ? " · " + vs : "") + '</div>' +
        (p.vs_kalshi_note ? '<div class="small" style="margin-top:6px">' + esc(p.vs_kalshi_note) + '</div>' : "") + '</div>';
    }).join("") + '</section>';
  }

  var GLYPH = {
    success: '<circle cx="6" cy="6" r="5" fill="#6EDC9A"/>',
    failed: '<path d="M2 2l8 8M10 2l-8 8" stroke="#F08A8A" stroke-width="2.4" stroke-linecap="round"/>',
    running: '<circle cx="6" cy="6" r="4.5" fill="none" stroke="#E8A64E" stroke-width="2" stroke-dasharray="2.5 2"/>',
    queued: '<circle cx="6" cy="6" r="4.5" fill="none" stroke="#80808A" stroke-width="1.5" stroke-dasharray="1.5 2"/>',
    cancelled: '<path d="M2 6h8" stroke="#80808A" stroke-width="2.4" stroke-linecap="round"/>',
    skipped: '<path d="M2 6h8" stroke="#80808A" stroke-width="2.4" stroke-linecap="round"/>',
    none: '<circle cx="6" cy="6" r="4.5" fill="none" stroke="#2C2D33" stroke-width="1.5"/>'
  };
  var WORD = {success: "succeeded", failed: "failed", running: "running", queued: "queued", cancelled: "cancelled", skipped: "skipped", none: "no recent run"};
  function shortName(name){ return String(name || "").replace(/\\s*\\((?:[^)]*)\\)\\s*$/, ""); }
  function wfRow(w){
    var r = w.last, st = r ? r.state : "none", u = gh(r && r.url) || gh(w.url);
    var m = !r ? "no recent run" : st === "running" ? "running " + dur(Math.round(secs(r.started_at) || 0)) :
      st === "queued" ? "queued " + ago(r.started_at, true) : st === "failed" ? "failed " + ago(r.started_at, true).replace(" ago", "") :
      ago(r.started_at, true) + (r.duration_s != null ? " · " + dur(r.duration_s) : "") + (st !== "success" ? " · " + WORD[st] : "");
    return '<a class="wf' + (st === "failed" ? " bad" : st === "running" ? " run" : "") + '" href="' + esc(u) + '" rel="noreferrer">' +
      '<svg viewBox="0 0 12 12" role="img" aria-label="' + esc(WORD[st]) + '">' + (GLYPH[st] || GLYPH.none) + '</svg>' +
      '<span class="n">' + esc(shortName(w.name)) + (w.disabled ? ' <span class="faint">(disabled)</span>' : "") + '</span><span class="m">' + esc(m) + '</span></a>';
  }
  function viewGithub(g){
    var head = '<div class="sechead"><h2 id="h-gh">GitHub activity</h2>';
    if (!g || !g.workflows){
      return '<section class="stack" id="activity" aria-labelledby="h-gh">' + head + '</div><div class="card empty"><b>Couldn’t read GitHub Actions</b><p>' +
        esc((g && g.error) || "No answer yet.") + '</p></div></section>';
    }
    var wfs = g.workflows, bad = wfs.filter(function(w){ return w.last && w.last.state === "failed" && !w.disabled; }).length;
    var ok = wfs.filter(function(w){ return w.last && w.last.state === "success"; }).length;
    var PER = 3, hidden = 0, body = "";
    ["Research", "Props", "Games & App"].forEach(function(name){
      var rows = wfs.filter(function(w){ return w.group === name; });
      if (!rows.length) return;
      var show = showAllWf ? rows : rows.filter(function(w, i){
        var st = w.last ? w.last.state : "none";
        return i < PER || st === "failed" || st === "running" || st === "queued";
      });
      hidden += rows.length - show.length;
      if (show.length) body += '<div class="grp">' + esc(name) + '</div>' + show.map(wfRow).join("");
    });
    if (hidden) body += '<button class="btn more" type="button" id="morewf">Show all ' + wfs.length + ' workflows</button>';
    return '<section class="stack" id="activity" aria-labelledby="h-gh">' + head + '<div class="r">' + ok + " ok" + (bad ? " · " + bad + " failed" : "") + '</div></div>' +
      (g.stale ? '<div class="note">GitHub didn’t answer (' + esc(g.error || "error") + ') — runs as of ' + esc(ago(g.fetched_at)) + '.</div>' : "") +
      '<div class="card gh">' + body + '</div>' +
      '<div class="small" style="padding:0 4px">From GitHub ' + esc(ago(g.fetched_at)) + (g.authed ? "" : " · no token, 60 requests/hour") + '</div></section>';
  }
  function viewFooter(s){
    var L = (s && s.links) || {};
    return '<footer><a href="' + esc(gh(L.constitution) || REPO + "/blob/main/research/CONSTITUTION.md") + '" rel="noreferrer">Constitution</a>' +
      '<a href="' + esc(gh(L.ledger) || REPO + "/tree/main/research") + '" rel="noreferrer">Ledger</a>' +
      '<a href="' + esc(gh(L.lessons) || REPO + "/tree/main/research") + '" rel="noreferrer">Lessons file</a>' +
      '<a href="' + REPO + '/actions" rel="noreferrer">All runs on GitHub</a>' +
      '<span class="only">Only you can see this page.</span></footer>';
  }
  function viewNotes(){
    var h = "";
    if (problem.signin) h += '<div class="note" role="status">Your sign-in ran out. <a href="/login?next=/lab">Sign in again</a></div>';
    if (problem.offline) h += '<div class="note" role="status">Couldn’t reach the server — showing what loaded ' + esc(ago(problem.offline)) + ' (stale).</div>';
    return h;
  }
  // Sports: the top level of status.json is one sport (NFL); other sports sit in by_sport. The choice is kept per viewer.
  var labSport = (function(){ try { return localStorage.getItem("labSport") || ""; } catch (e) { return ""; } })();
  function sportStatus(top){
    if (!top) return top;
    var by = top.by_sport || {};
    return labSport && labSport !== top.sport && by[labSport] ? by[labSport] : top;
  }
  function viewSports(top){
    var list = (top && top.sports) || [];
    if (list.length < 2) return "";
    var cur = sportStatus(top).sport || top.sport;
    return '<div class="chips sports" role="tablist" aria-label="Sport">' + list.map(function(x){
      return '<button type="button" role="tab" class="chip' + (x.key === cur ? " on" : "") + '" aria-selected="' + (x.key === cur) +
        '" data-sport="' + esc(x.key) + '">' + esc(x.name) + '</button>';
    }).join("") + '</div>';
  }
  function viewAttempts(s){
    var a = s.attempts;
    if (!a || typeof a.all_sports !== "number") return "";
    return '<div class="small faint">Correction counts this sport’s ' + n(a.this_sport) + ' attempt' + (a.this_sport === 1 ? "" : "s") +
      ' · ' + a.all_sports + ' across all sports (reported only).</div>';
  }
  function viewResearchBlock(r){
    var top = r && r.status, s = sportStatus(top);
    if (!r || (!s && r.error && !r.fetched_at))
      return '<div class="card empty"><b>Couldn’t read research/status.json</b><p>' + esc((r && r.error) || "") + '</p></div>';
    if (!s) return '<section class="card empty" aria-label="Research"><div class="kicker">Research</div><b>Lab hasn’t run yet</b>' +
      '<p>Candidates, gates and lessons show up here once the Research Lab writes research/status.json.</p></section>';
    return (r.stale ? '<div class="note">Couldn’t refresh the lab status (' + esc(r.error || "error") + ') — as of ' + esc(ago(r.fetched_at)) + '.</div>' : "") +
      viewSports(top) + viewSummary(s) + viewAttempts(s) + viewTabs(s, data.github);
  }
  function viewTabs(s, g){
    var nNew = (s.lessons || []).filter(isNew).length;
    var bad = g && g.workflows ? g.workflows.filter(function(w){ return w.last && w.last.state === "failed" && !w.disabled; }).length : 0;
    var running = (s.candidates || []).filter(function(c){ return c.state === "running"; }).length || (s.runs && s.runs[0] && !s.runs[0].finished_at ? 1 : 0);
    var T = [["cands", "Candidates", ""],                         // its count is on the "All" filter below
             ["lessons", "Lessons", '<span class="ct">' + n((s.lessons || []).length) + '</span>' + (nNew ? '<span class="nw">' + nNew + ' new</span>' : "")],
             ["runs", "Runs", running ? '<span class="nw" style="background:var(--accent)">live</span>' : ""],
             ["github", "GitHub", bad ? '<span class="nw" style="background:var(--bad)">' + bad + '</span>' : ""]];
    if (!T.some(function(t){ return t[0] === labTab; })) labTab = "cands";
    return '<div class="tabs" role="tablist" aria-label="Lab sections">' + T.map(function(t){
      return '<button type="button" role="tab" data-tab="' + t[0] + '" aria-selected="' + (labTab === t[0]) + '" aria-controls="pane-' + t[0] + '">' + t[1] + t[2] + '</button>';
    }).join("") + '</div>' +
      '<div class="pane" id="pane-cands" role="tabpanel"' + (labTab === "cands" ? "" : " hidden") + '>' + viewCandidates(s) + '</div>' +
      '<div class="pane" id="pane-lessons" role="tabpanel"' + (labTab === "lessons" ? "" : " hidden") + '>' + viewLessons(s) + '</div>' +
      '<div class="pane" id="pane-runs" role="tabpanel"' + (labTab === "runs" ? "" : " hidden") + '>' + viewRuns(s) + viewPromoted(s) +
        ((s.runs || []).length || (s.promoted || []).length ? "" : '<div class="card empty"><p>No runs yet.</p></div>') + '</div>' +
      '<div class="pane" id="pane-github" role="tabpanel"' + (labTab === "github" ? "" : " hidden") + '>' + viewGithub(g) + '</div>';
  }
  function markLessonsSeen(){                      // remember the newest lesson seen; "New" stays on for this visit
    var s = sportStatus(data && data.research && data.research.status);
    var newest = ((s && s.lessons) || []).reduce(function(m, l){ return l.at && l.at > m ? l.at : m; }, "");
    if (!lessonsSeen) lessonsSeen = newest || "0";  // first visit: nothing counts as new
    if (newest > lessonsSeenNext){ lessonsSeenNext = newest; setLS("labLessonsSeen", newest); }
  }
  function viewOverview(){
    var s = data && data.research && data.research.status;
    var h = viewNotes() + viewAlert(data.github) + viewResearchBlock(data.research);
    if (!sportStatus(s)) h += viewGithub(data.github);   // no lab status yet: still show GitHub
    return h + viewFooter(s);
  }

  // ---- candidate detail --------------------------------------------------------------------------------------------
  function check(ok, title, detail){
    var g = ok === true ? '<span class="g" style="color:var(--good)" aria-label="passed">✓</span>' :
            ok === false ? '<span class="g" style="color:var(--bad)" aria-label="failed">✕</span>' :
            '<span class="g faint" aria-label="information">i</span>';
    return '<div class="ck">' + g + '<div><div class="t">' + esc(title) + '</div>' + (detail ? '<div class="d">' + esc(detail) + '</div>' : "") + '</div></div>';
  }
  function viewDetail(id){
    var top = data && data.research && data.research.status, s = null, c = null;
    [sportStatus(top)].concat(top ? [top] : [], top && top.by_sport ? Object.keys(top.by_sport).map(function(k){ return top.by_sport[k]; }) : [])
      .forEach(function(b){ if (!c && b) { c = (b.candidates || []).filter(function(x){ return (x.id || x.name) === id; })[0]; if (c) s = b; } });
    var back = '<a class="back" href="#"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>Lab</a>';
    if (!c) return viewNotes() + back + '<div class="card empty"><b>Candidate not found</b><p>It may have been renamed in the latest status.</p></div>';
    var unit = s.effect_unit || "pts", scale = scaleOf([c], 4), d = decimals(scale);
    var h = viewNotes() + back +
      '<div class="stack"><div class="chips" style="margin:0"><span class="chip">' + marketName(c.market) + '</span>' +
      (c.family ? '<span class="chip">' + esc(c.family) + '</span>' : "") + stateChip(c) + '</div>' +
      '<h2 class="dtitle">' + esc(c.name) + '</h2>' + (c.reason ? '<div class="reason">' + esc(c.reason) + '</div>' : "") + '</div>';
    if (c.verdict) h += '<section class="ig" aria-label="Verdict"><div class="k">INSPECTOR GENERAL</div><div class="v">' + esc(c.verdict) + '</div>' +
      '<div class="small soft">' + esc([c.graded_at ? "Graded " + ago(c.graded_at) : "", c.run_number != null ? "run #" + c.run_number : ""].filter(Boolean).join(" · ")) + '</div></section>';
    var gates = c.gates || [];
    if (gates.length || c.pooled){
      h += '<section class="card gates" aria-label="Gates"><div class="row"><h2>' + esc(s.effect_name || "Effect by gate") + '</h2><div class="small">' + esc(unit) + '</div></div>' +
        '<div class="scale" aria-hidden="true"><span>−' + scale + '</span><span>0</span><span>+' + scale + '</span></div>';
      gates.forEach(function(g){
        var mark = g.passed === true ? '<span style="color:var(--good)">✓</span> ' : g.passed === false ? '<span style="color:var(--bad)">✕</span> ' : '<span class="faint">◌</span> ';
        h += '<div class="gate"><div class="row"><b>' + mark + esc(g.name) + '</b><span class="mono">' +
          (typeof g.effect === "number" ? sgn(g.effect, d) + ' <span class="faint">' + (g.ci ? "[" + sgn(g.ci[0], d) + ", " + sgn(g.ci[1], d) + "]" : "") +
            (g.games != null ? " · " + esc(g.games) + " g" : "") + '</span>' : '<span class="faint">not run yet</span>') + '</span></div>' +
          (typeof g.effect === "number" ? '<svg viewBox="0 0 300 18" preserveAspectRatio="none" role="img" aria-label="' + esc(g.name + " " + sgn(g.effect, d)) + '">' + bar(g, scale, 300, 18, false, g.passed) + '</svg>' : "") + '</div>';
      });
      if (c.pooled && typeof c.pooled.effect === "number")
        h += '<div class="gate pool"><div class="row"><b>' + esc(c.pooled.name || "Pooled") + '</b><span class="mono">' + sgn(c.pooled.effect, d) +
          (c.pooled.ci ? ' <span class="faint">[' + sgn(c.pooled.ci[0], d) + ", " + sgn(c.pooled.ci[1], d) + "]</span>" : "") + '</span></div>' +
          '<svg viewBox="0 0 300 22" preserveAspectRatio="none" role="img" aria-label="pooled ' + sgn(c.pooled.effect, d) + '">' + bar(c.pooled, scale, 300, 22, true) + '</svg></div>';
      h += '</section>';
    }
    var cks = [];
    if (c.pooled && typeof c.pooled.adj_p === "number"){
      var bar05 = typeof c.p_bar === "number" ? c.p_bar : 0.05;
      cks.push(check(c.pooled.adj_p <= bar05, (c.pooled.adj_p <= bar05 ? "Holds" : "Doesn’t hold") + " after " + (c.attempts != null ? c.attempts : "all") + " attempts",
        "Adjusted p = " + c.pooled.adj_p.toPrecision(2) + " · bar " + bar05));
    }
    var done = gates.filter(function(g){ return typeof g.effect === "number"; });
    if (done.length){
      var pos = done.filter(function(g){ return g.effect > 0; }).length;
      cks.push(check(pos === gates.length ? true : pos < done.length ? false : null, "Positive in every gate", pos + " of " + gates.length + " gates"));
    }
    if (typeof c.fade_ratio === "number"){
      var need = typeof c.fade_needed === "number" ? c.fade_needed : 0.5;
      cks.push(check(c.fade_ratio >= need, c.fade_ratio >= need ? "Not fading" : "Fading", "Last gate is " + pct(c.fade_ratio, 0) + " of the first · needs " + pct(need, 0)));
    }
    if (c.kalshi){
      var k = c.kalshi;
      cks.push(check(null, "Picks at Kalshi price + fee", [k.picks != null ? k.picks + " picks" : "", k.win_rate != null ? "won " + pct(k.win_rate) : "",
        k.break_even != null ? "needs " + pct(k.break_even) : "", k.roi != null ? sgn(k.roi * 100, 1) + "%" : "", "can’t pass alone"].filter(Boolean).join(" · ")));
    }
    if ((c.rule_split || []).length)
      cks.push(check(null, "Rule-change split", c.rule_split.map(function(r){ return r.label + (typeof r.effect === "number" ? " " + sgn(r.effect, d) : ": " + (r.note || "—")); }).join(" · ")));
    if (cks.length) h += '<section class="card checks" aria-label="Checks">' + cks.join("") + '</section>';
    var ex = c.exam || {state: "not_taken"}, en = s.exam_name || "Sealed exam", left = s.counts && s.counts.exam_budget_left, tot = s.counts && s.counts.exam_budget_total;
    var budget = typeof left === "number" ? " " + left + (typeof tot === "number" ? " of " + tot : "") + " exams left." : "";
    h += '<section class="sealed" aria-label="' + esc(en) + '"><div class="h"><svg viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>' + esc(en) + '</div>' +
      '<p>' + (ex.state === "not_taken" ? "Not taken yet. Runs once; the result is final — no retakes." + budget :
        (ex.state === "passed" ? "Passed" : "Failed") + (typeof ex.effect === "number" ? ": " + sgn(ex.effect, d) + " " + esc(unit) + (ex.ci ? " [" + sgn(ex.ci[0], d) + ", " + sgn(ex.ci[1], d) + "]" : "") : "") +
          (ex.taken_at ? " · " + esc(ago(ex.taken_at)) : "") + ".") + (ex.note ? " " + esc(ex.note) : "") + '</p></section>';
    h += '<div class="stack">' + (gh(c.run_url) ? '<a class="btn primary" href="' + esc(c.run_url) + '" rel="noreferrer">View run on GitHub</a>' : "") +
      '<a class="btn" href="' + esc(gh(c.file_url) || REPO + "/tree/main/research") + '" rel="noreferrer">Candidate file &amp; raw results</a></div>';
    return h;
  }

  // ---- render / load ---------------------------------------------------------------------------------------------
  function route(){ var m = /^#c\\/(.+)$/.exec(location.hash); return m ? decodeURIComponent(m[1]) : null; }
  function render(){
    tick();
    if (!data){
      $("main").innerHTML = viewNotes() + (problem.signin || problem.offline ? "" : '<div class="card empty"><p>Loading…</p></div>');
      return;
    }
    var id = route();
    $("main").innerHTML = id ? viewDetail(id) : viewOverview();
    if (!id && labTab === "lessons") markLessonsSeen();
  }
  function tick(){
    $("when").textContent = loadedAt ? "Updated " + ago(new Date(loadedAt).toISOString()).replace("just now", "just now") + (busy() ? " · checking every 15 s" : " · auto-refresh on") :
      problem.signin ? "Signed out" : problem.offline ? "Couldn’t load" : "Loading…";
  }
  function busy(){                                 // something is running: check every 15 s instead of every minute
    var s = data && data.research && data.research.status, g = data && data.github;
    return !!((s && ((s.candidates || []).some(function(c){ return c.state === "running"; }) ||
                     (s.runs && s.runs[0] && !s.runs[0].finished_at))) ||
              (g && (g.workflows || []).some(function(w){ return w.group === "Research" && w.last && (w.last.state === "running" || w.last.state === "queued"); })));
  }
  function load(fresh){
    if (loading) return;
    loading = true; $("refresh").classList.add("spin"); $("refresh").setAttribute("aria-busy", "true");
    fetch("/api/lab" + (fresh === true ? "?fresh=1" : ""), {credentials: "same-origin", cache: "no-store", headers: {accept: "application/json"}})
      .then(function(r){
        if (r.status === 404) return {signin: true};
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json().then(function(d){ return {d: d}; });
      })
      .then(function(res){
        if (res.signin){ problem = {signin: true}; render(); return; }
        data = res.d; loadedAt = Date.now(); problem = {};
        try { localStorage.setItem(KEY, JSON.stringify({at: loadedAt, data: data})); } catch (e) {}
        render(); schedule();
      })
      .catch(function(){ problem = {offline: loadedAt ? new Date(loadedAt).toISOString() : "x"}; render(); })
      .then(function(){ loading = false; $("refresh").classList.remove("spin"); $("refresh").removeAttribute("aria-busy"); });
  }
  function schedule(){
    clearInterval(timer); timer = null;
    if (document.visibilityState === "visible") timer = setInterval(load, busy() ? REFRESH_LIVE : REFRESH_MS);
  }

  $("refresh").addEventListener("click", function(){ load(true); });
  function showTab(t){
    labTab = t; setLS("labTab", t);
    document.querySelectorAll(".tabs [data-tab]").forEach(function(b){ b.setAttribute("aria-selected", String(b.getAttribute("data-tab") === t)); });
    document.querySelectorAll(".pane").forEach(function(p){ p.hidden = p.id !== "pane-" + t; });
    if (t === "lessons") markLessonsSeen();
  }
  $("main").addEventListener("click", function(e){
    var tb = e.target.closest(".tabs [data-tab]");
    if (tb){ showTab(tb.getAttribute("data-tab")); return; }
    var cf = e.target.closest("[data-cf]");
    if (cf){ candFilter = cf.getAttribute("data-cf"); showAllCands = candFilter !== "all"; render(); return; }
    var lf = e.target.closest("[data-lf]");
    if (lf){ lessonFilter = lf.getAttribute("data-lf"); render(); return; }
    if (e.target.closest(".alert") && !e.target.closest("#alertx")){ e.preventDefault(); showTab("github"); var a0 = $("activity"); if (a0) a0.scrollIntoView(); return; }
    if (e.target.closest("#morecands")){ showAllCands = true; render(); }
    var sp = e.target.closest(".sports [data-sport]");
    if (sp){ labSport = sp.getAttribute("data-sport"); try { localStorage.setItem("labSport", labSport); } catch (x) {} showAllCands = false; render(); }
    if (e.target.closest("#morewf")){ showAllWf = true; render(); }
    if (e.target.closest("#alertx")){
      var keep = failingNow(data && data.github).map(failKey);   // only what is failing now: old keys drop off
      try { localStorage.setItem(DISMISS, JSON.stringify(keep)); } catch (err) {}
      render();
    }
    if (e.target.closest("#moresteps")){ showAllSteps = true; render(); }
  });
  window.addEventListener("hashchange", function(){
    var id = route();
    render();
    if (id || location.hash === "" || location.hash === "#") window.scrollTo(0, 0);
    else if (location.hash === "#activity"){ showTab("github"); var a = $("activity"); if (a) a.scrollIntoView(); }
  });
  document.addEventListener("visibilitychange", function(){
    if (document.visibilityState === "visible" && Date.now() - loadedAt > REFRESH_MS) load();
    schedule();
  });
  setInterval(tick, 15000);

  try {
    var saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (saved && saved.data){ data = saved.data; loadedAt = saved.at; }
  } catch (e) {}
  render(); load(); schedule();
})();
</script>
</body>
</html>
`;
