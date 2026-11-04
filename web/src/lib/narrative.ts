// Narrative model (live/narrative/<sport>.json, written hourly by tools/narrative.py): picks made the way the experts
// reason, for NBA, NHL, NFL, CFB and CBB. Not proven: the app never uses it for its own picks. NBA's rules were tested
// on past nights; the other sports' are new.
import { useQuery } from '@tanstack/react-query'
import { getJson } from './devig'

export const NARRATIVE_SPORTS = ['NBA', 'NHL', 'NFL', 'CFB', 'CBB', 'MLB', 'WNBA']

export type NarrativePick = {
  id: string; date: string; start: string; game: string; home: string; away: string; home_id?: string; away_id?: string
  book: string | null; type: 'side' | 'total'; pick: string; line: number; score: number; why_for: string[]; why_opp: string[]
  result: 'W' | 'L' | 'P' | null; final: string | null
}
export type NarrativeFile = {
  model: string; sport: string; version: string; kind: 'spread' | 'ml'; tested: boolean; updated: string; live_since: string
  tests: { label: string; w: number; l: number; p: number }[]
  picks: NarrativePick[]
  reads?: NarrativeRead[]
}
// what the model read on a game whether or not it picked: the lean on the side and the total, below the bar or not
export type NarrativeLean = { lean: string | null; score: number; why_for: string[]; why_opp?: string[]; capped?: boolean; line?: number }
export type NarrativeRead = {
  id: string; date: string; start: string; game: string; home: string; away: string; home_id?: string; away_id?: string
  note: string | null; side?: NarrativeLean; total?: NarrativeLean
}

export function useNarrative(sport: string) {
  const on = NARRATIVE_SPORTS.includes(sport)
  return useQuery({
    queryKey: ['narrative', sport],
    queryFn: () => getJson<NarrativeFile>(`live/narrative/${sport.toLowerCase()}.json`),
    enabled: on,
    staleTime: 10 * 60e3,
  })
}

export function tally(picks: { result: 'W' | 'L' | 'P' | null }[]) {
  const w = picks.filter((p) => p.result === 'W').length
  const l = picks.filter((p) => p.result === 'L').length
  const pu = picks.filter((p) => p.result === 'P').length
  return { w, l, p: pu }
}

const odds = (x: number) => (x > 0 ? `+${x}` : `−${Math.abs(x)}`)
export const betLabel = (p: { type: string; pick: string; line: number }, kind: 'spread' | 'ml' = 'spread') =>
  p.type === 'total' ? `${p.pick === 'OVER' ? 'Over' : 'Under'} ${p.line}`
    : kind === 'ml' ? `${p.pick} ${odds(p.line)}`
    : `${p.pick} ${p.line > 0 ? '+' : p.line < 0 ? '−' : ''}${p.line === 0 ? 'PK' : Math.abs(p.line)}`

type Row = { sport: string; away: string; home: string; kickoff: string; ids: { away: string; home: string } | null }
const sameGame = (p: { home: string; away: string; home_id?: string; away_id?: string; start: string }, row: Row, code: (s: string, c: string) => string) =>
  (row.ids && p.home_id && p.away_id
    ? String(row.ids.home) === p.home_id && String(row.ids.away) === p.away_id
    : p.home.toLowerCase() === code(row.sport, row.home) && p.away.toLowerCase() === code(row.sport, row.away))
  && Math.abs(new Date(p.start).getTime() - new Date(row.kickoff).getTime()) < 12 * 3600e3

// the model's picks for one game on the board: by ESPN team ids when both sides have them (college codes aren't
// unique), else by team code as ESPN spells it, within 12 hours of the start
export function narrativeFor(file: NarrativeFile | undefined, row: Row, code: (s: string, c: string) => string) {
  return file ? file.picks.filter((p) => sameGame(p, row, code)) : []
}
export function readFor(file: NarrativeFile | undefined, row: Row, code: (s: string, c: string) => string) {
  return file?.reads?.find((r) => sameGame(r, row, code))
}
