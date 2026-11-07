import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { SOCCER, isSoccer, useGames } from '@/lib/devig'
import { type Injury, useInjuries } from '@/lib/injuries'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ThemeSwitch } from '@/components/theme-switch'

// Injuries: each league's report (NBA official, ESPN for the NFL and NHL, Fantasy Premier League for the EPL, FotMob for the
// other soccer leagues, Covers.com for college), game by game, starters and the biggest impact first. Information only:
// DeVig's NFL and NBA models count who's out; its other models don't read it, and Kalshi's price may already include it.

const ORDER = ['NFL', 'NBA', 'NHL', 'CFB', 'CBB', 'SOCCER']
const rank = (x: Injury) => (x.starter ? 0 : 10) + (/out|suspend|reserve/i.test(x.status) ? 0 : /doubt/i.test(x.status) ? 1 : 2) - (x.impact?.bars ?? 0) * 0.1

export function Injuries() {
  const q = useInjuries()
  const { rows } = useGames()
  const [sport, setSport] = useState<string | null>(null)
  const [all, setAll] = useState(false)
  const list = q.data ?? []
  const sports = useMemo(() => Array.from(new Set(list.map((x) => x.sport))), [list])
  // one button per sport, soccer's leagues in a row of their own under it
  const groups = useMemo(() => ORDER.filter((g) => sports.some((s) => (isSoccer(s) ? 'SOCCER' : s) === g)), [sports])
  const [group, setGroup] = useState<string | null>(null)
  const gp = group && groups.includes(group) ? group : groups[0]
  const leagues = useMemo(() => Object.keys(SOCCER).filter((s) => sports.includes(s)), [sports])
  const sp = gp === 'SOCCER' ? (sport && leagues.includes(sport) ? sport : leagues[0]) : gp

  const games = useMemo(() => {
    const g = new Map<string, Injury[]>()
    for (const x of list.filter((i) => i.sport === sp && (all || i.starter || /out|doubt|suspend|reserve/i.test(i.status)))) {
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
          <p className='mt-0.5 truncate text-xs text-muted-foreground'>NFL, NBA, NHL, college and soccer</p>
        </div>
        <ThemeSwitch />
      </Header>
      <Main className='flex flex-col gap-5'>
        <p className='rounded-2xl bg-card px-4 py-3 text-sm leading-relaxed'>
          DeVig&apos;s NFL and NBA models count who&apos;s out. Its other models don&apos;t read injuries, so for those sports this is information only. Kalshi&apos;s price may already include them. College reports come from Covers.com and soccer outside the Premier League from FotMob; college basketball has no impact scale yet, since DeVig has no player stats for it.
        </p>
        <div className='flex flex-wrap items-center gap-2'>
          {groups.map((g) => (
            <button key={g} type='button' aria-pressed={gp === g} onClick={() => setGroup(g)}
              className={cn('h-9 rounded-full border px-4 text-sm font-medium text-muted-foreground', gp === g && 'border-foreground bg-foreground text-background')}>
              {g === 'SOCCER' ? 'Soccer' : g}
            </button>
          ))}
          <button type='button' aria-pressed={all} onClick={() => setAll(!all)}
            className={cn('ms-auto h-9 rounded-full border px-4 text-sm text-muted-foreground', all && 'border-foreground text-foreground')}>
            {all ? 'Showing everyone' : 'Starters and outs'}
          </button>
        </div>
        {gp === 'SOCCER' && leagues.length > 1 && (
          <div className='-mt-2 flex gap-2 overflow-x-auto pb-1' role='group' aria-label='League'>
            {leagues.map((s) => (
              <button key={s} type='button' aria-pressed={sp === s} onClick={() => setSport(s)}
                className={cn('h-8 shrink-0 rounded-full border px-3 text-xs font-medium text-muted-foreground', sp === s && 'border-foreground text-foreground')}>
                {SOCCER[s]}
              </button>
            ))}
          </div>
        )}

        {q.isLoading ? (
          <Skeleton className='h-64 w-full rounded-[18px]' />
        ) : games.length === 0 ? (
          <p className='rounded-[18px] border border-dashed p-8 text-center text-muted-foreground'>No injuries on the {sp ? SOCCER[sp] ?? sp : ''} report right now.</p>
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
                          <span className={cn('block text-sm font-bold', /out|suspend|reserve/i.test(x.status) ? 'text-bad' : 'text-[#F5C77A]')}>{x.status}</span>
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
