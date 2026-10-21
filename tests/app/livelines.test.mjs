// Phone check: NBA games get their score and win-chance graph from the live bot's file (live/live_lines.json) with no
// /api/live or /api/winline at all, like the NFL does: live on Home, and after the final in History.
//   node --test tests/app/livelines.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
let chromium;
try { ({chromium} = require("playwright")); } catch (e) { ({chromium} = require("/opt/node22/lib/node_modules/playwright")); }
const DOCS = new URL("../../docs/", import.meta.url).pathname;
const OUT = new URL("./out/", import.meta.url).pathname;
mkdirSync(OUT, {recursive: true});

const now = Date.now(), iso = ms => new Date(ms).toISOString().replace(/\.\d+Z$/, "Z");
const kLive = now - 60 * 60e3, kDone = now - 4 * 3600e3;
const ymd = ms => { const d = new Date(ms); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const slate = (id, away, home, k, winner) => ({collection: "slate", doc_id: id, data: {
  game_id: id, sport: "NBA", season: 2026, away_team: away, home_team: home, kickoff_time: iso(k), game_date: ymd(k),
  market: {book: "Kalshi", moneyline_away: 120, moneyline_home: -140},
  model: {available: true, status: "locked", winner_side: winner, winner_prob: 0.58, note: "test"}}});
const NBA = {sport: "NBA", generated_at: iso(now), docs: [slate("G1", "LAL", "GSW", kLive, "GSW"), slate("G2", "BOS", "NYK", kDone, "NYK")]};
const line = (k, a, b) => ({team: "x", points: Array.from({length: 40}, (_, i) => [Math.floor(k / 1000) - 7200 + i * 300, +(a + (b - a) * i / 39).toFixed(3)])});
const LIVE = {generated_at: iso(now), games: [
  {sport: "NBA", away: "LAL", home: "GSW", kickoff: iso(kLive), espn_id: "1", state: "in", detail: "Q3 4:12",
   away_score: 71, home_score: 77, kalshi_game: {moneyline: {home: -230, away: 190}}, kalshi_line: Object.assign(line(kLive, 0.58, 0.69), {team: "GSW"})},
  {sport: "NBA", away: "BOS", home: "NYK", kickoff: iso(kDone), espn_id: "2", state: "post", detail: "Final",
   away_score: 101, home_score: 108, kalshi_game: null, line_final: true, kalshi_line: Object.assign(line(kDone, 0.55, 0.99), {team: "NYK"})},
]};
const MIME = {".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png"};
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname.startsWith("/api/")) { res.writeHead(404); return res.end("{}"); }       // no fast feed, no winline
  const f = path.join(DOCS, u.pathname === "/" ? "index.html" : u.pathname);
  if (!f.startsWith(DOCS) || !existsSync(f)) { res.writeHead(404); return res.end(""); }
  res.writeHead(200, {"content-type": MIME[path.extname(f)] || "application/octet-stream"});
  res.end(readFileSync(f));
});

test("NBA graph from the live bot's file, live and after the final", async (t) => {
  await new Promise(ok => server.listen(0, ok));
  const base = `http://localhost:${server.address().port}`;
  const browser = await chromium.launch({executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
  try {
    const ctx = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, isMobile: true, hasTouch: true});
    await ctx.route(/fonts\.(googleapis|gstatic)\.com|espncdn/, r => r.abort());
    await ctx.route(/raw\.githubusercontent\.com/, r => {
      const p = new URL(r.request().url()).pathname;
      if (p.endsWith("/live/live_lines.json")) return r.fulfill({json: LIVE});
      if (p.endsWith("/nba/lineboard_export.json")) return r.fulfill({json: NBA});
      return r.fulfill({status: 404, body: ""});
    });
    await ctx.addInitScript(() => { try { localStorage.setItem("devig.installTip.v1", "1"); } catch (e) {} });
    const pg = await ctx.newPage();
    const errors = [];
    pg.on("pageerror", e => errors.push(String(e)));
    await pg.goto(base + "/");
    await pg.locator("#splash").waitFor({state: "detached", timeout: 15000});
    await t.test("Home: the live game shows ESPN's score and the graph", async () => {
      await pg.locator('#sportPills [data-sport="NBA"]').click();
      const card = pg.locator("#homeSlate .card.game", {hasText: "GSW"});
      await card.first().waitFor();
      await card.locator(".lv-chart").waitFor({timeout: 10000});
      const txt = await card.innerText();
      assert.match(txt, /LIVE/);
      assert.match(txt, /\b77\b/);
      assert.match(await card.locator(".lv-chart").innerText(), /GSW\s+69%/);
      await pg.screenshot({path: OUT + "nba-live.png", fullPage: true});
    });
    await t.test("History: the finished game keeps its graph", async () => {
      await pg.locator('#tabs [data-tab="scan"], [role="tab"][data-tab="scan"]').first().click();
      await pg.locator('#pastSportPills [data-past-sport="NBA"]').click();
      const card = pg.locator("#pastGames .card.game", {hasText: "NYK"});
      await card.first().waitFor();
      await card.locator(".lv-chart").waitFor({timeout: 10000});
      assert.match(await card.innerText(), /FINAL[\s\S]*\b108\b/);
      assert.match(await card.locator(".lv-chart").innerText(), /NYK\s+99%/);
      await pg.screenshot({path: OUT + "nba-history.png", fullPage: true});
    });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});
