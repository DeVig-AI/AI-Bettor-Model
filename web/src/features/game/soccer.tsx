import { Link } from '@tanstack/react-router'
import { ArrowLeftRight, Check, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { TrackButton } from '@/components/track-button'
import { TeamLogo } from '@/components/team-logo'
import { type GameRow, SOCCER, fmtAmerican, fmtPct } from '@/lib/devig'
import { type Lineup, type MatchEvent, type MatchStats, type Tables, resultOf, tableRow, useMatch, useSoccerMore, useSoccerTables } from '@/lib/soccer'
import { useSlip } from '@/lib/parlay'
import { cn } from '@/lib/utils'
import { soccerLeg } from '../parlay/legs'
import { Plate } from '../games/plate'
import { FormDots } from '../research/soccer'
import { Box, Rung, SoccerMarkets } from './soccer-markets'
import { PriceAlert } from './price-alert'
import { SoccerChart } from './soccer-chart'
import { DevigSoccer } from './soccer-devig'
import { SoccerStreaks } from '../props/streaks'
import { GameInjuries } from './injuries'

// A soccer match: the big plate, Kalshi's three outcomes, the goals markets (total goals, both teams to score, winning
// margin), players on a 10-match streak at one of Kalshi's lines (../props/streaks.tsx), the rest of Kalshi's markets (players, correct score, halves, team goals, corners: soccer-markets.tsx), what has happened (goals, cards, substitutions, match stats, line-ups) and each team's form in its league.
// Kalshi's soccer markets settle on 90 minutes plus stoppage time. In the five big leagues, DeVig Soccer v1's chances
// sit under Kalshi's (soccer-devig.tsx; new, not proven). No picks.

type Side = 'home' | 'away'
const hex = (c?: string | null) => (c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : null)
const rgb = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
const close = (a?: string | null, b?: string | null) => {
  if (!hex(a) || !hex(b)) return false
  const x = rgb(a!), y = rgb(b!)
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) < 120
}
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
const dayFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })

const OUTCOMES = ['home', 'draw', 'away'] as const
type Outcome = (typeof OUTCOMES)[number]

function Outcomes({ row }: { row: GameRow }) {
  const { toggle, has } = useSlip()
  const h = row.homeScore ?? 0
  const a = row.awayScore ?? 0
  if (row.state === 'post' && row.homeScore != null && row.awayScore != null) {
    return (
      <div className='grid grid-cols-3 gap-2'>
        <Box label='Result' value={h === a ? 'Draw' : `${h > a ? row.home : row.away} won`} />
        <Box label='Goals' value={String(h + a)} sub={h + a > 2 ? 'Over 2.5' : 'Under 2.5'} />
        <Box label='Both scored' value={h > 0 && a > 0 ? 'Yes' : 'No'} />
      </div>
    )
  }
  const t = row.three
  const ml = row.ml3
  const top = t ? (['home', 'draw', 'away'] as const).reduce((x, k) => (t[k] > t[x] ? k : x), 'home' as 'home' | 'draw' | 'away') : null
  const canAdd = row.state === 'pre' && Date.parse(row.kickoff) > Date.now()
  const label = (o: Outcome) => (o === 'draw' ? 'Draw' : `${o === 'home' ? row.home : row.away} win`)
  return (
    <>
      <div className='grid grid-cols-3 gap-2'>
        {OUTCOMES.map((o) => {
          const leg = canAdd ? soccerLeg(row, o) : null
          if (!leg) return <Box key={o} label={label(o)} value={fmtPct(t?.[o])} sub={fmtAmerican(ml?.[o])} strong={top === o} />
          const on = has(leg.id)
          return (
            <button key={o} type='button' aria-pressed={on} onClick={() => toggle(leg)}
              aria-label={`${o === 'draw' ? 'Draw' : `${o === 'home' ? row.homeName : row.awayName} to win`}, ${fmtPct(t?.[o])}, ${fmtAmerican(ml?.[o])}. ${on ? 'In your parlay; tap to remove' : 'Add to parlay'}`}
              className={cn('flex min-w-0 flex-col rounded-2xl px-3 py-2.5 text-start ring-inset transition-[background-color,box-shadow] duration-150',
                top === o ? 'bg-accent' : 'bg-card', on && 'ring-2 ring-devig')}>
              <span className='truncate text-xs text-muted-foreground'>{label(o)}</span>
              <span className='font-condensed text-[17px] font-bold tabular-nums'>{fmtPct(t?.[o])}</span>
              <span className='flex items-center justify-between gap-1 text-[11px] text-muted-foreground tabular-nums'>
                {fmtAmerican(ml?.[o])}
                <span aria-hidden='true' className={cn('inline-flex items-center gap-0.5 font-semibold', on ? 'text-devig' : '')}>
                  {on ? <Check className='size-3' /> : <Plus className='size-3' />}{on ? 'Parlay' : 'Add'}
                </span>
              </span>
            </button>
          )
        })}
      </div>
      <p className='-mt-2 px-1 text-xs leading-relaxed text-muted-foreground'>
        Kalshi with the fee taken out: each outcome&apos;s mid price, scaled to add up to 100%. Under it, the price to buy it. 90 minutes plus stoppage time; extra time doesn&apos;t count.{canAdd ? ' Tap one to add it to your parlay.' : ''}
      </p>
    </>
  )
}

function Goals({ row }: { row: GameRow }) {
  const m = useSoccerMore(row)
  if (!m || row.state === 'post' || (!m.totals.length && !m.btts && !m.spreads.length)) return null
  const totals = [...m.totals].sort((a, b) => a[0] - b[0])
  const main = totals.reduce<number | null>((best, t) => (best == null || Math.abs(t[1] - 0.5) < Math.abs(totals[best][1] - 0.5) ? totals.indexOf(t) : best), null)
  const mt = main == null ? null : totals[main]
  const margins = (s: Side) => m.spreads.filter((x) => x[0] === s).sort((a, b) => a[1] - b[1])
  return (
    <section aria-labelledby='goals-h' className='flex flex-col gap-2'>
      <h2 id='goals-h' className='px-1 font-display text-[22px] font-extrabold'>Goals markets</h2>
      {mt && (
        <div className='rounded-2xl bg-card px-4 py-3'>
          <p className='text-xs text-muted-foreground'>Kalshi&apos;s main line</p>
          <p className='font-display text-2xl font-extrabold tabular-nums'>
            Over {mt[0]} goals <span className='text-devig'>{fmtPct(mt[1])}</span>
          </p>
          <p className='text-sm text-muted-foreground tabular-nums'>Under {mt[0]}: {fmtPct(1 - mt[1])}</p>
        </div>
      )}
      {totals.length > 1 && (
        <ul aria-label='Chance of more than each number of goals' className='overflow-hidden rounded-2xl bg-card'>
          {totals.map((t, i) => <Rung key={t[3]} label={`Over ${t[0]}`} p={t[1]} strong={i === main} />)}
        </ul>
      )}
      {(m.btts || m.spreads.length > 0) && (
        <ul className='overflow-hidden rounded-2xl bg-card'>
          {m.btts && <Rung label='Both score' p={m.btts[0]} strong />}
          {(['home', 'away'] as const).flatMap((s) =>
            margins(s).map((x) => <Rung key={x[4]} label={`${s === 'home' ? row.home : row.away} by ${Math.ceil(x[1])}+`} p={x[2]} />)
          )}
        </ul>
      )}
      <p className='px-1 text-xs leading-relaxed text-muted-foreground'>
        Each is Kalshi&apos;s mid price for yes. &ldquo;By 2+&rdquo; means that team wins by two goals or more.
      </p>
    </section>
  )
}

function EventMark({ kind }: { kind: MatchEvent['kind'] }) {
  if (kind === 'yellow' || kind === 'red') {
    return <span aria-hidden='true' className={cn('inline-block h-3.5 w-2.5 rounded-[2px]', kind === 'red' ? 'bg-bad' : 'bg-[#F5C77A]')} />
  }
  if (kind === 'sub') return <ArrowLeftRight aria-hidden='true' className='size-3.5 text-muted-foreground' />
  return <span aria-hidden='true' className='inline-block size-3 rounded-full bg-devig ring-2 ring-devig/30' />
}

const KIND_WORD: Record<MatchEvent['kind'], string> = { goal: 'Goal', own: 'Own goal', pen: 'Penalty goal', yellow: 'Yellow card', red: 'Red card', sub: 'Substitution' }

function eventText(e: MatchEvent) {
  if (e.kind === 'sub') return { main: e.who, sub: e.other ? `for ${e.other}` : '' }
  if (e.kind === 'goal') return { main: e.who, sub: e.other ? `assist ${e.other}` : '' }
  if (e.kind === 'own') return { main: e.who, sub: 'own goal' }
  if (e.kind === 'pen') return { main: e.who, sub: 'penalty' }
  return { main: e.who, sub: '' }
}

function Timeline({ row, events }: { row: GameRow; events: MatchEvent[] }) {
  if (!events.length) return null
  return (
    <ol aria-label='Match events' className='overflow-hidden rounded-2xl bg-card py-1'>
      {events.map((e, i) => {
        const t = eventText(e)
        const goal = e.kind === 'goal' || e.kind === 'own' || e.kind === 'pen'
        const body = (
          <span className={cn('flex min-w-0 flex-col', e.side === 'home' ? 'items-end text-end' : 'items-start text-start')}>
            <span className={cn('max-w-full truncate text-sm', goal ? 'font-bold' : e.kind === 'sub' ? 'text-muted-foreground' : 'font-medium')}>{t.main}</span>
            {t.sub && <span className='max-w-full truncate text-xs text-muted-foreground'>{t.sub}</span>}
          </span>
        )
        return (
          <li key={i} className={cn('grid grid-cols-[1fr_auto_1fr] items-center gap-2.5 px-3 py-1.5', goal && 'bg-devig/[0.07]')}>
            <span className='sr-only'>{`${e.min} ${KIND_WORD[e.kind]}, ${e.side === 'home' ? row.homeName : row.awayName}: `}</span>
            <span className='flex min-w-0 items-center justify-end gap-2'>{e.side === 'home' && <>{body}<EventMark kind={e.kind} /></>}</span>
            <span aria-hidden='true' className='w-11 text-center font-condensed text-[13px] font-bold text-muted-foreground tabular-nums'>{e.min}</span>
            <span className='flex min-w-0 items-center gap-2'>{e.side === 'away' && <><EventMark kind={e.kind} />{body}</>}</span>
          </li>
        )
      })}
    </ol>
  )
}

const STAT_ROWS: [keyof MatchStats, string][] = [
  ['possession', 'Possession'], ['shots', 'Shots'], ['on_target', 'On target'], ['corners', 'Corners'],
  ['passes_ok', 'Passes completed'], ['fouls', 'Fouls'], ['yellow', 'Yellow cards'], ['red', 'Red cards'], ['offsides', 'Offsides'], ['saves', 'Saves'],
]

function Stats({ row, stats }: { row: GameRow; stats: Partial<Record<Side, MatchStats>> }) {
  const h = stats.home, a = stats.away
  if (!h || !a) return null
  const rows = STAT_ROWS.filter(([k]) => h[k] != null && a[k] != null && !(k === 'red' && !h[k] && !a[k]))
  if (!rows.length) return null
  const hc = hex(row.colors?.home) ?? 'var(--side-home)'
  // two kits of the same colour (Liverpool and Arsenal are both red) read as one bar: the away side goes grey
  const ac = hex(row.colors?.away) && !close(row.colors!.home, row.colors!.away) ? row.colors!.away : 'var(--muted-foreground)'
  return (
    <div className='rounded-2xl bg-card px-4 py-3'>
      <div aria-hidden='true' className='flex justify-between pb-1 text-xs font-bold text-muted-foreground'>
        <span>{row.home}</span><span>{row.away}</span>
      </div>
      <dl className='flex flex-col gap-2.5'>
        {rows.map(([k, label]) => {
          const x = h[k]!, y = a[k]!
          const pct = k === 'possession'
          const share = x + y > 0 ? x / (x + y) : 0.5
          return (
            <div key={k} className='flex flex-col gap-1'>
              <div className='flex items-baseline justify-between text-sm tabular-nums'>
                <span className={cn('font-condensed text-[15px]', x > y ? 'font-bold' : 'text-muted-foreground')}>{pct ? `${Math.round(x)}%` : x}</span>
                <dt className='text-xs text-muted-foreground'>{label}</dt>
                <span className={cn('font-condensed text-[15px]', y > x ? 'font-bold' : 'text-muted-foreground')}>{pct ? `${Math.round(y)}%` : y}</span>
              </div>
              <dd className='sr-only'>{`${row.home} ${pct ? `${Math.round(x)}%` : x}, ${row.away} ${pct ? `${Math.round(y)}%` : y}`}</dd>
              <div aria-hidden='true' className='flex h-1.5 gap-1'>
                <span className='rounded-full' style={{ flexGrow: Math.max(share, 0.02), background: hc }} />
                <span className='rounded-full' style={{ flexGrow: Math.max(1 - share, 0.02), background: ac }} />
              </div>
            </div>
          )
        })}
      </dl>
    </div>
  )
}

function Lineups({ row, lineups }: { row: GameRow; lineups: Partial<Record<Side, Lineup>> }) {
  const sides = (['home', 'away'] as const).filter((s) => lineups[s]?.xi.length)
  if (!sides.length) return null
  return (
    <div className='grid grid-cols-2 gap-2'>
      {sides.map((s) => {
        const l = lineups[s]!
        const on = l.subs.filter((p) => p[3])
        return (
          <section key={s} aria-label={`${s === 'home' ? row.homeName : row.awayName} line-up`} className='min-w-0 rounded-2xl bg-card px-3 py-3'>
            <p className='flex items-baseline justify-between gap-2'>
              <span className='font-bold'>{s === 'home' ? row.home : row.away}</span>
              {l.formation && <span className='font-condensed text-sm font-semibold text-muted-foreground tabular-nums'>{l.formation}</span>}
            </p>
            <ol className='mt-1.5 flex flex-col gap-1'>
              {l.xi.map(([n, name, pos]) => (
                <li key={n + name} className='flex items-baseline gap-2 text-sm'>
                  <span className='w-5 shrink-0 text-end font-condensed text-xs text-muted-foreground tabular-nums'>{n}</span>
                  <span className='min-w-0 flex-1 truncate'>{name}</span>
                  <span className='shrink-0 text-[11px] text-muted-foreground'>{pos}</span>
                </li>
              ))}
            </ol>
            {on.length > 0 && (
              <>
                <p className='mt-2 text-xs font-semibold text-muted-foreground'>Came on</p>
                <ul className='mt-1 flex flex-col gap-1'>
                  {on.map(([n, name]) => (
                    <li key={n + name} className='flex items-baseline gap-2 text-sm text-muted-foreground'>
                      <span className='w-5 shrink-0 text-end font-condensed text-xs tabular-nums'>{n}</span>
                      <span className='min-w-0 truncate'>{name}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )
      })}
    </div>
  )
}

function Match({ row }: { row: GameRow }) {
  const q = useMatch(row)
  const m = q.data
  if (!m) return null
  const hasEvents = m.events.length > 0
  const hasStats = !!(m.stats.home && m.stats.away) && row.state !== 'pre'
  const hasLineups = !!(m.lineups.home?.xi.length || m.lineups.away?.xi.length)
  if (!hasEvents && !hasStats && !hasLineups) return null
  return (
    <section aria-labelledby='match-h' className='flex flex-col gap-2'>
      <h2 id='match-h' className='px-1 font-display text-[22px] font-extrabold'>{row.state === 'pre' ? 'Line-ups' : 'Match'}</h2>
      {hasEvents && <Timeline row={row} events={m.events} />}
      {hasStats && <Stats row={row} stats={m.stats} />}
      {hasLineups && <Lineups row={row} lineups={m.lineups} />}
      <p className='px-1 text-xs text-muted-foreground'>From ESPN{row.state === 'in' ? ', every 15 seconds while the match is on' : ''}.</p>
    </section>
  )
}

function FormCard({ row, side, tables }: { row: GameRow; side: Side; tables: Tables | undefined }) {
  const id = row.ids?.[side]
  const name = side === 'home' ? row.homeName : row.awayName
  const code = side === 'home' ? row.home : row.away
  const t = tableRow(tables, row.sport, id)
  const games = (id && tables?.teams[`${row.sport}|${id}`]?.games) || []
  const last = games.slice(-5).reverse()
  const inner = (
    <>
      <span className='flex items-center gap-2.5'>
        <TeamLogo sport={row.sport} code={code} id={id} color={row.colors?.[side]} px={64} className='size-8 text-[10px]' />
        <span className='min-w-0 flex-1'>
          <span className='block truncate font-semibold'>{name}</span>
          <span className='block truncate text-xs text-muted-foreground tabular-nums'>
            {t ? `${ordinal(t.row.rank)}${t.groups > 1 ? ` in the ${t.group}` : ''} · ${t.row.pts ?? 0} pts · ${t.row.w ?? 0}–${t.row.d ?? 0}–${t.row.l ?? 0}` : `${side === 'home' ? 'Home' : 'Away'} · results and fixtures`}
          </span>
        </span>
        {id && <ChevronRight aria-hidden='true' className='size-4 shrink-0 text-muted-foreground' />}
      </span>
      {t?.row.form && <span className='ps-[42px]'><FormDots form={t.row.form} /></span>}
      {last.length > 0 && (
        <ol aria-label='Last results' className='mt-1.5 flex flex-col'>
          {last.map((g, i) => {
            const r = resultOf(g)
            return (
              <li key={i} className='flex items-center gap-2 border-t py-1.5 text-sm'>
                <span className='w-12 shrink-0 text-xs text-muted-foreground tabular-nums'>{dayFmt.format(new Date(`${g[0]}T12:00:00`))}</span>
                <span className='min-w-0 flex-1 truncate'>{g[2] === 'H' ? 'vs' : 'at'} <b className='font-semibold'>{g[1]}</b></span>
                <span className='font-condensed font-bold tabular-nums'>{g[3]}–{g[4]}</span>
                <span className={cn('w-4 text-center font-condensed font-bold', r === 'W' ? 'text-good' : r === 'L' ? 'text-bad' : 'text-muted-foreground')}>{r}</span>
              </li>
            )
          })}
        </ol>
      )}
    </>
  )
  const cls = 'flex min-w-0 flex-col rounded-2xl bg-card px-4 py-3'
  return id ? (
    <Link to='/research/team/$sport/$code' params={{ sport: row.sport, code: id }} className={cn(cls, 'hover:bg-muted/50')}>{inner}</Link>
  ) : <div className={cls}>{inner}</div>
}

function Form({ row }: { row: GameRow }) {
  const { data } = useSoccerTables()
  return (
    <section aria-labelledby='form-h' className='flex flex-col gap-2'>
      <h2 id='form-h' className='px-1 font-display text-[22px] font-extrabold'>Form in the {SOCCER[row.sport] ?? row.sport}</h2>
      <div className='grid gap-2 md:grid-cols-2'>
        <FormCard row={row} side='home' tables={data} />
        <FormCard row={row} side='away' tables={data} />
      </div>
    </section>
  )
}

export function SoccerGame({ row }: { row: GameRow }) {
  return (
    <>
      <div className='bg-background px-2 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2'>
        <Link to='/' className='inline-flex h-10 items-center gap-1 rounded-full ps-2 pe-4 text-sm font-semibold text-muted-foreground hover:text-foreground'>
          <ChevronLeft className='size-4' /> Games
        </Link>
        {row.state !== 'post' && <TrackButton kind='g' keys={[row.trackKey]} label={`${row.homeName} vs ${row.awayName}`} className='float-end me-2 mt-0.5' />}
      </div>
      <Plate row={row} showDay size='lg' />
      <main className='flex flex-col gap-5 px-4 py-5 md:px-6'>
        <Outcomes row={row} />
        <PriceAlert row={row} />
        <DevigSoccer row={row} />
        {row.state === 'pre'
          ? <><Goals row={row} /><GameInjuries row={row} /><SoccerStreaks row={row} /><SoccerMarkets row={row} m={row.soccer?.more} /><Match row={row} /></>
          : <><SoccerChart row={row} /><Match row={row} /><Goals row={row} />{row.state === 'in' && <SoccerStreaks row={row} />}<SoccerMarkets row={row} m={row.soccer?.more} /></>}
        <Form row={row} />
      </main>
    </>
  )
}
