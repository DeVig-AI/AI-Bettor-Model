// DeVig's lookup tools for the AI: the same set powers Ask (the model on the owner's Mac calls them while it answers)
// and the public MCP server (functions/api/mcp.js), so any MCP client can read DeVig's board.
//
// In Ask, the tools read the exact data the app sent with the question (games with DeVig's picks and the model's
// reasoning, the graded record, injuries), so the AI sees what the user sees. Without it (MCP), find_games reads the
// public board file the app itself loads. web_search needs OLLAMA_API_KEY and is Ask-only (it spends a quota).

const RAW = "https://raw.githubusercontent.com/DeVig-AI/AI-Bettor-Model/main/";
const WEB_SEARCH = "https://ollama.com/api/web_search";

// ---------- bettor lingo ----------
export const LINGO = {
  "ml / moneyline": "bet on a team to win outright, no points. -150 = risk 150 to win 100; +150 = risk 100 to win 150.",
  "spread / ats": "points added to the underdog. 'Bills -3' = the Bills must win by more than 3 to cover; exactly 3 is a push. ATS = against the spread.",
  "cover": "win against the spread.",
  "push": "lands exactly on the number; the stake comes back.",
  "hook": "the half point (-3.5 has 'the hook'); it removes pushes.",
  "key numbers": "NFL margins land most on 3 and 7 (then 10, 6, 4, 14); moving a line across them is worth the most.",
  "total / o/u": "combined points of both teams vs a number.",
  "juice / vig / the house edge": "the bookmaker's cut built into the prices. -110 both ways = each side needs 52.4% to break even.",
  "no-vig / fair / devig": "the chance with the vig removed: what DeVig is named for.",
  "implied probability / break-even": "the win rate a price needs: -150 = 60%, +150 = 40%.",
  "chalk / fave": "the favorite. 'Eating chalk' = betting favorites.",
  "dog / underdog / plus money": "the side expected to lose, paying more than even (+ odds).",
  "pk / pick'em": "no favorite, a spread of 0.",
  "laying points / taking points": "betting the favorite on the spread / betting the underdog on the spread.",
  "units / u": "a bettor's standard stake size, used to count results (+3u = up 3 stakes).",
  "parlay / multi / combo / leg": "several bets that must all win; each one is a leg. Pays more, hits much less, and the vig stacks every leg.",
  "sgp / same-game parlay": "parlay of legs from one game; the legs are linked, and books price that against you.",
  "teaser": "a parlay where each spread moves 6 points your way (NFL) for a worse price. It only pays off when the 6 points carry the spread across both key numbers, 3 and 7: an underdog +1.5 or +2.5 becomes +7.5 or +8.5, a favorite -7.5 or -8.5 becomes -1.5 or -2.5. Usually 2 legs.",
  "alt line / buying points": "taking a different spread or total than the main one for a different price.",
  "props / player props": "bets on a player's stats (points, yards, rebounds) over or under a number.",
  "live / in-play": "betting after the game starts; prices move with every play.",
  "clv / closing line value": "beating the final price before the start; the best known sign of a good bet.",
  "opener / closer": "the first line posted / the last line before the start.",
  "steam / line move / rlm": "a fast move from big money. RLM (reverse line movement) = the line moves against the side most bettors are on.",
  "sharp / square / public": "pro bettors / casual bettors / where most tickets are.",
  "fade / tail": "bet against someone's pick / copy it.",
  "lock / hammer / smash": "slang for a bet someone is very sure of. Nothing is a lock.",
  "hedge": "betting the other side to lock in some money.",
  "middle": "bets on both sides at different numbers so both can win if the result lands between.",
  "arb / arbitrage": "both sides at different books priced so both together guarantee a small profit.",
  "ev / +ev / value": "expected value: the bet pays more than its true chance says it should.",
  "bankroll": "the money set aside only for betting.",
  "book / sportsbook / exchange": "where bets are placed. Kalshi is an exchange: yes/no contracts in cents (60¢ ≈ 60% ≈ -150).",
  "cash / hit / bad beat": "a winning bet / a bet that wins / a bet lost at the very end.",
  "boost / odds boost": "a book's better price on a chosen bet, usually with a low max stake.",
};

// the glossary lines for slang that appears in a question, so the model reads it the bettor's way without a lookup
export function termsIn(text) {
  const t = ` ${String(text || "").toLowerCase().replace(/[^a-z0-9+/' -]/g, " ")} `;
  const said = t.split(" ").filter(w => w.length >= 4);
  return Object.entries(LINGO).filter(([k]) => k.split(" / ").some(w => t.includes(` ${w} `) || t.includes(` ${w}s `) ||
    (!w.includes(" ") && w.length >= 5 && said.some(x => w.startsWith(x)))))
    .slice(0, 6).map(([k, v]) => `${k.split(" / ")[0].toUpperCase()}: ${v}`);
}

// what the app's data means (mirrors ASK_RULES in the app) and how to think like a bettor
export const LOCAL_GUIDE = [
  "You are DeVig's assistant, inside a sports odds app. The user is on a phone and talks like a bettor.",
  "THINK LIKE A BETTOR: first work out exactly what they mean in betting terms. 'Bills -3 a good spot?' = is the Bills spread at -3 worth the price, given DeVig's model and Kalshi's line. 'Why does the model like KC' = explain the model's own reasoning for that game. 'Tease them' = a teaser through 3 and 7. Use explain_term for slang you aren't sure of.",
  "ALWAYS look up the game, record or injuries with the tools before answering about them. Never invent odds, picks, scores, records or injuries; if a tool returns nothing, say it isn't on DeVig's board.",
  "Answer the specific thing they asked, in 2-5 short sentences or a short list. No long intros.",
  "How the data reads: kalshi_odds = Kalshi's American odds with its fee in. market_fair = Kalshi's chance with the fee removed. devig_pick.action ML = DeVig's model picked a side and cleared its confidence bar; PASS = not confident enough. devig_prob = the model's chance. edge = devig_prob minus market_fair. break_even = the win rate the price needs; if it's above devig_prob the price is too steep.",
  "DeVig's chances are for a team to WIN the game (moneyline), not to cover a spread or hit a total. For a spread or total question, say DeVig doesn't model that market, then use the win chance and Kalshi's line only as context.",
  "Player props: expected = the props model's projection for the player; devig_props_model_chance = its chance the line hits; kalshi_chance = the market's. Kalshi was more accurate than this model in testing, so treat a gap as a lean, not an edge. Mention an injury tag if there is one.",
  "model_reasoning: lean/lean_prob = the side the model favors and its chance; pick_bar = how sure it must be to pick. steps (NFL) = the lean team's chance after home_field, then form, then who_is_out, so each step's change is what it added. inputs (NBA) = what it read, without weights.",
  "Be honest: none of DeVig's models has been proven to beat the betting odds; on past seasons the market was more accurate. Tag each number with its source right after it, like 64% (DeVig model) or -140 (Kalshi). Never name the tools you used.",
  "Never tell anyone how much to bet or that anything is certain. End every answer with this line on its own: \"AI can make mistakes, so double-check before betting.\"",
].join("\n");

// ---------- tool definitions (OpenAI/Ollama function format; MCP uses the same schemas) ----------
const T = (name, description, properties = {}, required = []) =>
  ({type: "function", function: {name, description, parameters: {type: "object", properties, required}}});

export const TOOLS = [
  T("find_games", "Look up games on DeVig's board by team and/or sport: Kalshi odds, spread, total, score, DeVig's pick and the model's reasoning.",
    {team: {type: "string", description: "team name, city or code, e.g. Bills, Kansas City, LAL"},
     sport: {type: "string", description: "NFL, NBA, MLB, NHL, CFB, CBB (football, basketball, baseball also work)"}}),
  T("track_record", "DeVig's graded picks this season (won, lost, units) and the latest results, for one sport or all.",
    {sport: {type: "string", description: "NFL, NBA or MLB; leave empty for all"}}),
  T("player_props", "A player's prop lines tonight (points, rebounds, yards...): Kalshi's price, DeVig's props model chance, the player's expected number and injury tag. Spelling can be rough.",
    {player: {type: "string", description: "player name, e.g. Scottie Barnes"},
     stat: {type: "string", description: "points, rebounds, assists, threes, pass_yds, rush_yds, rec_yds, receptions, touchdowns, goals, shots..."}}, ["player"]),
  T("injuries", "Injured or doubtful starters and key players for a team's game on the board.",
    {team: {type: "string", description: "team name or code"}}, ["team"]),
  T("explain_term", "What a betting slang word or abbreviation means (ML, ATS, juice, teaser, hook, CLV, SGP, fade...).",
    {term: {type: "string"}}, ["term"]),
  T("web_search", "Search the web for fresh news DeVig doesn't have: injury updates, lineups, trades, weather. Use only when the board doesn't answer it.",
    {query: {type: "string"}}, ["query"]),
];

// ---------- helpers ----------
const SPORTS = {football: ["NFL", "CFB"], basketball: ["NBA", "CBB"], baseball: ["MLB"], hockey: ["NHL"],
  "college football": ["CFB"], ncaaf: ["CFB"], "college basketball": ["CBB"], ncaab: ["CBB"]};
function sportsOf(s) {
  s = String(s || "").trim().toLowerCase();
  if (!s) return null;
  return SPORTS[s] || [s.toUpperCase()];
}
const words = s => String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
// does this team query match "BUF at KC" / "Buffalo Bills at Kansas City Chiefs"?
function teamHit(q, ...fields) {
  const want = words(q);
  if (!want.length) return true;
  const have = new Set(fields.flatMap(words));
  const text = fields.join(" ").toLowerCase();
  return want.every(w => have.has(w) || (w.length >= 4 && text.includes(w)));
}
// close enough for a misspelled name ("barns" ~ "barnes"): edits allowed grow with the word
function near(a, b) {
  if (a === b) return true;
  if (a.length < 4 || Math.abs(a.length - b.length) > 2) return false;
  const lim = a.length >= 6 ? 2 : 1;
  let prev = Array.from({length: b.length + 1}, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length] <= lim;
}
const STAT_WORDS = {pts: "points", point: "points", reb: "rebounds", rebound: "rebounds", ast: "assists", assist: "assists",
  "3s": "threes", three: "threes", "3pm": "threes", pra: "pts_reb_ast", td: "touchdowns", tds: "touchdowns", touchdown: "touchdowns",
  "passing yards": "pass_yds", "rushing yards": "rush_yds", "receiving yards": "rec_yds", rec: "receptions", sog: "shots", goal: "goals"};
const cents = p => (p > 0 && p < 1 ? Math.round(p * 100) : null);
const american = p => (p > 0 && p < 1 ? Math.round(p >= 0.5 ? (-100 * p) / (1 - p) : (100 * (1 - p)) / p) : null);

async function props(args, fetcher) {
  const want = words(args.player);
  if (!want.length) return {note: "Which player?"};
  let stat = String(args.stat || "").toLowerCase().trim().replace(/s$/, "");
  stat = STAT_WORDS[stat] || STAT_WORDS[stat + "s"] || (stat ? stat.replace(/ /g, "_") : "");
  const rows = [], reports = {};
  for (const sp of ["nba", "nfl", "nhl"]) {
    try {
      const r = await fetcher(`${RAW}${sp}/props_model_export.json`, {headers: {accept: "application/json"}, cf: {cacheTtl: 300, cacheEverything: true}});
      if (!r.ok) continue;
      for (const d of (await r.json()).docs || []) {
        if (d.collection === "props_model_report" && d.data) { reports[sp.toUpperCase()] = d.data; continue; }
        const g = d.data || {};
        for (const x of g.rows || []) {
          if (x.stale) continue;
          const name = words(x.player);
          const hit = want.filter(w => name.some(n => near(w, n))).length;
          if (hit) rows.push({hit, g, x, sport: sp.toUpperCase(), picks: g.paper_picks || []});
        }
      }
    } catch (e) { /* one sport missing doesn't stop the rest */ }
  }
  const best = Math.max(0, ...rows.map(r => r.hit));
  let mine = rows.filter(r => r.hit === best && best >= Math.min(want.length, 2));
  if (!mine.length) return {note: "No Kalshi prop lines for that player on DeVig's board right now."};
  const players = [...new Set(mine.map(r => r.x.player))];
  if (players.length > 1) mine = mine.filter(r => r.x.player === players[0]);
  const allStats = [...new Set(mine.map(r => r.x.stat))];
  if (stat && allStats.some(s => s.startsWith(stat))) mine = mine.filter(r => r.x.stat.startsWith(stat));
  const first = mine[0], rep = reports[first.sport];
  return {
    player: first.x.player, game: `${first.g.away_team} at ${first.g.home_team}`, kickoff: first.g.kickoff_time,
    injury: first.x.injury || null, expected: first.x.expected ?? null, games_in_sample: first.x.n_games ?? null,
    other_stats: stat ? undefined : allStats,
    lines: mine.slice(0, 8).map(({x}) => {
      const k = x.k || {}, half = Math.abs(x.line % 1 - 0.5) < 1e-9;
      const mid = k.bid != null && k.ask != null ? (k.bid + k.ask) / 2 : null;
      return {
        bet: half ? `${x.line + 0.5}+ ${x.stat}` : `over ${x.line} ${x.stat}`,
        kalshi_yes_cost_cents: cents(k.ask), kalshi_yes_american: american(k.ask), kalshi_chance: mid == null ? null : Math.round(mid * 100) / 100,
        devig_props_model_chance: x.model_p ?? null,
      };
    }),
    devig_paper_pick: first.picks.filter(p => p.player === first.x.player).map(p => `${p.side} ${p.line} ${p.stat}`)[0] || null,
    how_the_props_model_does: rep ? `${rep.wins} of ${rep.paper_picks_graded} paper picks won, ROI ${rep.roi == null ? "n/a" : Math.round(rep.roi * 1000) / 10 + "%"}. ${rep.backtest || ""}`.trim() : null,
  };
}

const cut = (s, n) => (s.length > n ? s.slice(0, n) + "…" : s);

// the app's data block inside the first question ("APP DATA (JSON):\n{...}\n\nQUESTION: ...")
export function splitAppMessage(text) {
  const m = /^RULES:\n([\s\S]*?)\n\nAPP DATA \(JSON\):\n([\s\S]*?)\n\nQUESTION: ([\s\S]*)$/.exec(String(text || ""));
  if (!m) return null;
  try { return {rules: m[1], app: JSON.parse(m[2]), question: m[3]}; } catch (e) { return null; }
}

async function boardGames(fetcher) {
  const r = await fetcher(`${RAW}live/game_lines.json`, {headers: {accept: "application/json"}, cf: {cacheTtl: 120, cacheEverything: true}});
  if (!r.ok) return [];
  const d = await r.json();
  return (d.games || []).map(g => ({
    sport: g.sport, game: `${g.away} at ${g.home}`, teams: g.names ? `${g.names.away} at ${g.names.home}` : null,
    kickoff: g.kickoff, state: g.state === "pre" ? "not started" : g.state === "in" ? `live ${g.detail || ""}`.trim() : "final",
    score: g.away_score == null ? null : `${g.away} ${g.away_score}, ${g.home} ${g.home_score}`,
    kalshi_odds: g.ml ? {[g.away]: Math.round(g.ml.away), [g.home]: Math.round(g.ml.home)} : null,
    market_fair_home: g.home_wp ?? null,
    spread: g.spread ? `${g.home} ${g.spread.home_point > 0 ? "+" : ""}${g.spread.home_point}` : null,
    total: g.total ? g.total.line : null,
  }));
}

// ---------- running a tool ----------
// ctx: {app (the app's data, or null), env, fetcher}. Always resolves to a short JSON-able result.
export async function runTool(name, args, {app = null, env = {}, fetcher = fetch} = {}) {
  args = args && typeof args === "object" ? args : {};
  try {
    if (name === "find_games") {
      let games = app && Array.isArray(app.games) ? app.games : await boardGames(fetcher);
      const sp = sportsOf(args.sport);
      const byTeam = games.filter(g => teamHit(args.team, g.game, g.teams));
      let hits = sp ? byTeam.filter(g => sp.includes(String(g.sport).toUpperCase())) : byTeam;
      if (!hits.length) hits = byTeam;                       // a wrong sport guess shouldn't hide the game
      if (!args.team && !sp) hits = games;
      return hits.length
        ? {count: hits.length, games: hits.slice(0, 4), models: app && app.models ? app.models : undefined}
        : {count: 0, note: "No game like that on DeVig's board right now."};
    }
    if (name === "player_props") return await props(args, fetcher);
    if (name === "track_record") {
      if (!app || !Array.isArray(app.record)) return {note: "The record is in the app's Record tab."};
      const sp = sportsOf(args.sport);
      const rows = sp ? app.record.filter(r => sp.includes(String(r.sport).toUpperCase())) : app.record;
      return rows.length ? {record: rows} : {note: "No graded picks for that sport yet."};
    }
    if (name === "injuries") {
      const list = app && Array.isArray(app.injuries) ? app.injuries : [];
      // injury lines name the game by codes ("BUF at KC"), so a nickname finds its game first
      const games = (app && Array.isArray(app.games) ? app.games : []).filter(g => teamHit(args.team, g.game, g.teams)).map(g => g.game);
      const hits = list.filter(x => teamHit(args.team, x) || games.some(g => String(x).includes(` ${g}:`)));
      return hits.length ? {injuries: hits.slice(0, 15)} : {note: "No listed starters out or doubtful for that team on DeVig's board."};
    }
    if (name === "explain_term") {
      const q = String(args.term || "").toLowerCase().trim();
      const hit = Object.entries(LINGO).filter(([k]) => k.split(" / ").some(w => w === q || (q.length >= 3 && (w.includes(q) || q.includes(w)))));
      return hit.length ? Object.fromEntries(hit.slice(0, 3)) : {note: "Not in DeVig's glossary; explain it from general betting knowledge and say so."};
    }
    if (name === "web_search") {
      if (!env.OLLAMA_API_KEY) return {note: "Web search isn't switched on. Answer from DeVig's data and say fresh news should be checked."};
      const r = await fetcher(WEB_SEARCH, {method: "POST", headers: {"content-type": "application/json", authorization: "Bearer " + env.OLLAMA_API_KEY},
        body: JSON.stringify({query: String(args.query || "").slice(0, 200), max_results: 3})});
      if (!r.ok) return {note: `Web search failed (${r.status}).`};
      const d = await r.json();
      return {results: (d.results || []).slice(0, 3).map(x => ({title: x.title, url: x.url, text: cut(String(x.content || ""), 700)}))};
    }
    return {error: `unknown tool ${name}`};
  } catch (e) {
    return {error: `${name} failed`};
  }
}
