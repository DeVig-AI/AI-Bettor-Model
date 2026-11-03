import { useCallback, useSyncExternalStore } from 'react'
import type { GameRow } from '@/lib/devig'
import type { PropLine } from '@/lib/props'
import { CHANGED, TRACK_KEY, type Tracked, push, read, write } from '@/lib/profile'

// ★ Track: games and props someone follows. Same localStorage key and the same key formats as the classic app,
// so anything tracked in one app shows in the other, and the account copy (/api/me) carries it to every device.
//   game: the pick's game_id when DeVig has one (classic's key), else the ESPN id
//   prop: "AWAY @ HOME|YYYY-MM-DD|player|stat|line|OVER" (or UNDER)

const EMPTY: Tracked = { g: {}, p: {} }
let raw: string | null | undefined
let cache: Tracked = EMPTY
function snapshot(): Tracked {
  let r: string | null = null
  try { r = localStorage.getItem(TRACK_KEY) } catch { /* no storage */ }
  if (r === raw) return cache
  raw = r
  const t = read<Tracked>(TRACK_KEY)
  cache = t && t.g && t.p ? t : EMPTY
  return cache
}
function subscribe(cb: () => void) {
  window.addEventListener(CHANGED, cb)
  window.addEventListener('storage', cb)
  return () => { window.removeEventListener(CHANGED, cb); window.removeEventListener('storage', cb) }
}
function save(t: Tracked) {
  write(TRACK_KEY, { ...t, updated: Date.now() }) // tracked parlays (classic's Parlay tab) ride along untouched
  window.dispatchEvent(new Event(CHANGED))
  push()
}

export const gameKey = (r: GameRow) => r.trackKey
export const propKey = (l: Pick<PropLine, 'away' | 'home' | 'kickoff' | 'player' | 'stat' | 'line'>, side: 'OVER' | 'UNDER') =>
  `${l.away} @ ${l.home}|${String(l.kickoff || '').slice(0, 10)}|${l.player}|${l.stat}|${l.line}|${side}`

export function useTracked() {
  const t = useSyncExternalStore(subscribe, snapshot, () => EMPTY)
  const set = useCallback((kind: 'g' | 'p', keys: string[], on: boolean) => {
    const cur = snapshot()
    const next = { ...cur, [kind]: { ...cur[kind] } }
    for (const k of keys) { if (on) next[kind][k] = Date.now(); else delete next[kind][k] }
    save(next)
  }, [])
  const clear = useCallback(() => save({ ...snapshot(), g: {}, p: {} }), [])
  return { tracked: t, set, clear }
}

// a prop counts as tracked whichever side was tracked (classic tracks a side; here one star covers the line)
export const propSides = (l: Parameters<typeof propKey>[0]) => [propKey(l, 'OVER'), propKey(l, 'UNDER')]

// what a tracked prop key says, for keys whose line isn't on the board anymore
export function parsePropKey(k: string) {
  const f = k.split('|')
  if (f.length !== 6 || f[0] === 'SPREAD') return null
  const [away, home] = f[0].split(' @ ')
  return { away, home, date: f[1], player: f[2], stat: f[3], line: Number(f[4]), side: f[5] }
}

// ---------- tracked parlays: a saved slip with its stake, in the same shape as classic's Parlay tab ----------
// legs: {desc, odds, game, when, kind, mk:"ml"|"prop", side:"home"|"away" (ml) or "OVER"|"UNDER" (prop),
//        player, stat, line, sport, away, home, kickoff, gkey, ticker}
export type TrackedLeg = {
  desc: string
  odds: number
  game?: string
  when?: string
  kind?: string
  mk?: string
  side?: string
  player?: string
  stat?: string
  line?: number
  point?: number
  sport?: string
  away?: string
  home?: string
  kickoff?: string | null
  gkey?: string
  ticker?: string
}
export type TrackedParlay = { id: string; at: string; stake: number; odds: number; legs: TrackedLeg[] }

export function trackedParlays(t: Tracked): TrackedParlay[] {
  const ps = t.parlays && typeof t.parlays === 'object' ? t.parlays : {}
  return Object.entries(ps)
    .map(([id, x]) => ({ id, ...x }) as TrackedParlay & { removed?: number })
    .filter((x) => !x.removed && Array.isArray(x.legs))
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))
}

// saves a parlay and returns its id (classic's id format, which the account copy accepts)
export function saveParlay(p: Omit<TrackedParlay, 'id' | 'at'>) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  const cur = snapshot()
  save({ ...cur, parlays: { ...(cur.parlays ?? {}), [id]: { at: new Date().toISOString(), stake: p.stake, odds: p.odds, legs: p.legs.slice(0, 15) } } })
  return id
}
// a removal is kept as a tombstone, so the account copy and other devices drop it too
export function removeParlay(id: string) {
  const cur = snapshot()
  save({ ...cur, parlays: { ...(cur.parlays ?? {}), [id]: { removed: Date.now() } } })
}
