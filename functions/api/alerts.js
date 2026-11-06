// DeVig alerts: push notifications to a phone or computer, even with the app closed.
//
//   GET  /api/alerts            this person's alert settings (needs a DeVig account, like /api/me)
//   POST /api/alerts {op, ...}  device (turn on for this device), forget (turn off), prefs, target / untarget (a price
//                               target on a game), parlay / unparlay (a saved parlay's alert), test (send a test)
//   POST /api/alerts?run=1      the checker: a Cloudflare timer calls it every minute (workers/alerts-timer), and the
//                               price bots after each refresh (GitHub Actions); it looks at everyone's alerts and sends what's due
//
// What can ping:
//   - New DeVig pick: a pick locks in a sport the person follows (NFL, college football, NBA, college basketball, MLB)
//   - Price target: "tell me when KC is +105 or better" on one game, before it starts (Kalshi's price now); soccer: a team or the draw
//   - Big line move: a game with a favorite team or a ★ tracked game moves 5+ points on Kalshi within 6 hours, before
//     the start
//   - Lab model passed: a Research Lab model passes its confirmation check, or the sealed exam
//   - Parlay: a saved parlay's chance reaches a number the person picked, and/or each leg as it wins or loses
//   - Live games (each one picked, all off until chosen): a game starting, halftime, lead changes, big plays
//     (TOUCHDOWN, INTERCEPTION, a 10-0 run...), late go-aheads, the final, and saved parlays' legs as they hit or
//     miss. Only for the person's games: ★ tracked, a ★ prop in it, or on a saved parlay (functions/lib/live-alerts.js)
//   - Quiet hours: nothing is sent between the hours picked (in their time zone); what's still due goes after
// Display only, like the rest of DeVig: an alert is information, never a bet.
//
// Needs, in the Pages project settings:
//   USERS               the same KV namespace as /api/me
//   VAPID_PRIVATE_KEY   secret: DeVig's push signing key (its public half is VAPID_PUBLIC_KEY below)
//   ALERTS_RUN_KEY      optional secret: when set, ?run=1 needs it in the x-run-key header. Without it the checker is
//                       open but runs at most once every 90 seconds, and it only ever sends what's due once.
import { accessUser, userKey } from "./me.js";
import { priced } from "./kalshi.js";
import { points } from "./winline.js";
import { b64uEncode, endpointOk, keysOk, send } from "../lib/webpush.js";
import { ESPN, GAME, KIND, SPORTS, cachedJson, teamCode } from "./live.js";
import { LIVE_PREFS, PER_GAME, compose, gameEvents, mine, statusOf, trackedLegs } from "../lib/live-alerts.js";

export const VAPID_PUBLIC_KEY = "BGlnoV3g18sWFbndIEOaGr1St2hIcnYwgZpbjDjffAVlCRoLdLTHpArq8WFfTPR98MgCpdtT51c0d2YjC7G4ihg";
const RAW = "https://raw.githubusercontent.com/DeVig-AI/AI-Bettor-Model/main/";
const KALSHI = "https://api.elections.kalshi.com/trade-api/v2";
const SITE = "https://devigai.pages.dev";
const INDEX = "alerts:index";
const PICK_SPORTS = ["NFL", "CFB", "NBA", "CBB", "MLB"];
const MAX_DEVICES = 6, MAX_TARGETS = 20, MAX_PARLAYS = 10, MAX_LEGS = 12;
const SAVE_GAP_MS = 1000, SAVES_PER_DAY = 200, SENDS_PER_DAY = 80, PER_RUN = 5;
const LIVE_SPORTS = ["NFL", "CFB", "NBA", "WNBA", "CBB", "NHL"], MAX_LIVE_GAMES = 12, LIVE_TTL = 15, RUN_GAP_KEYED_S = 25;
const MOVE = 0.05, MOVE_HOURS = 6, RUN_GAP_S = 90, SENT_DAYS = 10;
// a settled leg is news for LEG_FRESH_H after Kalshi settles it; past that it's never sent, so a lost "sent" mark
// can't make it ping again and again. MEMO_S: how long the edge cache also remembers what was sent (see run)
const LEG_FRESH_H = 3, MEMO_S = 2 * 86400, RUN_HOLD_S = 60;
const GAME_TICKER = /^KX(?:NFL|NBA|WNBA|NHL|MLB|NCAAF|NCAAB|NCAAMB)GAME-[A-Z0-9]{6,30}-[A-Z0-9]{1,8}$/;
// soccer: each of the three outcomes is its own market (home, TIE, away), so a soccer target names that market
const SOCCER_TICKER = /^KX(?:EPL|LALIGA|SERIEA|BUNDESLIGA|LIGUE1|UCL|UEL|UECL|MLS|LIGAMX)GAME-[A-Z0-9]{6,30}-[A-Z0-9]{1,8}$/;
const LEG_TICKER = /^[A-Z0-9][A-Z0-9._-]{2,99}$/;
const memRuns = {at: 0};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {status, headers: {"content-type": "application/json", "cache-control": "no-store"}});
}
const str = (v, n) => String(v == null ? "" : v).slice(0, n);
const hashOf = async s => b64uEncode(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))).slice(0, 16);

// ---------- what people can save ----------
// Everything starts off: someone picks what pings them before anything does.
export const DEFAULT_LIVE = Object.fromEntries(LIVE_PREFS.map(k => [k, false]));
export const DEFAULT_PREFS = {picks: [], moves: false, lab: false, tz: "America/New_York", live: DEFAULT_LIVE, quiet: null};

function tzOk(tz) {
  try { new Intl.DateTimeFormat("en-US", {timeZone: tz}); return true; } catch (e) { return false; }
}
export function cleanPrefs(p, old = DEFAULT_PREFS) {
  p = p && typeof p === "object" ? p : {};
  return {
    picks: Array.isArray(p.picks) ? PICK_SPORTS.filter(s => p.picks.includes(s)) : old.picks,
    moves: typeof p.moves === "boolean" ? p.moves : old.moves,
    lab: typeof p.lab === "boolean" ? p.lab : old.lab,
    tz: typeof p.tz === "string" && p.tz.length < 60 && tzOk(p.tz) ? p.tz : old.tz,
    live: cleanLive(p.live, old.live || DEFAULT_LIVE),
    quiet: p.quiet === null ? null : cleanQuiet(p.quiet) || (p.quiet === undefined ? old.quiet ?? null : null),
  };
}
function cleanLive(v, old) {
  const out = {};
  for (const k of LIVE_PREFS) out[k] = v && typeof v[k] === "boolean" ? v[k] : !!(old && old[k]);
  return out;
}
const hourOk = h => Number.isInteger(h) && h >= 0 && h <= 23;
function cleanQuiet(q) {
  return q && typeof q === "object" && hourOk(q.from) && hourOk(q.to) && q.from !== q.to ? {from: q.from, to: q.to} : null;
}
// inside the quiet hours picked, in the person's time zone (from 23 to 8 wraps past midnight)
export function isQuiet(prefs, now) {
  const q = prefs && prefs.quiet;
  if (!q) return false;
  let h;
  try { h = Number(new Intl.DateTimeFormat("en-US", {timeZone: prefs.tz, hour: "numeric", hourCycle: "h23"}).format(new Date(now))); }
  catch (e) { return false; }
  return q.from < q.to ? h >= q.from && h < q.to : h >= q.from || h < q.to;
}

// a price target: one team on one game at American odds (Kalshi's price as the app shows it), before the start.
// Soccer: one of the three outcomes (home, draw, away), its ticker being that outcome's own market
export function cleanTarget(t) {
  if (!t || typeof t !== "object") return null;
  const odds = Number(t.odds), ticker = str(t.ticker, 80).toUpperCase();
  const soccer = SOCCER_TICKER.test(ticker);
  if (!(soccer || GAME_TICKER.test(ticker)) || !isFinite(odds) || (odds > -100 && odds < 100) || Math.abs(odds) > 100000) return null;
  if (!(t.side === "home" || t.side === "away" || (soccer && t.side === "draw")) || !isFinite(Date.parse(t.kickoff))) return null;
  return {id: /^[a-z0-9]{4,24}$/.test(t.id) ? t.id : Math.random().toString(36).slice(2, 12),
    sport: str(t.sport, 8).toUpperCase(), gid: str(t.gid, 40), away: str(t.away, 12), home: str(t.home, 12),
    kickoff: str(t.kickoff, 30), ticker, side: t.side, odds: Math.round(odds)};
}

// a saved parlay: its Kalshi legs, a chance to ping at (0..1, or null), and whether to ping as each leg settles
export function cleanParlay(p) {
  if (!p || typeof p !== "object" || !Array.isArray(p.legs)) return null;
  const legs = p.legs.slice(0, MAX_LEGS).map(l => ({ticker: str(l && l.ticker, 100).toUpperCase(),
    side: l && l.side === "no" ? "no" : "yes", label: str(l && l.label, 60)})).filter(l => LEG_TICKER.test(l.ticker));
  const at = p.at == null ? null : Number(p.at), from = p.from == null ? null : Number(p.from);
  if (!legs.length || legs.length !== p.legs.length) return null;
  if (at != null && !(at > 0 && at < 1)) return null;
  if (at == null && !p.settle) return null;
  return {id: /^[A-Za-z0-9_-]{1,40}$/.test(p.id) ? p.id : null, label: str(p.label, 40), legs, at,
    from: from != null && from >= 0 && from <= 1 ? from : null, settle: !!p.settle};
}

// ---------- reading the data the app reads ----------
async function raw(path, fetcher, now) {
  const r = await fetcher(`${RAW}${path}?t=${Math.floor(now / 60000)}`, {headers: {accept: "application/json"}});
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json();
}

async function boards(fetcher, now) {
  const out = [];
  for (const s of PICK_SPORTS.map(x => x.toLowerCase())) {
    try {
      const d = await raw(`${s}/lineboard_export.json`, fetcher, now);
      for (const x of d.docs || []) if (x.collection === "decisions" && x.data) out.push(x.data);
    } catch (e) { /* one sport's file missing doesn't stop the rest */ }
  }
  return out;
}

async function markets(tickers, fetcher) {
  const out = {};
  const list = [...new Set(tickers)];
  for (let i = 0; i < list.length; i += 40) {
    const part = list.slice(i, i + 40);
    const r = await fetcher(`${KALSHI}/markets?tickers=${encodeURIComponent(part.join(","))}&limit=40`,
      {headers: {accept: "application/json"}, cf: {cacheTtl: 30, cacheEverything: true}});
    if (!r.ok) continue;
    for (const m of (await r.json()).markets || []) out[m.ticker] = m;
  }
  return out;
}

// the home team's Kalshi chance about MOVE_HOURS ago (hourly candles), for the line-move check
async function before(ticker, fetcher, now) {
  const end = Math.floor(now / 1000), start = end - MOVE_HOURS * 3600;
  const r = await fetcher(`${KALSHI}/series/${ticker.split("-")[0]}/markets/${encodeURIComponent(ticker)}/candlesticks` +
    `?start_ts=${start}&end_ts=${end}&period_interval=60`, {headers: {accept: "application/json"}, cf: {cacheTtl: 300, cacheEverything: true}});
  if (!r.ok) return null;
  const pts = points((await r.json()).candlesticks).points;
  return pts.length ? pts[0][1] : null;
}

// ---------- prices, the same way the app shows them ----------
const americanOf = p => (p >= 0.5 ? (-100 * p) / (1 - p) : (100 * (1 - p)) / p);
// one "home team wins" market -> {home, away} American odds: home costs the ask, away costs 1 - the bid
export function moneyline(m) {
  const q = m && priced(m, "yes");
  if (!q || q.bid == null || q.ask == null) return null;
  return {home: Math.round(americanOf(q.ask)), away: Math.round(americanOf(1 - q.bid))};
}
// what a target's side costs now, as American odds: a soccer outcome is bought as Yes on its own market
export function targetOdds(t, m) {
  if (SOCCER_TICKER.test(t.ticker)) {
    const q = m && priced(m, "yes");
    return q && q.ask != null && q.ask > 0 && q.ask < 1 ? Math.round(americanOf(q.ask)) : null;
  }
  const ml = moneyline(m);
  return ml ? ml[t.side] : null;
}
export function fairHome(m) {
  const q = m && priced(m, "yes");
  if (!q || q.bid == null || q.ask == null) return null;
  return q.ask / (q.ask + 1 - q.bid);
}
const fmtOdds = n => (n > 0 ? `+${n}` : `${n}`);
const pct = p => (p > 0 && p < 0.1 ? `${(p * 100).toFixed(1).replace(/\.0$/, "")}%` : `${Math.round(p * 100)}%`);
const gameUrl = (sport, id) => `/v2/#/game/${encodeURIComponent(`${sport}|${id}`)}`;
function when(iso, tz) {
  try {
    return new Intl.DateTimeFormat("en-US", {timeZone: tz, weekday: "short", hour: "numeric", minute: "2-digit"}).format(new Date(iso));
  } catch (e) { return ""; }
}
function impliedOf(a) { return a == null || !a ? null : a < 0 ? -a / (-a + 100) : 100 / (a + 100); }

// ---------- the rules (pure: what's due for one person, given the data) ----------
// Each returns [{key, title, body, url, tag}]; `key` is remembered in rec.sent so nothing is sent twice.

export function pickAlerts(rec, decisions, games, now) {
  const want = new Set(rec.prefs.picks), since = Date.parse(rec.since) || now;
  const out = [];
  for (const d of decisions) {
    const side = d.decision && d.decision.side;
    if (!side || d.decision.action === "PASS" || !want.has(d.sport)) continue;
    const locked = Date.parse(d.locked_at), kick = Date.parse(d.kickoff_time);
    if (!(locked >= since) || !(kick > now)) continue;
    const key = `pick:${d.sport}:${d.game_id}`;
    if (rec.sent[key]) continue;
    const other = side === d.home_team ? d.away_team : d.home_team;
    const s = d.market_snapshot || {};
    const h = impliedOf(s.moneyline_home), a = impliedOf(s.moneyline_away);
    const fair = h != null && a != null ? (side === d.home_team ? h : a) / (h + a) : null;
    const g = games.find(x => x.sport === d.sport && x.away === d.away_team && x.home === d.home_team &&
      Math.abs(Date.parse(x.kickoff) - kick) < 18 * 3600e3);
    out.push({key, tag: key, title: `DeVig pick: ${side} to beat ${other}`,
      body: `DeVig gives ${side} ${pct(d.decision.prob)}${fair != null ? `, Kalshi ${pct(fair)}` : ""}. ` +
        `${d.away_team} @ ${d.home_team}, ${when(d.kickoff_time, rec.prefs.tz)}.`,
      url: g ? gameUrl(g.sport, g.espn_id) : "/v2/",
      line: `${side} over ${other} ${pct(d.decision.prob)}${fair != null ? ` (Kalshi ${pct(fair)})` : ""}`});
  }
  return out;
}

// many picks in one sport → one alert for that sport, with a line per game; one pick stays as it was.
// Each pick keeps its own key (in `also`), so nothing is sent twice and a pick that didn't fit waits as before.
const SPORT_NAME = {NFL: "NFL", CFB: "college football", NBA: "NBA", CBB: "college basketball", MLB: "MLB"};
export function groupPicks(due) {
  const by = new Map(), rest = [];
  for (const m of due) {
    const sp = m.key && m.key.startsWith("pick:") ? m.key.split(":")[1] : null;
    if (!sp) { rest.push(m); continue; }
    if (!by.has(sp)) by.set(sp, []);
    by.get(sp).push(m);
  }
  const grouped = [...by.entries()].map(([sp, ms]) => ms.length === 1 ? ms[0] : {
    key: null, tag: `picks:${sp}`, url: "/v2/", also: ms,
    title: `${ms.length} new DeVig ${SPORT_NAME[sp] || sp} picks`,
    body: ms.map(m => m.line || m.title.replace(/^DeVig pick: /, "")).join("\n").slice(0, 400)});
  return [...grouped, ...rest];
}

// every Lab model that has passed something: [{key, sport, name, state}]
export function labPasses(status) {
  const out = [];
  const add = (sport, cands) => {
    for (const c of cands || []) {
      const exam = c.exam && c.exam.state === "passed" || c.state === "exam_pass";
      const lab = exam || c.state === "lab_pass";
      if (lab) out.push({key: `lab:${sport}:${c.id}:lab`, sport, name: c.name || c.id, state: "lab_pass"});
      if (exam) out.push({key: `lab:${sport}:${c.id}:exam`, sport, name: c.name || c.id, state: "exam_pass"});
    }
  };
  if (status) {
    add(status.sport || status.scope, status.candidates);
    for (const [sport, s] of Object.entries(status.by_sport || {})) add(sport, s && s.candidates);
  }
  return out;
}

export function labAlerts(rec, status) {
  const seen = new Set(rec.labSeen || []);
  return labPasses(status).filter(p => !seen.has(p.key) && !rec.sent[p.key]).map(p => ({key: p.key, tag: p.key,
    title: p.state === "exam_pass" ? `Lab model passed the sealed exam (${p.sport})` : `Lab model passed (${p.sport})`,
    body: p.state === "exam_pass"
      ? `${p.name} passed the sealed exam season it had never seen.`
      : `${p.name} passed the Lab's confirmation check. Not yet tested on the sealed exam.`,
    url: "/v2/#/models"}));
}

// price targets that are due; `done` = target ids to remove (fired, or the game started)
export function targetAlerts(rec, mkts, now) {
  const out = [], done = [];
  for (const t of rec.targets) {
    if (Date.parse(t.kickoff) <= now) { done.push(t.id); continue; }
    const odds = targetOdds(t, mkts[t.ticker]);
    if (odds == null || odds < t.odds) continue;
    const team = t.side === "draw" ? "The draw" : t.side === "home" ? t.home : t.away;
    done.push(t.id);
    out.push({key: `target:${t.id}`, tag: `target:${t.gid}`, title: `${team} is ${fmtOdds(odds)} on Kalshi`,
      body: `You asked for ${fmtOdds(t.odds)} or better. ${t.away} @ ${t.home}, ${when(t.kickoff, rec.prefs.tz)}.`,
      url: gameUrl(t.sport, t.gid)});
  }
  return {out, done};
}

// the games this person follows: a favorite team plays, or the game is ★ tracked (by ESPN id or the pick's game id)
export function followed(user, games, decisions) {
  const teams = (user && user.prefs && user.prefs.teams) || {}, tracked = (user && user.tracked && user.tracked.g) || {};
  const byPick = new Set();
  for (const d of decisions) if (tracked[d.game_id]) byPick.add(`${d.sport}|${d.away_team}|${d.home_team}|${Date.parse(d.kickoff_time)}`);
  const picked = g => [...byPick].some(k => {
    const [s, a, h, t] = k.split("|");
    return s === g.sport && a === g.away && h === g.home && Math.abs(Number(t) - Date.parse(g.kickoff)) < 18 * 3600e3;
  });
  return games.filter(g => {
    const fav = teams[g.sport] || [];
    return fav.includes(g.away) || fav.includes(g.home) || tracked[g.espn_id] || picked(g);
  });
}

// before the start, Kalshi's chance moved MOVE or more in MOVE_HOURS (and as much again since the last alert)
export function moveAlerts(rec, games, mkts, then, now) {
  const out = [];
  for (const g of games) {
    const t = Date.parse(g.kickoff);
    if (!(t > now) || t - now > 36 * 3600e3 || !g.home_ticker) continue;
    const p = fairHome(mkts[g.home_ticker]), p0 = then[g.home_ticker];
    if (p == null || p0 == null || Math.abs(p - p0) < MOVE) continue;
    const key = `move:${g.sport}:${g.espn_id}`, last = rec.sent[key];
    if (last && (now - last[0] < 3600e3 || Math.abs(p - last[1]) < MOVE)) continue;
    const up = p > p0, team = up ? g.home : g.away, from = up ? p0 : 1 - p0, to = up ? p : 1 - p;
    out.push({key, value: Math.round(p * 1000) / 1000, tag: key, title: `Line move: ${team} ${pct(from)} → ${pct(to)}`,
      body: `Kalshi's chance for ${team} moved ${Math.round(Math.abs(p - p0) * 100)} points in ${MOVE_HOURS} hours. ` +
        `${g.away} @ ${g.home}, ${when(g.kickoff, rec.prefs.tz)}.`, url: gameUrl(g.sport, g.espn_id)});
  }
  return out;
}

// a saved parlay: each leg that settled, its chance reaching the number picked, and the end.
// `update` = {id: parlay | null}: the parlay's new state (null = done, stop watching)
export function parlayAlerts(rec, mkts, now = Date.now()) {
  const out = [], update = {};
  // a leg the saved-parlay check (trackedLegs) already sent under its own parlay id isn't sent again here
  const legSent = new Set(Object.keys(rec.sent).filter(k => k.startsWith("leg:")).map(k => k.split(":").slice(2).join(":")));
  for (const p of rec.parlays) {
    const legs = p.legs.map(l => ({...l, q: mkts[l.ticker] ? priced(mkts[l.ticker], l.side) : null}));
    if (legs.some(l => !l.q)) continue;
    const won = legs.filter(l => l.q.result === "won").length, lost = legs.filter(l => l.q.result === "lost");
    const chance = legs.reduce((x, l) => (x == null || l.q.chance == null ? null : x * l.q.chance), 1);
    const name = p.label || `${legs.length}-leg parlay`, url = "/v2/#/history";
    if (p.settle) {
      for (const l of legs) {
        if (!l.q.result) continue;
        const key = `leg:${p.id}:${l.ticker}:${l.side}`;
        if (rec.sent[key] || legSent.has(`${l.ticker}:${l.side}`) || !settledLately(mkts[l.ticker], now)) continue;
        const what = l.label || l.q.pick;
        const rest = lost.length ? "The parlay is done." : won === legs.length ? "Every leg hit." :
          `${won} of ${legs.length} in${chance != null ? `, about ${pct(chance)} to hit now` : ""}.`;
        out.push({key, tag: `parlay:${p.id}`, title: `${name}: leg ${l.q.result === "won" ? "won" : "lost"}`,
          body: `${what}. ${rest}`, url});
      }
    }
    if (lost.length || won === legs.length) { update[p.id] = null; continue; }
    if (p.at != null && chance != null) {
      const rising = (p.from ?? 0) < p.at;
      if (rising ? chance >= p.at : chance <= p.at) {
        out.push({key: `pct:${p.id}:${p.at}:${p.from}`, tag: `parlay:${p.id}`,
          title: `${name} is at ${pct(chance)}`,
          body: `${rising ? "Up" : "Down"} to your ${pct(p.at)} mark, from Kalshi's prices multiplied (${won} of ${legs.length} legs in).`, url});
        update[p.id] = p.settle ? {...p, at: null} : null;
      }
    }
  }
  return {out, update};
}

// when Kalshi settled a market; a market without a time (older feeds, tests) counts as just settled
export function settledLately(m, now) {
  const t = Date.parse((m && (m.settlement_ts || m.close_time)) || "");
  return !isFinite(t) || now - t <= LEG_FRESH_H * 3600e3;
}

// ---------- the checker ----------
async function loadRec(env, hash) {
  const r = await env.USERS.get(`alerts:${hash}`, "json");
  return r && typeof r === "object" ? normal(r) : null;
}
function normal(r) {
  return {devices: r.devices || [], prefs: cleanPrefs(r.prefs), targets: r.targets || [], parlays: r.parlays || [],
    since: r.since || null, labSeen: r.labSeen || [], sent: r.sent || {}, day: r.day || "", writes: r.writes || 0,
    sends: r.sends || 0, sendDay: r.sendDay || "", savedAt: r.savedAt || 0};
}

// The edge cache remembers each alert sent, beside the KV record. KV reads can lag a write by a minute, and a failed
// write loses the "sent" marks, so a leg that stays won would otherwise go out on every run.
const memoReq = (h, key) => new Request(`${SITE}/__alerts_sent/${h}/${encodeURIComponent(key)}`);

export async function run(env, {fetcher = fetch, now = Date.now(), sender = send, memo = null} = {}) {
  const idx = (await env.USERS.get(INDEX, "json")) || {users: []};
  const people = [];
  for (const h of idx.users || []) {
    const rec = await loadRec(env, h);
    if (rec && rec.devices.length) people.push({h, rec});
  }
  const report = {people: people.length, sent: 0, gone: 0};
  if (!people.length) return report;
  const keys = {publicKey: VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY};

  const any = f => people.some(({rec}) => f(rec));
  const wantsLive = rec => LIVE_PREFS.some(k => k !== "legs" && rec.prefs.live[k]);
  const needPicks = any(r => r.prefs.picks.length), needMoves = any(r => r.prefs.moves);
  const needLive = any(wantsLive), needLegs = any(r => r.prefs.live.legs);
  const games = await raw("live/game_lines.json", fetcher, now).then(d => d.games || []).catch(() => []);
  const decisions = needPicks || needMoves || needLive ? await boards(fetcher, now) : [];
  const status = any(r => r.prefs.lab) ? await raw("research/status.json", fetcher, now).catch(() => null) : null;
  const users = {};
  for (const {h, rec} of people)
    if (rec.prefs.moves || wantsLive(rec) || rec.prefs.live.legs) users[h] = await env.USERS.get(`user:${h}`, "json");
  const follows = {};
  for (const {h, rec} of people) follows[h] = rec.prefs.moves ? followed(users[h], games, decisions) : [];

  const tickers = [];
  for (const {h, rec} of people) {
    rec.targets.forEach(t => tickers.push(t.ticker));
    rec.parlays.forEach(p => p.legs.forEach(l => tickers.push(l.ticker)));
    follows[h].forEach(g => g.home_ticker && tickers.push(g.home_ticker));
    if (rec.prefs.live.legs) for (const p of Object.values((users[h] && users[h].tracked && users[h].tracked.parlays) || {}))
      if (p && !p.removed && Array.isArray(p.legs)) p.legs.forEach(l => l && l.ticker && tickers.push(String(l.ticker).toUpperCase()));
  }
  const mkts = tickers.length ? await markets(tickers, fetcher).catch(() => ({})) : {};
  const then = {};
  for (const t of new Set(Object.values(follows).flat().filter(g => Date.parse(g.kickoff) > now).map(g => g.home_ticker).filter(Boolean)))
    then[t] = await before(t, fetcher, now).catch(() => null);

  // live games: each person's games that are on or just ended, each read once from ESPN however many follow it
  const onNow = g => LIVE_SPORTS.includes(g.sport) && g.espn_id && Date.parse(g.kickoff) <= now + 5 * 60e3 &&
    now - Date.parse(g.kickoff) < 6 * 3600e3;
  const liveOf = {};
  for (const {h, rec} of people) liveOf[h] = wantsLive(rec) ? mine(users[h], rec, games.filter(onNow), decisions) : [];
  const wanted = [...new Map(Object.values(liveOf).flat().map(g => [`${g.sport}:${g.espn_id}`, g])).values()]
    .sort((a, b) => (a.state === "in" ? 0 : 1) - (b.state === "in" ? 0 : 1)).slice(0, MAX_LIVE_GAMES);
  const events = {};
  for (const g of wanted) {
    const sp = g.sport.toLowerCase(), kind = KIND[sp];
    try {
      const d = await cachedJson(`${ESPN}${SPORTS[sp]}/summary?event=${encodeURIComponent(g.espn_id)}`, LIVE_TTL, fetcher);
      const code = teamCode(sp), st = statusOf(d, code);
      const plays = kind === "football" || kind === "hoops" ? (GAME[kind](d, code).plays || []) : [];
      events[`${g.sport}:${g.espn_id}`] = gameEvents({sport: sp, id: g.espn_id, kind, kickoff: g.kickoff}, st, plays, now);
    } catch (e) { /* one game's feed down doesn't stop the rest */ }
  }
  report.live = Object.keys(events).length;

  const day = new Date(now).toISOString().slice(0, 10);
  let indexChanged = false;
  for (const {h, rec} of people) {
    const targets = targetAlerts(rec, mkts, now), parlays = parlayAlerts(rec, mkts, now);
    const live = [];
    for (const g of liveOf[h]) {
      const evs = events[`${g.sport}:${g.espn_id}`];
      if (!evs) continue;
      const base = `ls:${g.sport.toLowerCase()}:${g.espn_id}:`;
      let used = Object.keys(rec.sent).filter(k => k.startsWith(base) && !k.endsWith(":final")).length;
      for (const m of compose(evs, rec.prefs.live, {sport: g.sport.toLowerCase(), url: gameUrl(g.sport, g.espn_id)})) {
        if (rec.sent[m.key] || (!m.final && used >= PER_GAME)) continue;
        if (!m.final) used++;
        live.push({...m, tag: m.key, live: true});
      }
    }
    const legs = rec.prefs.live.legs ? trackedLegs(users[h], mkts, priced, now, rec.sent, m => settledLately(m, now))
      .filter(m => !parlays.out.some(x => x.key && x.key.split(":").slice(2).join(":") === m.key.split(":").slice(2).join(":"))) : [];
    let due = [...live, ...legs, ...targets.out, ...parlays.out,
      ...(rec.prefs.lab ? labAlerts(rec, status) : []),
      ...pickAlerts(rec, decisions, games, now),
      ...(rec.prefs.moves ? moveAlerts(rec, follows[h], mkts, then, now) : [])];
    // already sent, as the edge cache remembers it: not again, and the mark goes back into KV
    const memoHit = [];
    if (memo) due = (await Promise.all(due.map(async m => (m.key && await memo.match(memoReq(h, m.key)).catch(() => null) ? (memoHit.push(m), null) : m))))
      .filter(Boolean);
    if (isQuiet(rec.prefs, now)) due = [];
    due = groupPicks(due);                     // one alert per sport for new picks, not one per game     // quiet hours: what's still due after goes then; live moments pass
    const sends = rec.sendDay === day ? rec.sends : 0;
    const room = Math.max(0, Math.min(PER_RUN, SENDS_PER_DAY - sends));
    // more than fits: the rest wait for the next run (picks and moves stay due), except into one summary when many
    if (due.length > room && room > 0) {
      const extra = due.slice(room - 1);
      due = [...due.slice(0, room - 1), {key: null, tag: "devig:more", title: `${extra.length} more DeVig alerts`,
        body: extra.map(m => m.title).join(" · ").slice(0, 300), url: "/v2/", also: extra.flatMap(m => m.also || [m])}];
    } else due = due.slice(0, room);
    const sentKeys = memoHit.map(m => [m.key, m.value ?? null]), dead = new Set();
    let count = 0;
    for (const m of due) {
      let ok = false;
      for (const d of rec.devices) {
        if (dead.has(d.endpoint)) continue;
        let st = 0;
        try {
          st = await sender(d, {title: m.title, body: m.body, url: m.url, tag: m.tag}, keys,
            {fetcher, now, urgency: m.live || (m.key && m.key.startsWith("pick:")) || (m.tag && m.tag.startsWith("picks:")) ? "high" : "normal", ...(m.live ? {ttl: 600} : {})});
        } catch (e) { st = 0; }
        if (st === 404 || st === 410) dead.add(d.endpoint);
        else if (st >= 200 && st < 300) ok = true;
      }
      if (ok) for (const x of m.also || [m]) if (x.key) {
        sentKeys.push([x.key, x.value ?? null]);
        if (memo) await memo.put(memoReq(h, x.key), new Response("1", {headers: {"cache-control": `max-age=${MEMO_S}`}})).catch(() => {});
      }
      if (ok) { report.sent++; count++; }
    }
    report.gone += dead.size;
    const removed = new Set(targets.done);
    if (!sentKeys.length && !dead.size && !removed.size && !Object.keys(parlays.update).length) continue;
    try {
    // write onto a fresh copy so a setting saved during this run isn't lost
    const fresh = (await loadRec(env, h)) || rec;
    for (const [k, v] of sentKeys) fresh.sent[k] = [now, v];
    for (const k of Object.keys(fresh.sent)) if (now - fresh.sent[k][0] > SENT_DAYS * 86400e3) delete fresh.sent[k];
    // a target or parlay alert that didn't go out (no device answered) stays for the next run
    const firedT = new Set(sentKeys.map(([k]) => k).filter(k => k.startsWith("target:")).map(k => k.slice(7)));
    fresh.targets = fresh.targets.filter(t => !removed.has(t.id) || (Date.parse(t.kickoff) > now && !firedT.has(t.id)));
    // a parlay that's done (or whose % alert went out) changes only once everything it had due was sent
    fresh.parlays = fresh.parlays.flatMap(p => {
      if (!(p.id in parlays.update)) return [p];
      if (parlays.out.some(m => m.tag === `parlay:${p.id}` && m.key && !fresh.sent[m.key])) return [p];
      const u = parlays.update[p.id];
      return u ? [u] : [];
    });
    fresh.devices = fresh.devices.filter(d => !dead.has(d.endpoint));
    fresh.sends = (fresh.sendDay === day ? fresh.sends : 0) + count;
    fresh.sendDay = day;
    if (!fresh.devices.length) { idx.users = idx.users.filter(x => x !== h); indexChanged = true; }
    await env.USERS.put(`alerts:${h}`, JSON.stringify(fresh));
    } catch (e) {
      // the sends happened; the edge cache still holds them. Said in the report so the timer logs it
      report.errors = [...(report.errors || []), `save ${h.slice(0, 6)}: ${String((e && e.message) || e).slice(0, 120)}`];
    }
  }
  if (indexChanged) await env.USERS.put(INDEX, JSON.stringify(idx)).catch(e => { report.errors = [...(report.errors || []), `index: ${e}`]; });
  return report;
}

// ---------- the settings ----------
async function view(rec, env) {
  return {key: VAPID_PUBLIC_KEY, ready: !!env.VAPID_PRIVATE_KEY, prefs: rec.prefs, targets: rec.targets,
    parlays: rec.parlays, devices: await Promise.all(rec.devices.map(async d => ({id: await hashOf(d.endpoint), at: d.at, name: d.name})))};
}

export async function handle(request, env, {fetcher = fetch, now = Date.now(), sender = send, cache} = {}) {
  if (!env.USERS) return json({error: "accounts are not set up yet"}, 503);
  const url = new URL(request.url);

  if (url.searchParams.get("run") === "1") {
    if (request.method !== "POST") return json({error: "method not allowed"}, 405);
    if (!env.VAPID_PRIVATE_KEY) return json({error: "alerts are not set up yet"}, 503);
    if (env.ALERTS_RUN_KEY && request.headers.get("x-run-key") !== env.ALERTS_RUN_KEY) return json({error: "not allowed"}, 403);
    // at most once every RUN_GAP_S when open; with the key, once every RUN_GAP_KEYED_S, so the minute timer and the
    // price bots landing together don't both send the same moment
    const c = cache === undefined ? (typeof caches !== "undefined" ? caches.default : null) : cache;
    const lock = new Request(`${SITE}/__alerts_run_lock`), gap = env.ALERTS_RUN_KEY ? RUN_GAP_KEYED_S : RUN_GAP_S;
    if (!env.ALERTS_RUN_KEY || c) {
      if (c ? await c.match(lock) : now - memRuns.at < gap * 1000) return json({ok: true, skipped: "ran recently"});
      // held while the run is on (a slow run isn't overlapped by the next tick), then for what's left of the gap
      if (c) await c.put(lock, new Response("1", {headers: {"cache-control": `max-age=${RUN_HOLD_S}`}}));
      memRuns.at = now;
    }
    const t0 = Date.now();
    let report;
    try { report = await run(env, {fetcher, now, sender, memo: c}); }
    finally {
      const left = Math.ceil(gap - (Date.now() - t0) / 1000);
      if (c) await (left > 0 ? c.put(lock, new Response("1", {headers: {"cache-control": `max-age=${left}`}})) : c.delete(lock)).catch(() => {});
    }
    return json({ok: !report.errors, ...report}, report.errors ? 500 : 200);
  }

  const email = await accessUser(request, env, fetcher);
  if (!email) return json({error: "not signed in"}, 401);
  const key = await userKey(email), h = key.slice(5);
  const user = await env.USERS.get(key, "json");
  if (!(user && user.joined_at)) return json({error: "invite code needed"}, 403);
  const rec = (await loadRec(env, h)) || normal({});

  if (request.method === "GET") return json(await view(rec, env));
  if (request.method !== "POST") return json({error: "method not allowed"}, 405);

  const text = await request.text();
  if (text.length > 20000) return json({error: "too large"}, 413);
  let b;
  try { b = JSON.parse(text); } catch (e) { return json({error: "not JSON"}, 400); }
  const op = b && b.op;

  if (op === "test") {
    if (!env.VAPID_PRIVATE_KEY) return json({error: "alerts are not set up yet"}, 503);
    if (!rec.devices.length) return json({error: "no device has alerts on"}, 400);
    const keys = {publicKey: VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY};
    const results = [];
    for (const d of rec.devices) {
      let st = 0;
      try {
        st = await sender(d, {title: "DeVig alerts are on", body: "This is how a DeVig alert looks. Tap it to open the app.",
          url: "/v2/#/profile", tag: "devig:test"}, keys, {fetcher, now, ttl: 600});
      } catch (e) { st = 0; }
      results.push(st);
    }
    return json({ok: results.some(s => s >= 200 && s < 300), results});
  }

  const dayNow = new Date(now).toISOString().slice(0, 10);
  const writes = rec.day === dayNow ? rec.writes : 0;
  if (writes >= SAVES_PER_DAY) return json({error: "daily save limit reached"}, 429);
  if (now - (rec.savedAt || 0) < SAVE_GAP_MS) return json({error: "slow down", retry_ms: SAVE_GAP_MS}, 429);

  if (op === "device") {
    const s = b.sub || {}, k = s.keys || {};
    if (!endpointOk(s.endpoint) || !keysOk(k.p256dh, k.auth)) return json({error: "not a push subscription"}, 400);
    rec.devices = [{endpoint: s.endpoint, p256dh: k.p256dh, auth: k.auth, at: new Date(now).toISOString(), name: str(b.name, 40)},
      ...rec.devices.filter(d => d.endpoint !== s.endpoint)].slice(0, MAX_DEVICES);
    if (!rec.since) {
      rec.since = new Date(now).toISOString();
      // Lab models that passed before alerts were on aren't news
      const status = await raw("research/status.json", fetcher, now).catch(() => null);
      rec.labSeen = labPasses(status).map(p => p.key);
    }
    if (b.prefs) rec.prefs = cleanPrefs(b.prefs, rec.prefs);
    const idx = (await env.USERS.get(INDEX, "json")) || {users: []};
    if (!idx.users.includes(h)) { idx.users.push(h); await env.USERS.put(INDEX, JSON.stringify(idx)); }
  } else if (op === "forget") {
    rec.devices = rec.devices.filter(d => d.endpoint !== String(b.endpoint || ""));
  } else if (op === "prefs") {
    rec.prefs = cleanPrefs(b.prefs, rec.prefs);
  } else if (op === "target") {
    const t = cleanTarget(b.target);
    if (!t || Date.parse(t.kickoff) <= now) return json({error: "not a price target"}, 400);
    rec.targets = [...rec.targets.filter(x => !(x.ticker === t.ticker && x.side === t.side)), t].slice(-MAX_TARGETS);
  } else if (op === "untarget") {
    rec.targets = rec.targets.filter(t => t.id !== b.id);
  } else if (op === "parlay") {
    const p = cleanParlay(b.parlay);
    if (!p || !p.id) return json({error: "not a parlay alert"}, 400);
    rec.parlays = [...rec.parlays.filter(x => x.id !== p.id), p].slice(-MAX_PARLAYS);
  } else if (op === "unparlay") {
    rec.parlays = rec.parlays.filter(p => p.id !== b.id);
  } else return json({error: "unknown op"}, 400);

  Object.assign(rec, {day: dayNow, writes: writes + 1, savedAt: now});
  await env.USERS.put(`alerts:${h}`, JSON.stringify(rec));
  return json({ok: true, ...(await view(rec, env))});
}

export async function onRequest(context) {
  return handle(context.request, context.env);
}
