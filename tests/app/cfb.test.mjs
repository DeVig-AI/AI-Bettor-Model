// Phone check of the app's college football tab (docs/index.html) in Chromium at 390px, with mocked repo files,
// /api/live and /api/winline: node --test tests/app/cfb.test.mjs   (screenshots: tests/app/out/, not committed)
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
const day = ms => new Date(ms - 4 * 3600e3).toISOString().slice(0, 10);
const k1 = now - 75 * 60e3, k2 = now + 26 * 3600e3, k3 = now + 50 * 3600e3;
const lad = (a, h) => ({[h]: [[-4.5, 140], [-1.5, -105], [1.5, -150]], [a]: [[-1.5, 230], [1.5, -110], [4.5, -165]]});
const LINES = {generated_at: iso(now - 4 * 60e3), errors: [], games: [
  {sport: "NFL", date: day(k2), away: "HOU", home: "JAX", spreads: {}},
  {sport: "CFB", date: day(k1), event: "KXNCAAFGAME-X1", home_ticker: "KXNCAAFGAME-X1-DEL", away: "MOST", home: "DEL",
   spreads: lad("MOST", "DEL"), espn_id: "401", kickoff: iso(k1), neutral: false, names: {away: "Missouri State", home: "Delaware"},
   ids: {away: "2623", home: "48"}, colors: {away: "#5e0009", home: "#00539f"}, rank: {away: null, home: null},
   state: "in", detail: "Q3 4:12", away_score: 14, home_score: 17, home_wp: 0.585, ml: {home: -145, away: 125},
   spread: {home_point: -1.5, home: -105, away: -112}, total: {line: 51.5, over: -108, under: -110}},
  {sport: "CFB", date: day(k2), event: "KXNCAAFGAME-X2", home_ticker: "KXNCAAFGAME-X2-MICH", away: "IU", home: "MICH",
   spreads: lad("IU", "MICH"), espn_id: "402", kickoff: iso(k2), neutral: false, names: {away: "Indiana", home: "Michigan"},
   ids: {away: "84", home: "130"}, colors: {away: "#990000", home: "#00274c"}, rank: {away: 6, home: null},
   state: "pre", detail: "", away_score: null, home_score: null, home_wp: 0.31, ml: {home: 215, away: -260},
   spread: {home_point: 7.5, home: -110, away: -108}, total: {line: 47.5, over: -110, under: -108}},
  {sport: "CFB", date: day(k3), event: "KXNCAAFGAME-X3", home_ticker: "KXNCAAFGAME-X3-MIA", away: "PITT", home: "MIA",
   spreads: lad("PITT", "MIA"), espn_id: "403", kickoff: iso(k3), neutral: true, names: {away: "Pittsburgh", home: "Miami"},
   ids: {away: "221", home: "2390"}, colors: {away: "#003594", home: "#f47321"}, rank: {away: null, home: 1},
   state: "pre", detail: "", away_score: null, home_score: null, home_wp: 0.86, ml: {home: -640, away: 470},
   spread: {home_point: -17.5, home: -110, away: -110}, total: {line: 54.5, over: -110, under: -110}}]};
// Polymarket's price for IU @ MICH: cheaper than Kalshi (fee included) for both teams
const POLY = {doc: "POLY_LINES", generated_at: iso(now), games: [{sport: "CFB", date: day(k2), kickoff: iso(k2), away: "IU", home: "MICH",
  away_bid: 0.70, away_ask: 0.71, home_bid: 0.29, home_ask: 0.30, liquidity: 50000, slug: "cfb-ind-mich"}]};
const kOld = Math.floor(now / 86400e3) * 86400e3 - 2 * 86400e3 + 16 * 3600e3;   // 4pm UTC two days ago: both games on one day
const HISTORY = {generated_at: iso(now), games: {
  "390": {date: day(kOld), kickoff: iso(kOld), away: "BAMA", home: "UGA", names: {away: "Alabama", home: "Georgia"}, ids: {away: "333", home: "61"},
          neutral: false, pre: {home_wp: 0.62, ml: {home: -170, away: 145}, spread: {home_point: -3.5, home: -110, away: -110}, total: {line: 49.5}},
          final: {away: 20, home: 27}},
  "391": {date: day(kOld), kickoff: iso(kOld + 3600e3), away: "TEX", home: "OU", names: {away: "Texas", home: "Oklahoma"}, ids: {away: "251", home: "201"},
          neutral: true, pre: {home_wp: 0.44, ml: {home: 125, away: -145}, spread: {home_point: 2.5, home: -110, away: -110}, total: {line: 52.5}},
          final: {away: 21, home: 24}}}};
const POINTS = Array.from({length: 40}, (_, i) => [Math.floor(k1 / 1000) - 3600 + i * 180, 0.5 + 0.1 * Math.sin(i / 5)]);

const MIME = {".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png",
  ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml"};
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const j = b => { res.writeHead(200, {"content-type": "application/json"}); res.end(JSON.stringify(b)); };
  if (u.pathname === "/api/live") return j(u.searchParams.get("sport") === "cfb"
    ? {sport: "cfb", games: [{id: "401", away: "MOST", home: "DEL", away_score: 21, home_score: 17, state: "in", detail: "Q4 9:50"}]}
    : {games: []});
  if (u.pathname === "/api/winline") return j({points: POINTS, last: {bid: 0.55, ask: 0.57}});
  if (u.pathname.startsWith("/api/")) { res.writeHead(404); return res.end("{}"); }
  let f = path.join(DOCS, u.pathname === "/" ? "index.html" : u.pathname);
  if (!f.startsWith(DOCS) || !existsSync(f)) { res.writeHead(404); return res.end(""); }
  res.writeHead(200, {"content-type": MIME[path.extname(f)] || "application/octet-stream"});
  res.end(readFileSync(f));
});

async function open(browser, base, logos, preview = true) {
  const ctx = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, isMobile: true, hasTouch: true});
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const logoHits = [];
  await ctx.route(/a\.espncdn\.com/, r => { logoHits.push(r.request().url()); r.fulfill({status: 200, contentType: "image/png",
    body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64")}); });
  await ctx.route(/raw\.githubusercontent\.com/, r => {
    const p = new URL(r.request().url()).pathname;
    if (p.endsWith("/live/game_lines.json")) return r.fulfill({json: LINES});
    if (p.endsWith("/live/cfb_history.json")) return r.fulfill({json: HISTORY});
    if (p.endsWith("/live/poly_lines.json")) return r.fulfill({json: POLY});
    return r.fulfill({status: 404, body: ""});
  });
  if (logos) await ctx.addInitScript(() => { Object.defineProperty(window, "devigLogos", {get: () => true, set: () => {}}); });
  if (preview) await ctx.addInitScript(() => { window.devigCfbPreview = true; });   // no effect now the board is on
  await ctx.addInitScript(() => { try { localStorage.setItem("devig.installTip.v1", "1"); } catch (e) {} });   // no install tip
  const pg = await ctx.newPage();
  const errors = [];
  pg.on("pageerror", e => errors.push(String(e)));
  await pg.goto(base + "/");
  await pg.locator("#splash").waitFor({state: "detached", timeout: 15000});
  return {ctx, pg, errors, logoHits};
}

test("college football tab on a phone", async (t) => {
  await new Promise(ok => server.listen(0, ok));
  const base = `http://localhost:${server.address().port}`;
  const browser = await chromium.launch({executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
  try {
    const u = await open(browser, base, false, false);
    await t.test("default: the CFB board is on (no preview switch)", async () => {
      await u.pg.locator('#sportPills [data-sport="CFB"]').click();
      await u.pg.locator("#homeSlate .card.game").first().waitFor();
      assert.equal(await u.pg.locator(".cfb-soon").count(), 0);
      await u.pg.locator('nav.tabs button[data-tab="more"]').click(); await u.pg.locator('#panel-more [data-go="models"]').click();
      await u.pg.locator('#mdSport [data-md-sport="CFB"]').click();
      assert.doesNotMatch(await u.pg.locator("#mdGames").innerText(), /under construction/i);
    });
    assert.deepEqual(u.errors, []);
    await u.ctx.close();
    const {ctx, pg, errors, logoHits} = await open(browser, base, false);
    // the same board as every other sport: day tabs, Kalshi-odds cards with Track, no "DeVig's picks" (no CFB model)
    await t.test("home: CFB board", async () => {
      await pg.locator('#sportPills [data-sport="CFB"]').click();
      await pg.locator("#homeSlate .card.game").first().waitFor();
      assert.ok(await pg.locator("#dayTabs button").count() >= 2, "a tab per day");
      assert.match(await pg.locator("#homeSlate .home-sec").first().innerText(), /Games[\s\S]*Kalshi odds/);
      assert.doesNotMatch(await pg.locator("#homeSlate").innerText(), /DeVig's picks|No pick clears the bar/);
      const live = pg.locator("#homeSlate .card.game").first();
      assert.match(await live.innerText(), /MOST[\s\S]*1[47][\s\S]*DEL[\s\S]*17/, "the live score, before the fast feed answers too");
      await pg.waitForFunction(() => /21/.test(document.querySelector("#homeSlate .card.game").innerText), null, {timeout: 70000});
      assert.match(await live.innerText(), /MOST[\s\S]*21[\s\S]*DEL[\s\S]*17/, "fast feed score wins");
      assert.equal(await live.locator(".trk").count(), 1, "Track, like every sport");
      assert.equal(await pg.locator(".tm-badge img").count(), 0, "no logos when signed out");
      await pg.screenshot({path: OUT + "cfb-home.png", fullPage: true});
      const w = await pg.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(w <= 390, `page is ${w}px wide`);
      const box = await live.locator(".game-head").boundingBox();
      assert.ok(box.height >= 44);
      await pg.locator("#dayTabs button").nth(1).click();
      assert.match(await pg.locator("#homeSlate .card.game").first().innerText(), /IU[\s\S]*Kalshi 69%[\s\S]*MICH[\s\S]*Kalshi 31%/);
    });
    await t.test("open a game: its game page, with the win-chance graph and spread wheel", async () => {
      await pg.locator("#homeSlate .card.game .game-head").first().click();
      const page = pg.locator("#panel-game");
      await page.waitFor({state: "visible"});
      assert.match(await page.locator(".gp-title").innerText(), /Michigan @ Indiana|Indiana @ Michigan/);
      await page.locator(".lv-chart").waitFor({timeout: 5000});
      assert.match(await page.locator(".lv-chart").innerText(), /Win chance · Kalshi/);
      assert.ok(await page.locator(".sw-wheel").count() >= 1);
      assert.match(await page.locator(".gp-head").innerText(), /Kalshi \d+%/, "Kalshi's chance under each school");
      const pc = page.locator(".poly-cmp");
      await pc.waitFor({timeout: 5000});
      assert.match(await pc.innerText(), /IU to win\s+Kalshi 72¢ · Polymarket 71¢[\s\S]*MICH to win\s+Kalshi 32¢ · Polymarket 30¢/);
      assert.equal(await pc.locator("b").count(), 2, "the cheaper price is marked on both rows");
      assert.match(await pc.innerText(), /MICH win chance: Kalshi 31% · Polymarket 30%\./);
      await pg.screenshot({path: OUT + "cfb-open.png", fullPage: true});
      await page.locator(".back-more").click();
      await pg.locator("#panel-home").waitFor({state: "visible"});
    });
    await t.test("models tab lists CFB", async () => {
      await pg.locator('nav.tabs button[data-tab="more"]').click(); await pg.locator('#panel-more [data-go="models"]').click();
      await pg.locator('#mdSport [data-md-sport="CFB"]').waitFor();
    });
    await t.test("history: CFB finals vs Kalshi", async () => {
      await pg.locator('nav.tabs button[data-tab="scan"]').click();
      await pg.locator('#pastSportPills [data-past-sport="CFB"]').click();
      await pg.locator(".cfb-past").first().waitFor();
      assert.match(await pg.locator("#pastRecord").innerText(), /1–1[\s\S]*Kalshi favourites won[\s\S]*1–1[\s\S]*covered/);
      assert.match(await pg.locator(".cfb-past").first().innerText(), /Alabama[\s\S]*20[\s\S]*Georgia[\s\S]*27[\s\S]*won[\s\S]*covered/);
      assert.match(await pg.locator(".cfb-past").nth(1).innerText(), /didn't cover/);
      await pg.screenshot({path: OUT + "cfb-history.png", fullPage: true});
      const w = await pg.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(w <= 390, `page is ${w}px wide`);
      await pg.locator(".cfb-past").first().click();           // a final opens the same game page as every sport
      const page = pg.locator("#panel-game");
      await page.waitFor({state: "visible"});
      assert.match(await page.locator(".gp-title").innerText(), /Alabama @ Georgia/);
      assert.match(await page.innerText(), /FINAL[\s\S]*20[\s\S]*27/i);
      assert.ok(await page.getByRole("button", {name: "Matchup"}).count() >= 1 || /Matchup/.test(await page.innerText()));
      await page.locator(".back-more").click();
      await pg.locator(".cfb-past").first().waitFor();
    });
    assert.deepEqual(errors, []);
    await ctx.close();
    const s = await open(browser, base, true);
    await t.test("signed in: ESPN logos by team id", async () => {
      await s.pg.locator('#sportPills [data-sport="CFB"]').click();
      await s.pg.locator("#homeSlate .card.game .tm-badge img").first().waitFor();
      assert.ok(s.logoHits.some(u => u.endsWith("/teamlogos/ncaa/500/48.png")), s.logoHits.join(","));
      await s.pg.screenshot({path: OUT + "cfb-home-logos.png"});
    });
    assert.deepEqual(s.errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});
