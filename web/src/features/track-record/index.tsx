import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { type GradedPick, fmtAmerican, useRecord } from '@/lib/devig'
import { type PropsTest, useProps } from '@/lib/props'
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

// The prop-pick tests: rules locked (pre-registered) before the first pick, graded by settlement, nothing bet.
const PROP_RULES: Record<string, { target: number; rule: string }> = {
  NFL: {
    target: 300,
    rule: "Picks lock 6 hours to 40 minutes before kickoff, only where the model's chance is 5+ points above what Kalshi's price needs (fee included). Players with 21+ games; no touchdowns, injured players or thin markets. Graded from official play-by-play.",
  },
  NBA: {
    target: 500,
    rule: "Picks lock 6 hours to 30 minutes before tip-off, only where the model's chance is 5+ points above what Kalshi's price needs (fee included). Points, rebounds, assists and 3s; players with 40+ games; no injured players or thin markets. Graded by Kalshi's settlement.",
  },
  NHL: {
    target: 500,
    rule: "Picks lock 6 hours to 30 minutes before puck drop, only where the model's chance is 5+ points above what Kalshi's price needs (fee included). Goals, assists and points; skaters with 40+ games who played in the last 30 days. Graded by Kalshi's settlement.",
  },
}
const sign = (x: number, d = 2) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(d)}`

function PropTestCard({ t }: { t: PropsTest }) {
  const rules = PROP_RULES[t.sport]
  const target = rules?.target ?? 500
  const done = t.graded >= target
  const share = Math.min(1, t.graded / target)
  return (
    <li className='flex flex-col gap-3 rounded-2xl bg-card p-4'>
      <div className='flex items-baseline justify-between gap-3'>
        <h3 className='font-display text-xl font-extrabold'>{t.sport} props</h3>
        <span className={cn('font-condensed text-lg font-bold tabular-nums', t.graded ? (t.profit >= 0 ? 'text-good' : 'text-bad') : 'text-muted-foreground')}>
          {t.graded ? `${sign(t.profit)} per $1` : 'No picks graded'}
        </span>
      </div>
      {t.graded > 0 && (
        <div className='grid grid-cols-3 gap-2 text-center'>
          <div className='rounded-xl bg-background/60 px-2 py-2'>
            <div className='text-xs text-muted-foreground'>Graded</div>
            <div className='font-condensed text-[17px] font-bold tabular-nums'>{t.graded}</div>
          </div>
          <div className='rounded-xl bg-background/60 px-2 py-2'>
            <div className='text-xs text-muted-foreground'>Won</div>
            <div className='font-condensed text-[17px] font-bold tabular-nums'>{Math.round((t.wins / t.graded) * 100)}%</div>
          </div>
          <div className='rounded-xl bg-background/60 px-2 py-2'>
            <div className='text-xs text-muted-foreground'>Return</div>
            <div className={cn('font-condensed text-[17px] font-bold tabular-nums', t.roi == null ? '' : t.roi >= 0 ? 'text-good' : 'text-bad')}>
              {t.roi == null ? '—' : `${sign(t.roi * 100, 1)}%`}
            </div>
          </div>
        </div>
      )}
      <div>
        <div aria-hidden='true' className='h-1.5 overflow-hidden rounded-full bg-muted'>
          <div className={cn('h-full rounded-full', done ? 'bg-foreground' : 'bg-devig')} style={{ width: `${(share * 100).toFixed(1)}%` }} />
        </div>
        <p className='mt-1.5 text-xs text-muted-foreground'>
          {done
            ? `Reached the ${target} picks it's judged at${t.roi == null ? '.' : `: ${t.roi >= 0 ? 'up' : 'down'} ${Math.abs(t.roi * 100).toFixed(1)}% on what the picks cost, after Kalshi's fee.`}`
            : `${t.graded} of the ${target} picks it's judged at (or season end). Too few to judge yet.`}
        </p>
      </div>
      {rules && (
        <details className='group text-sm'>
          <summary className='cursor-pointer list-none font-semibold text-muted-foreground hover:text-foreground'>
            The rules <ChevronRight className='inline size-4 transition-transform group-open:rotate-90' aria-hidden='true' />
          </summary>
          <p className='mt-1.5 leading-relaxed text-muted-foreground'>
            {rules.rule} Nothing is bet.
            {t.prereg ? ` Rules locked before the first pick (fingerprint ${t.prereg.slice(0, 10)}…).` : ''}
          </p>
        </details>
      )}
    </li>
  )
}

export function TrackRecord() {
  const { records, isLoading, error } = useRecord()
  const { tests } = useProps()
  const order = ['NFL', 'NBA', 'NHL']
  const propTests = [...tests].sort((a, b) => order.indexOf(a.sport) - order.indexOf(b.sport))
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

            <Link to='/models' className='flex items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3.5 hover:bg-accent'>
              <span>
                <span className='block font-semibold'>Do DeVig&apos;s percentages come true?</span>
                <span className='text-sm text-muted-foreground'>Calibration and how each model compares, on Models.</span>
              </span>
              <ChevronRight className='size-5 shrink-0 text-muted-foreground' aria-hidden='true' />
            </Link>
          </>
        )}

        {propTests.length > 0 && (
          <section aria-label='Prop pick tests' className='flex flex-col gap-2'>
            <h2 className='px-1 font-display text-[22px] font-extrabold'>Prop pick tests</h2>
            <p className='px-1 text-sm text-muted-foreground'>
              Player-prop picks under rules written down before the first one, graded after. Profit is per $1 Kalshi contract, after the fee.
            </p>
            <ul className='grid gap-2 lg:grid-cols-3'>
              {propTests.map((t) => <PropTestCard key={t.sport} t={t} />)}
            </ul>
          </section>
        )}

        <section aria-label='Ended tests' className='rounded-2xl border border-dashed p-4'>
          <h2 className='font-semibold'>Ended tests</h2>
          <p className='mt-1 text-sm leading-relaxed text-muted-foreground'>
            The first NFL weather over/under, key-number ladder and low-total underdog tests were priced at sportsbooks through a paid odds feed.
            They ended on Oct 18, 2026 when DeVig moved to free Kalshi prices, with results kept as they were: weather 1–5, key-number ladder 7–5
            (+9.6 units), low-total underdog 0–1. None reached the size where it would be judged. Each restarted the same day on Kalshi prices
            under new rules written down first.
          </p>
        </section>
      </Main>
    </>
  )
}
