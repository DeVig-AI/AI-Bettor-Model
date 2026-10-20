// Phone check of /lab in Chromium at 390px with mocked GitHub / raw answers: node --test tests/lab/ui.test.mjs
// Screenshots go to tests/lab/out/ (not committed).
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as api from "../../functions/api/lab.js";
import * as page from "../../functions/lab.js";
import { mockFetch } from "./fixtures.mjs";

const require = createRequire(import.meta.url);
let chromium;
try { ({chromium} = require("playwright")); } catch (e) { ({chromium} = require("/opt/node22/lib/node_modules/playwright")); }
const OUT = new URL("./out/", import.meta.url).pathname;
mkdirSync(OUT, {recursive: true});

let scenario = "mixed", down = false;
const owner = {accessUser: async () => "owner@example.com"};
const env = {OWNER_EMAIL: "owner@example.com"};
const server = http.createServer(async (req, res) => {
  const url = "http://localhost" + req.url;
  let r;
  if (req.url.startsWith("/api/lab")) {
    if (down) { req.socket.destroy(); return; }
    if (scenario === "signedout") r = await api.handle(new Request(url), env, {accessUser: async () => null});
    else { api._clearCache(); r = await api.handle(new Request(url), env, {...owner, fetch: mockFetch(scenario)}); }
  } else if (req.url.startsWith("/lab")) r = await page.handle(new Request(url), env, owner);
  else if (req.url.startsWith("/login")) r = new Response(readFileSync(new URL("../../docs/login/index.html", import.meta.url)), {headers: {"content-type": "text/html"}});
  else r = new Response("not found", {status: 404});
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
});

test("lab page on a phone", async (t) => {
  await new Promise(ok => server.listen(0, ok));
  const base = `http://localhost:${server.address().port}`;
  const browser = await chromium.launch({executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
  const ctx = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, isMobile: true, hasTouch: true});
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const pg = await ctx.newPage();
  const errors = [];
  pg.on("pageerror", e => errors.push(String(e)));
  pg.on("dialog", d => { errors.push("dialog: " + d.message()); d.dismiss(); });
  try {
    await t.test("empty state", async () => {
      scenario = "empty";
      await pg.goto(base + "/lab");
      await pg.getByText("Lab hasn’t run yet").waitFor();
      // the address shown (and saved by Add to Home Screen / bookmarks) is the sign-in route, and it comes back here
      assert.equal(new URL(pg.url()).pathname + new URL(pg.url()).search, "/login?next=/lab");
      await pg.reload();
      await pg.getByText("Lab hasn’t run yet").waitFor();
      assert.equal(await pg.locator('link[rel="apple-touch-icon"]').getAttribute("href"), "/icons/icon-180.png");
      assert.equal(await pg.locator(".alert").count(), 0);
      assert.ok(await pg.locator(".wf").count() >= 4);
      await pg.screenshot({path: OUT + "empty.png", fullPage: true});
    });
    await t.test("mixed results + failed workflow", async () => {
      scenario = "mixed";
      await pg.getByRole("button", {name: "Refresh"}).click();
      await pg.locator(".alert").waitFor();
      assert.match(await pg.locator(".alert").innerText(), /Game lines -- every Kalshi spread failed[\s\S]*1 of 5 workflows red/);
      assert.equal(await pg.locator(".alert").getAttribute("href"), "#activity");
      // the ✕ closes the banner; it stays closed after a refresh, and comes back for a failure in a run not seen before
      await pg.locator("#alertx").click();
      assert.equal(await pg.locator(".alert").count(), 0);
      await pg.getByRole("button", {name: "Refresh"}).click();
      await pg.waitForTimeout(300);
      assert.equal(await pg.locator(".alert").count(), 0, "still closed after a refresh");
      await pg.evaluate(() => localStorage.setItem("devig-lab-dismissed", JSON.stringify(["2:1"])));   // an older run
      await pg.getByRole("button", {name: "Refresh"}).click();
      await pg.locator(".alert").waitFor();
      await pg.evaluate(() => localStorage.removeItem("devig-lab-dismissed"));
      assert.deepEqual(await pg.locator(".nums b").allInnerTexts(), ["9", "1", "0"]);
      assert.match(await pg.locator(".exam").innerText(), /Sealed 2025 exam\s*3 of 3 left/);
      assert.equal(await pg.locator(".cand").count(), 4, "four shown before 'Show more'");
      assert.match(await pg.locator("#morecands").innerText(), /Show 2 more · 1 failed, 1 queued/);
      const first = pg.locator(".cand").first();
      assert.match(await first.innerText(), /\+ QB adjustment[\s\S]*★ Lab pass[\s\S]*\+1\.4 pts \[\+0\.4, \+2\.4\]/);
      assert.equal(await first.locator(".pips").getAttribute("aria-label"), "Gates: passed, passed, passed");
      const running = pg.locator(".cand").nth(1);
      assert.match(await running.innerText(), /Running · gate 2[\s\S]*Started 3 min ago on GitHub · about \d+ min left/);
      assert.equal(await running.locator(".pips").getAttribute("aria-label"), "Gates: passed, running, waiting");
      assert.match(await pg.locator(".cand").nth(2).innerText(), /✕ Failed · faded/);
      assert.ok((await pg.locator(".cand").nth(2).innerText()).includes("<img src=x"), "names shown as text");
      assert.equal(await pg.locator(".lesson").count(), 3);
      // tabs: Candidates first; Lessons shows when each lesson was learned, newest first
      assert.deepEqual(await pg.locator(".tabs [data-tab]").evaluateAll(b => b.map(x => x.getAttribute("data-tab"))), ["cands", "lessons", "runs", "github"]);
      assert.equal(await pg.locator("#pane-lessons").isVisible(), false);
      await pg.locator('.tabs [data-tab="lessons"]').click();
      assert.equal(await pg.locator("#pane-lessons").isVisible(), true);
      assert.match(await pg.locator(".lesson").first().innerText(), /Starting-QB[\s\S]*30 min ago/);
      assert.match(await pg.locator(".lesson").nth(1).innerText(), /Rest days[\s\S]*1 d ago|Rest days[\s\S]*26 h ago/);
      assert.match(await pg.locator(".lesson").nth(2).innerText(), /time not recorded/);
      assert.match(await pg.locator("#pane-lessons").innerText(), /Newest [\s\S]*30 min ago/);
      await pg.locator('[data-lf="faded"]').click();
      assert.equal(await pg.locator(".lesson").count(), 1);
      await pg.screenshot({path: OUT + "lessons.png", fullPage: true});
      await pg.locator('[data-lf="all"]').click();
      await pg.locator('.tabs [data-tab="runs"]').click();
      assert.match(await pg.locator("#h-l").locator("..").innerText(), /Exploratory · not proof/);
      assert.match(await pg.locator(".promo").innerText(), /Promoted, not proven[\s\S]*23–18/i);
      assert.match(await pg.locator("#activity .sechead").innerText(), /1 ok · 1 failed/);
      assert.equal(await pg.locator(".wf.bad").count(), 1);
      assert.match(await pg.locator("footer").innerText(), /Only you can see this page/);
      const runs = pg.locator(".runs");
      assert.match(await runs.innerText(), /LAST RUN[\s\S]*40 min ago · took 11s[\s\S]*Research Lab #12 on GitHub/i);
      assert.equal(await runs.locator(".step").count(), 0, "history shows counts only, no per-model rows");
      assert.deepEqual((await runs.locator(".funnel b").allInnerTexts()).slice(0, 6), ["18", "9", "4", "1", "0", "0"]);
      assert.match(await runs.locator(".funnel").innerText(), /tested[\s\S]*past gate 1[\s\S]*passed the lab[\s\S]*promoted/);
      assert.ok((await runs.locator(".funnel").innerText()).includes("<b>x</b>"), "labels shown as text");
      assert.match(await pg.locator(".older").innerText(), /Sealed exam 1 · 3 d ago · being scored/);
      assert.equal(await pg.locator(".older a").count(), 0, "non-GitHub run link not linked");
      await pg.screenshot({path: OUT + "runs.png", fullPage: true});
      await pg.locator('.tabs [data-tab="github"]').click();
      const wfBox = await pg.locator(".wf").first().boundingBox();
      assert.ok(wfBox.height >= 44, `.wf is ${wfBox.height}px tall`);
      await pg.locator('.tabs [data-tab="cands"]').click();
      await pg.screenshot({path: OUT + "mixed.png", fullPage: true});
      for (const sel of ["#refresh", ".cand", "footer a", "#morecands", ".alert", ".tabs [data-tab]", "[data-cf]"]) {
        const box = await pg.locator(sel).first().boundingBox();
        assert.ok(box.height >= 36, `${sel} is ${box.height}px tall`);
      }
      const nFailed = Number((await pg.locator('[data-cf="failed"]').innerText()).match(/\d+/)[0]);
      await pg.locator('[data-cf="failed"]').click();
      assert.equal(await pg.locator(".cand").count(), nFailed);
      assert.ok((await pg.locator(".cand").allInnerTexts()).every(t => /Failed/.test(t)));
      await pg.locator('[data-cf="all"]').click();
      await pg.locator("#morecands").click();
      assert.equal(await pg.locator(".cand").count(), 6);
    });
    await t.test("sport switch (college football)", async () => {
      scenario = "sports";
      await pg.getByRole("button", {name: "Refresh"}).click();
      await pg.locator(".sports").waitFor();
      assert.deepEqual(await pg.locator(".sports .chip").allInnerTexts(), ["NFL", "College football"]);
      await pg.getByRole("tab", {name: "College football"}).click();
      assert.match(await pg.locator(".sumcard .kicker").innerText(), /Research · CFB/i);
      assert.deepEqual(await pg.locator(".nums b").allInnerTexts(), ["2", "0", "0"]);
      assert.match(await pg.locator("main").innerText(), /2 attempts · 11 across all sports \(reported only\)/);
      assert.equal(await pg.locator(".cand").count(), 2);
      assert.match(await pg.locator(".cand").first().innerText(), /Plain Elo/);
      const box = await pg.locator(".sports .chip").first().boundingBox();
      assert.ok(box.height >= 44, `sport chip is ${box.height}px tall`);
      await pg.screenshot({path: OUT + "sports-cfb.png", fullPage: true});
      await pg.locator(".cand").first().click();
      await pg.locator(".dtitle").waitFor();
      assert.match(await pg.locator(".dtitle").innerText(), /Plain Elo/);
      assert.match(await pg.locator("main").innerText(), /2021–22/);
      await pg.locator(".back").click();
      await pg.getByRole("tab", {name: "NFL"}).click();
      assert.match(await pg.locator(".sumcard .kicker").innerText(), /Research · NFL/i);
      scenario = "mixed";
      await pg.getByRole("button", {name: "Refresh"}).click();
      await pg.locator(".alert").waitFor();
    });
    await t.test("candidate detail", async () => {
      await pg.locator(".cand").first().click();
      await pg.locator(".ig").waitFor();
      assert.match(await pg.locator(".ig").innerText(), /INSPECTOR GENERAL[\s\S]*Passed all three gates[\s\S]*run #41/);
      assert.equal(await pg.locator(".gate").count(), 4);
      assert.match(await pg.locator(".scale").innerText(), /−4\s*0\s*\+4/);
      const checks = await pg.locator(".checks").innerText();
      for (const re of [/Holds after 9 attempts[\s\S]*Adjusted p = 0.030 · bar 0.05/, /Positive in every gate[\s\S]*3 of 3/,
                        /Not fading[\s\S]*69% of the first · needs 50%/, /412 picks · won 53.4% · needs 51.8% · \+1.9% · can’t pass alone/,
                        /Before 2021 \+1.6 · after 2021 \+1.1 · after 2024 kickoff rule: too few games/]) assert.match(checks, re);
      assert.match(await pg.locator(".sealed").innerText(), /Sealed 2025 exam[\s\S]*Not taken yet[\s\S]*3 of 3 exams left/);
      assert.equal(await pg.getByRole("link", {name: "View run on GitHub"}).getAttribute("href"), "https://github.com/DeVig-AI/AI-Bettor-Model/actions/runs/77");
      await pg.screenshot({path: OUT + "detail.png", fullPage: true});
      await pg.locator(".back").click();
      await pg.locator(".sumcard").waitFor();
      // the failed candidate's javascript: link is never used
      await pg.goto(base + "/lab#c/rest");
      await pg.locator(".dtitle").waitFor();
      assert.equal(await pg.getByRole("link", {name: "View run on GitHub"}).count(), 0);
      assert.match(await pg.locator(".checks").innerText(), /Doesn’t hold/);
      await pg.goto(base + "/lab");
      await pg.locator(".sumcard").waitFor();
    });
    await t.test("no horizontal scroll at 360px", async () => {
      await pg.setViewportSize({width: 360, height: 780});
      const w = await pg.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      assert.ok(w[0] <= w[1], `scrollWidth ${w[0]} > ${w[1]}`);
      await pg.screenshot({path: OUT + "mixed-360.png", fullPage: true});
      await pg.setViewportSize({width: 390, height: 844});
    });
    await t.test("offline: keeps last data, says stale", async () => {
      down = true;
      await pg.reload();
      await pg.getByText(/Couldn’t reach the server/).waitFor();
      assert.equal(await pg.locator(".nums b").first().innerText(), "9");
      down = false;
      await pg.screenshot({path: OUT + "offline.png"});
    });
    await t.test("sign-in ran out", async () => {
      scenario = "signedout";
      await pg.getByRole("button", {name: "Refresh"}).click();
      const a = pg.getByRole("link", {name: "Sign in again"});
      await a.waitFor();
      assert.equal(await a.getAttribute("href"), "/login?next=/lab");
    });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});
