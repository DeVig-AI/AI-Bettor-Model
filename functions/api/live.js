// DeVig live scores: GET /api/live?sport=nfl|nba|mlb|nhl|wnba|cfb returns ESPN's scoreboard in a small form (cfb: FBS games,
// with team names and ESPN ids, which the college football board matches on); adding &event=<ESPN id>
// (any sport) returns that game's box score as {players: {name: {stat: value}}} (NFL, CFB, NBA, WNBA), and &game=1 also returns
// game: {plays, drive, situation, scoring, team_stats, box} for the game page (NBA: {plays with shot spots, run,
// linescore, box}; NHL and MLB: {plays, linescore, box}). NFL and CFB scoreboard games in progress carry
// situation (down, distance, field spot) for the field tracker. Display only, unofficial.
// The app polls this every ~20 seconds while a game is on, instead of waiting for the GitHub bot's commits
// (which land every 5-15 minutes). Answers are kept for a few seconds so many viewers share one ESPN request.
// &event=<id>&wrap=1 also returns wrap: ESPN's summary cut down to what the v2 game wrap-up reads (header, box score,
// win chances, and the play-by-play as text), so a phone doesn't download the whole thing.
// ?sport=..&date=YYYYMMDD returns that day's scoreboard (the parlay review finds a past leg's game this way).

const ESPN = "https://site.api.espn.com/apis/site/v2/sports/";
const SPORTS = {nfl: "football/nfl", nba: "basketball/nba", mlb: "baseball/mlb", nhl: "hockey/nhl", wnba: "basketball/wnba",
                cfb: "football/college-football"};
const QUERY = {cfb: "?groups=80&limit=500"};       // every FBS game, not just ESPN's featured ones
// ESPN codes -> the app's team codes (same table as kalshi_games_v1.ALIASES, ESPN side)
const ALIASES = {
  nfl: {JAC: "JAX", LAR: "LA", WSH: "WAS"},
  mlb: {AZ: "ARI", CWS: "CHW", KCR: "KC", SDP: "SD", SFG: "SF", TBR: "TB", WAS: "WSH", OAK: "ATH", ANA: "LAA"},
  nba: {GS: "GSW", NO: "NOP", NY: "NYK", SA: "SAS", UTAH: "UTA", WSH: "WAS", PHO: "PHX", BRK: "BKN", CHO: "CHA"},
};
const SCORE_TTL = 15, BOX_TTL = 25;          // seconds
// each sport's game page parser (the app's kinds: football, hoops, hockey, baseball)
const KIND = {nfl: "football", cfb: "football", nba: "hoops", wnba: "hoops", nhl: "hockey", mlb: "baseball"};
const mem = new Map();

function json(body, status = 200, maxAge = 0) {
  return new Response(JSON.stringify(body), {status, headers: {"content-type": "application/json",
    "cache-control": maxAge ? `public, max-age=${maxAge}` : "no-store"}});
}

export async function cachedJson(url, ttl, fetcher = fetch) {
  const hit = mem.get(url);
  if (hit && Date.now() - hit.at < ttl * 1000) return hit.data;
  const r = await fetcher(url, {headers: {accept: "application/json"}, cf: {cacheTtl: ttl, cacheEverything: true}});
  if (!r.ok) throw new Error("ESPN " + r.status);
  const data = await r.json();
  mem.set(url, {at: Date.now(), data});
  if (mem.size > 60) mem.delete(mem.keys().next().value);
  return data;
}

const num = x => { const v = parseFloat(x); return isFinite(v) ? v : null; };

// ESPN team code -> the app's
export const teamCode = sport => a => { a = String(a || "").toUpperCase(); return (ALIASES[sport] || {})[a] || a; };

export function scoreboard(d, sport) {
  const code = teamCode(sport);
  return (d.events || []).map(ev => {
    const comp = (ev.competitions || [{}])[0];
    const side = {};
    (comp.competitors || []).forEach(c => { side[c.homeAway] = c; });
    const a = side.away, h = side.home;
    if (!a || !h) return null;
    const ty = ((ev.status || comp.status || {}).type) || {};
    const pos = (comp.situation || {}).possession;
    const posTeam = [a, h].find(c => pos && (c.team || {}).id === pos);
    const out = {id: ev.id, kickoff: ev.date, away: code((a.team || {}).abbreviation), home: code((h.team || {}).abbreviation),
            away_score: num(a.score), home_score: num(h.score), state: ty.state || "pre",
            detail: ty.shortDetail || ty.detail || "", possession: posTeam ? code(posTeam.team.abbreviation) : null,
            away_color: (a.team || {}).color || null, home_color: (h.team || {}).color || null};
    if (sport === "cfb") {
      out.away_id = String((a.team || {}).id || ""); out.home_id = String((h.team || {}).id || "");
      out.away_name = (a.team || {}).location || ""; out.home_name = (h.team || {}).location || "";
    }
    if ((sport === "nfl" || sport === "cfb") && out.state === "in" && comp.situation) out.situation = nflSituation(comp.situation, out, code);
    if (sport === "mlb" && out.state === "in" && comp.situation) out.situation = mlbSituation(comp.situation);
    return out;
  }).filter(Boolean);
}

// NFL box score -> {display name: {stat: value}}, with the same stat names as the props model (nfl_props_live_v1.box_stats)
export function nflBox(d) {
  const out = {};
  ((d.boxscore || {}).players || []).forEach(tm => {
    (tm.statistics || []).forEach(grp => {
      const keys = grp.keys || [], name = grp.name;
      (grp.athletes || []).forEach(a => {
        const v = {};
        keys.forEach((k, i) => { v[k] = (a.stats || [])[i]; });
        const who = (a.athlete || {}).displayName;
        if (!who) return;
        const s = out[who] = out[who] || {};
        if (name === "passing") {
          const ca = String(v["completions/passingAttempts"] || "").split("/");
          if (ca.length === 2) { s.passing_completions = num(ca[0]); s.passing_attempts = num(ca[1]); }
          s.passing_yards = num(v.passingYards); s.passing_tds = num(v.passingTouchdowns); s.interceptions = num(v.interceptions);
        } else if (name === "rushing") {
          s.rushing_attempts = num(v.rushingAttempts); s.rushing_yards = num(v.rushingYards); s._rush_td = num(v.rushingTouchdowns);
        } else if (name === "receiving") {
          s.receptions = num(v.receptions); s.receiving_yards = num(v.receivingYards); s._rec_td = num(v.receivingTouchdowns);
        }
      });
    });
  });
  Object.values(out).forEach(s => {
    s.rush_rec_yards = (s.rushing_yards || 0) + (s.receiving_yards || 0);
    s.touchdowns = (s._rush_td || 0) + (s._rec_td || 0);
    delete s._rush_td; delete s._rec_td;
  });
  return out;
}

// ---------- NFL game page: field position, drive, plays, scoring, team stats ----------
// Field spots are yards from the AWAY team's goal line (0 = away goal, 100 = home goal), so the app draws the away
// end zone on the left. ESPN gives a spot as "SEA 37" (possessionText) and, on plays, as yardsToEndzone for the
// team with the ball; either is enough.
export function nflSpot(text, ytez, offense, away, home) {
  if (ytez != null && isFinite(ytez) && (offense === away || offense === home))
    return offense === away ? 100 - Number(ytez) : Number(ytez);
  const m = /^\s*([A-Za-z]{2,4})?\s*(\d{1,2})\s*$/.exec(String(text || ""));
  if (!m) return null;
  const n = Number(m[2]);
  if (n === 50 || !m[1]) return n === 50 ? 50 : null;
  const side = m[1].toUpperCase();
  return side === away ? n : side === home ? 100 - n : null;
}

// The scoreboard's situation for a game in progress (fresh every ~15 seconds). code() maps ESPN's team codes to ours.
export function nflSituation(s, game, code) {
  const out = {down: num(s.down), distance: num(s.distance), text: s.shortDownDistanceText || s.downDistanceText || "",
    spot_text: s.possessionText || "", red_zone: !!s.isRedZone,
    timeouts: {away: num(s.awayTimeouts), home: num(s.homeTimeouts)}};
  const offense = game.possession;
  out.offense = offense || null;
  out.spot = nflSpot(normSpot(s.possessionText, code), null, offense, game.away, game.home);
  if (s.lastPlay && s.lastPlay.text) out.last_play = String(s.lastPlay.text);
  return out;
}
// "WSH 37" -> "WAS 37" (ESPN's code in a spot text, mapped to ours)
function normSpot(t, code) {
  const m = /^\s*([A-Za-z]{2,4})\s+(\d{1,2})\s*$/.exec(String(t || ""));
  return m ? code(m[1]) + " " + m[2] : t;
}

const TEAM_STATS = [["totalYards", "Total yards"], ["netPassingYards", "Passing"], ["rushingYards", "Rushing"],
  ["firstDowns", "First downs"], ["thirdDownEff", "3rd down"], ["fourthDownEff", "4th down"], ["turnovers", "Turnovers"],
  ["totalPenaltiesYards", "Penalties"], ["sacksYardsLost", "Sacks-yards"], ["possessionTime", "Possession"]];
const BOX_GROUPS = {passing: "Passing", rushing: "Rushing", receiving: "Receiving"};
const PLAYS_KEPT = 60;

// NFL summary -> what the game page shows. Every part is optional: a missing ESPN field leaves that part out.
export function nflGame(d, code = x => String(x || "").toUpperCase()) {
  const comp = ((d.header || {}).competitions || [])[0] || {};
  const idTeam = {}, side = {};
  (comp.competitors || []).forEach(c => {
    const t = code((c.team || {}).abbreviation);
    idTeam[String((c.team || {}).id)] = t; side[c.homeAway] = t;
  });
  const away = side.away, home = side.home;
  const teamOf = t => t ? (idTeam[String(t.id)] || (t.abbreviation ? code(t.abbreviation) : null)) : null;
  const drives = d.drives || {};
  const all = (drives.previous || []).concat(drives.current ? [drives.current] : []);
  const seen = {}, plays = [];
  all.forEach(dr => {
    const offense = teamOf(dr.team);
    (dr.plays || []).forEach(p => {
      if (!p || !p.text || seen[p.id]) return;
      seen[p.id] = 1;
      const st = p.start || {}, typ = (p.type || {}).text || "";
      plays.push({id: String(p.id || plays.length), team: teamOf(st.team) || offense, q: num((p.period || {}).number),
        clock: (p.clock || {}).displayValue || "", text: String(p.text), type: typ, yards: num(p.statYardage),
        down: st.down > 0 ? (st.shortDownDistanceText || st.downDistanceText || "") : "",
        scoring: !!p.scoringPlay, away_score: num(p.awayScore), home_score: num(p.homeScore)});
    });
  });
  const out = {away, home, plays: plays.slice(-PLAYS_KEPT).reverse()};
  const cur = drives.current;
  if (cur) {
    const offense = teamOf(cur.team), start = cur.start || {};
    const ps = (cur.plays || []).filter(p => p && p.text), last = ps[ps.length - 1], end = last && last.end || {};
    out.drive = {offense, summary: cur.description || "", plays: num(cur.offensivePlays), yards: num(cur.yards),
      start: nflSpot(normSpot(start.text, code), null, offense, away, home), result: String(cur.displayResult || cur.result || "")};
    if (last) {
      const endTeam = teamOf(end.team) || offense;
      out.situation = {offense: endTeam, down: num(end.down), distance: num(end.distance),
        text: end.down > 0 ? (end.shortDownDistanceText || end.downDistanceText || "") : "",
        spot_text: end.possessionText || "", spot: nflSpot(normSpot(end.possessionText, code), end.yardsToEndzone, endTeam, away, home)};
    }
  }
  out.scoring = (d.scoringPlays || []).map(p => ({team: teamOf(p.team), q: num((p.period || {}).number),
    clock: (p.clock || {}).displayValue || "", type: ((p.type || {}).abbreviation || (p.type || {}).text || ""),
    text: String(p.text || ""), away_score: num(p.awayScore), home_score: num(p.homeScore)}));
  const teams = ((d.boxscore || {}).teams || []);
  const statsOf = t => { const m = {}; ((t || {}).statistics || []).forEach(s => { m[s.name] = s.displayValue; }); return m; };
  const tAway = teams.filter(t => teamOf(t.team) === away)[0], tHome = teams.filter(t => teamOf(t.team) === home)[0];
  if (tAway || tHome) {
    const sa = statsOf(tAway), sh = statsOf(tHome);
    out.team_stats = TEAM_STATS.filter(([k]) => sa[k] != null || sh[k] != null)
      .map(([k, label]) => ({label, away: sa[k] != null ? String(sa[k]) : "", home: sh[k] != null ? String(sh[k]) : ""}));
  }
  out.box = [];
  ((d.boxscore || {}).players || []).forEach(tm => {
    const team = teamOf(tm.team);
    (tm.statistics || []).forEach(g => {
      if (!BOX_GROUPS[g.name]) return;
      const rows = (g.athletes || []).filter(a => a.athlete && a.athlete.displayName && (a.stats || []).length)
        .slice(0, 4).map(a => ({name: a.athlete.displayName, stats: a.stats.map(String)}));
      if (rows.length) out.box.push({team, group: BOX_GROUPS[g.name], labels: (g.labels || []).map(String), rows});
    });
  });
  return out;
}

// ---------- NBA game page: plays with shot spots, the current run, quarter scores, player box ----------
// Shot spots are feet on a half court seen from above the basket: x 0-50 across, y 0-47 out from the baseline
// (the rim is at about x 25, y 5). ESPN gives full-court coordinates for some shots and junk for free throws,
// so anything off the court is dropped and the far half is folded onto the near one.
export function nbaShot(c) {
  if (!c) return null;
  let x = Number(c.x), y = Number(c.y);
  if (!isFinite(x) || !isFinite(y) || x < 0 || x > 50 || y < 0 || y > 94) return null;
  if (y > 47) { x = 50 - x; y = 94 - y; }
  return {x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10};
}
const NBA_PLAYS_KEPT = 80, NBA_BOX = ["MIN", "PTS", "REB", "AST", "FG", "3PT", "STL", "BLK", "TO", "+/-"];

export function nbaGame(d, code = x => String(x || "").toUpperCase()) {
  const comp = ((d.header || {}).competitions || [])[0] || {};
  const idTeam = {}, side = {}, lines = {};
  (comp.competitors || []).forEach(c => {
    const t = code((c.team || {}).abbreviation);
    idTeam[String((c.team || {}).id)] = t; side[c.homeAway] = t;
    lines[c.homeAway] = (c.linescores || []).map(l => num(l.displayValue != null ? l.displayValue : l.value));
  });
  const away = side.away, home = side.home;
  const teamOf = t => t ? (idTeam[String(t.id)] || (t.abbreviation ? code(t.abbreviation) : null)) : null;
  const all = (d.plays || []).filter(p => p && p.text).map(p => {
    const shot = p.shootingPlay && !/free throw/i.test(((p.type || {}).text || "") + " " + p.text) ? nbaShot(p.coordinate) : null;
    return {id: String(p.id || p.sequenceNumber || ""), team: teamOf(p.team), q: num((p.period || {}).number),
      clock: (p.clock || {}).displayValue || "", text: String(p.text), type: (p.type || {}).text || "",
      pts: p.scoringPlay ? (num(p.scoreValue) || 0) : 0, away_score: num(p.awayScore), home_score: num(p.homeScore),
      shot: shot ? Object.assign(shot, {made: !!p.scoringPlay}) : null};
  });
  const out = {away, home, plays: all.slice(-NBA_PLAYS_KEPT).reverse()};
  // the current run: points scored since the other team last scored (shown from 6 unanswered)
  let runTeam = null, runPts = 0;
  for (let i = all.length - 1; i >= 0; i--) {
    const p = all[i];
    if (!p.pts || !p.team) continue;
    if (runTeam && p.team !== runTeam) break;
    runTeam = p.team; runPts += p.pts;
  }
  if (runTeam && runPts >= 6) out.run = {team: runTeam, points: runPts};
  if ((lines.away || []).length || (lines.home || []).length) out.linescore = {away: lines.away || [], home: lines.home || []};
  out.box = [];
  ((d.boxscore || {}).players || []).forEach(tm => {
    const g = (tm.statistics || [])[0];
    if (!g) return;
    const labels = (g.labels || g.names || []).map(String);
    const idx = NBA_BOX.map(l => labels.indexOf(l)).filter(i => i >= 0);
    const rows = (g.athletes || []).filter(a => a.athlete && a.athlete.displayName && (a.stats || []).length)
      .map(a => ({name: a.athlete.displayName, starter: !!a.starter, stats: idx.map(i => String(a.stats[i] == null ? "" : a.stats[i]))}));
    if (rows.length) out.box.push({team: teamOf(tm.team), labels: idx.map(i => labels[i]), rows});
  });
  return out;
}

// ---------- NHL and MLB game pages: plays, period/inning scores, box ----------
// One table per team and stat group, the columns ESPN labels (the app picks which to show).
function groupBox(d, teamOf, keep = 6) {
  const out = [];
  ((d.boxscore || {}).players || []).forEach(tm => {
    (tm.statistics || []).forEach(g => {
      const labels = (g.labels || g.names || []).map(String);
      const rows = (g.athletes || []).filter(a => a.athlete && a.athlete.displayName && (a.stats || []).length)
        .slice(0, keep).map(a => ({name: a.athlete.displayName, stats: a.stats.map(x => String(x == null ? "" : x))}));
      const name = String(g.text || g.name || g.type || "");
      if (rows.length) out.push({team: teamOf(tm.team), group: name.charAt(0).toUpperCase() + name.slice(1), labels, rows});
    });
  });
  return out;
}
function header(d, code) {
  const comp = ((d.header || {}).competitions || [])[0] || {};
  const idTeam = {}, side = {}, lines = {};
  (comp.competitors || []).forEach(c => {
    const t = code((c.team || {}).abbreviation);
    idTeam[String((c.team || {}).id)] = t; side[c.homeAway] = t;
    lines[c.homeAway] = (c.linescores || []).map(l => num(l.displayValue != null ? l.displayValue : l.value));
  });
  const teamOf = t => t ? (idTeam[String(t.id)] || (t.abbreviation ? code(t.abbreviation) : null)) : null;
  const linescore = (lines.away || []).length || (lines.home || []).length ? {away: lines.away || [], home: lines.home || []} : undefined;
  return {away: side.away, home: side.home, teamOf, linescore};
}
const playOf = (p, teamOf) => ({id: String(p.id || p.sequenceNumber || ""), team: teamOf(p.team), q: num((p.period || {}).number),
  half: (p.period || {}).type || "", clock: (p.clock || {}).displayValue || "", text: String(p.text), type: (p.type || {}).text || "",
  scoring: !!p.scoringPlay, pts: p.scoringPlay ? (num(p.scoreValue) || 0) : 0, away_score: num(p.awayScore), home_score: num(p.homeScore)});

// NHL: goals, penalties, shots and period ends (faceoffs, hits and stoppages left out), newest first.
const NHL_KEEP = /goal|penalty|shot|period|shootout|challenge/i, NHL_DROP = /blocked|missed/i;
export function nhlGame(d, code = x => String(x || "").toUpperCase()) {
  const h = header(d, code);
  const plays = (d.plays || []).filter(p => p && p.text && NHL_KEEP.test(((p.type || {}).text || "") + " " + p.text) &&
    !NHL_DROP.test((p.type || {}).text || "")).map(p => playOf(p, h.teamOf));
  return {away: h.away, home: h.home, plays: plays.slice(-NBA_PLAYS_KEPT).reverse(), linescore: h.linescore, box: groupBox(d, h.teamOf, 8)};
}

// MLB: at-bat results and scoring plays (each pitch left out), newest first.
const MLB_PITCH = /^(ball|strike|foul|pitch|pickoff|mound visit|.* pitches to )/i;
export function mlbGame(d, code = x => String(x || "").toUpperCase()) {
  const h = header(d, code);
  const plays = (d.plays || []).filter(p => p && p.text && (p.scoringPlay || /result/i.test((p.type || {}).type || (p.type || {}).text || "") ||
    !MLB_PITCH.test(String(p.text)))).map(p => playOf(p, h.teamOf));
  return {away: h.away, home: h.home, plays: plays.slice(-NBA_PLAYS_KEPT).reverse(), linescore: h.linescore, box: groupBox(d, h.teamOf, 9)};
}
// The scoreboard's situation for a game in progress: count, outs, runners, pitcher and batter, the last play.
export function mlbSituation(s) {
  const who = x => ((x || {}).athlete || {}).shortName || ((x || {}).athlete || {}).displayName || "";
  const out = {balls: num(s.balls), strikes: num(s.strikes), outs: num(s.outs),
    bases: [!!s.onFirst, !!s.onSecond, !!s.onThird], pitcher: who(s.pitcher), batter: who(s.batter)};
  if (s.lastPlay && s.lastPlay.text) out.last_play = String(s.lastPlay.text);
  return out;
}

// NBA box score -> {display name: {stat: value}}, with the NBA props model's stat names
export function nbaBox(d) {
  const out = {};
  const made = x => num(String(x == null ? "" : x).split("-")[0]);
  ((d.boxscore || {}).players || []).forEach(tm => {
    (tm.statistics || []).forEach(grp => {
      const keys = grp.keys || grp.names || [];
      (grp.athletes || []).forEach(a => {
        const who = (a.athlete || {}).displayName;
        if (!who || !(a.stats || []).length) return;
        const v = {};
        keys.forEach((k, i) => { v[k] = a.stats[i]; });
        const pick = (...names) => { for (const n of names) if (v[n] != null) return v[n]; return null; };
        const s = {points: num(pick("points", "PTS")), rebounds: num(pick("rebounds", "REB")), assists: num(pick("assists", "AST")),
                   steals: num(pick("steals", "STL")), blocks: num(pick("blocks", "BLK")),
                   threes: made(pick("threePointFieldGoalsMade-threePointFieldGoalsAttempted", "3PT"))};
        Object.keys(s).forEach(k => { if (s[k] == null) s[k] = 0; });
        s.pts_reb_ast = s.points + s.rebounds + s.assists;
        s.stl_blk = s.steals + s.blocks;
        out[who] = s;
      });
    });
  });
  return out;
}

export async function handle(request, fetcher = fetch) {
  if (request.method !== "GET") return json({error: "method not allowed"}, 405);
  const q = new URL(request.url).searchParams;
  const sport = String(q.get("sport") || "").toLowerCase(), event = q.get("event");
  if (!SPORTS[sport]) return json({error: "unknown sport"}, 400);
  try {
    if (event) {
      if (!/^\d{1,12}$/.test(event)) return json({error: "bad event"}, 400);
      const kind = KIND[sport], d = await cachedJson(`${ESPN}${SPORTS[sport]}/summary?event=${event}`, BOX_TTL, fetcher);
      const body = {sport, event, at: new Date().toISOString(), players: kind === "hoops" ? nbaBox(d) : kind === "football" ? nflBox(d) : {}};
      if (q.get("game") === "1") body.game = GAME[kind](d, teamCode(sport));
      if (q.get("wrap") === "1") body.wrap = slimSummary(d);
      return json(body, 200, 10);
    }
    const date = q.get("date");                     // YYYYMMDD (ET), for an earlier or later day's games
    if (date != null && !/^20\d{6}$/.test(date)) return json({error: "bad date"}, 400);
    const qs = [QUERY[sport] ? QUERY[sport].slice(1) : "", date ? `dates=${date}` : ""].filter(Boolean).join("&");
    const d = await cachedJson(`${ESPN}${SPORTS[sport]}/scoreboard${qs ? "?" + qs : ""}`, date ? 60 : SCORE_TTL, fetcher);
    return json({sport, at: new Date().toISOString(), games: scoreboard(d, sport)}, 200, date ? 30 : 10);
  } catch (e) {
    return json({error: "scores unavailable"}, 502);
  }
}

// a play reduced to what the wrap-up shows or matches on
const slimPlay = p => ({id: p.id, text: p.text, type: {text: (p.type || {}).text}, scoringPlay: !!p.scoringPlay,
  awayScore: p.awayScore, homeScore: p.homeScore, period: {number: (p.period || {}).number}, clock: {displayValue: (p.clock || {}).displayValue}});

export function slimSummary(d) {
  const comp = (((d.header || {}).competitions) || [])[0] || {};
  return {
    header: {competitions: [{status: comp.status, competitors: (comp.competitors || []).map(c => ({homeAway: c.homeAway, score: c.score,
      team: {id: (c.team || {}).id, abbreviation: (c.team || {}).abbreviation}}))}]},
    boxscore: {
      teams: ((d.boxscore || {}).teams || []).map(t => ({homeAway: t.homeAway, team: {id: (t.team || {}).id},
        statistics: (t.statistics || []).map(x => ({name: x.name, displayValue: x.displayValue}))})),
      players: ((d.boxscore || {}).players || []).map(t => ({team: {id: (t.team || {}).id},
        statistics: (t.statistics || []).map(g => ({name: g.name, keys: g.keys,
          athletes: (g.athletes || []).map(a => ({athlete: {id: (a.athlete || {}).id, displayName: (a.athlete || {}).displayName}, stats: a.stats}))}))})),
    },
    winprobability: (d.winprobability || []).map(w => ({homeWinPercentage: w.homeWinPercentage, playId: w.playId})),
    scoringPlays: (d.scoringPlays || []).map(slimPlay),
    plays: (d.plays || []).map(slimPlay),
    drives: {previous: (((d.drives || {}).previous) || []).map(dr => ({plays: (dr.plays || []).map(slimPlay)}))},
  };
}

export async function onRequest(context) {
  return handle(context.request);
}

const GAME = {football: (d, c) => nflGame(d, c), hoops: (d, c) => nbaGame(d, c), hockey: (d, c) => nhlGame(d, c), baseball: (d, c) => mlbGame(d, c)};
