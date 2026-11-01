import { useQuery } from '@tanstack/react-query'
import type { GameRow } from './devig'
import type { FieldPlay, PricePoint } from './field-math'

export * from './field-math'

// The 3D field on an NFL or college football game page: the latest drive drawn play by play, and the plays that moved
// Kalshi's price most. Plays come from ESPN through /api/live (&game=1), prices from Kalshi's 1-minute history through
// /api/winline. A play's move is the price change in the minute or so after it was run: the market reacts to more
// than the play (injuries, other news), so it's what happened around the play, not proof the play caused it.
// Display only: no model reads this.

type Feed = { away: string; home: string; plays: FieldPlay[] } // plays newest first

export const FOOTBALL = ['NFL', 'CFB']

export function useFieldPlays(row: GameRow | null) {
  const eid = row?.id.split('|')[1]
  const on = !!row && FOOTBALL.includes(row.sport) && !!eid && row.state !== 'pre'
  return useQuery({
    queryKey: ['field_plays', row?.sport, eid],
    queryFn: async () => {
      const r = await fetch(`/api/live?sport=${row!.sport.toLowerCase()}&event=${eid}&game=1`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return ((await r.json()) as { game: Feed }).game
    },
    enabled: on,
    staleTime: row?.state === 'post' ? 30 * 6e4 : 15e3,
    refetchInterval: row?.state === 'in' ? 20e3 : false,
  })
}

export function usePriceLine(row: GameRow | null) {
  const start = row ? Math.floor(Date.parse(row.kickoff) / 1000) - 15 * 60 : NaN
  const on = !!row?.ticker && FOOTBALL.includes(row.sport) && row.state !== 'pre' && Number.isFinite(start)
  return useQuery({
    queryKey: ['winline_fine', row?.ticker, start],
    queryFn: async () => {
      const r = await fetch(`/api/winline?ticker=${encodeURIComponent(row!.ticker!)}&start=${start}&fine=1`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return ((await r.json()) as { points: PricePoint[] }).points ?? []
    },
    enabled: on,
    staleTime: row?.state === 'post' ? 30 * 6e4 : 45e3,
    refetchInterval: row?.state === 'in' ? 60e3 : false,
  })
}

