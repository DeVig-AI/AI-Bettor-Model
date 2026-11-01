import { TrackButton } from '@/components/track-button'
import { propSides } from '@/lib/track'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { type GameRow, fmtAmerican, fmtPct, useGames } from '@/lib/devig'
import { useSlip } from '@/lib/parlay'
import { type LivePrice, type PropLine, fetchLiveProps, overTxt, statName, underTxt, useProps } from '@/lib/props'
import { useRsPlayerLink } from '@/lib/research'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ThemeSwitch } from '@/components/theme-switch'
import { propLeg } from '../parlay/legs'
import { PlayerPhoto, TeamLogo } from '@/components/team-logo'
import { type PropSide, PropSheet, usePropPlayer, usePropWhy } from './why'

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

function PlayerName({ l }: { l: Shown }) {
  const to = useRsPlayerLink(l.sport, l.player)
  if (!to) return <span className='truncate font-semibold'>{l.player}</span>
  return (
    <Link to='/research/player/$sport/$team/$id' params={to} search={{ stat: l.stat, line: l.line }}
      className='truncate font-semibold underline decoration-muted-foreground/40 underline-offset-4 hover:text-devig'>
      {l.player}
    </Link>
  )
}

const UNDER_BG = '#343b4a'

// One prop as a two-sided bar, like a game's plate: Over in the player's team color on the left, Under in gray on the
// right, meeting at Kalshi's price; the amber slash is DeVig's props model. Tap a side for why (and the parlay button).
export function PropRow({ l, game }: { l: Shown; game?: GameRow | null }) {
  const { has } = useSlip()
  const w = usePropWhy(l)
  const [open, setOpen] = useState(false)
  const [side, setSide] = useState<PropSide>('over')
  const { pid, team, color, unit } = usePropPlayer(l, w, game)
  const overBg = color ?? 'var(--side-home)'
  const thin = l.spread > 0.05 || (l.oi || 0) < 100
  const small = l.games < 40
  const m = l.modelOver
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`
  const pre = Date.parse(l.kickoff) > Date.now()
  return (
    <li className='flex flex-col gap-2.5 border-b px-4 py-3 last:border-b-0'>
      <div className='flex items-center gap-3'>
        <PlayerPhoto sport={l.sport} unit={unit} pid={pid} team={team} teamColor={color} className='size-11' badge='size-5 text-[7px]' />
        <span className='flex min-w-0 flex-1 flex-col'>
          <PlayerName l={l} />
          <span className={cn('truncate text-xs', thin || small ? 'font-semibold text-bad' : 'text-muted-foreground')}>
            {l.expected != null ? `DeVig expects ${(Math.round(l.expected * 10) / 10).toFixed(1)} ${statName(l.stat, true)}` : 'No DeVig number'}
            {l.games ? `, from ${l.games} games` : ''}
            {small ? '. Small sample' : ''}
            {thin ? '. Thin market' : ''}
            {l.injury ? `. ${l.injury}` : ''}
          </span>
        </span>
        <span className='shrink-0 font-condensed text-[15px] font-bold text-muted-foreground'>{overTxt(l.stat, l.line)}</span>
        <TrackButton kind='p' compact label={`${l.player} ${overTxt(l.stat, l.line)}`}
          keys={m != null && m < l.mid ? propSides(l).reverse() : propSides(l)} />
      </div>
      <div className='relative h-[72px] overflow-hidden rounded-[14px]'
        style={{ background: `linear-gradient(102deg, ${overBg} 0 ${pct(l.mid)}, ${UNDER_BG} ${pct(l.mid)} 100%)` }}>
        <div aria-hidden='true' className='absolute inset-0 bg-black/20' />
        {m != null && (
          <div aria-hidden='true' className='absolute -inset-y-3 w-[5px] -translate-x-1/2 rotate-12 rounded-full bg-devig shadow-[0_0_0_2px_#0a0b0f]' style={{ left: pct(m) }} />
        )}
        <div className='absolute inset-0 grid grid-cols-2'>
          {(['over', 'under'] as const).map((s) => {
            const leg = pre ? propLeg(l, s, { bid: l.bid, ask: l.ask, title: null }) : null
            const on = leg ? has(leg.id) : false
            const p = m == null ? (s === 'over' ? l.mid : 1 - l.mid) : s === 'over' ? m : 1 - m
            const txt = s === 'over' ? overTxt(l.stat, l.line) : underTxt(l.stat, l.line)
            return (
              <button key={s} type='button' aria-haspopup='dialog'
                aria-label={`Why ${l.player} ${txt}: ${m == null ? 'Kalshi' : 'DeVig'} ${fmtPct(p)}${leg ? `, ${fmtAmerican(leg.odds)}` : ''}${on ? ', in your parlay' : ''}`}
                onClick={() => { setSide(s); setOpen(true) }}
                className={cn('relative flex flex-col justify-center px-3 text-white transition-colors duration-150 hover:bg-white/5 focus-visible:outline-offset-[-3px]',
                  s === 'over' ? 'items-start text-start' : 'items-end text-end')}>
                <span className='text-[13px] font-bold opacity-90'>
                  {s === 'over' ? overTxt(l.stat, l.line).replace(` ${statName(l.stat, true)}`, '') : 'Under'}
                  {leg ? ` · ${fmtAmerican(leg.odds)}` : ''}
                </span>
                <span className='flex items-center gap-1.5 font-display text-[28px] leading-none font-extrabold tabular-nums'>
                  {s === 'under' && on && <span className='rounded-full bg-white px-1.5 py-0.5 font-sans text-[10px] font-bold text-black'>In parlay</span>}
                  {fmtPct(p)}
                  {s === 'over' && on && <span className='rounded-full bg-white px-1.5 py-0.5 font-sans text-[10px] font-bold text-black'>In parlay</span>}
                </span>
              </button>
            )
          })}
        </div>
      </div>
      <PropSheet l={l} w={w} game={game} side={side} onSide={setSide} open={open} onOpenChange={setOpen} />
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

  const gameFor = (l: PropLine) => rows.find((r) => r.sport === l.sport && r.away === l.away && r.home === l.home) ?? null
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
            {liveAt ? `Kalshi's live prices as of ${clockFmt.format(liveAt)}` : "Tap Over or Under to see why"}
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
              const game = gameFor(g)
              const c = game?.colors ?? null
              return (
                <section key={g.gameKey} aria-label={`${g.away} at ${g.home}`} className='overflow-hidden rounded-[18px] bg-card'>
                  <div
                    className='relative flex h-11 items-center justify-between px-4 font-display text-xl font-extrabold text-white'
                    style={{ background: c ? `linear-gradient(102deg, ${c.away} 0 50%, ${c.home} 50% 100%)` : 'linear-gradient(102deg, var(--side-away) 0 50%, var(--side-home) 50% 100%)' }}
                  >
                    <div aria-hidden='true' className='absolute inset-0 bg-black/25' />
                    <span className='relative flex items-center gap-2'>
                      <TeamLogo sport={g.sport} code={g.away} id={game?.ids?.away} color={c?.away} px={64} className='size-7 text-[10px]' />
                      {g.away}
                    </span>
                    <span className='relative font-sans text-xs font-semibold'>{timeFmt.format(new Date(g.kickoff))}</span>
                    <span className='relative flex items-center gap-2'>
                      {g.home}
                      <TeamLogo sport={g.sport} code={g.home} id={game?.ids?.home} color={c?.home} px={64} className='size-7 text-[10px]' />
                    </span>
                  </div>
                  <ul>
                    {ls.map((l) => (
                      <PropRow key={l.key} l={l} game={game} />
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>
        )}
        <p className='max-w-prose text-xs leading-relaxed text-muted-foreground'>
          Tap Over or Under to see why, or to add it to your parlay. Each bar splits at Kalshi&apos;s midpoint: the team color is
          Over, gray is Under. Amber slash: DeVig&apos;s props model; the big numbers are its chances (Kalshi&apos;s when DeVig has
          none). Prices next to Over and Under are what you&apos;d really pay, Kalshi&apos;s fee included. Thin market = buy and sell prices more than 5¢ apart or little traded.
        </p>
      </Main>
    </>
  )
}
