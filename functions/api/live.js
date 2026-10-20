// DeVig live scores: GET /api/live?sport=nfl|nba|mlb|cfb returns ESPN's scoreboard in a small form (cfb: FBS games,
// with team names and ESPN ids, which the college football board matches on); adding &event=<ESPN id>
// (NFL or NBA) returns that game's box score as {players: {name: {stat: value}}}. Display only, unofficial.
// The app polls this every ~20 seconds while a game is on, instead of waiting for the GitHub bot's commits
// (which land every 5-15 minutes). Answers are kept for a few seconds so many viewers share one ESPN request.

const ESPN = "https://site.api.espn.com/apis/site/v2/sports/";
const SPORTS = {nfl: "football/nfl", nba: "basketball/nba", mlb: "baseball/mlb", cfb: "football/college-football"};
const QUERY = {cfb: "?groups=80&limit=500"};       // every FBS game, not just ESPN's featured ones
// ESPN codes -> the app's team codes (same table as kalshi_games_v1.ALIASES, ESPN side)
const ALIASES = {
  nfl: {JAC: "JAX", LAR: "LA", WSH: "WAS"},
  mlb: {AZ: "ARI", CWS: "CHW", KCR: "KC", SDP: "SD", SFG: "SF", TBR: "TB", WAS: "WSH", OAK: "ATH", ANA: "LAA"},
  nba: {GS: "GSW", NO: "NOP", NY: "NYK", SA: "SAS", UTAH: "UTA", WSH: "WAS", PHO: "PHX", BRK: "BKN", CHO: "CHA"},
};
const SCORE_TTL = 15, BOX_TTL = 25;          // seconds
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

export function scoreboard(d, sport) {
  const code = a => { a = String(a || "").toUpperCase(); return (ALIASES[sport] || {})[a] || a; };
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
            detail: ty.shortDetail || ty.detail || "", possession: posTeam ? code(posTeam.team.abbreviation) : null};
    if (sport === "cfb") {
      out.away_id = String((a.team || {}).id || ""); out.home_id = String((h.team || {}).id || "");
      out.away_name = (a.team || {}).location || ""; out.home_name = (h.team || {}).location || "";
    }
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
      if ((sport !== "nfl" && sport !== "nba") || !/^\d{1,12}$/.test(event)) return json({error: "box scores are NFL and NBA only"}, 400);
      const d = await cachedJson(`${ESPN}${SPORTS[sport]}/summary?event=${event}`, BOX_TTL, fetcher);
      return json({sport, event, at: new Date().toISOString(), players: sport === "nba" ? nbaBox(d) : nflBox(d)}, 200, 10);
    }
    const d = await cachedJson(`${ESPN}${SPORTS[sport]}/scoreboard${QUERY[sport] || ""}`, SCORE_TTL, fetcher);
    return json({sport, at: new Date().toISOString(), games: scoreboard(d, sport)}, 200, 10);
  } catch (e) {
    return json({error: "scores unavailable"}, 502);
  }
}

export async function onRequest(context) {
  return handle(context.request);
}
