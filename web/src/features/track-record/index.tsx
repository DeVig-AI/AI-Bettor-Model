import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { type GradedPick, fmtAmerican, useRecord } from '@/lib/devig'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ThemeSwitch } from '@/components/theme-switch'

// Track record, honestly: win–loss AND units at the price each pick locked at, so a good record that lost money
// reads as exactly that. Every pick here is a paper pick from the repo's append-only logs.

const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const u = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(2)} u`

function Row({ p }: { p: GradedPick }) {
  const final = p.awayScore != null && p.homeScore != null ? `${p.awayScore}–${p.homeScore}` : ''
  return (
    <li className='flex items-center gap-3 rounded-2xl bg-card py-3 pe-4 ps-4'>
      <div className='min-w-0 flex-1'>
        <div className='font-semibold'>
          {p.away} at {p.home}
          <span className='ms-2 text-xs font-normal text-muted-foreground'>{dateFmt.format(new Date(p.kickoff))}</span>
        </div>
        <div className='text-sm text-muted-foreground'>
          Picked {p.side}
          {p.odds != null ? ` at ${fmtAmerican(p.odds)}` : ''}
          {final ? `, ${final}` : ''}
        </div>
      </div>
      <div className='text-end'>
        <div className={cn('font-bold', p.won ? 'text-good' : 'text-bad')}>{p.won ? 'Won' : 'Lost'}</div>
        <div className='font-condensed text-sm text-muted-foreground tabular-nums'>{p.units == null ? '—' : u(p.units)}</div>
      </div>
    </li>
  )
}

export function TrackRecord() {
  const { records, isLoading, error } = useRecord()
  const [sport, setSport] = useState<string | null>(null)
  const [limit, setLimit] = useState(10)
  const rec = records.find((r) => r.sport === sport) ?? records[0]
  const total = rec ? rec.won + rec.lost : 0
  const winShare = total ? rec!.won / total : 0.5

  return (
    <>
      <Header>
        <div className='me-auto min-w-0'>
          <h1 className='font-display text-[26px] leading-none font-black'>Track record</h1>
          <p className='mt-0.5 truncate text-xs text-muted-foreground'>Every pick locked before the game, graded after.</p>
        </div>
        <ThemeSwitch />
      </Header>
      <Main className='flex flex-col gap-5'>
        {error && <p className='text-sm text-bad'>The record didn&apos;t load. Check your connection and reload.</p>}

        <div role='tablist' aria-label='Sport' className='flex gap-2'>
          {records.map((r) => (
            <button
              key={r.sport}
              type='button'
              role='tab'
              aria-selected={rec?.sport === r.sport}
              onClick={() => { setSport(r.sport); setLimit(10) }}
              className={cn(
                'h-9 rounded-full border px-4 text-sm font-medium transition-colors duration-150',
                rec?.sport === r.sport ? 'border-foreground bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {r.sport}
            </button>
          ))}
        </div>

        {isLoading ? (
          <Skeleton className='h-[150px] w-full rounded-[18px]' />
        ) : !rec ? (
          <p className='rounded-[18px] border border-dashed p-8 text-center text-muted-foreground'>No graded picks yet.</p>
        ) : (
          <>
            <section
              aria-label={`${rec.sport}: won ${rec.won}, lost ${rec.lost}`}
              className='relative h-[150px] overflow-hidden rounded-[18px] text-white'
              style={{ background: `linear-gradient(102deg, #17402B 0 ${(winShare * 100).toFixed(1)}%, #3A1518 ${(winShare * 100).toFixed(1)}% 100%)` }}
            >
              <div className='absolute inset-0 flex flex-col justify-between px-4 py-3.5'>
                <div className='flex justify-between text-xs font-semibold text-white/85'><span>Won</span><span>Lost</span></div>
                <div className='flex items-end justify-between'>
                  <span className='font-display text-[64px] leading-[0.85] font-black text-[#8EF0B4]'>{rec.won}</span>
                  <span className='font-display text-[64px] leading-[0.85] font-black text-[#FFA3A3]'>{rec.lost}</span>
                </div>
              </div>
            </section>

            <div className='px-1'>
              <div className={cn('font-display text-[40px] leading-none font-black', rec.units >= 0 ? 'text-good' : 'text-bad')}>
                {u(rec.units)}
              </div>
              <p className='mt-1.5 max-w-prose text-sm text-muted-foreground'>
                {rec.units < 0 && rec.won > rec.lost
                  ? `Winning ${rec.won} of ${total} still lost money at the prices those picks paid.`
                  : rec.units >= 0
                    ? `${rec.won} of ${total} won, and the picks made money at the prices they locked at.`
                    : `${rec.won} of ${total} won, and the picks lost money at the prices they locked at.`}
              </p>
              <p className='mt-1 text-xs text-muted-foreground'>
                1 unit per pick at the locked price, before Kalshi&apos;s fee
                {rec.priced < total ? ` (${total - rec.priced} picks had no saved price and count in win–loss only)` : ''}.
              </p>
            </div>

            <section aria-label='Latest graded' className='flex flex-col gap-2'>
              <h2 className='px-1 font-display text-[22px] font-extrabold'>Latest graded</h2>
              <ul className='grid gap-2 lg:grid-cols-2'>
                {rec.picks.slice(0, limit).map((p) => (
                  <Row key={`${p.kickoff}-${p.away}-${p.home}`} p={p} />
                ))}
              </ul>
              {rec.picks.length > limit && (
                <button type='button' onClick={() => setLimit((n) => n + 20)} className='h-11 rounded-xl border text-sm font-semibold text-muted-foreground hover:text-foreground'>
                  Show more ({rec.picks.length - limit} left)
                </button>
              )}
            </section>

            <section aria-label='Calibration' className='rounded-2xl border border-dashed p-4'>
              <p className='font-semibold'>Do DeVig&apos;s percentages come true?</p>
              <p className='mt-1 text-sm text-muted-foreground'>
                The calibration chart is next: when DeVig says 70%, how often that side really wins.{' '}
                <a href='../' className='inline-flex items-center gap-1 text-devig'>
                  See it in the classic app <ExternalLink className='size-3.5' aria-hidden='true' />
                </a>
              </p>
            </section>
          </>
        )}
      </Main>
    </>
  )
}
