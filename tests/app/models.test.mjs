// Phone check: More -> Models shows the "Beat the closing line?" table from live/models_export.json.
//   node --test tests/app/models.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
let chromium;
try { ({chromium} = require("playwright")); } catch (e) { ({chromium} = require("/opt/node22/lib/node_modules/playwright")); }
const ROOT = new URL("../../", import.meta.url).pathname;
const DOCS = ROOT + "docs/";
const OUT = new URL("./out/", import.meta.url).pathname;
mkdirSync(OUT, {recursive: true});

const row = (key, name, extra) => Object.assign({key, name, n: 0}, extra || {});
const EXPORT = {generated_at: new Date().toISOString(), docs: [{collection: "models_report", doc_id: "MODELS_V1", data: {
  doc: "MODELS_V1", tracking_since: "2026-10-19T01:51:46Z", errors: [],
  models: [{key: "devig", name: "DeVig", sports: ["NBA"], author: "x", url: "https://x", license: "x", note: "x"},
           {key: "kalshi", name: "Market", sports: ["NBA"], author: "Kalshi", url: "https://kalshi.com", license: "x", note: "x"}],
  sports: {NBA: {ml: [row("devig", "DeVig", {n: 14, w: 9, l: 5, pct: 0.643}), row("kalshi", "Market", {n: 14, w: 10, l: 4, pct: 0.714})],
                 spread: [], total: [], props: [],
                 close: [{key: "devig", name: "DeVig", n: 14, beat: 6, same: 1, avg: -0.003},
                         {key: "blotny", name: "Blotny NBA", n: 9, beat: 6, same: 0, avg: 0.021}],
                 calib: [{key: "devig", name: "DeVig", n: 68, logloss: 0.6197, brier: 0.21, mkt_logloss: 0.5686, mkt_brier: 0.19,
                          bins: [{lo: 0.5, hi: 0.6, n: 19, said: 0.5529, won: 0.5263}, {lo: 0.6, hi: 0.7, n: 22, said: 0.6513, won: 0.5455},
                                 {lo: 0.7, hi: 0.8, n: 17, said: 0.7435, won: 0.8235}, {lo: 0.8, hi: 1, n: 8, said: 0.85, won: 0.75}]},
                         {key: "kalshi", name: "Market", n: 71, logloss: 0.5607, brier: 0.19, mkt_logloss: 0.5607, mkt_brier: 0.19,
                          bins: [{lo: 0.5, hi: 0.6, n: 28, said: 0.5441, won: 0.5357}, {lo: 0.6, hi: 0.7, n: 0, said: null, won: null},
                                 {lo: 0.7, hi: 0.8, n: 16, said: 0.7473, won: 0.8125}, {lo: 0.8, hi: 1, n: 9, said: 0.8567, won: 1}]}]}}}}]};
const MIME = {".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png"};
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname.startsWith("/api/")) { res.writeHead(404); return res.end("{}"); }
  const f = path.join(DOCS, u.pathname === "/" ? "index.html" : u.pathname);
  if (!f.startsWith(DOCS) || !existsSync(f)) { res.writeHead(404); return res.end(""); }
  res.writeHead(200, {"content-type": MIME[path.extname(f)] || "application/octet-stream"});
  res.end(readFileSync(f));
});

test("Models page: beat the closing line", async () => {
  await new Promise(ok => server.listen(0, ok));
  const base = `http://localhost:${server.address().port}`;
  const browser = await chromium.launch({executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
  try {
    const ctx = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, isMobile: true, hasTouch: true});
    await ctx.route(/fonts\.(googleapis|gstatic)\.com|espncdn/, r => r.abort());
    await ctx.route(/raw\.githubusercontent\.com/, r => {
      const p = new URL(r.request().url()).pathname;
      if (p.endsWith("/live/models_export.json")) return r.fulfill({json: EXPORT});
      return r.fulfill({status: 404, body: ""});
    });
    await ctx.addInitScript(() => { try { localStorage.setItem("devig.installTip.v1", "1"); } catch (e) {} });
    const pg = await ctx.newPage();
    const errors = [];
    pg.on("pageerror", e => errors.push(String(e)));
    await pg.goto(base + "/");
    await pg.locator("#splash").waitFor({state: "detached", timeout: 15000});
    await pg.locator('nav.tabs button[data-tab="more"]').click();
    await pg.locator('#panel-more [data-go="models"]').click();
    await pg.locator('[data-md-sport="NBA"]').click();
    await pg.locator("#mdClose tr", {hasText: "Blotny"}).waitFor();
    const txt = await pg.locator("#mdClose").innerText();
    assert.match(txt, /DeVig\s+14\s+6 of 14\s+−0\.3 pts/);
    assert.match(txt, /Blotny NBA\s+9\s+6 of 9\s+\+2\.1 pts/);
    await pg.locator("#mdClose").scrollIntoViewIfNeeded();
    await pg.screenshot({path: OUT + "models-close.png"});
    // do the percentages come true: won vs said per band, accuracy next to the market's, small groups greyed out
    const cal = await pg.locator("#mdCalib").innerText();
    assert.match(cal, /DeVig\s+68\s+0\.620\s+Market 0\.569\s+won 53%\s+said 55% · 19\s+won 55%\s+said 65% · 22/);
    assert.match(cal, /Market\s+71\s+0\.561\s+won 54%[\s\S]*—/);
    assert.equal(await pg.locator("#mdCalib td.faint").count(), 2);
    await pg.locator("#mdCalib").scrollIntoViewIfNeeded();
    await pg.screenshot({path: OUT + "models-calib.png"});
    const w = await pg.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(w <= 390, `page is ${w}px wide`);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});
