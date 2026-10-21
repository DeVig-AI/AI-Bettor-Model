// Phone check: More -> Research (power rankings -> team -> player, the hit-rate tool), and the links into it from a game
// card and a prop row. Uses the NBA files tools/stats_nba.py wrote (stats/nba/), served as the repo would serve them.
//   node --test tests/app/research.test.mjs
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
mkdirSync(OUT, {recursive: true});

const nyk = JSON.parse(readFileSync(ROOT + "stats/nba/team_NYK.json", "utf8"));
// NHL: built here from the real skater files, with each game's score taken from its skaters' goals (the bot reads
// real scores from the NHL API, which this test can't reach). Written under tests/app/out/, never committed.
const NHL_OUT = OUT + "stats/nhl/";
execFileSync("python3", ["-c", `
import sys, pandas as pd
sys.path.insert(0, "tools")
import stats_nhl as H
from datetime import datetime, timezone
H.OUT = sys.argv[1]
def fake(start):
    d = H.skaters(start)
    out = {}
    for gid, x in d.groupby("game_id"):
        h, a = x[x.home == 1], x[x.home == 0]
        if not len(h) or not len(a): continue
        hs, as_ = int(h.g.sum()), int(a.g.sum())
        out[int(gid)] = {"date": str(x.game_date.iloc[0]), "type": int(x.game_type.iloc[0]), "home": h.team.iloc[0],
                         "away": a.team.iloc[0], "hs": hs + (hs == as_), "as": as_, "last": "SO" if hs == as_ else "REG"}
    return out
H.build(datetime.now(timezone.utc), fetch_results=fake)
`, NHL_OUT], {cwd: ROOT});
const star = nyk.players[0];                                          // most minutes: has a game log
const now = Date.now(), iso = ms => new Date(ms).toISOString().replace(/\.\d+Z$/, "Z");
const kick = now + 3 * 3600e3;
const LINES = {generated_at: iso(now), errors: [], games: [
  {sport: "NBA", date: iso(kick).slice(0, 10), event: "KXNBAGAME-T1", home_ticker: "KXNBAGAME-T1-NYK", away: "PHI", home: "NYK",
   spreads: {}, kickoff: iso(kick), espn_id: "1", home_wp: 0.55, ml: {home: -125, away: 105}}]};
const PROPS = {generated_at: iso(now), docs: [{collection: "props_model", doc_id: "p1", data: {
  game_key: "x_PHI_NYK", away_team: "PHI", home_team: "NYK", kickoff_time: iso(kick), sport: "NBA", model: "NBA_PROPS_MODEL_V1",
  locked: false, paper_picks: [], scored_utc: iso(now),
  rows: [{player: star.name, stat: "points", line: 24.5, model_p: 0.52, expected: 25, n_games: 300,
          k: {bid: 0.48, ask: 0.5, oi: 900, t: "KXNBAPTS-T1"}, k_mid: 0.49, stale: false, injury: null}]}}]};
const MIME = {".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png"};
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname.startsWith("/api/")) { res.writeHead(404); return res.end("{}"); }
  const f = path.join(DOCS, u.pathname === "/" ? "index.html" : u.pathname);
  if (!f.startsWith(DOCS) || !existsSync(f)) { res.writeHead(404); return res.end(""); }
  res.writeHead(200, {"content-type": MIME[path.extname(f)] || "application/octet-stream"});
  res.end(readFileSync(f));
});

test("Research section on a phone", async (t) => {
  await new Promise(ok => server.listen(0, ok));
  const base = `http://localhost:${server.address().port}`;
  const browser = await chromium.launch({executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
  try {
    const ctx = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, isMobile: true, hasTouch: true});
    await ctx.route(/fonts\.(googleapis|gstatic)\.com|espncdn/, r => r.abort());
    await ctx.route(/raw\.githubusercontent\.com/, r => {
      const p = new URL(r.request().url()).pathname;
      const n = p.match(/\/main\/stats\/nhl\/(.+\.json)$/);
      if (n) return existsSync(NHL_OUT + n[1]) ? r.fulfill({path: NHL_OUT + n[1], contentType: "application/json"}) : r.fulfill({status: 404, body: ""});
      const m = p.match(/\/main\/(stats\/.+\.json)$/);
      if (m && existsSync(ROOT + m[1])) return r.fulfill({path: ROOT + m[1], contentType: "application/json"});
      if (p.endsWith("/live/game_lines.json")) return r.fulfill({json: LINES});
      if (p.endsWith("/nba/props_model_export.json")) return r.fulfill({json: PROPS});
      return r.fulfill({status: 404, body: ""});
    });
    await ctx.addInitScript(() => { try { localStorage.setItem("devig.installTip.v1", "1"); } catch (e) {} });
    const pg = await ctx.newPage();
    const errors = [];
    pg.on("pageerror", e => errors.push(String(e)));
    await pg.goto(base + "/");
    await pg.locator("#splash").waitFor({state: "detached", timeout: 15000});

    await t.test("More -> Research: power rankings for all 30 teams", async () => {
      await pg.locator('nav.tabs button[data-tab="more"]').click();
      await pg.locator('#panel-more [data-go="research"]').click();
      await pg.locator("#rsCard .rs-table tr[data-rs]").first().waitFor();
      assert.equal(await pg.locator("#rsCard .rs-table tr[data-rs]").count(), 30);
      const first = await pg.locator("#rsCard .rs-table tr[data-rs]").first().innerText();
      assert.match(first, /^1\s/);
      assert.match(await pg.locator("#rsCard").innerText(), /Rating: Points per game better than an average team/);
      await pg.screenshot({path: OUT + "research-rankings.png", fullPage: true});
      const w = await pg.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(w <= 390, `page is ${w}px wide`);
    });
    await t.test("team page: season stats, recent games, roster", async () => {
      await pg.locator("#rsCard .rs-table tr[data-rs]").first().click();
      await pg.locator("#rsCard .rs-head").waitFor();
      const txt = await pg.locator("#rsCard").innerText();
      assert.match(txt, /#1 in DeVig's power rankings/);
      assert.match(txt, /Points per 100 possessions[\s\S]*Roster/i);
      await pg.screenshot({path: OUT + "research-team.png", fullPage: true});
      await pg.locator("#rsBack").click();                              // back to the rankings
      await pg.locator("#rsCard .rs-table tr[data-rs]").first().waitFor();
    });
    await t.test("players: search, then a player's page and the hit-rate tool", async () => {
      await pg.locator('[data-rs-tab="players"]').click();
      await pg.locator("#rsSearch").fill(star.name.split(" ").pop());
      await pg.locator("#rsPlayers tr[data-rs]", {hasText: star.name}).first().click();
      await pg.locator("#rsHits .rs-hit").waitFor();
      assert.match(await pg.locator("#rsCard h3").innerText(), new RegExp(star.name));
      await pg.locator("#rsLine").fill("199.5");
      assert.match(await pg.locator("#rsHits").innerText(), /Last 10 games\s*0 of \d+/);
      await pg.locator("#rsLine").fill("-0.5");
      const n = Math.min(10, star.log.length);
      assert.match(await pg.locator("#rsHits").innerText(), new RegExp(`Last 10 games\\s*${n} of ${n}`));
      assert.match(await pg.locator("#rsHits").innerText(), /Counts, not chances/);
      assert.ok(await pg.locator("#rsLog tr").count() > 2);
      await pg.screenshot({path: OUT + "research-player.png", fullPage: true});
    });
    await t.test("a game card links to both teams", async () => {
      await pg.locator('nav.tabs button[data-tab="home"]').click();
      await pg.locator('#sportPills [data-sport="NBA"]').click();
      const card = pg.locator("#homeSlate .card.game", {hasText: "NYK"}).first();
      await card.locator(".game-head").click();
      await card.locator('.rs-links .rs-link', {hasText: "NYK"}).click();
      await pg.locator("#rsCard .rs-head").waitFor();
      assert.match(await pg.locator("#rsCard h3").innerText(), /New York Knicks/);
    });
    await t.test("a prop row's Stats opens the player with that stat and line", async () => {
      await pg.locator('nav.tabs button[data-tab="home"]').click();
      const card = pg.locator("#homeSlate .card.game", {hasText: "NYK"}).first();
      if (await card.locator(".game-details").isHidden()) await card.locator(".game-head").click();
      await card.locator('.sb-tabs button[data-k="points"]').click();
      await card.locator(".pp-row .rs-link").first().click();
      await pg.locator("#rsHits .rs-hit").waitFor();
      assert.match(await pg.locator("#rsCard h3").innerText(), new RegExp(star.name));
      assert.equal(await pg.locator("#rsStat").inputValue(), "points");
      assert.equal(await pg.locator("#rsLine").inputValue(), "24.5");
    });
    for (const [sp, teams, last, statLabel] of [["NFL", 32, "Last 5", "Passing yards"], ["NHL", 32, "Last 10", "Goals"]]) {
      await t.test(`${sp}: rankings, a team, a player and its own stats`, async () => {
        await pg.locator('nav.tabs button[data-tab="more"]').click();
        await pg.locator('#panel-more [data-go="research"]').click();
        await pg.locator(`[data-rs-sport="${sp}"]`).click();
        await pg.locator('[data-rs-tab="rank"]').click();
        await pg.waitForFunction(n => document.querySelectorAll("#rsCard .rs-table tr[data-rs]").length === n, teams);
        assert.match(await pg.locator("#rsCard .rs-table tr").first().innerText(), new RegExp(last, "i"));
        await pg.locator("#rsCard .rs-table tr[data-rs]").first().click();
        await pg.locator("#rsCard .rs-head").waitFor();
        await pg.locator("#rsCard .rs-table tr[data-rs]").first().click();       // the roster's first player
        await pg.locator("#rsHits .rs-hit").waitFor();
        assert.ok((await pg.locator("#rsStat option").allInnerTexts()).includes(statLabel));
        await pg.locator("#rsLine").fill("999.5");
        assert.match(await pg.locator("#rsHits").innerText(), /Last 5 games\s*0 of \d+/);
        await pg.screenshot({path: OUT + `research-${sp.toLowerCase()}-player.png`, fullPage: true});
      });
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});
