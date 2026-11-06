// Live game alerts: what just happened in a game someone follows, turned into one ping per moment.
//
// The checker (functions/api/alerts.js) reads ESPN's game summary for each followed game that's on, and this file
// turns it into events: the start, halftime, the final, and plays (a football call like TOUCHDOWN or INTERCEPTION, a
// lead change, a late go-ahead, a basketball run of 10+). Each person's prefs pick which parts they get; one play that
// does several things is one ping ("TOUCHDOWN! KC +7" with "KC takes the lead" under it).
// A play only counts while it's fresh (when it happened, from ESPN's wallclock), so turning alerts on mid-game or a
// late checker never sends a backlog. Display only: an alert is information, never a bet.

export const LIVE_PREFS = ["start", "half", "lead", "plays", "winner", "final", "legs"];
export const FRESH_S = 8 * 60;          // a play older than this is old news
export const PER_GAME = 8;              // pings per game at most (the final always goes)
export const RUN = 10;                  // basketball: a run of this many unanswered points pings once

// ---------- football calls (the same rules as the live field's banner, web/src/lib/field-math.ts callOf) ----------
const scoreOf = p => (p && p.away_score != null && p.home_score != null ? [p.away_score, p.home_score] : null);

export function callOf(p, prev, away, home) {
  const after = scoreOf(p), before = scoreOf(prev);
  const da = after && before ? after[0] - before[0] : 0, dh = after && before ? after[1] - before[1] : 0;
  const scorer = da > 0 ? away : dh > 0 ? home : null;
  const total = after && before ? Math.max(da, dh) : null;
  const off = p.team, def = off === away ? home : off === home ? away : null;
  const ty = p.type || "", tx = p.text || "";
  const mk = (kind, word, team, pts = 0) => ({kind, word, team, pts});
  if (/touchdown/i.test(ty) || (p.scoring && /touchdown/i.test(tx))) {
    const returned = /return|recovery|blocked/i.test(ty);
    const word = /interception/i.test(ty) ? "PICK SIX!" : returned && /fumble/i.test(ty) ? "SCOOP AND SCORE!" : "TOUCHDOWN!";
    const extra = total != null ? total - 6
      : /extra point is good|kick attempt good/i.test(tx) ? 1 : /two-point.*(succeeds|good)/i.test(tx) ? 2 : 0;
    return mk("td", word, scorer || (returned ? def : off), 6 + (extra === 1 || extra === 2 ? extra : 0));
  }
  if (/field goal good/i.test(ty) || (p.scoring && /field goal is good/i.test(tx))) return mk("fg", "FIELD GOAL IS GOOD", scorer || off, 3);
  if (/safety/i.test(ty) || (p.scoring && /safety/i.test(tx))) return mk("safety", "SAFETY!", scorer || def, 2);
  if (/blocked/i.test(ty)) return mk("block", "BLOCKED!", def);
  if (/field goal missed/i.test(ty) || /field goal is no good/i.test(tx)) return mk("miss", "NO GOOD", off);
  if (/interception/i.test(ty) || (/intercepted/i.test(tx) && !/no play/i.test(tx))) return mk("int", "INTERCEPTION!", def);
  if (/fumble recovery \(opponent\)|opp fumble recovery/i.test(ty)) return mk("fumble", "FUMBLE!", def);
  return null;
}

// ---------- reading the game ----------
const num = x => { const v = parseFloat(x); return isFinite(v) ? v : null; };
const secs = c => { const m = /^(\d+):(\d{1,2})/.exec(String(c || "")); return m ? +m[1] * 60 + +m[2] : num(c); };
const REG = {cbb: 2};                   // periods in regulation (men's college basketball plays halves)
const regOf = sport => REG[sport] || 4;

export function periodName(q, sport) {
  const reg = regOf(sport);
  if (q > reg) return q === reg + 1 ? "OT" : `${q - reg}OT`;
  return reg === 2 ? `${q === 1 ? "1st" : "2nd"} half` : `Q${q}`;
}

// ESPN's summary header -> {state, half, final, away, home, as, hs}
export function statusOf(d, code) {
  const comp = (((d && d.header) || {}).competitions || [])[0] || {};
  const st = comp.status || {}, ty = st.type || {}, side = {};
  (comp.competitors || []).forEach(c => { side[c.homeAway] = {team: code((c.team || {}).abbreviation), score: num(c.score)}; });
  return {state: ty.state || "pre", half: ty.name === "STATUS_HALFTIME", final: !!ty.completed || ty.state === "post",
    away: (side.away || {}).team, home: (side.home || {}).team, as: (side.away || {}).score, hs: (side.home || {}).score};
}

// late enough that taking the lead is the go-ahead: the last 2:00 of football's 4th or OT, the last 1:00 in basketball
export function isLate(p, sport, kind) {
  const reg = regOf(sport), s = secs(p.clock);
  if (!(p.q >= reg)) return false;
  if (kind === "football" && p.q > reg) return true;              // any score in football overtime decides it
  return s != null && s <= (kind === "football" ? 120 : 60);
}
// basketball lead changes happen all game, so they only ping from the 4th (the last 5:00 of a college game) and OT
function leadCounts(p, sport, kind) {
  if (kind === "football") return true;
  const reg = regOf(sport);
  if (p.q > reg) return true;
  if (sport === "cbb") return p.q === 2 && (secs(p.clock) ?? 9999) <= 300;
  return p.q >= reg;
}

// everything that happened, as events. `plays` newest first (as the game feed sends them); `now` in ms.
export function gameEvents({sport, id, kind, kickoff}, st, plays, now) {
  const base = `ls:${sport}:${id}`, out = [], nowS = now / 1000;
  const old = (plays || []).filter(p => p && p.id).slice().reverse();    // oldest first
  const fresh = p => p.at != null && nowS - p.at <= FRESH_S && p.at <= nowS + 60;
  const score = {away: st.away, home: st.home, as: st.as, hs: st.hs};

  if (st.state === "in" || st.final) {
    const first = old.find(p => p.at != null);
    const startedRecently = first ? nowS - first.at <= 20 * 60 : now - Date.parse(kickoff) <= 40 * 60e3;
    if (st.state === "in" && startedRecently) out.push({k: "start", key: `${base}:start`, ...score});
  }
  if (st.half) out.push({k: "half", key: `${base}:half`, ...score});

  // lead changes and runs, walking the plays in order
  let leader = null, lastTake = null, runTeam = null, runPts = 0, runStart = null, runSent = false;
  let prevScored = null;
  for (const p of old) {
    const s = scoreOf(p);
    const ev = {k: "play", key: `${base}:p${p.id}`, q: p.q, clock: p.clock, as: s ? s[0] : null, hs: s ? s[1] : null,
      away: st.away, home: st.home, fresh: fresh(p)};
    let any = false;
    if (kind === "football") {
      const c = callOf(p, prevScored, st.away, st.home);
      if (c && c.team) { ev.call = c; any = true; }
    }
    if (s) {
      const lead = s[1] > s[0] ? st.home : s[0] > s[1] ? st.away : null;
      if (lead && leader && lead !== leader) {
        lastTake = {team: lead, late: isLate(p, sport, kind), q: p.q, clock: p.clock, id: p.id};
        ev.take = {...lastTake, counts: leadCounts(p, sport, kind)};
        any = true;
      }
      if (lead) leader = lead;
      prevScored = p;
    }
    if (kind === "hoops" && p.pts > 0 && p.team) {
      if (p.team !== runTeam) { runTeam = p.team; runPts = 0; runStart = p.id; runSent = false; }
      runPts += p.pts;
      if (runPts >= RUN && !runSent) { ev.run = {team: runTeam, pts: runPts}; ev.key = `${base}:run${runStart}`; runSent = true; any = true; }
    }
    if (any && ev.fresh) out.push(ev);
  }

  if (st.final) {
    const last = old.length ? old[old.length - 1] : null;
    const endedRecently = last && last.at != null ? nowS - last.at <= 40 * 60 : now - Date.parse(kickoff) <= 5 * 3600e3;
    if (endedRecently) {
      const won = st.hs > st.as ? st.home : st.as > st.hs ? st.away : null;
      out.push({k: "final", key: `${base}:final`, ...score,
        winner: lastTake && lastTake.late && lastTake.team === won ? lastTake : null});
    }
  }
  return out;
}

// ---------- one person's pings ----------
const line = e => `${e.away} ${e.as ?? 0} – ${e.home} ${e.hs ?? 0}`;
const at = (e, sport) => (e.q ? ` · ${periodName(e.q, sport)}${e.clock ? ` ${e.clock}` : ""}` : "");

// events -> messages for prefs `live` ({start, half, lead, plays, winner, final}), or [] when nothing wanted
export function compose(events, live, {sport, url}) {
  const want = live || {}, out = [];
  for (const e of events) {
    if (e.k === "start" && want.start) out.push({key: e.key, title: `${e.away} @ ${e.home} is starting`, body: "Tap to follow it live.", url});
    else if (e.k === "half" && want.half) out.push({key: e.key, title: `Halftime: ${line(e)}`, body: `${e.away} @ ${e.home}`, url});
    else if (e.k === "final" && want.final) {
      const w = want.winner && e.winner ? ` ${e.winner.team} took the lead with ${e.winner.clock} left in ${periodName(e.winner.q, sport)} and held on.` : "";
      out.push({key: e.key, final: true, title: `Final: ${line(e)}`, body: `${e.away} @ ${e.home}.${w}`, url});
    } else if (e.k === "play") {
      const call = want.plays && e.call ? e.call : null, run = want.plays && e.run ? e.run : null;
      const take = e.take && ((want.winner && e.take.late) || (want.lead && e.take.counts)) ? e.take : null;
      if (!call && !run && !take) continue;
      const takeText = take ? `${take.team} ${take.late ? `takes the lead with ${take.clock} left` : "takes the lead"}` : "";
      const title = call ? `${call.word} ${call.team}${call.pts ? ` +${call.pts}` : ""}`
        : take ? takeText : `${run.team} on a ${run.pts}–0 run`;
      const extra = call && take ? `${takeText}. ` : "";
      out.push({key: e.key, title, body: `${extra}${line(e)}${at(e, sport)}`, url});
    }
  }
  return out;
}

// ---------- which games are someone's ----------
// ★ tracked games (by ESPN id, or a pick's game id), games with a ★ tracked prop, and games on a saved parlay or a
// parlay alert. Favorite teams alone don't count: live pings are for games someone has a stake in.
export function mine(user, rec, games, decisions = []) {
  const t = (user && user.tracked) || {}, g0 = t.g || {}, props = Object.keys(t.p || {});
  const parlays = Object.values(t.parlays || {}).filter(x => x && !x.removed && Array.isArray(x.legs));
  const legs = parlays.flatMap(x => x.legs).concat(((rec && rec.parlays) || []).flatMap(p => p.legs || []));
  const pickGames = decisions.filter(d => g0[d.game_id]).map(d => d);
  const near = (a, b, h = 18) => isFinite(Date.parse(a)) && isFinite(Date.parse(b)) && Math.abs(Date.parse(a) - Date.parse(b)) < h * 3600e3;
  const dayNear = (d, g) => { const x = Date.parse(d), y = Date.parse(g.date || g.kickoff); return isFinite(x) && isFinite(y) && Math.abs(x - y) <= 1.5 * 86400e3; };
  return games.filter(g => {
    if (g0[g.espn_id]) return true;
    if (pickGames.some(d => d.sport === g.sport && d.away_team === g.away && d.home_team === g.home && near(d.kickoff_time, g.kickoff))) return true;
    if (props.some(k => { const f = k.split("|"); return f.length === 6 && f[0] === `${g.away} @ ${g.home}` && dayNear(f[1], g); })) return true;
    const code = String(g.event || "").split("-")[1];
    return legs.some(l => (l.ticker && code && String(l.ticker).toUpperCase().includes(`-${code}`)) ||
      (l.away === g.away && l.home === g.home && near(l.kickoff, g.kickoff)));
  });
}

// a saved (★ tracked) parlay's legs as they win or lose, for the "parlay legs" pref. A leg pings only while its game
// is recent, so switching this on doesn't ping last week's legs. Same key as a parlay alert's legs (leg:id:ticker:side).
export function trackedLegs(user, mkts, priced, now, sent, lately = () => true) {
  const out = [], seen = new Set(Object.keys(sent || {}).filter(k => k.startsWith("leg:")).map(k => k.split(":").slice(2).join(":")));
  const ps = Object.entries(((user && user.tracked) || {}).parlays || {}).filter(([, x]) => x && !x.removed && Array.isArray(x.legs));
  for (const [id, p] of ps) {
    const legs = p.legs.filter(l => l.ticker);
    for (const l of legs) {
      const side = l.mk === "prop" && l.side === "UNDER" ? "no" : "yes", tk = String(l.ticker).toUpperCase();
      const k = Date.parse(l.kickoff || "");
      if (!isFinite(k) || now - k > 12 * 3600e3 || k > now || seen.has(`${tk}:${side}`)) continue;
      const q = mkts[tk] ? priced(mkts[tk], side) : null;
      if (!q || (q.result !== "won" && q.result !== "lost") || !lately(mkts[tk])) continue;
      seen.add(`${tk}:${side}`);
      out.push({key: `leg:${id}:${tk}:${side}`, tag: `parlay:${id}`, title: `Parlay leg ${q.result === "won" ? "hit" : "missed"}: ${String(l.desc || l.player || tk).slice(0, 60)}`,
        body: `${legs.length}-leg parlay${p.stake ? `, $${p.stake}` : ""}.`, url: "/v2/#/history"});
    }
  }
  return out;
}
