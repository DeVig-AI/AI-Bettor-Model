// The 3D field's arithmetic, kept free of React and imports so the tests can run it under plain node: which plays to
// draw, what Kalshi's price did around each play, and short labels for ESPN's play text. See field.ts.

export type FieldPlay = {
  id: string
  team: string | null
  q: number | null
  clock: string
  text: string
  type: string
  yards: number | null
  down: string
  scoring: boolean
  drive?: number
  at?: number // unix seconds
  from?: number // yards from the away goal line (0) to the home goal line (100)
  to?: number
  fd?: number // the first-down line
}
export type PricePoint = [number, number] // [unix seconds, the home team's chance 0-1]

// the last price whose minute ended by time t (null before the first one)
export function priceAt(points: PricePoint[], t: number): number | null {
  let lo = 0, hi = points.length - 1, found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (points[mid][0] <= t) { found = mid; lo = mid + 1 } else hi = mid - 1
  }
  return found < 0 ? null : points[found][1]
}

const SKIP = /kickoff|timeout|end of|two-minute|official|coin toss|end period|end game/i
// plays that can be drawn on the field: they have a start and an end spot
export const drawable = (p: FieldPlay) => p.from != null && p.to != null && !SKIP.test(p.type)

export type Move = { play: FieldPlay; before: number; after: number; delta: number; t0: number; t1: number }

// The price around one play, for `side` (a team code): just before the play, and at least a minute after it (up to
// the next play, at most three minutes). Kalshi's history comes by the minute, so a play run in the same minute as
// the one before it shares its window.
export function moveOf(play: FieldPlay, next: FieldPlay | null, points: PricePoint[], side: 'home' | 'away', now: number): Move | null {
  if (play.at == null || !points.length) return null
  const t0 = play.at
  const t1 = Math.min(Math.max(t0 + 60, next?.at ?? now), t0 + 180, now)
  if (t1 <= t0) return null
  const b = priceAt(points, t0), a = priceAt(points, t1)
  if (b == null || a == null) return null
  const f = (v: number) => Math.round((side === 'home' ? v : 1 - v) * 100)
  const before = f(b), after = f(a)
  return { play, before, after, delta: after - before, t0, t1 }
}

// every play's move, oldest first (plays without a time are left out)
export function allMoves(plays: FieldPlay[], points: PricePoint[], side: 'home' | 'away', now = Date.now() / 1000): Move[] {
  const timed = plays.filter((p) => p.at != null && !SKIP.test(p.type)).sort((a, b) => a.at! - b.at!)
  return timed.map((p, i) => moveOf(p, timed[i + 1] ?? null, points, side, now)).filter((m): m is Move => !!m)
}

// The biggest moves, each from its own stretch of time (two plays in one minute don't both claim that minute's move)
export function biggestMoves(moves: Move[], n = 3, min = 2): Move[] {
  const out: Move[] = []
  for (const m of [...moves].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))) {
    if (Math.abs(m.delta) < min) break
    if (out.some((o) => m.t0 < o.t1 && o.t0 < m.t1)) continue
    out.push(m)
    if (out.length === n) break
  }
  return out
}

// The drive to draw: the newest one with a drawable play, oldest play first (at most `max`, the latest ones)
export function latestDrive(plays: FieldPlay[], max = 8): FieldPlay[] {
  const newest = plays.find((p) => drawable(p) && p.drive != null)
  if (!newest) return []
  return plays.filter((p) => p.drive === newest.drive && drawable(p)).reverse().slice(-max)
}

// "BAL 38" from a spot (yards from the away goal line)
export function spotText(spot: number, away: string, home: string) {
  const s = Math.round(spot)
  return s === 50 ? 'midfield' : s < 50 ? `${away} ${s}` : `${home} ${100 - s}`
}

// a play's text cut to its gist: "B.Purdy pass short right to C.McCaffrey to SF 35 for 9 yards." -> "Purdy pass to McCaffrey, 9 yds"
export function playLabel(p: FieldPlay): string {
  const base = baseLabel(p)
  // a fumble the other team recovered: the play's own words, then what it cost
  return /fumble/i.test(p.type) && /opponent/i.test(p.type) ? `${base.replace(/, -?−?\d+ yds?$/, '')}, fumble lost` : base
}

function baseLabel(p: FieldPlay): string {
  const t = p.text.trim().replace(/^\([^)]*\)\s*/, '').replace(/\s+/g, ' ')
  const nm = (s: string) => s.replace(/^[A-Z][a-z]?\.\s?/, '')
  const yds = p.yards != null && p.yards !== 0 ? `, ${p.yards > 0 ? '' : '−'}${Math.abs(p.yards)} yd${Math.abs(p.yards) === 1 ? '' : 's'}` : ''
  const N = String.raw`((?:[A-Z][a-z]?\.)?\s?[A-Za-z'-]+)` // "K.Coleman", "Coleman"
  const re = (src: string) => new RegExp(src.replace(/NAME/g, N), 'i')
  let m: RegExpMatchArray | null
  // a penalty that wiped out the play ("No Play", or a nullified score): the penalty is what happened
  if ((/^penalty$/i.test(p.type) || /no play|nullified/i.test(t)) && (m = t.match(/PENALTY on ([A-Z]{2,4})-\S+?,\s*([^,]+?),/i)))
    return `Penalty on ${m[1].toUpperCase()}: ${m[2].toLowerCase()}`
  if (/touchdown/i.test(t) && (m = t.match(re(String.raw`^(\S+)\s(?:.*? to NAME)?.*touchdown`))))
    return m[2] && /pass/i.test(t) ? `${nm(m[1])} to ${nm(m[2])}, touchdown` : `${nm(m[1])} touchdown${yds}`
  if ((m = t.match(/^(\S+) pass incomplete/i))) return `${nm(m[1])} incomplete`
  if ((m = t.match(re(String.raw`^(\S+) pass .*?intercepted by NAME`)))) return `${nm(m[1])} intercepted by ${nm(m[2])}`
  if ((m = t.match(re(String.raw`^(\S+) pass .*? to NAME`)))) return `${nm(m[1])} to ${nm(m[2])}${yds}`
  if ((m = t.match(/^(\S+) sacked/i))) return `${nm(m[1])} sacked${yds}`
  if ((m = t.match(/^(\S+) (?:\d+ yard )?field goal is (good|no good)/i))) return `${nm(m[1])} field goal ${m[2].toLowerCase() === 'good' ? 'is good' : 'missed'}`
  if ((m = t.match(/^(\S+) punts (\d+) yards?/i))) return `${nm(m[1])} punts ${m[2]} yds`
  if ((m = t.match(/PENALTY on ([A-Z]{2,4})-\S+?,\s*([^,]+?),/i))) return `Penalty on ${m[1].toUpperCase()}: ${m[2].toLowerCase()}`
  if ((m = t.match(/^(\S+) (?:up the middle|left|right|.*?)\s?(?:to|for)\b/i)) && /rush|run|left|right|middle|guard|tackle|end/i.test(p.type + ' ' + t))
    return `${nm(m[1])} run${yds}`
  return t.length > 44 ? t.slice(0, 42).trimEnd() + '…' : t.replace(/\.$/, '')
}

export type PlayKind = 'gain' | 'loss' | 'incomplete' | 'turnover' | 'score' | 'kick'
export function kindOf(p: FieldPlay): PlayKind {
  const t = `${p.type} ${p.text}`
  if (/intercept|turnover|lost|recovery \(opponent\)/i.test(p.type) || /intercepted/i.test(p.text)) return 'turnover'
  if (p.scoring || /touchdown|field goal good/i.test(p.type)) return 'score'
  if (/punt|field goal|kick/i.test(p.type)) return 'kick'
  if (/incomplet/i.test(t)) return 'incomplete'
  if ((p.yards ?? 0) < 0 || /sack/i.test(p.type)) return 'loss'
  return 'gain'
}
