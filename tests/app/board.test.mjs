// Phone check: a game Kalshi lists but the model has no pick on (the MLB World Series game) still shows on Home with
// Kalshi's prices, the live score and the win-chance graph: node --test tests/app/board.test.mjs
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
const tmrNoon = new Date(); tmrNoon.setHours(36, 0, 0, 0);                         // noon tomorrow
const kLive = now - 70 * 60e3, kTmr = tmrNoon.getTime();
const LINES = {generated_at: iso(now - 300e3), errors: [], games: [
  {sport: "MLB", date: "2026-10-19", event: "KXMLBGAME-WS1", home_ticker: "KXMLBGAME-WS1-TB", away: "CLE", home: "TB",
   spreads: {TB: [[-1.5, 150], [1.5, -180]], CLE: [[-1.5, 165], [1.5, -200]]}, kickoff: iso(kLive), espn_id: "401",
   home_wp: 0.55, ml: {home: -125, away: 108}, spread: {home_point: -1.5, home: 150, away: -180}, total: {line: 7.5, over: -105, under: -112}},
  {sport: "MLB", date: "2026-10-20", event: "KXMLBGAME-WS2", home_ticker: "KXMLBGAME-WS2-TB", away: "CLE", home: "TB",
   spreads: {}, kickoff: iso(kTmr), home_wp: 0.52, ml: {home: -110, away: -102}},
]};
const POINTS = Array.from({length: 30}, (_, i) => [Math.floor(kLive / 1000) + i * 120, 0.55 + 0.1 * Math.sin(i / 4)]);
const MIME = {".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png"};
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const j = b => { res.writeHead(200, {"content-type": "application/json"}); res.end(JSON.stringify(b)); };
  if (u.pathname === "/api/live") return j(u.searchParams.get("sport") === "mlb"
    ? {games: [{id: "401", away: "CLE", home: "TB", kickoff: iso(kLive), away_score: 2, home_score: 3, state: "in", detail: "Top 6th"}]}
    : {games: []});
  if (u.pathname === "/api/winline") return j({points: POINTS, last: {bid: 0.6, ask: 0.62}});
  if (u.pathname.startsWith("/api/")) { res.writeHead(404); return res.end("{}"); }
  const f = path.join(DOCS, u.pathname === "/" ? "index.html" : u.pathname);
  if (!f.startsWith(DOCS) || !existsSync(f)) { res.writeHead(404); return res.end(""); }
  res.writeHead(200, {"content-type": MIME[path.extname(f)] || "application/octet-stream"});
  res.end(readFileSync(f));
});

test("a game with no model pick still shows, live", async (t) => {
  await new Promise(ok => server.listen(0, ok));
  const base = `http://localhost:${server.address().port}`;
  const browser = await chromium.launch({executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
  try {
    const ctx = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, isMobile: true, hasTouch: true});
    await ctx.route(/fonts\.(googleapis|gstatic)\.com|espncdn/, r => r.abort());
    await ctx.route(/raw\.githubusercontent\.com/, r => new URL(r.request().url()).pathname.endsWith("/live/game_lines.json")
      ? r.fulfill({json: LINES}) : r.fulfill({status: 404, body: ""}));
    await ctx.addInitScript(() => { try { localStorage.setItem("devig.installTip.v1", "1"); } catch (e) {} });
    const pg = await ctx.newPage();
    const errors = [];
    pg.on("pageerror", e => errors.push(String(e)));
    await pg.goto(base + "/");
    await pg.locator("#splash").waitFor({state: "detached", timeout: 15000});
    await t.test("MLB: today's World Series game with Kalshi odds, tomorrow's on its own tab", async () => {
      await pg.locator('#sportPills [data-sport="MLB"]').click();
      await pg.locator("#homeSlate .card.game").first().waitFor();
assert.equal(await pg.locator("#homeSlate .card.game").count(), 1);
      assert.match(await pg.locator("#homeSlate").innerText(), /Other games[\s\S]*no pick · Kalshi odds/i);
      const first = await pg.locator("#homeSlate .card.game").first().innerText();
      assert.match(first, /CLE[\s\S]*\+108[\s\S]*TB[\s\S]*-125/);
      assert.match(await pg.locator("#dayTabs").innerText(), /Today[\s\S]*Tomorrow[\s\S]*Tracked/);
      await pg.locator('#dayTabs button', {hasText: "Tomorrow"}).click();
      assert.equal(await pg.locator("#homeSlate .card.game").count(), 1);
      assert.match(await pg.locator("#homeSlate .card.game").innerText(), /-110/);
      await pg.locator('#dayTabs button', {hasText: "Today"}).click();
    });
    await t.test("the live game gets its score and graph from the fast feed", async () => {
      await pg.waitForFunction(() => /\b3\b/.test(document.querySelector("#homeSlate .card.game").innerText) &&
        document.querySelector("#homeSlate .lv-chart, #homeSlate .card.game svg"), null, {timeout: 30000});
      await pg.screenshot({path: OUT + "mlb-board.png", fullPage: true});
    });
    await t.test("its odds can go on the slip (the upcoming game)", async () => {
      await pg.locator('#dayTabs button', {hasText: "Tomorrow"}).click();
      const b = pg.locator('.sb-btn[data-legg*="CLE ML"]');
      assert.equal(await b.count(), 1, "the game that hasn't started is tappable");
      await b.click();
      assert.match(await pg.locator(".slip-bar").innerText(), /Added CLE ML[\s\S]*\$10 pays/i);
    });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});
