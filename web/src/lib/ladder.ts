// A player's prop ladder: every line Kalshi offers for one player, stat and game (1+, 2+, 3+ threes...), each priced
// the way you'd pay it (fee included), with how often bets at that price hit on past games (stats/props_ladder.json,
// built by tools/props_ladder_history.py). Descriptive only: DeVig doesn't claim any rung beats Kalshi.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { type LivePrice, type PropLine, fetchLiveProps, propSide, useProps } from './props'

const RAW = 'https://raw.githubusercontent.com/DeVig-AI/AI-Bettor-Model/main/'

type Cell = { n: number; paid: number; hit: number }
type History = {
  sports: Record<string, { seasons: string[]; table: Record<string, Record<string, Record<string, Cell>>> }>
}

export function useLadderHistory() {
  return useQuery({
    queryKey: ['props_ladder_history'],
    queryFn: async () => {
      const r = await fetch(`${RAW}stats/props_ladder.json`)
      return r.ok ? ((await r.json()) as History) : null
    },
    staleTime: 6 * 3600e3,
  }).data ?? null
}

// past bets on this side of this stat bought at about this price (stat's own row when it has one, else all stats)
export function pastHit(h: History | null, sport: string, side: 'over' | 'under', stat: string, price: number) {
  const t = h?.sports[sport]?.table[side]
  if (!t) return null
  const b = String(Math.min(9, Math.max(0, Math.floor(price * 10))))
  const c = t[stat]?.[b] ?? t.all?.[b]
  return c ? { ...c, stat: t[stat]?.[b] ? stat : 'all', seasons: h!.sports[sport].seasons } : null
}

export type Rung = {
  l: PropLine
  side: 'over' | 'under'
  chance: number // Kalshi's midpoint for this side
  model: number | null // DeVig's props model for this side
  price: number // what you pay, before the fee
  cost: number // fee included
  current: boolean
  safe: boolean // the parlay-safe pick: the hardest rung both DeVig and Kalshi give 70%+
  skip: Rung | null // an easier rung that costs the same or less (this one is strictly worse)
  crossed: Rung | null // the opposite side of this rung's neighbour + this rung pay $1 whatever happens, for less than $1
}

const SAFE = 0.7

// Rungs for one side, easiest (most likely) first
export function buildLadder(lines: PropLine[], cur: PropLine, side: 'over' | 'under', live: Record<string, LivePrice>): Rung[] {
  const same = lines.filter((x) => x.sport === cur.sport && x.gameKey === cur.gameKey && x.player === cur.player && x.stat === cur.stat)
  const rs: Rung[] = []
  for (const x0 of same) {
    const lv = x0.ticker ? live[x0.ticker] : undefined
    const x = lv ? { ...x0, bid: lv.bid, ask: lv.ask } : x0
    const ps = propSide(x, side)
    // a rung that pays almost nothing (95c+) or is a lottery ticket (3c or less) isn't worth a row, unless it's this one
    if (!ps || (x.key !== cur.key && (ps.cost >= 0.95 || ps.price <= 0.03))) continue
    const model = x.modelOver == null ? null : side === 'over' ? x.modelOver : 1 - x.modelOver
    rs.push({ l: x, side, chance: ps.fair, model, price: ps.price, cost: ps.cost, current: x.key === cur.key, safe: false, skip: null, crossed: null })
  }
  // easiest first: overs on low lines, unders on high lines
  rs.sort((a, b) => (side === 'over' ? a.l.line - b.l.line : b.l.line - a.l.line))
  for (let i = 1; i < rs.length; i++) {
    const easier = rs.slice(0, i).find((e) => e.cost <= rs[i].cost + 1e-9)
    if (easier) rs[i].skip = easier
  }
  // crossed: over easier rung + under the next harder line pays at least $1 in every outcome
  if (side === 'over') {
    for (let i = 0; i + 1 < rs.length; i++) {
      const under = propSide(rs[i + 1].l, 'under')
      if (under && rs[i].cost + under.cost < 1) rs[i].crossed = rs[i + 1]
    }
  }
  const ok = rs.filter((r) => !r.skip && r.chance >= SAFE && (r.model == null || r.model >= SAFE))
  if (ok.length) ok[ok.length - 1].safe = true
  return rs
}

// The ladder for the prop on screen, with Kalshi's live price for every rung (asked once a minute at most)
export function useLadder(cur: PropLine, side: 'over' | 'under', enabled: boolean) {
  const { lines } = useProps()
  const [live, setLive] = useState<Record<string, LivePrice>>({})
  const asked = useRef(0)
  const tickers = useMemo(
    () => lines.filter((x) => x.sport === cur.sport && x.gameKey === cur.gameKey && x.player === cur.player && x.stat === cur.stat)
      .map((x) => x.ticker).filter(Boolean) as string[],
    [lines, cur.sport, cur.gameKey, cur.player, cur.stat])
  useEffect(() => {
    if (!enabled || !tickers.length || Date.now() - asked.current < 60000) return
    asked.current = Date.now()
    let off = false
    fetchLiveProps(tickers).then((m) => { if (!off && Object.keys(m).length) setLive(m) })
    return () => { off = true }
  }, [enabled, tickers])
  return useMemo(() => buildLadder(lines, cur, side, live), [lines, cur, side, live])
}
