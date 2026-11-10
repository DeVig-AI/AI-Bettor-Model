// Facts for Ask's "why" questions, worked out here so a small model only has to read them, not do the math:
//   - a player's game log against each prop line (hit 9 of last 10, average vs the line, minutes),
//   - how Kalshi lines at that price did on past games (stats/props_ladder.json),
//   - what 10-game streaks did against the price (stats/props_streaks.json),
//   - a team's season (record, margin, schedule-adjusted rating, pace, offense/defense ranks, last results).
// All from files the stats bot already publishes; nothing here is a pick or a new model.

const RAW = "https://raw.githubusercontent.com/DeVig-AI/AI-Bettor-Model/main/";
const PLAYED = {NBA: "min", NHL: "toi"};          // a game only counts when the player was on the floor / ice
const ALIAS = {CFB: {AFA: "AF", BUFF: "BUF"}};    // same as web/src/lib/research.ts
export const STAT_SPORTS = ["NBA", "NHL", "NFL", "CBB", "CFB", "MLB"];

// one fetch per file per question, however many tools ask for it (Pages Functions cap subrequests)
export async function getJson(path, ctx) {
  const cache = ctx.cache || (ctx.cache = new Map());
  if (!cache.has(path)) {
    cache.set(path, (async () => {
      try {
        const r = await ctx.fetcher(RAW + path, {headers: {accept: "application/json"}, cf: {cacheTtl: 300, cacheEverything: true}});
        return r.ok ? await r.json() : null;
      } catch (e) { return null; }
    })());
  }
  return cache.get(path);
}

const ord = n => { const t = n % 100, o = n % 10; return `${n}${t >= 11 && t <= 13 ? "th" : o === 1 ? "st" : o === 2 ? "nd" : o === 3 ? "rd" : "th"}`; };
export const normName = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const pct = p => `${Math.round(p * 100)}%`;
const r1 = x => Math.round(x * 10) / 10;
const teamFile = (sport, code) =>
  `stats/${sport.toLowerCase()}/team_${String((ALIAS[sport] || {})[code] || code).toUpperCase().replace(/[^A-Z0-9]/g, "_")}.json`;

// "15+ points" for Kalshi's N+ lines (stored as N - 0.5), "over 220.5" otherwise; need = the value that wins
export function lineWords(stat, line) {
  const half = Math.abs((line % 1) - 0.5) < 1e-9;
  return half ? {bet: `${line + 0.5}+ ${stat}`, need: line + 0.5} : {bet: `over ${line} ${stat}`, need: line + 1e-9};
}

// the player's played games, newest first, as [{date, opp, ha, v (the stat), min}]
function playedLog(p, idx, cols, sport) {
  const L = Object.fromEntries((idx.log_cols || []).map((c, i) => [c, i]));
  const pc = PLAYED[sport];
  const out = [];
  for (const g of p.log || []) {
    if (pc && L[pc] != null && !(Number(g[L[pc]]) > 0)) continue;
    let v = 0;
    for (const c of cols) {
      if (L[c] == null || g[L[c]] == null) { v = null; break; }
      v += Number(g[L[c]]);
    }
    if (v == null) continue;
    out.push({date: g[L.date], opp: g[L.opp], ha: g[L.ha], v, min: pc && L[pc] != null ? Number(g[L[pc]]) : null,
      season: L.season != null ? g[L.season] : null});
  }
  return out;
}

// how Kalshi overs at about this price did on past games: "lines priced 60-70% hit 62% (5,196 lines)"
export function ladderFact(ladder, sport, stat, chance, side = "over") {
  const s = ladder && ladder.sports && ladder.sports[sport];
  if (!s || chance == null || !(chance > 0 && chance < 1)) return null;
  const t = s.table && s.table[side];
  if (!t) return null;
  const b = String(Math.min(9, Math.floor(chance * 10)));
  const min = ladder.min_n || 100;
  const pick = t[stat] && t[stat][b] && t[stat][b].n >= min ? [t[stat][b], stat] : t.all && t.all[b] && t.all[b].n >= min ? [t.all[b], "all props"] : null;
  if (!pick) return null;
  const [c, which] = pick;
  const gap = c.hit - c.paid;
  const how = Math.abs(gap) < 0.015 ? "about as often as the price said" : gap < 0 ? "less often than the price said" : "more often than the price said";
  return `Past ${sport} ${side}s (${which}) Kalshi priced ${b * 10}-${b * 10 + 10}% cost ${pct(c.paid)} on average and hit ${pct(c.hit)} ` +
    `(${c.n.toLocaleString("en-US")} lines, ${(s.seasons || []).join(" and ")}): ${how}. Descriptive, not a pick.`;
}

export function streakFact(streaks, sport) {
  const s = streaks && streaks.sports && streaks.sports[sport];
  if (!s || s.rungs < 200) return `Past ${sport} 10-game streaks aren't measured yet against Kalshi's price.`;
  const [lo, hi] = s.diff_95 || [0, 0];
  const how = lo > 0 ? "more often than the price said" : hi < 0 ? "less often than the price said" : "about as often as the price said";
  return `On ${(s.seasons || []).join(", ")} ${sport} games, a line a player had hit 10 games in a row hit the next one ${pct(s.hit)} ` +
    `of the time when Kalshi had it at ${pct(s.kalshi)} (${s.rungs.toLocaleString("en-US")} lines): ${how}. A streak is already in the price.`;
}

// A player's numbers against tonight's lines. g = the props export game, rows = that player's lines (props export rows).
export async function playerFacts(sport, g, rows, ctx) {
  const [idx, away, home, ladder, streaks] = await Promise.all([
    getJson(`stats/${sport.toLowerCase()}/index.json`, ctx),
    getJson(teamFile(sport, g.away_team), ctx), getJson(teamFile(sport, g.home_team), ctx),
    getJson("stats/props_ladder.json", ctx), getJson("stats/props_streaks.json", ctx)]);
  const name = normName(rows[0].player);
  let team = null, p = null;
  for (const t of [away, home]) {
    const hit = t && (t.players || []).find(x => normName(x.name) === name);
    if (hit) { team = t; p = hit; break; }
  }
  const cols = new Map(((idx && idx.hit_stats) || []).map(([k, , c]) => [k, c]));
  const out = {lines: [], facts: []};
  if (team) {
    const opp = team === away ? home : away;
    out.team = team.code;
    if (opp && opp.this) {
      out.opponent = {team: opp.code, record: opp.this.record, allows_per_game: opp.this.oppg, defense_rank: opp.ranks && opp.ranks.drtg,
        pace: opp.this.pace, teams_in_league: idx && idx.teams ? idx.teams.length : null};
    }
  }
  let anyStreak = false, settled = false;
  out.recent = {};                                   // per stat, once: his last 10 values and averages
  for (const x of rows) {
    const k = x.k || {};
    const mid = k.bid != null && k.ask != null && k.bid >= 0 && k.ask <= 1 && k.bid <= k.ask ? (k.bid + k.ask) / 2 : x.k_mid ?? null;
    const {bet, need} = lineWords(x.stat, x.line);
    const line = {bet, kalshi_chance: mid == null ? null : Math.round(mid * 100) / 100,
      kalshi_yes_cost_cents: k.ask > 0 && k.ask < 1 ? Math.round(k.ask * 100) : null,
      devig_props_model_chance: x.model_p ?? null, props_model_expected: x.expected ?? null};
    if (mid != null && (mid >= 0.97 || mid <= 0.03)) { line.note = "Kalshi has this as all but decided."; settled = true; }
    const c = cols.get(x.stat);
    if (p && idx && c) {
      const log = playedLog(p, idx, c, sport);
      const season = log.filter(e => e.season === log[0]?.season);
      const last10 = log.slice(0, 10);
      if (last10.length) {
        if (!out.recent[x.stat]) {
          const avg = l => r1(l.reduce((a, e) => a + e.v, 0) / l.length);
          const before = log.slice(10, 40);
          out.recent[x.stat] = {last_games_oldest_first: last10.map(e => e.v).reverse(), avg_last10: avg(last10),
            avg_this_season: season.length ? avg(season) : null, avg_before_last10: before.length ? avg(before) : null};
        }
        const hits10 = last10.filter(e => e.v >= need).length;
        line.hit_last10 = `${hits10} of ${last10.length}`;
        if (season.length) line.hit_this_season = `${season.filter(e => e.v >= need).length} of ${season.length}`;
        if (last10.length === 10 && hits10 === 10) anyStreak = true;
        const am = k.ask > 0 && k.ask < 1 ? (k.ask >= 0.5 ? -Math.round(100 * k.ask / (1 - k.ask)) : `+${Math.round(100 * (1 - k.ask) / k.ask)}`) : null;
        line.says = `${p.name} reached ${bet} in ${hits10} of his last ${last10.length} games` +
          (season.length && season.length !== last10.length ? ` (${line.hit_this_season} this season)` : "") +
          `, averaging ${out.recent[x.stat].avg_last10} over those games. ` +
          (mid != null ? `Kalshi has it at ${pct(mid)}${am != null ? ` (${am} to buy yes)` : ""}.` : "Kalshi has no price on it right now.");
        // the comparisons in words, so a small model can't flip them
        const av = out.recent[x.stat].avg_last10, rate = hits10 / last10.length;
        line.says += ` His recent average is ${av > need * 1.15 ? "well above" : av >= need ? "a little above" : av > need * 0.85 ? "a little below" : "well below"} the line.`;
        if (mid != null && !line.note) {
          const d = rate - mid;
          line.says += ` He hit it ${pct(rate)} of those games, ${Math.abs(d) < 0.08 ? "close to" : d > 0 ? "more than" : "less than"} Kalshi's ${pct(mid)}; ` +
            `${last10.length} games is a small sample, so that alone isn't value.`;
        }
        if (mid != null && !line.note) {
          const lf = ladderFact(ladder, sport, x.stat, mid);
          if (lf) line.past_lines_at_this_price = lf;
        }
      }
    }
    out.lines.push(line);
  }
  const started = g.kickoff_time && Date.parse(g.kickoff_time) < (ctx.now || Date.now());
  if (started) out.facts.push("This game has started: Kalshi's prices are live and include what has happened so far; the game counts are from before tonight.");
  else if (settled) out.facts.push("A price near 0% or 100% means the market sees it as settled; check whether the game or the player's status changed.");
  if (p) {
    const pc = PLAYED[sport];
    const log = pc && idx ? playedLog(p, idx, [pc], sport) : [];
    if (log.length >= 3) {
      out.minutes_last5 = log.slice(0, 5).map(e => r1(e.v)).reverse();   // NHL toi is in minutes too
      if (p.this && p.this.min != null) out.minutes_this_season = p.this.min;
    }
    if (p.this && p.this.gp != null) out.games_this_season = p.this.gp;
  } else {
    out.facts.push("This player's game log isn't in DeVig's stats files, so recent games can't be counted.");
  }
  if (anyStreak) out.facts.push(streakFact(streaks, sport));
  return out;
}

// A team's season from the stats files. q = team name/code; sport optional.
export async function teamFacts(q, sport, ctx, teamHit) {
  const sports = sport ? [sport] : STAT_SPORTS;
  for (const sp of sports) {
    const idx = await getJson(`stats/${sp.toLowerCase()}/index.json`, ctx);
    const row = idx && (idx.teams || []).find(t => teamHit(q, t.code, t.name || ""));
    if (!row) continue;
    const t = await getJson(teamFile(sp, row.code), ctx);
    const n = (idx.teams || []).length;
    const out = {sport: sp, team: row.code, name: row.name, season: idx.season, teams_in_league: n,
      rating: row.rating, rating_rank: row.rank, rating_means: idx.rating_note};
    if (t && t.this) {
      const s = t.this;
      out.this_season = {games: s.gp, record: s.record, home: s.home, away: s.away, last10: s.last10, streak: s.streak, points_for: s.ppg ?? s.gf,
        points_against: s.oppg ?? s.ga, margin: s.margin, pace: s.pace, offense_rating: s.ortg, defense_rating: s.drtg};
      if (t.ranks) out.ranks = t.ranks;
      if (t.last) out.last_season = {record: t.last.record, margin: t.last.margin};
      out.last5 = (t.games || []).slice(0, 5).map(g => `${g[0]} ${g[2] === "H" ? "vs" : "at"} ${g[1]} ${g[5] || ""} ${g[3]}-${g[4]}`.replace(/\s+/g, " "));
      const unit = sp === "NHL" ? "goals" : sp === "MLB" ? "runs" : "points";
      const facts = [`${row.name} are ${s.record} and ${s.margin >= 0 ? "outscore" : "are outscored by"} opponents by ${Math.abs(s.margin)} ${unit} a game. ` +
        `Schedule-adjusted rating ${row.rating} (${row.rating >= 0 ? "better" : "worse"} than an average team by ${Math.abs(row.rating)} ${unit} a game), ${ord(row.rank)} of ${n}.`];
      if (row.rating != null && s.margin != null && Math.abs(row.rating - s.margin) >= 2) {
        facts.push(row.rating < s.margin
          ? `Their margin (${s.margin}) is better than their schedule-adjusted rating (${row.rating}): they've had an easier schedule than most.`
          : `Their schedule-adjusted rating (${row.rating}) is better than their margin (${s.margin}): they've faced a tougher schedule than most.`);
      }
      if (s.gp != null && s.gp < 15) facts.push(`Only ${s.gp} games played: early records are noisy, and the rating still leans on last season.`);
      out.facts = facts;
    }
    return out;
  }
  return null;
}

// Two teams side by side, for "why is the line close when X has the better record": what each measure says.
export function compareFacts(a, b, line) {
  const out = [];
  const A = a.this_season || {}, B = b.this_season || {};
  const unit = a.sport === "NHL" ? "goals" : a.sport === "MLB" ? "runs" : "points";
  out.push(`Records: ${a.team} ${A.record}, ${b.team} ${B.record}.`);
  if (A.margin != null && B.margin != null) out.push(`Margin per game: ${a.team} ${A.margin > 0 ? "+" : ""}${A.margin}, ${b.team} ${B.margin > 0 ? "+" : ""}${B.margin}.`);
  if (a.rating != null && b.rating != null) {
    const gap = Math.round(Math.abs(a.rating - b.rating) * 10) / 10;
    const [hi, lo] = a.rating >= b.rating ? [a, b] : [b, a];
    // in words, not signs: small models misread "-2.1" as "2.1 better"
    const rate = t => `${t.team} rates ${ord(t.rating_rank)} of ${t.teams_in_league}, ${Math.abs(t.rating)} ${unit} a game ${t.rating >= 0 ? "better" : "worse"} than an average team`;
    out.push(`Schedule-adjusted ratings: ${rate(a)}; ${rate(b)}. So ${hi.team} is about ${gap} ${unit} a game better than ${lo.team}.`);
    if (hi.team !== (wins(A.record) >= wins(B.record) ? a.team : b.team)) out.push(`The better record and the better rating point to different teams.`);
    // say what the margin-vs-rating gap means, so it can't be read backwards
    for (const t of [a, b]) {
      const m = t.this_season && t.this_season.margin;
      if (m == null || Math.abs(t.rating - m) < 2) continue;
      out.push(t.rating < m
        ? `${t.team}'s margin (${m}) is better than its rating (${t.rating}) because it has played weaker opponents than most; the rating is the fairer number.`
        : `${t.team}'s rating (${t.rating}) is better than its margin (${m}) because it has played stronger opponents than most; the rating is the fairer number.`);
    }
  }
  if (line && line.kalshi_odds && line.market_fair_home != null) {
    const home = String(line.game).split(" at ")[1], away = String(line.game).split(" at ")[0];
    const fav = line.market_fair_home >= 0.5 ? home : away, p = Math.max(line.market_fair_home, 1 - line.market_fair_home);
    out.push(`Kalshi's line: ${away} ${line.kalshi_odds[away]}, ${home} ${line.kalshi_odds[home]} (${home} at home)` +
      `${line.spread ? `, spread ${line.spread}` : ""}. ${fav} is the favorite at ${pct(p)} with Kalshi's fee removed.`);
  }
  const gp = Math.min(A.games ?? 99, B.games ?? 99);
  if (gp < 15) out.push(`Only about ${gp} games each: records this early are noisy, and markets lean on longer-run strength.`);
  return out;
}
const wins = rec => { const [w, l] = String(rec || "0-0").split("-").map(Number); return w / Math.max(1, w + l); };

// A player with no Kalshi lines up yet (his next game isn't priced): his game log from the stats files anyway, for the
// stats that fit his position, and how often he reached any number the user asked about ("200 passing yards").
// row = his index.players row [id, name, team, pos, ...]; checks = [{stat, need}] parsed from the question.
const POS_STATS = {
  QB: ["passing_yards", "passing_tds", "rushing_yards", "rushing_attempts"],
  RB: ["rushing_yards", "rushing_attempts", "receptions", "rush_rec_yards"],
  WR: ["receptions", "receiving_yards"], TE: ["receptions", "receiving_yards"],
};
const SPORT_STATS = {NBA: ["points", "rebounds", "assists", "threes"], NHL: ["goals", "assists", "points", "shots"]};
export async function logOnlyFacts(sport, row, checks, ctx) {
  const idx = await getJson(`stats/${sport.toLowerCase()}/index.json`, ctx);
  const team = await getJson(teamFile(sport, row[2]), ctx);
  const p = team && (team.players || []).find(x => normName(x.name) === normName(row[1]));
  if (!idx || !p) return null;
  const hs = new Map((idx.hit_stats || []).map(([k, label, c]) => [k, {label, c}]));
  const want = [...new Set([...checks.map(c => c.stat), ...(SPORT_STATS[sport] || POS_STATS[row[3]] || [])])].filter(k => hs.has(k));
  const out = {player: p.name, team: row[2], position: row[3], stats: {}, checks: []};
  for (const k of want.slice(0, 6)) {
    const {label, c} = hs.get(k);
    const log = playedLog(p, idx, c, sport);
    if (!log.length) continue;
    const season = log.filter(e => e.season === log[0].season), last10 = log.slice(0, 10);
    const avg = l => r1(l.reduce((a, e) => a + e.v, 0) / l.length);
    out.stats[label] = {last_games_oldest_first: last10.map(e => e.v).reverse(), avg_last10: avg(last10),
      avg_this_season: season.length ? avg(season) : null, games_this_season: season.length};
    for (const ck of checks.filter(x => x.stat === k)) {
      const h10 = last10.filter(e => e.v >= ck.need).length, hs_ = season.filter(e => e.v >= ck.need).length;
      out.checks.push({asked: `${ck.need}+ ${label.toLowerCase()}`, hit_last10: `${h10} of ${last10.length}`,
        hit_this_season: `${hs_} of ${season.length}`,
        says: `${p.name} had ${ck.need}+ ${label.toLowerCase()} in ${h10} of his last ${last10.length} games and ${hs_} of ${season.length} this season ` +
          `(average ${avg(last10)} over his last ${last10.length}, ${avg(last10) >= ck.need ? "at or above" : "below"} ${ck.need}).`});
    }
  }
  if (checks.length > 1 && out.checks.length === checks.length) {
    // both at once, game by game
    const logs = checks.map(ck => new Map(playedLog(p, idx, hs.get(ck.stat).c, sport).map(e => [e.date, e.v])));
    const dates = playedLog(p, idx, hs.get(checks[0].stat).c, sport).slice(0, 10).map(e => e.date);
    const both = dates.filter(d => checks.every((ck, i) => (logs[i].get(d) ?? -1) >= ck.need)).length;
    out.all_together = `All of those in the same game: ${both} of his last ${dates.length}.`;
  }
  out.facts = ["Kalshi hasn't posted prop lines for his next game yet, so there's no price or DeVig props-model chance; these are only his past games, not a pick."];
  return out;
}
