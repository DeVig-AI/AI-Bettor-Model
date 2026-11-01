import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { BookOpen, RefreshCw, Search as SearchIcon } from 'lucide-react'
import { type Level, useExperience } from '@/lib/experience'
import { type GameRow, fmtAmerican, fmtPct, useGames, useRecord } from '@/lib/devig'
import { isFavorite, usePrefs } from '@/lib/profile'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ThemeSwitch } from '@/components/theme-switch'
import { ExplainSheet } from './explain-sheet'
import { Plate, isPick } from './plate'
import { PlateTaps } from './plate-taps'

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
  if (day === 'today' && row.state === 'in') return true // a game still on counts as today
  const t = Date.parse(row.kickoff)
  if (day === 'today') return t >= dayStart(0) && t < dayStart(1)
  if (day === 'tomorrow') return t >= dayStart(1) && t < dayStart(2)
  return t >= dayStart(0) && t < dayStart(7)
}

function ago(d: Date | null) {
  if (!d) return 'not yet'
  const m = Math.round((Date.now() - d.getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  return `${Math.round(m / 60)} h ago`
}

// ---------- one game: plate + the line under it ----------
function GameItem({ row, showDay, onWhy }: { row: GameRow; showDay: boolean; onWhy: (r: GameRow) => void }) {
  const p = row.pick
  const picked = isPick(row)
  const result = p?.correct === true ? 'Won' : p?.correct === false ? 'Lost' : null
  const spreadTotal = [
    row.spread ? `${row.home} ${row.spread.home_point > 0 ? '+' : ''}${row.spread.home_point}` : null,
    row.total ? `O/U ${row.total.line}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <li className='flex flex-col gap-2'>
      <div className='relative'>
        <Plate row={row} showDay={showDay} />
        {row.state === 'pre' && <PlateTaps row={row} />}
      </div>
      <div className='flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1 text-sm'>
        {picked && p?.prob != null ? (
          <span className='flex items-center gap-2 font-semibold text-devig'>
            DeVig{row.state === 'pre' ? '' : ' pregame'}: {p.side} {fmtPct(p.prob)}
            {row.edge != null && row.state === 'pre' && (
              <span className='font-condensed tabular-nums'>
                {Math.abs(row.edge * 100).toFixed(1)} {row.edge >= 0 ? 'above' : 'below'} Kalshi
              </span>
            )}
            {result && <span className={p?.correct ? 'text-good' : 'text-bad'}>· {result}</span>}
          </span>
        ) : p ? (
          <span className='text-muted-foreground'>
            <span className='font-semibold text-foreground/85'>DeVig: pass</span> · not far enough from the market
          </span>
        ) : (
          <span className='font-condensed text-muted-foreground tabular-nums'>{spreadTotal}</span>
        )}
        <span className='flex items-center gap-3'>
          <span className='font-condensed text-muted-foreground tabular-nums'>
            {fmtAmerican(row.ml?.away)} / {fmtAmerican(row.ml?.home)}
          </span>
          <Link
            to='/game/$id'
            params={{ id: row.id }}
            className='flex h-8 items-center rounded-full border px-3 text-sm font-semibold text-muted-foreground transition-colors duration-150 hover:text-foreground'
          >
            Game
          </Link>
          {picked && (
            <button
              type='button'
              onClick={() => onWhy(row)}
              className='h-8 rounded-full bg-devig px-3.5 text-sm font-bold text-devig-ink transition-opacity duration-150 hover:opacity-90'
            >
              Why?
            </button>
          )}
        </span>
      </div>
    </li>
  )
}

function Group({
  title,
  rows,
  showDay,
  onWhy,
  dot,
}: {
  title: string
  rows: GameRow[]
  showDay: boolean
  onWhy: (r: GameRow) => void
  dot?: boolean
}) {
  if (!rows.length) return null
  return (
    <section aria-label={title} className='flex flex-col gap-3'>
      <h2 className='flex items-center justify-between px-1 font-display text-[22px] font-extrabold'>
        <span className='flex items-center gap-2'>
          {dot && <span aria-hidden='true' className='size-2 rounded-full bg-live' />}
          {title}
        </span>
        <span className='font-sans text-sm font-semibold text-muted-foreground tabular-nums'>{rows.length}</span>
      </h2>
      <ul className='grid gap-5 lg:grid-cols-2'>
        {rows.map((r) => (
          <GameItem key={r.id} row={r} showDay={showDay} onWhy={onWhy} />
        ))}
      </ul>
    </section>
  )
}

// ---------- first visit: how much to explain ----------
const TYPES: { id: Level; title: string; body: string; tint: string }[] = [
  { id: 'new', title: 'New to this', body: 'Every number in plain words.', tint: '#17402B' },
  { id: 'sometimes', title: 'I bet sometimes', body: 'The short version: what drove the pick, and is the price worth it.', tint: '#14304A' },
  { id: 'numbers', title: 'Show me the numbers', body: 'Model inputs, price at lock vs now, the record.', tint: '#3C2A10' },
]
function LevelPrompt({ onPick }: { onPick: (l: Level) => void }) {
  return (
    <section aria-label='How do you bet?' className='flex flex-col gap-3 rounded-[18px] bg-card p-4'>
      <div>
        <h2 className='font-display text-[26px] leading-none font-black'>How do you bet?</h2>
        <p className='mt-1.5 text-sm text-muted-foreground'>
          DeVig explains every pick. Choose how much; the numbers are the same for everyone. Change it any time with the book button.
        </p>
      </div>
      <div className='grid gap-2 sm:grid-cols-3'>
        {TYPES.map((t) => (
          <button
            key={t.id}
            type='button'
            onClick={() => onPick(t.id)}
            className='flex min-h-[84px] flex-col justify-end rounded-2xl p-3.5 text-start text-white transition-transform duration-150 active:scale-[0.98]'
            style={{ background: `linear-gradient(102deg, ${t.tint} 0 62%, #1A1E28 62% 100%)` }}
          >
            <span className='font-display text-[22px] leading-none font-black'>{t.title}</span>
            <span className='mt-1 text-[13px] text-white/85'>{t.body}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function Chip({ active, children, ...props }: React.ComponentProps<'button'> & { active: boolean }) {
  return (
    <button
      type='button'
      aria-pressed={active}
      className={cn(
        'h-9 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors duration-150',
        active ? 'border-foreground bg-foreground text-background' : 'text-muted-foreground hover:border-input hover:text-foreground'
      )}
      {...props}
    >
      {children}
    </button>
  )
}

const NEXT_LEVEL: Record<Level, Level> = { new: 'sometimes', sometimes: 'numbers', numbers: 'new' }
const LEVEL_NAME: Record<Level, string> = { new: 'New to this', sometimes: 'I bet sometimes', numbers: 'Show me the numbers' }

// ---------- page ----------
export function Games() {
  const { rows, updatedAt, isLoading, error, picksError, refetch, isFetching } = useGames()
  const { records } = useRecord()
  const { prefs } = usePrefs()
  const { level, asked, setLevel } = useExperience()
  const [day, setDay] = useState<Day>('today')
  const [league, setLeague] = useState('ALL')
  const [picksOnly, setPicksOnly] = useState(false)
  const [query, setQuery] = useState('')
  const [why, setWhy] = useState<GameRow | null>(null)

  const dayRows = useMemo(() => rows.filter((r) => inDay(r, day)), [rows, day])
  const leagues = useMemo(() => Array.from(new Set(dayRows.map((r) => r.sport))).sort(), [dayRows])
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return dayRows.filter(
      (r) =>
        (league === 'ALL' || r.sport === league) &&
        (!picksOnly || isPick(r)) &&
        (!q || `${r.away} ${r.home} ${r.awayName} ${r.homeName}`.toLowerCase().includes(q))
    )
  }, [dayRows, league, picksOnly, query])

  // favorite teams' games first within each group (stable: kickoff order otherwise)
  const favFirst = (list: GameRow[]) => [...list].sort((a, b) => Number(isFavorite(prefs, b.sport, b.away, b.home)) - Number(isFavorite(prefs, a.sport, a.away, a.home)))
  const picked = favFirst(shown.filter(isPick))
  const rest = favFirst(shown.filter((r) => !isPick(r)))
  const live = rest.filter((r) => r.state === 'in')
  const upcoming = rest.filter((r) => r.state === 'pre')
  const final = rest.filter((r) => r.state === 'post').reverse()
  const picks = dayRows.filter(isPick).length
  const liveCount = dayRows.filter((r) => r.state === 'in').length
  const showDay = day !== 'today'
  const filtered = league !== 'ALL' || picksOnly || query.trim() !== ''
  const whyRow = why ? (rows.find((r) => r.id === why.id) ?? why) : null // keep the sheet on live data

  return (
    <>
      <Header>
        <div className='me-auto min-w-0'>
          <h1 className='font-display text-[26px] leading-none font-black'>Games</h1>
          <p className='mt-0.5 truncate text-xs text-muted-foreground'>
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
          aria-label={`How much DeVig explains: ${level ? LEVEL_NAME[level] : 'not set'}. Change it.`}
          title={level ? `Explaining for: ${LEVEL_NAME[level]}` : 'How much to explain'}
          onClick={() => setLevel(level ? NEXT_LEVEL[level] : 'new')}
          className={cn(level && 'text-devig')}
        >
          <BookOpen />
        </Button>
        <ThemeSwitch />
      </Header>

      <Main className='flex flex-col gap-6'>
        {!asked && <LevelPrompt onPick={setLevel} />}

        {error && (
          <Alert variant='destructive'>
            <AlertTitle>Prices didn&apos;t load</AlertTitle>
            <AlertDescription>{String((error as Error).message)}. Check your connection, then press refresh at the top.</AlertDescription>
          </Alert>
        )}
        {picksError && !error && (
          <Alert>
            <AlertTitle>DeVig&apos;s picks didn&apos;t load</AlertTitle>
            <AlertDescription>Prices are up to date; picks will appear on the next refresh.</AlertDescription>
          </Alert>
        )}

        <div className='flex flex-col gap-3 lg:flex-row lg:items-center'>
          <div role='group' aria-label='League' className='no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0'>
            <Chip active={league === 'ALL'} onClick={() => setLeague('ALL')}>All</Chip>
            {leagues.map((l) => (
              <Chip key={l} active={league === l} onClick={() => setLeague(l)}>{l}</Chip>
            ))}
            <span aria-hidden='true' className='mx-1 w-px shrink-0 bg-border' />
            <button
              type='button'
              aria-pressed={picksOnly}
              onClick={() => setPicksOnly((v) => !v)}
              className={cn(
                'h-9 shrink-0 rounded-full border px-4 text-sm font-semibold transition-colors duration-150',
                picksOnly ? 'border-devig bg-devig text-devig-ink' : 'border-devig/40 bg-devig/10 text-devig'
              )}
            >
              DeVig picks
            </button>
          </div>
          <div className='flex gap-2 lg:ms-auto'>
            <div role='radiogroup' aria-label='Day' className='flex h-10 shrink-0 rounded-xl border bg-sidebar p-1'>
              {DAYS.map((d) => (
                <button
                  key={d.id}
                  type='button'
                  role='radio'
                  aria-checked={day === d.id}
                  onClick={() => setDay(d.id)}
                  className={cn(
                    'rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors duration-150',
                    day === d.id && 'bg-card text-foreground shadow-sm'
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <label className='relative min-w-0 flex-1 lg:w-52 lg:flex-none'>
              <span className='sr-only'>Find a team</span>
              <SearchIcon aria-hidden='true' className='pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
              <Input placeholder='Find a team' value={query} onChange={(e) => setQuery(e.target.value)} className='h-10 rounded-xl ps-9' />
            </label>
          </div>
        </div>

        {isLoading ? (
          <div className='grid gap-5 lg:grid-cols-2'>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className='flex flex-col gap-2'>
                <Skeleton className='h-[132px] w-full rounded-[18px]' />
                <Skeleton className='h-4 w-1/2' />
              </div>
            ))}
          </div>
        ) : shown.length === 0 && !error ? (
          <div className='rounded-[18px] border border-dashed px-6 py-12 text-center'>
            <p className='font-semibold'>
              {filtered ? 'No games match these filters' : `No games ${day === 'today' ? 'today' : day === 'tomorrow' ? 'tomorrow' : 'in the next 7 days'}`}
            </p>
            <p className='mt-1 text-sm text-muted-foreground'>
              {filtered ? 'Clear the filters to see every game.' : 'Try another day; schedules fill in as leagues post them.'}
            </p>
            <div className='mt-4 flex justify-center gap-2'>
              {filtered ? (
                <Button variant='outline' onClick={() => { setLeague('ALL'); setPicksOnly(false); setQuery('') }}>Clear filters</Button>
              ) : (
                day !== 'week' && <Button variant='outline' onClick={() => setDay('week')}>Show the next 7 days</Button>
              )}
            </div>
          </div>
        ) : (
          <>
            <Group title="DeVig's picks" rows={picked} showDay={showDay} onWhy={setWhy} />
            <Group title='Live now' rows={live} showDay={false} onWhy={setWhy} dot />
            <Group title='Upcoming' rows={upcoming} showDay={showDay} onWhy={setWhy} />
            <Group title='Final' rows={final} showDay={showDay} onWhy={setWhy} />
          </>
        )}

        <p className='max-w-prose text-xs leading-relaxed text-muted-foreground'>
          Tap a team on an upcoming game to add it to your parlay. Each plate splits the game at Kalshi&apos;s price with the fee gap removed (a proportional split, which matches the
          exchange&apos;s mid price), in the two teams&apos; colors. The amber slash is DeVig&apos;s model. Scores are ESPN&apos;s,
          unofficial. DeVig&apos;s picks are paper picks, locked before the game; nothing is bet.
        </p>
      </Main>

      <ExplainSheet
        row={whyRow}
        open={!!why}
        onOpenChange={(v) => !v && setWhy(null)}
        level={level ?? 'sometimes'}
        onLevel={setLevel}
        record={whyRow ? (records.find((r) => r.sport === whyRow.sport) ?? null) : null}
      />
    </>
  )
}
