import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { Check, Clock, Circle, X } from 'lucide-react'
import { type GameRow, fmtAmerican, useFinals, useGames } from '@/lib/devig'
import { decimal } from '@/lib/parlay'
import { readLink } from '@/lib/kalshi-link'
import { type TrackedLeg, type TrackedParlay, removeParlay } from '@/lib/track'
import { cn } from '@/lib/utils'
import { record } from '@/lib/friends'

// What a card can show at its foot: your own parlays have Remove; a friend's have none, or a Tail button
export type Foot = { own: boolean; action?: (p: Graded) => ReactNode }

// Your saved parlays (or a friend's, read-only), graded leg by leg from what the app already has: a team to win from the score, a prop from
// Kalshi's own result for its market (a prop's under is the No side). Pushes drop out of the payout, like at a book.

type St = 'won' | 'lost' | 'push' | 'live' | 'pending'
type LegState = { st: St; note: string; chip: string }
export type Graded = TrackedParlay & { states: LegState[]; status: 'hit' | 'missed' | 'live' | 'upcoming'; payout: number }

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
const whenFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
const money = (v: number) => `$${Math.abs(v) >= 1000 ? Math.round(Math.abs(v)).toLocaleString() : Math.abs(v).toFixed(2)}`
const signed = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '') + money(v)

function findGame(l: TrackedLeg, games: GameRow[]) {
  if (!l.away || !l.home) return null
  const t = l.kickoff ? Date.parse(l.kickoff) : NaN
  return (
    games.find((g) => g.sport === l.sport && g.away === l.away && g.home === l.home &&
      (!isFinite(t) || Math.abs(Date.parse(g.kickoff) - t) < 18 * 3600e3)) ?? null
  )
}

function gradeLeg(l: TrackedLeg, g: GameRow | null, kalshi: 'won' | 'lost' | null | undefined): LegState {
  const label = l.desc || 'Leg'
  const when = l.kickoff ? whenFmt.format(new Date(l.kickoff)) : l.when || ''
  if (kalshi) {
    return { st: kalshi, note: kalshi === 'won' ? "Hit, per Kalshi's result" : "Missed, per Kalshi's result", chip: label }
  }
  const started = g && g.state !== 'pre' && g.awayScore != null && g.homeScore != null
  if (!g || !started) {
    const begun = l.kickoff ? Date.parse(l.kickoff) <= Date.now() : false
    return { st: 'pending', note: begun ? 'Waiting on the result' : when, chip: label }
  }
  const a = g.awayScore!, h = g.homeScore!
  const score = `${g.away} ${a}, ${g.home} ${h}`
  if (l.mk !== 'ml') {
    // a prop: graded once Kalshi settles its market
    return g.state === 'post'
      ? { st: 'pending', note: `Final · ${score} · waiting on Kalshi's grade`, chip: label }
      : { st: 'live', note: `${score} · ${g.detail || 'live'}`, chip: label }
  }
  const team = l.side === 'home' ? g.home : g.away
  const x = l.side === 'home' ? h - a : a - h
  if (g.state !== 'post') return { st: 'live', note: `${score} · ${g.detail || 'live'}`, chip: label }
  const mine = l.side === 'home' ? h : a, theirs = l.side === 'home' ? a : h
  return {
    st: x > 0 ? 'won' : x < 0 ? 'lost' : 'push',
    note: `Final · ${score}`,
    chip: x > 0 ? `${team} ${mine}–${theirs}` : x < 0 ? `${team} lost ${mine}–${theirs}` : `${team} tied ${mine}–${theirs}`,
  }
}

export function useGradedParlays(list: TrackedParlay[]) {
  const { rows } = useGames()
  const { finals } = useFinals()
  const games = useMemo(() => [...rows, ...finals], [rows, finals])
  // Kalshi's result for each leg that has a market and whose game has started
  const tickers = useMemo(() => {
    const s = new Set<string>()
    for (const p of list) for (const l of p.legs) {
      if (l.ticker && l.kickoff && Date.parse(l.kickoff) <= Date.now()) s.add(l.ticker)
    }
    return [...s]
  }, [list])
  const reads = useQueries({
    queries: tickers.map((t) => ({
      queryKey: ['kalshi-result', t],
      queryFn: async () => {
        const d = await readLink(t)
        return d.kind === 'market' ? d.market.result : null
      },
      staleTime: 5 * 60e3,
      refetchInterval: (q: { state: { data?: 'won' | 'lost' | null } }) => (q.state.data ? false : 5 * 60e3),
      retry: 1,
    })),
  })
  const results = useMemo(() => {
    const m = new Map<string, 'won' | 'lost' | null>()
    tickers.forEach((t, i) => m.set(t, (reads[i]?.data as 'won' | 'lost' | null | undefined) ?? null))
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickers, reads.map((r) => r.data).join(',')])

  return useMemo<Graded[]>(() => list.map((p) => {
    const states = p.legs.map((l) => {
      const yes = l.ticker ? results.get(l.ticker) : null
      // a prop's under was bought as No on Kalshi's market
      const r = yes && l.mk === 'prop' && l.side === 'UNDER' ? (yes === 'won' ? 'lost' : 'won') : yes
      return gradeLeg(l, findGame(l, games), l.mk === 'ml' && findGame(l, games)?.state === 'post' ? null : r)
    })
    const lost = states.some((s) => s.st === 'lost')
    const done = states.every((s) => s.st === 'won' || s.st === 'push')
    const live = states.some((s) => s.st === 'live' || s.st === 'won' || s.st === 'lost') ||
      p.legs.some((l) => l.kickoff && Date.parse(l.kickoff) <= Date.now())
    const mult = p.legs.reduce((m, l, i) => (states[i].st === 'push' ? m : m * decimal(l.odds)), 1)
    return {
      ...p,
      states,
      status: lost ? 'missed' : done ? 'hit' : live ? 'live' : 'upcoming',
      payout: (Number(p.stake) || 0) * mult,
    }
  }), [list, games, results])
}

function LegIcon({ st }: { st: St }) {
  if (st === 'won') return <Check className='size-5 shrink-0 text-good' strokeWidth={3} aria-label='Hit' />
  if (st === 'lost') return <X className='size-5 shrink-0 text-bad' strokeWidth={3} aria-label='Missed' />
  if (st === 'live') return <Clock className='size-5 shrink-0 text-devig' strokeWidth={2.5} aria-label='Playing' />
  if (st === 'push') return <Circle className='size-5 shrink-0 text-muted-foreground' aria-label='Push' />
  return <Circle className='size-5 shrink-0 text-muted-foreground/60' aria-label='Not started' />
}

function RemoveButton({ id }: { id: string }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <button type='button' onClick={() => (armed ? removeParlay(id) : setArmed(true))}
      aria-label={armed ? 'Tap again to remove this parlay' : 'Remove this parlay'}
      className={cn('h-9 shrink-0 rounded-full px-3 text-xs font-semibold', armed ? 'bg-bad/15 text-bad' : 'text-muted-foreground hover:text-foreground')}>
      {armed ? 'Tap again to remove' : 'Remove'}
    </button>
  )
}

function LegList({ p }: { p: Graded }) {
  return (
    <ul className='border-t'>
      {p.legs.map((l, i) => {
        const s = p.states[i]
        return (
          <li key={i} className='flex min-h-11 items-center gap-3 px-4 py-2.5'>
            <LegIcon st={s.st} />
            <span className='flex min-w-0 flex-1 flex-col'>
              <span className='truncate font-semibold'>{l.desc}</span>
              <span className='truncate text-xs text-muted-foreground'>{s.note || l.game}</span>
            </span>
            <span className='font-condensed text-[15px] font-bold tabular-nums'>{fmtAmerican(l.odds)}</span>
          </li>
        )
      })}
    </ul>
  )
}

export function OpenCard({ p, foot, by }: { p: Graded; foot: Foot; by?: string }) {
  const n = p.legs.length
  const won = p.states.filter((s) => s.st === 'won').length
  const playing = p.states.filter((s) => s.st === 'live').length
  const stake = Number(p.stake) || 0
  const live = p.status === 'live'
  return (
    <article className={cn('overflow-hidden rounded-[18px] bg-card', live && 'border border-devig/30')}>
      <div className='flex items-start justify-between gap-3 px-4 pt-3.5 pb-2.5'>
        <div className='flex min-w-0 flex-col gap-0.5'>
          {by && (
            <span className='flex min-w-0 items-center gap-1.5 pb-0.5 text-sm font-bold text-foreground'>
              <span aria-hidden='true' className='grid size-5 shrink-0 place-items-center rounded-full bg-devig/15 text-[11px] font-black text-devig'>{(by.trim()[0] || '?').toUpperCase()}</span>
              <span className='truncate'>{by}</span>
            </span>
          )}
          <span className={cn('flex items-center gap-1.5 text-xs font-bold', live ? 'text-[#b5ffd0]' : 'text-muted-foreground')}>
            {live && <span aria-hidden='true' className='size-1.5 rounded-full bg-[#b5ffd0] motion-safe:animate-pulse' />}
            {live ? `${won} of ${n} hit${playing ? ` · ${playing} playing` : ''}` : `${n} ${n === 1 ? 'leg' : 'legs'} · saved ${p.at ? dayFmt.format(new Date(p.at)) : ''}`}
          </span>
          <span className='font-display text-[22px] font-extrabold'>{money(stake)} to win {money(p.payout - stake)}</span>
        </div>
        <span className='font-condensed text-lg font-bold text-devig'>{fmtAmerican(p.odds)}</span>
      </div>
      <div className='grid gap-1 px-4 pb-3' style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} aria-hidden='true'>
        {p.states.map((s, i) => (
          <span key={i} className={cn('h-1.5 rounded-full', s.st === 'won' ? 'bg-good' : s.st === 'lost' ? 'bg-bad' : s.st === 'live' ? 'bg-devig/60' : 'bg-muted')} />
        ))}
      </div>
      <LegList p={p} />
      {(foot.own || foot.action) && (
        <div className='flex justify-end gap-1 border-t px-2 py-1'>{foot.action?.(p)}{foot.own && <RemoveButton id={p.id} />}</div>
      )}
    </article>
  )
}

// the leg that sank a missed parlay, in words
function sankIt(p: Graded) {
  const lost = p.legs.filter((_, i) => p.states[i].st === 'lost')
  if (lost.length !== 1 || p.legs.length < 2) return null
  const l = lost[0]
  const safest = [...p.legs].sort((a, b) => decimal(a.odds) - decimal(b.odds))[0]
  if (safest === l && l.odds < 0) {
    return `${l.desc} was the safest leg (${fmtAmerican(l.odds)}) and the one that missed. Even big favorites lose sometimes, which is why every extra leg costs you.`
  }
  return `${l.desc} was the only leg that missed.`
}

function SettledCard({ p, foot }: { p: Graded; foot: Foot }) {
  const [open, setOpen] = useState(false)
  const stake = Number(p.stake) || 0
  const hit = p.status === 'hit'
  const lostN = p.states.filter((s) => s.st === 'lost').length
  const day = p.legs.map((l) => l.kickoff).filter(Boolean).sort().slice(-1)[0] ?? p.at
  const why = hit ? null : sankIt(p)
  return (
    <article className='overflow-hidden rounded-[18px] bg-card'>
      <button type='button' aria-expanded={open} onClick={() => setOpen((v) => !v)} className='flex w-full flex-col gap-2.5 px-4 py-3.5 text-start'>
        <span className='flex w-full items-center justify-between gap-3'>
          <span className='flex min-w-0 flex-col'>
            <span className={cn('text-xs font-bold uppercase', hit ? 'text-good' : 'text-bad')}>
              {hit ? 'Hit' : `Missed by ${lostN} ${lostN === 1 ? 'leg' : 'legs'}`}{day ? ` · ${dayFmt.format(new Date(day))}` : ''}
            </span>
            <span className='font-display text-xl font-extrabold'>
              {p.legs.length} {p.legs.length === 1 ? 'leg' : 'legs'} · {money(stake)} {hit ? `won ${money(p.payout - stake)}` : 'lost'}
            </span>
          </span>
          <span className={cn('font-condensed text-lg font-bold tabular-nums', hit ? 'text-good' : 'text-bad')}>
            {signed(hit ? p.payout - stake : -stake)}
          </span>
        </span>
        <span className='flex flex-wrap gap-1.5'>
          {p.states.map((s, i) => (
            <span key={i} className={cn('rounded-full px-2.5 py-1 text-[13px] font-semibold',
              s.st === 'won' ? 'bg-good/15 text-good' : s.st === 'lost' ? 'bg-bad/15 text-bad' : 'bg-muted text-muted-foreground')}>
              {s.chip}
            </span>
          ))}
        </span>
        {why && <span className='text-[13px] leading-relaxed text-muted-foreground'>{why}</span>}
      </button>
      {open && (
        <>
          <LegList p={p} />
          <div className='flex items-center justify-between border-t px-4 py-1'>
            <span className='text-xs text-muted-foreground'>Odds when {foot.own ? 'you' : 'they'} saved it · {fmtAmerican(p.odds)}</span>
            {foot.own ? <RemoveButton id={p.id} /> : <span className='h-9' />}
          </div>
        </>
      )}
    </article>
  )
}

const pct = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v * 100))}%`

// Hit, missed, net, and the return on what was put in, from settled parlays
export function RecordTiles({ settled }: { settled: Graded[] }) {
  const r = record(settled)
  const tile = (label: string, value: string, tone?: string) => (
    <div className='min-w-0 rounded-2xl bg-card px-2.5 py-2.5'>
      <div className='text-xs text-muted-foreground'>{label}</div>
      <div className={cn('truncate font-condensed text-xl font-bold tabular-nums', tone)}>{value}</div>
    </div>
  )
  return (
    <div className='flex flex-col gap-1.5'>
      <div className='grid grid-cols-[minmax(0,.75fr)_minmax(0,.75fr)_minmax(0,1.4fr)_minmax(0,1fr)] gap-2'>
        {tile('Hit', String(r.hit), 'text-good')}
        {tile('Missed', String(r.missed), 'text-bad')}
        {tile('Net', signed(r.net))}
        {tile('Return', r.roi == null ? '–' : pct(r.roi), r.roi == null ? undefined : r.roi >= 0 ? 'text-good' : 'text-bad')}
      </div>
      <p className='px-1 text-xs text-muted-foreground tabular-nums'>
        {money(r.staked)} put in across {settled.length} settled {settled.length === 1 ? 'parlay' : 'parlays'}, {r.net >= 0 ? `${money(r.net)} profit` : `${money(-r.net)} down`}.
      </p>
    </div>
  )
}

// part: 'open' = live and coming up (Parlay tab), 'done' = settled with your record (History); left out = all (a friend's page)
export function YourParlays({ list, owner, action, part }: { list: TrackedParlay[]; owner?: string; action?: (p: Graded) => ReactNode; part?: 'open' | 'done' }) {
  const foot: Foot = { own: !owner, action }
  const graded = useGradedParlays(list)
  const settled = part === 'open' ? [] : graded.filter((p) => p.status === 'hit' || p.status === 'missed')
  const live = part === 'done' ? [] : graded.filter((p) => p.status === 'live')
  const upcoming = part === 'done' ? [] : graded.filter((p) => p.status === 'upcoming')

  if (part === 'open' && !live.length && !upcoming.length) {
    return (
      <p className='rounded-[18px] border border-dashed p-4 text-sm text-muted-foreground'>
        {list.length ? 'Nothing live right now. ' : ''}Tap Save this parlay on your slip: each leg is followed here live, then it moves to History once its games end.
      </p>
    )
  }
  if (part === 'done' && !settled.length) {
    return (
      <p className='rounded-[18px] border border-dashed p-6 text-center text-sm text-muted-foreground'>
        No finished parlays yet. Parlays you save on the Parlay tab show there while they&apos;re live, then land here, graded, once their games end.
      </p>
    )
  }

  if (!list.length) {
    if (owner) return <p className='rounded-[18px] border border-dashed p-6 text-center text-sm text-muted-foreground'>{owner} hasn&apos;t saved a parlay yet.</p>
    return (
      <p className='rounded-[18px] border border-dashed p-6 text-center text-sm text-muted-foreground'>
        No saved parlays yet. Build a slip on Parlay and tap Save this parlay.
      </p>
    )
  }
  return (
    <div className='flex flex-col gap-4'>
      {settled.length > 0 && <RecordTiles settled={settled} />}
      {live.length > 0 && <Group title='Live now'>{live.map((p) => <OpenCard key={p.id} p={p} foot={foot} />)}</Group>}
      {upcoming.length > 0 && <Group title='Coming up'>{upcoming.map((p) => <OpenCard key={p.id} p={p} foot={foot} />)}</Group>}
      {settled.length > 0 && <Group title='Settled'>{settled.map((p) => <SettledCard key={p.id} p={p} foot={foot} />)}</Group>}
      <p className='px-1 text-xs text-muted-foreground'>
        Teams are graded from the final score, props from Kalshi&apos;s result for that market.{owner ? '' : ' Saved on this device and your account.'}{part === 'open' ? '' : ' Tap a settled parlay for every leg.'}
      </p>
    </div>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className='flex flex-col gap-2'>
      <h2 className='px-1 pt-1 text-xs font-bold tracking-wide text-muted-foreground uppercase'>{title}</h2>
      {children}
    </section>
  )
}
