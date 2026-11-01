// Player -> ESPN athlete id, for the headshots on props. Written daily from every NBA, NFL and NHL roster by
// tools/espn_headshots_v1.py into {sport}/headshots.json. Display only.
import { useQuery } from '@tanstack/react-query'
import { getJson } from './devig'
import { espnCode } from './logos'

type Map = Record<string, [string, string][]> // normalized name -> [espn id, espn team abbr][]

// must match norm() in tools/espn_headshots_v1.py
export function normName(name: string) {
  return name
    .normalize('NFD')
    .replace(/[^\x00-\x7f]/g, '')
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .replace(/-/g, ' ')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const SPORTS = new Set(['NBA', 'NFL', 'NHL'])

function useHeadshots(sport: string) {
  return useQuery({
    queryKey: ['headshots', sport],
    queryFn: () => getJson<{ players: Map }>(`${sport.toLowerCase()}/headshots.json`),
    enabled: SPORTS.has(sport),
    staleTime: 6 * 60 * 60e3,
  })
}

// the player's ESPN id and, when it's one of the two teams in the game, that team's board code
export function useRosterPlayer(sport: string, player: string, away?: string, home?: string): { pid: string | null; team: string | null } {
  const q = useHeadshots(sport)
  const hits = q.data?.players[normName(player)]
  if (!hits?.length) return { pid: null, team: null }
  const teamOf = (abbr: string) => (away && espnCode(sport, away) === abbr ? away : home && espnCode(sport, home) === abbr ? home : null)
  const hit = hits.find(([, a]) => teamOf(a)) ?? (hits.length === 1 ? hits[0] : null)
  return hit ? { pid: hit[0], team: teamOf(hit[1]) } : { pid: null, team: null }
}
