import { useEffect, useMemo, useRef, useState } from 'react'
import { TrackButton } from '@/components/track-button'
import { PriceAlert } from './price-alert'
import { Link } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { type GameRow, fmtAmerican, fmtPct, isSoccer, useFinals, useGames } from '@/lib/devig'
import { useInjuries } from '@/lib/injuries'
import { type LivePrice, fetchLiveProps, useProps } from '@/lib/props'
import { RS_SPORTS } from '@/lib/research'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Plate, isPick, pickName } from '../games/plate'
import { PlateTaps } from '../games/plate-taps'
import { type Side, TeamSheet } from '../games/team-sheet'
import { PropRow, type Shown, withLive } from '../props'
import { FieldMovers } from './field'
import { CourtMovers } from './court'
import { RinkMovers } from './rink'
import { GapChart } from './gap'
import { GameWrap } from './wrap'
import { SoccerGame } from './soccer'

// One game: the big plate, the prices, DeVig's read, who's hurt, and this game's props. Tap a team on the plate to
// see why (and add it to the parlay), the same as on Games; tap Over or Under on a prop for its why.

function Box({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className='rounded-2xl bg-card px-3 py-2.5'>
      <div className='text-xs text-muted-foreground'>{label}</div>
      <div className='font-condensed text-[17px] font-bold tabular-nums'>{value}</div>
      {sub && <div className='text-[11px] text-muted-foreground tabular-nums'>{sub}</div>}
    </div>
  )
}

// A finished game's three boxes: Kalshi's split just before the start, who won by how much (or who covered, when
// DeVig saved the closing spread), and the total points. The live files drop a game's prices once it ends.
function finalBoxes(row: GameRow) {
  const a = row.awayScore ?? 0
  const h = row.homeScore ?? 0
  const c = row.closeHome
  const start = c == null ? '—' : `${fmtPct(1 - c)} / ${fmtPct(c)}`
  let mid: { label: string; value: string }
  const sp = row.closeSpread
  if (sp != null) {
    const m = h - a + sp // home's margin against the line
    mid = {
      label: `Spread ${row.home} ${sp > 0 ? '+' : ''}${sp}`,
      value: m === 0 ? 'Push' : `${m > 0 ? row.home : row.away} covered`,
    }
  } else {
    mid = { label: 'Won by', value: a === h ? 'Tie' : `${a > h ? row.away : row.home} by ${Math.abs(a - h)}` }
  }
  return [{ label: 'Kalshi at start', value: start }, mid, { label: 'Total points', value: String(a + h) }]
}

function Read({ row, onWhy }: { row: GameRow; onWhy: (s: Side) => void }) {
  const p = row.pick
  if (!p) return null
  if (!isPick(row) || p.prob == null) {
    return (
      <section className='rounded-2xl bg-card p-4'>
        <p className='font-display text-xl font-extrabold'>No pick</p>
        <p className='mt-1 text-sm text-muted-foreground'>
          DeVig&apos;s model isn&apos;t sure enough here to pick a side.
        </p>
        {p.lean && (
          <button type='button' onClick={() => onWhy(p.lean === row.home ? 'home' : 'away')}
            className='mt-2 inline-flex h-10 items-center gap-1 rounded-full border px-4 text-sm font-semibold hover:bg-muted/50'>
            See how close {p.lean} was <ChevronRight className='size-4' aria-hidden='true' />
          </button>
        )}
      </section>
    )
  }
  const pre = row.state === 'pre'
  return (
    <section className='rounded-2xl bg-accent p-4'>
      <div className='flex flex-col'>
        <span className='flex flex-col'>
          <span className='text-xs font-bold tracking-wide text-devig uppercase'>DeVig&apos;s pick{pre ? '' : ' (made before the game)'}</span>
          <span className='font-display text-2xl font-extrabold text-devig'>{pickName(row)} to win</span>
          <span className='text-sm font-semibold text-accent-foreground'>DeVig gives them {fmtPct(p.prob)}</span>
        </span>
      </div>
      {row.edge != null && pre && (
        <p className='mt-1.5 text-sm leading-relaxed text-accent-foreground'>
          That&apos;s {Math.abs(row.edge * 100).toFixed(1)} points {row.edge >= 0 ? 'above' : 'below'} Kalshi&apos;s fair{' '}
          {fmtPct(row.fairHome == null ? null : p.side === row.home ? row.fairHome : 1 - row.fairHome)}.
          {p.correct === true ? ' Won.' : p.correct === false ? ' Lost.' : ' Locked before the game; graded after.'}
        </p>
      )}
      <button type='button' onClick={() => onWhy(p.side === row.home ? 'home' : 'away')}
        className='mt-2 inline-flex h-10 items-center gap-1 rounded-full bg-devig px-4 text-sm font-bold text-[#0a0b0f] hover:opacity-90'>
        Why {p.side}? <ChevronRight className='size-4' aria-hidden='true' />
      </button>
      {!pre && (
        <p className='mt-1.5 text-sm leading-relaxed text-accent-foreground'>
          {row.state === 'post'
            ? p.correct === true ? 'The pick won.' : p.correct === false ? 'The pick lost.' : 'Final; grading soon.'
            : "The game is on: Kalshi's price is live, DeVig's number is from before the start."}
        </p>
      )}
    </section>
  )
}

export function GamePage({ id }: { id: string }) {
  const { rows, isLoading } = useGames()
  const { finals } = useFinals()
  const injuries = useInjuries()
  const { lines } = useProps()
  const [live, setLive] = useState<Record<string, LivePrice>>({})
  const [sheet, setSheet] = useState<{ open: boolean; side: Side }>({ open: false, side: 'home' })
  const why = (side: Side) => setSheet({ open: true, side })
  const row = rows.find((r) => r.id === id) ?? finals.find((r) => r.id === id)

  const hurt = useMemo(
    () => (row ? (injuries.data ?? []).filter((x) => x.sport === row.sport && x.away === row.away && x.home === row.home) : []),
    [injuries.data, row]
  )
  // this game's props: each player's main line (closest to 50/50), the most traded first
  const props = useMemo(() => {
    if (!row) return []
    const mine = lines.filter((l) => l.sport === row.sport && l.away === row.away && l.home === row.home)
    const priced = mine.map((l) => withLive(l, live)).filter(Boolean) as Shown[]
    const best = new Map<string, Shown>()
    for (const l of priced) {
      const k = `${l.player}|${l.stat}`
      const cur = best.get(k)
      if (!cur || Math.abs(l.mid - 0.5) < Math.abs(cur.mid - 0.5)) best.set(k, l)
    }
    return [...best.values()].sort((a, b) => (b.oi || 0) - (a.oi || 0)).slice(0, 12)
  }, [lines, live, row])
  const asked = useRef(false)
  useEffect(() => {
    if (asked.current || !props.length) return
    asked.current = true
    fetchLiveProps(props.map((l) => l.ticker).filter(Boolean) as string[]).then((m) => Object.keys(m).length && setLive(m))
  }, [props])

  if (!row) {
    return (
      <div className='p-4'>
        {isLoading ? <Skeleton className='h-[248px] w-full' /> : <p className='p-8 text-center text-muted-foreground'>This game isn&apos;t on the board anymore. <Link to='/' className='text-devig'>Back to Games</Link></p>}
      </div>
    )
  }
  if (isSoccer(row.sport)) return <SoccerGame row={row} />
  const done = row.state === 'post' && row.awayScore != null && row.homeScore != null
  const spread = row.spread ? `${row.home} ${row.spread.home_point > 0 ? '+' : ''}${row.spread.home_point}` : '—'
  return (
    <>
      <div className='bg-background px-2 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2'>
        <Link to='/' className='inline-flex h-10 items-center gap-1 rounded-full ps-2 pe-4 text-sm font-semibold text-muted-foreground hover:text-foreground'>
          <ChevronLeft className='size-4' /> Games
        </Link>
        {row.state !== 'post' && <TrackButton kind='g' keys={[row.trackKey]} label={`${row.awayName} at ${row.homeName}`} className='float-end me-2 mt-0.5' />}
      </div>
      <div className='relative'>
        <Plate row={row} showDay size='lg' />
        <PlateTaps row={row} />
      </div>
      <TeamSheet row={row} side={sheet.side} onSide={(side) => setSheet({ open: true, side })} open={sheet.open}
        onOpenChange={(open) => setSheet((v) => ({ ...v, open }))} />
      <main className='flex flex-col gap-5 px-4 py-5 md:px-6'>
        {done ? (
          <>
            <div className='grid grid-cols-3 gap-2'>
              {finalBoxes(row).map((b) => <Box key={b.label} label={b.label} value={b.value} />)}
            </div>
            <p className='-mt-2 px-1 text-xs text-muted-foreground'>Kalshi at start is each team&apos;s chance ({row.away} / {row.home}) on Kalshi&apos;s last price before the start.</p>
          </>
        ) : (
          <>
            <div className='grid grid-cols-3 gap-2'>
              <Box label='Kalshi, no fee' value={row.fairHome == null ? '—' : `${fmtPct(1 - row.fairHome)} / ${fmtPct(row.fairHome)}`}
                sub={`${fmtAmerican(row.ml?.away)} / ${fmtAmerican(row.ml?.home)}`} />
              <Box label='Spread' value={spread} />
              <Box label='Total' value={row.total ? String(row.total.line) : '—'} />
            </div>
            <div className='-mt-1 grid grid-cols-2 gap-2'>
              {(['away', 'home'] as const).map((s) => (
                <button key={s} type='button' onClick={() => why(s)}
                  className='flex min-h-11 items-center justify-between gap-2 rounded-2xl border px-4 py-2 text-start text-sm font-semibold hover:bg-muted/50'>
                  <span className='min-w-0 truncate'>Why {s === 'home' ? row.home : row.away}?{row.state === 'pre' && <span className='block text-xs font-normal text-muted-foreground'>or add to parlay</span>}</span>
                  <ChevronRight className='size-4 shrink-0 text-muted-foreground' aria-hidden='true' />
                </button>
              ))}
            </div>
          </>
        )}
        <PriceAlert row={row} />

        <Read row={row} onWhy={why} />

          <GapChart row={row} />
          <FieldMovers row={row} />
          <CourtMovers row={row} />
          <RinkMovers row={row} />

        <GameWrap row={row} />

        {(RS_SPORTS as readonly string[]).includes(row.sport) && (
          <section aria-label='Team research' className='grid grid-cols-2 gap-2'>
            {([[row.away, row.awayName], [row.home, row.homeName]] as const).map(([code, name]) => (
              <Link key={code} to='/research/team/$sport/$code' params={{ sport: row.sport, code }}
                className='flex min-h-14 items-center justify-between gap-2 rounded-2xl bg-card px-4 py-2.5 hover:bg-muted/50'>
                <span className='min-w-0'>
                  <span className='block truncate font-semibold'>{name}</span>
                  <span className='block text-xs text-muted-foreground'>Stats, games, roster</span>
                </span>
                <ChevronRight className='size-4 shrink-0 text-muted-foreground' aria-hidden='true' />
              </Link>
            ))}
          </section>
        )}

        {hurt.length > 0 && (
          <section aria-label='Injuries'>
            <h2 className='mb-2 px-1 font-display text-[22px] font-extrabold'>Injuries</h2>
            <ul className='flex flex-col gap-1.5'>
              {hurt.map((x) => (
                <li key={x.team + x.player} className='flex items-start justify-between gap-3 rounded-2xl bg-card px-4 py-2.5'>
                  <span className='min-w-0'>
                    <span className='font-semibold'>{x.player}</span> <span className='text-sm text-muted-foreground'>{x.team}</span>
                    {x.impact?.why && <span className='block text-xs text-muted-foreground'>{x.impact.why}</span>}
                  </span>
                  <span className='shrink-0 text-end'>
                    <span className={cn('block text-sm font-bold', /out/i.test(x.status) ? 'text-bad' : 'text-[#F5C77A]')}>{x.status}</span>
                    {x.impact?.label && <span className='text-xs text-muted-foreground'>{x.impact.label} impact</span>}
                  </span>
                </li>
              ))}
            </ul>
            <p className='mt-1.5 px-1 text-xs text-muted-foreground'>{row.sport === 'NFL' ? "DeVig's NFL Model 2.0 counts who's out" : `DeVig's ${row.sport} model doesn't read injuries`}; Kalshi&apos;s price may already include them.</p>
          </section>
        )}

        {props.length > 0 && (
          <section aria-label='Player props'>
            <h2 className='mb-2 px-1 font-display text-[22px] font-extrabold'>Player props</h2>
            <p className='mb-2 px-1 text-xs text-muted-foreground'>On past games Kalshi&apos;s price was more right than DeVig&apos;s props model.</p>
            <ul className='overflow-hidden rounded-[18px] bg-card'>
              {props.map((l) => <PropRow key={l.key} l={l} game={row} />)}
            </ul>
          </section>
        )}
      </main>
    </>
  )
}
