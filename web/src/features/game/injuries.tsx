// Who's hurt for one game (the injuries bot's exports), on every sport's game page and soccer's match page.
import { useMemo } from 'react'
import { type GameRow, isSoccer } from '@/lib/devig'
import { useInjuries } from '@/lib/injuries'
import { cn } from '@/lib/utils'

export function GameInjuries({ row }: { row: GameRow }) {
  const injuries = useInjuries()
  const hurt = useMemo(
    () => (injuries.data ?? []).filter((x) => x.sport === row.sport && x.away === row.away && x.home === row.home)
      .sort((a, b) => (b.impact?.bars ?? 0) - (a.impact?.bars ?? 0)),
    [injuries.data, row]
  )
  if (!hurt.length) return null
  return (
    <section aria-label='Injuries'>
      <h2 className='mb-2 px-1 font-display text-[22px] font-extrabold'>Injuries</h2>
      <ul className='flex flex-col gap-1.5'>
        {hurt.map((x) => (
          <li key={x.team + x.player} className='flex items-start justify-between gap-3 rounded-2xl bg-card px-4 py-2.5'>
            <span className='min-w-0'>
              <span className='font-semibold'>{x.player}</span> <span className='text-sm text-muted-foreground'>{x.team}</span>
              {(x.impact?.why || x.reason) && <span className='block text-xs text-muted-foreground'>{x.impact?.why || x.reason}</span>}
            </span>
            <span className='shrink-0 text-end'>
              <span className={cn('block text-sm font-bold', /out|suspend|reserve/i.test(x.status) ? 'text-bad' : 'text-[#F5C77A]')}>{x.status}</span>
              {x.impact?.label && <span className='text-xs text-muted-foreground'>{x.impact.label} impact</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className='mt-1.5 px-1 text-xs text-muted-foreground'>{row.sport === 'NFL' ? "DeVig's NFL Model 2.0 counts who's out" : row.sport === 'NBA' ? "DeVig's NBA model counts who's out on the official report" : `DeVig's ${isSoccer(row.sport) ? 'soccer' : row.sport} model doesn't read injuries`}; Kalshi&apos;s price may already include them.</p>
    </section>
  )
}
