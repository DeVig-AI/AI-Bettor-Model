// Phone check: tapping an NFL game opens its game page: the live field (ball spot, first-down line, drive), then
// Plays, Picks & lines, Box and Scoring, updating by itself from the fast feed. Back returns to the board.
//   node --test tests/app/gamepage.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { scoreboard, nflGame, nflBox } from "../../functions/api/live.js";
import { scoreboard as espnScoreboard, summary } from "./espn_nfl_fixture.mjs";

const require = createRequire(import.meta.url);
let chromium;
try { ({chromium} = require("playwright")); } catch (e) { ({chromium} = require("/opt/node22/lib/node_modules/playwright")); }
const DOCS = new URL("../../docs/", import.meta.url).pathname;
const OUT = new URL("./out/", import.meta.url).pathname;
mkdirSync(OUT, {recursive: true});

const now = Date.now(), iso = ms => new Date(ms).toISOString().replace(/\.\d+Z$/, "Z");
const kLive = now - 150 * 60e3;
const ymd = ms => { const d = new Date(ms); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const NFL = {sport: "NFL", generated_at: iso(now), docs: [{collection: "slate", doc_id: "G1", data: {
  game_id: "2026_07_SF_SEA", sport: "NFL", season: 2026, away_team: "SF", home_team: "SEA", kickoff_time: iso(kLive), game_date: ymd(kLive),
  market: {book: "Kalshi", moneyline_away: 125, moneyline_home: -145},
  model: {available: true, status: "locked", winner_side: "SEA", winner_prob: 0.66, note: "test"}}}]};
// The fast feed, built by the real /api/live code from ESPN-shaped data (no cache, so the test can move the game on).
let next = false, td = false, fg = false, finished = false;
const PROPS_LIVE = {generated_at: iso(now), games: [{away: "SF", home: "SEA", kickoff: iso(kLive), state: "post", detail: "Final",
  espn_id: "401", away_score: 21, home_score: 26, picks: []}]};
const MIME = {".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png"};
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const j = b => { res.writeHead(200, {"content-type": "application/json"}); res.end(JSON.stringify(b)); };
  if (u.pathname === "/api/live") {
    if (u.searchParams.get("sport") !== "nfl") return j({games: []});
    if (u.searchParams.get("event") === "401") {
      const d = summary({next, td, fg});
      return j(Object.assign({sport: "nfl", event: "401", players: nflBox(d)}, u.searchParams.get("game") === "1" ? {game: nflGame(d)} : {}));
    }
    return j({sport: "nfl", games: finished ? [] : scoreboard(espnScoreboard(iso(kLive), {next, td, fg}), "nfl")});
  }
  if (u.pathname.startsWith("/api/")) { res.writeHead(404); return res.end("{}"); }
  const f = path.join(DOCS, u.pathname === "/" ? "index.html" : u.pathname);
  if (!f.startsWith(DOCS) || !existsSync(f)) { res.writeHead(404); return res.end(""); }
  res.writeHead(200, {"content-type": MIME[path.extname(f)] || "application/octet-stream"});
  res.end(readFileSync(f));
});
const X = yd => 24 + yd * 3.12;                 // the field's x for a spot (yards from the away goal line)

test("NFL game page with the live field", async (t) => {
  await new Promise(ok => server.listen(0, ok));
  const base = `http://localhost:${server.address().port}`;
  const browser = await chromium.launch({executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
  try {
    const ctx = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, isMobile: true, hasTouch: true});
    await ctx.route(/fonts\.(googleapis|gstatic)\.com|espncdn/, r => r.abort());
    await ctx.route(/raw\.githubusercontent\.com/, r => {
      const p = new URL(r.request().url()).pathname;
      if (p.endsWith("/nfl/lineboard_export.json")) return r.fulfill({json: NFL});
      if (finished && p.endsWith("/nfl/live/props_live.json")) return r.fulfill({json: PROPS_LIVE});
      return r.fulfill({status: 404, body: ""});
    });
    await ctx.addInitScript(() => { try { localStorage.setItem("devig.installTip.v1", "1"); } catch (e) {} });
    const pg = await ctx.newPage();
    const errors = [];
    pg.on("pageerror", e => errors.push(String(e)));
    await pg.goto(base + "/");
    await pg.locator("#splash").waitFor({state: "detached", timeout: 15000});
    const card = pg.locator("#homeSlate .card.game", {hasText: "SEA"}).first();
    const page = pg.locator("#panel-game");

    await t.test("the board card shows the field once the fast feed has the game", async () => {
      await pg.locator('#sportPills [data-sport="NFL"]').click();
      await card.locator(".ft").waitFor({timeout: 15000});
      assert.match(await card.locator(".ft-row").innerText(), /SF ball · 3rd & 14 · SEA 37/);
      assert.match(await card.locator(".game-more").innerText(), /Live game ›/);
      assert.equal(Number(await card.locator(".ft-ball").getAttribute("cx")), +X(63).toFixed(1));
      assert.equal(Number(await card.locator(".ft-fd").getAttribute("x1")), +X(77).toFixed(1), "first-down line 14 yards on");
      await pg.screenshot({path: OUT + "nfl-board-field.png"});
    });

    await t.test("tapping it opens the game page on Plays", async () => {
      await card.locator(".game-head").click();
      await page.waitFor({state: "visible"});
      assert.ok(await pg.locator("#panel-home").isHidden());
      assert.match(await page.locator(".gp-title").innerText(), /SF @ SEA/);
      await page.locator(".gp-play", {hasText: "B.Aiyuk"}).waitFor({timeout: 10000});
      assert.match(await page.locator(".sb-tabs .pill-tab.active").innerText(), /Plays/);
      assert.deepEqual(await page.locator(".sb-tabs .pill-tab").allInnerTexts(), ["Plays", "Picks & lines", "Box", "Scoring"]);
      const plays = page.locator(".gp-play");
      assert.match(await plays.first().innerText(), /Pass Incompletion[\s\S]*2nd & 14[\s\S]*11:49[\s\S]*incomplete/, "newest first");
      assert.match(await page.locator(".gp-play.big").innerText(), /\+28 yds/);
      assert.match(await page.locator(".gp-play.score").innerText(), /Score · 21–26[\s\S]*TOUCHDOWN/);
      assert.match(await page.locator(".ft-row").innerText(), /5 plays, 37 yards, 2:42/, "the drive from the game detail");
      await pg.screenshot({path: OUT + "nfl-game-plays.png", fullPage: true});
    });

    await t.test("Picks & lines, Box and Scoring", async () => {
      await page.locator('.sb-tabs button[data-k="game"]').click();
      assert.match(await page.locator(".sb-pane").innerText(), /SEA/);
      await page.locator('.sb-tabs button[data-k="box"]').click();
      assert.match(await page.locator(".gp-ts").innerText(), /SF\s+SEA[\s\S]*338\s+Total yards\s+301/);
      assert.match(await page.locator(".gp-box").innerText(), /SF Passing[\s\S]*Brock Purdy\s+20\/29\s+236\s+2\s+0/);
      await page.locator('.sb-tabs button[data-k="scoring"]').click();
      assert.match(await page.locator(".sb-pane").innerText(), /TD · Q4 14:31\s+SF 21 – SEA 26\s+K\.Walker 1 Yd Run/);
      await pg.screenshot({path: OUT + "nfl-game-box.png", fullPage: true});
      await page.locator('.sb-tabs button[data-k="plays"]').click();
    });

    await t.test("it updates by itself when the next play comes in", async () => {
      next = true;
      await page.locator(".gp-play", {hasText: "G.Kittle to SEA 18"}).waitFor({timeout: 45000});
      await pg.waitForFunction(() => /1st & 10 · SEA 18/.test(document.querySelector("#panel-game .ft-row").innerText), null, {timeout: 30000});
      assert.equal(Number(await page.locator(".ft-ball").getAttribute("cx")), +X(82).toFixed(1));
      assert.match(await page.locator(".ft").innerText(), /Red zone/);
      assert.match(await page.locator(".sb-tabs .pill-tab.active").innerText(), /Plays/, "keeps the tab");
      assert.equal(await page.locator(".fx").count(), 0, "a 19-yard catch isn't a big moment, and opening the page replays nothing");
      await pg.screenshot({path: OUT + "nfl-game-next.png", fullPage: true});
    });

    await t.test("a touchdown plays its moment: TOUCHDOWN, then the extra point", async () => {
      td = true;
      const fx = page.locator(".fx.fx-m-td");
      await fx.waitFor({state: "attached", timeout: 45000});
      assert.equal(await fx.getAttribute("aria-label"), "TOUCHDOWN, extra point, SF 28 – 26 SEA");
      assert.deepEqual(await fx.locator(".fx-word").allTextContents(), ["TOUCHDOWN", "EXTRA POINT"]);
      assert.equal(await fx.locator(".fx-field.fx-left").count(), 0, "SF (away) runs it into the right end zone");
      await pg.waitForTimeout(600);
      await pg.screenshot({path: OUT + "nfl-moment-td.png"});
      await pg.waitForTimeout(2000);
      await pg.screenshot({path: OUT + "nfl-moment-pat.png"});
      await fx.waitFor({state: "detached", timeout: 6000});
    });

    await t.test("a field goal plays FIELD GOAL, and its overlay stays over the summary", async () => {
      fg = true;
      const fx = page.locator(".fx.fx-m-kick");
      await fx.waitFor({state: "attached", timeout: 45000});
      assert.match(await fx.innerText(), /FIELD GOAL[\s\S]*SF 31 – 26 SEA/);
      await pg.waitForTimeout(900);                         // well into the kick: the ball moves, the overlay doesn't
      const [o, h] = [await fx.boundingBox(), await page.locator(".gp-head").boundingBox()];
      assert.deepEqual([Math.round(o.x), Math.round(o.y), Math.round(o.width)], [Math.round(h.x), Math.round(h.y), Math.round(h.width)]);
      await fx.waitFor({state: "detached", timeout: 6000});
    });

    await t.test("Back, and the phone's back, return to the board", async () => {
      await page.locator(".back-more").click();
      await pg.locator("#panel-home").waitFor({state: "visible"});
      assert.ok(await page.isHidden());
      await card.locator(".game-head").click();
      await page.waitFor({state: "visible"});
      await pg.goBack();
      await pg.locator("#panel-home").waitFor({state: "visible"});
      assert.ok(await page.isHidden());
    });
    await t.test("a finished game (only in the live bot's file) still gets its plays, box and scoring", async () => {
      finished = true;
      await pg.reload();
      await pg.locator("#splash").waitFor({state: "detached", timeout: 15000});
      await pg.locator('[role="tab"][data-tab="scan"], nav.tabs button[data-tab="scan"]').first().click();   // History
      await pg.locator('#pastSportPills [data-past-sport="NFL"]').click();
      const past = pg.locator("#pastGames .card.game", {hasText: "SEA"}).first();
      await past.locator(".game-head").click();
      await page.locator(".gp-play", {hasText: "B.Aiyuk"}).waitFor({timeout: 10000});
      assert.equal(await page.locator(".ft").count(), 0, "no field once it's over");
      assert.match(await page.locator(".game-head").innerText(), /FINAL/);
      await page.locator('.sb-tabs button[data-k="box"]').click();
      assert.match(await page.locator(".gp-box").innerText(), /Brock Purdy/);
      await pg.screenshot({path: OUT + "nfl-game-final.png", fullPage: true});
      await page.locator(".back-more").click();
      await pg.locator("#panel-scan").waitFor({state: "visible"});              // back to History, where it came from
    });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});
