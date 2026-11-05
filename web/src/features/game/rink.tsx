import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { type GameRow } from '@/lib/devig'
import { biggestMoves, moveOf, periodLabel, useFieldPlays, usePriceLine, type Move, type PricePoint } from '@/lib/field'
import { type RinkPlay, RINK, assistsOf, isGoal, isShot, recentGoals, rinkLabel, rinkSpot, scoreAfter, shotCounts } from '@/lib/rink-math'
import { teamLogo } from '@/lib/logos'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { TeamLogo } from '@/components/team-logo'
import { isPick } from '../games/plate'
import { Pill, useReducedMotion } from './field'

// A tilted 3D rink for an NHL game: every shot on goal this game as a dot where it was taken (away attacks the left
// net, home the right, each attacking zone tinted in that team's colour), and the latest goals played back one after
// another: the puck flies from where the shot was taken into the net, the net bulges, the goal light behind it
// flashes, the camera leans in, the scoring team's fans jump and the big screen over centre ice calls it. Under the
// rink, the goal and what Kalshi's price did around it. Then the goals and penalties that moved the price most this
// game. During and after a game. With reduced motion, the rink is still and the last goal is shown.

const S = 1.75 // px per foot in the ice drawing
const CW = RINK.w * S, CH = RINK.h * S
const X = (x: number) => x * S
const RED = '#d0303a', BLUE = '#2a5fb8'
const HIT = 0.75 // seconds until the puck is in
const STEP = 3200
const LEAN = 50

export function RinkMovers({ row }: { row: GameRow }) {
  const plays = useFieldPlays(row)
  const prices = usePriceLine(row)
  if (row.sport !== 'NHL' || row.state === 'pre') return null
  if (plays.isLoading) return <Skeleton className='h-[330px] w-full rounded-2xl' />
  const feed = plays.data as unknown as { plays?: RinkPlay[] } | undefined
  if (!feed?.plays?.some((p) => isShot(p) || isGoal(p))) return null
  return <Body row={row} plays={feed.plays} points={prices.data ?? []} />
}

// goals and penalties: the plays that can carry a price move, oldest first
function rinkMoves(plays: RinkPlay[], points: PricePoint[], side: 'home' | 'away', now = Date.now() / 1000): Move<RinkPlay>[] {
  const timed = plays.filter((p) => p.at != null && (isGoal(p) || p.penalty)).sort((a, b) => a.at! - b.at!)
  return timed.map((p, i) => moveOf(p, timed[i + 1] ?? null, points, side, now)).filter((m): m is Move<RinkPlay> => !!m)
}

function Body({ row, plays, points }: { row: GameRow; plays: RinkPlay[]; points: PricePoint[] }) {
  // whose price we follow: DeVig's pick if it made one, else the home team (Kalshi's market is the home team's)
  const side: 'home' | 'away' = isPick(row) && row.pick?.side === row.away ? 'away' : 'home'
  const sideCode = side === 'home' ? row.home : row.away
  const moves = useMemo(() => rinkMoves(plays, points, side), [plays, points, side])
  const byId = useMemo(() => new Map(moves.map((m) => [m.play.id, m])), [moves])
  const goals = useMemo(() => recentGoals(plays), [plays])
  const big = useMemo(() => biggestMoves(moves), [moves])
  return (
    <>
      <RinkCard row={row} plays={plays} goals={goals} byId={byId} />
      {big.length > 0 && (
        <section aria-label='Biggest moves this game'>
          <div className='mb-2 flex items-baseline justify-between px-1'>
            <h2 className='font-display text-[22px] font-extrabold'>Biggest moves this game</h2>
            <span className='text-xs text-muted-foreground'>{sideCode} to win</span>
          </div>
          <ul className='overflow-hidden rounded-2xl bg-card'>
            {big.map((m) => <MoveRow key={m.play.id} row={row} m={m} />)}
          </ul>
          <p className='mt-1.5 px-1 text-xs text-muted-foreground'>
            Kalshi&apos;s price for {sideCode} just before each goal or penalty and a minute or so after. The price can move on other news too.
          </p>
        </section>
      )}
    </>
  )
}

const when = (p: RinkPlay) => (p.q ? `${periodLabel(p.q, 'NHL')} ${p.clock}` : p.clock)

function MoveRow({ row, m }: { row: GameRow; m: Move<RinkPlay> }) {
  const team = m.play.team ?? row.home
  const tid = team === row.away ? row.ids?.away : team === row.home ? row.ids?.home : null
  return (
    <li className='flex items-center gap-3 border-b border-border px-3.5 py-2.5 last:border-b-0'>
      <Pill d={m.delta} className='w-[60px]' />
      <span className='min-w-0 flex-1'>
        <span className='block truncate text-sm font-semibold'>{rinkLabel(m.play)}</span>
        <span className='block font-condensed text-xs text-muted-foreground tabular-nums'>
          {when(m.play)}{m.play.scoring && scoreAfter(m.play, row.away, row.home) ? ` · ${scoreAfter(m.play, row.away, row.home)}` : ''} · {m.before}¢ → {m.after}¢
        </span>
      </span>
      <TeamLogo sport={row.sport} code={team} id={tid} px={64} className='size-6' />
    </li>
  )
}

type Pt = { x: number; y: number }
// the net each team shoots at: away the left, home the right
const netOf = (left: boolean): Pt => ({ x: left ? RINK.goal - 1.2 : RINK.w - RINK.goal + 1.2, y: 42.5 })
// where the goal was scored from, on the rink as drawn; in front of the net when ESPN has no spot
function originOf(p: RinkPlay, left: boolean): Pt {
  if (p.spot) return rinkSpot(p.spot, !left)
  return { x: left ? 28 : RINK.w - 28, y: 42.5 }
}

function RinkCard({ row, plays, goals, byId }: { row: GameRow; plays: RinkPlay[]; goals: RinkPlay[]; byId: Map<string, Move<RinkPlay>> }) {
  const reduce = useReducedMotion()
  const n = goals.length
  const newestId = goals[n - 1]?.id ?? ''
  const [shown, setShown] = useState(reduce ? n : 0)
  const [pick, setPick] = useState<number | null>(null)
  const [taps, setTaps] = useState(0)
  const [runK, setRunK] = useState(0)
  const seen = useRef(newestId)
  useEffect(() => {
    if (seen.current === newestId) return
    seen.current = newestId
    setShown(reduce ? n : Math.max(0, n - 1))
    setPick(null)
  }, [newestId, n, reduce])
  useEffect(() => {
    if (reduce) { setShown(n); return }
    if (shown >= n) return
    const t = setTimeout(() => setShown((s) => Math.min(n, s + 1)), shown === 0 ? 450 : STEP)
    return () => clearTimeout(t)
  }, [shown, n, reduce, runK])
  const replay = () => { setPick(null); setShown(0); setRunK((r) => r + 1) }

  const plane = useRef<HTMLDivElement>(null)
  const [k, setK] = useState(1.75)
  useEffect(() => {
    const el = plane.current
    if (!el) return
    const ro = new ResizeObserver(() => setK(el.clientWidth / RINK.w || 1.75))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const colors = row.colors ?? { away: '#5b6472', home: '#5b6472' }
  const colorOf = (team: string | null) => (team === row.away ? colors.away : colors.home)
  const cur = pick ?? shown - 1
  const tick = cur < 0 ? null : goals[cur] ?? null
  const mv = tick ? byId.get(tick.id) : undefined
  const live = row.state === 'in'
  const done = shown >= n
  const animKey = tick ? `${tick.id}-${runK}-${taps}` : 'none'
  const go = !!tick && !reduce
  const left = tick ? tick.team === row.away : true
  const color = tick ? colorOf(tick.team) : '#fff'
  const sog = shotCounts(plays, row.away, row.home)
  const logo = teamLogo(row.sport, row.home, row.ids?.home, 128)
  const shots = useMemo(() => plays.filter((p) => p.spot && isShot(p)).map((p) => ({ p, at: rinkSpot(p.spot!, p.team === row.home) })), [plays, row.home])
  const assists = tick ? assistsOf(tick) : []
  const label = `3D rink: ${row.away} attacks the left net, ${row.home} the right. Shots on goal ${row.away} ${sog.away}, ${row.home} ${sog.home}.` +
    (n ? ` The last ${n} goals, newest: ${rinkLabel(goals[n - 1])}.` : ' No goals yet.')

  return (
    <section aria-label={live ? 'Latest goals' : 'Goals'} className='overflow-hidden rounded-2xl bg-card'>
      <div role='img' aria-label={label} className='relative mx-auto w-full max-w-[460px] overflow-hidden'
        style={{ aspectRatio: '380 / 250', perspective: 820, perspectiveOrigin: '50% -10%',
          background: 'radial-gradient(120% 90% at 50% 0%, color-mix(in oklab, var(--muted) 70%, #1b2a3a) 0%, var(--card) 62%)' }}>
        <div key={go ? animKey : 'still'} className='absolute inset-0' style={{ transformStyle: 'preserve-3d',
          ...(go ? { ['--dx' as string]: left ? '3%' : '-3%', animation: `ct-cam 2.8s ${HIT - 0.45}s cubic-bezier(.4,0,.2,1) both` } : {}) } as CSSProperties}>
          <div aria-hidden='true' className='absolute inset-x-[5%] bottom-[5%] h-[16%] rounded-[50%] blur-md'
            style={{ background: 'radial-gradient(closest-side, rgba(0,0,0,.7), rgba(0,0,0,0))' }} />
          <div ref={plane} className='absolute bottom-[10%] left-[4%] w-[92%]'
            style={{ aspectRatio: `${CW} / ${CH}`, transformOrigin: '50% 100%', transform: 'rotateX(44deg)', transformStyle: 'preserve-3d' }}>
            <svg viewBox={`0 0 ${CW} ${CH}`} className='absolute inset-0 block size-full overflow-visible' aria-hidden='true'>
              <Ice row={row} colors={colors} logo={logo} />
              {shots.map(({ p, at }) => {
                const goal = p.scoring, on = tick?.id === p.id
                return (
                  <circle key={p.id} cx={X(at.x)} cy={X(at.y)} r={goal ? 2.9 : 1.7} fill={colorOf(p.team)} fillOpacity={goal ? 1 : 0.6}
                    stroke={goal ? '#fff' : 'rgba(0,0,0,.35)'} strokeWidth={goal ? 1.3 : 0.5}
                    style={on ? { filter: `drop-shadow(0 0 3px ${color})` } : undefined} />
                )
              })}
              {go && tick && (
                <circle key={`r${animKey}`} cx={X(originOf(tick, left).x)} cy={X(originOf(tick, left).y)} r='4' fill='none' stroke={color} strokeWidth='1.6' opacity='0'
                  style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: 'fm-ripple .9s ease-out' }} />
              )}
            </svg>
            <Crowd k={k} colors={colors} cheer={go ? { key: animKey, color } : null} />
            <Net k={k} left bulge={go && left ? animKey : null} />
            <Net k={k} left={false} bulge={go && !left ? animKey : null} />
            <Light k={k} left on={go && left ? animKey : null} />
            <Light k={k} left={false} on={go && !left ? animKey : null} />
            {go && tick && <Puck key={animKey} k={k} from={originOf(tick, left)} to={netOf(left)} />}
            {/* the near boards */}
            <div aria-hidden='true' className='absolute inset-x-[7%] top-full h-2.5 rounded-b-[3px]'
              style={{ transformOrigin: '50% 0', transform: 'rotateX(-90deg)', background: `linear-gradient(#f3f5f8 0 55%, ${colors.home} 55% 75%, #e9c33c 75%)` }} />
          </div>
        </div>
        <Jumbotron row={row} tick={tick} animKey={animKey} animate={go} color={color} />
      </div>

      <div className='px-4'>
        {n > 0 && (
          <div className='flex gap-1.5' role='group' aria-label='Latest goals'>
            {goals.map((p, i) => (
              <button key={p.id} type='button' disabled={i >= shown}
                onClick={() => { if (pick === i) setTaps((t) => t + 1); else setPick(i) }}
                aria-label={`Goal ${i + 1}: ${rinkLabel(p)}`} aria-pressed={pick === i}
                className='flex h-6 flex-1 items-center disabled:cursor-default'>
                <span className={cn('h-[3px] w-full rounded-full transition-colors duration-500', i >= shown && 'bg-muted', pick === i && 'bg-devig')}
                  style={i < shown && pick !== i ? { background: colorOf(p.team), boxShadow: '0 0 0 .5px rgba(255,255,255,.35)' } : undefined} />
              </button>
            ))}
          </div>
        )}
        <div className='flex min-h-14 items-center gap-3 pt-1' aria-live='polite'>
          {tick && (
            <span className='grid size-9 shrink-0 place-items-center rounded-full font-display text-[15px] font-extrabold text-white'
              style={{ background: colorOf(tick.team), boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,.35)' }}>
              {tick.strength === 'PP' ? 'PPG' : tick.strength === 'SH' ? 'SHG' : tick.strength === 'EN' ? 'ENG' : 'G'}
            </span>
          )}
          <div className='min-w-0 flex-1'>
            <div className='text-[11px] font-semibold text-muted-foreground tabular-nums'>
              {tick ? `${tick.team ?? ''} · ${when(tick)} · ${scoreAfter(tick, row.away, row.home)}` : n ? `The last ${n} goals` : live ? 'No goals yet' : 'No goals'}
            </div>
            <div className='line-clamp-2 text-[15px] leading-snug font-bold'>
              {tick ? <>{rinkLabel(tick)}{assists.length > 0 && <span className='font-medium text-muted-foreground'> · from {assists.join(', ')}</span>}</> : n ? 'Puck drop…' : 'Every shot on goal so far'}
            </div>
          </div>
          {mv && <Pill d={mv.delta} className='min-w-[54px]' />}
        </div>
        <div className='flex items-center justify-between gap-2 pt-1 pb-3 text-xs text-muted-foreground'>
          <span className='flex min-w-0 items-center gap-2 truncate tabular-nums'>
            <span>Shots</span>
            <span className='flex items-center gap-1'><i aria-hidden='true' className='size-2 rounded-full' style={{ background: colors.away }} />{row.away} {sog.away}</span>
            <span className='flex items-center gap-1'><i aria-hidden='true' className='size-2 rounded-full' style={{ background: colors.home }} />{row.home} {sog.home}</span>
            {mv && <span className='truncate'>· {mv.before}¢ → {mv.after}¢</span>}
          </span>
          {!reduce && n > 0 && (
            <button type='button' onClick={replay} disabled={!done} aria-label='Replay the goals'
              className='-me-2 grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40'>
              <RotateCcw className='size-4' aria-hidden='true' />
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

// a point standing up off the ice: children drawn upright, facing the camera
function Upright({ k, at, z = 0, children }: { k: number; at: Pt; z?: number; children: ReactNode }) {
  return (
    <div aria-hidden='true' className='pointer-events-none absolute size-0' style={{ left: at.x * k, top: at.y * k, transformStyle: 'preserve-3d' }}>
      <div className='absolute bottom-0 left-0' style={{ transform: `translateZ(${z * k}px) translateX(-50%) rotateX(-${LEAN}deg)`, transformOrigin: '50% 100%' }}>
        {children}
      </div>
    </div>
  )
}

// the net, seen from the side: red posts and crossbar, white mesh to the back; it bulges when the puck goes in
function Net({ k, left, bulge }: { k: number; left: boolean; bulge: string | null }) {
  const w = Math.max(14, 5 * k * 2.2), h = Math.max(12, 4 * k * 2.2)
  return (
    <Upright k={k} at={{ x: left ? RINK.goal - 1.4 : RINK.w - RINK.goal + 1.4, y: 42.5 }}>
      <svg viewBox='0 0 10 8' width={w} height={h} className='block overflow-visible' style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,.5))' }}>
        <g transform={left ? undefined : 'translate(10 0) scale(-1 1)'}>
          <g key={bulge ?? 'still'} style={bulge ? { transformBox: 'fill-box', transformOrigin: '100% 100%', animation: `rk-net .7s ${HIT}s ease-out` } : undefined}>
            <path d='M8.6 .8 Q2.6 .6 1.2 4.6 L1.6 8 H8.6' fill='rgba(255,255,255,.55)' stroke='#fff' strokeWidth='.25' />
            <path d='M2 6 H8.6 M2.6 4 H8.6 M4.4 2 H8.6 M3.4 1.6 V8 M5.2 1 V8 M7 .9 V8' stroke='#fff' strokeOpacity='.8' strokeWidth='.15' fill='none' />
          </g>
          <path d='M8.6 8 V.8 Q4.6 .6 3 1.6' stroke={RED} strokeWidth='.6' fill='none' strokeLinecap='round' />
          <path d='M1.2 8 H8.6' stroke={RED} strokeWidth='.5' strokeLinecap='round' />
        </g>
      </svg>
    </Upright>
  )
}

// the goal light on the glass behind each net: flashes red on a goal, rings spreading from it
function Light({ k, left, on }: { k: number; left: boolean; on: string | null }) {
  return (
    <Upright k={k} at={{ x: left ? 2.5 : RINK.w - 2.5, y: 38 }} z={7}>
      <div key={on ?? 'off'} className='relative grid place-items-center' style={{ width: 14, height: 12 }}>
        {on && [0, 1].map((i) => (
          <span key={i} className='absolute size-3 rounded-full border-2 border-[#ff4b4b] opacity-0'
            style={{ animation: `fm-ripple 1s ${HIT + 0.05 + i * 0.45}s ease-out` }} />
        ))}
        <span className='h-[9px] w-[11px] rounded-t-full border border-black/50'
          style={{ background: '#5a1717', ...(on ? { animation: `rk-light 2.4s ${HIT}s both` } : {}) }} />
      </div>
    </Upright>
  )
}

// the puck: off the stick from where the shot was taken, a little lift, into the net; ghosts trail it
function Puck({ k, from, to }: { k: number; from: Pt; to: Pt }) {
  const puck = useRef<HTMLDivElement>(null)
  const ghosts = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)]
  const d = 8
  useEffect(() => {
    const dist = Math.hypot(to.x - from.x, to.y - from.y)
    const lift = Math.min(3.2, 0.6 + dist * 0.05)
    const pos: { x: number; y: number; z: number; o: number }[] = []
    for (let i = 0; i <= 12; i++) {
      const t = i / 12
      pos.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, z: 4 * lift * t * (1 - t) + 1.4 * t, o: (HIT / 1.4) * t })
    }
    const back = to.x < 100 ? -1.6 : 1.6
    pos.push({ x: to.x + back, y: to.y, z: 1.6, o: (HIT + 0.1) / 1.4 }, { x: to.x + back, y: to.y, z: 0.3, o: 0.8 }, { x: to.x + back, y: to.y, z: 0.3, o: 1 })
    const up = Math.sin((LEAN * Math.PI) / 180), back3 = -Math.cos((LEAN * Math.PI) / 180)
    const tf = (p: { x: number; y: number; z: number }) => `translate3d(${p.x * k - d / 2}px, ${(p.y + p.z * back3) * k - d / 2}px, ${p.z * up * k}px) rotateX(-44deg)`
    const opts = { duration: 1400, easing: 'linear', fill: 'both' as const }
    const frames = (fade: number) => pos.map((p, i) => ({ transform: tf(p), offset: p.o, opacity: i >= pos.length - 1 ? 0 : fade }))
    const a = puck.current?.animate(frames(1), opts)
    const g = ghosts.map((r, i) => r.current?.animate(frames(0.4 - i * 0.12).map((f, j) => (j > 12 ? { ...f, opacity: 0 } : f)), { ...opts, delay: (i + 1) * 40 }))
    return () => { a?.cancel(); g.forEach((x) => x?.cancel()) }
  }, [k, from.x, from.y, to.x, to.y]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      {ghosts.map((r, i) => (
        <div key={i} ref={r} aria-hidden='true' className='pointer-events-none absolute top-0 left-0 rounded-full bg-white blur-[1.5px]' style={{ width: d, height: d * 0.6, opacity: 0 }} />
      ))}
      <div ref={puck} aria-hidden='true' className='pointer-events-none absolute top-0 left-0 rounded-[50%]'
        style={{ width: d, height: d * 0.6, opacity: 0, background: 'radial-gradient(circle at 40% 30%, #3a3f48, #07080a 70%)', boxShadow: '0 0 0 .6px rgba(255,255,255,.5), 0 0 5px rgba(255,255,255,.6)' }} />
    </>
  )
}

// fans behind the far glass: the scoring team's jump
function Crowd({ k, colors, cheer }: { k: number; colors: { away: string; home: string }; cheer: { key: string; color: string } | null }) {
  const fans = useMemo(() => Array.from({ length: 105 }, (_, i) => {
    const r = Math.sin(i * 12.9898) * 43758.5453, f = r - Math.floor(r)
    const row = i % 3
    return { row, x: 18 + (Math.floor(i / 3) + row * 0.33) * (164 / 35), team: f < 0.55 ? 'home' : f < 0.72 ? 'away' : 'none', delay: (f * 260) | 0 }
  }), [])
  const tone = { home: colors.home, away: colors.away, none: '#4a5262' }
  const fw = Math.max(5, 4.2 * k)
  return (
    <div aria-hidden='true' className='pointer-events-none absolute top-0 left-0' style={{ width: RINK.w * k, height: 0, transformStyle: 'preserve-3d' }}>
      <div key={cheer?.key ?? 'quiet'} className='absolute bottom-0 left-0' style={{ width: RINK.w * k, height: 7 * fw, transform: `translateY(-1px) rotateX(-${LEAN}deg)`, transformOrigin: '50% 100%' }}>
        {/* the glass */}
        <div className='absolute inset-x-[9%] bottom-0 h-[30%] rounded-t-[3px] border-t border-white/50' style={{ background: 'linear-gradient(rgba(255,255,255,.14), rgba(255,255,255,.02))' }} />
        {fans.map((f, i) => {
          const c = tone[f.team as 'home'], on = !!cheer && c === cheer.color
          return (
            <span key={i} className='absolute flex flex-col items-center' style={{ left: f.x * k, bottom: fw * (2.6 + (2 - f.row) * 1.15), width: fw,
              opacity: 1 - f.row * 0.22, filter: on ? `drop-shadow(0 0 3px ${c})` : undefined,
              animation: on ? `ct-cheer .5s ${HIT + f.delay / 1000}s 3 ease-out` : undefined }}>
              <span className='rounded-full' style={{ width: fw * 0.56, height: fw * 0.56, background: '#d9b08c', filter: `brightness(${0.55 + (f.delay % 5) * 0.12})` }} />
              <span className='rounded-t-full' style={{ width: fw, height: fw * 0.56, marginTop: 1, background: c }} />
            </span>
          )
        })}
      </div>
    </div>
  )
}

// the big screen over centre ice: the score; on a goal it strobes in that team's colour and calls it
function Jumbotron({ row, tick, animKey, animate, color }: { row: GameRow; tick: RinkPlay | null; animKey: string; animate: boolean; color: string }) {
  const who = tick ? rinkLabel(tick).split(' goal')[0].toUpperCase() : ''
  const how = tick?.strength === 'PP' ? 'POWER PLAY GOAL' : tick?.strength === 'SH' ? 'SHORTHANDED' : tick?.strength === 'EN' ? 'EMPTY NET' : 'SCORES'
  return (
    <div aria-hidden='true' className='absolute top-[3%] left-1/2 w-[42%] -translate-x-1/2'>
      <div className='absolute -top-3 left-[22%] h-3 w-px bg-white/25' />
      <div className='absolute -top-3 right-[22%] h-3 w-px bg-white/25' />
      <div className='relative overflow-hidden rounded-md border-2 border-[#262b35] bg-[#06080b] shadow-[0_6px_18px_rgba(0,0,0,.55)]' style={{ aspectRatio: '2.6 / 1' }}>
        <div className='absolute inset-0 opacity-60' style={{ background: 'radial-gradient(circle, rgba(255,255,255,.09) .8px, transparent 1.1px) 0 0 / 3px 3px' }} />
        {tick && animate ? (
          <div key={animKey}>
            <Score row={row} a={tick.team === row.away ? (tick.away_score ?? 1) - 1 : tick.away_score} h={tick.team === row.home ? (tick.home_score ?? 1) - 1 : tick.home_score}
              style={{ animation: `ct-in .1s ${HIT}s reverse both` }} />
            <Score row={row} a={tick.away_score} h={tick.home_score} style={{ animation: `ct-in .35s ${HIT + 2}s both` }} />
            <div className='absolute inset-0' style={{ background: color, animation: `ct-strobe 1.8s ${HIT}s both` }} />
            <div className='absolute inset-0 flex flex-col items-center justify-center bg-[#06080b]' style={{ animation: `ct-jumbo 2s ${HIT}s both` }}>
              <span className='font-display text-[28px] leading-none font-black text-white italic' style={{ textShadow: `0 0 10px ${color}, 0 0 22px #ff3b3b` }}>GOAL!</span>
              <span className='mt-0.5 w-full overflow-hidden text-center font-display text-[9px] font-black tracking-[.18em] whitespace-nowrap text-[#ffb547]'>
                <span className='inline-block' style={{ animation: `ct-marquee 2s ${HIT}s linear both` }}>{who} · {how}</span>
              </span>
            </div>
          </div>
        ) : (
          <Score row={row} a={tick ? tick.away_score : row.awayScore} h={tick ? tick.home_score : row.homeScore} />
        )}
      </div>
    </div>
  )
}

function Score({ row, a, h, style }: { row: GameRow; a: number | null | undefined; h: number | null | undefined; style?: CSSProperties }) {
  const sc = (v: number | null | undefined) => (v == null ? '–' : String(v))
  return (
    <div className='absolute inset-0 flex items-center justify-center gap-2 font-display text-[19px] font-black tracking-wider text-[#ffb547] tabular-nums'
      style={{ textShadow: '0 0 8px rgba(255,170,60,.6)', ...style }}>
      <span className='text-[11px] text-white/70'>{row.away}</span>
      {sc(a)}
      <span className='text-white/30'>–</span>
      {sc(h)}
      <span className='text-[11px] text-white/70'>{row.home}</span>
    </div>
  )
}

// the ice: boards with rounded corners, each attacking zone tinted in that team's colour with its code, the goal,
// blue and centre lines, the faceoff circles and dots, the creases
function Ice({ row, colors, logo }: { row: GameRow; colors: { away: string; home: string }; logo: string | null }) {
  const R = RINK.r * S
  const shape = `M${R} 0 H${CW - R} A${R} ${R} 0 0 1 ${CW} ${R} V${CH - R} A${R} ${R} 0 0 1 ${CW - R} ${CH} H${R} A${R} ${R} 0 0 1 0 ${CH - R} V${R} A${R} ${R} 0 0 1 ${R} 0Z`
  const vline = (x: number, c: string, w: number, o = 1) => <line x1={X(x)} x2={X(x)} y1='0' y2={CH} stroke={c} strokeWidth={w} strokeOpacity={o} />
  const circle = (x: number, y: number) => (
    <g key={`${x}-${y}`}>
      <circle cx={X(x)} cy={X(y)} r={15 * S} fill='none' stroke={RED} strokeWidth='1' strokeOpacity='.8' />
      <circle cx={X(x)} cy={X(y)} r='1.8' fill={RED} />
    </g>
  )
  const crease = (left: boolean) => {
    const gx = left ? RINK.goal : RINK.w - RINK.goal
    return <path d={`M${X(gx)} ${X(36.5)} A${6 * S} ${6 * S} 0 0 ${left ? 1 : 0} ${X(gx)} ${X(48.5)}Z`} fill='#8fc1ec' fillOpacity='.75' stroke={RED} strokeWidth='.8' />
  }
  return (
    <g>
      <defs>
        <clipPath id='rk-clip'><path d={shape} /></clipPath>
        <linearGradient id='rk-ice' x1='0' y1='0' x2='0' y2='1'>
          <stop offset='0' stopColor='#cdd9e3' /><stop offset='.55' stopColor='#eef3f7' /><stop offset='1' stopColor='#f7fafc' />
        </linearGradient>
        <filter id='rk-scratch' x='0' y='0' width='100%' height='100%'>
          <feTurbulence type='fractalNoise' baseFrequency='.9 .06' numOctaves='2' seed='3' />
          <feColorMatrix values='0 0 0 0 .55  0 0 0 0 .62  0 0 0 0 .7  0 0 0 .5 -.15' />
        </filter>
      </defs>
      <g clipPath='url(#rk-clip)'>
        <rect width={CW} height={CH} fill='url(#rk-ice)' />
        <rect width={CW} height={CH} filter='url(#rk-scratch)' opacity='.35' />
        <rect x='0' width={X(RINK.blue)} height={CH} fill={colors.away} opacity='.1' />
        <rect x={X(RINK.w - RINK.blue)} width={X(RINK.blue)} height={CH} fill={colors.home} opacity='.1' />
        <text transform={`translate(${X(50)} ${X(42.5)}) rotate(-90)`} textAnchor='middle' dominantBaseline='central' fill={colors.away} fillOpacity='.28'
          fontSize='15' fontWeight='900' letterSpacing='2' fontFamily='var(--font-display)'>{row.away}</text>
        <text transform={`translate(${X(150)} ${X(42.5)}) rotate(90)`} textAnchor='middle' dominantBaseline='central' fill={colors.home} fillOpacity='.28'
          fontSize='15' fontWeight='900' letterSpacing='2' fontFamily='var(--font-display)'>{row.home}</text>
        {vline(RINK.goal, RED, 0.8)}
        {vline(RINK.w - RINK.goal, RED, 0.8)}
        {vline(RINK.blue, BLUE, X(1))}
        {vline(RINK.w - RINK.blue, BLUE, X(1))}
        {vline(100, RED, X(1), 0.9)}
        {logo && <image href={logo} x={CW / 2 - 15} y={CH / 2 - 15} width='30' height='30' opacity='.45' preserveAspectRatio='xMidYMid meet' />}
        <circle cx={X(100)} cy={X(42.5)} r={15 * S} fill='none' stroke={BLUE} strokeWidth='1' />
        {[[31, 20.5], [31, 64.5], [169, 20.5], [169, 64.5]].map(([x, y]) => circle(x, y))}
        {[[80, 20.5], [80, 64.5], [120, 20.5], [120, 64.5]].map(([x, y]) => <circle key={`d${x}${y}`} cx={X(x)} cy={X(y)} r='1.8' fill={RED} />)}
        {crease(true)}
        {crease(false)}
      </g>
      <path d={shape} fill='none' stroke='#f7f9fb' strokeWidth='3' />
      <path d={shape} fill='none' stroke='#e2b93a' strokeWidth='1' strokeOpacity='.9' />
    </g>
  )
}
