// DeVig on the TV: what the living-room score dock shows (functions/api/tv.js serves it to the launcher on the TV).
//
// A person's open bets (★ tracked parlays and saved Kalshi links / DeVig slips that haven't ended) are read leg by
// leg against ESPN's scoreboard and box scores, the same way the parlay review does (web/src/lib/review.ts parseLeg),
// so the TV only draws. A leg's state comes from the game itself:
//   - an over-style prop (and a Yes on Kalshi's "20+ points") is "won" the moment the box score passes the line, and
//     goes back to "live" if ESPN later takes a stat away; it's "lost" only once the game is final
//   - an under, a moneyline, a spread or a total keeps showing progress ("up 6") until the final decides it
//   - Kalshi's own settlement, when it has one, wins over all of that
//   - a leg that can't be matched to a game or a player is "unknown", never a guess
// Display only: nothing here is a bet or advice.

import { ESPN, SPORTS, cachedJson, scoreboard, nbaBox, nflBox, teamCode } from "../api/live.js";

export const SETTINGS = {
  show: ["bets", "teams", "all"],          // only games with my legs / also ★ teams / also every live game
  pos: ["corner", "bar"],
  delay: [0, 15, 30, 45, 60],              // seconds the TV holds each update, so it matches the stream
};
export const SPORT_LIST = ["nfl", "nba", "cfb", "cbb", "nhl"];
export const DEFAULTS = {show: "teams", sports: ["nfl", "nba"], delay: 30, pos: "corner",
  props: true, lost: true, close: true, settled: true, auto: true, quiet: true};

export function cleanSettings(s) {
  s = s && typeof s === "object" ? s : {};
  const out = {...DEFAULTS};
  if (SETTINGS.show.includes(s.show)) out.show = s.show;
  if (SETTINGS.pos.includes(s.pos)) out.pos = s.pos;
  if (SETTINGS.delay.includes(Number(s.delay))) out.delay = Number(s.delay);
  if (Array.isArray(s.sports)) out.sports = SPORT_LIST.filter(x => s.sports.includes(x));
  for (const k of ["props", "lost", "close", "settled", "auto", "quiet"]) if (typeof s[k] === "boolean") out[k] = s[k];
  return out;
}

// ---------- legs ----------
const LEAGUES = [["KXNCAAMB", "cbb"], ["KXNCAAF", "cfb"], ["KXWNBA", "wnba"], ["KXNFL", "nfl"], ["KXNBA", "nba"], ["KXNHL", "nhl"], ["KXMLB", "mlb"]];
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const FAMILY = {nfl: "football", cfb: "football", nba: "basketball", wnba: "basketball", cbb: "basketball", nhl: "hockey"};
// Kalshi's stat in the series name -> the box score's stat (live.js nbaBox / nflBox names)
const KSTAT = {
  football: {PASSYDS: "passing_yards", PASSTDS: "passing_tds", PASSCOMP: "passing_completions", PASSINT: "interceptions",
    RSHYDS: "rushing_yards", RSHATT: "rushing_attempts", RECYDS: "receiving_yards", REC: "receptions", RRYDS: "rush_rec_yards", TD: "touchdowns"},
  basketball: {PTS: "points", REB: "rebounds", AST: "assists", "3PT": "threes", STL: "steals", BLK: "blocks",
    PRA: "pts_reb_ast", PR: "pts_reb", PA: "pts_ast", RA: "reb_ast"},
  hockey: {GOAL: "goals", AST: "assists", PTS: "points", SOG: "shots"},
};
// DeVig's prop names that differ from the box score's
const STAT_ALIAS = {pass_yds: "passing_yards", rush_yds: "rushing_yards", rec_yds: "receiving_yards"};
const SHORT = {points: "pts", rebounds: "reb", assists: "ast", threes: "3PM", steals: "stl", blocks: "blk", pts_reb_ast: "PRA",
  pts_reb: "pts+reb", pts_ast: "pts+ast", reb_ast: "reb+ast", passing_yards: "pass yds", passing_tds: "pass TD",
  passing_completions: "comp", interceptions: "INT", rushing_yards: "rush yds", rushing_attempts: "carries",
  receiving_yards: "rec yds", receptions: "rec", rush_rec_yards: "rush+rec yds", touchdowns: "TD", goals: "goals", shots: "SOG"};
const num = x => { const v = parseFloat(x); return isFinite(v) ? v : null; };

// a Kalshi leg ({ticker, event, title, side, result, strike}, as functions/api/kalshi.js priced() gives it)
export function kalshiLeg(k) {
  const title = String(k.title || k.pick || k.ticker || "").replace(/\?$/, "").replace(/^Full Game: /i, "");
  const base = {label: (k.side === "no" ? "No: " : "") + title, ticker: k.ticker || null, side: k.side === "no" ? "no" : "yes",
    result: k.result === "won" || k.result === "lost" ? k.result : null, sport: null, kind: "other"};
  const ev = String(k.event || String(k.ticker || "").split("-").slice(0, 2).join("-"));
  const m = /^([A-Z0-9]+)-(\d{2})([A-Z]{3})(\d{2})([A-Z][A-Z0-9]*)$/.exec(ev);
  if (!m) return base;
  const [, series, yy, mon, dd, teams] = m;
  const lg = LEAGUES.find(([p]) => series.startsWith(p)), mi = MONTHS.indexOf(mon);
  if (!lg || mi < 0) return base;
  const rest = series.slice(lg[0].length).replace(/PROT$/, "");
  const tail = String(k.ticker || "").split("-").slice(2).join("-");
  const sOf = num(/(\d+(?:\.\d+)?)\+/.exec(k.title || "")?.[1]);
  const strike = k.strike != null ? num(k.strike) : sOf != null ? sOf - 0.5 : null;
  const out = {...base, sport: lg[1], date: `20${yy}-${String(mi + 1).padStart(2, "0")}-${dd}`, teams, strike};
  if (rest === "GAME") return {...out, kind: "game", team: tail || null, strike: null, label: tail ? `${k.side === "no" ? "No: " : ""}${tail} to win` : base.label};
  if (rest === "SPREAD") return {...out, kind: "spread", team: tail.replace(/\d+$/, "") || null};
  if (rest === "TOTAL") return {...out, kind: "total"};
  const stat = (KSTAT[FAMILY[lg[1]]] || {})[rest];
  if (stat) {
    const player = (k.title || "").split(":")[0].trim() || null;
    return {...out, kind: "prop", stat, player, label: propLabel(player, stat, strike, out.side)};
  }
  return out;
}

// a leg of a ★ tracked parlay (web/src/lib/track.ts TrackedLeg)
// a saved Polymarket side ("pm:nba-det-mia-2026-11-14-spread-away-4pt5~1", read by lib/polymarket.js) -> a dock leg.
// The game comes from the slug (league, the two teams away then home, the day); the kind from its tail, the line
// from the side's own words ("Heat +4.5", "Under 231.5"). Side 0 is the first team in the slug.
const PM_SPORTS = {nba: "nba", nfl: "nfl", nhl: "nhl", mlb: "mlb", wnba: "wnba", cfb: "cfb", cbb: "cbb"};
export function polyLeg(k) {
  const m = /^pm:([a-z0-9-]+)~([01])$/.exec(String(k.ticker || ""));
  const words = String(k.title || k.pick || "Polymarket bet");
  const base = {label: (k.side === "no" ? "No: " : "") + words, ticker: k.ticker || null, side: k.side === "no" ? "no" : "yes",
    result: k.result === "won" || k.result === "lost" ? k.result : null, sport: null, kind: "other"};
  if (!m) return base;
  const g = /^([a-z]+)-([a-z0-9]{2,5})-([a-z0-9]{2,5})-(\d{4}-\d{2}-\d{2})(?:-(.*))?$/.exec(m[1]);
  if (!g || !PM_SPORTS[g[1]]) return base;
  const [, lg, away, home, date, tail = ""] = g, i = Number(m[2]);
  const team = (i === 0 ? away : home).toUpperCase();
  const out = {...base, sport: PM_SPORTS[lg], date, teams: (away + home).toUpperCase()};
  const line = num(/([+-]?\d+(?:\.\d+)?)\s*$/.exec(words)?.[1]);
  if (!tail) return {...out, kind: "game", team, label: `${team} to win`};
  if (/^spread/.test(tail) && line != null) return {...out, kind: "spread", team, strike: -line};
  if (/^total/.test(tail) && line != null) return {...out, kind: "total", strike: line, side: /^under/i.test(words) ? "no" : "yes"};
  return out;
}

export function trackedLeg(l) {
  const sport = String(l.sport || "").toLowerCase() || null;
  const base = {label: String(l.desc || "").slice(0, 60), ticker: l.ticker || null, sport, away: l.away || null, home: l.home || null,
    kickoff: l.kickoff || null, side: "yes", result: null, kind: "other"};
  if (l.mk === "prop" && l.player && l.stat && num(l.line) != null) {
    const stat = STAT_ALIAS[l.stat] || l.stat, side = l.side === "UNDER" ? "no" : "yes";
    return {...base, kind: "prop", player: l.player, stat, strike: num(l.line), side, label: propLabel(l.player, stat, num(l.line), side)};
  }
  const team = l.side === "home" ? l.home : l.side === "away" ? l.away : null;
  if (l.mk === "ml" && team) return {...base, kind: "game", team, label: `${team} to win`};
  return base;
}

const lastName = p => String(p || "").split(" ").filter(Boolean).slice(1).join(" ") || String(p || "");
function propLabel(player, stat, strike, side) {
  const s = SHORT[stat] || String(stat).replace(/_/g, " ");
  if (strike == null) return `${lastName(player)} ${s}`;
  return side === "no" ? `${lastName(player)} under ${strike} ${s}` : `${lastName(player)} ${Math.floor(strike) + 1}+ ${s}`;
}

// ---------- matching legs to games and players ----------
// Kalshi and ESPN spell a few teams differently (same list as web/src/lib/review.ts)
const SYN = [["JAX", "JAC"], ["LA", "LAR"], ["WAS", "WSH"], ["GSW", "GS"], ["NOP", "NO"], ["NYK", "NY"], ["SAS", "SA"], ["UTA", "UTAH"],
  ["PHX", "PHO"], ["BKN", "BRK"], ["CHA", "CHO"], ["LV", "LVR"], ["NJ", "NJD"], ["SJ", "SJS"], ["MTL", "MON"], ["CBJ", "CLS"], ["VGK", "VEG"], ["TB", "TBL"]];
const codes = c => [c, ...SYN.filter(g => g.includes(c)).flat().filter(x => x !== c)];
const same = (a, b) => !!a && !!b && codes(String(a).toUpperCase()).includes(String(b).toUpperCase());
// the game's day in US Eastern time, as Kalshi's tickers date it
const etDay = iso => { const t = Date.parse(iso); return isFinite(t) ? new Date(t - 5 * 3600e3).toISOString().slice(0, 10) : null; };
const dayGap = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400e3;

export function findGame(leg, games) {
  if (!leg.sport) return null;
  const list = games.filter(g => g.sport === leg.sport);
  if (leg.away && leg.home) {
    return list.find(g => same(leg.away, g.away) && same(leg.home, g.home) &&
      (!leg.kickoff || Math.abs(Date.parse(leg.kickoff) - Date.parse(g.kickoff)) < 18 * 3600e3)) || null;
  }
  if (!leg.teams) return null;
  return list.find(g => {
    if (leg.date && etDay(g.kickoff) && dayGap(leg.date, etDay(g.kickoff)) > 1) return false;
    for (let i = 2; i < leg.teams.length - 1; i++) {
      const a = leg.teams.slice(0, i), h = leg.teams.slice(i);
      if (same(a, g.away) && same(h, g.home)) return true;
    }
    return false;
  }) || null;
}

const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, "").replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
export function findPlayer(name, box) {
  if (!name || !box) return null;
  const want = norm(name), keys = Object.keys(box);
  const exact = keys.find(k => norm(k) === want);
  if (exact) return box[exact];
  // "C. McCaffrey" or a nickname: the last name and first initial, only when exactly one player fits
  const [first, ...rest] = want.split(" "), last = rest.join(" ");
  const fits = keys.filter(k => { const n = norm(k).split(" "); return n.slice(1).join(" ") === last && n[0][0] === first[0]; });
  return fits.length === 1 ? box[fits[0]] : null;
}

export function statValue(s, stat) {
  if (!s) return null;
  const v = k => num(s[k]);
  const sum = (...k) => (k.some(x => v(x) == null) ? null : k.reduce((a, x) => a + v(x), 0));
  if (stat === "pts_reb") return sum("points", "rebounds");
  if (stat === "pts_ast") return sum("points", "assists");
  if (stat === "reb_ast") return sum("rebounds", "assists");
  if (stat === "pts_reb_ast") return v("pts_reb_ast") ?? sum("points", "rebounds", "assists");
  return v(stat);
}

// ---------- a leg's state now ----------
// {state: pre|live|won|lost|unknown, now?, need?, note}
export function legState(leg, game, box) {
  const flip = r => (leg.side === "no" ? (r === "won" ? "lost" : "won") : r);
  if (leg.result) return {state: leg.result, note: leg.result === "won" ? "hit" : "missed"};
  if (!game) return {state: "unknown", note: "?"};
  if (game.state === "pre") return {state: "pre", note: "not started"};
  const post = game.state === "post";
  if (leg.kind === "prop") {
    if (leg.strike == null) return {state: "unknown", note: "?"};
    const p = findPlayer(leg.player, box), v = statValue(p, leg.stat);
    const need = leg.side === "no" ? `under ${leg.strike}` : `${Math.floor(leg.strike) + 1}+`;
    if (v == null) return post || box ? {state: post ? "unknown" : "live", now: post ? null : 0, need, note: post ? "?" : `0 of ${need}`} : {state: "live", need, note: "live"};
    const over = v > leg.strike;
    if (leg.side === "yes" && over) return {state: "won", now: v, need, note: String(v)};
    if (leg.side === "no" && over) return {state: "lost", now: v, need, note: String(v)};
    if (post) return {state: leg.side === "yes" ? "lost" : "won", now: v, need, note: String(v)};
    return {state: "live", now: v, need, note: `${v} of ${need}`};
  }
  const a = game.away_score, h = game.home_score;
  if (a == null || h == null) return {state: "unknown", note: "?"};
  if (leg.kind === "game" || leg.kind === "spread") {
    const mine = same(leg.team, game.home) ? h - a : same(leg.team, game.away) ? a - h : null;
    if (mine == null) return {state: "unknown", note: "?"};
    const need = leg.kind === "spread" && leg.strike != null ? leg.strike : 0;
    const note = mine > 0 ? `up ${mine}` : mine < 0 ? `down ${-mine}` : "tied";
    if (post) return {state: flip(mine > need ? "won" : "lost"), note};
    return {state: "live", note};
  }
  if (leg.kind === "total" && leg.strike != null) {
    const t = a + h, need = `${Math.floor(leg.strike) + 1}+`;
    if (leg.side === "yes" && t > leg.strike) return {state: "won", now: t, need, note: `${t} total`};
    if (leg.side === "no" && t > leg.strike) return {state: "lost", now: t, need, note: `${t} total`};
    if (post) return {state: flip("lost"), now: t, need, note: `${t} total`};
    return {state: "live", now: t, need, note: `${t} of ${need}`};
  }
  return {state: "unknown", note: "?"};
}

// ---------- open bets ----------
const americanPays = (stake, odds) => (stake > 0 && odds ? +(stake * (odds > 0 ? odds / 100 + 1 : 100 / -odds + 1)).toFixed(2) : null);
const OPEN_H = 16;     // a bet stays on the TV this many hours after its last leg's start
const DONE_H = 4;      // ...or until its games are all final and the latest started this long ago

// ★ tracked parlays, logged bets and saved links that may still be going: {id, label, stake, pays, legs?, link?}
export function openBets(user, now) {
  const out = [];
  const ps = Object.entries(((user && user.tracked) || {}).parlays || {});
  for (const [id, p] of ps) {
    if (!p || p.removed || !Array.isArray(p.legs) || !p.legs.length) continue;
    const ks = p.legs.map(l => Date.parse(l.kickoff || "")).filter(isFinite);
    const last = ks.length ? Math.max(...ks) : Date.parse(p.at || "");
    if (!isFinite(last) || now - last > OPEN_H * 3600e3) continue;
    out.push({id: `p:${id}`, label: `${p.legs.length}-leg parlay`, stake: num(p.stake), pays: americanPays(num(p.stake), num(p.odds)),
      legs: p.legs.slice(0, 12).map(trackedLeg)});
  }
  // bets typed into the bet log (functions/api/me.js cleanBets): one team to win, at a book's odds
  const logged = Object.values(((user && user.bets) || {}).bets || {});
  for (const x of logged) {
    if (!x || x.removed || (x.side !== "home" && x.side !== "away") || !x.away || !x.home) continue;
    const k = Date.parse(x.kickoff || "");
    if (!isFinite(k) || now - k > OPEN_H * 3600e3) continue;
    const team = x.side === "home" ? x.home : x.away, odds = num(x.odds);
    out.push({id: `b:${x.id}`, label: `${team} ${odds > 0 ? "+" : ""}${odds}${x.book ? ` · ${String(x.book).slice(0, 16)}` : ""}`,
      stake: num(x.stake), pays: americanPays(num(x.stake), odds),
      legs: [trackedLeg({desc: `${team} ML`, mk: "ml", side: x.side, sport: x.sport, away: x.away, home: x.home, kickoff: x.kickoff})]});
  }
  const items = ((user && user.saved) || {}).items || [];
  for (const s of items) {
    if (!s || typeof s.link !== "string" || s.outcome) continue;
    const at = Date.parse(s.savedAt || "");
    if (!isFinite(at) || now - at > 4 * 86400e3) continue;
    out.push({id: `s:${s.link.slice(0, 80)}`, label: String(s.label || "Saved bet").slice(0, 40), link: s.link, at,
      stake: s.bet ? num(s.bet.stake) : null, pays: s.bet ? num(s.bet.pays) : null});
  }
  return out.slice(0, 24);
}

// ---------- the whole dock ----------
// readKalshi(ticker) -> functions/api/kalshi.js read() shape; parse(link) -> ticker (kalshi.js parseLink)
export async function buildFeed({user, settings, now, fetcher = fetch, readKalshi, parseLink, readPoly = async () => null}) {
  const set = cleanSettings(settings);
  const bets = openBets(user, now);
  // saved Kalshi links / DeVig slips: their legs from Kalshi (cached by the caller)
  for (const b of bets) {
    if (b.legs || !b.link) continue;
    try {
      if (b.link.startsWith("slip:")) {
        const parts = b.link.slice(5).split(",").map(x => x.split("~")).filter(([t]) => t).slice(0, 12);
        b.legs = [];
        for (const [t, side] of parts) {
          const d = await readKalshi(t);
          if (!d || d.kind !== "market") continue;
          const m = d.market, no = side === "no";
          b.legs.push(kalshiLeg({...m, side: no ? "no" : "yes", result: no ? (m.result === "won" ? "lost" : m.result === "lost" ? "won" : null) : m.result}));
        }
      } else if (b.link.startsWith("pm:") || /polymarket\.us\//i.test(b.link)) {
        const d = await readPoly(b.link);
        b.legs = d && d.kind === "market" ? [polyLeg(d.market)] : d && d.kind === "combo" ? d.legs.map(polyLeg) : [];
      } else {
        const t = parseLink(b.link), d = t ? await readKalshi(t) : null;
        b.legs = d && d.kind === "combo" ? d.legs.map(kalshiLeg) : d && d.kind === "market" ? [kalshiLeg(d.market)] : [];
      }
    } catch (e) { b.legs = []; }
  }
  const live = bets.filter(b => b.legs && b.legs.length);
  const teams = (user && user.prefs && user.prefs.teams) || {};
  const favOf = (sport, code) => (teams[sport.toUpperCase()] || []).some(t => same(t, code));

  const sports = new Set(live.flatMap(b => b.legs.map(l => l.sport)).filter(s => SPORTS[s]));
  if (set.show !== "bets") for (const s of set.sports) sports.add(s);
  const games = [];
  for (const s of sports) {
    const q = s === "cfb" ? "?groups=80&limit=500" : s === "cbb" ? "?groups=50&limit=500" : "";
    try { games.push(...scoreboard(await cachedJson(`${ESPN}${SPORTS[s]}/scoreboard${q}`, 5, fetcher), s).map(g => ({...g, sport: s}))); }
    catch (e) { /* that sport's scores are missing this time; its legs show "?" */ }
  }

  // box scores for games with a prop leg that has started
  const boxes = {}, withProps = new Set();
  for (const b of live) for (const l of b.legs) {
    l.game = findGame(l, games);
    if (l.kind === "prop" && l.game && l.game.state !== "pre") withProps.add(l.game);
  }
  for (const g of withProps) {
    const kind = FAMILY[g.sport];
    if (kind !== "football" && kind !== "basketball") continue;
    try {
      const d = await cachedJson(`${ESPN}${SPORTS[g.sport]}/summary?event=${g.id}`, g.state === "post" ? 300 : 6, fetcher);
      boxes[g.id] = kind === "football" ? nflBox(d) : nbaBox(d);
    } catch (e) { /* stays live without a number */ }
  }

  // a bet whose games are all over leaves the dock (saved links would otherwise sit there for 4 days)
  const over = b => {
    if (b.legs.some(l => !l.result && !(l.game && l.game.state === "post"))) {
      // a leg still to go, unless it's a saved link whose games aren't on any board: those are from an earlier day
      return b.at != null && now - b.at > OPEN_H * 3600e3 && b.legs.every(l => !l.game);
    }
    const ks = b.legs.map(l => Date.parse((l.game && l.game.kickoff) || "")).filter(isFinite);
    return !ks.length || now - Math.max(...ks) > DONE_H * 3600e3;
  };
  const legCount = {};
  const outBets = live.filter(b => !over(b)).slice(0, 8).map(b => {
    const legs = b.legs.map(l => {
      const st = legState(l, l.game, l.game && boxes[l.game.id]);
      if (l.game) legCount[`${l.sport}:${l.game.id}`] = (legCount[`${l.sport}:${l.game.id}`] || 0) + 1;
      // props also say who and what, so the TV can write "Herro 24 pts · 1 to go" as the number moves
      const prop = l.kind === "prop" && l.strike != null ? {who: lastName(l.player), unit: SHORT[l.stat] || String(l.stat).replace(/_/g, " "), side: l.side, strike: l.strike} : {};
      return {label: l.label, kind: l.kind, sport: l.sport, game: l.game ? `${l.sport}:${l.game.id}` : null, ...prop, ...st};
    });
    const won = legs.filter(l => l.state === "won").length, lost = legs.filter(l => l.state === "lost").length;
    const done = lost ? "lost" : won === legs.length ? "won" : null;
    return {id: b.id, label: b.label, stake: b.stake, pays: b.pays, n: legs.length, won, lost, done, legs};
  });

  const shown = games.map(g => {
    const key = `${g.sport}:${g.id}`, mine = legCount[key] || 0, fav = favOf(g.sport, g.away) || favOf(g.sport, g.home);
    return {key, sport: g.sport, away: g.away, home: g.home, as: g.away_score, hs: g.home_score, state: g.state,
      detail: g.detail, kickoff: g.kickoff, mine, fav,
      // football: ESPN's last play, so a touchdown on the TV can say who scored it
      ...(g.state === "in" && g.situation && g.situation.last_play ? {last: String(g.situation.last_play).slice(0, 200)} : {})};
  }).filter(g => {
    if (g.mine) return true;
    if (g.state === "post") return false;
    if (g.fav && set.show !== "bets") return now - Date.parse(g.kickoff) < 12 * 3600e3 && Date.parse(g.kickoff) - now < 36 * 3600e3;
    return set.show === "all" && g.state === "in" && set.sports.includes(g.sport);
  });
  const rank = g => (g.mine ? 0 : g.fav ? 1 : 2) * 3 + (g.state === "in" ? 0 : g.state === "pre" ? 1 : 2);
  shown.sort((x, y) => rank(x) - rank(y) || Date.parse(x.kickoff) - Date.parse(y.kickoff));

  return {at: new Date(now).toISOString(), settings: set, games: shown.slice(0, 8), bets: outBets};
}

// re-exported for tests
export { teamCode };
