// Phone check: an NBA game's page: the shot chart (made filled, missed hollow, the newest ringed), the current run,
// Plays, Box and Quarters, updating by itself from the fast feed.   node --test tests/app/nbagame.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { scoreboard, nbaGame, nbaBox, teamCode } from "../../functions/api/live.js";
import { scoreboard as espnScoreboard, summary } from "./espn_nba_fixture.mjs";

const require = createRequire(import.meta.url);
let chromium;
try { ({chromium} = require("playwright")); } catch (e) { ({chromium} = require("/opt/node22/lib/node_modules/playwright")); }
const DOCS = new URL("../../docs/", import.meta.url).pathname;
const OUT = new URL("./out/", import.meta.url).pathname;
mkdirSync(OUT, {recursive: true});

const now = Date.now(), iso = ms => new Date(ms).toISOString().replace(/\.\d+Z$/, "Z");
const kLive = now - 100 * 60e3;
const ymd = ms => { const d = new Date(ms); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const NBA = {sport: "NBA", generated_at: iso(now), docs: [{collection: "slate", doc_id: "G1", data: {
  game_id: "G1", sport: "NBA", season: 2026, away_team: "LAL", home_team: "BOS", kickoff_time: iso(kLive), game_date: ymd(kLive),
  market: {book: "Kalshi", moneyline_away: 135, moneyline_home: -160},
  model: {available: true, status: "locked", winner_side: "BOS", winner_prob: 0.62, note: "test"}}}]};
let next = false;
const MIME = {".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png"};
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const j = b => { res.writeHead(200, {"content-type": "application/json"}); res.end(JSON.stringify(b)); };
  if (u.pathname === "/api/live") {
    if (u.searchParams.get("sport") !== "nba") return j({games: []});
    if (u.searchParams.get("event") === "501") {
      const d = summary({next});
      return j(Object.assign({sport: "nba", event: "501", players: nbaBox(d)}, u.searchParams.get("game") === "1" ? {game: nbaGame(d, teamCode("nba"))} : {}));
    }
    return j({sport: "nba", games: scoreboard(espnScoreboard(iso(kLive), {next}), "nba")});
  }
  if (u.pathname.startsWith("/api/")) { res.writeHead(404); return res.end("{}"); }
  const f = path.join(DOCS, u.pathname === "/" ? "index.html" : u.pathname);
  if (!f.startsWith(DOCS) || !existsSync(f)) { res.writeHead(404); return res.end(""); }
  res.writeHead(200, {"content-type": MIME[path.extname(f)] || "application/octet-stream"});
  res.end(readFileSync(f));
});

test("NBA game page with the shot chart", async (t) => {
  await new Promise(ok => server.listen(0, ok));
  const base = `http://localhost:${server.address().port}`;
  const browser = await chromium.launch({executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
  try {
    const ctx = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, isMobile: true, hasTouch: true});
    await ctx.route(/fonts\.(googleapis|gstatic)\.com|espncdn/, r => r.abort());
    await ctx.route(/raw\.githubusercontent\.com/, r => new URL(r.request().url()).pathname.endsWith("/nba/lineboard_export.json")
      ? r.fulfill({json: NBA}) : r.fulfill({status: 404, body: ""}));
    await ctx.addInitScript(() => { try { localStorage.setItem("devig.installTip.v1", "1"); } catch (e) {} });
    const pg = await ctx.newPage();
    const errors = [];
    pg.on("pageerror", e => errors.push(String(e)));
    await pg.goto(base + "/");
    await pg.locator("#splash").waitFor({state: "detached", timeout: 15000});
    const card = pg.locator("#homeSlate .card.game", {hasText: "BOS"}).first();
    const page = pg.locator("#panel-game");

    await t.test("the live card opens the game page on Plays, with the shot chart", async () => {
      await pg.locator('#sportPills [data-sport="NBA"]').click();
      await pg.waitForFunction(() => /Live game ›/.test((document.querySelector("#homeSlate .card.game .game-more") || {}).textContent || ""), null, {timeout: 15000});
      assert.equal(await card.locator(".ct").count(), 0, "the chart is on the game page only");
      await card.locator(".game-head").click();
      await page.locator(".ct").waitFor({timeout: 10000});
      assert.equal(await page.locator(".fx").count(), 0, "opening the page replays nothing");
      assert.deepEqual(await page.locator(".sb-tabs .pill-tab").allInnerTexts(), ["Plays", "Picks & lines", "Box", "Quarters"]);
      assert.equal(await page.locator(".ct-shot").count(), 5, "five shots with a spot (no free throw, no foul)");
      assert.equal(await page.locator(".ct-shot.made").count(), 4);
      // the newest shot (White's three from the far half, folded to x 4, y 20) gets the ring
      assert.equal(await page.locator(".ct-new").getAttribute("cx"), (4 * 7.2).toFixed(1));
      assert.equal(await page.locator(".ct-new").getAttribute("cy"), (20 * 7.2).toFixed(1));
      assert.match(await page.locator(".ct-run").innerText(), /BOS 9–0 run/);
      assert.match(await page.locator(".gp-play.big").first().innerText(), /\+3 · 80–90[\s\S]*Derrick White/);
      await pg.screenshot({path: OUT + "nba-game-plays.png", fullPage: true});
    });

    await t.test("Box and Quarters", async () => {
      await page.locator('.sb-tabs button[data-k="box"]').click();
      assert.match(await page.locator(".gp-box").first().innerText(), /LAL\s+MIN\s+PTS\s+REB\s+AST\s+3PT[\s\S]*Luka Doncic\s+29\s+26\s+6\s+7\s+3-8/);
      assert.doesNotMatch(await page.locator(".sb-pane").innerText(), /Bronny/);
      await page.locator('.sb-tabs button[data-k="quarters"]').click();
      assert.match(await page.locator(".gp-box").innerText(), /Q1\s+Q2\s+Q3\s+Q4\s+T\s+LAL\s+29\s+26\s+25\s+–\s+80\s+BOS\s+24\s+31\s+35\s+–\s+90/);
      await pg.screenshot({path: OUT + "nba-game-quarters.png", fullPage: true});
      await page.locator('.sb-tabs button[data-k="plays"]').click();
    });

    await t.test("it updates by itself: a Lakers dunk ends the run", async () => {
      next = true;
      await page.locator(".gp-play", {hasText: "driving dunk"}).waitFor({timeout: 45000});
      assert.equal(await page.locator(".ct-run").count(), 0);
      assert.equal(await page.locator(".ct-shot").count(), 6);
      assert.equal(await page.locator(".ct-new").getAttribute("cx"), (24 * 7.2).toFixed(1));
      const fx = page.locator(".fx.fx-hoop");
      assert.equal(await fx.count(), 1, "the dunk pops up");
      assert.equal(await fx.locator(".fx-num").innerText(), "2");
      assert.equal(await fx.locator(".fx-sub").innerText(), "DUNK");
      await pg.screenshot({path: OUT + "nba-game-next.png", fullPage: true});
    });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});
