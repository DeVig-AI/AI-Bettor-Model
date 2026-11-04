// Narrative model (live/narrative/nba.json, written hourly by tools/narrative_nba.py): NBA picks made the way the
// experts reason (rules written from expert picks shows). Not proven: the app never
// uses it for its own picks.
import { useQuery } from '@tanstack/react-query'
import { getJson } from './devig'

export type NarrativePick = {
  id: string; date: string; start: string; game: string; home: string; away: string; book: string | null
  type: 'side' | 'total'; pick: string; line: number; score: number; why_for: string[]; why_opp: string[]
  result: 'W' | 'L' | 'P' | null; final: string | null
}
export type NarrativeFile = {
  model: string; updated: string; live_since: string
  tests: { label: string; w: number; l: number; p: number }[]
  picks: NarrativePick[]
}

export function useNarrative() {
  return useQuery({ queryKey: ['narrative'], queryFn: () => getJson<NarrativeFile>('live/narrative/nba.json'), staleTime: 10 * 60e3 })
}

// Record at standard -110 prices: a win pays 0.909 units, a loss costs 1, a push returns the stake.
export const NEEDED = 110 / 210
export function tally(picks: { result: 'W' | 'L' | 'P' | null }[]) {
  const w = picks.filter((p) => p.result === 'W').length
  const l = picks.filter((p) => p.result === 'L').length
  const pu = picks.filter((p) => p.result === 'P').length
  return { w, l, p: pu, pct: w + l ? w / (w + l) : null, units: w * (100 / 110) - l }
}

export const betLabel = (p: { type: string; pick: string; line: number }) =>
  p.type === 'side' ? `${p.pick} ${p.line > 0 ? '+' : p.line < 0 ? '−' : ''}${p.line === 0 ? 'PK' : Math.abs(p.line)}` : `${p.pick === 'OVER' ? 'Over' : 'Under'} ${p.line}`

// the Narrative model's picks for one game on the board (NBA only; its file uses ESPN's team codes)
export function narrativeFor(file: NarrativeFile | undefined, row: { sport: string; away: string; home: string; kickoff: string }, code: (s: string, c: string) => string) {
  if (!file || row.sport !== 'NBA') return []
  const t = new Date(row.kickoff).getTime()
  return file.picks.filter((p) => p.home.toLowerCase() === code('NBA', row.home) && p.away.toLowerCase() === code('NBA', row.away)
    && Math.abs(new Date(p.start).getTime() - t) < 12 * 3600e3)
}
