// Phone check of /lab in Chromium at 390px with mocked GitHub / raw answers: node --test tests/lab/ui.test.mjs
// Screenshots go to tests/lab/out/ (not committed).
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdirSync } from "node:fs";
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
      assert.equal(await pg.locator(".alert").count(), 0);
      assert.ok(await pg.locator(".wf").count() >= 4);
      await pg.screenshot({path: OUT + "empty.png", fullPage: true});
    });
    await t.test("mixed results + failed workflow", async () => {
      scenario = "mixed";
      await pg.getByRole("button", {name: "Refresh"}).click();
      await pg.locator(".alert").waitFor();
      assert.match(await pg.locator(".alert").innerText(), /1 workflow failing[\s\S]*Game lines/);
      assert.match(await pg.locator(".big").innerText(), /9 tried · 3 passed lab · 1 passed exam/);
      assert.equal(await pg.locator(".cand").count(), 3);
      assert.equal(await pg.locator(".lesson .tag").first().innerText(), "EXPLORATORY — NOT PROOF");
      assert.match(await pg.locator(".promo").innerText(), /Promoted, not proven[\s\S]*23–18/i);
      const b = pg.locator(".cand > button").first();
      assert.equal(await b.getAttribute("aria-expanded"), "false");
      await b.click();
      assert.equal(await b.getAttribute("aria-expanded"), "true");
      await pg.getByText("Held up in every window and the exam.").waitFor();
      assert.equal(await pg.locator('.cand a[href^="javascript"]').count(), 0);
      assert.ok((await pg.locator(".cand").nth(1).innerText()).includes("<img src=x"), "names shown as text");
      await pg.screenshot({path: OUT + "mixed.png", fullPage: true});
      // targets: buttons and workflow links at least 44px tall
      for (const sel of ["#refresh", ".cand > button", ".wf", "footer a"]) {
        const box = await pg.locator(sel).first().boundingBox();
        assert.ok(box.height >= 44, `${sel} is ${box.height}px tall`);
      }
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
      assert.match(await pg.locator(".big").innerText(), /9 tried/);
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
