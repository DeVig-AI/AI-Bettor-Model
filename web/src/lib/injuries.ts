// Injury reports (the injuries bot's exports, from each league's official report): who's out or questionable in a
// game, and how much it matters (the player's share of his team's points, as the bot computes it).
import { useQuery } from '@tanstack/react-query'

const RAW = 'https://raw.githubusercontent.com/DeVig-AI/AI-Bettor-Model/main/'

export type Injury = {
  sport: string
  away: string
  home: string
  team: string
  player: string
  status: string // Out, Questionable, Doubtful, ...
  reason: string | null
  starter: boolean
  impact: { label: string; level: string; bars: number; why: string } | null
}

export function useInjuries() {
  return useQuery({
    queryKey: ['injuries'],
    queryFn: async () => {
      const all = await Promise.allSettled(
        ['nba', 'nfl'].map((s) =>
          fetch(`${RAW}${s}/injuries_export.json?t=${Math.floor(Date.now() / 60000)}`).then((r) => (r.ok ? r.json() : { docs: [] }))
        )
      )
      const out: Injury[] = []
      for (const r of all) {
        if (r.status !== 'fulfilled') continue
        for (const d of (r.value.docs || []) as { data: Record<string, unknown> }[]) {
          const x = d.data
          if (!x.player) continue
          out.push({
            sport: String(x.sport ?? ''), away: String(x.away ?? ''), home: String(x.home ?? ''), team: String(x.team ?? ''),
            player: String(x.player), status: String(x.status ?? ''), reason: (x.reason as string) ?? null,
            starter: !!x.starter, impact: (x.impact as Injury['impact']) ?? null,
          })
        }
      }
      return out
    },
    refetchInterval: 15 * 60e3,
  })
}
