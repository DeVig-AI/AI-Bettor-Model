import { useEffect, useMemo, useRef, useState } from 'react'
import { fmtAmerican, fmtPct, useGames } from '@/lib/devig'
import { useSlip } from '@/lib/parlay'
import { type LivePrice, type PropLine, fetchLiveProps, overTxt, statName, underTxt, useProps } from '@/lib/props'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ThemeSwitch } from '@/components/theme-switch'
import { propLeg } from '../parlay/legs'

// Player props: DeVig's props model next to Kalshi's live price. The model has lost to Kalshi on past games, and the
// page says so first. Lines are worded the way Kalshi words them (6+ ast). Thin markets and small samples are flagged.

const timeFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
const clockFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

export type Shown = PropLine & { mid: number; spread: number; live: boolean }

export function withLive(l: PropLine, live: Record<string, LivePrice>): Shown | null {
  const lv = l.ticker ? live[l.ticker] : undefined
  const bid = lv ? lv.bid : l.bid
  const ask = lv ? lv.ask : l.ask
  if (bid == null || ask == null || !(ask > 0 && ask < 1) || !(bid > 0)) return null
  return { ...l, bid, ask, mid: (bid + ask) / 2, spread: ask - bid, live: !!lv }
}

export function PropRow({ l }: { l: Shown }) {
  const { toggle, has } = useSlip()
  const over = propLeg(l, 'over', { bid: l.bid, ask: l.ask, title: null })
  const under = propLeg(l, 'under', { bid: l.bid, ask: l.ask, title: null })
  const thin = l.spread > 0.05 || (l.oi || 0) < 100
  const small = l.games < 40
  const m = l.modelOver
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`
  const lo = m == null ? null : Math.min(m, l.mid)
  const hi = m == null ? null : Math.max(m, l.mid)
  return (
    <li className='flex flex-col gap-2 border-b px-4 py-3 last:border-b-0'>
      <div className='flex items-baseline justify-between gap-3'>
        <span className='truncate font-semibold'>{l.player}</span>
        <span className='shrink-0 text-sm text-muted-foreground'>{overTxt(l.stat, l.line)}</span>
      </div>
      <div className='flex justify-between text-sm font-semibold tabular-nums'>
        <span className='text-devig'>{m == null ? 'No DeVig number' : `DeVig ${fmtPct(m)}`}</span>
        <span>Kalshi {Math.round(l.bid! * 100)}–{Math.round(l.ask! * 100)}¢</span>
      </div>
      <div aria-hidden='true' className='relative h-3.5'>
        <div className='absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-muted' />
        {lo != null && hi != null && (
          <div className='absolute top-1/2 h-1.5 -translate-y-1/2 bg-devig/45' style={{ left: pct(lo), width: pct(hi - lo) }} />
        )}
        <div className='absolute top-0 h-full w-[3px] -translate-x-1/2 rounded-full bg-foreground' style={{ left: pct(l.mid) }} />
        {m != null && (
          <div className='absolute -top-0.5 h-[18px] w-1 rounded-full bg-devig' style={{ left: pct(m), transform: 'translateX(-50%) rotate(12deg)' }} />
        )}
      </div>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <span className={cn('text-xs', thin || small ? 'font-semibold text-bad' : 'text-muted-foreground')}>
          {l.expected != null ? `DeVig expects ${(Math.round(l.expected * 10) / 10).toFixed(1)} ${statName(l.stat, true)}` : ''}
          {l.games ? `, from ${l.games} games` : ''}
          {small ? '. Small sample' : ''}
          {thin ? '. Thin market' : ''}
          {l.injury ? `. ${l.injury}` : ''}
        </span>
        <span className='flex gap-1.5'>
          {[over, under].map((leg, i) =>
            leg ? (
              <button
                key={leg.id}
                type='button'
                aria-pressed={has(leg.id)}
                onClick={() => toggle(leg)}
                className={cn(
                  'h-8 rounded-full border px-3 text-xs font-semibold tabular-nums transition-colors duration-150',
                  has(leg.id) ? 'border-devig bg-devig text-devig-ink' : 'text-muted-foreground hover:text-foreground'
                )}
                aria-label={`${has(leg.id) ? 'Remove' : 'Add'} ${leg.label} ${fmtAmerican(leg.odds)} ${has(leg.id) ? 'from' : 'to'} parlay`}
              >
                {i === 0 ? overTxt(l.stat, l.line) : underTxt(l.stat, l.line)} {fmtAmerican(leg.odds)}
              </button>
            ) : null
          )}
        </span>
      </div>
    </li>
  )
}

export function Props() {
  const { lines, isLoading } = useProps()
  const { rows } = useGames()
  const [sport, setSport] = useState<string | null>(null)
  const [stat, setStat] = useState('gaps')
  const [live, setLive] = useState<Record<string, LivePrice>>({})
  const [liveAt, setLiveAt] = useState<Date | null>(null)

  const upcoming = useMemo(() => lines.filter((l) => Date.parse(l.kickoff) > Date.now()), [lines])
  const sports = useMemo(() => Array.from(new Set(upcoming.map((l) => l.sport))).sort(), [upcoming])
  const sp = sport && sports.includes(sport) ? sport : sports[0]
  const pool = useMemo(() => upcoming.filter((l) => l.sport === sp), [upcoming, sp])
  const stats = useMemo(() => {
    const c = new Map<string, number>()
    pool.forEach((l) => c.set(l.stat, (c.get(l.stat) ?? 0) + 1))
    return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([s]) => s)
  }, [pool])

  // what's on screen: "Biggest gaps" = the 20 widest DeVig-vs-Kalshi gaps in real (tight, traded) markets;
  // a stat = each player's main line (the one closest to 50/50)
  const shown = useMemo(() => {
    const priced = pool.map((l) => withLive(l, live)).filter(Boolean) as Shown[]
    if (stat === 'gaps') {
      return priced
        .filter((l) => l.modelOver != null && l.spread <= 0.05 && (l.oi || 0) >= 100 && l.games >= 40)
        .sort((a, b) => Math.abs(b.modelOver! - b.mid) - Math.abs(a.modelOver! - a.mid))
        .slice(0, 20)
    }
    const best = new Map<string, Shown>()
    for (const l of priced.filter((x) => x.stat === stat)) {
      const k = `${l.gameKey}|${l.player}`
      const cur = best.get(k)
      if (!cur || Math.abs(l.mid - 0.5) < Math.abs(cur.mid - 0.5)) best.set(k, l)
    }
    return [...best.values()]
  }, [pool, stat, live])

  // ask Kalshi for the live price of what's on screen; a ticker asked in the last minute isn't asked again, so new
  // prices reordering the list can't set off another round
  const asked = useRef(new Map<string, number>())
  const tickers = useMemo(() => shown.map((l) => l.ticker).filter(Boolean) as string[], [shown])
  useEffect(() => {
    const now = Date.now()
    const want = tickers.filter((t) => now - (asked.current.get(t) ?? 0) > 60000)
    if (!want.length) return
    want.forEach((t) => asked.current.set(t, now))
    let off = false
    fetchLiveProps(want).then((m) => {
      if (off || !Object.keys(m).length) return
      setLive((cur) => ({ ...cur, ...m }))
      setLiveAt(new Date())
    })
    return () => { off = true }
  }, [tickers])

  const colorsFor = (l: PropLine) =>
    rows.find((r) => r.sport === l.sport && r.away === l.away && r.home === l.home)?.colors ?? null
  const byGame = useMemo(() => {
    const g = new Map<string, Shown[]>()
    shown.forEach((l) => g.set(l.gameKey, [...(g.get(l.gameKey) ?? []), l]))
    return [...g.values()].sort((a, b) => Date.parse(a[0].kickoff) - Date.parse(b[0].kickoff))
  }, [shown])

  return (
    <>
      <Header>
        <div className='me-auto min-w-0'>
          <h1 className='font-display text-[26px] leading-none font-black'>Player props</h1>
          <p className='mt-0.5 truncate text-xs text-muted-foreground'>
            {liveAt ? `Kalshi's live prices as of ${clockFmt.format(liveAt)}` : "Kalshi's price next to DeVig's props model"}
          </p>
        </div>
        <ThemeSwitch />
      </Header>
      <Main className='flex flex-col gap-5'>
        <p className='rounded-2xl bg-card px-4 py-3 text-sm leading-relaxed'>
          On past games Kalshi&apos;s price was more right than this model. Use it as a second opinion, not a pick.
        </p>

        <div className='flex flex-col gap-2'>
          <div className='flex gap-2'>
            {sports.map((s) => (
              <button key={s} type='button' aria-pressed={sp === s} onClick={() => { setSport(s); setStat('gaps') }}
                className={cn('h-9 rounded-full border px-4 text-sm font-medium text-muted-foreground', sp === s && 'border-foreground bg-foreground text-background')}>
                {s}
              </button>
            ))}
          </div>
          <div className='no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4'>
            {['gaps', ...stats].map((s) => (
              <button key={s} type='button' aria-pressed={stat === s} onClick={() => setStat(s)}
                className={cn('h-8 shrink-0 rounded-lg border px-3 text-sm text-muted-foreground', stat === s && 'border-foreground bg-foreground font-semibold text-background')}>
                {s === 'gaps' ? 'Biggest gaps' : statName(s)}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <Skeleton className='h-64 w-full rounded-[18px]' />
        ) : byGame.length === 0 ? (
          <p className='rounded-[18px] border border-dashed p-8 text-center text-muted-foreground'>
            No upcoming {sp ?? ''} props with prices right now.
          </p>
        ) : (
          <div className='grid gap-4 lg:grid-cols-2'>
            {byGame.map((ls) => {
              const g = ls[0]
              const c = colorsFor(g)
              return (
                <section key={g.gameKey} aria-label={`${g.away} at ${g.home}`} className='overflow-hidden rounded-[18px] bg-card'>
                  <div
                    className='relative flex h-11 items-center justify-between px-4 font-display text-xl font-extrabold text-white'
                    style={{ background: c ? `linear-gradient(102deg, ${c.away} 0 50%, ${c.home} 50% 100%)` : 'linear-gradient(102deg, var(--side-away) 0 50%, var(--side-home) 50% 100%)' }}
                  >
                    <div aria-hidden='true' className='absolute inset-0 bg-black/25' />
                    <span className='relative'>{g.away}</span>
                    <span className='relative font-sans text-xs font-semibold'>{timeFmt.format(new Date(g.kickoff))}</span>
                    <span className='relative'>{g.home}</span>
                  </div>
                  <ul>
                    {ls.map((l) => (
                      <PropRow key={l.key} l={l} />
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>
        )}
        <p className='max-w-prose text-xs leading-relaxed text-muted-foreground'>
          White tick: Kalshi&apos;s midpoint. Amber slash: DeVig&apos;s props model. Buttons show what you&apos;d really pay,
          Kalshi&apos;s fee included. Thin market = buy and sell prices more than 5¢ apart or little traded.
        </p>
      </Main>
    </>
  )
}
