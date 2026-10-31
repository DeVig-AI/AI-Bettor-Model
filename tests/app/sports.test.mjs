// Phone check: only in-season sports get a tab (a game in the last 3 days or next 3 weeks); NHL games from Kalshi show
// with ESPN's team colours, NHL props and the live graph, and no picks section; the Testing tab has the NHL props test.
//   node --test tests/app/sports.test.mjs
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
const ymd = ms => iso(ms).slice(0, 10);
const kLive = now - 50 * 60e3, kNba = now + 3 * 3600e3, kWnba = now + 30 * 864e5;
const LINES = {generated_at: iso(now - 300e3), errors: [], games: [
  {sport: "NHL", date: ymd(kLive), event: "KXNHLGAME-X1", home_ticker: "KXNHLGAME-X1-MTL", away: "SJ", home: "MTL",
   spreads: {MTL: [[-1.5, 160], [1.5, -190]], SJ: [[-1.5, 280], [1.5, -340]]}, kickoff: iso(kLive), espn_id: "401",
   home_wp: 0.62, ml: {home: -165, away: 140}, spread: {home_point: -1.5, home: 160, away: -190}, total: {line: 5.5, over: -105, under: -112},
   colors: {away: "#00788c", home: "#af1e2d"}},
  {sport: "NBA", date: ymd(kNba), event: "KXNBAGAME-X2", home_ticker: "KXNBAGAME-X2-NYK", away: "BOS", home: "NYK",
   spreads: {}, kickoff: iso(kNba), espn_id: "402", home_wp: 0.5, ml: {home: -110, away: -105}},
  {sport: "WNBA", date: ymd(kWnba), event: "KXWNBAGAME-X3", home_ticker: "KXWNBAGAME-X3-ATL", away: "GS", home: "ATL",
   spreads: {}, kickoff: iso(kWnba), espn_id: "403", home_wp: 0.55, ml: {home: -125, away: 105}},   // a month out: off-season
]};
const LIVE = {generated_at: iso(now), games: [
  {sport: "NHL", away: "SJ", home: "MTL", kickoff: iso(kLive), espn_id: "401", state: "in", detail: "2nd 8:41",
   away_score: 1, home_score: 2, kalshi_game: {moneyline: {home: -250, away: 205}},
   kalshi_line: {team: "MTL", points: Array.from({length: 30}, (_, i) => [Math.floor(kLive / 1000) - 7200 + i * 300, +(0.62 + i * 0.003).toFixed(3)])}},
]};
const row = (player, stat, line, mp, bid, ask) => ({player, stat, line, model_p: mp, expected: mp, n_games: 400,
  k: {bid, ask, oi: 500, t: "KXNHLGOAL-X1-" + player.replace(/\W/g, "") + line}, k_mid: (bid + ask) / 2, stale: false, injury: null});
const NHL_PROPS = {generated_at: iso(now), docs: [
  {collection: "props_model", doc_id: "nhl1", data: {game_key: ymd(kLive) + "_SJ_MTL", game_date: ymd(kLive), away_team: "SJ", home_team: "MTL",
   kickoff_time: iso(kLive), sport: "NHL", model: "NHL_PROPS_MODEL_V1", locked: true, paper_picks: [], scored_utc: iso(now - 3600e3),
   rows: [row("Cole Caufield", "goals", 0.5, 0.48, 0.38, 0.40), row("Nick Suzuki", "assists", 0.5, 0.52, 0.47, 0.49),
          row("Macklin Celebrini", "points", 0.5, 0.58, 0.55, 0.57)]}},
  {collection: "props_model_report", doc_id: "NHL_PROPS_MODEL_V1", data: {doc: "NHL_PROPS_MODEL_V1", sport: "NHL", prereg_sha256: "8b9cec8b7f7c", paper_picks_graded: 0}},
]};
const MIME = {".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png"};
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname.startsWith("/api/")) { res.writeHead(404); return res.end("{}"); }       // the apps: no fast feed
  const f = path.join(DOCS, u.pathname === "/" ? "index.html" : u.pathname);
  if (!f.startsWith(DOCS) || !existsSync(f)) { res.writeHead(404); return res.end(""); }
  res.writeHead(200, {"content-type": MIME[path.extname(f)] || "application/octet-stream"});
  res.end(readFileSync(f));
});

test("sport tabs: NHL in season, off-season sports hidden", async (t) => {
  await new Promise(ok => server.listen(0, ok));
  const base = `http://localhost:${server.address().port}`;
  const browser = await chromium.launch({executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
  try {
    const ctx = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, isMobile: true, hasTouch: true});
    await ctx.route(/fonts\.(googleapis|gstatic)\.com|espncdn/, r => r.abort());
    await ctx.route(/raw\.githubusercontent\.com/, r => {
      const p = new URL(r.request().url()).pathname;
      if (p.endsWith("/live/game_lines.json")) return r.fulfill({json: LINES});
      if (p.endsWith("/live/live_lines.json")) return r.fulfill({json: LIVE});
      if (p.endsWith("/nhl/props_model_export.json")) return r.fulfill({json: NHL_PROPS});
      return r.fulfill({status: 404, body: ""});
    });
    await ctx.addInitScript(() => { try { localStorage.setItem("devig.installTip.v1", "1"); } catch (e) {} });
    const pg = await ctx.newPage();
    const errors = [];
    pg.on("pageerror", e => errors.push(String(e)));
    await pg.goto(base + "/");
    await pg.locator("#splash").waitFor({state: "detached", timeout: 15000});
    await t.test("only sports with games near now get a tab", async () => {
      await pg.waitForFunction(() => document.querySelector('#sportPills [data-sport="NFL"]').hidden);
      const shown = await pg.$$eval("#sportPills .pill-tab", bs => bs.filter(b => !b.hidden).map(b => b.dataset.sport));
      assert.deepEqual(shown, ["NBA", "NHL"]);
      assert.equal(await pg.locator("#sportPills .pill-tab.active").getAttribute("data-sport"), "NBA", "NFL is off: the first tab in season opens");
      await pg.screenshot({path: OUT + "sports-tabs.png"});
    });
    await t.test("NHL: Kalshi game with ESPN colours, live score and graph", async () => {
      await pg.locator('#sportPills [data-sport="NHL"]').click();
      const card = pg.locator("#homeSlate .card.game", {hasText: "MTL"});
      await card.first().waitFor();
      assert.match(await card.innerText(), /LIVE[\s\S]*2nd 8:41[\s\S]*SJ[\s\S]*1[\s\S]*\+140[\s\S]*MTL[\s\S]*2[\s\S]*-165/);
      assert.match(await card.evaluate(e => e.textContent), /No model pick · Kalshi odds/);   // folded on a live card
      const home = await pg.locator("#homeSlate").innerText();
      assert.doesNotMatch(home, /DeVig's picks|No pick clears the bar/, "no picks section: NHL has no game model");
      assert.match(home, /Games\s*Kalshi odds/);
      await card.locator(".lv-chart").waitFor({timeout: 10000});
      const bg = await card.locator(".tm-badge").first().evaluate(e => getComputedStyle(e).backgroundColor);
      assert.equal(bg, "rgb(0, 120, 140)", "SJ's ESPN colour");
      await pg.screenshot({path: OUT + "sports-nhl.png", fullPage: true});
    });
    await t.test("NHL props: goals, assists and points tabs on the game", async () => {
      const card = pg.locator("#homeSlate .card.game", {hasText: "MTL"});
      assert.match(await card.locator(".game-more").evaluate(e => e.textContent), /Live game ›/, "a live game's card opens the game page");
      await card.locator(".game-head").click();                      // opens the game page
      const page = pg.locator("#panel-game");
      const tabs = await page.locator(".sb-tabs button").allInnerTexts();
      for (const label of ["Goals", "Assists", "Points"]) assert.ok(tabs.includes(label), label + " tab");
      await page.locator('.sb-tabs button[data-k="goals"]').click();
      await page.getByText("Cole Caufield").first().waitFor({timeout: 5000});
      // the market's chance first (Kalshi's mid), the model's second
      assert.match(await page.locator(".pp-row", {hasText: "Cole Caufield"}).first().locator(".pp-sub").innerText(), /^Kalshi 39% over · model 48%/);
      await pg.screenshot({path: OUT + "sports-nhl-props.png", fullPage: true});
    });
    await t.test("Testing lists the NHL props test", async () => {
      await pg.locator('nav.tabs button[data-tab="more"]').click();
      await pg.locator('#panel-more [data-go="lab"]').click();
      await pg.waitForFunction(() => /NHL prop picks · test/.test(document.getElementById("testingMore").textContent));
      assert.match(await pg.locator("#testingMore").evaluate(e => e.textContent), /puck drop[\s\S]*Judged at 500 picks/);
    });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});
