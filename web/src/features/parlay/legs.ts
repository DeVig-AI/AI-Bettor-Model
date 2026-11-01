import { type GameRow } from '@/lib/devig'
import { type Leg } from '@/lib/parlay'
import { type LivePrice, type PropLine, overTxt, priceToAmerican, propSide, underTxt } from '@/lib/props'

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
    ticker: kalshiTeam(r.ticker, side),
  }
}

// Kalshi's market for one team: the home ticker is on the board (KXNFLGAME-26NOV01ATLTB-TB); the away team's code is
// what's left of the event's teams (ATLTB) once the home code (TB) is taken off the end
export function kalshiTeam(home: string | null | undefined, side: 'away' | 'home') {
  if (!home) return null
  if (side === 'home') return home
  const [series, ev, code] = home.split('-')
  const teams = /^\d{2}[A-Z]{3}\d{2}(.+)$/.exec(ev ?? '')?.[1]
  return code && teams?.endsWith(code) && teams.length > code.length ? `${series}-${ev}-${teams.slice(0, -code.length)}` : null
}

// A player prop side as a parlay leg, priced at Kalshi's live price when we have one (fee included)
export function propLeg(l: PropLine, side: 'over' | 'under', live?: LivePrice | null): Leg | null {
  const priced = live ? { ...l, bid: live.bid, ask: live.ask } : l
  const ps = propSide(priced, side)
  if (!ps) return null
  const odds = priceToAmerican(ps.cost)
  if (odds == null) return null
  const last = l.player.split(' ').slice(-1)[0]
  const devig = l.modelOver == null ? null : side === 'over' ? l.modelOver : 1 - l.modelOver
  return {
    id: `${l.key}|${side}`,
    kind: 'prop',
    label: `${last} ${side === 'over' ? overTxt(l.stat, l.line) : underTxt(l.stat, l.line)}`,
    short: last,
    game: `${l.away} at ${l.home}`,
    gameId: `${l.sport}|${l.gameKey}`,
    sport: l.sport,
    kickoff: l.kickoff,
    odds: Math.round(odds),
    fair: ps.fair,
    devig,
    devigNote: devig == null ? null : 'props model: Kalshi beat it on past games',
    colors: null,
    sideIsHome: null,
    ticker: l.ticker,
  }
}
