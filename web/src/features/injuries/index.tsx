import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useGames } from '@/lib/devig'
import { type Injury, useInjuries } from '@/lib/injuries'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ThemeSwitch } from '@/components/theme-switch'

// Injuries: each league's official report, game by game, starters and the biggest impact first. Information only:
// DeVig's NBA and MLB models don't read it (NFL Model 2.0 counts who's out), and Kalshi's price may already include it.

const rank = (x: Injury) => (x.starter ? 0 : 10) + (/out/i.test(x.status) ? 0 : /doubt/i.test(x.status) ? 1 : 2) - (x.impact?.bars ?? 0) * 0.1

export function Injuries() {
  const q = useInjuries()
  const { rows } = useGames()
  const [sport, setSport] = useState<string | null>(null)
  const [all, setAll] = useState(false)
  const list = q.data ?? []
  const sports = useMemo(() => Array.from(new Set(list.map((x) => x.sport))).sort(), [list])
  const sp = sport && sports.includes(sport) ? sport : sports[0]

  const games = useMemo(() => {
    const g = new Map<string, Injury[]>()
    for (const x of list.filter((i) => i.sport === sp && (all || i.starter || /out|doubt/i.test(i.status)))) {
      const k = `${x.away}@${x.home}`
      g.set(k, [...(g.get(k) ?? []), x])
    }
    return [...g.entries()].map(([k, xs]) => {
      const row = rows.find((r) => r.sport === sp && r.away === xs[0].away && r.home === xs[0].home)
      return { k, xs: xs.sort((a, b) => rank(a) - rank(b)), row }
    }).sort((a, b) => Date.parse(a.row?.kickoff ?? '9999') - Date.parse(b.row?.kickoff ?? '9999'))
  }, [list, sp, all, rows])

  return (
    <>
      <Header>
        <div className='me-auto min-w-0'>
          <h1 className='font-display text-[26px] leading-none font-black'>Injuries</h1>
          <p className='mt-0.5 truncate text-xs text-muted-foreground'>From each league&apos;s official report</p>
        </div>
        <ThemeSwitch />
      </Header>
      <Main className='flex flex-col gap-5'>
        <p className='rounded-2xl bg-card px-4 py-3 text-sm leading-relaxed'>
          Information only. DeVig&apos;s NBA and MLB models don&apos;t read injuries (NFL Model 2.0 counts who&apos;s out), and Kalshi&apos;s price may already include them.
        </p>
        <div className='flex flex-wrap items-center gap-2'>
          {sports.map((s) => (
            <button key={s} type='button' aria-pressed={sp === s} onClick={() => setSport(s)}
              className={cn('h-9 rounded-full border px-4 text-sm font-medium text-muted-foreground', sp === s && 'border-foreground bg-foreground text-background')}>
              {s}
            </button>
          ))}
          <button type='button' aria-pressed={all} onClick={() => setAll(!all)}
            className={cn('ms-auto h-9 rounded-full border px-4 text-sm text-muted-foreground', all && 'border-foreground text-foreground')}>
            {all ? 'Showing everyone' : 'Starters and outs'}
          </button>
        </div>

        {q.isLoading ? (
          <Skeleton className='h-64 w-full rounded-[18px]' />
        ) : games.length === 0 ? (
          <p className='rounded-[18px] border border-dashed p-8 text-center text-muted-foreground'>No injuries on the {sp ?? ''} report right now.</p>
        ) : (
          <div className='grid gap-4 lg:grid-cols-2'>
            {games.map(({ k, xs, row }) => {
              const c = row?.colors
              const head = (
                <div
                  className='relative flex h-11 items-center justify-between px-4 font-display text-xl font-extrabold text-white'
                  style={{ background: c ? `linear-gradient(102deg, ${c.away} 0 50%, ${c.home} 50% 100%)` : 'linear-gradient(102deg, var(--side-away) 0 50%, var(--side-home) 50% 100%)' }}
                >
                  <div aria-hidden='true' className='absolute inset-0 bg-black/25' />
                  <span className='relative'>{xs[0].away}</span>
                  <span className='relative font-sans text-xs font-semibold'>{row ? 'Open game' : ''}</span>
                  <span className='relative'>{xs[0].home}</span>
                </div>
              )
              return (
                <section key={k} aria-label={`${xs[0].away} at ${xs[0].home}`} className='overflow-hidden rounded-[18px] bg-card'>
                  {row ? <Link to='/game/$id' params={{ id: row.id }}>{head}</Link> : head}
                  <ul>
                    {xs.map((x) => (
                      <li key={x.team + x.player} className='flex items-start justify-between gap-3 border-b px-4 py-2.5 last:border-b-0'>
                        <span className='min-w-0'>
                          <span className='font-semibold'>{x.player}</span>{' '}
                          <span className='text-sm text-muted-foreground'>{x.team}{x.starter ? ' · starter' : ''}</span>
                          {(x.impact?.why || x.reason) && <span className='block text-xs text-muted-foreground'>{x.impact?.why || x.reason}</span>}
                        </span>
                        <span className='shrink-0 text-end'>
                          <span className={cn('block text-sm font-bold', /out/i.test(x.status) ? 'text-bad' : 'text-[#F5C77A]')}>{x.status}</span>
                          {x.impact?.label && <span className='text-xs text-muted-foreground'>{x.impact.label} impact</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>
        )}
      </Main>
    </>
  )
}
