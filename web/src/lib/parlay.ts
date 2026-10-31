// The parlay slip: legs the reader added (tapping a team on a plate, a prop, or "Use this ticket" from the long-shot
// builder), kept on this device. Each leg carries what the explainer needs: the price you'd pay (fee included, as
// American odds), the market's fair chance for it, and DeVig's own chance when DeVig has a model for it.
import { useCallback, useSyncExternalStore } from 'react'
import { impliedProb } from './devig'

export type Leg = {
  id: string // stable: sport|game|side (or prop key|over/under)
  kind: 'ml' | 'prop'
  label: string // "POR to win", "Schröder 5 or fewer ast"
  short: string // "POR", "Schröder"
  game: string // "POR at UTA"
  gameId: string
  sport: string
  kickoff: string
  odds: number // American, Kalshi price with its fee
  fair: number | null // the market's fair chance (fee gap removed)
  devig: number | null // DeVig's chance for this leg, if it has a model
  devigNote: string | null // what DeVig's number is ("NBA Model C", "props model: has lost to Kalshi on past games")
  colors: { away: string; home: string } | null
  sideIsHome: boolean | null
  ticker?: string | null
}

const KEY = 'devig_slip_v2'
const listeners = new Set<() => void>()
let cache: Leg[] | null = null
let fallback: Leg[] = []

function read(): Leg[] {
  if (cache) return cache
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]')
    cache = Array.isArray(v) ? v : []
  } catch {
    cache = fallback
  }
  return cache!
}
function write(legs: Leg[]) {
  cache = legs
  fallback = legs
  try {
    localStorage.setItem(KEY, JSON.stringify(legs))
  } catch {
    /* private mode: the slip lasts for this visit */
  }
  listeners.forEach((l) => l())
}

export function useSlip() {
  const legs = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    read,
    () => []
  )
  const toggle = useCallback((leg: Leg) => {
    const cur = read()
    write(cur.some((l) => l.id === leg.id) ? cur.filter((l) => l.id !== leg.id) : [...cur, leg])
  }, [])
  const remove = useCallback((id: string) => write(read().filter((l) => l.id !== id)), [])
  const replace = useCallback((next: Leg[]) => write(next), [])
  const has = useCallback((id: string) => legs.some((l) => l.id === id), [legs])
  return { legs, toggle, remove, replace, has }
}

export function decimal(american: number) {
  return american > 0 ? 1 + american / 100 : 1 + 100 / -american
}
export function toAmerican(dec: number) {
  return dec >= 2 ? (dec - 1) * 100 : -100 / (dec - 1)
}

export type SlipMath = {
  dec: number
  american: number
  needs: number // chance needed to break even at this payout
  market: number | null // all legs hit, by the market's fair chances
  devig: number | null // all legs hit, using DeVig where it has a number and the market elsewhere
  devigLegs: number // how many legs DeVig has its own number for
  sameGame: string[] // games with more than one leg (their legs move together; this math can't price that)
}
export function slipMath(legs: Leg[]): SlipMath {
  const dec = legs.reduce((m, l) => m * decimal(l.odds), 1)
  const market = legs.every((l) => l.fair != null) ? legs.reduce((m, l) => m * (l.fair as number), 1) : null
  const devigLegs = legs.filter((l) => l.devig != null).length
  const devig = devigLegs && market != null ? legs.reduce((m, l) => m * (l.devig ?? (l.fair as number)), 1) : null
  const count = new Map<string, number>()
  legs.forEach((l) => count.set(l.gameId, (count.get(l.gameId) ?? 0) + 1))
  return {
    dec,
    american: toAmerican(dec),
    needs: 1 / dec,
    market,
    devig,
    devigLegs,
    sameGame: [...count.entries()].filter(([, n]) => n > 1).map(([g]) => g),
  }
}

// How DeVig reads one leg against the market
export function legRead(l: Leg): { tag: string; tone: 'good' | 'bad' | 'even' | 'none' } {
  if (l.devig == null || l.fair == null) return { tag: 'Market only', tone: 'none' }
  const gap = l.devig - l.fair
  if (gap >= 0.03) return { tag: 'DeVig agrees', tone: 'good' }
  if (gap <= -0.03)
    return { tag: l.kind === 'prop' || l.devig < 0.5 ? 'DeVig is less sure' : 'Agrees on winner, not price', tone: 'bad' }
  return { tag: 'About even with Kalshi', tone: 'even' }
}

export { impliedProb }
