// Phone check: the History tab lists finished NHL and WNBA games (live/market_history.json) the way it lists college
// football's: Kalshi's last chance before the start against the final, favourites' record, puck line / spread, a tab
// per day, and each final opens the shared game page.   node --test tests/app/history_more.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { nhlGame, teamCode } from "../../functions/api/live.js";
import { nhlSummary } from "./espn_more_fixture.mjs";

const require = createRequire(import.meta.url);
let chromium;
try { ({chromium} = require("playwright")); } catch (e) { ({chromium} = require("/opt/node22/lib/node_modules/playwright")); }
const DOCS = new URL("../../docs/", import.meta.url).pathname;
const OUT = new URL("./out/", import.meta.url).pathname;
mkdirSync(OUT, {recursive: true});

const now = Date.now(), iso = ms => new Date(ms).toISOString().replace(/\.\d+Z$/, "Z");
const day = ms => new Date(ms - 4 * 3600e3).toISOString().slice(0, 10);
const k1 = Math.floor(now / 86400e3) * 86400e3 - 2 * 86400e3 + 23 * 3600e3;    // 7pm ET two days ago
const k0 = k1 - 2 * 86400e3;
const HISTORY = {generated_at: iso(now), games: {
  "NHL:600": {sport: "NHL", espn_id: "600", kickoff: iso(k0), date: day(k0), away: "SJ", home: "MTL", backfill: true,
              colors: {away: "#00788c", home: "#af1e2d"}, final: {away: 3, home: 2}},
  "NHL:601": {sport: "NHL", espn_id: "601", kickoff: iso(k1), date: day(k1), away: "TOR", home: "BOS",
              colors: {away: "#00205b", home: "#fcb514"},
              pre: {home_wp: 0.58, ml: {home: -140, away: 120}, spread: {home_point: -1.5, home: 190, away: -230},
                    total: {line: 5.5, over: -110, under: -110}}, final: {away: 1, home: 4}},
  "NHL:602": {sport: "NHL", espn_id: "602", kickoff: iso(k1 + 3600e3), date: day(k1), away: "NYR", home: "PHI",
              pre: {home_wp: 0.47, ml: {home: 110, away: -130}, spread: {home_point: 1.5, home: -250, away: 205},
                    total: {line: 6.5}}, final: {away: 2, home: 3}},
  "WNBA:701": {sport: "WNBA", espn_id: "701", kickoff: iso(k1), date: day(k1), away: "LV", home: "NY",
               pre: {home_wp: 0.66, spread: {home_point: -4.5}, total: {line: 165.5}}, final: {away: 80, home: 78}}}};
const LINES = {generated_at: iso(now), errors: [], games: []};

const MIME = {".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png",
  ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml"};
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const j = b => { res.writeHead(200, {"content-type": "application/json"}); res.end(JSON.stringify(b)); };
  if (u.pathname === "/api/live") {
    if (u.searchParams.get("sport") === "nhl" && u.searchParams.get("event") === "601")
      return j({sport: "nhl", players: {}, game: nhlGame(nhlSummary({goal: true}), teamCode("nhl"))});
    return j({games: []});
  }
  if (u.pathname.startsWith("/api/")) { res.writeHead(404); return res.end("{}"); }
  const f = path.join(DOCS, u.pathname === "/" ? "index.html" : u.pathname);
  if (!f.startsWith(DOCS) || !existsSync(f)) { res.writeHead(404); return res.end(""); }
  res.writeHead(200, {"content-type": MIME[path.extname(f)] || "application/octet-stream"});
  res.end(readFileSync(f));
});

test("History tab: NHL and WNBA finals", async (t) => {
  await new Promise(ok => server.listen(0, ok));
  const base = `http://localhost:${server.address().port}`;
  const browser = await chromium.launch({executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
  try {
    const ctx = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
                                          timezoneId: "America/New_York"});      // days as a US viewer sees them
    await ctx.route(/fonts\.(googleapis|gstatic)\.com|espncdn/, r => r.abort());
    await ctx.route(/raw\.githubusercontent\.com/, r => {
      const p = new URL(r.request().url()).pathname;
      if (p.endsWith("/live/game_lines.json")) return r.fulfill({json: LINES});
      if (p.endsWith("/live/market_history.json")) return r.fulfill({json: HISTORY});
      return r.fulfill({status: 404, body: ""});
    });
    await ctx.addInitScript(() => { try { localStorage.setItem("devig.installTip.v1", "1"); } catch (e) {} });
    const pg = await ctx.newPage();
    const errors = [];
    pg.on("pageerror", e => errors.push(String(e)));
    await pg.goto(base + "/");
    await pg.locator("#splash").waitFor({state: "detached", timeout: 15000});
    await pg.locator('nav.tabs button[data-tab="scan"]').click();

    await t.test("NHL: pill, record, a tab per day, puck line", async () => {
      await pg.locator('#pastSportPills [data-past-sport="NHL"]').click();
      await pg.locator(".cfb-past").first().waitFor();
      assert.match(await pg.locator("#pastRecord").innerText(), /1–1[\s\S]*Kalshi favourites won[\s\S]*1–1[\s\S]*puck line[\s\S]*NHL has no DeVig model/);
      assert.equal(await pg.locator("#pastDays .day-tab").count(), 2);
      const first = pg.locator(".cfb-past").first();
      assert.match(await first.innerText(), /TOR[\s\S]*1[\s\S]*42%[\s\S]*BOS[\s\S]*4[\s\S]*58%[\s\S]*Favourite BOS[\s\S]*won[\s\S]*Puck line BOS -1.5[\s\S]*covered[\s\S]*Total 5.5[\s\S]*stayed under/);
      assert.match(await pg.locator(".cfb-past").nth(1).innerText(), /Favourite NYR[\s\S]*lost[\s\S]*Puck line NYR -1.5[\s\S]*didn't cover/);
      await pg.screenshot({path: OUT + "history-nhl.png", fullPage: true});
      const w = await pg.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(w <= 390, `page is ${w}px wide`);
    });

    await t.test("NHL: a backfilled final with no Kalshi price still shows", async () => {
      await pg.locator("#pastDays .day-tab").first().click();
      const c = pg.locator(".cfb-past").first();
      assert.match(await c.innerText(), /no Kalshi price saved[\s\S]*SJ[\s\S]*3[\s\S]*MTL[\s\S]*2/);
      assert.doesNotMatch(await c.innerText(), /Favourite/);
      await pg.locator("#pastDays .day-tab").nth(1).click();
    });

    await t.test("NHL: a final opens the game page", async () => {
      await pg.locator(".cfb-past").first().click();
      const page = pg.locator("#panel-game");
      await page.waitFor({state: "visible"});
      assert.match(await page.innerText(), /FINAL[\s\S]*1[\s\S]*4/i);
      await page.locator(".sb-tabs .pill-tab").first().waitFor({timeout: 10000});
      assert.ok((await page.locator(".sb-tabs .pill-tab").allInnerTexts()).includes("Box"), "the box score, as for every NHL game");
      await pg.screenshot({path: OUT + "history-nhl-game.png", fullPage: true});
      await page.locator(".back-more").click();
      await pg.locator(".cfb-past").first().waitFor();
    });

    await t.test("WNBA: pill and spread", async () => {
      await pg.locator('#pastSportPills [data-past-sport="WNBA"]').click();
      const c = pg.locator(".cfb-past").first();
      await c.waitFor();
      assert.match(await pg.locator("#pastRecord").innerText(), /0–1[\s\S]*WNBA has no DeVig model/);
      assert.match(await c.innerText(), /LV[\s\S]*80[\s\S]*NY[\s\S]*78[\s\S]*Favourite NY[\s\S]*lost[\s\S]*Spread NY -4.5[\s\S]*didn't cover[\s\S]*Total 165.5/);
    });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});
