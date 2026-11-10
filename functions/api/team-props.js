// Team props for one game: GET /api/team-props?game=KXNFLGAME-26NOV16LACBAL-BAL (the game's home-team Kalshi ticker)
// -> Kalshi's ladders for each team's points ("Baltimore over 21.5 points"), each team's winning margin ("Baltimore
// wins by over 5.5 points") and the game total ("Over 38.5 points"), with buy and sell prices. Every league names these
// the same way: KX<league>GAME -> KX<league>TEAMTOTAL / SPREAD / TOTAL, same event code. Public market data, no key.
// Display only; DeVig has no model for these. Answers are kept for 60 seconds so many viewers share one Kalshi request.
import { market } from "./props.js";

const KALSHI = "https://api.elections.kalshi.com/trade-api/v2";
const TTL = 60;
const GAME = /^(KX[A-Z]{2,8})GAME-(\d{2}[A-Z]{3}\d{2})([A-Z0-9]{2,16})-([A-Z0-9]{1,8})$/;
const KINDS = {tt: "TEAMTOTAL", by: "SPREAD", total: "TOTAL"};
const mem = new Map();

function json(body, status = 200, maxAge = 0) {
  return new Response(JSON.stringify(body), {status, headers: {"content-type": "application/json",
    "cache-control": maxAge ? `public, max-age=${maxAge}` : "no-store"}});
}

// "KXNFLGAME-26NOV16LACBAL-BAL" -> {league: "KXNFL", event: "26NOV16LACBAL", home: "BAL", away: "LAC"}
export function parseGame(raw) {
  const m = GAME.exec(String(raw || "").trim().toUpperCase());
  if (!m) return null;
  const [, league, date, teams, home] = m;
  if (!teams.endsWith(home) || teams.length === home.length) return null;
  return {league, event: date + teams, home, away: teams.slice(0, -home.length)};
}

// Kalshi's markets for one series on this game -> rungs [need, bid, ask, ticker], need = the "N+" number (21.5 -> 22),
// lowest first; team series are split by team. A rung with no real price on either side is left out.
export function ladders(markets, kind, g) {
  const out = kind === "total" ? [] : {[g.away]: [], [g.home]: []};
  for (const raw of markets || []) {
    const strike = Number(raw.floor_strike);
    if (!isFinite(strike) || raw.strike_type && raw.strike_type !== "greater") continue;
    const p = market(raw);
    if (p.bid == null || p.ask == null || p.ask < p.bid) continue;
    const rung = [Math.round(strike + 0.5), p.bid, p.ask, raw.ticker];
    if (kind === "total") { out.push(rung); continue; }
    const code = String(raw.ticker).split("-").pop().replace(/\d+$/, "");
    if (out[code]) out[code].push(rung);
  }
  const sort = a => a.sort((x, y) => x[0] - y[0]);
  if (kind === "total") return sort(out);
  for (const k in out) sort(out[k]);
  return out;
}

export async function handle(request, fetcher = fetch, now = Date.now) {
  if (request.method !== "GET") return json({error: "method not allowed"}, 405);
  const g = parseGame(new URL(request.url).searchParams.get("game"));
  if (!g) return json({error: "no valid game ticker"}, 400);
  const key = g.league + g.event;
  const hit = mem.get(key);
  if (hit && now() - hit.at < TTL * 1000) return json(hit.data, 200, 30);
  try {
    const got = await Promise.all(Object.entries(KINDS).map(async ([kind, s]) => {
      const url = `${KALSHI}/markets?event_ticker=${g.league}${s}-${g.event}&limit=200`;
      const r = await fetcher(url, {headers: {accept: "application/json"}, cf: {cacheTtl: TTL, cacheEverything: true}});
      if (!r.ok) throw new Error("kalshi " + r.status);
      return [kind, ladders((await r.json()).markets, kind, g)];
    }));
    const data = {fetched_at: new Date(now()).toISOString().replace(/\.\d+Z$/, "Z"), away: g.away, home: g.home,
                  ...Object.fromEntries(got)};
    mem.set(key, {at: now(), data});
    if (mem.size > 200) mem.delete(mem.keys().next().value);
    return json(data, 200, 30);
  } catch (e) {
    return json({error: "prices unavailable"}, 502);
  }
}

export async function onRequest(context) {
  return handle(context.request);
}
