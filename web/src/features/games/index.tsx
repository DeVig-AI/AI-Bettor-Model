import { useMemo, useState } from 'react'
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { RefreshCw } from 'lucide-react'
import {
  type GameRow,
  fmtAmerican,
  fmtPct,
  useGames,
} from '@/lib/devig'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DataTableColumnHeader } from '@/components/data-table'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'

type Day = 'today' | 'tomorrow' | 'week' | 'all'
const DAY_LABEL: Record<Day, string> = {
  today: 'Today',
  tomorrow: 'Tomorrow',
  week: 'Next 7 days',
  all: 'All games',
}

function dayStart(offset: number) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + offset)
  return d.getTime()
}

function inDay(row: GameRow, day: Day) {
  if (day === 'all') return true
  // a game still on counts as today whatever day it started
  if (day === 'today' && row.state === 'in') return true
  const t = Date.parse(row.kickoff)
  if (day === 'today') return t >= dayStart(0) && t < dayStart(1)
  if (day === 'tomorrow') return t >= dayStart(1) && t < dayStart(2)
  return t >= dayStart(0) && t < dayStart(7)
}

const timeFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  hour: 'numeric',
  minute: '2-digit',
})

function ago(d: Date | null) {
  if (!d) return 'never'
  const m = Math.round((Date.now() - d.getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  return `${h} h ago`
}

function Status({ row }: { row: GameRow }) {
  if (row.state === 'in')
    return (
      <span className='flex items-center gap-1.5 font-medium text-good'>
        <span className='size-2 animate-pulse rounded-full bg-good' />
        {row.detail || 'Live'}
      </span>
    )
  if (row.state === 'post')
    return <span className='text-muted-foreground'>{row.detail || 'Final'}</span>
  return (
    <span className='text-muted-foreground tabular-nums'>
      {timeFmt.format(new Date(row.kickoff))}
    </span>
  )
}

function TeamLine({
  code,
  name,
  score,
  won,
}: {
  code: string
  name: string
  score: number | null
  won: boolean
}) {
  return (
    <div className='flex items-center justify-between gap-3'>
      <span className={cn('truncate', won && 'font-semibold')}>
        <span className='font-medium'>{code}</span>
        {name !== code && (
          <span className='ms-2 hidden text-muted-foreground lg:inline'>
            {name}
          </span>
        )}
      </span>
      {score != null && (
        <span className={cn('tabular-nums', won && 'font-semibold')}>
          {score}
        </span>
      )}
    </div>
  )
}

function PickCell({ row }: { row: GameRow }) {
  const p = row.pick
  if (!p) return <span className='text-muted-foreground'>—</span>
  if (!p.side || p.action === 'PASS')
    return <span className='text-muted-foreground'>Pass</span>
  return (
    <div className='flex flex-col gap-1'>
      <div className='flex items-center gap-2'>
        <span className='font-semibold'>{p.side}</span>
        <span className='text-muted-foreground tabular-nums'>
          {fmtPct(p.prob)}
        </span>
        {p.correct === true && (
          <Badge className='bg-good/15 text-good'>Won</Badge>
        )}
        {p.correct === false && (
          <Badge className='bg-bad/15 text-bad'>Lost</Badge>
        )}
      </div>
      {p.tier && (
        <span className='text-xs text-muted-foreground'>
          {p.tier === 'top25' ? 'Top 25% confidence' : p.tier === 'top50' ? 'Top 50% confidence' : p.tier}
        </span>
      )}
    </div>
  )
}

const columns: ColumnDef<GameRow>[] = [
  {
    id: 'time',
    accessorFn: (r) => Date.parse(r.kickoff),
    header: ({ column }) => <DataTableColumnHeader column={column} title='Time' />,
    cell: ({ row }) => <Status row={row.original} />,
    meta: { className: 'w-32 whitespace-nowrap' },
  },
  {
    id: 'game',
    accessorFn: (r) => `${r.away} ${r.home} ${r.awayName} ${r.homeName}`,
    header: 'Game',
    enableSorting: false,
    cell: ({ row: { original: r } }) => {
      const done = r.state === 'post' && r.awayScore != null && r.homeScore != null
      return (
        <div className='flex min-w-36 items-start gap-3'>
          <Badge variant='outline' className='mt-0.5 w-12'>
            {r.sport}
          </Badge>
          <div className='flex-1 space-y-0.5'>
            <TeamLine code={r.away} name={r.awayName} score={r.awayScore} won={done && r.awayScore! > r.homeScore!} />
            <TeamLine code={r.home} name={r.homeName} score={r.homeScore} won={done && r.homeScore! > r.awayScore!} />
          </div>
        </div>
      )
    },
  },
  {
    id: 'kalshi',
    header: 'Kalshi',
    enableSorting: false,
    cell: ({ row: { original: r } }) => (
      <div className='space-y-0.5 text-end tabular-nums'>
        <div>{fmtAmerican(r.ml?.away)}</div>
        <div>{fmtAmerican(r.ml?.home)}</div>
      </div>
    ),
    meta: { className: 'text-end' },
  },
  {
    id: 'fair',
    accessorFn: (r) => r.fairHome,
    header: ({ column }) => <DataTableColumnHeader column={column} title='Fair chance' />,
    sortUndefined: 'last',
    cell: ({ row: { original: r } }) => (
      <div className='space-y-0.5 text-end tabular-nums'>
        <div>{fmtPct(r.fairHome == null ? null : 1 - r.fairHome)}</div>
        <div>{fmtPct(r.fairHome)}</div>
      </div>
    ),
    meta: { className: 'text-end' },
  },
  {
    id: 'spread',
    header: 'Spread · Total',
    enableSorting: false,
    cell: ({ row: { original: r } }) => (
      <div className='space-y-0.5 text-end text-muted-foreground tabular-nums'>
        <div>
          {r.spread ? `${r.home} ${r.spread.home_point > 0 ? '+' : ''}${r.spread.home_point}` : '—'}
        </div>
        <div>{r.total ? `O/U ${r.total.line}` : '—'}</div>
      </div>
    ),
    meta: { className: 'hidden md:table-cell text-end' },
  },
  {
    id: 'pick',
    accessorFn: (r) => (r.pick?.side ? r.pick.prob : null),
    header: ({ column }) => <DataTableColumnHeader column={column} title='DeVig pick' />,
    sortUndefined: 'last',
    cell: ({ row }) => <PickCell row={row.original} />,
  },
  {
    id: 'edge',
    accessorFn: (r) => r.edge,
    header: ({ column }) => <DataTableColumnHeader column={column} title='vs. Kalshi' />,
    sortUndefined: 'last',
    cell: ({ row: { original: r } }) =>
      r.edge == null ? (
        <span className='text-muted-foreground'>—</span>
      ) : (
        <span
          className={cn(
            'font-medium tabular-nums',
            r.edge > 0 ? 'text-good' : 'text-bad'
          )}
        >
          {r.edge > 0 ? '+' : ''}
          {(r.edge * 100).toFixed(1)} pts
        </span>
      ),
    meta: { className: 'text-end' },
  },
]

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card className='gap-1 py-4'>
      <CardHeader className='px-4'>
        <CardDescription>{label}</CardDescription>
        <CardTitle className='text-2xl tabular-nums'>{value}</CardTitle>
      </CardHeader>
      {hint && (
        <CardContent className='px-4 text-xs text-muted-foreground'>
          {hint}
        </CardContent>
      )}
    </Card>
  )
}

export function Games() {
  const { rows, updatedAt, isLoading, error, picksError, refetch, isFetching } =
    useGames()
  const [day, setDay] = useState<Day>('today')
  const [league, setLeague] = useState('ALL')
  const [query, setQuery] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])

  const leagues = useMemo(
    () => ['ALL', ...Array.from(new Set(rows.map((r) => r.sport))).sort()],
    [rows]
  )
  const dayRows = useMemo(() => rows.filter((r) => inDay(r, day)), [rows, day])
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return dayRows.filter(
      (r) =>
        (league === 'ALL' || r.sport === league) &&
        (!q ||
          `${r.away} ${r.home} ${r.awayName} ${r.homeName}`
            .toLowerCase()
            .includes(q))
    )
  }, [dayRows, league, query])

  const table = useReactTable({
    data: shown,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const liveNow = dayRows.filter((r) => r.state === 'in').length
  const picks = dayRows.filter((r) => r.pick?.side && r.pick.action !== 'PASS')
  const graded = picks.filter((r) => r.pick?.correct != null)
  const won = graded.filter((r) => r.pick?.correct).length

  return (
    <>
      <Header fixed>
        <Search className='me-auto' placeholder='Go to…' />
        <ThemeSwitch />
        <ConfigDrawer />
      </Header>

      <Main className='flex flex-col gap-4 sm:gap-6'>
        <div className='flex flex-wrap items-end justify-between gap-2'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>Games</h1>
            <p className='text-muted-foreground'>
              Kalshi prices, the fair chance with the fee gap removed, and
              DeVig&apos;s locked pick.
            </p>
          </div>
          <Button
            variant='outline'
            size='sm'
            onClick={refetch}
            disabled={isFetching}
          >
            <RefreshCw className={cn(isFetching && 'animate-spin')} />
            Updated {ago(updatedAt)}
          </Button>
        </div>

        {error && (
          <Alert variant='destructive'>
            <AlertTitle>Couldn&apos;t load games</AlertTitle>
            <AlertDescription>
              {String((error as Error).message)}. Check your connection and
              press refresh.
            </AlertDescription>
          </Alert>
        )}
        {picksError && !error && (
          <Alert>
            <AlertTitle>Picks didn&apos;t load</AlertTitle>
            <AlertDescription>
              Prices are shown, but DeVig&apos;s picks are missing for now.
            </AlertDescription>
          </Alert>
        )}

        <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
          <Stat label={`Games · ${DAY_LABEL[day].toLowerCase()}`} value={isLoading ? '…' : dayRows.length} />
          <Stat label='Live now' value={isLoading ? '…' : liveNow} />
          <Stat label='DeVig picks' value={isLoading ? '…' : picks.length} hint='NFL, NBA and MLB models' />
          <Stat
            label='Graded'
            value={graded.length ? `${won}–${graded.length - won}` : '—'}
            hint={graded.length ? 'win–loss in this view' : 'no finished picks yet'}
          />
        </div>

        <div className='flex flex-col gap-3 sm:flex-row sm:items-center'>
          <Tabs value={league} onValueChange={setLeague} className='max-w-full overflow-x-auto'>
            <TabsList>
              {leagues.map((l) => (
                <TabsTrigger key={l} value={l}>
                  {l === 'ALL' ? 'All' : l}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className='flex gap-2 sm:ms-auto'>
            <Input
              placeholder='Find a team'
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className='h-9 sm:w-48'
            />
            <Select value={day} onValueChange={(v) => setDay(v as Day)}>
              <SelectTrigger className='w-36'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(DAY_LABEL) as Day[]).map((d) => (
                  <SelectItem key={d} value={d}>
                    {DAY_LABEL[d]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className='overflow-hidden rounded-lg border'>
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {hg.headers.map((h) => (
                    <TableHead
                      key={h.id}
                      className={h.column.columnDef.meta?.className}
                    >
                      {h.isPlaceholder
                        ? null
                        : flexRender(h.column.columnDef.header, h.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={columns.length}>
                      <Skeleton className='h-9 w-full' />
                    </TableCell>
                  </TableRow>
                ))
              ) : table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className={cn(row.original.state === 'in' && 'bg-good/5')}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cell.column.columnDef.meta?.className}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className='h-24 text-center text-muted-foreground'
                  >
                    No games {day === 'all' ? '' : DAY_LABEL[day].toLowerCase()}
                    {league !== 'ALL' ? ` in ${league}` : ''}.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <p className='text-xs text-muted-foreground'>
          Fair chance splits Kalshi&apos;s two prices in proportion, which
          matches the exchange&apos;s mid price. &ldquo;vs. Kalshi&rdquo; is
          DeVig&apos;s chance for its side minus that fair chance. Scores are
          ESPN&apos;s, unofficial. Picks are paper picks, locked before the game.
          Nothing is bet.
        </p>
      </Main>
    </>
  )
}
