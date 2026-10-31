import { useMemo, useState } from 'react'
import { BookOpen, RefreshCw, Search as SearchIcon } from 'lucide-react'
import { type Level, useExperience } from '@/lib/experience'
import { type GameRow, fmtAmerican, fmtPct, useGames } from '@/lib/devig'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ThemeSwitch } from '@/components/theme-switch'
import { FairLine } from './fair-line'

type Day = 'today' | 'tomorrow' | 'week'
const DAYS: { id: Day; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'week', label: '7 days' },
]

function dayStart(offset: number) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + offset)
  return d.getTime()
}

function inDay(row: GameRow, day: Day) {
  // a game still on counts as today, whatever day it started
  if (day === 'today' && row.state === 'in') return true
  const t = Date.parse(row.kickoff)
  if (day === 'today') return t >= dayStart(0) && t < dayStart(1)
  if (day === 'tomorrow') return t >= dayStart(1) && t < dayStart(2)
  return t >= dayStart(0) && t < dayStart(7)
}

const timeFmt = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
})
const dayFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})

function ago(d: Date | null) {
  if (!d) return 'not yet'
  const m = Math.round((Date.now() - d.getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  return `${Math.round(m / 60)} h ago`
}

const isPick = (r: GameRow) => !!r.pick?.side && r.pick.action !== 'PASS'

// ---------- one game ----------
function Status({ row, showDay }: { row: GameRow; showDay: boolean }) {
  if (row.state === 'in')
    return (
      <span className='flex items-center gap-1.5 font-semibold text-good'>
        <span
          aria-hidden='true'
          className='size-1.5 rounded-full bg-good motion-safe:animate-pulse'
        />
        <span className='sr-only'>Live, </span>
        {row.detail || 'Live'}
      </span>
    )
  const d = new Date(row.kickoff)
  if (row.state === 'post')
    return <span className='text-muted-foreground'>{row.detail || 'Final'}</span>
  return (
    <span className='text-muted-foreground'>
      {showDay && <>{dayFmt.format(d)} · </>}
      {timeFmt.format(d)}
    </span>
  )
}

function TeamLine({
  code,
  name,
  score,
  price,
  won,
}: {
  code: string
  name: string
  score: number | null
  price: number | null | undefined
  won: boolean
}) {
  return (
    <div className='grid grid-cols-[1fr_auto_3.5rem] items-baseline gap-x-3'>
      <span className='min-w-0 truncate'>
        <span
          className={cn(
            'font-condensed text-[1.0625rem] font-semibold tracking-wide',
            won && 'text-foreground'
          )}
        >
          {code}
        </span>
        {name !== code && (
          <span className='ms-2 text-sm text-muted-foreground'>{name}</span>
        )}
      </span>
      <span
        className={cn(
          'font-condensed text-[1.0625rem] font-semibold tabular-nums',
          score == null && 'invisible',
          won ? 'text-foreground' : 'text-foreground/80'
        )}
      >
        {score ?? 0}
      </span>
      <span className='text-end font-condensed text-sm text-muted-foreground tabular-nums'>
        {fmtAmerican(price)}
      </span>
    </div>
  )
}

function DevigLine({ row }: { row: GameRow }) {
  const p = row.pick
  if (!p) return null
  if (!isPick(row))
    return (
      <p className='text-sm text-muted-foreground'>
        <span className='font-semibold text-foreground/80'>DeVig: pass</span> ·
        not far enough from the market
      </p>
    )
  const result =
    p.correct === true ? 'Won' : p.correct === false ? 'Lost' : null
  return (
    <p className='flex flex-wrap items-baseline gap-x-2 text-sm'>
      <span className='font-semibold text-devig'>
        DeVig: {p.side} {fmtPct(p.prob)}
      </span>
      {row.edge != null && (
        <span className='font-condensed font-semibold text-devig tabular-nums'>
          {row.edge >= 0 ? '+' : '−'}
          {Math.abs(row.edge * 100).toFixed(1)} pts vs. Kalshi
        </span>
      )}
      {result && (
        <span
          className={cn(
            'font-semibold',
            p.correct ? 'text-good' : 'text-bad'
          )}
        >
          · {result}
        </span>
      )}
    </p>
  )
}

function explain(row: GameRow): string | null {
  const parts: string[] = []
  if (row.fairHome != null) {
    parts.push(
      `With Kalshi's fee gap removed, the prices give ${row.homeName} a ${fmtPct(row.fairHome)} chance and ${row.awayName} ${fmtPct(1 - row.fairHome)}.`
    )
  } else {
    parts.push('Kalshi has no price for this game yet.')
  }
  if (row.pick && isPick(row) && row.edge != null && row.pick.prob != null) {
    const more = row.edge >= 0
    parts.push(
      `DeVig's model gives ${row.pick.side} ${fmtPct(row.pick.prob)}, ${Math.abs(row.edge * 100).toFixed(1)} points ${more ? 'more' : 'less'} than the market. That's the amber mark on the line. It's a paper pick: nothing is bet.`
    )
  } else if (row.pick) {
    parts.push("DeVig's model is too close to the market here to pick a side.")
  }
  if (row.state === 'in') parts.push('Prices keep moving while the game is on.')
  return parts.join(' ')
}

function GameItem({
  row,
  showDay,
  level,
}: {
  row: GameRow
  showDay: boolean
  level: Level | null
}) {
  const done =
    row.state === 'post' && row.awayScore != null && row.homeScore != null
  const spreadTotal = [
    row.spread
      ? `${row.home} ${row.spread.home_point > 0 ? '+' : ''}${row.spread.home_point}`
      : null,
    row.total ? `O/U ${row.total.line}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <li
      className={cn(
        'grid gap-x-6 gap-y-2.5 border-b px-4 py-3.5 last:border-b-0 md:px-5',
        'lg:grid-cols-[8.5rem_minmax(15rem,1fr)_minmax(16rem,1.15fr)] lg:items-center lg:py-3',
        row.state === 'in' && 'bg-good/[0.04]'
      )}
    >
      <div className='flex items-center justify-between text-sm lg:flex-col lg:items-start lg:gap-1'>
        <Status row={row} showDay={showDay} />
        <span className='font-condensed text-xs font-semibold tracking-wider text-muted-foreground'>
          {row.sport}
        </span>
      </div>

      <div className='space-y-0.5'>
        <TeamLine
          code={row.away}
          name={row.awayName}
          score={row.awayScore}
          price={row.ml?.away}
          won={done && row.awayScore! > row.homeScore!}
        />
        <TeamLine
          code={row.home}
          name={row.homeName}
          score={row.homeScore}
          price={row.ml?.home}
          won={done && row.homeScore! > row.awayScore!}
        />
      </div>

      <div className='space-y-2'>
        <FairLine row={row} />
        <div className='flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 empty:hidden'>
          <DevigLine row={row} />
          {spreadTotal && (
            <span className='font-condensed text-sm text-muted-foreground tabular-nums'>
              {spreadTotal}
            </span>
          )}
        </div>
        {level === 'new' && (
          <p className='max-w-prose text-sm leading-relaxed text-muted-foreground'>
            {explain(row)}
          </p>
        )}
      </div>
    </li>
  )
}

function Group({
  title,
  rows,
  showDay,
  level,
}: {
  title: string
  rows: GameRow[]
  showDay: boolean
  level: Level | null
}) {
  if (!rows.length) return null
  return (
    <section aria-label={title} className='overflow-hidden rounded-xl border bg-card'>
      <h2 className='flex items-baseline justify-between border-b bg-sidebar px-4 py-2.5 text-sm font-semibold md:px-5'>
        {title}
        <span className='font-condensed text-muted-foreground tabular-nums'>
          {rows.length}
        </span>
      </h2>
      <ul>
        {rows.map((r) => (
          <GameItem key={r.id} row={r} showDay={showDay} level={level} />
        ))}
      </ul>
    </section>
  )
}

// ---------- first visit: how much to explain ----------
function LevelPrompt({ onPick }: { onPick: (l: Level) => void }) {
  return (
    <div className='flex flex-col gap-3 rounded-xl border border-devig/40 bg-devig/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between'>
      <div>
        <p className='font-semibold'>New to betting odds?</p>
        <p className='text-sm text-muted-foreground'>
          DeVig can explain each game&apos;s numbers in plain words. You can
          change this any time with the book button at the top.
        </p>
      </div>
      <div className='flex shrink-0 gap-2'>
        <Button onClick={() => onPick('new')}>Yes, explain</Button>
        <Button variant='outline' onClick={() => onPick('experienced')}>
          I know odds
        </Button>
      </div>
    </div>
  )
}

function Chip({
  active,
  children,
  ...props
}: React.ComponentProps<'button'> & { active: boolean }) {
  return (
    <button
      type='button'
      aria-pressed={active}
      className={cn(
        'h-8 shrink-0 rounded-full border px-3.5 text-sm font-medium transition-colors duration-150',
        active
          ? 'border-foreground bg-foreground text-background'
          : 'text-muted-foreground hover:border-input hover:text-foreground'
      )}
      {...props}
    >
      {children}
    </button>
  )
}

// ---------- page ----------
export function Games() {
  const { rows, updatedAt, isLoading, error, picksError, refetch, isFetching } =
    useGames()
  const { level, asked, setLevel } = useExperience()
  const [day, setDay] = useState<Day>('today')
  const [league, setLeague] = useState('ALL')
  const [picksOnly, setPicksOnly] = useState(false)
  const [query, setQuery] = useState('')

  const dayRows = useMemo(() => rows.filter((r) => inDay(r, day)), [rows, day])
  const leagues = useMemo(
    () => Array.from(new Set(dayRows.map((r) => r.sport))).sort(),
    [dayRows]
  )
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return dayRows.filter(
      (r) =>
        (league === 'ALL' || r.sport === league) &&
        (!picksOnly || isPick(r)) &&
        (!q ||
          `${r.away} ${r.home} ${r.awayName} ${r.homeName}`
            .toLowerCase()
            .includes(q))
    )
  }, [dayRows, league, picksOnly, query])

  // DeVig's own reads lead the board; every other game falls into live, upcoming or final
  const picked = shown.filter(isPick)
  const rest = shown.filter((r) => !isPick(r))
  const live = rest.filter((r) => r.state === 'in')
  const upcoming = rest.filter((r) => r.state === 'pre')
  const final = rest.filter((r) => r.state === 'post').reverse()
  const picks = dayRows.filter(isPick).length
  const liveCount = dayRows.filter((r) => r.state === 'in').length
  const showDay = day !== 'today'
  const filtered = league !== 'ALL' || picksOnly || query.trim() !== ''

  return (
    <>
      <Header>
        <div className='me-auto min-w-0'>
          <h1 className='text-lg leading-tight font-bold'>Games</h1>
          <p className='truncate text-xs text-muted-foreground'>
            {isLoading
              ? 'Loading prices…'
              : `${dayRows.length} games, ${liveCount} live, ${picks} DeVig ${picks === 1 ? 'pick' : 'picks'}`}
          </p>
        </div>
        <Button
          variant='ghost'
          size='sm'
          onClick={refetch}
          disabled={isFetching}
          className='text-muted-foreground'
          aria-label={`Refresh. Updated ${ago(updatedAt)}`}
        >
          <RefreshCw className={cn(isFetching && 'animate-spin')} />
          <span className='max-sm:hidden'>{ago(updatedAt)}</span>
        </Button>
        <Button
          variant='ghost'
          size='icon'
          aria-pressed={level === 'new'}
          aria-label={level === 'new' ? 'Hide explanations' : 'Explain the numbers'}
          title={level === 'new' ? 'Hide explanations' : 'Explain the numbers'}
          onClick={() => setLevel(level === 'new' ? 'experienced' : 'new')}
          className={cn(level === 'new' && 'text-devig')}
        >
          <BookOpen />
        </Button>
        <ThemeSwitch />
      </Header>

      <Main className='flex flex-col gap-4'>
        {!asked && <LevelPrompt onPick={setLevel} />}

        {error && (
          <Alert variant='destructive'>
            <AlertTitle>Prices didn&apos;t load</AlertTitle>
            <AlertDescription>
              {String((error as Error).message)}. Check your connection, then
              press refresh at the top.
            </AlertDescription>
          </Alert>
        )}
        {picksError && !error && (
          <Alert>
            <AlertTitle>DeVig&apos;s picks didn&apos;t load</AlertTitle>
            <AlertDescription>
              Prices are up to date; picks will appear on the next refresh.
            </AlertDescription>
          </Alert>
        )}

        <div className='flex flex-col gap-3 lg:flex-row lg:items-center'>
          <div
            role='group'
            aria-label='League'
            className='no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0'
          >
            <Chip active={league === 'ALL'} onClick={() => setLeague('ALL')}>
              All
            </Chip>
            {leagues.map((l) => (
              <Chip key={l} active={league === l} onClick={() => setLeague(l)}>
                {l}
              </Chip>
            ))}
            <span aria-hidden='true' className='mx-1 w-px shrink-0 bg-border' />
            <Chip active={picksOnly} onClick={() => setPicksOnly((v) => !v)}>
              DeVig picks
            </Chip>
          </div>
          <div className='flex gap-2 lg:ms-auto'>
            <div
              role='radiogroup'
              aria-label='Day'
              className='flex h-9 shrink-0 rounded-lg border bg-sidebar p-0.5'
            >
              {DAYS.map((d) => (
                <button
                  key={d.id}
                  type='button'
                  role='radio'
                  aria-checked={day === d.id}
                  onClick={() => setDay(d.id)}
                  className={cn(
                    'rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors duration-150',
                    day === d.id && 'bg-card text-foreground shadow-sm'
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <label className='relative min-w-0 flex-1 lg:w-52 lg:flex-none'>
              <span className='sr-only'>Find a team</span>
              <SearchIcon
                aria-hidden='true'
                className='pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground'
              />
              <Input
                placeholder='Find a team'
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className='h-9 ps-8'
              />
            </label>
          </div>
        </div>

        {isLoading ? (
          <div className='overflow-hidden rounded-xl border bg-card'>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className='space-y-2.5 border-b px-4 py-4 last:border-b-0'>
                <Skeleton className='h-4 w-24' />
                <Skeleton className='h-10 w-full' />
                <Skeleton className='h-2 w-full' />
              </div>
            ))}
          </div>
        ) : shown.length === 0 && !error ? (
          <div className='rounded-xl border border-dashed px-6 py-12 text-center'>
            <p className='font-semibold'>
              {filtered
                ? 'No games match these filters'
                : `No games ${day === 'today' ? 'today' : day === 'tomorrow' ? 'tomorrow' : 'in the next 7 days'}`}
            </p>
            <p className='mt-1 text-sm text-muted-foreground'>
              {filtered
                ? 'Clear the filters to see every game.'
                : 'Try another day; schedules fill in as leagues post them.'}
            </p>
            <div className='mt-4 flex justify-center gap-2'>
              {filtered ? (
                <Button
                  variant='outline'
                  onClick={() => {
                    setLeague('ALL')
                    setPicksOnly(false)
                    setQuery('')
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                day !== 'week' && (
                  <Button variant='outline' onClick={() => setDay('week')}>
                    Show the next 7 days
                  </Button>
                )
              )}
            </div>
          </div>
        ) : (
          <>
            <Group title="DeVig's picks" rows={picked} showDay={showDay} level={level} />
            <Group title='Live now' rows={live} showDay={false} level={level} />
            <Group title='Upcoming' rows={upcoming} showDay={showDay} level={level} />
            <Group title='Final' rows={final} showDay={showDay} level={level} />
          </>
        )}

        <p className='max-w-prose text-xs leading-relaxed text-muted-foreground'>
          The line splits each game at Kalshi&apos;s price with the fee gap
          removed (a proportional split, which matches the exchange&apos;s mid
          price). The amber mark is DeVig&apos;s model. Scores are ESPN&apos;s,
          unofficial. DeVig&apos;s picks are paper picks, locked before the
          game; nothing is bet.
        </p>
      </Main>
    </>
  )
}
