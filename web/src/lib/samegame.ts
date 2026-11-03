// Same-game prop legs move together. stats/props_samegame.json (tools/props_samegame_history.py) says, for past NBA
// and NHL games, how often two props from one game both hit compared with their chances multiplied, after taking
// out what pairs from different games already do. Here that turns into a corrected chance for the whole ticket.
// Descriptive, from reused prices: it corrects the multiplication, it doesn't claim an edge.
import { useQuery } from '@tanstack/react-query'
import { type Leg } from './parlay'

const RAW = 'https://raw.githubusercontent.com/DeVig-AI/AI-Bettor-Model/main/'

type Group = { pairs: number; games: number; ratio: number; factor?: number; factor_lo?: number; factor_hi?: number }
export type SameGameHistory = { sports: Record<string, { games: number; groups: Record<string, Record<string, Group>> }> }

export function useSameGameHistory() {
  return useQuery({
    queryKey: ['props_samegame'],
    queryFn: async () => {
      const r = await fetch(`${RAW}stats/props_samegame.json`)
      return r.ok ? ((await r.json()) as SameGameHistory) : null
    },
    staleTime: 6 * 3600e3,
  }).data ?? null
}

// KXNBA3PT-26JAN31DALHOU-HOUATHOMPSON1-5 -> HOU (same rule as the Python tool)
export function teamOf(ticker?: string | null) {
  const b = (ticker ?? '').split('-')
  if (b.length < 3 || b[1].length < 9) return null
  const teams = b[1].slice(7)
  for (const k of [3, 2, 4]) {
    const c = b[2].slice(0, k)
    if (teams.length > k && (teams.startsWith(c) || teams.endsWith(c))) return c
  }
  return null
}

const PARTS: Record<string, string[]> = {
  points: ['points'], rebounds: ['rebounds'], assists: ['assists'], threes: ['threes', 'points'],
  pts_reb_ast: ['points', 'rebounds', 'assists'], pts_reb: ['points', 'rebounds'], pts_ast: ['points', 'assists'],
  reb_ast: ['rebounds', 'assists'], stl_blk: ['steals', 'blocks'], steals: ['steals'], blocks: ['blocks'],
  goals: ['goals'], nhl_points: ['goals', 'assists'], nhl_assists: ['assists'], shots: ['shots', 'goals'],
}
const parts = (sport: string, stat: string) =>
  PARTS[sport === 'NHL' && (stat === 'points' || stat === 'assists') ? `nhl_${stat}` : stat] ?? [stat]

const sideOf = (l: Leg) => (l.id.endsWith('|under') ? 'under' : 'over')

export type Rel = 'same_player_overlap' | 'same_player' | 'teammates' | 'opponents'
export const REL_WORDS: Record<Rel, string> = {
  same_player_overlap: 'same player, stats that overlap',
  same_player: 'same player',
  teammates: 'teammates',
  opponents: 'opponents',
}

export type Pair = {
  a: Leg; b: Leg; rel: Rel | null
  factor: number // what to multiply their chances by (1 = no clear link)
  clear: boolean // the past-game interval leaves out 1
  games: number
}

export function pairOf(h: SameGameHistory | null, a: Leg, b: Leg): Pair {
  const base = { a, b, rel: null, factor: 1, clear: false, games: 0 }
  if (a.kind !== 'prop' || b.kind !== 'prop' || a.gameId !== b.gameId || !a.player || !b.player) return base
  const ta = teamOf(a.ticker), tb = teamOf(b.ticker)
  const samePlayer = a.player === b.player
  if (!samePlayer && (!ta || !tb)) return base
  const overlap = parts(a.sport, a.stat ?? '').some((x) => parts(b.sport, b.stat ?? '').includes(x))
  const rel: Rel = samePlayer ? (overlap ? 'same_player_overlap' : 'same_player') : ta === tb ? 'teammates' : 'opponents'
  const sa = sideOf(a), sb = sideOf(b)
  const sides = sa === sb ? `${sa}_${sb}` : 'over_under'
  const g = h?.sports[a.sport]?.groups[rel]?.[sides]
  if (!g || g.factor == null) return { ...base, rel }
  const clear = (g.factor_lo ?? 1) > 1 || (g.factor_hi ?? 1) < 1
  return { a, b, rel, factor: clear ? g.factor : 1, clear, games: g.games }
}

// The chance every leg hits, legs from one game corrected for each other:
//  * lines of the same player and stat are exact: two Overs need the higher line, Over a + Under b is pO + pU - 1;
//  * other pairs in one game: the chances multiplied, times each pair's past-game factor, never above the least
//    likely leg.
export function sameGameChance(legs: Leg[], h: SameGameHistory | null, pick: (l: Leg) => number | null) {
  const byGame = new Map<string, Leg[]>()
  legs.forEach((l) => byGame.set(l.gameId, [...(byGame.get(l.gameId) ?? []), l]))
  let total = 1
  const pairs: Pair[] = []
  for (const g of byGame.values()) {
    // same player + stat: fold into one "leg" with an exact chance
    const units: { leg: Leg; p: number }[] = []
    const ladder = new Map<string, Leg[]>()
    for (const l of g) {
      const k = l.kind === 'prop' && l.player && l.stat ? `${l.player}|${l.stat}` : l.id
      ladder.set(k, [...(ladder.get(k) ?? []), l])
    }
    for (const ls of ladder.values()) {
      const ps = ls.map(pick)
      if (ps.some((p) => p == null)) return { chance: null, pairs }
      if (ls.length === 1) { units.push({ leg: ls[0], p: ps[0]! }); continue }
      const overs = ls.map((l, i) => ({ l, p: ps[i]! })).filter((x) => sideOf(x.l) === 'over')
      const unders = ls.map((l, i) => ({ l, p: ps[i]! })).filter((x) => sideOf(x.l) === 'under')
      const o = overs.length ? overs.reduce((m, x) => (x.p < m.p ? x : m)) : null // hardest Over
      const u = unders.length ? unders.reduce((m, x) => (x.p < m.p ? x : m)) : null // hardest Under
      const p = o && u ? Math.max(0, o.p + u.p - 1) : (o ?? u)!.p
      units.push({ leg: (o ?? u)!.l, p })
    }
    let p = units.reduce((m, u) => m * u.p, 1)
    for (let i = 0; i < units.length; i++)
      for (let j = i + 1; j < units.length; j++) {
        const pr = pairOf(h, units[i].leg, units[j].leg)
        if (pr.rel) pairs.push(pr)
        p *= pr.factor
      }
    total *= Math.min(p, ...units.map((u) => u.p))
  }
  return { chance: total, pairs }
}

// Kalshi's and DeVig's whole-ticket chance, corrected for same-game legs
export function adjustedMath(legs: Leg[], h: SameGameHistory | null) {
  const m = sameGameChance(legs, h, (l) => l.fair)
  const anyDevig = legs.some((l) => l.devig != null)
  const d = anyDevig ? sameGameChance(legs, h, (l) => l.devig ?? l.fair) : null
  const ladderDupes = new Set(legs.filter((l) => l.kind === 'prop').map((l) => `${l.gameId}|${l.player}|${l.stat}`)).size <
    legs.filter((l) => l.kind === 'prop').length
  return { market: m.chance, devig: d?.chance ?? null, pairs: m.pairs, changed: ladderDupes || m.pairs.some((p) => p.factor !== 1) }
}
