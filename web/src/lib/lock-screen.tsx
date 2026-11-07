import { useEffect, useMemo, useRef } from 'react'
import { type GameRow, useFinals, useGames } from '@/lib/devig'
import { trackedParlays, useTracked } from '@/lib/track'
import { type Graded, useGradedParlays } from '@/features/history/parlays'

// iPhone lock-screen cards (Live Activities), in the DeVig iPhone app only. ONLY what you track gets a card: a game you
// starred (★) and a parlay you saved. Nothing else on the board ever shows. Untracking ends the card right away.
// A game gets its card from an hour before the start until it's final; a parlay from an hour before its first leg until
// it hits or misses. The app sends the full list on every change and the native side starts, updates and ends cards
// to match (at most 5). There's no push, so cards only change while DeVig is open.

type State = {
  away: string
  home: string
  awayScore: number | null
  homeScore: number | null
  phase: 'pre' | 'in' | 'post'
  detail: string
  note: string
  legs: string[]
}
export type Item = { id: string; kind: 'game' | 'parlay'; sport: string; title: string; awayColor: string; homeColor: string; state: State }

type Bridge = { getPlatform?: () => string; nativePromise?: (plugin: string, method: string, opts: object) => Promise<unknown> }
const bridge = (): Bridge | null => {
  const c = (window as unknown as { Capacitor?: Bridge }).Capacitor
  return c?.getPlatform?.() === 'ios' && typeof c.nativePromise === 'function' ? c : null
}

const SOON = 60 * 60e3
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const pct = (p: number) => `${Math.round(p * 100)}%`
const hex = (c?: string) => (c ? (c.startsWith('#') ? c : `#${c}`) : '')

function gameNote(g: GameRow) {
  const p = g.pick
  if (!p) return 'No DeVig pick on this game'
  if (p.action !== 'PASS' && p.side) {
    const head = `DeVig: ${p.side}${p.prob != null ? ` ${pct(p.prob)}` : ''}`
    if (g.state === 'post' && p.correct != null) return `${head} · ${p.correct ? 'hit' : 'missed'}`
    return `${head} · not proven`
  }
  return p.lean ? `DeVig passed · leaned ${p.lean}${p.leanProb != null ? ` ${pct(p.leanProb)}` : ''}` : 'DeVig passed on this game'
}

function gameItem(g: GameRow, now: number): Item | null {
  const start = Date.parse(g.kickoff)
  if (g.state === 'pre' && !(isFinite(start) && start - now <= SOON)) return null
  if (g.state === 'post' && isFinite(start) && now - start > 12 * 3600e3) return null
  return {
    id: `game:${g.trackKey}`,
    kind: 'game',
    sport: g.sport,
    title: `${g.away} @ ${g.home}`,
    awayColor: hex(g.colors?.away),
    homeColor: hex(g.colors?.home),
    state: {
      away: g.away,
      home: g.home,
      awayScore: g.state === 'pre' ? null : g.awayScore,
      homeScore: g.state === 'pre' ? null : g.homeScore,
      phase: g.state,
      detail: g.state === 'pre' && isFinite(start) ? `Starts ${timeFmt.format(start)}` : g.detail || (g.state === 'post' ? 'Final' : 'Live'),
      note: gameNote(g),
      legs: [],
    },
  }
}

function parlayItem(p: Graded, now: number): Item | null {
  const first = Math.min(...p.legs.map((l) => (l.kickoff ? Date.parse(l.kickoff) : Infinity)).filter(isFinite))
  if (p.status === 'upcoming' && !(isFinite(first) && first - now <= SOON)) return null
  const won = p.states.filter((s) => s.st === 'won').length
  const live = p.states.filter((s) => s.st === 'live').length
  const phase = p.status === 'hit' || p.status === 'missed' ? 'post' : p.status === 'live' ? 'in' : 'pre'
  const liveLeg = p.states.findIndex((s) => s.st === 'live')
  const money = (v: number) => `$${Number.isInteger(v) ? v : v.toFixed(2)}`
  return {
    id: `parlay:${p.id}`,
    kind: 'parlay',
    sport: 'Parlay',
    title: `${p.legs.length}-leg parlay · ${money(Number(p.stake) || 0)} → ${money(Math.round(p.payout * 100) / 100)}`,
    awayColor: '',
    homeColor: '',
    state: {
      away: '',
      home: '',
      awayScore: null,
      homeScore: null,
      phase,
      detail: p.status === 'hit' ? 'Hit' : p.status === 'missed' ? 'Missed'
        : phase === 'pre' && isFinite(first) ? `Starts ${timeFmt.format(first)}`
        : `${won} of ${p.legs.length} hit${live ? ` · ${live} live` : ''}`,
      note: liveLeg >= 0 ? `Live: ${p.legs[liveLeg].desc} · ${p.states[liveLeg].note}` : p.states.find((s) => s.st === 'pending')?.note || '',
      legs: p.states.map((s) => s.st),
    },
  }
}

// everything that should be on the lock screen right now, live first (the native side keeps the first 5)
export function useLockItems(): Item[] {
  const { tracked } = useTracked()
  const { rows } = useGames()
  const { finals } = useFinals()
  const parlays = useGradedParlays(useMemo(() => trackedParlays(tracked), [tracked]))
  return useMemo(() => {
    const now = Date.now()
    const keys = tracked.g ?? {}
    const seen = new Set<string>()
    const games: Item[] = []
    for (const g of [...rows, ...finals]) {
      if (!(g.trackKey in keys) || seen.has(g.trackKey)) continue // tracked games only
      seen.add(g.trackKey)
      const it = gameItem(g, now)
      if (it) games.push(it)
    }
    const items = [...games, ...parlays.map((p) => parlayItem(p, now)).filter((x): x is Item => !!x)]
    const rank = { in: 0, pre: 1, post: 2 }
    return items.sort((a, b) => rank[a.state.phase] - rank[b.state.phase])
  }, [tracked, rows, finals, parlays])
}

// true inside the DeVig iPhone app (not Safari, not the Home Screen web app)
export const inIPhoneApp = () => bridge() !== null

// whether iOS lets DeVig show lock-screen cards (off in Settings → DeVig → Live Activities, or iOS before 16.2)
export async function lockScreenOn(): Promise<boolean> {
  const b = bridge()
  if (!b) return false
  try {
    const r = (await b.nativePromise!('DeVigLive', 'available', {})) as { value?: boolean }
    return !!r?.value
  } catch { return false }
}

function Sync() {
  const payload = useLockItems()
  const sent = useRef('')

  useEffect(() => {
    const b = bridge()
    if (!b) return
    const json = JSON.stringify(payload)
    if (json === sent.current) return
    sent.current = json
    b.nativePromise!('DeVigLive', 'sync', { items: payload }).catch(() => { sent.current = '' })
  }, [payload])
  return null
}

// mounted once in the app layout; does nothing outside the iPhone app
export function LockScreenSync() {
  return bridge() ? <Sync /> : null
}
