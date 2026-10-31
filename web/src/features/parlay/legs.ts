import { type GameRow } from '@/lib/devig'
import { type Leg } from '@/lib/parlay'

const hex = (c?: string | null) => {
  if (!c) return null
  const v = c.startsWith('#') ? c : `#${c}`
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : null
}

// A team to win, as a parlay leg: Kalshi's price for that side (fee included), the market's fair chance, and DeVig's
// chance when its model picked a side for this game (its chance for the other side is 1 minus that).
export function mlLeg(r: GameRow, side: 'away' | 'home'): Leg | null {
  const odds = side === 'home' ? r.ml?.home : r.ml?.away
  if (odds == null || !isFinite(odds) || odds === 0) return null
  const code = side === 'home' ? r.home : r.away
  const fair = r.fairHome == null ? null : side === 'home' ? r.fairHome : 1 - r.fairHome
  const p = r.pick
  const devig = p?.side && p.prob != null && p.action !== 'PASS' ? (p.side === code ? p.prob : 1 - p.prob) : null
  const away = hex(r.colors?.away)
  const home = hex(r.colors?.home)
  return {
    id: `${r.id}|${side}`,
    kind: 'ml',
    label: `${code} to win`,
    short: code,
    game: `${r.away} at ${r.home}`,
    gameId: r.id,
    sport: r.sport,
    kickoff: r.kickoff,
    odds: Math.round(odds),
    fair,
    devig,
    devigNote: devig == null ? null : `${r.sport} model, locked pregame`,
    colors: away && home ? { away, home } : null,
    sideIsHome: side === 'home',
  }
}
