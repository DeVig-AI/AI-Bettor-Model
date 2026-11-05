import { useQuery } from '@tanstack/react-query'
import { type GameRow, type SoccerMore, getJson } from './devig'

// Soccer data the game page and the team profile share: the league tables and results (live/soccer_tables.json,
// tools/soccer_tables.py), one match's events, stats and line-ups (ESPN through /api/live &game=1), and fresh Kalshi
// prices for a match's goals markets (/api/prices). Display only: no model reads this.

export type Zone = { label: string; color: string | null }
export type TableRow = {
  rank: number; id: string; code: string; name: string; color: string | null
  gp: number | null; w: number | null; d: number | null; l: number | null
  gf: number | null; ga: number | null; gd: number | null; pts: number | null
  zone: Zone | null; form: string
}
export type Result = [date: string, opp: string, where: 'H' | 'A', gf: number, ga: number]
export type Tables = {
  generated_at: string
  leagues: Record<string, { name: string; season: string | null; groups: { name: string; rows: TableRow[] }[] }>
  teams: Record<string, { id: string; code: string; name: string; league: string; games: Result[] }>
}

export function useSoccerTables() {
  return useQuery({
    queryKey: ['soccer_tables'],
    queryFn: () => getJson<Tables>('live/soccer_tables.json'),
    staleTime: 10 * 60e3,
  })
}

// a team's row in its league table (and the group it sits in, for MLS's conferences)
export function tableRow(t: Tables | undefined, league: string, id: string | null | undefined) {
  const lg = t?.leagues[league]
  if (!lg || !id) return null
  for (const g of lg.groups) {
    const row = g.rows.find((r) => r.id === id)
    if (row) return { row, group: g.name, size: g.rows.length, groups: lg.groups.length }
  }
  return null
}

export const resultOf = (g: Result) => (g[3] > g[4] ? 'W' : g[3] < g[4] ? 'L' : 'D') as 'W' | 'D' | 'L'

export type MatchEvent = { min: string; kind: 'goal' | 'own' | 'pen' | 'yellow' | 'red' | 'sub'; side: 'home' | 'away'; who: string; other: string; at: string | null }
export type MatchStats = Partial<Record<'possession' | 'shots' | 'on_target' | 'corners' | 'fouls' | 'yellow' | 'red' | 'offsides' | 'saves' | 'passes_ok' | 'passes', number | null>>
export type Lineup = { formation: string | null; xi: [string, string, string][]; subs: [string, string, string, boolean][] }
export type Match = { events: MatchEvent[]; stats: Partial<Record<'home' | 'away', MatchStats>>; lineups: Partial<Record<'home' | 'away', Lineup>> }

// ESPN posts line-ups about an hour before kickoff, so ask from then on; every 15 seconds while the match is on
export function useMatch(row: GameRow | null) {
  const eid = row?.id.split('|')[1]
  const soon = !!row && Date.parse(row.kickoff) - Date.now() < 90 * 60e3
  return useQuery({
    queryKey: ['soccer_match', row?.sport, eid],
    queryFn: async () => {
      const r = await fetch(`/api/live?sport=${row!.sport.toLowerCase()}&event=${eid}&game=1`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return ((await r.json()) as { game?: Match }).game ?? null
    },
    enabled: !!eid && (row?.state !== 'pre' || soon),
    staleTime: row?.state === 'post' ? 30 * 60e3 : 10e3,
    refetchInterval: row?.state === 'in' ? 15e3 : row?.state === 'pre' ? 5 * 60e3 : false,
  })
}

// Kalshi's mid price now (between bid and ask) for up to 40 markets, when it answers; `now(ticker, mid)` falls back to
// the board file's price. Only while the match isn't over (settled markets have nothing to show).
export function useFresh(tickers: string[], state: GameRow['state'] | undefined) {
  const ts = [...new Set(tickers)].slice(0, 40)
  const q = useQuery({
    queryKey: ['soccer_more', ts.join(',')],
    queryFn: async () => {
      const r = await fetch(`/api/prices?tickers=${ts.join(',')}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return ((await r.json()) as { markets: Record<string, { bid: number | null; ask: number | null }> }).markets ?? {}
    },
    enabled: ts.length > 0 && state !== 'post',
    staleTime: 60e3,
    refetchInterval: state === 'in' ? 60e3 : 2 * 60e3,
  })
  const p = q.data ?? {}
  return (t: string, mid: number, ask: number | null): [number, number | null] => {
    const x = p[t]
    return x && x.bid != null && x.ask != null ? [(x.bid + x.ask) / 2, x.ask] : [mid, ask]
  }
}

// the goals markets with Kalshi's prices now when it answers, else the board file's
export function useSoccerMore(row: GameRow | null): SoccerMore | null {
  const m = row?.soccer ?? null
  const tickers = m ? [...m.spreads.map((s) => s[4]), ...m.totals.map((t) => t[3]), ...(m.btts ? [m.btts[2]] : [])] : []
  const now = useFresh(tickers, row?.state)
  if (!m) return null
  return {
    spreads: m.spreads.map(([s, l, mid, ask, t]) => [s, l, ...now(t, mid, ask), t]),
    totals: m.totals.map(([l, mid, ask, t]) => [l, ...now(t, mid, ask), t]),
    btts: m.btts ? [...now(m.btts[2], m.btts[0], m.btts[1]), m.btts[2]] : null,
    more: m.more ?? null,
  }
}

// Kalshi's season markets per league (live/soccer_futures.json, tools/soccer_futures.py): rows are
// [espn id | null, name, bid, ask, ticker]; player season goals carry "n or more" after the name
export type FutureRow = [id: string | null, name: string, bid: number | null, ask: number | null, ticker: string]
export type GoalsRow = [id: null, name: string, n: number, bid: number | null, ask: number | null, ticker: string]
export type Future = { key: string; label: string; who: 'team' | 'player' | 'range'; rows: (FutureRow | GoalsRow)[] }
export type Futures = { generated_at: string; leagues: Record<string, Future[]> }

export function useSoccerFutures() {
  return useQuery({
    queryKey: ['soccer_futures'],
    queryFn: () => getJson<Futures>('live/soccer_futures.json'),
    staleTime: 10 * 60e3,
  })
}

// the middle of bid and ask, or null when nobody's quoting or they're too far apart to say much (`wide`, dollars)
export function midOf(bid: number | null, ask: number | null, wide = 0.25) {
  if (ask == null || ask <= 0) return null
  const b = bid ?? 0
  return ask - b > wide ? null : (b + ask) / 2
}

// DeVig Soccer v1 (tools/soccer_model_live.py -> live/devig/soccer.json; soccer/SOCCER_MODEL_V1_PREREG.md), the
// SOCCER.ml champion in CHAMPION_CHALLENGER_V4_PREREG.md: home / draw / away in 90 minutes for the five big leagues,
// and its graded record beside Kalshi's (tools/soccer_track.py -> live/devig/soccer_record.json). New, not proven.
export type DevigSoccerGame = {
  game_id: string; league: string; kickoff: string; home: string; away: string
  home_wp: number; draw_p: number; away_wp: number; xg_home: number; xg_away: number
}
type Tally = { games: number; log_loss: number; picked_right: number }
export type DevigSoccerRecord = {
  generated_at: string
  devig: Tally | null
  shared: { devig: Tally | null; kalshi: Tally | null } | null
  recent: { game_id: string; model: [number, number, number]; kalshi: [number, number, number] | null; result: [number, number] }[]
}
const DEVIG_STALE_MS = 12 * 3600e3   // an older file is not shown: its numbers would be old

export function useDevigSoccer() {
  return useQuery({
    queryKey: ['devig_soccer'],
    queryFn: async () => {
      const [f, rec] = await Promise.all([
        getJson<{ generated_at: string; games: DevigSoccerGame[] }>('live/devig/soccer.json').catch(() => null),
        getJson<DevigSoccerRecord>('live/devig/soccer_record.json').catch(() => null),
      ])
      const fresh = f && Date.now() - Date.parse(f.generated_at) < DEVIG_STALE_MS
      return { games: new Map((fresh ? f.games : []).map((g) => [g.game_id, g])), record: rec }
    },
    staleTime: 10 * 60e3,
    refetchInterval: 15 * 60e3,
  })
}
