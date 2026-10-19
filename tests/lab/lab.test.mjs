// Unit tests for the owner-only /lab page and /api/lab: node --test tests/lab/
import test from "node:test";
import assert from "node:assert/strict";
import * as api from "../../functions/api/lab.js";
import * as page from "../../functions/lab.js";
import { readFileSync } from "node:fs";
import { mockFetch } from "./fixtures.mjs";

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
  const d3 = await api.labData({}, async () => { throw new Error("offline"); }, true);
  assert.equal(d3.github.stale, true);
  assert.ok(d3.github.workflows.length > 0);
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

test("cleanStatus keeps other sports under by_sport, one level deep", () => {
  const s = api.cleanStatus({scope: "NFL", sport: "NFL", sports: [{key: "nfl", name: "NFL"}, {key: "CFB", name: "College football"}, {bad: 1}],
    attempts: {this_sport: 3, all_sports: 5}, by_sport: {CFB: {scope: "CFB", candidates: [{id: "x", pooled: {adj_p: 0.5, adj_p_all_sports: 0.9}}],
      by_sport: {DEEP: {}}}, "<b>": {scope: "x"}}});
  assert.deepEqual(s.sports.map(x => x.key), ["NFL", "CFB"]);
  assert.equal(s.attempts.all_sports, 5);
  assert.deepEqual(Object.keys(s.by_sport), ["CFB", "B"]);
  assert.equal(s.by_sport.CFB.candidates[0].pooled.adj_p_all_sports, 0.9);
  assert.equal("by_sport" in s.by_sport.CFB, false);
  assert.equal(api.cleanStatus({scope: "NFL"}).sports.length, 0);
});
