// DeVig score pill on a computer (pill.html): the living-room TV dock's pill, for games watched on a Mac or PC. This file
// is the part with no page in it (tested in tests/app/pill.test.mjs): what the notes say and what the pill shows. It
// follows the TV launcher's ScoreNotes.java / ScoreDock.java so both say the same things.
//
// The feed is /api/tv?key=<TV code> (functions/api/tv.js): {settings, games, bets}. Scores are held back by the stream
// delay so the pill never shows a play before the stream does. Display only: nothing here is a bet or advice.

export const LIVE_POLL_MS = 5_000, IDLE_POLL_MS = 120_000, ROTATE_MS = 8_000, FLASH_MS = 7_000, TOAST_MS = 9_000
export const STALE_MS = 60_000, AHEAD_MS = 60_000
const LEAD_GAP_MS = 45_000, PROP_GAP_MS = 45_000, TRY_MS = 4 * 60_000
// a line move: the market's chance on a leg moving this much within MOVE_WINDOW_MS flashes; once per leg per MOVE_GAP_MS
export const MOVE_BIG = 0.12, MOVE_WINDOW_MS = 3 * 60_000, MOVE_GAP_MS = 4 * 60_000, MOVE_SHOWN = 0.03
const HEDGE_GAP_MS = 10 * 60_000

import { american, hedge } from './screen-core.js'
export { american, hedge }

export const football = (s) => s === 'NFL' || s === 'CFB'
export const basketball = (s) => s === 'NBA' || s === 'WNBA' || s === 'CBB'
const up = (s) => String(s || '').toUpperCase()

// ---------- ESPN's play text ----------
const NAME = "([A-Z][A-Za-z'.-]*\\.?[A-Za-z'-]+)"
const PASS = new RegExp(NAME + ' pass .*?to ' + NAME + ' for (\\d+) yards?', 'i')
const GAIN = new RegExp('^' + NAME + ' .*?for (\\d+) yards?')
const FG = new RegExp('^' + NAME + ' (\\d+) yard field goal is GOOD', 'i')
const strip = (s) => s.trim().replace(/^(\([^)]*\)\s*)+/, '')
const lastName = (n) => { const i = n.lastIndexOf('.'); return i >= 0 && i < n.length - 1 ? n.slice(i + 1) : n }

/** "J.Allen pass short right to D.Kincaid for 12 yards, TOUCHDOWN." -> "Allen to Kincaid, 12 yds". Null when unsure. */
export function touchdown(last) {
  if (!last || !up(last).includes('TOUCHDOWN')) return null
  const s = strip(last), u = up(s)
  if (u.includes('INTERCEPTED')) return 'Pick-six'
  if (u.includes('FUMBLE')) return 'Fumble return'
  if (u.includes('PUNT') || u.includes('KICKOFF')) return 'Return TD'
  let m = PASS.exec(s)
  if (m) return `${lastName(m[1])} to ${lastName(m[2])}, ${m[3]} yds`
  m = GAIN.exec(s)
  if (m) return `${lastName(m[1])} ${m[2]}-yd run`
  return null
}

export function fieldGoal(last) {
  if (!last) return null
  const m = FG.exec(strip(last))
  return m ? `${lastName(m[1])} from ${m[2]}` : null
}

// ---------- the game clock ----------
export function late(sport, detail) {
  const d = String(detail || '').toLowerCase()
  if (d.includes('ot')) return true
  if (sport === 'CBB') return d.includes('2nd')
  if (sport === 'NHL') return d.includes('3rd')
  return d.includes('4th')
}

/** Seconds left in the period from "2:14 - 4th" or "34.2 - 4th"; -1 when there's no clock. */
export function secondsLeft(detail) {
  const d = String(detail || '').trim()
  let m = /^(\d+):(\d+)/.exec(d)
  if (m) return +m[1] * 60 + +m[2]
  m = /^(\d+)(?:\.\d)? - /.exec(d)
  return m ? +m[1] : -1
}

/** "6:12 - 3rd" -> "Q3 6:12" (H for college basketball halves, P for hockey periods). */
export function shortClock(sport, d) {
  d = String(d || '').trim()
  if (/^halftime$/i.test(d)) return 'Half'
  const tag = sport === 'CBB' ? 'H' : sport === 'NHL' ? 'P' : 'Q'
  const m = /^(\d+:\d+(?:\.\d)?) - (\d)(?:st|nd|rd|th)$/.exec(d)
  if (m) return tag + m[2] + ' ' + m[1]
  const e = /^End of (\d)(?:st|nd|rd|th)/i.exec(d)
  if (e) return 'End ' + tag + e[1]
  return d
}

export function clock(g, now = Date.now()) {
  if (g.state === 'post') return 'Final'
  if (g.state === 'pre') {
    const k = Date.parse(g.kickoff || '')
    if (!k) return 'Soon'
    const at = new Date(k), today = new Date(now)
    const t = at.toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'})
    return at.toDateString() === today.toDateString() ? t : at.toLocaleDateString('en-US', {weekday: 'short'}) + ' ' + t
  }
  return shortClock(g.sport, g.detail)
}

const fmt = (v) => v === Math.round(v) ? String(v) : String(Math.round(v * 10) / 10)
export const money = (v) => v === Math.round(v) ? String(v) : v.toFixed(2)

/** Which of n live games the pill shows now, turning every everyMs. */
export const rotate = (n, t, everyMs) => n <= 1 ? 0 : Math.floor(t / everyMs) % n

/** A bet that just got down to its last leg (nothing lost yet): "1 leg left · MIA to win". Null otherwise. */
export function lastLeg(openWas, openNow, lost, label) {
  if (lost > 0 || openWas < 2 || openNow !== 1 || !label) return null
  return '1 leg left · ' + label
}

/** "I just saw it": how far the stream runs behind the feed, from when the feed first had the last score. Seconds, 0-180. */
export function syncDelay(now, changeAt, pollMs) {
  if (!(changeAt > 0) || now < changeAt) return -1
  const d = Math.floor((now - changeAt + pollMs / 2) / 1000)
  return d > 300 ? -1 : Math.min(180, d)
}

/** Notes worked out from one feed to the next (ScoreNotes.java). */
export class Notes {
  constructor() { this.tdAt = new Map(); this.leadAt = new Map(); this.propAt = new Map(); this.runs = new Map(); this.closeNoted = new Set() }

  /** Notes for one game between two looks at it (scores were pa–ph, now a–h). Most important first. */
  game(key, sport, away, home, pa, ph, a, h, detail, last, t) {
    const out = [], da = a - pa, dh = h - ph
    if (da < 0 || dh < 0) return out
    if (football(sport)) {
      if (da > 0) out.push(this.footballNote(key, away, da, last, t))
      if (dh > 0) out.push(this.footballNote(key, home, dh, last, t))
      return out
    }
    if (!basketball(sport) || da + dh === 0) return out
    const m = Math.abs(a - h)
    if (m >= 7) this.closeNoted.delete(key)
    const left = secondsLeft(detail)
    if (late(sport, detail) && left >= 0 && left <= 300 && m <= 3 && !this.closeNoted.has(key)) {
      this.closeNoted.add(key)
      out.push((m === 0 ? 'Tied late · ' : 'One-possession game · ') + shortClock(sport, detail))
    }
    const was = Math.sign(pa - ph), now = Math.sign(a - h)
    if (was !== 0 && now !== 0 && was !== now) {
      const at = this.leadAt.get(key)
      if (at == null || t - at >= LEAD_GAP_MS) { this.leadAt.set(key, t); out.push((now > 0 ? away : home) + ' takes the lead') }
    }
    let r = this.runs.get(key)
    if (!r) this.runs.set(key, r = [0, 0, 0, 0])
    if (da > 0 && dh > 0) r.fill(0)
    else if (da > 0) { r[0] += da; r[1] = 0; r[3] = 0 }
    else { r[1] += dh; r[0] = 0; r[2] = 0 }
    for (let side = 0; side < 2; side++) {
      const run = r[side], noted = r[side + 2]
      if (run >= 8 && noted < 8 || run >= 12 && noted < 12) {
        r[side + 2] = run
        out.push((side === 0 ? away : home) + (run === 8 || run === 11 || run === 18 ? ' on an ' : ' on a ') + run + '–0 run')
      }
    }
    return out
  }

  footballNote(key, team, d, last, t) {
    const tk = key + ':' + team, td = this.tdAt.get(tk)
    const afterTd = td != null && t - td < TRY_MS
    switch (d) {
      case 6: case 7: case 8: {
        this.tdAt.set(tk, t)
        const who = touchdown(last)
        const head = team + ' touchdown' + (d === 7 ? ' + PAT' : d === 8 ? ' + 2-pt' : '')
        return who ? head + ' · ' + who : head
      }
      case 3: { const k = fieldGoal(last); return team + ' field goal' + (k ? ' · ' + k : '') }
      case 1: return afterTd ? team + ' extra point good' : team + ' +1'
      case 2: if (afterTd) { this.tdAt.delete(tk); return team + ' 2-pt conversion good' } return team + ' safety'
      default: return team + ' scores ' + d
    }
  }

  /** A prop's number moved from was to now (state live). Null when nothing to say or it said something just now. */
  prop(legKey, who, unit, side, strike, was, now, state, t) {
    if (state !== 'live' || !Number.isFinite(now) || !Number.isFinite(strike) || !who) return null
    if (Number.isFinite(was) && now <= was) return null
    const at = this.propAt.get(legKey)
    if (at != null && t - at < PROP_GAP_MS) return null
    this.propAt.set(legKey, t)
    const head = `${who} ${fmt(now)} ${unit || ''}`.trim()
    if (side === 'no') return head + ' · ' + fmt(strike - now) + ' under the line'
    const toGo = Math.floor(strike) + 1 - now
    return toGo <= 0 ? null : head + ' · ' + fmt(toGo) + ' to go'
  }
}

const num = (v) => v == null || v === '' ? NaN : Number(v)

/** One feed from /api/tv, tidied: sport upper-cased, missing numbers as NaN. */
export function parseFeed(j, fetched) {
  const s = j && j.settings || {}
  return {
    fetched,
    settings: {show: 'teams', pos: 'corner', delay: 30, props: true, lost: true, close: true, settled: true, auto: true, quiet: true, ...s},
    games: (j && j.games || []).map((g) => ({...g, sport: up(g.sport), as: g.as | 0, hs: g.hs | 0, mine: g.mine | 0, fav: !!g.fav, last: g.last ?? null})),
    bets: (j && j.bets || []).map((b) => ({...b, n: b.n | 0, won: b.won | 0, lost: b.lost | 0, pays: +b.pays || 0, done: b.done ?? null,
      legs: (b.legs || []).map((l) => ({...l, note: l.note ?? '', side: l.side || 'yes', strike: num(l.strike), now: num(l.now), chance: prob(l.chance)}))})),
  }
}

const prob = (v) => { const n = num(v); return n != null && n >= 0 && n <= 1 ? n : null }
/** A leg's key for price tracking: its market (ticker and side) when known, so the same leg in two bets moves once. */
export const legKey = (b, l, i) => (l.ticker ? l.ticker + '~' + (l.side || 'yes') : b.id + '#' + i)

/**
 * Line moves: the price each leg had when first seen (kept by the page across reloads) and its last few minutes,
 * so a big move can flash and the card can show "from → now".
 */
export class Moves {
  constructor(from = {}) { this.from = from; this.hist = new Map(); this.saidAt = new Map(); this.changed = false }
  /** Record a leg's chance at time t; returns {was, now} when it moved MOVE_BIG within the window (and not said lately). */
  see(key, chance, t) {
    if (chance == null) return null
    if (this.from[key] == null) { this.from[key] = {p: chance, at: t}; this.changed = true }
    let h = this.hist.get(key)
    if (!h) this.hist.set(key, h = [])
    h.push([t, chance])
    while (h.length && t - h[0][0] > MOVE_WINDOW_MS) h.shift()
    let far = null
    for (const [, p] of h) if (far == null || Math.abs(chance - p) > Math.abs(chance - far)) far = p
    const said = this.saidAt.get(key)
    if (far == null || Math.abs(chance - far) < MOVE_BIG || (said != null && t - said < MOVE_GAP_MS)) return null
    this.saidAt.set(key, t)
    h.splice(0, h.length - 1)
    return {was: far, now: chance}
  }
  first(key) { const f = this.from[key]; return f ? f.p : null }
  /** Keep the newest n first-seen prices (for the page to save). */
  trim(n = 300) {
    const k = Object.keys(this.from)
    if (k.length > n) { k.sort((a, b) => this.from[a].at - this.from[b].at).slice(0, k.length - n).forEach((x) => delete this.from[x]); this.changed = true }
    return this.from
  }
}
/** "−104 → +203", or just the price when it hasn't moved MOVE_SHOWN since first seen. */
export function moveText(from, now) {
  if (now == null) return null
  return from != null && Math.abs(now - from) >= MOVE_SHOWN ? `${american(from)} → ${american(now)}` : american(now)
}

const anyLive = (f) => f.games.some((g) => g.state === 'in')
const myLive = (f) => f.games.some((g) => g.mine > 0 && g.state === 'in')
const gameOf = (f, key) => f.games.find((g) => g.key === key) || null

/**
 * The pill's state: feeds go in as they arrive (add), step(now) picks the newest one older than the stream delay,
 * notes what changed, and view(now) says what to draw. Times are wall-clock milliseconds, passed in for tests.
 */
export class Dock {
  constructor(opts = {}) {
    this.notes = new Notes()
    this.moves = new Moves(opts.from || {})
    this.hedgeAt = new Map()
    this.buffer = []
    this.shown = null
    this.flashes = []; this.flashUntil = 0; this.flashFresh = false
    this.toasts = []; this.toastUntil = 0
    this.closeDone = new Set()
    this.bump = null
    this.myDelay = opts.delay ?? null          // seconds chosen on this computer; null = the phone's TV setting
    this.changeAt = 0; this.tapAt = 0
    this.onAhead = opts.onAhead || (() => {})
  }

  newest() { return this.buffer[this.buffer.length - 1] || null }
  delay() { const top = this.newest(); return this.myDelay ?? (top ? top.settings.delay : 30) }
  pollEvery() { const s = this.shown, n = this.newest(); return s && myLive(s) || n && myLive(n) ? LIVE_POLL_MS : IDLE_POLL_MS }

  add(f) {
    const a = this.newest()
    if (a) for (const g of f.games) {
      const o = gameOf(a, g.key)
      if (g.mine > 0 && o && (g.as !== o.as || g.hs !== o.hs)) {
        this.changeAt = f.fetched - LIVE_POLL_MS / 2
        // the play they clicked for wasn't in the feed yet: the stream runs ahead of the scores, so hold nothing
        if (this.tapAt > 0 && f.fetched - this.tapAt < AHEAD_MS) {
          this.tapAt = 0; this.myDelay = 0; this.onAhead(0)
          this.toast('info', 'Your stream is ahead of the scores', 'Notes now show the moment they come in', f.fetched)
        }
        break
      }
    }
    if (this.tapAt > 0 && f.fetched - this.tapAt >= AHEAD_MS) this.tapAt = 0
    this.buffer.push(f)
    while (this.buffer.length > 50) this.buffer.shift()
  }

  /** "I just saw it" clicked: the stream delay is however long ago the feed got the last score. */
  sync(now) {
    this.tapAt = now
    const d = syncDelay(now, this.changeAt, LIVE_POLL_MS)
    if (d >= 0) { this.myDelay = d; return d }
    return -1
  }

  step(now) {
    const delayMs = this.delay() * 1000
    let pick = null
    for (const f of this.buffer) if (now - f.fetched >= delayMs) pick = f
    const top = this.newest()
    if (!pick && !this.shown && top && !anyLive(top)) pick = top   // nothing live: nothing to spoil
    if (pick && pick !== this.shown) {
      while (this.buffer.length && this.buffer[0] !== pick) this.buffer.shift()
      this.diff(this.shown, pick, now)
      this.shown = pick
    }
    if (this.toasts.length && now > this.toastUntil) { this.toasts.shift(); if (this.toasts.length) this.toastUntil = now + TOAST_MS }
    if (this.flashes.length && now > this.flashUntil) {
      this.flashes.shift()
      if (this.flashes.length) { this.flashUntil = now + FLASH_MS; this.flashFresh = true }
    }
  }

  flash(game, text, now) {
    while (this.flashes.length > 5) this.flashes.splice(1, 1)
    this.flashes.push([game, text])
    if (this.flashes.length === 1) { this.flashUntil = now + FLASH_MS; this.flashFresh = true }
  }

  toast(kind, text, sub, now) {
    if (this.toasts.length > 4) this.toasts.shift()
    this.toasts.push({kind, text, sub})
    if (this.toasts.length === 1) this.toastUntil = now + TOAST_MS
  }

  diff(a, b, t) {
    // line moves first: every feed counts, the first one too (it sets the "first seen" prices)
    for (const x of b.bets) {
      if (!x.done && !x.lost) x.legs.forEach((l, i) => {
        if (l.state === 'won' || l.state === 'lost') return
        const mv = this.moves.see(legKey(x, l, i), l.chance, t)
        if (!mv) return
        const up = mv.now > mv.was, who = l.kind === 'game' && l.team ? l.team : l.label
        const text = `${up ? '📈' : '📉'} ${who} ${american(mv.was)} → ${american(mv.now)}`
        if (l.game && gameOf(b, l.game)) this.flash(l.game, text, t)
        else this.toast(up ? 'info' : 'lost', text, x.label, t)
        const hg = hedge(x), at = this.hedgeAt.get(x.id)
        if (hg && (at == null || t - at >= HEDGE_GAP_MS)) {
          this.hedgeAt.set(x.id, t)
          this.toast('info', `Hedge: $${money(hg.stake)} against ${hg.leg.team} locks +$${money(hg.locked)}`, `Either way · ${x.label}`, t)
        }
      })
    }
    if (!a) return
    const s = b.settings
    for (const g of b.games) {
      const o = gameOf(a, g.key)
      if (!o || g.mine === 0 || g.state !== 'in' && o.state !== 'in') continue
      const said = this.notes.game(g.key, g.sport, g.away, g.home, o.as, o.hs, g.as, g.hs, g.detail, g.last, t)
      for (const n of said) this.flash(g.key, n, t)
      if (!said.length && (g.as !== o.as || g.hs !== o.hs)) this.bump = g.key
    }
    const was = new Map(a.bets.map((x) => [x.id, x]))
    for (const x of b.bets) {
      const o = was.get(x.id)
      if (!o) continue
      x.legs.forEach((l, i) => {
        const p = o.legs[i]
        if (!p) return
        if (s.props && l.kind === 'prop' && l.game) {
          const n = this.notes.prop(x.id + ':' + i, l.who, l.unit, l.side, l.strike, p.now, l.now, l.state, t)
          if (n) this.flash(l.game, n, t)
        }
        if (l.state === p.state) return
        if (l.state === 'won' && l.kind === 'prop' && s.props)
          this.toast('won', l.label + ' hit' + (l.note ? ' · ' + l.note : ''), `${x.won} of ${x.n} legs in · ${x.label}`, t)
        else if (l.state === 'lost' && s.lost)
          this.toast('lost', l.label + ' missed', x.label + (x.n > 1 ? ' is out' : ''), t)
      })
      let lastL = null
      for (const l of x.legs) if (l.state !== 'won' && l.state !== 'lost') lastL = l
      const last = lastL && lastLeg(o.n - o.won - o.lost, x.n - x.won - x.lost, x.lost, lastL.label)
      if (last && !x.done) {
        if (lastL.game && gameOf(b, lastL.game)) this.flash(lastL.game, last, t)
        else this.toast('info', last, `${x.won} of ${x.n} in · ${x.label}`, t)
      }
      if (x.done && !o.done && s.settled) {
        if (x.done === 'won') this.toast('won', '🎉 ' + x.label + ' hit', x.pays > 0 ? 'Pays $' + money(x.pays) : `All ${x.n} legs in`, t)
        else this.toast('lost', x.label + ' missed', `${x.won} of ${x.n} legs hit`, t)
      }
    }
    if (s.close) for (const g of b.games) {
      if (g.mine === 0 || g.state !== 'in' || this.closeDone.has(g.key) || !late(g.sport, g.detail) || basketball(g.sport)) continue
      const one = football(g.sport) ? 8 : g.sport === 'NHL' ? 1 : 5
      if (Math.abs(g.as - g.hs) <= one) {
        this.closeDone.add(g.key)
        this.toast('close', `Close finish: ${g.away} ${g.as}–${g.hs} ${g.home}`, shortClock(g.sport, g.detail), t)
      }
    }
  }

  topGame(now) {
    const f = this.shown
    if (!f || !f.games.length) return null
    const live = f.games.filter((g) => g.mine > 0 && g.state === 'in')
    if (live.length > 1) return live[rotate(live.length, now, ROTATE_MS)]   // my live games take turns
    return f.games[0]                                                         // the server sorts: mine, then ★, live first
  }

  topBet() {
    if (!this.shown) return null
    let best = null
    for (const b of this.shown.bets) {
      const liveBet = !b.done && b.legs.some((l) => l.state === 'live')
      if (!best || liveBet) best = b
      if (liveBet) break
    }
    return best
  }

  /** What the pill shows now: {game, note, fresh, bump, bet, toast, stale, quiet}. */
  view(now, lastOk) {
    const f = this.shown
    if (!f) return null
    const fl = this.flashes[0]
    const fg = fl ? gameOf(f, fl[0]) : null
    const game = fg || this.topGame(now)
    const fresh = !!fg && this.flashFresh
    if (fg) this.flashFresh = false
    const bump = !fg && game && game.key === this.bump
    if (bump) this.bump = null
    const b = this.topBet()
    let bet = null
    if (b) {
      const oneLeft = b.lost === 0 && !b.done && b.n - b.won === 1 && b.n > 1
      bet = {text: oneLeft ? '1 to go' : `${b.won}/${b.n}` + (b.lost > 0 ? ' ✗' : ' ✓'),
        tone: b.lost > 0 ? 'bad' : b.won === b.n ? 'good' : oneLeft ? 'gold' : 'ink'}
    }
    return {
      game, note: fg ? fl[1] : null, fresh, bump, bet,
      toast: this.toasts[0] || null,
      stale: lastOk > 0 && now - lastOk > STALE_MS && anyLive(f),
      quiet: f.settings.quiet && !anyLive(f) && !this.toasts.length && !this.flashes.length,
    }
  }
}
