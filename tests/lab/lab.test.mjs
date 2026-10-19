// Unit tests for the owner-only /lab page and /api/lab: node --test tests/lab/
import test from "node:test";
import assert from "node:assert/strict";
import * as api from "../../functions/api/lab.js";
import * as page from "../../functions/lab.js";
import { readFileSync } from "node:fs";
import { mockFetch, STATUS } from "./fixtures.mjs";

const OWNER = "Owner@Example.com";
const SITE_404 = readFileSync(new URL("../../docs/404.html", import.meta.url), "utf8");   // the site's real 404 page
const assets = {fetch: async () => new Response(SITE_404, {status: 404, headers: {"content-type": "text/html"}})};
const env = (extra = {}) => ({OWNER_EMAIL: `  ${OWNER} `, ACCESS_TEAM_DOMAIN: "x.cloudflareaccess.com", ASSETS: assets, ...extra});
const as = email => async () => email;
const req = (path, method = "GET") => new Request("https://devigai.pages.dev" + path, {method});

async function snap(r) {
  return {status: r.status, type: r.headers.get("content-type"), body: await r.text(),
          robots: r.headers.get("x-robots-tag"), cache: r.headers.get("cache-control")};
}

test("gate: owner email matches trimmed and case-insensitively", async () => {
  assert.equal(await api.ownerOnly(req("/lab"), env(), as("owner@example.com")), "owner@example.com");
  assert.equal(await api.ownerOnly(req("/lab"), env(), as("OWNER@EXAMPLE.COM ")), "owner@example.com");
  assert.equal(await api.ownerOnly(req("/lab"), env(), as("someone@example.com")), null);
  assert.equal(await api.ownerOnly(req("/lab"), env(), as(null)), null);
  assert.equal(await api.ownerOnly(req("/lab"), env({OWNER_EMAIL: ""}), as("owner@example.com")), null);
  assert.equal(await api.ownerOnly(req("/lab"), env({OWNER_EMAIL: undefined}), as("")), null);
  assert.equal(await api.ownerOnly(req("/lab"), env(), async () => { throw new Error("bad token"); }), null);
});

for (const [name, mod, path] of [["page /lab", page, "/lab"], ["api /api/lab", api, "/api/lab"]]) {
  test(`${name}: owner gets 200 with private headers`, async () => {
    api._clearCache();
    const r = await mod.handle(req(path), env(), {accessUser: as("owner@example.com"), fetch: mockFetch("mixed")});
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.equal(r.headers.get("cache-control"), "private, no-store");
    assert.equal(r.headers.get("referrer-policy"), "no-referrer");
    const body = await r.text();
    assert.ok(!body.toLowerCase().includes("owner@example.com"), "email never echoed");
  });

  test(`${name}: everyone else gets the identical site 404`, async () => {
    const cases = [
      [env(), as("someone@else.com")],                      // other account
      [env(), as(null)],                                    // no cookie / signed out
      [env(), async () => { throw new Error("bad"); }],     // bad token
      [env({OWNER_EMAIL: ""}), as("owner@example.com")],    // OWNER_EMAIL unset
      [env({OWNER_EMAIL: undefined}), as(null)],
    ];
    const out = [];
    for (const [e, who] of cases) out.push(await snap(await mod.handle(req(path), e, {accessUser: who, fetch: mockFetch("mixed")})));
    const missing = await snap(await assets.fetch(req("/no-such-page")));
    for (const o of out) {
      assert.deepEqual(o, missing);
      assert.equal(o.status, 404);
      assert.ok(!/forbidden|owner|lab/i.test(o.body));
    }
    // a non-GET from the owner is also just "not found"
    assert.equal((await mod.handle(req(path, "POST"), env(), {accessUser: as("owner@example.com")})).status, 404);
  });

  test(`${name}: without the ASSETS binding still a plain 404`, async () => {
    const r = await mod.handle(req(path), {}, {accessUser: as(null)});
    assert.equal(r.status, 404);
    assert.equal(await r.text(), api.NOT_FOUND_HTML);
  });
}

test("real accessUser path: no cookie -> 404 (no mocks of the gate)", async () => {
  const r = await page.onRequest({request: req("/lab"), env: env()});
  assert.equal(r.status, 404);
  const a = await api.onRequest({request: req("/api/lab"), env: env()});
  assert.equal(a.status, 404);
});

test("data: latest run per workflow, failures flagged, groups", async () => {
  api._clearCache();
  const d = await api.labData({}, mockFetch("mixed"));
  const by = Object.fromEntries(d.github.workflows.map(w => [w.id, w]));
  assert.equal(by[1].last.state, "running");
  assert.equal(by[2].last.state, "failed");
  assert.equal(by[2].last.duration_s, 180);
  assert.equal(by[4].last.state, "queued");
  assert.equal(by[5].last, null);
  assert.deepEqual(d.github.failing, [2]);
  assert.equal(by[1].group, "Props");
  assert.equal(by[2].group, "Games & App");
  assert.equal(by[3].group, "Games & App");
  assert.equal(by[4].group, "Research");
  assert.equal(d.research.status.counts.tried, 9);
  assert.equal(d.research.status.candidates[2].run_url, null, "non-GitHub links dropped");
  assert.equal(d.research.status.candidates[0].kalshi.picks, 412);
  assert.equal(d.research.status.candidates[1].gate_now, 2);
});

test("data: token is sent and fills missing workflows; no token -> no extra calls", async () => {
  api._clearCache();
  const calls = [];
  await api.labData({GITHUB_TOKEN: "tok"}, mockFetch("mixed", calls));
  const ghCalls = calls.filter(c => c.url.startsWith("https://api.github.com"));
  assert.ok(ghCalls.every(c => c.init.headers.authorization === "Bearer tok"));
  assert.ok(ghCalls.some(c => /workflows\/5\/runs/.test(c.url)));
  api._clearCache();
  const calls2 = [];
  await api.labData({}, mockFetch("mixed", calls2));
  assert.equal(calls2.filter(c => c.url.startsWith("https://api.github.com")).length, 2);
  assert.ok(calls2.every(c => !c.init.headers.authorization));
});

test("data: cached ~3 min, stale copy kept when a fetch fails, missing status.json is empty", async () => {
  api._clearCache();
  const calls = [];
  await api.labData({}, mockFetch("empty", calls));
  const n = calls.length;
  const d2 = await api.labData({}, mockFetch("empty", calls));
  assert.equal(calls.length, n, "second load served from cache");
  assert.equal(d2.research.status, null);
  assert.equal(d2.research.stale, false);
  // a refresh tap re-reads status.json at once (here it fails: the last good copy is kept, marked stale) but leaves
  // GitHub Actions alone while its copy is under 20 s old
  const d3 = await api.labData({}, async () => { throw new Error("offline"); }, true);
  assert.equal(d3.research.stale, true);
  assert.equal(d3.github.stale, false);
  assert.ok(d3.github.workflows.length > 0);
});

test("data: with a token status.json is read through the API (skips raw's 5-minute cache)", async () => {
  api._clearCache();
  const calls = [];
  const d = await api.labData({GITHUB_TOKEN: "tok"}, mockFetch("mixed", calls));
  const st = calls.find(c => c.url.includes("/contents/research/status.json?ref=main"));
  assert.ok(st && st.init.headers.authorization === "Bearer tok" && st.init.headers.accept === "application/vnd.github.raw");
  assert.ok(!calls.some(c => c.url.startsWith("https://raw.githubusercontent.com")));
  assert.equal(d.research.status.runs[0].name, "Research Lab #12");
});

test("cleanStatus keeps run timelines, safely", () => {
  const c = api.cleanStatus(STATUS);
  assert.equal(c.runs.length, 2);
  const [a, b] = c.runs;
  assert.equal(a.steps.length, 8);
  assert.equal(a.duration_s, 11);
  assert.equal(a.steps[0].state, "lab_pass");
  assert.equal(a.steps[1].fail_reason, "gate_2");
  assert.deepEqual(a.steps[1].gates, [true, false, true]);
  assert.deepEqual(b.steps[0].gates, []);
  assert.equal(b.run_url, null, "non-GitHub links dropped");
  assert.equal(b.steps[0].state, "info", "unknown step state falls back");
  assert.equal(api.cleanStatus({runs: "x"}).runs.length, 0);
});

test("cleanStatus keeps contract fields only and coerces bad types", () => {
  const s = api.cleanStatus({counts: {tried: "9"}, candidates: [{id: "a", state: "weird", market: "x", gates: [{passed: "yes"}], extra: 1}], junk: 1});
  assert.equal(s.counts.tried, null);
  assert.equal(s.candidates[0].state, "queued");
  assert.equal(s.candidates[0].market, "other");
  assert.equal(s.candidates[0].gates[0].passed, null);
  assert.equal("extra" in s.candidates[0], false);
  assert.equal("junk" in s, false);
  assert.equal(api.cleanStatus(null), null);
});
