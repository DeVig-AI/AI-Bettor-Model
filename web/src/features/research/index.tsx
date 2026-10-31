import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronRight, Search } from 'lucide-react'
import { RS_SPORTS, rsNum, rsShort, rsSigned, seasonYear, teamColor, useRsIndex } from '@/lib/research'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ThemeSwitch } from '@/components/theme-switch'

// Research home: DeVig's power rankings and a player search, per sport. Numbers to check for yourself, no picks.

const updatedFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
const KEY = 'devig_rs_sport'
const saved = () => {
  try {
    const s = localStorage.getItem(KEY)
    return s && (RS_SPORTS as readonly string[]).includes(s) ? s : 'NBA'
  } catch {
    return 'NBA'
  }
}

export function TeamChip({ sport, code, color, className }: { sport: string; code: string; color?: string | null; className?: string }) {
  const c = teamColor(sport, code, color)
  return (
    <span
      aria-hidden='true'
      className={cn('grid h-7 w-10 shrink-0 place-items-center rounded-md font-condensed text-xs font-bold text-white', className)}
      style={{ background: c, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.12)' }}
    >
      <span className='drop-shadow-[0_1px_1px_rgba(0,0,0,.6)]'>{code.slice(0, 4)}</span>
    </span>
  )
}

export function Research() {
  const [sport, setSportRaw] = useState(saved)
  const [tab, setTab] = useState<'rank' | 'players'>('rank')
  const [q, setQ] = useState('')
  const { data: idx, isLoading, error } = useRsIndex(sport)
  const setSport = (s: string) => {
    setSportRaw(s)
    setQ('')
    try { localStorage.setItem(KEY, s) } catch { /* private mode */ }
  }

  const players = useMemo(() => {
    if (!idx) return []
    const n = q.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    return idx.players
      .filter((p) => !n || String(p[1]).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(n))
      .slice(0, 40)
  }, [idx, q])
  const cur = idx ? seasonYear(idx) : 0
  const sc = idx?.search_cols ?? []
  const maxRating = idx ? Math.max(1, ...idx.teams.map((t) => Math.abs(t.rating ?? 0))) : 1

  return (
    <>
      <Header>
        <div className='me-auto min-w-0'>
          <h1 className='font-display text-[26px] leading-none font-black'>Research</h1>
          <p className='mt-0.5 truncate text-xs text-muted-foreground'>Rankings, team and player stats to check for yourself</p>
        </div>
        <ThemeSwitch />
      </Header>
      <Main className='flex flex-col gap-5'>
        <p className='rounded-2xl bg-card px-4 py-3 text-sm leading-relaxed'>
          Numbers only, no picks. A player&apos;s hot streak is usually already in Kalshi&apos;s price.
        </p>

        <div className='flex flex-col gap-2'>
          <div className='no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4'>
            {RS_SPORTS.map((s) => (
              <button key={s} type='button' aria-pressed={sport === s} onClick={() => setSport(s)}
                className={cn('h-9 shrink-0 rounded-full border px-4 text-sm font-medium text-muted-foreground', sport === s && 'border-foreground bg-foreground text-background')}>
                {s}
              </button>
            ))}
          </div>
          <div role='tablist' className='grid grid-cols-2 rounded-xl bg-card p-1'>
            {([['rank', 'Power rankings'], ['players', 'Players']] as const).map(([k, label]) => (
              <button key={k} type='button' role='tab' aria-selected={tab === k} onClick={() => setTab(k)}
                className={cn('h-9 rounded-lg text-sm font-semibold text-muted-foreground', tab === k && 'bg-background text-foreground shadow-sm')}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <p className='rounded-[18px] border border-dashed p-8 text-center text-muted-foreground'>
            These stats aren&apos;t available right now. Check your connection and try again.
          </p>
        ) : isLoading || !idx ? (
          <Skeleton className='h-96 w-full rounded-[18px]' />
        ) : tab === 'rank' ? (
          <section aria-label={`${sport} power rankings`} className='flex flex-col gap-2'>
            <ol className='overflow-hidden rounded-[18px] bg-card'>
              {idx.teams.map((t) => {
                const r = t.rating ?? 0
                return (
                  <li key={t.code} className='border-b last:border-b-0'>
                    <Link to='/research/team/$sport/$code' params={{ sport, code: t.code }}
                      className='flex min-h-14 items-center gap-3 px-3 py-2 hover:bg-muted/50'>
                      <span className='w-7 shrink-0 text-end font-display text-2xl font-black tabular-nums text-muted-foreground'>{t.rank}</span>
                      <TeamChip sport={sport} code={t.code} color={t.color} />
                      <span className='min-w-0 flex-1'>
                        <span className='block truncate font-semibold'>{t.name}</span>
                        <span className='block text-xs text-muted-foreground tabular-nums'>
                          {(t.record || '0-0').replace(/-/g, '–')}
                          {t.last10 ? ` · ${idx.rank_last || 'Last 10'} ${t.last10.replace(/-/g, '–')}` : ''}
                        </span>
                      </span>
                      <span className='flex w-20 shrink-0 flex-col items-end gap-1'>
                        <span className={cn('font-condensed text-[17px] font-bold tabular-nums', r > 0 ? 'text-good' : r < 0 ? 'text-bad' : '')}>{rsSigned(t.rating)}</span>
                        <span aria-hidden='true' className='relative h-1 w-full rounded-full bg-muted'>
                          <span className={cn('absolute top-0 h-1 rounded-full', r >= 0 ? 'left-1/2 bg-good' : 'right-1/2 bg-bad')}
                            style={{ width: `${(Math.abs(r) / maxRating) * 50}%` }} />
                        </span>
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ol>
            <p className='px-1 text-xs leading-relaxed text-muted-foreground'>
              <b>Rating</b>: {idx.rating_note} {idx.source} Updated {updatedFmt.format(new Date(idx.generated_at))}.
            </p>
          </section>
        ) : (
          <section aria-label={`${sport} players`} className='flex flex-col gap-2'>
            <label className='flex h-11 items-center gap-2 rounded-xl border bg-card px-3 focus-within:border-foreground'>
              <Search className='size-4 text-muted-foreground' aria-hidden='true' />
              <input type='search' value={q} onChange={(e) => setQ(e.target.value)} placeholder='Search players' autoComplete='off'
                className='h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground' />
            </label>
            {players.length === 0 ? (
              <p className='rounded-[18px] border border-dashed p-8 text-center text-muted-foreground'>No player matches.</p>
            ) : (
              <ul className='overflow-hidden rounded-[18px] bg-card'>
                <li aria-hidden='true' className='flex items-center gap-3 border-b px-3 py-2 text-xs font-semibold text-muted-foreground'>
                  <span className='flex-1'>Player</span>
                  {sc.map((c) => <span key={c} className='w-12 text-end'>{c}</span>)}
                  <span className='w-4' />
                </li>
                {players.map((p) => {
                  const old = p[p.length - 1] !== cur
                  return (
                    <li key={String(p[0])} className='border-b last:border-b-0'>
                      <Link to='/research/player/$sport/$team/$id' params={{ sport, team: String(p[2]), id: String(p[0]) }}
                        className='flex min-h-14 items-center gap-3 px-3 py-2 hover:bg-muted/50'>
                        <TeamChip sport={sport} code={String(p[2])} color={idx.teams.find((t) => t.code === p[2])?.color} />
                        <span className='min-w-0 flex-1'>
                          <span className='block truncate font-semibold'>{p[1]}</span>
                          <span className='block text-xs text-muted-foreground'>
                            {p[3] || ''}{old ? ` · ${rsShort(idx.last_season)}` : ''}
                          </span>
                        </span>
                        {sc.map((c, i) => (
                          <span key={c} className='w-12 text-end font-condensed text-[15px] font-semibold tabular-nums'>{rsNum(p[5 + i])}</span>
                        ))}
                        <ChevronRight className='size-4 shrink-0 text-muted-foreground' aria-hidden='true' />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
            <p className='px-1 text-xs text-muted-foreground'>
              Per game this season ({rsShort(idx.season)}), or last season for players who haven&apos;t played yet. Top 40 shown; search for anyone.
            </p>
          </section>
        )}
      </Main>
    </>
  )
}
