// Phone check: tapping a team's logo on a game opens its Research page: team stats with league ranks, the roster in
// Offense and Defense tabs by position, and under each player his main prop line for the next game with how often he
// went over it lately. Stats built here by tools/stats_nfl.py from tests/tools/nfl_stats_fixture.py (never committed).
//   node --test tests/app/teampage.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
let chromium;
try { ({chromium} = require("playwright")); } catch (e) { ({chromium} = require("/opt/node22/lib/node_modules/playwright")); }
const ROOT = new URL("../../", import.meta.url).pathname;
const DOCS = ROOT + "docs/";
const OUT = new URL("./out/", import.meta.url).pathname;
const STATS = OUT + "stats/";
mkdirSync(OUT, {recursive: true});
execFileSync("python3", ["-c", `
import sys
sys.path[:0] = ["tools", "tests/tools"]
from datetime import datetime, timezone
import nfl_stats_fixture as F, stats_nfl as N
F.make_cache(sys.argv[1] + "cache")
N.OUT = sys.argv[1] + "nfl"
N.build(datetime(2026, 10, 22, tzinfo=timezone.utc), sys.argv[1] + "cache")
`, STATS], {cwd: ROOT});

const now = Date.now(), iso = ms => new Date(ms).toISOString().replace(/\.\d+Z$/, "Z");
const kick = now + 20 * 3600e3;
const ymd = ms => { const d = new Date(ms); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const NFL = {sport: "NFL", generated_at: iso(now), docs: [{collection: "slate", doc_id: "G1", data: {
  game_id: "2026_08_SF_SEA", sport: "NFL", season: 2026, away_team: "SF", home_team: "SEA", kickoff_time: iso(kick), game_date: ymd(kick),
  market: {book: "Kalshi", moneyline_away: -150, moneyline_home: 130},
  model: {available: true, status: "locked", winner_side: "SF", winner_prob: 0.62, note: "test"}}}]};
const row = (player, stat, line, bid, ask) => ({player, stat, line, model_p: null, expected: null, n_games: 0, k: {bid, ask, oi: 100}});
const PROPS = {sport: "NFL", generated_at: iso(now), docs: [{collection: "props_model", doc_id: "p1", data: {
  game_key: "x_SF_SEA", away_team: "SF", home_team: "SEA", kickoff_time: iso(kick), sport: "NFL", locked: false, paper_picks: [], scored_utc: iso(now),
  rows: [row("Brock Purdy", "passing_yards", 224.5, 0.7, 0.72), row("Brock Purdy", "passing_yards", 244.5, 0.49, 0.51),
         row("Brock Purdy", "passing_yards", 264.5, 0.3, 0.32), row("Christian McCaffrey", "rushing_yards", 74.5, 0.55, 0.57),
         row("George Kittle", "receiving_yards", 54.5, 0.5, 0.52), row("George Kittle", "receptions", 4.5, 0.45, 0.47),
         row("Sam Darnold", "passing_yards", 209.5, 0.5, 0.52)]}}]};
let sfOverride = null;                   // what the "bot" rewrote team_SF.json to (the refresh test)
const MIME = {".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png"};
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname.startsWith("/api/")) { res.writeHead(404); return res.end("{}"); }
  const f = path.join(DOCS, u.pathname === "/" ? "index.html" : u.pathname);
  if (!f.startsWith(DOCS) || !existsSync(f)) { res.writeHead(404); return res.end(""); }
  res.writeHead(200, {"content-type": MIME[path.extname(f)] || "application/octet-stream"});
  res.end(readFileSync(f));
});

test("team page from a logo: ranks, offense and defense, lines with recent hits", async (t) => {
  await new Promise(ok => server.listen(0, ok));
  const base = `http://localhost:${server.address().port}`;
  const browser = await chromium.launch({executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
  try {
    const ctx = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, isMobile: true, hasTouch: true});
    await ctx.route(/fonts\.(googleapis|gstatic)\.com|espncdn/, r => r.abort());
    await ctx.route(/raw\.githubusercontent\.com/, r => {
      const p = new URL(r.request().url()).pathname;
      if (p.endsWith("/nfl/lineboard_export.json")) return r.fulfill({json: NFL});
      if (p.endsWith("/nfl/props_model_export.json")) return r.fulfill({json: PROPS});
      const m = /\/stats\/(nfl\/[\w.]+\.json)$/.exec(p);
      if (m && m[1] === "nfl/team_SF.json" && sfOverride) return r.fulfill({json: sfOverride});
      if (m && existsSync(STATS + m[1])) return r.fulfill({json: JSON.parse(readFileSync(STATS + m[1], "utf8"))});
      return r.fulfill({status: 404, body: ""});
    });
    await ctx.addInitScript(() => { try { localStorage.setItem("devig.installTip.v1", "1"); } catch (e) {} });
    const pg = await ctx.newPage();
    const errors = [];
    pg.on("pageerror", e => errors.push(String(e)));
    await pg.goto(base + "/");
    await pg.locator("#splash").waitFor({state: "detached", timeout: 15000});
    const rs = pg.locator("#rsCard");

    await t.test("the SF logo on the game card opens the 49ers' page, not the game", async () => {
      await pg.locator('#sportPills [data-sport="NFL"]').click();
      await pg.locator('#dayTabs button', {hasText: "Tomorrow"}).click().catch(() => {});
      const logo = pg.locator('#homeSlate .tm-link[data-rs*="\\"code\\":\\"SF\\""]').first();
      await logo.waitFor({timeout: 15000});
      await logo.click();
      await rs.locator(".rs-head h3", {hasText: "San Francisco 49ers"}).waitFor({timeout: 10000});
      assert.ok(await pg.locator("#panel-game").isHidden());
    });

    await t.test("team stats carry league ranks", async () => {
      assert.match(await rs.locator(".rs-best").innerText(), /^Best: 1st in /);
      const ppg = rs.locator(".rs-stats tr", {hasText: "Points per game"});
      assert.match(await ppg.innerText(), /31\.0\s+1st/);
      assert.equal(await ppg.locator(".rs-rank.good").count(), 1);
      assert.match(await rs.locator(".rs-stats tr", {hasText: /^Allowed per game/}).innerText(), /13\.7\s+1st/, "fewest allowed is 1st");
    });

    await t.test("Offense: players by position, each with his main line and how often he went over it", async () => {
      assert.match(await rs.locator("#rsUnits .pill-tab.active").innerText(), /Offense/);
      assert.deepEqual(await rs.locator(".rs-grp").allInnerTexts(), ["QUARTERBACKS", "RUNNING BACKS", "TIGHT ENDS"]);
      assert.match(await rs.innerText(), /Lines: @ SEA,/);
      assert.equal(await rs.locator(".rs-note", {hasText: "Passing yards"}).innerText(), "Passing yards 244.5 · over in 2 of last 3 · avg 234.3",
        "the rung priced nearest 50/50");
      assert.match(await rs.locator(".rs-note.good").innerText(), /Rushing yards 74\.5 · over in 3 of last 3/);
      assert.deepEqual(await rs.locator(".rs-note", {hasText: /Receiving yards 54\.5|Receptions 4\.5/}).allInnerTexts(),
        ["Receiving yards 54.5 · over in 2 of last 3 · avg 58.3", "Receptions 4.5 · over in 2 of last 3 · avg 4.7"], "yards first, at most two");
      await pg.screenshot({path: OUT + "team-offense.png", fullPage: true});
    });

    await t.test("Defense: line, linebackers, secondary", async () => {
      await rs.locator('[data-rs-unit="Defense"]').click();
      assert.deepEqual(await rs.locator(".rs-grp").allInnerTexts(), ["DEFENSIVE LINE", "LINEBACKERS", "SECONDARY"]);
      assert.match(await rs.locator("tr", {hasText: "Fred Warner"}).first().innerText(), /Fred Warner\s+MLB\s+3\s+9\.0/);
      assert.match(await rs.locator("tr", {hasText: "Nick Bosa"}).first().innerText(), /Nick Bosa\s+DE\s+3\s+3\.0\s+1\.33/);
      assert.match(await rs.innerText(), /TKL: solo tackles plus assists/);
      await pg.screenshot({path: OUT + "team-defense.png", fullPage: true});
    });

    await t.test("a defender's own page shows defensive stats and lines", async () => {
      await rs.locator("tr", {hasText: "Fred Warner"}).first().click();
      await rs.locator(".rs-head h3", {hasText: "Fred Warner"}).waitFor();
      assert.match(await rs.locator("table").first().innerText(), /TKL[\s\S]*SACK[\s\S]*9\.0/);
      assert.equal(await pg.locator("#rsStat").inputValue(), "tackles");
      await pg.locator("#rsBack").click();
    });

    await t.test("a line opens the player with that stat and line", async () => {
      await rs.locator('[data-rs-unit="Offense"]').click();
      await rs.locator(".rs-note", {hasText: "Passing yards"}).click();
      await rs.locator(".rs-head h3", {hasText: "Brock Purdy"}).waitFor();
      assert.equal(await pg.locator("#rsStat").inputValue(), "passing_yards");
      assert.equal(await pg.locator("#rsLine").inputValue(), "244.5");
    });
    await t.test("the game page's Matchup tab and the prop rows' recent-form chips", async () => {
      await pg.locator('nav.tabs button[data-tab="home"]').click();
      await pg.locator('#sportPills [data-sport="NFL"]').click();
      await pg.locator('#homeSlate .card.game', {hasText: "SEA"}).first().locator(".game-head").click();
      const page = pg.locator("#panel-game");
      await page.locator('.sb-tabs button[data-k="matchup"]').click();
      await page.locator(".mu-tbl").waitFor({timeout: 10000});
      const ppg = page.locator(".mu-r", {hasText: /^.*Points per game/});
      assert.match(await ppg.first().innerText(), /31\.0\s*1st\s+Points per game\s+20\.7\s*2nd/);
      assert.equal(await ppg.first().locator(".mu-v.better").count(), 1, "SF's is the better one");
      assert.deepEqual(await page.locator(".mu-teams .pill-tab").allInnerTexts(), ["SF\nSan Francisco 49ers", "SEA\nSeattle Seahawks"], "one switch per team");
      assert.match(await page.locator(".mu-list:not([hidden])").innerText(), /Brock Purdy[\s\S]*Passing yards 244\.5 · over in 2 of last 3/);
      assert.doesNotMatch(await page.locator(".mu-list:not([hidden])").innerText(), /Darnold/, "one team at a time");
      await page.locator('[data-mu-team="SEA"]').click();
      assert.match(await page.locator(".mu-list:not([hidden])").innerText(), /^Sam Darnold[\s\S]*Passing yards 209\.5 · over in 3 of last 3/);
      await pg.screenshot({path: OUT + "matchup-switch.png", fullPage: true});
      await page.locator('.sb-tabs button[data-k="game"]').click();
      await page.locator('.sb-tabs button[data-k="matchup"]').click();
      await page.locator(".mu-list:not([hidden])").waitFor({timeout: 10000});
      assert.match(await page.locator(".mu-list:not([hidden])").innerText(), /^Sam Darnold/, "remembers the team");
      await page.locator(".sb-tabs button", {hasText: "Passing"}).click();
      await page.locator(".rs-form").first().waitFor({timeout: 10000});
      assert.match(await page.locator(".pp-row", {hasText: "Brock Purdy"}).first().locator(".rs-form").innerText(), /^L3 2\/3$/);
      await page.locator(".back-more").click();
    });
    await t.test("a stats file read over 10 minutes ago is read again", async () => {
      sfOverride = Object.assign(JSON.parse(readFileSync(STATS + "nfl/team_SF.json", "utf8")), {rank: 9});
      const open = () => pg.evaluate(() => window.devigOpenResearch({page: "team", sport: "NFL", code: "SF"}));
      await open();
      await rs.locator(".rs-head h3", {hasText: "San Francisco 49ers"}).waitFor();
      assert.match(await rs.locator(".rs-head .faint").innerText(), /^#1 /, "a minute later: the copy already read");
      await pg.evaluate(() => { const real = Date.now; Date.now = () => real() + 11 * 60e3; });
      await open();
      await pg.waitForFunction(() => /^#9 /.test((document.querySelector("#rsCard .rs-head .faint") || {}).textContent || ""), null, {timeout: 10000});
    });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});
