// DeVig second screen (web/public/screen.html): the pure parts, tested in tests/app/screen.test.mjs.
// How far a game has gone, where a player is headed (pace), foul trouble, and each leg's mark:
//   hit    the leg is won
//   near   about to hit: one bucket/catch away, or the market gives it 85%+
//   close  could go either way: a one-possession game late, a spread or total on a knife's edge, a prop that needs a few late
//   risk   behind pace, the market under 35% or falling fast, foul trouble, a total slowing down
//   lost / live / pre / unknown otherwise
// Display only.

export const FEED_MS = 5000, GAME_MS = 6000, NEAR_CHANCE = 0.85, RISK_CHANCE = 0.35, DROP = 0.15

// ---------- prices ----------
export function american(p) {
  if (p == null || !isFinite(p)) return '—'
  const q = Math.min(0.99, Math.max(0.01, p))
  return q >= 0.5 ? '−' + Math.round((100 * q) / (1 - q)) : '+' + Math.round((100 * (1 - q)) / q)
}
export const pct = (p) => (p == null || !isFinite(p) ? '—' : Math.round(p * 100) + '%')
export const price = (p, mode) => (mode === 'pct' ? pct(p) : american(p))
export const money = (v) => (v == null || !isFinite(v) ? '—' : '$' + v.toFixed(2))

// ---------- the game clock ----------
const PERIODS = { nba: [4, 12], wnba: [4, 10], cbb: [2, 20], nfl: [4, 15], cfb: [4, 15], nhl: [3, 20] }
// ESPN's detail: "6:12 - 3rd Quarter", "6:12 - 3rd", "34.2 - 4th", "Halftime", "End of 3rd Quarter", "2:10 - OT", "Final"
export function gameClock(detail, sport, state) {
  const [n, len] = PERIODS[sport] || [4, 12]
  const total = n * len * 60
  if (state === 'pre') return { period: 0, left: null, frac: 0, late: false, totalLeft: total }
  if (state === 'post') return { period: n, left: 0, frac: 1, late: true, totalLeft: 0 }
  const d = String(detail || '').toLowerCase()
  let period = 1, left = null
  const pm = /(\d)(?:st|nd|rd|th)/.exec(d)
  if (pm) period = +pm[1]
  if (/\bot\b|overtime/.test(d)) period = n + 1
  if (/half/.test(d) && !pm) { period = Math.ceil(n / 2); left = 0 }
  const cm = /^(\d+):(\d+)/.exec(d.trim()), sm = /^(\d+)(?:\.\d)? - /.exec(d.trim())
  if (cm) left = +cm[1] * 60 + +cm[2]
  else if (sm) left = +sm[1]
  else if (/end of|end/.test(d)) left = 0
  if (left == null) left = len * 60
  if (period > n) return { period, left, frac: 1, late: true, totalLeft: left }
  const gone = (period - 1) * len * 60 + (len * 60 - left)
  const frac = Math.min(1, Math.max(0, gone / total))
  return { period, left, frac, late: period >= n || (n === 2 && period === 2 && left <= 8 * 60), totalLeft: total - gone }
}
// "Q3 6:12", "H2 1:12", "OT 2:10"
export function clockText(g) {
  if (!g) return ''
  if (g.state === 'pre') return g.kickoff ? new Date(g.kickoff).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : 'Later'
  if (g.state === 'post') return 'Final'
  const c = gameClock(g.detail, g.sport, g.state), [n] = PERIODS[g.sport] || [4]
  const m = /^(\d+:\d+|\d+(?:\.\d)?)/.exec(String(g.detail || '').trim())
  if (/half/i.test(g.detail || '') && !/\d(st|nd|rd|th)/i.test(g.detail || '')) return 'Half'
  const p = c.period > n ? 'OT' : (n === 2 ? 'H' : g.sport === 'nhl' ? 'P' : 'Q') + c.period
  return m ? `${p} ${m[1]}` : String(g.detail || p)
}

// ---------- the box score (functions/api/live.js nbaGame box: [{team, labels, rows: [{name, stats}]}]) ----------
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, '').trim()
export function boxRow(box, name) {
  if (!Array.isArray(box) || !name) return null
  const want = fold(name), last = want.split(' ').slice(-1)[0], first = want[0]
  let hit = null, loose = []
  for (const t of box) for (const r of t.rows || []) {
    const n = fold(r.name)
    if (n === want) { hit = { t, r }; break }
    if (n.split(' ').slice(-1)[0] === last && n[0] === first) loose.push({ t, r })
  }
  if (!hit && loose.length === 1) hit = loose[0]
  if (!hit) return null
  const v = {}
  hit.t.labels.forEach((l, i) => { v[l] = hit.r.stats[i] })
  const n = (x) => { const f = parseFloat(String(x == null ? '' : x).split('-')[0]); return isFinite(f) ? f : null }
  return { team: hit.t.team, name: hit.r.name, min: n(v.MIN), pts: n(v.PTS), reb: n(v.REB), ast: n(v.AST), fg: v.FG || null, tpt: v['3PT'] || null,
    pf: n(v.PF), to: n(v.TO), pm: v['+/-'] || null }
}

// Where a player's stat ends up at this rate: stat per minute × the minutes they're likely to play.
// Their minutes so far over the share of the game gone says how big their role is; capped at 42 (NBA) / 36 (WNBA) / 38 (CBB).
const CAP = { nba: 42, wnba: 36, cbb: 38 }
export function pace(now, min, frac, sport) {
  if (now == null || !min || frac < 0.12 || !CAP[sport]) return null
  if (frac >= 1) return now
  const minutes = Math.min(CAP[sport], Math.max(min, min / frac))
  return Math.round((now / min) * minutes * 10) / 10
}

// Foul trouble: NBA 6 to foul out (4 in the first half or 5 any time is trouble), WNBA/college 5 (3 in the first half, 4 later)
export function foulTrouble(sport, pf, period) {
  if (pf == null) return false
  if (sport === 'nba') return pf >= 5 || (pf >= 4 && period <= 3) || (pf >= 3 && period <= 2)
  if (sport === 'wnba') return pf >= 4 || (pf >= 3 && period <= 2)
  if (sport === 'cbb') return pf >= 4 || (pf >= 3 && period <= 1)
  return false
}

// one possession: 3 in basketball, 8 in football, 1 in hockey
const POSS = { nba: 3, wnba: 3, cbb: 3, nfl: 8, cfb: 8, nhl: 1 }
// how many is "one more good moment" for a prop: a bucket for points, one for counting stats, a catch for yards
const NEAR = { points: 3, pts_reb_ast: 3, passing_yards: 15, rushing_yards: 10, receiving_yards: 10 }

// ---------- a leg's mark ----------
// leg: the TV feed's leg ({state, kind, now, strike, side, team, chance, stat, sport}); g: its game from the feed;
// ctx: {box (boxRow), was (chance first seen), pace}
export function mark(leg, g, ctx = {}) {
  const out = (st, why = '') => ({ st, why })
  if (leg.state === 'won') return out('hit')
  if (leg.state === 'lost') return out('lost')
  if (!g || g.state === 'pre' || leg.state === 'pre') return out('pre')
  if (leg.state === 'unknown') return out('unknown')
  const c = gameClock(g.detail, g.sport, g.state), sport = g.sport
  const ch = leg.chance, was = ctx.was
  const fell = ch != null && was != null && was - ch >= DROP
  const timeLeft = c.totalLeft != null ? fmtLeft(c.totalLeft) : ''

  if (leg.kind === 'prop' && leg.strike != null && leg.now != null) {
    const b = ctx.box, pf = b && b.pf, trouble = foulTrouble(sport, pf, c.period)
    const pc = ctx.pace != null ? ctx.pace : b ? pace(leg.now, b.min, c.frac, sport) : null
    if (leg.side === 'no') {
      const room = leg.strike - leg.now
      if (room <= 1 || (pc != null && pc > leg.strike + 1) || (ch != null && ch < RISK_CHANCE) || fell)
        return out('risk', room <= 1 ? `${fmt(room)} under the line` : pc != null && pc > leg.strike ? `On pace for ${pc}` : 'The market turned on it')
      if ((ch != null && ch >= NEAR_CHANCE) || (c.frac >= 0.9 && room >= 3)) return out('near', `${fmt(room)} under with ${timeLeft} left`)
      if (c.late && room <= 3) return out('close', `${fmt(room)} under the line late`)
      return out('live')
    }
    const need = Math.floor(leg.strike) + 1 - leg.now
    const nearN = NEAR[leg.stat] || 1
    if (trouble) return out('risk', `${pf} fouls · may sit${pc != null ? ` · on pace for ${pc}` : ''}`)
    if (need <= nearN && !(ch != null && ch < RISK_CHANCE)) return out('near', need === 1 ? '1 away' : `${need} away`)
    if (ch != null && ch >= NEAR_CHANCE) return out('near', `Needs ${need}`)
    if ((ch != null && ch < RISK_CHANCE) || fell || (pc != null && c.frac >= 0.35 && pc < Math.floor(leg.strike) + 1 - 0.5))
      return out('risk', pc != null && pc < leg.strike ? `Needs ${need} · on pace for ${pc}` : fell ? `Needs ${need} · the market dropped` : `Needs ${need}`)
    if (c.late || (ch != null && ch < 0.65 && c.frac >= 0.5)) return out('close', `Needs ${need} in ${timeLeft}`)
    return out('live')
  }

  if ((leg.kind === 'game' || leg.kind === 'spread') && leg.team) {
    const mine = leg.team === g.away ? g.as : leg.team === g.home ? g.hs : null
    const theirs = leg.team === g.away ? g.hs : g.as
    if (mine == null) return out('live')
    const line = leg.kind === 'spread' && leg.strike != null ? leg.strike : 0
    const edge = mine - theirs - line, poss = POSS[sport] || 3
    const say = leg.kind === 'spread' ? (edge > 0 ? `Covering by ${fmt(edge)}` : `${fmt(-edge)} from covering`) : edge > 0 ? `Up ${edge}` : edge < 0 ? `Down ${-edge}` : 'Tied'
    if ((ch != null && ch < RISK_CHANCE) || fell || (ch == null && edge < 0 && c.late)) return out('risk', `${say} · ${timeLeft} left`)
    if ((ch != null && ch >= NEAR_CHANCE) || (ch == null && c.frac >= 0.9 && edge > poss * 2)) return out('near', `${say} · ${timeLeft} left`)
    if (Math.abs(edge) <= poss && c.frac >= 0.5) return out('close', leg.kind === 'spread' ? `${say} · one score decides it` : `${say} · one-possession game`)
    if (ch != null && ch < 0.65 && c.late) return out('close', `${say} · ${timeLeft} left`)
    return out('live')
  }

  if (leg.kind === 'total' && leg.strike != null && g.as != null) {
    const t = g.as + g.hs, over = leg.side !== 'no', pc = c.frac >= 0.15 ? Math.round((t / c.frac) * 10) / 10 : null
    const need = Math.floor(leg.strike) + 1 - t, poss = POSS[sport] || 3
    if (over) {
      if (need <= poss && !(ch != null && ch < RISK_CHANCE)) return out('near', `${need} to go`)
      if ((ch != null && ch < RISK_CHANCE) || fell || (pc != null && c.frac >= 0.4 && pc < leg.strike - poss)) return out('risk', `Needs ${need} · on pace for ${pc}`)
      if ((ch != null && ch >= NEAR_CHANCE)) return out('near', `Needs ${need} · on pace for ${pc}`)
      if (pc != null && Math.abs(pc - leg.strike) <= poss * 2 && c.frac >= 0.5) return out('close', `Needs ${need} in ${timeLeft} · on pace for ${pc}`)
      return out('live')
    }
    const room = leg.strike - t
    if (room <= poss || (ch != null && ch < RISK_CHANCE) || fell || (pc != null && c.frac >= 0.4 && pc > leg.strike + poss)) return out('risk', `${fmt(room)} under · on pace for ${pc}`)
    if ((ch != null && ch >= NEAR_CHANCE) || (c.frac >= 0.9 && room > poss * 3)) return out('near', `${fmt(room)} under · ${timeLeft} left`)
    if (pc != null && Math.abs(pc - leg.strike) <= poss * 2 && c.frac >= 0.5) return out('close', `${fmt(room)} under · on pace for ${pc}`)
    return out('live')
  }
  if (ch != null && ch < RISK_CHANCE) return out('risk', 'The market is against it')
  if (ch != null && ch >= NEAR_CHANCE) return out('near')
  return out('live')
}
const fmt = (v) => (v === Math.round(v) ? String(v) : v.toFixed(1))
function fmtLeft(s) { const m = Math.floor(s / 60); return m >= 1 ? `${m}:${String(Math.round(s % 60)).padStart(2, '0')}` : `${Math.round(s)}s` }

// worst first, for sorting games and slips
export const RANK = { risk: 0, close: 1, near: 2, live: 3, pre: 4, unknown: 5, hit: 6, lost: 7 }

// ---------- a bet's money ----------
// worth: what the bet is worth at the market's price (pays × chance); chance: the combo's own price, else the open legs multiplied
export function betChance(b) {
  if (b.done === 'won') return 1
  if (b.done === 'lost' || b.lost) return 0
  if (b.chance != null) return b.chance
  const open = b.legs.filter((l) => l.state !== 'won')
  return open.every((l) => l.chance != null) ? open.reduce((p, l) => p * l.chance, 1) : null
}
// One leg left on a team (to win or a spread) with a price: bet the other side so you end up the same either way.
// At fair price q for the other side (1 - the leg's chance, plus 2 points for fees), a hedge of pays × q returns pays.
export function hedge(b) {
  const open = b.legs.filter((l) => l.state !== 'won')
  if (b.lost || open.length !== 1 || b.pays == null || b.stake == null) return null
  const l = open[0]
  if ((l.kind !== 'game' && l.kind !== 'spread') || l.chance == null || !l.team || l.chance >= 0.97) return null
  const q = Math.min(0.98, 1 - l.chance + 0.02), stake = Math.round(b.pays * q * 100) / 100
  const locked = Math.round((b.pays - b.stake - stake) * 100) / 100
  return locked > 0 ? { leg: l, stake, price: q, locked } : null
}
export function tonight(bets) {
  let staked = 0, all = 0, worth = 0, known = true
  for (const b of bets) {
    if (b.stake == null || b.pays == null) continue
    staked += b.stake; all += b.pays
    const c = betChance(b)
    if (c == null) known = false; else worth += b.pays * c
  }
  return { staked, all, worth: known ? worth : null }
}

// ---------- a delay buffer: the second screen waits for the stream like the pill does ----------
export class Delayed {
  constructor(keep = 400) { this.list = []; this.keep = keep }
  push(t, v) { this.list.push({ t, v }); if (this.list.length > this.keep) this.list.shift() }
  at(t) { let best = null; for (const x of this.list) if (x.t <= t) best = x; return best ? best.v : this.list.length ? null : null }
  newest() { return this.list.length ? this.list[this.list.length - 1].v : null }
}
