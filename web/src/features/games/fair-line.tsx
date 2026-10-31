import { type GameRow, fmtPct } from '@/lib/devig'

// The fair line: one game's 100% split at Kalshi's price with the fee gap removed (away on the left, home on the
// right). When DeVig picks a side, an amber notch marks the model's chance and the amber band between the split and
// the notch is the gap between DeVig and the market.
export function FairLine({ row }: { row: GameRow }) {
  if (row.fairHome == null)
    return (
      <div className='flex h-7 items-center text-sm text-muted-foreground'>
        No Kalshi price yet
      </div>
    )

  const split = 1 - row.fairHome // share of the bar that belongs to the away side
  const p = row.pick
  const notch =
    p?.side && p.action !== 'PASS' && p.prob != null
      ? p.side === row.away
        ? p.prob
        : 1 - p.prob
      : null
  const lo = notch == null ? null : Math.min(split, notch)
  const hi = notch == null ? null : Math.max(split, notch)
  const pct = (x: number) => `${(x * 100).toFixed(2)}%`

  const label =
    `Fair chance: ${row.away} ${fmtPct(split)}, ${row.home} ${fmtPct(row.fairHome)}.` +
    (notch != null && p?.prob != null ? ` DeVig: ${p.side} ${fmtPct(p.prob)}.` : '')

  return (
    <figure role='img' aria-label={label} className='space-y-1'>
      <div className='flex justify-between font-condensed text-sm font-semibold tabular-nums'>
        <span>
          <span className='text-muted-foreground'>{row.away}</span> {fmtPct(split)}
        </span>
        <span>
          {fmtPct(row.fairHome)} <span className='text-muted-foreground'>{row.home}</span>
        </span>
      </div>
      <div className='relative h-3.5'>
        <div className='absolute inset-x-0 top-1/2 flex h-2 -translate-y-1/2 gap-0.5 overflow-hidden rounded-full'>
          <div className='h-full bg-side-away' style={{ width: pct(split) }} />
          <div className='h-full flex-1 bg-side-home' />
        </div>
        {notch != null && lo != null && hi != null && (
          <>
            <div
              aria-hidden='true'
              className='absolute top-1/2 h-2 -translate-y-1/2 bg-devig/45'
              style={{ left: pct(lo), width: pct(hi - lo) }}
            />
            <div
              aria-hidden='true'
              className='absolute top-0 h-full w-[3px] -translate-x-1/2 rounded-full bg-devig ring-2 ring-card'
              style={{ left: pct(notch) }}
            />
          </>
        )}
      </div>
    </figure>
  )
}
