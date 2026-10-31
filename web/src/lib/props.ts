// Player props for v2: the props bots' exports (DeVig's props model + a Kalshi snapshot), with Kalshi's live price
// layered on top from /api/props when a screen asks for it. Same rules as the classic app: Kalshi "N+" markets are
// stored as Over N-0.5 and shown the way Kalshi words them; every price you'd pay includes Kalshi's fee.
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

const RAW = 'https://raw.githubusercontent.com/DeVig-AI/AI-Bettor-Model/main/'
const SPORTS = ['nba', 'nfl', 'nhl'] as const

const STATS: Record<string, [string, string]> = {
  points: ['Points', 'pts'], rebounds: ['Rebounds', 'reb'], assists: ['Assists', 'ast'], threes: ['3-pointers made', 'threes'],
  pts_reb_ast: ['Pts + Reb + Ast', 'PRA'], pts_reb: ['Pts + Reb', 'pts+reb'], pts_ast: ['Pts + Ast', 'pts+ast'],
  reb_ast: ['Reb + Ast', 'reb+ast'], steals: ['Steals', 'stl'], blocks: ['Blocks', 'blk'], goals: ['Goals', 'goals'],
  turnovers: ['Turnovers', 'TO'], touchdowns: ['Touchdowns', 'TD'], pass_yds: ['Passing yards', 'pass yds'],
  rush_yds: ['Rushing yards', 'rush yds'], rec_yds: ['Receiving yards', 'rec yds'], receptions: ['Receptions', 'rec'],
  shots: ['Shots on goal', 'SOG'], saves: ['Saves', 'saves'],
}
export function statName(s: string, short = false) {
  const x = STATS[s]
  return x ? x[short ? 1 : 0] : s.replace(/_/g, ' ')
}
const half = (line: number) => Math.abs(line - Math.floor(line) - 0.5) < 1e-9
export function overTxt(stat: string, line: number) {
  if (stat === 'touchdowns' && line === 0.5) return 'Anytime TD'
  if (half(line)) return `${line + 0.5}+ ${statName(stat, true)}`
  return `Over ${line} ${statName(stat, true)}`
}
export function underTxt(stat: string, line: number) {
  if (stat === 'touchdowns' && line === 0.5) return 'No TD'
  if (half(line)) return `${line - 0.5} or fewer ${statName(stat, true)}`
  return `Under ${line} ${statName(stat, true)}`
}

// Kalshi's taker fee: 0.07 x contracts x P x (1-P) for the whole order, rounded up to the cent (a $10 order here)
export function kalshiFee(p: number, dollars = 10) {
  if (!(p > 0 && p < 1)) return 0
  const n = Math.max(1, Math.floor(dollars / p + 1e-9))
  return Math.ceil(0.07 * n * p * (1 - p) * 100 - 1e-9) / 100 / n
}
export function priceToAmerican(c: number) {
  if (!(c > 0 && c < 1)) return null
  return c >= 0.5 ? (-100 * c) / (1 - c) : (100 * (1 - c)) / c
}

export type PropLine = {
  key: string // sport|game_key|player|stat|line
  sport: string
  gameKey: string
  away: string
  home: string
  kickoff: string
  player: string
  stat: string
  line: number
  bid: number | null
  ask: number | null
  oi: number
  ticker: string | null
  modelOver: number | null // DeVig's props model: chance of the over
  expected: number | null
  games: number
  injury: string | null
}

type Row = {
  player: string; stat: string; line: number; k?: { bid?: number; ask?: number; oi?: number; t?: string } | null
  model_p?: number | null; expected?: number | null; n_games?: number; injury?: string | null; stale?: unknown
}
type Doc = { data: { game_key: string; away_team: string; home_team: string; kickoff_time: string; sport?: string; rows?: Row[] } }

export function useProps() {
  const q = useQuery({
    queryKey: ['props_exports'],
    queryFn: async () => {
      const all = await Promise.allSettled(
        SPORTS.map((s) =>
          fetch(`${RAW}${s}/props_model_export.json?t=${Math.floor(Date.now() / 60000)}`).then((r) =>
            r.ok ? (r.json() as Promise<{ docs: Doc[] }>) : { docs: [] }
          )
        )
      )
      const out: PropLine[] = []
      all.forEach((res, i) => {
        if (res.status !== 'fulfilled') return
        const sport = SPORTS[i].toUpperCase()
        for (const d of res.value.docs || []) {
          const g = d.data
          for (const r of g.rows || []) {
            if (r.stale) continue
            out.push({
              key: `${sport}|${g.game_key}|${r.player}|${r.stat}|${r.line}`,
              sport, gameKey: g.game_key, away: g.away_team, home: g.home_team, kickoff: g.kickoff_time,
              player: r.player, stat: r.stat, line: r.line,
              bid: r.k?.bid ?? null, ask: r.k?.ask ?? null, oi: r.k?.oi ?? 0, ticker: r.k?.t ?? null,
              modelOver: r.model_p ?? null, expected: r.expected ?? null, games: r.n_games ?? 0, injury: r.injury ?? null,
            })
          }
        }
      })
      return out
    },
    refetchInterval: 15 * 60e3,
  })
  return { lines: useMemo(() => q.data ?? [], [q.data]), isLoading: q.isLoading }
}

// Kalshi's live price for prop tickers (40 per call, the server caches 30 s). Returns ticker -> {bid, ask, title}.
export type LivePrice = { bid: number | null; ask: number | null; title: string | null }
export async function fetchLiveProps(tickers: string[]): Promise<Record<string, LivePrice>> {
  const out: Record<string, LivePrice> = {}
  const uniq = Array.from(new Set(tickers.filter(Boolean))).slice(0, 400)
  const chunks: string[][] = []
  for (let i = 0; i < uniq.length; i += 40) chunks.push(uniq.slice(i, i + 40))
  await Promise.all(
    chunks.map((c) =>
      fetch(`/api/props?tickers=${encodeURIComponent(c.join(','))}`, { headers: { accept: 'application/json' } })
        .then((r) => (r.ok ? r.json() : null))
        .then((a: { markets?: Record<string, LivePrice> } | null) => {
          if (a?.markets) Object.assign(out, a.markets)
        })
        .catch(() => undefined)
    )
  )
  return out
}

// What a side of a prop costs to buy (fee included) and the market's fair chance for it (the bid/ask midpoint)
export function propSide(l: Pick<PropLine, 'bid' | 'ask'>, side: 'over' | 'under') {
  if (l.bid == null || l.ask == null || !(l.ask > 0 && l.ask < 1) || !(l.bid > 0)) return null
  const mid = (l.bid + l.ask) / 2
  const price = side === 'over' ? l.ask : Math.round((1 - l.bid) * 10000) / 10000
  const cost = price + kalshiFee(price)
  return { price, cost, fair: side === 'over' ? mid : 1 - mid, spread: l.ask - l.bid }
}
