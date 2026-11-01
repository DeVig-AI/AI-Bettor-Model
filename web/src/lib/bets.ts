// My bets: moneyline bets someone logs from the Fair price page (the price they got and where), graded against
// Kalshi's last price before the game (beating the close) and the final score. Kept on the device under
// devig.bets.v1 and, with an account, saved through /api/me next to tracking, so every device sees them.
// Closing prices and finals come from the model comparison's logs (tools/models_compare.py): live/models/picks.jsonl
// holds Kalshi's last hourly reading before each game, live/models/results.jsonl the finals.
import { useCallback, useSyncExternalStore } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BETS_KEY, type BetStore, type LoggedBet, CHANGED, push, read, write } from './profile'
import { type BetResult, closingValue, profitUnits } from './odds'

export type { LoggedBet }

const EMPTY: BetStore = { bets: {}, updated: 0 }
let raw: string | null | undefined
let cache: BetStore = EMPTY
function snapshot(): BetStore {
  let r: string | null = null
  try { r = localStorage.getItem(BETS_KEY) } catch { /* no storage */ }
  if (r === raw) return cache
  raw = r
  const s = read<BetStore>(BETS_KEY)
  cache = s && s.bets && typeof s.bets === 'object' ? s : EMPTY
  return cache
}
function subscribe(cb: () => void) {
  window.addEventListener(CHANGED, cb)
  window.addEventListener('storage', cb)
  return () => { window.removeEventListener(CHANGED, cb); window.removeEventListener('storage', cb) }
}
function save(s: BetStore) {
  write(BETS_KEY, { ...s, updated: Date.now() })
  window.dispatchEvent(new Event(CHANGED))
  push()
}

export function useBets() {
  const s = useSyncExternalStore(subscribe, snapshot, () => EMPTY)
  const bets = Object.values(s.bets)
    .filter((b): b is LoggedBet => !('removed' in b))
    .sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff) || Date.parse(b.at) - Date.parse(a.at))
  const add = useCallback((b: Omit<LoggedBet, 'id' | 'at'>) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    const cur = snapshot()
    save({ ...cur, bets: { ...cur.bets, [id]: { ...b, id, at: new Date().toISOString() } } })
  }, [])
  // a removed bet stays as a small marker so another device doesn't bring it back when they sync
  const remove = useCallback((id: string) => {
    const cur = snapshot()
    save({ ...cur, bets: { ...cur.bets, [id]: { removed: Date.now() } } })
  }, [])
  const restore = useCallback((b: LoggedBet) => {
    const cur = snapshot()
    save({ ...cur, bets: { ...cur.bets, [b.id]: b } })
  }, [])
  return { bets, add, remove, restore }
}

// ---------- closing prices and finals ----------
const RAW = 'https://raw.githubusercontent.com/DeVig-AI/AI-Bettor-Model/main/'
type KalshiRow = { model: string; sport: string; game_id: string; home_ml?: number; away_ml?: number; home_wp?: number; seen?: string }
type ResultRow = { sport: string; game_id: string; home_score: number; away_score: number }
export type Close = { home: number; at: string | null }

function chance(odds: number | undefined) {
  if (odds == null || !isFinite(odds) || (odds > -100 && odds < 100)) return null
  return odds < 0 ? -odds / (-odds + 100) : 100 / (odds + 100)
}
async function jsonl<T>(path: string): Promise<T[]> {
  const r = await fetch(`${RAW}${path}?t=${Math.floor(Date.now() / 60000)}`)
  if (!r.ok) return []
  return (await r.text()).split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l) as T] } catch { return [] } })
}

export function useCloses() {
  return useQuery({
    queryKey: ['bet-closes'],
    queryFn: async () => {
      const [picks, results] = await Promise.all([
        jsonl<KalshiRow>('live/models/picks.jsonl'),
        jsonl<ResultRow>('live/models/results.jsonl'),
      ])
      const closes = new Map<string, Close>()
      for (const p of picks) {
        if (p.model !== 'kalshi') continue
        // Kalshi's two asks with the fee gap split in proportion, as the Models page does
        const h = chance(p.home_ml), a = chance(p.away_ml)
        const home = h != null && a != null ? h / (h + a) : (p.home_wp ?? null)
        if (home != null) closes.set(`${p.sport}|${p.game_id}`, { home, at: p.seen ?? null })
      }
      const finals = new Map(results.map((r) => [`${r.sport}|${r.game_id}`, r]))
      return { closes, finals }
    },
    refetchInterval: 15 * 60e3,
  })
}

export type Graded = {
  bet: LoggedBet
  close: number | null // Kalshi's fair chance for the bet's side at the close
  clv: { points: number; ev: number } | null
  result: BetResult
  units: number | null // profit per 1 unit staked, once final
  started: boolean
}
export function grade(bet: LoggedBet, data: ReturnType<typeof useCloses>['data'], now = Date.now()): Graded {
  const key = `${bet.sport}|${bet.game}`
  const c = data?.closes.get(key)
  const close = c ? (bet.side === 'home' ? c.home : 1 - c.home) : null
  const f = data?.finals.get(key)
  let result: BetResult = null
  if (f) {
    const m = f.home_score - f.away_score
    result = m === 0 ? 'push' : (m > 0) === (bet.side === 'home') ? 'won' : 'lost'
  }
  return {
    bet,
    close,
    clv: close == null ? null : closingValue(bet.odds, close),
    result,
    units: result ? profitUnits(bet.odds, result) : null,
    started: Date.parse(bet.kickoff) <= now,
  }
}
