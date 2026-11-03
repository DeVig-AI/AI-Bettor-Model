// Plain-English wording for props, for the "New to this" reading level: what a side needs, a chance as "about 7 in 10",
// and what $10 pays. The numbers are the same at every level; only the words change.
import { type PropLine, propSide, statName } from '@/lib/props'

const PLAIN: Record<string, string> = {
  pts_reb_ast: 'points, rebounds and assists combined', pts_reb: 'points and rebounds combined',
  pts_ast: 'points and assists combined', reb_ast: 'rebounds and assists combined', threes: 'three-pointers',
  shots: 'shots on goal', pass_yds: 'passing yards', rush_yds: 'rushing yards', rec_yds: 'receiving yards',
}
export const plainStat = (s: string) => PLAIN[s] ?? statName(s).toLowerCase()

const half = (line: number) => Math.abs(line - Math.floor(line) - 0.5) < 1e-9
const one = (n: number, s: string) => (n === 1 && !s.includes('combined') ? s.replace(/s$/, '') : s)
// "about 1 3-pointer", "about 19 points"
export const count = (n: number, stat: string) => `${n} ${one(n, plainStat(stat))}`

// "15 or more points" / "14 or fewer points"; "a touchdown" / "no touchdown"
export function needs(stat: string, line: number, over: boolean) {
  if (stat === 'touchdowns' && line === 0.5) return over ? 'at least 1 touchdown' : 'no touchdown'
  if (half(line)) {
    const n = over ? line + 0.5 : line - 0.5
    if (n === 0) return `no ${plainStat(stat)}`
    return `${n} or ${over ? 'more' : 'fewer'} ${one(n, plainStat(stat))}`
  }
  return `${over ? 'more' : 'fewer'} than ${line} ${plainStat(stat)}`
}

// the side's short label inside the bar: "15 or more" / "14 or fewer"
export function sideShort(stat: string, line: number, over: boolean) {
  if (stat === 'touchdowns' && line === 0.5) return over ? 'Scores a TD' : 'No TD'
  if (half(line)) return over ? `${line + 0.5} or more` : line === 0.5 ? 'None' : `${line - 0.5} or fewer`
  return over ? `Over ${line}` : `Under ${line}`
}

export function inTen(p: number) {
  if (p >= 0.095 && p <= 0.905) return `about ${Math.round(p * 10)} in 10`
  if (p < 0.095) return `about 1 in ${Math.max(11, Math.round(1 / Math.max(p, 0.001)))}`
  const n = Math.max(11, Math.round(1 / Math.max(1 - p, 0.001)))
  return `about ${n - 1} in ${n}`
}

// how far DeVig is from Kalshi, in words
export function gapWords(gap: number) {
  const a = Math.abs(gap)
  if (a < 0.02) return 'about the same'
  return `${a < 0.08 ? 'a little' : 'a lot'} ${gap > 0 ? 'higher' : 'lower'}`
}

// what one side costs and pays on a $10 bet, Kalshi's fee included; break-even is the chance it has to beat
export function payout(l: Pick<PropLine, 'bid' | 'ask'>, over: boolean, stake = 10) {
  const ps = propSide(l, over ? 'over' : 'under')
  if (!ps || !(ps.cost > 0 && ps.cost < 1)) return null
  const back = stake / ps.cost
  return { cost: ps.cost, back, profit: back - stake, breakEven: ps.cost, fair: ps.fair, spread: ps.spread }
}

export const money = (x: number) => `$${x.toFixed(2)}`
export const cents = (x: number) => `${Math.round(x * 100)}¢`
