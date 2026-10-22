// Phone check: an NFL game card picked by Model 2.0 shows the model, what Model 1.0 said, and no QB-out SKIP.
//   node --test tests/app/nfl_model2.test.mjs
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


const now = Date.now(), iso = ms => new Date(ms).toISOString().replace(/\.\d+Z$/, "Z");
const kick = iso(now + 26 * 3600e3);
const base = {game_id: "2026_08_NE_CHI", home_team: "CHI", away_team: "NE", kickoff_time: kick, season: 2026, week: 8, sport: "NFL"};
const market = {moneyline_home: -170, moneyline_away: 145, spread_home: -3.5, spread_home_odds: -110, spread_away_odds: -110};
const model = {available: true, status: "updates until kickoff", winner_prob: 0.74, winner_side: "CHI", version: "2.0", sees_injuries: true,
               model_1_0: {side: "CHI", prob: 0.578}, source_snapshot_time: iso(now), note: "Moneyline pick: NFL Model 2.0 (Model 1.0 + who is out)."};
const inj = {as_of: iso(now), home: [{name: "C. Williams", pos: "QB", status: "Out"}], away: []};
const EXPORT = {sport: "NFL", generated_at: iso(now), docs: [
  {collection: "slate", doc_id: base.game_id, data: Object.assign({}, base, {market, model, injury_report: inj, synced_at: iso(now)})},
  {collection: "decisions", doc_id: base.game_id, data: Object.assign({}, base, {locked_at: iso(now), model_version: "2.0",
    decision: {action: "ML", prob: 0.74, side: "CHI", tier: "top25"}, market_snapshot: market, outcome: {resolved: false}})}]};
const MIME = {".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png"};
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname.startsWith("/api/")) { res.writeHead(404); return res.end("{}"); }
  const f = path.join(DOCS, u.pathname === "/" ? "index.html" : u.pathname);
  if (!f.startsWith(DOCS) || !existsSync(f)) { res.writeHead(404); return res.end(""); }
  res.writeHead(200, {"content-type": MIME[path.extname(f)] || "application/octet-stream"});
  res.end(readFileSync(f));
});


test("NFL card picked by Model 2.0", async () => {
  await new Promise(ok => server.listen(0, ok));
  const base_url = `http://localhost:${server.address().port}`;
  const browser = await chromium.launch({executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
  try {
    const ctx = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, isMobile: true, hasTouch: true});
    await ctx.route(/fonts\.(googleapis|gstatic)\.com|espncdn/, r => r.abort());
    await ctx.route(/raw\.githubusercontent\.com/, r => {
      const p = new URL(r.request().url()).pathname;
      if (p.endsWith("/nfl/lineboard_export.json")) return r.fulfill({json: EXPORT});
      return r.fulfill({status: 404, body: ""});
    });
    await ctx.addInitScript(() => { try { localStorage.setItem("devig.installTip.v1", "1"); } catch (e) {} });
    const pg = await ctx.newPage();
    const errors = [];
    pg.on("pageerror", e => errors.push(String(e)));
    await pg.goto(base_url + "/");
    await pg.locator("#splash").waitFor({state: "detached", timeout: 15000});
    await pg.locator('#sportPills [data-sport="NFL"]').click();
    const card = pg.locator("#homeSlate .card.game", {hasText: "CHI"}).first();
    await card.locator(".game-head").click();                      // opens the game page
    const page = pg.locator("#panel-game");
    await page.getByText("Model 1.0 said").waitFor();
    const txt = await page.innerText();
    assert.match(txt, /Model 2\.0/);
    assert.match(txt, /Model 1\.0 said\s*CHI 57\.8%/);
    assert.doesNotMatch(txt, /SKIP/);                       // its QB-out SKIP rule is for Model 1.0 only
    assert.match(txt, /already counts who is listed out/);
    await pg.screenshot({path: OUT + "nfl-model2-card.png", fullPage: true});
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});
