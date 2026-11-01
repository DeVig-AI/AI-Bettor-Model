import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { type GameRow, useGames } from '@/lib/devig'
import { LinkReader } from '../check-bet/link-reader'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ThemeSwitch } from '@/components/theme-switch'
import { isPick } from '../games/plate'

// History: check any Kalshi bet from its link (a combo leg by leg), keep the links you care about, and the games that
// just finished with how DeVig's pick did. The full pick log is on Record.

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
function FinalRow({ r }: { r: GameRow }) {
  const a = r.awayScore ?? 0, h = r.homeScore ?? 0
  const pick = isPick(r) ? r.pick : null
  return (
    <li className='border-b last:border-b-0'>
      <Link to='/game/$id' params={{ id: r.id }} className='flex min-h-14 items-center gap-3 px-4 py-2.5 hover:bg-muted/50'>
        <span className='min-w-0 flex-1'>
          <span className='flex justify-between gap-2'>
            <span className={cn('truncate', a > h ? 'font-bold' : 'text-muted-foreground')}>{r.awayName}</span>
            <span className={cn('font-condensed text-[17px] tabular-nums', a > h ? 'font-bold' : 'text-muted-foreground')}>{r.awayScore ?? '—'}</span>
          </span>
          <span className='flex justify-between gap-2'>
            <span className={cn('truncate', h > a ? 'font-bold' : 'text-muted-foreground')}>{r.homeName}</span>
            <span className={cn('font-condensed text-[17px] tabular-nums', h > a ? 'font-bold' : 'text-muted-foreground')}>{r.homeScore ?? '—'}</span>
          </span>
        </span>
        <span className='w-24 shrink-0 text-end text-xs'>
          {pick ? (
            <span className={cn('font-semibold', pick.correct === true ? 'text-good' : pick.correct === false ? 'text-bad' : 'text-muted-foreground')}>
              DeVig {pick.side}{pick.correct === true ? ' won' : pick.correct === false ? ' lost' : ', grading'}
            </span>
          ) : <span className='text-muted-foreground'>No pick</span>}
        </span>
        <ChevronRight className='size-4 shrink-0 text-muted-foreground' aria-hidden='true' />
      </Link>
    </li>
  )
}

const ORDER = ['NFL', 'NBA', 'MLB', 'NHL', 'WNBA', 'CFB']
const order = (s: string) => (ORDER.indexOf(s) + 1 || 99)

function RecentFinals() {
  const { rows, isLoading } = useGames()
  const finals = useMemo(() => rows.filter((r) => r.state === 'post').sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff)), [rows])
  const sports = useMemo(() => Array.from(new Set(finals.map((r) => r.sport))).sort((a, b) => order(a) - order(b) || a.localeCompare(b)), [finals])
  const [pickSport, setSport] = useState<string | null>(null)
  const sport = pickSport && sports.includes(pickSport) ? pickSport : sports[0]
  const days = useMemo(() => {
    const m = new Map<string, GameRow[]>()
    for (const r of finals.filter((x) => x.sport === sport)) {
      const k = dayFmt.format(new Date(r.kickoff))
      m.set(k, [...(m.get(k) ?? []), r])
    }
    return [...m]
  }, [finals, sport])

  return (
    <section aria-label='Recent finals' className='flex flex-col gap-2'>
      <h2 className='px-1 font-display text-[22px] font-extrabold'>Recent finals</h2>
      {isLoading ? <Skeleton className='h-48 w-full rounded-[18px]' /> : !finals.length ? (
        <p className='rounded-[18px] border border-dashed p-8 text-center text-muted-foreground'>No finished games in the last few days.</p>
      ) : (
        <>
          <div className='no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4'>
            {sports.map((s) => (
              <button key={s} type='button' aria-pressed={sport === s} onClick={() => setSport(s)}
                className={cn('h-9 shrink-0 rounded-full border px-4 text-sm font-medium text-muted-foreground', sport === s && 'border-foreground bg-foreground text-background')}>
                {s}
              </button>
            ))}
          </div>
          {days.map(([day, list]) => (
            <div key={day} className='flex flex-col gap-1.5'>
              <h3 className='px-1 pt-1 text-xs font-bold tracking-wide text-muted-foreground uppercase'>{day}</h3>
              <ul className='overflow-hidden rounded-[18px] bg-card'>{list.map((r) => <FinalRow key={r.id} r={r} />)}</ul>
            </div>
          ))}
        </>
      )}
      <p className='px-1 text-xs text-muted-foreground'>
        The last few days of finished games. Every graded DeVig pick, all season, is on{' '}
        <Link to='/track-record' className='font-semibold text-devig'>Record</Link>.
      </p>
    </section>
  )
}

export function History() {
  return (
    <>
      <Header>
        <div className='me-auto min-w-0'>
          <h1 className='font-display text-[26px] leading-none font-black'>History</h1>
          <p className='mt-0.5 truncate text-xs text-muted-foreground'>Check a Kalshi bet, and the games that just finished</p>
        </div>
        <ThemeSwitch />
      </Header>
      <Main className='flex flex-col gap-6'>
        <LinkReader />
        <RecentFinals />
      </Main>
    </>
  )
}
