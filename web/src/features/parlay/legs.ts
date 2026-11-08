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
  if (r.tickers3) return soccerLeg(r, side)
  const odds = side === 'home' ? r.ml?.home : r.ml?.away
  if (odds == null || !isFinite(odds) || odds === 0) return null
  const code = side === 'home' ? r.home : r.away
  const fair = r.fairHome == null ? null : side === 'home' ? r.fairHome : 1 - r.fairHome
  const p = r.pick
  // the model's chance for this team: its pick, or on a pass the side it leaned to (a pass means the lean didn't clear
  // the bar to bet, not that the model has no number)
  const passed = !(p?.side && p.prob != null && p.action !== 'PASS')
  const team = passed ? p?.lean : p?.side
  const chance = passed ? p?.leanProb : p?.prob
  const devig = team && chance != null ? (team === code ? chance : 1 - chance) : null
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
    devigLean: devig != null && passed,
    devigNote: devig == null ? null : passed ? `${r.sport} model's lean (it passed on betting this game)` : `${r.sport} model, locked pregame`,
    colors: away && home ? { away, home } : null,
    sideIsHome: side === 'home',
    ticker: kalshiTeam(r.ticker, side),
  }
}

// One of a soccer match's three outcomes as a leg: a team to win in 90 minutes (plus stoppage), or the draw. Each is
// its own Kalshi market, bought as Yes; a draw loses both team legs. No DeVig model for soccer.
export function soccerLeg(r: GameRow, o: 'home' | 'draw' | 'away'): Leg | null {
  const odds = r.ml3?.[o]
  const ticker = r.tickers3?.[o]
  if (odds == null || !isFinite(odds) || odds === 0 || !ticker) return null
  const code = o === 'home' ? r.home : o === 'away' ? r.away : null
  const away = hex(r.colors?.away)
  const home = hex(r.colors?.home)
  return {
    id: `${r.id}|${o}`,
    kind: 'ml',
    label: code ? `${code} to win` : `${r.home}–${r.away} draw`,
    short: code ?? 'Draw',
    game: `${r.away} at ${r.home}`,
    gameId: r.id,
    sport: r.sport,
    kickoff: r.kickoff,
    odds: Math.round(odds),
    fair: r.three?.[o] ?? null,
    devig: null,
    devigNote: null,
    colors: code && away && home ? { away, home } : null,
    sideIsHome: code ? o === 'home' : null,
    outcome: o,
    ticker,
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
    player: l.player,
    stat: l.stat,
    line: l.line,
  }
}

// Kalshi's own buy link for one leg: its market opens with Yes or No already picked (the format Kalshi's connector hands
// out); you put the money in and submit on Kalshi. Kalshi fills in the page name itself. A prop's over is Yes, its
// under is No; a team to win is Yes on that team's market. One market per link: Kalshi has no link for a whole combo.
export function kalshiBuy(leg: Leg): { url: string; side: 'yes' | 'no' } | null {
  const t = leg.ticker
  const parts = t ? t.split('-') : []
  if (!t || parts.length < 3) return null
  const side = leg.kind === 'prop' && leg.id.endsWith('|under') ? 'no' : 'yes'
  const q = new URLSearchParams({ marketTicker: t, orderSide: side, op_market_ticker: t, op_order_side: side, op_side: 'BUY', op_order_type: 'dollars' })
  return { url: `https://kalshi.com/markets/${parts[0].toLowerCase()}/x/${parts.slice(0, 2).join('-').toLowerCase()}?${q}`, side }
}
