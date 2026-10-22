// Phone check: MLB, NHL and WNBA games (Kalshi-only, no model) get what NFL and NBA games get: Kalshi's chance under
// each team, the game page with its tracker (bases and count; the last play; the shot chart), Plays / Box / Innings,
// Periods or Quarters, and a big moment when a home run or a goal comes in.   node --test tests/app/moresports.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { scoreboard, nbaGame, nhlGame, mlbGame, teamCode } from "../../functions/api/live.js";
import { nhlScoreboard, nhlSummary, mlbScoreboard, mlbSummary } from "./espn_more_fixture.mjs";
import { scoreboard as nbaScoreboard, summary as nbaSummary } from "./espn_nba_fixture.mjs";

const require = createRequire(import.meta.url);
let chromium;
try { ({chromium} = require("playwright")); } catch (e) { ({chromium} = require("/opt/node22/lib/node_modules/playwright")); }
const DOCS = new URL("../../docs/", import.meta.url).pathname;
const OUT = new URL("./out/", import.meta.url).pathname;
mkdirSync(OUT, {recursive: true});

const now = Date.now(), iso = ms => new Date(ms).toISOString().replace(/\.\d+Z$/, "Z");
const k = iso(now - 80 * 60e3), day = k.slice(0, 10);
const LINES = {generated_at: iso(now), errors: [], games: [
  {sport: "MLB", date: day, event: "KXMLBGAME-WS3", away: "LAD", home: "NYY", kickoff: k, espn_id: "701", ml: {home: -120, away: 102}},
  {sport: "NHL", date: day, event: "KXNHLGAME-T1", away: "TOR", home: "BOS", kickoff: k, espn_id: "601", ml: {home: -140, away: 120}},
  {sport: "WNBA", date: day, event: "KXWNBAGAME-F1", away: "LAL", home: "BOS", kickoff: k, espn_id: "501", ml: {home: -150, away: 130}}]};
const state = {hr: false, goal: false};
const FEEDS = {
  mlb: {board: () => mlbScoreboard(k, state), event: "701", game: () => mlbGame(mlbSummary(state), teamCode("mlb"))},
  nhl: {board: () => nhlScoreboard(k, state), event: "601", game: () => nhlGame(nhlSummary(state), teamCode("nhl"))},
  wnba: {board: () => nbaScoreboard(k), event: "501", game: () => nbaGame(nbaSummary(), teamCode("wnba"))}};
const MIME = {".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png"};
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const j = b => { res.writeHead(200, {"content-type": "application/json"}); res.end(JSON.stringify(b)); };
  if (u.pathname === "/api/live") {
    const sp = u.searchParams.get("sport"), f = FEEDS[sp];
    if (!f) return j({games: []});
    if (u.searchParams.get("event") === f.event) return j({sport: sp, players: {}, game: f.game()});
    return j({sport: sp, games: scoreboard(f.board(), sp)});
  }
  if (u.pathname.startsWith("/api/")) { res.writeHead(404); return res.end("{}"); }
  const f = path.join(DOCS, u.pathname === "/" ? "index.html" : u.pathname);
  if (!f.startsWith(DOCS) || !existsSync(f)) { res.writeHead(404); return res.end(""); }
  res.writeHead(200, {"content-type": MIME[path.extname(f)] || "application/octet-stream"});
  res.end(readFileSync(f));
});

test("MLB, NHL and WNBA game pages", async (t) => {
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
    const page = pg.locator("#panel-game");
    async function openSport(sp, team){
      await pg.locator(`#sportPills [data-sport="${sp}"]`).click();
      const card = pg.locator("#homeSlate .card.game", {hasText: team}).first();
      await card.waitFor();
      return card;
    }

    await t.test("MLB: the card shows the bases, the count and Kalshi's chance", async () => {
      const card = await openSport("MLB", "NYY");
      await card.locator(".bb").waitFor({timeout: 15000});
      assert.match(await card.locator(".bb").innerText(), /P: B\. Treinen · AB: A\. Judge[\s\S]*Stanton walked/);
      assert.equal(await card.locator(".bb-base.on").count(), 2, "runners on first and second");
      assert.match(await card.locator(".sb-grid").innerText(), /LAD[\s\S]*Kalshi 4\d%[\s\S]*NYY[\s\S]*Kalshi 5\d%/);
      await pg.screenshot({path: OUT + "mlb-card.png"});
      await card.locator(".game-head").click();
      await page.locator(".gp-play").first().waitFor({timeout: 10000});
      assert.deepEqual(await page.locator(".sb-tabs .pill-tab").allInnerTexts(), ["Plays", "Picks & lines", "Box", "Innings"]);
      assert.doesNotMatch(await page.locator(".sb-pane").innerText(), /Ball 1|Strike 1/, "no pitch-by-pitch rows");
      assert.match(await page.locator(".gp-q").first().innerText(), /BOTTOM 7TH/i);
      await page.locator('.sb-tabs button[data-k="box"]').click();
      assert.match(await page.locator(".gp-box").first().innerText(), /NYY Batting\s+AB\s+R\s+H\s+RBI\s+HR[\s\S]*Aaron Judge\s+2\s+0\s+1\s+0\s+0/);
      await page.locator('.sb-tabs button[data-k="periods"]').click();
      assert.match(await page.locator(".gp-box").innerText(), /1\s+2\s+3\s+4\s+5\s+6\s+7\s+8\s+9\s+T/);
      await page.locator('.sb-tabs button[data-k="game"]').click();
      assert.match(await page.locator(".sb-pane").innerText(), /NO PICK/);
      assert.doesNotMatch(await page.locator(".sb-pane").innerText(), /not yet synced/);
      await page.locator('.sb-tabs button[data-k="plays"]').click();
    });

    await t.test("MLB: a home run plays HOME RUN", async () => {
      state.hr = true;
      const fx = page.locator(".fx.fx-m-hr");
      await fx.waitFor({state: "attached", timeout: 45000});
      assert.match(await fx.innerText(), /HOME RUN/);
      assert.match(await page.locator(".gp-play").first().innerText(), /^Home run · 3–5/m, "named by what happened");
      await pg.waitForTimeout(700);
      await pg.screenshot({path: OUT + "mlb-moment-hr.png"});
      await page.locator(".back-more").click();
    });

    await t.test("NHL: page with the last play, Periods and goalie columns; a power-play goal plays GOAL", async () => {
      const card = await openSport("NHL", "BOS");
      assert.match(await card.locator(".sb-grid").innerText(), /Kalshi \d+%/);
      await card.locator(".game-head").click();
      await page.locator(".gp-play").first().waitFor({timeout: 10000});
      assert.deepEqual(await page.locator(".sb-tabs .pill-tab").allInnerTexts(), ["Plays", "Picks & lines", "Matchup", "Box", "Periods"]);
      assert.doesNotMatch(await page.locator(".sb-pane").innerText(), /faceoff|blocked/i);
      assert.match(await page.locator(".ft-last").innerText(), /Last play · 11:02 · Mitch Marner Wrist Shot saved by Jeremy Swayman/);
      await page.locator('.sb-tabs button[data-k="box"]').click();
      assert.match(await page.locator(".gp-box").nth(1).innerText(), /BOS Goalies\s+SA\s+SV\s+SV%\s+GA[\s\S]*Jeremy Swayman\s+18\s+17\s+\.944\s+1/);
      await page.locator('.sb-tabs button[data-k="periods"]').click();
      assert.match(await page.locator(".gp-box").innerText(), /P1\s+P2\s+P3\s+T\s+TOR\s+0\s+1\s+–/);
      state.goal = true;
      const fx = page.locator(".fx.fx-m-goal");
      await fx.waitFor({state: "attached", timeout: 45000});
      assert.match(await fx.innerText(), /GOAL[\s\S]*POWER PLAY · TOR 1 – 3 BOS/);
      await pg.waitForTimeout(500);
      await pg.screenshot({path: OUT + "nhl-moment-goal.png"});
      await page.locator(".back-more").click();
    });

    await t.test("WNBA: the shot chart and Quarters, like the NBA", async () => {
      const card = await openSport("WNBA", "BOS");
      await card.locator(".game-head").click();
      await page.locator(".ct").waitFor({timeout: 10000});
      assert.deepEqual(await page.locator(".sb-tabs .pill-tab").allInnerTexts(), ["Plays", "Picks & lines", "Matchup", "Box", "Quarters"]);
      assert.equal(await page.locator(".ct-shot").count(), 5);
    });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});
