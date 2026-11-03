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
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { ChevronRight } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ThemeSwitch } from '@/components/theme-switch'
import { propLeg } from '../parlay/legs'
import { PlayerPhoto, TeamLogo } from '@/components/team-logo'
import { useExperience } from '@/lib/experience'
import { LevelPicker } from '../games/explain-sheet'
import { count, inTen, sideShort } from './words'
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
const pct1 = (p: number) => `${(p * 100).toFixed(1)}%`
const s1 = (lv: string) => (lv === 'numbers' ? 'Model' : 'DeVig')

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
  const { level } = useExperience()
  const lv = level ?? 'sometimes'
  const newb = lv === 'new'
  const nums = lv === 'numbers'
  const x = l.expected
  const sub = x == null
    ? 'DeVig has no number for this one'
    : newb ? `DeVig expects about ${count(Math.round(x), l.stat)}`
      : nums ? `Expects ${x.toFixed(1)} ${statName(l.stat, true)} · ${l.games} games`
        : `DeVig expects ${x.toFixed(1)} ${statName(l.stat, true)}`
  const flags = [
    small && (newb ? `Only ${l.games} games to learn from` : 'Small sample'),
    thin && (newb ? 'Few trades on Kalshi, so its price is shaky' : nums ? `Thin: ${Math.round(l.spread * 100)}¢ spread, ${Math.round(l.oi)} OI` : 'Thin market'),
    l.injury,
  ].filter(Boolean) as string[]
  const gap = m == null ? null : (m - l.mid) * 100
  return (
    <li className='flex flex-col gap-2.5 border-b px-4 py-3 last:border-b-0'>
      <div className='flex items-center gap-3'>
        <PlayerPhoto sport={l.sport} unit={unit} pid={pid} team={team} teamColor={color} className='size-11' badge='size-5 text-[7px]' />
        <span className='flex min-w-0 flex-1 flex-col'>
          <PlayerName l={l} />
          <span className={cn('text-xs text-muted-foreground', !newb && 'truncate')}>{sub}</span>
          {flags.length > 0 && <span className='text-xs font-semibold text-bad'>{flags.join(' · ')}</span>}
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
                <span className='text-[13px] font-bold opacity-90 [text-shadow:0_1px_3px_rgba(0,0,0,0.7)]'>
                  {newb ? sideShort(l.stat, l.line, s === 'over') : s === 'over' ? overTxt(l.stat, l.line).replace(` ${statName(l.stat, true)}`, '') : 'Under'}
                  {leg && !newb ? ` · ${fmtAmerican(leg.odds)}` : ''}
                </span>
                <span className='flex items-center gap-1.5 font-display text-[28px] leading-none font-extrabold tabular-nums [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]'>
                  {s === 'under' && on && <span className='rounded-full bg-white px-1.5 py-0.5 font-sans text-[10px] font-bold text-black'>In parlay</span>}
                  {fmtPct(p)}
                  {s === 'over' && on && <span className='rounded-full bg-white px-1.5 py-0.5 font-sans text-[10px] font-bold text-black'>In parlay</span>}
                </span>
              </button>
            )
          })}
        </div>
      </div>
      <p className='-mt-1 flex flex-wrap items-center gap-x-2 text-xs leading-relaxed text-muted-foreground'>
        {m == null ? (
          <span>DeVig has no number here, so the big numbers are Kalshi&apos;s price.</span>
        ) : newb ? (
          <span>
            Chance of {sideShort(l.stat, l.line, true).toLowerCase()}: <b className='font-semibold text-devig'>DeVig {inTen(m)}</b>
            {' · '}<b className='font-semibold text-foreground'>Kalshi {inTen(l.mid)}</b>
          </span>
        ) : (
          <>
            <span className='inline-flex items-center gap-1.5'>
              <span aria-hidden='true' className='h-3 w-[3px] rotate-12 rounded-full bg-devig' />
              <span>{s1(lv)} <b className='font-semibold text-devig tabular-nums'>{nums ? pct1(m) : fmtPct(m)}</b></span>
            </span>
            <span>Kalshi <b className='font-semibold text-foreground tabular-nums'>{nums ? pct1(l.mid) : fmtPct(l.mid)}</b>{nums ? ` (${Math.round(l.bid! * 100)}¢/${Math.round(l.ask! * 100)}¢)` : ''}</span>
            {gap != null && <span className='tabular-nums'>Gap {gap >= 0 ? '+' : '−'}{Math.abs(gap).toFixed(nums ? 1 : 0)}</span>}
          </>
        )}
      </p>
      <PropSheet l={l} w={w} game={game} side={side} onSide={setSide} open={open} onOpenChange={setOpen} />
    </li>
  )
}

// What the page says before the props, at the reader's level
function Intro({ level }: { level: string }) {
  if (level === 'new') {
    return (
      <div className='flex flex-col gap-3 rounded-2xl bg-card px-4 py-3.5 text-sm leading-relaxed'>
        <p className='font-display text-lg leading-tight font-extrabold'>How props work</p>
        <p>
          A prop is a bet on one player&apos;s stats, not on who wins. <b>15 or more points</b> wins if the player scores 15
          or more. The other side wins if they score 14 or fewer.
        </p>
        <p>
          <b>The bar</b> splits where Kalshi&apos;s price is. The more of the bar a side takes up, the likelier
          people trading on Kalshi think it is. <b className='text-devig'>The amber slash</b> is where DeVig puts it,
          and the big numbers are DeVig&apos;s chances.
        </p>
        <p className='text-muted-foreground'>
          On past games, Kalshi&apos;s price has been right more often than DeVig&apos;s props model. Treat DeVig as a
          second opinion, not a sure thing. Tap a side for the why and what $10 would pay.
        </p>
      </div>
    )
  }
  return (
    <p className='rounded-2xl bg-card px-4 py-3 text-sm leading-relaxed'>
      Big numbers are DeVig&apos;s chances; the bar splits at Kalshi&apos;s price
      {level === 'numbers' ? ' (bid/ask midpoint)' : ''}. On past games Kalshi&apos;s price was more right than this model, so
      use it as a second opinion, not a pick.
    </p>
  )
}

// One game's props in a drawer: pick a stat (or the biggest DeVig-vs-Kalshi gaps), Kalshi's live prices fetched
// for what's on screen
function GameProps({ ls, game, open, onOpenChange }: { ls: PropLine[]; game: GameRow | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const g = ls[0]
  const [stat, setStat] = useState<string | null>(null)
  const [live, setLive] = useState<Record<string, LivePrice>>({})
  const [liveAt, setLiveAt] = useState<Date | null>(null)
  const priced = useMemo(() => ls.map((l) => withLive(l, live)).filter(Boolean) as Shown[], [ls, live])
  const gaps = useMemo(() => priced
    .filter((l) => l.modelOver != null && l.spread <= 0.05 && (l.oi || 0) >= 100 && l.games >= 40)
    .sort((a, b) => Math.abs(b.modelOver! - b.mid) - Math.abs(a.modelOver! - a.mid))
    .slice(0, 10), [priced])
  const stats = useMemo(() => {
    const c = new Map<string, number>()
    ls.forEach((l) => c.set(l.stat, (c.get(l.stat) ?? 0) + 1))
    return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([x]) => x)
  }, [ls])
  const tabs = [...(gaps.length ? ['gaps'] : []), ...stats]
  const cur = stat && tabs.includes(stat) ? stat : tabs[0]
  // a stat = each player's main line (the one closest to 50/50)
  const shown = useMemo(() => {
    if (cur === 'gaps') return gaps
    const best = new Map<string, Shown>()
    for (const l of priced.filter((x) => x.stat === cur)) {
      const k = l.player
      const c = best.get(k)
      if (!c || Math.abs(l.mid - 0.5) < Math.abs(c.mid - 0.5)) best.set(k, l)
    }
    return [...best.values()].sort((a, b) => (b.expected ?? 0) - (a.expected ?? 0))
  }, [cur, gaps, priced])

  // ask Kalshi for the live price of what's on screen; a ticker asked in the last minute isn't asked again
  const asked = useRef(new Map<string, number>())
  const tickers = useMemo(() => (open ? shown.map((l) => l.ticker).filter(Boolean) as string[] : []), [shown, open])
  useEffect(() => {
    const now = Date.now()
    const want = tickers.filter((t) => now - (asked.current.get(t) ?? 0) > 60000)
    if (!want.length) return
    want.forEach((t) => asked.current.set(t, now))
    let off = false
    fetchLiveProps(want).then((m) => {
      if (off || !Object.keys(m).length) return
      setLive((c) => ({ ...c, ...m }))
      setLiveAt(new Date())
    })
    return () => { off = true }
  }, [tickers])

  const c = game?.colors ?? null
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side='bottom'
        className='max-h-[92svh] gap-0 overflow-y-auto rounded-t-3xl border-t p-0 md:mx-auto md:max-w-xl [&>button:last-child]:top-3 [&>button:last-child]:grid [&>button:last-child]:size-9 [&>button:last-child]:place-items-center [&>button:last-child]:rounded-full [&>button:last-child]:bg-black/30 [&>button:last-child]:text-white [&>button:last-child]:opacity-100'>
        <div className='relative flex shrink-0 flex-col gap-1 overflow-hidden rounded-t-3xl px-5 pt-6 pb-4 text-white'
          style={{ background: c ? `linear-gradient(102deg, ${c.away} 0 50%, ${c.home} 50% 100%)` : 'linear-gradient(102deg, var(--side-away) 0 50%, var(--side-home) 50% 100%)' }}>
          <span aria-hidden='true' className='absolute inset-0 bg-black/30' />
          <span aria-hidden='true' className='absolute top-2 left-1/2 h-1.5 w-10 -translate-x-1/2 rounded-full bg-white/45' />
          <SheetTitle className='relative flex items-center gap-2 font-display text-2xl font-black text-white'>
            <TeamLogo sport={g.sport} code={g.away} id={game?.ids?.away} color={c?.away} px={64} className='size-8 text-[10px]' />
            {g.away} at {g.home}
            <TeamLogo sport={g.sport} code={g.home} id={game?.ids?.home} color={c?.home} px={64} className='size-8 text-[10px]' />
          </SheetTitle>
          <SheetDescription className='relative text-sm text-white/85'>
            {timeFmt.format(new Date(g.kickoff))} · {liveAt ? `Kalshi live as of ${clockFmt.format(liveAt)}` : 'Player props'}
          </SheetDescription>
        </div>
        <div className='no-scrollbar flex shrink-0 gap-1.5 overflow-x-auto px-4 pt-3 pb-1'>
          {tabs.map((x) => (
            <button key={x} type='button' aria-pressed={cur === x} onClick={() => setStat(x)}
              className={cn('h-8 shrink-0 rounded-lg border px-3 text-sm text-muted-foreground', cur === x && 'border-foreground bg-foreground font-semibold text-background')}>
              {x === 'gaps' ? 'Biggest gaps' : statName(x)}
            </button>
          ))}
        </div>
        {shown.length ? (
          <ul className='pb-[env(safe-area-inset-bottom)]'>
            {shown.map((l) => <PropRow key={l.key} l={l} game={game} />)}
          </ul>
        ) : (
          <p className='p-8 text-center text-muted-foreground'>No prices for these props right now.</p>
        )}
      </SheetContent>
    </Sheet>
  )
}

// A game on the props list: who's playing, when, and how many props; tap for the drawer
function GameCard({ ls, game, newb }: { ls: PropLine[]; game: GameRow | null; newb: boolean }) {
  const [open, setOpen] = useState(false)
  const g = ls[0]
  const c = game?.colors ?? null
  const players = new Set(ls.map((l) => l.player)).size
  const top = useMemo(() => ls
    .map((l) => withLive(l, {}))
    .filter((l): l is Shown => !!l && l.modelOver != null && l.spread <= 0.05 && (l.oi || 0) >= 100 && l.games >= 40)
    .sort((a, b) => Math.abs(b.modelOver! - b.mid) - Math.abs(a.modelOver! - a.mid))[0], [ls])
  const gap = top ? Math.round((top.modelOver! - top.mid) * 100) : null
  return (
    <li>
      <button type='button' aria-haspopup='dialog' onClick={() => setOpen(true)}
        className='flex w-full flex-col overflow-hidden rounded-[18px] bg-card text-start transition-opacity duration-150 hover:opacity-90'>
        <span className='relative flex h-14 w-full items-center justify-between px-4 font-display text-2xl font-extrabold text-white'
          style={{ background: c ? `linear-gradient(102deg, ${c.away} 0 50%, ${c.home} 50% 100%)` : 'linear-gradient(102deg, var(--side-away) 0 50%, var(--side-home) 50% 100%)' }}>
          <span aria-hidden='true' className='absolute inset-0 bg-black/25' />
          <span className='relative flex items-center gap-2'>
            <TeamLogo sport={g.sport} code={g.away} id={game?.ids?.away} color={c?.away} px={64} className='size-8 text-[10px]' />{g.away}
          </span>
          <span className='relative font-sans text-xs font-semibold'>{timeFmt.format(new Date(g.kickoff))}</span>
          <span className='relative flex items-center gap-2'>
            {g.home}<TeamLogo sport={g.sport} code={g.home} id={game?.ids?.home} color={c?.home} px={64} className='size-8 text-[10px]' />
          </span>
        </span>
        <span className='flex w-full items-center gap-3 px-4 py-3'>
          <span className='flex min-w-0 flex-1 flex-col'>
            <span className='text-sm font-semibold'>{players} {players === 1 ? 'player' : 'players'} · {ls.length} props</span>
            {top && gap != null && (
              <span className='truncate text-xs text-muted-foreground'>
                {newb ? 'DeVig and Kalshi disagree most on ' : 'Biggest gap: '}
                <span className='text-devig'>{top.player.split(' ').slice(-1)[0]} {overTxt(top.stat, top.line)}</span>
                {newb ? '' : ` (${gap >= 0 ? '+' : '−'}${Math.abs(gap)})`}
              </span>
            )}
          </span>
          <ChevronRight className='size-5 shrink-0 text-muted-foreground' aria-hidden='true' />
        </span>
      </button>
      {open && <GameProps ls={ls} game={game} open={open} onOpenChange={setOpen} />}
    </li>
  )
}

export function Props() {
  const { lines, isLoading } = useProps()
  const { rows } = useGames()
  const [sport, setSport] = useState<string | null>(null)
  const { level, setLevel } = useExperience()
  const lv = level ?? 'sometimes'

  const upcoming = useMemo(() => lines.filter((l) => Date.parse(l.kickoff) > Date.now()), [lines])
  const sports = useMemo(() => Array.from(new Set(upcoming.map((l) => l.sport))).sort(), [upcoming])
  const sp = sport && sports.includes(sport) ? sport : sports[0]
  // games in start-time order, earliest first
  const byGame = useMemo(() => {
    const g = new Map<string, PropLine[]>()
    upcoming.filter((l) => l.sport === sp).forEach((l) => g.set(l.gameKey, [...(g.get(l.gameKey) ?? []), l]))
    return [...g.values()].sort((a, b) => Date.parse(a[0].kickoff) - Date.parse(b[0].kickoff))
  }, [upcoming, sp])
  const gameFor = (l: PropLine) => rows.find((r) => r.sport === l.sport && r.away === l.away && r.home === l.home) ?? null

  return (
    <>
      <Header>
        <div className='me-auto min-w-0'>
          <h1 className='font-display text-[26px] leading-none font-black'>Player props</h1>
          <p className='mt-0.5 truncate text-xs text-muted-foreground'>Tap a game to see its props</p>
        </div>
        <ThemeSwitch />
      </Header>
      <Main className='flex flex-col gap-5'>
        <div className='flex flex-col gap-2'>
          <span className='px-1 text-xs font-semibold text-muted-foreground'>Explain it for me</span>
          <LevelPicker level={lv} onLevel={setLevel} />
        </div>
        <Intro level={lv} />

        <div className='flex gap-2'>
          {sports.map((x) => (
            <button key={x} type='button' aria-pressed={sp === x} onClick={() => setSport(x)}
              className={cn('h-9 rounded-full border px-4 text-sm font-medium text-muted-foreground', sp === x && 'border-foreground bg-foreground text-background')}>
              {x}
            </button>
          ))}
        </div>

        {isLoading ? (
          <Skeleton className='h-64 w-full rounded-[18px]' />
        ) : byGame.length === 0 ? (
          <p className='rounded-[18px] border border-dashed p-8 text-center text-muted-foreground'>
            No upcoming {sp ?? ''} props with prices right now.
          </p>
        ) : (
          <ul className='grid gap-3 lg:grid-cols-2'>
            {byGame.map((ls) => <GameCard key={ls[0].gameKey} ls={ls} game={gameFor(ls[0])} newb={lv === 'new'} />)}
          </ul>
        )}
        {lv === 'numbers' && (
          <p className='max-w-prose text-xs leading-relaxed text-muted-foreground'>
            Each bar splits at Kalshi&apos;s midpoint: the team color is Over, gray is Under. Amber slash: DeVig&apos;s props model;
            the big numbers are its chances (Kalshi&apos;s when DeVig has none). Prices next to Over and Under are what you&apos;d
            really pay, Kalshi&apos;s fee included. Thin market = buy and sell prices more than 5¢ apart or little traded.
            Biggest gaps leaves out thin markets and players with fewer than 40 games.
          </p>
        )}
      </Main>
    </>
  )
}
