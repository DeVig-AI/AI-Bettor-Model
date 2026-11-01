// The DeVig Lab models (live/lab/<sport>.json from tools/lab_live.py): the Research Lab's search leader for NHL and
// college football, run on today's games. New, not proven: shown beside the market, never as one of DeVig's picks.
import { useQuery } from '@tanstack/react-query'
import type { GameRow } from './devig'

const RAW = 'https://raw.githubusercontent.com/DeVig-AI/AI-Bettor-Model/main/'
export const LAB_SPORTS = ['NHL', 'CFB'] as const
const STALE_MS = 12 * 3600e3 // an older file is not shown: its numbers would be old
const NHL_TO_ESPN: Record<string, string> = { TBL: 'TB', NJD: 'NJ', LAK: 'LA', SJS: 'SJ' }

export type Gate = { name: string; effect: number | null; ci: [number, number] | null; games: number | null; passed: boolean | null }
export type LabCheck = {
  state: string; fail_reason?: string | null; gates?: Gate[]
  pooled?: { name: string; effect: number; ci: [number, number]; adj_p?: number } | null
}
export type LabGame = {
  game_id: string; kickoff: string; date: string; home: string; away: string
  home_name?: string; away_name?: string; home_wp: number; home_line?: number | null
}
export type LabFile = {
  generated_at: string; sport: string; data_from?: string; data_through?: string
  candidate: { id: string; name: string; market: string; search?: { effect: number; games: number; t: number; round: number } }
  check: LabCheck | null
  games: LabGame[]
}

export function useLab() {
  return useQuery({
    queryKey: ['lab-live'],
    queryFn: async () => {
      const t = Math.floor(Date.now() / 60000)
      const out: Record<string, LabFile> = {}
      await Promise.all(
        LAB_SPORTS.map(async (s) => {
          try {
            const r = await fetch(`${RAW}live/lab/${s.toLowerCase()}.json?t=${t}`)
            if (!r.ok) return
            const f = (await r.json()) as LabFile
            if (Date.now() - Date.parse(f.generated_at) < STALE_MS) out[s] = f
          } catch {
            /* the Lab's numbers are extra: the page works without them */
          }
        })
      )
      return out
    },
    refetchInterval: 15 * 60e3,
  })
}

// the Lab's chance for one game on the Games page (NHL by teams and start time, CFB by ESPN id)
export function labFor(files: Record<string, LabFile> | undefined, row: GameRow): LabGame | null {
  const f = files?.[row.sport]
  if (!f) return null
  if (row.sport === 'CFB') {
    const id = row.id.split('|')[1]
    return f.games.find((g) => g.game_id === id) ?? null
  }
  const t = Date.parse(row.kickoff)
  return (
    f.games.find(
      (g) =>
        (NHL_TO_ESPN[g.home] ?? g.home) === row.home &&
        (NHL_TO_ESPN[g.away] ?? g.away) === row.away &&
        Math.abs(Date.parse(g.kickoff) - t) < 6 * 3600e3
    ) ?? null
  )
}

// where the Lab's own confirmation check stands, in words
export function checkText(c: LabCheck | null | undefined) {
  if (!c) return 'Waiting for the Lab’s confirmation check (seasons the search never saw).'
  if (c.state === 'failed') return `Failed the Lab’s confirmation check${c.fail_reason ? ` (${c.fail_reason.replace(/_/g, ' ')})` : ''}.`
  if (c.state === 'lab_pass') return 'Passed the Lab’s confirmation check. Not yet tested on the sealed exam season.'
  if (c.state === 'running' || c.state === 'queued') return 'The Lab’s confirmation check is running.'
  return `Lab check: ${c.state.replace(/_/g, ' ')}.`
}
