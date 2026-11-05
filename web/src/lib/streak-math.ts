// Streaks, pure (no imports) so node tests can load it: which of a game's prop lines each player reached in every one
// of their last 10 games, from the stats bot's game logs. Only the hardest such line per player and stat is kept,
// as tools/props_streak_history.py measures them. Counts and Kalshi's price, nothing else: a streak is not a pick.

export const STREAK = 10
// soccer: a player rarely reaches even a goal or an assist 10 matches running (7 at most on 2026-11-05), so 5
export const streakLen = (sport: string) => (sport === 'SOCCER' ? 5 : STREAK)
const MAX_SPREAD = 0.06
// a game only counts when the player was on the floor / ice (the NFL logs list games played only)
const PLAYED: Record<string, string> = { NBA: 'min', NHL: 'toi' }

export type StreakLine = { player: string; stat: string; line: number; bid: number | null; ask: number | null; oi: number; ticker: string | null }
export type StreakPlayer = { id: string | number; name: string; team: string; log: (string | number | null)[][] } // log newest first
export type Streak<T extends StreakLine> = { l: T; mid: number; team: string; pid: string; need: number; last: number[] }

export const normName = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

const value = (g: (string | number | null)[], L: Record<string, number>, cols: string[]) => {
  let v = 0
  for (const c of cols) {
    const y = g[L[c]]
    if (y == null || L[c] == null) return null
    v += Number(y)
  }
  return v
}

// The player's last n played games for one stat, oldest first; null when fewer than n or a value is missing
function lastN(p: StreakPlayer, sport: string, L: Record<string, number>, cols: string[], n: number) {
  const pc = PLAYED[sport]
  const out: number[] = []
  for (const g of p.log) {
    if (pc && L[pc] != null && !(Number(g[L[pc]]) > 0)) continue
    const v = value(g, L, cols)
    if (v == null) return null
    out.push(v)
    if (out.length === n) return out.reverse()
  }
  return null
}

export function streaks<T extends StreakLine>(
  sport: string, lines: T[], players: StreakPlayer[], L: Record<string, number>, hit: [string, string, string[]][],
): Streak<T>[] {
  const cols = new Map(hit.map(([k, , c]) => [k, c]))
  const who = new Map(players.map((p) => [normName(p.name), p]))
  const best = new Map<string, Streak<T>>()
  const tens = new Map<string, number[] | null>()
  const n = streakLen(sport)
  for (const l of lines) {
    const c = cols.get(l.stat)
    const p = who.get(normName(l.player))
    const b = l.bid, a = l.ask
    if (!c || !p || b == null || a == null || !(b > 0 && b <= a && a < 1 && a - b <= MAX_SPREAD)) continue
    const tk = `${normName(l.player)}|${l.stat}`
    if (!tens.has(tk)) tens.set(tk, lastN(p, sport, L, c, n))
    const last = tens.get(tk)
    const need = l.line + 0.5 // Kalshi's "N+" lines are stored as N - 0.5
    if (!last || last.some((v) => v < need)) continue
    const cur = best.get(tk)
    if (!cur || l.line > cur.l.line) best.set(tk, { l, mid: (a + b) / 2, team: p.team, pid: String(p.id), need, last })
  }
  return [...best.values()].sort((x, y) => (y.l.oi || 0) - (x.l.oi || 0) || x.mid - y.mid)
}

// What past streaks did (stats/props_streaks.json), in a sentence: [before, bold part, after]. The bold part reads the
// measured interval for the difference, so it never says more than the numbers do; too few lines say so instead.
export type StreakSummary = { rungs: number; games: number; hit: number; kalshi: number; diff_95: [number, number]; seasons: string[] }
export const MIN_MEASURED = 200
export function streakNote(sport: string, s: StreakSummary | null | undefined): [string, string, string] {
  const none = "so there's no record yet of how they did against Kalshi's price."
  if (!s) return [`Past ${sport} streaks aren't measured yet, ${none}`, '', '']
  if (s.rungs < MIN_MEASURED) return [`Too few past ${sport} streaks to measure (${s.rungs.toLocaleString('en-US')} lines), ${none}`, '', '']
  const pct = (p: number) => `${Math.round(p * 100)}%`
  const when = s.seasons.length === 1 ? `${s.seasons[0]} ` : ''
  const [lo, hi] = s.diff_95
  const how = lo > 0 ? 'more often than the price said' : hi < 0 ? 'less often than the price said' : 'about as often as the price said'
  return [
    `Past streaks: `,
    `on ${when}${sport} games, a line a player had hit 10 games in a row hit the next one ${pct(s.hit)} of the time, when Kalshi had it at ${pct(s.kalshi)}`,
    ` (${s.rungs.toLocaleString('en-US')} lines), ${how}. A streak is already in the price; it isn't a pick.`,
  ]
}
