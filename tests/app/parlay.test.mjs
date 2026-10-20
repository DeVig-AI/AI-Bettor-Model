// Phone check of the bet slip and tracked parlays (docs/index.html) in Chromium at 390px, with mocked repo files and
// /api/live: node --test tests/app/parlay.test.mjs   (screenshots: tests/app/out/, not committed)
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
const kUp = noon.getTime() + 2 * 86400e3, kDone = now - 4 * 3600e3;          // both upcoming games on the same day
const game = (id, away, home, kick, market) => ({collection: "slate", doc_id: id, data: {game_id: id, sport: "NFL", season: 2026,
  away_team: away, home_team: home, kickoff_time: iso(kick), market: Object.assign({book: "Kalshi"}, market),
  model: {available: false}, synced_at: iso(now - 600e3)}});
const SLATE = {docs: [
  game("G1", "HOU", "JAX", kUp, {moneyline_away: 125, moneyline_home: -145, spread_home: -2.5, spread_home_odds: -110, spread_away_odds: -108,
    total_line: 44.5, over_odds: -110, under_odds: -108}),
  game("G2", "BUF", "KC", kUp + 3600e3, {moneyline_away: -120, moneyline_home: 102, spread_home: 1.5, spread_home_odds: -105, spread_away_odds: -112,
    total_line: 48.5, over_odds: -105, under_odds: -112}),
  game("G3", "DAL", "PHI", kDone, {moneyline_away: 150, moneyline_home: -175, spread_home: -3.5, spread_home_odds: -110, spread_away_odds: -110,
    total_line: 47.5, over_odds: -110, under_odds: -110}),
]};
// a parlay tracked earlier on G3 (now final: PHI 27 DAL 20): PHI ML won, PHI -3.5 won, over 47.5 lost
const meta = {sport: "NFL", away: "DAL", home: "PHI", kickoff: iso(kDone), gkey: "G3", game: "DAL @ PHI (NFL)"};
const TRACKED = {g: {}, p: {}, updated: now, parlays: {old1: {at: iso(now - 86400e3), stake: 10, odds: 300, legs: [
  Object.assign({desc: "PHI ML", odds: -175, mk: "ml", side: "home"}, meta),
  Object.assign({desc: "PHI -3.5", odds: -110, mk: "spread", side: "home", point: -3.5}, meta)]},
  old2: {at: iso(now - 86400e3), stake: 5, odds: 260, legs: [
  Object.assign({desc: "PHI ML", odds: -175, mk: "ml", side: "home"}, meta),
  Object.assign({desc: "Over 47.5", odds: -110, mk: "total", side: "over", point: 47.5}, meta)]}}};

const MIME = {".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png"};
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const j = b => { res.writeHead(200, {"content-type": "application/json"}); res.end(JSON.stringify(b)); };
  if (u.pathname === "/api/live") return j(u.searchParams.get("sport") === "nfl"
    ? {sport: "nfl", games: [{id: "9", away: "DAL", home: "PHI", kickoff: iso(kDone), away_score: 20, home_score: 27, state: "post", detail: "Final"}]}
    : {games: []});
  if (u.pathname.startsWith("/api/")) { res.writeHead(404); return res.end("{}"); }
  const f = path.join(DOCS, u.pathname === "/" ? "index.html" : u.pathname);
  if (!f.startsWith(DOCS) || !existsSync(f)) { res.writeHead(404); return res.end(""); }
  res.writeHead(200, {"content-type": MIME[path.extname(f)] || "application/octet-stream"});
  res.end(readFileSync(f));
});

test("bet slip and tracked parlays on a phone", async (t) => {
  await new Promise(ok => server.listen(0, ok));
  const base = `http://localhost:${server.address().port}`;
  const browser = await chromium.launch({executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
  try {
    const ctx = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, isMobile: true, hasTouch: true});
    await ctx.route(/fonts\.(googleapis|gstatic)\.com|espncdn/, r => r.abort());
    await ctx.route(/raw\.githubusercontent\.com/, r => {
      const p = new URL(r.request().url()).pathname;
      return p.endsWith("/nfl/lineboard_export.json") ? r.fulfill({json: SLATE}) : r.fulfill({status: 404, body: ""});
    });
    await ctx.addInitScript(t => {
      try {
        if (!localStorage.getItem("devig.tracked.v1")) localStorage.setItem("devig.tracked.v1", JSON.stringify(t));
        localStorage.setItem("devig.installTip.v1", "1");
        localStorage.setItem("devig.prefs.v1", JSON.stringify({mode: "advanced", teams: {}, name: ""}));   // spread + total columns
      } catch (e) {}
    }, TRACKED);
    const pg = await ctx.newPage();
    const errors = [];
    pg.on("pageerror", e => errors.push(String(e)));
    await pg.goto(base + "/");
    await pg.locator("#splash").waitFor({state: "detached", timeout: 15000});

    await t.test("tap odds on the board: the slip button counts the picks", async () => {
      await pg.locator(".sb-btn[data-legg]").first().waitFor();
      assert.equal(await pg.locator(".slip-bar").isVisible(), false);
      const jaxMl = pg.locator('.sb-btn[data-legg*="\\"desc\\":\\"JAX ML\\""]');
      await jaxMl.click();
      await pg.locator('.sb-btn[data-legg*="\\"desc\\":\\"Over 48.5\\""]').click();
      assert.match(await pg.locator(".slip-bar").innerText(), /Added Over 48\.5[\s\S]*\$10 pays\s*\$\d+\.\d\d/i);
      assert.ok(await jaxMl.evaluate(e => e.classList.contains("in-slip")));
      await jaxMl.click();                                                  // second tap takes it out
      assert.match(await pg.locator(".slip-bar").innerText(), /Removed JAX ML/i);
      await jaxMl.click();
      assert.match(await pg.locator(".slip-bar").innerText(), /Added JAX ML/i);
      await pg.waitForFunction(() => /2-pick parlay\s*\+\d+/i.test(document.querySelector(".slip-bar").innerText), null, {timeout: 4000});
      // the picks show right on the drawer, each with its price and an x
      assert.equal(await pg.locator(".slip-bar .chip").count(), 2);
      assert.match(await pg.locator(".slip-bar .chips").innerText(), /Over 48\.5\s*-105[\s\S]*JAX ML\s*-145/);
      await pg.screenshot({path: OUT + "slip-drawer.png"});
      // pull the drawer up: every pick with its game time, and the odds / % switch
      await pg.locator(".slip-bar .grab").click();
      await pg.locator(".slip-bar .pk").first().waitFor();
      assert.match(await pg.locator(".slip-bar .picks").innerText(), /NFL[\s\S]*Over 48\.5 \(BUF @ KC\)[\s\S]*JAX to win \(vs HOU\)/i);
      await pg.screenshot({path: OUT + "slip-drawer-open.png"});
      // the drawer stays when you switch tabs
      await pg.locator('nav.tabs button[data-tab="parlay"]').click();
      assert.ok(await pg.locator(".slip-bar").isVisible());
      assert.match(await pg.locator(".slip-bar").innerText(), /2-pick parlay/i);
      await pg.locator('nav.tabs button[data-tab="home"]').click();
      await pg.locator(".slip-bar .grab").click();
      const box = await pg.locator(".slip-bar").boundingBox();
      assert.ok(box.height >= 44 && box.x >= 0 && box.x + box.width <= 390);
      await pg.screenshot({path: OUT + "slip-bar.png"});
    });
    await t.test("review the slip; switch odds to %", async () => {
      await pg.locator(".slip-bar .go").click();
      await pg.locator(".slip-sheet .slip-leg").first().waitFor();
      assert.equal(await pg.locator(".slip-sheet .slip-leg").count(), 2);
      assert.match(await pg.locator(".slip-sheet").innerText(), /JAX ML[\s\S]*−145|JAX ML[\s\S]*-145/);
      await pg.screenshot({path: OUT + "slip-odds.png"});
      await pg.getByRole("button", {name: "%", exact: true}).click();
      const txt = await pg.locator(".slip-sheet").innerText();
      assert.match(txt, /JAX ML[\s\S]*59%/, "−145 implies 59%");
      assert.match(txt, /chance/);
      assert.match(await pg.locator(".slip-bar").innerText(), /%/);
      await pg.screenshot({path: OUT + "slip-pct.png"});
      await pg.locator("#slipStake").fill("20");
      assert.match(await pg.locator("#slipPays").innerText(), /^\$\d+\.\d\d$/);
      const w = await pg.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(w <= 390, `page is ${w}px wide`);
    });
    await t.test("track it: it moves to Parlay → Tracked parlays", async () => {
      await pg.getByRole("button", {name: "Track parlay"}).click();
      assert.equal(await pg.locator(".slip-sheet").isVisible(), false);
      assert.equal(await pg.locator(".slip-bar").isVisible(), false, "slip cleared");
      await pg.locator('nav.tabs button[data-tab="parlay"]').click();
      await pg.locator("#trackedParlays .tp-card").first().waitFor();
      assert.equal(await pg.locator("#trackedParlays .tp-card").count(), 3);
      const mine = pg.locator("#trackedParlays .tp-card").first();
      assert.match(await mine.innerText(), /2-pick parlay[\s\S]*\$20\.00 pays[\s\S]*Pending[\s\S]*Over 48\.5[\s\S]*JAX ML/);
      assert.equal(await pg.locator("text=Build a parlay").count(), 0, "the old builder is gone");
      const saved = await pg.evaluate(() => JSON.parse(localStorage.getItem("devig.tracked.v1")).parlays);
      assert.equal(Object.keys(saved).length, 3);
    });
    await t.test("finished games grade the legs", async () => {
      await pg.waitForFunction(() => /Won/.test(document.getElementById("trackedParlays").innerText) &&
                                     /Lost/.test(document.getElementById("trackedParlays").innerText), null, {timeout: 20000});
      const cards = await pg.locator("#trackedParlays .tp-card").allInnerTexts();
      const won = cards.find(c => /PHI -3\.5/.test(c)), lost = cards.find(c => /Over 47\.5/.test(c));
      assert.match(won, /Won/); assert.match(won, /2 of 2 won/);
      assert.match(lost, /Lost/); assert.match(lost, /\$5\.00 lost/);
      await pg.screenshot({path: OUT + "tracked-parlays.png", fullPage: true});
    });
    await t.test("stop tracking one", async () => {
      pg.once("dialog", d => d.accept());
      await pg.locator("#trackedParlays [data-tp-rm]").first().click();
      assert.equal(await pg.locator("#trackedParlays .tp-card").count(), 2);
    });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});
