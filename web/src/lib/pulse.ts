import { useQueries } from '@tanstack/react-query'
import type { KLeg } from './kalshi-link'
import type { PricePoint } from './pulse-math'

export * from './pulse-math'

// The parlay pulse's data: each leg's Kalshi price, minute by minute, through /api/winline (any sports market).
// Kalshi keeps two days of minute prices there, so a parlay's pulse covers at most its last two days. Display only.
export function useLegLines(legs: KLeg[], start: number, live: boolean) {
  const qs = useQueries({
    queries: legs.map((l) => ({
      queryKey: ['leg_line', l.ticker, start],
      queryFn: async () => {
        const r = await fetch(`/api/winline?ticker=${encodeURIComponent(l.ticker!)}&start=${start}&fine=1`)
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return ((await r.json()) as { points: PricePoint[] }).points ?? []
      },
      enabled: !!l.ticker,
      staleTime: live ? 45e3 : 30 * 6e4,
      refetchInterval: live ? 60e3 : (false as const),
    })),
  })
  return {
    lines: qs.map((q) => q.data),
    loading: qs.some((q) => q.isPending && q.fetchStatus !== 'idle'),
    failed: qs.some((q) => q.isError),
  }
}
