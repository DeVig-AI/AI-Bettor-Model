// Computer layout (docs/desktop.css) in Chromium at 1280px, and the phone layout still at 390px, with mocked repo files:
// node --test tests/app/desktop.test.mjs   (screenshots: tests/app/out/, not committed)
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
const noon = new Date(); noon.setHours(12, 0, 0, 0);
const kUp = noon.getTime() + 2 * 86400e3;
const game = (id, away, home, kick) => ({collection: "slate", doc_id: id, data: {game_id: id, sport: "NFL", season: 2026,
  away_team: away, home_team: home, kickoff_time: iso(kick), market: {book: "Kalshi", moneyline_away: 125, moneyline_home: -145},
  model: {available: false}, synced_at: iso(now - 600e3)}});
const SLATE = {docs: [game("G1", "HOU", "JAX", kUp), game("G2", "BUF", "KC", kUp), game("G3", "DAL", "PHI", kUp), game("G4", "NYG", "WAS", kUp)]};

const MIME = {".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png"};
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname.startsWith("/api/")) { res.writeHead(404); return res.end("{}"); }
  const f = path.join(DOCS, u.pathname === "/" ? "index.html" : u.pathname);
  if (!f.startsWith(DOCS) || !existsSync(f)) { res.writeHead(404); return res.end(""); }
  res.writeHead(200, {"content-type": MIME[path.extname(f)] || "application/octet-stream"});
  res.end(readFileSync(f));
});

async function open(browser, base, width) {
  const ctx = await browser.newContext({viewport: {width, height: 860}});
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|espncdn/, r => r.abort());
  await ctx.route(/raw\.githubusercontent\.com/, r => {
    const p = new URL(r.request().url()).pathname;
    return p.endsWith("/nfl/lineboard_export.json") ? r.fulfill({json: SLATE}) : r.fulfill({status: 404, body: ""});
  });
  await ctx.addInitScript(() => { try { localStorage.setItem("devig.installTip.v1", "1"); } catch (e) {} });
  const pg = await ctx.newPage();
  const errors = [];
  pg.on("pageerror", e => errors.push(String(e)));
  await pg.goto(base + "/");
  await pg.locator("#splash").waitFor({state: "detached", timeout: 15000});
  await pg.locator("#homeSlate .card.game").nth(3).waitFor();
  return {ctx, pg, errors};
}

test("computer and phone layouts", async (t) => {
  await new Promise(ok => server.listen(0, ok));
  const base = `http://localhost:${server.address().port}`;
  const browser = await chromium.launch({executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
  try {
    await t.test("1280px: sidebar on the left, games side by side, More pages in the sidebar", async () => {
      const {ctx, pg, errors} = await open(browser, base, 1280);
      const nav = await pg.locator("nav.tabs").boundingBox();
      assert.ok(nav.x < 40 && nav.width < 260 && nav.height > 150, `tabs are a sidebar list: ${JSON.stringify(nav)}`);
      const cards = pg.locator("#homeSlate .card.game");
      const [a, b] = [await cards.nth(0).boundingBox(), await cards.nth(1).boundingBox()];
      assert.ok(Math.abs(a.y - b.y) < 2 && b.x > a.x + a.width, "two games on one row");
      await pg.screenshot({path: OUT + "desktop-home.png"});
      await pg.locator('.side-more [data-go="models"]').click();
      await pg.locator("#panel-models").waitFor({state: "visible"});
      assert.equal(await pg.locator('.side-more [data-go="models"]').getAttribute("aria-current"), "true");
      assert.equal(await pg.locator('nav.tabs button[data-tab="more"]').getAttribute("aria-selected"), "true");
      assert.ok(await pg.evaluate(() => document.documentElement.scrollWidth) <= 1280);
      assert.deepEqual(errors, []);
      await ctx.close();
    });
    await t.test("390px: the phone layout is unchanged (tab bar at the bottom, one column, no sidebar pages)", async () => {
      const {ctx, pg, errors} = await open(browser, base, 390);
      const nav = await pg.locator("nav.tabs").boundingBox();
      assert.ok(nav.y > 700 && nav.width >= 380, `tab bar at the bottom: ${JSON.stringify(nav)}`);
      assert.equal(await pg.locator(".side-more").isVisible(), false);
      const cards = pg.locator("#homeSlate .card.game");
      assert.ok((await cards.nth(1).boundingBox()).y > (await cards.nth(0).boundingBox()).y + 50, "one column");
      assert.deepEqual(errors, []);
      await ctx.close();
    });
  } finally {
    await browser.close();
    server.close();
  }
});
