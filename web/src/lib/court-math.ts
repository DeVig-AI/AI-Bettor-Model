// The NBA court's arithmetic, kept free of React so the tests can run it under plain node: which shots
// to draw, what Kalshi's price did around each play, and short labels for ESPN's play text. Plays come from
// functions/api/live.js nbaGame (newest first; the newest 80 in full, then older buckets and turnovers).
// Display only: a price move is what happened around a play, not proof the play caused it.
import { type Move, type PricePoint, moveOf } from './field-math'

export type CourtPlay = {
  id: string
  team: string | null
  q: number | null
  clock: string
  text: string
  type: string
  pts: number
  away_score: number | null
  home_score: number | null
  shot: { x: number; y: number; made: boolean } | null // feet: x 0-50 across, y out from the baseline
  at?: number // unix seconds
}


// the buckets to play on the court: the newest `n` scoring plays, oldest first
export function recentBuckets(plays: CourtPlay[], n = 8): CourtPlay[] {
  return plays.filter((p) => p.pts > 0).sort((a, b) => (b.at ?? 0) - (a.at ?? 0)).slice(0, n).reverse()
}

// who set it up: "(James Harden assists)" -> "Harden"
export function assistOf(p: CourtPlay): string | null {
  const m = /\((.+?) assists\)/i.exec(p.text)
  return m ? lastName(m[1]) : null
}

const SUFFIX = /^(jr\.?|sr\.?|ii|iii|iv)$/i
function lastName(full: string) {
  const w = full.trim().split(/\s+/)
  while (w.length > 1 && SUFFIX.test(w[w.length - 1])) w.pop()
  return w[w.length - 1] ?? full
}

// "25-ft three", "dunk", "layup", "14-ft jumper"
function shotWhat(t: string) {
  const ft = /(\d+)-foot/i.exec(t)?.[1]
  if (/three point/i.test(t)) return ft ? `${ft}-ft three` : 'three'
  if (/dunk/i.test(t)) return 'dunk'
  if (/layup|finger roll|tip/i.test(t)) return /tip/i.test(t) ? 'tip-in' : 'layup'
  if (/hook/i.test(t)) return ft ? `${ft}-ft hook` : 'hook'
  if (/float/i.test(t)) return ft ? `${ft}-ft floater` : 'floater'
  return ft ? `${ft}-ft jumper` : 'jumper'
}

// ESPN's text cut to its gist: "Donovan Mitchell makes 25-foot three point step back jumpshot (James Harden assists)"
// -> "Mitchell 25-ft three"; "Ajay Mitchell blocks Meleek Thomas 's 2-foot driving floating jump shot" -> "Thomas
// floater, blocked by Mitchell"
export function courtLabel(p: CourtPlay): string {
  const t = p.text.replace(/\s+/g, ' ').replace(/\s'/g, "'").trim()
  let m: RegExpMatchArray | null
  if ((m = t.match(/^(.+?) blocks (.+?)'s (.*)$/i))) return `${lastName(m[2])} ${shotWhat(m[3])}, blocked by ${lastName(m[1])}`
  if ((m = t.match(/^(.+?) (makes|misses) (?:technical )?free throw/i))) return `${lastName(m[1])} free throw${m[2].toLowerCase() === 'misses' ? ' missed' : ''}`
  if ((m = t.match(/^(.+?) (makes|misses) (.*?)(?: \(.*\))?$/i))) return `${lastName(m[1])} ${shotWhat(m[3])}${m[2].toLowerCase() === 'misses' ? ', missed' : ''}`
  if (/turnover/i.test(p.type) && (m = t.match(/^(.+?) (bad pass|lost ball|traveling|offensive foul|shot clock|out of bounds|.*?turnover)/i)))
    return `${lastName(m[1])} turnover${/\((.+?) steals\)/i.test(t) ? `, ${lastName(/\((.+?) steals\)/i.exec(t)![1])} steal` : ''}`
  return t.length > 44 ? t.slice(0, 42).trimEnd() + '…' : t.replace(/\.$/, '')
}

// plays that can carry a price move: shots, made free throws, turnovers
const counts = (p: CourtPlay) => p.at != null && (!!p.shot || p.pts > 0 || /turnover/i.test(p.type))

// every such play's move for `side`, oldest first: the price just before it and a minute or so after (up to the next
// such play, at most three minutes)
export function courtMoves(plays: CourtPlay[], points: PricePoint[], side: 'home' | 'away', now = Date.now() / 1000): Move<CourtPlay>[] {
  const timed = plays.filter(counts).sort((a, b) => a.at! - b.at!)
  return timed.map((p, i) => moveOf(p, timed[i + 1] ?? null, points, side, now)).filter((m): m is Move<CourtPlay> => !!m)
}

// "OKC 59 – CLE 48" after a play
export function scoreAfter(p: CourtPlay, away: string, home: string) {
  return p.away_score == null || p.home_score == null ? '' : `${away} ${p.away_score} – ${home} ${p.home_score}`
}
