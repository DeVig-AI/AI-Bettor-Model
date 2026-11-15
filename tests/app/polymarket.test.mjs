// Polymarket links in the bet link reader (/api/kalshi with a polymarket.com link). No network needed:
//   node --test tests/app/polymarket.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { comboFromPage, parsePoly, pricedPoly, sideWords } from "../../functions/lib/polymarket.js";
import { handle } from "../../functions/api/kalshi.js";
import { shownSaved } from "../../functions/api/friends.js";

const ML = {slug: "nba-det-mia-2026-11-14", question: "Pistons vs. Heat", outcomes: '["Pistons", "Heat"]', outcomePrices: '["0.585", "0.415"]',
  bestBid: 0.58, bestAsk: 0.59, lastTradePrice: 0.58, closed: false, active: true, sportsMarketType: "moneyline", gameStartTime: "2026-11-15 01:00:00+00"};
const SPREAD = {slug: "nba-det-mia-2026-11-14-spread-away-4pt5", question: "Spread: Pistons (-4.5)", outcomes: '["Pistons", "Heat"]',
  outcomePrices: '["0.455", "0.545"]', bestBid: 0.45, bestAsk: 0.46, closed: false, active: true, sportsMarketType: "spreads", line: -4.5};
const TOTAL = {slug: "nba-det-mia-2026-11-14-total-231pt5", question: "Pistons vs. Heat: O/U 231.5", outcomes: '["Over", "Under"]',
  outcomePrices: '["0.715", "0.285"]', bestBid: 0.7, bestAsk: 0.73, closed: false, active: true, sportsMarketType: "totals", line: 231.5};
const DONE = {slug: "nba-atl-chi-2026-11-13", question: "Hawks vs. Bulls", outcomes: '["Hawks", "Bulls"]', outcomePrices: '["0", "1"]',
  bestBid: 0.001, bestAsk: 1, closed: true, active: true, sportsMarketType: "moneyline", umaResolutionStatus: "resolved"};
const TITLE = [
  {slug: "will-boston-celtics-win-the-2027-nba-finals", question: "Will Boston Celtics win the 2027 NBA Finals?", groupItemTitle: "Boston Celtics",
    outcomes: '["Yes", "No"]', outcomePrices: '["0.075", "0.925"]', bestBid: 0.07, bestAsk: 0.08, closed: false, active: true},
  {slug: "will-utah-jazz-win-the-2027-nba-finals", question: "Will Utah Jazz win the 2027 NBA Finals?", groupItemTitle: "Utah Jazz",
    outcomes: '["Yes", "No"]', outcomePrices: '["0.001", "0.999"]', bestAsk: 0.002, closed: false, active: true},
];

// Polymarket's public API, faked: open markets by slug, closed ones only with closed=true
function fakePoly(calls = []) {
  return async (url) => {
    calls.push(url);
    const u = new URL(url);
    const slug = u.searchParams.get("slug");
    const res = body => new Response(JSON.stringify(body), {status: 200, headers: {"content-type": "application/json"}});
    if (u.pathname === "/events") {
      if (slug === "nba-det-mia-2026-11-14") return res([{slug, title: "Pistons vs. Heat", markets: [TOTAL, SPREAD, ML]}]);
      if (slug === "nba-2027-champion") return res([{slug, title: "NBA: 2027 Champion", markets: TITLE}]);
      return res([]);
    }
    const all = [ML, SPREAD, TOTAL, DONE, ...TITLE].filter(m => m.slug === slug);
    return res(all.filter(m => !!m.closed === (u.searchParams.get("closed") === "true")));
  };
}
const ask = async (link, fetcher = fakePoly()) => {
  const r = await handle(new Request(`https://devig.test/api/kalshi?link=${encodeURIComponent(link)}`), fetcher, () => Date.parse("2026-11-15T01:30:00Z") + Math.random() * 1e6);
  return {status: r.status, d: await r.json()};
};

test("links: event pages, a market inside one, sports pages and picked sides; other sites are refused", () => {
  assert.deepEqual(parsePoly("https://polymarket.com/event/nba-det-mia-2026-11-14?tid=1731"), {slug: "nba-det-mia-2026-11-14"});
  assert.deepEqual(parsePoly("polymarket.com/event/nba-det-mia-2026-11-14/nba-det-mia-2026-11-14-total-231pt5"),
    {slug: "nba-det-mia-2026-11-14", market: "nba-det-mia-2026-11-14-total-231pt5"});
  assert.deepEqual(parsePoly("https://www.polymarket.com/sports/nba/games/week/2/nba-det-mia-2026-11-14"), {slug: "nba-det-mia-2026-11-14"});
  assert.deepEqual(parsePoly("pm:nba-det-mia-2026-11-14~1"), {slug: "nba-det-mia-2026-11-14", side: 1});
  assert.deepEqual(parsePoly("Check out this market on Polymarket: https://polymarket.com/event/nba-det-mia-2026-11-14?via=rey."), {slug: "nba-det-mia-2026-11-14"});
  assert.deepEqual(parsePoly("https://polymarket.com/en/event/nba-det-mia-2026-11-14"), {slug: "nba-det-mia-2026-11-14"});
  assert.equal(parsePoly("look https://polymarket.com.evil.com/event/x-y"), null);
  assert.equal(parsePoly("https://polymarket.com.evil.com/event/x-y"), null);
  assert.equal(parsePoly("https://evil.com/event/nba-det-mia-2026-11-14"), null);
  assert.equal(parsePoly("https://polymarket.com/"), null);
  assert.equal(parsePoly("pm:nba~2"), null);
  assert.equal(parsePoly("https://kalshi.com/markets/kxnbagame/x/kxnbagame-26oct31poruta"), null);
});

test("each side in words: who wins, the spread from that side, over/under, and Yes/No by the market's name", () => {
  assert.equal(sideWords(ML, 1).title, "Heat win");
  assert.equal(sideWords(SPREAD, 0).title, "Pistons -4.5");
  assert.equal(sideWords(SPREAD, 1).title, "Heat +4.5");
  assert.equal(sideWords(TOTAL, 1).title, "Under 231.5");
  assert.deepEqual(sideWords(TITLE[0], 1), {title: "Boston Celtics", side: "no"});
});

test("prices from the side you took; finished markets are won or lost; a void has no result", () => {
  const heat = pricedPoly(ML, 1);
  assert.deepEqual([heat.bid, heat.ask, heat.chance, heat.ticker], [0.41, 0.42, 0.415, "pm:nba-det-mia-2026-11-14~1"]);
  assert.deepEqual([pricedPoly(DONE, 0).result, pricedPoly(DONE, 1).result, pricedPoly(DONE, 1).chance], ["lost", "won", 1]);
  assert.equal(pricedPoly({...DONE, outcomePrices: '["0.5", "0.5"]'}, 0).result, null);
  // a wide-open book: Polymarket's own price, not the midpoint of 0.1 and 0.9
  assert.equal(pricedPoly({...ML, bestBid: 0.1, bestAsk: 0.9}, 0).chance, 0.585);
});

test("a game link lists every side, the moneyline first; picking one reads back as that single bet", async () => {
  const {status, d} = await ask("https://polymarket.com/event/nba-det-mia-2026-11-14");
  assert.equal(status, 200);
  assert.equal(d.source, "polymarket");
  assert.equal(d.kind, "event");
  assert.deepEqual(d.markets.map(m => m.title), ["Pistons win", "Heat win", "Pistons -4.5", "Heat +4.5", "Over 231.5", "Under 231.5"]);
  const one = await ask(d.markets[3].ticker);
  assert.equal(one.d.kind, "market");
  assert.equal(one.d.market.title, "Heat +4.5");
});

test("a market link asks which side; a finished game still reads; the title race lists the Yes sides first", async () => {
  const m = (await ask("https://polymarket.com/event/nba-det-mia-2026-11-14/nba-det-mia-2026-11-14-total-231pt5")).d;
  assert.deepEqual([m.kind, m.title, m.markets.length], ["event", "Pistons vs. Heat: O/U 231.5", 2]);
  const calls = [];
  const done = (await ask("pm:nba-atl-chi-2026-11-13~1", fakePoly(calls))).d;
  assert.deepEqual([done.kind, done.market.result], ["market", "won"]);
  assert.ok(calls.some(u => u.includes("closed=true")));
  const race = (await ask("https://polymarket.com/event/nba-2027-champion")).d;
  assert.deepEqual(race.markets.map(x => `${x.side} ${x.title}`), ["yes Boston Celtics", "yes Utah Jazz", "no Boston Celtics", "no Utah Jazz"]);
});

test("Polymarket down or nothing at the link: a plain message", async () => {
  assert.equal((await ask("https://polymarket.com/event/not-a-real-thing")).status, 404);
  const down = await ask("https://polymarket.com/event/nba-det-mia-2026-11-15", async () => new Response("", {status: 503}));
  assert.equal(down.status, 502);
  assert.match(down.d.error, /Polymarket isn't answering/);
  assert.match((await ask("https://example.com/x")).d.error, /Kalshi or Polymarket/);
});

test("friends see saved Polymarket bets, the link cut to the page", () => {
  const out = shownSaved({saved: {items: [
    {link: "pm:nba-det-mia-2026-11-14~1", label: "Heat win", savedAt: "2026-11-14"},
    {link: "https://polymarket.com/event/nba-det-mia-2026-11-14?tid=99&ref=me", label: "Pistons vs. Heat", savedAt: "2026-11-14"},
    {link: "pm:../../etc~1", label: "bad", savedAt: "2026-11-14"},
  ]}});
  assert.deepEqual(out.map(o => o.link), ["pm:nba-det-mia-2026-11-14~1", "https://polymarket.com/event/nba-det-mia-2026-11-14"]);
});

// a polymarket.us combo page: the combo rides in the page's data, escaped inside a script string
const sel = (game, code, name, chance, status = "pending") => ({id: `aec-${game}:OUTCOME_SIDE_NO:0`, marketSlug: `aec-${game}`,
  outcomeSide: "OUTCOME_SIDE_NO", totalSide: "$undefined", title: `${code} ${name} to win`, outcome: "$undefined", status,
  chance: {originalValue: String(chance)}, compactTitle: `${code} to win`, selectionTitle: `${code} ${name}`, description: "To win"});
const COMBO = {comboSlug: "crossd-1", multiplier: "30.03003003", seed: {groups: [
  {eventSlug: "nfl-lar-ari-2026-11-15", startTime: "2026-11-15T21:05:00Z", live: true, ended: false, selections: [sel("nfl-lar-ari-2026-11-15", "ARI", "Cardinals", 18.88)]},
  {eventSlug: "nfl-sea-lv-2026-11-15", live: true, ended: false, selections: [sel("nfl-sea-lv-2026-11-15", "LV", "Raiders", 32.62)]},
  {eventSlug: "nfl-sf-dal-2026-11-15", live: false, ended: true, selections: [sel("nfl-sf-dal-2026-11-15", "SF", "49ers", 100, "won")]}]}};
const OUTLINE = {comboSlug: "crossd-1", link: "share", structure: [{eventSlug: "nfl-lar-ari-2026-11-15", selections: []}]};
const page = `<html><script>self.__next_f.push([1,"97:${JSON.stringify(OUTLINE).replace(/"/g, '\\\\"')}"])</script><script>self.__next_f.push([1,"98:[\\"$\\",\\"$L99\\",null,${JSON.stringify(COMBO).replace(/"/g, '\\"')}]"])</script></html>`;

test("Polymarket US combos: a shared combo link reads as a parlay, each team to win followed by its game", async () => {
  assert.deepEqual(parsePoly("Check out my combo https://polymarket.us/combos/SP8ITfSHHltb33eTBhFc?referrer=someone"), {combo: "SP8ITfSHHltb33eTBhFc"});
  assert.equal(parsePoly("https://polymarket.us/sports/nfl"), null);
  assert.equal(comboFromPage(page).multiplier, "30.03003003");
  const calls = [];
  const {status, d} = await ask("https://polymarket.us/combos/SP8ITfSHHltb33eTBhFc?referrer=someone", async (u) => { calls.push(u); return new Response(page); });
  assert.equal(status, 200);
  assert.ok(!calls[0].includes("referrer"));
  assert.deepEqual([d.kind, d.source, d.legs.length, d.won, d.lost, d.combo.chance], ["combo", "polymarket", 3, 1, 0, 0.0333]);
  assert.deepEqual(d.legs.map(l => [l.ticker, l.title, l.chance, l.result]), [
    ["pm:nfl-lar-ari-2026-11-15~1", "ARI Cardinals to win", 0.1888, null],
    ["pm:nfl-sea-lv-2026-11-15~1", "LV Raiders to win", 0.3262, null],
    ["pm:nfl-sf-dal-2026-11-15~0", "SF 49ers to win", 1, "won"]]);
  assert.equal((await ask("https://polymarket.us/combos/gone123", async () => new Response("<html></html>"))).status, 404);
});
