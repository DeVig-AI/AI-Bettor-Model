// Phone check of History: a graded NFL final beats a live file that stopped mid-game, and an MLB game MLB postponed
// (never played, so never graded) stays out of History.   node --test tests/app/history.test.mjs
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
const kNfl = now - 18 * 3600e3, kMlb = now - 30 * 3600e3, kPpd = now - 28 * 3600e3;
function pair(base, market, outcome){
  return [{collection: "slate", doc_id: base.game_id, data: Object.assign({}, base, {market, model: {available: true, winner_prob: 0.6,
            winner_side: base.home_team}, synced_at: iso(now)})},
          {collection: "decisions", doc_id: base.game_id, data: Object.assign({}, base, {locked_at: iso(now - 40 * 3600e3),
            decision: {action: "PASS", prob: 0.6, side: null, tier: null}, market_snapshot: market, outcome})}];
}
const nfl = {game_id: "2026_07_NE_CHI", away_team: "NE", home_team: "CHI", kickoff_time: iso(kNfl), season: 2026, week: 7, sport: "NFL"};
const NFL = {sport: "NFL", generated_at: iso(now), docs: pair(nfl, {moneyline_home: -150, moneyline_away: 130},
  {resolved: true, away_score: 24, home_score: 30})};
// the live bot's file, written in the first quarter and never again
const LIVE = {generated_at: iso(kNfl + 37 * 60e3), active: true, games: [{away: "NE", home: "CHI", kickoff: iso(kNfl), state: "in",
  detail: "1:38 - 1st", away_score: 0, home_score: 10, espn_id: "401", picks: []}]};
const played = {game_id: "MIL202610200", away_team: "TB", home_team: "MIL", kickoff_time: iso(kMlb), game_date: day(kMlb), season: 2026, sport: "MLB"};
const ppd = {game_id: "CLE202610180", away_team: "TB", home_team: "CLE", kickoff_time: iso(kPpd), game_date: day(kPpd), season: 2026, sport: "MLB"};
const MLB = {sport: "MLB", generated_at: iso(now), docs: pair(played, {moneyline_home: -120, moneyline_away: 110},
  {resolved: true, away_score: 3, home_score: 5}).concat(pair(ppd, {moneyline_home: 117, moneyline_away: -122},
  {resolved: false, away_score: null, home_score: null, not_played: "Postponed"}))};

const MIME = {".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png"};
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname.startsWith("/api/")) { res.writeHead(404); return res.end("{}"); }
  const f = path.join(DOCS, u.pathname === "/" ? "index.html" : u.pathname);
  if (!f.startsWith(DOCS) || !existsSync(f)) { res.writeHead(404); return res.end(""); }
  res.writeHead(200, {"content-type": MIME[path.extname(f)] || "application/octet-stream"});
  res.end(readFileSync(f));
});

test("History on a phone", async (t) => {
  await new Promise(ok => server.listen(0, ok));
  const base = `http://localhost:${server.address().port}`;
  const browser = await chromium.launch({executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
  try {
    const ctx = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, isMobile: true, hasTouch: true});
    await ctx.route(/fonts\.(googleapis|gstatic)\.com|espncdn/, r => r.abort());
    await ctx.route(/raw\.githubusercontent\.com/, r => {
      const p = new URL(r.request().url()).pathname;
      if (p.endsWith("/nfl/lineboard_export.json")) return r.fulfill({json: NFL});
      if (p.endsWith("/mlb/lineboard_export.json")) return r.fulfill({json: MLB});
      if (p.endsWith("/nfl/live/props_live.json")) return r.fulfill({json: LIVE});
      return r.fulfill({status: 404, body: ""});
    });
    await ctx.addInitScript(() => { try { localStorage.setItem("devig.installTip.v1", "1"); } catch (e) {} });
    const pg = await ctx.newPage();
    const errors = [];
    pg.on("pageerror", e => errors.push(String(e)));
    await pg.goto(base + "/");
    await pg.locator("#splash").waitFor({state: "detached", timeout: 15000});
    await pg.locator('nav.tabs button[data-tab="scan"]').click();

    await t.test("NFL: a graded final, not the live file's first quarter", async () => {
      await pg.locator('#pastSportPills [data-past-sport="NFL"]').click();
      const card = pg.locator("#pastGames .card.game").first();
      await card.waitFor();
      const txt = await card.innerText();
      assert.doesNotMatch(txt, /LIVE|1:38/);
      assert.match(txt, /FINAL/i);
      assert.match(txt, /NE[\s\S]*24[\s\S]*CHI[\s\S]*30/);
      await pg.screenshot({path: OUT + "history-nfl.png", fullPage: true});
    });
    await t.test("MLB: a postponed game is not in History", async () => {
      await pg.locator('#pastSportPills [data-past-sport="MLB"]').click();
      await pg.locator("#pastGames .card.game").first().waitFor();
      assert.equal(await pg.locator("#pastGames .card.game").count(), 1);
      assert.match(await pg.locator("#pastGames").innerText(), /MIL/);
      assert.doesNotMatch(await pg.locator("#panel-scan").innerText(), /CLE/);
      await pg.screenshot({path: OUT + "history-mlb.png", fullPage: true});
    });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});
