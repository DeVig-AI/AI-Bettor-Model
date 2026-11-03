import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { type GameRow } from '@/lib/devig'
import { biggestMoves, periodLabel, useFieldPlays, usePriceLine, type Move } from '@/lib/field'
import { type CourtPlay, assistOf, courtLabel, courtMoves, recentBuckets, scoreAfter } from '@/lib/court-math'
import { teamLogo } from '@/lib/logos'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { TeamLogo } from '@/components/team-logo'
import { isPick } from '../games/plate'
import { Pill, useReducedMotion } from './field'
import { Confetti } from './confetti'

// A tilted 3D full court, one standing hoop per team (away shoots left, home right, each paint in its team's colour).
// The latest buckets play back one after another: the ball flies from where the shot was taken through that team's
// net, the camera leans in, +2 / +3 pops over the rim, the floor lights up (a three traces its arc and rains
// confetti, a dunk shakes the rim), the scoring team's fans jump, and the big screen over centre court calls it.
// Under the court, the play and what Kalshi's price did around it. Then the plays that moved the price most this
// game. NBA and men's college basketball (CBB: halves, the college three-point line and lane), during and after a
// game. With reduced motion, the court is still and the last bucket is shown.

const S = 3.5 // px per foot
const CW = 94 * S, CH = 50 * S
const X = (x: number) => x * S
const Y = (y: number) => y * S
const LINE = 'rgba(255,255,255,.85)'
const HOOPS = ['NBA', 'CBB']

// the lines that differ, in feet: the three-point arc's radius, how far in from the sideline its corners run, where
// the arc meets the corner lines (from the baseline), and half the lane's width
type Lines = { arc: number; corner: number; straight: number; lane: number }
const NBA_LINES: Lines = { arc: 23.75, corner: 3, straight: 14.2, lane: 8 }
const CBB_LINES: Lines = { arc: 22.146, corner: 3.35, straight: 9.91, lane: 6 }
const linesOf = (sport: string) => (sport === 'CBB' ? CBB_LINES : NBA_LINES)
const threePath = (f: (x: number) => number, sw: number, L: Lines) =>
  `M${f(0)} ${Y(L.corner)} H${f(L.straight)} A${L.arc * S} ${L.arc * S} 0 0 ${sw} ${f(L.straight)} ${Y(50 - L.corner)} H${f(0)}`

export function CourtMovers({ row }: { row: GameRow }) {
  const plays = useFieldPlays(row)
  const prices = usePriceLine(row)
  if (!HOOPS.includes(row.sport) || row.state === 'pre') return null
  if (plays.isLoading) return <Skeleton className='h-[330px] w-full rounded-2xl' />
  const feed = plays.data as unknown as { plays?: CourtPlay[]; run?: { team: string; points: number } } | undefined
  if (!feed?.plays?.length) return null
  return <Body row={row} plays={feed.plays} run={feed.run ?? null} points={prices.data ?? []} />
}

function Body({ row, plays, run, points }: { row: GameRow; plays: CourtPlay[]; run: { team: string; points: number } | null; points: [number, number][] }) {
  // whose price we follow: DeVig's pick if it made one, else the home team (Kalshi's market is the home team's)
  const side: 'home' | 'away' = isPick(row) && row.pick?.side === row.away ? 'away' : 'home'
  const sideCode = side === 'home' ? row.home : row.away
  const moves = useMemo(() => courtMoves(plays, points, side), [plays, points, side])
  const byId = useMemo(() => new Map(moves.map((m) => [m.play.id, m])), [moves])
  const buckets = useMemo(() => recentBuckets(plays), [plays])
  const big = useMemo(() => biggestMoves(moves), [moves])
  return (
    <>
      {buckets.length > 0 && <CourtCard row={row} buckets={buckets} byId={byId} run={run} />}
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
            Kalshi&apos;s price for {sideCode} just before each play and a minute or so after. The price can move on other news too.
          </p>
        </section>
      )}
    </>
  )
}

const when = (p: CourtPlay, sport: string) => (p.q ? `${periodLabel(p.q, sport)} ${p.clock}` : p.clock)
const playText = (p: CourtPlay) => { const a = assistOf(p); return a ? `${courtLabel(p)} · ${a} assist` : courtLabel(p) }

function MoveRow({ row, m }: { row: GameRow; m: Move<CourtPlay> }) {
  const team = m.play.team ?? row.home
  const tid = team === row.away ? row.ids?.away : team === row.home ? row.ids?.home : null
  return (
    <li className='flex items-center gap-3 border-b border-border px-3.5 py-2.5 last:border-b-0'>
      <Pill d={m.delta} className='w-[60px]' />
      <span className='min-w-0 flex-1'>
        <span className='block truncate text-sm font-semibold'>{courtLabel(m.play)}</span>
        <span className='block font-condensed text-xs text-muted-foreground tabular-nums'>
          {when(m.play, row.sport)} · {m.before}¢ → {m.after}¢
        </span>
      </span>
      <TeamLogo sport={row.sport} code={team} id={tid} px={64} className='size-6' />
    </li>
  )
}

// where things are, in feet: the court runs 0-94 left to right (x) and 0-50 far sideline to near (y); away shoots
// at the left basket, home at the right
type Pt = { x: number; y: number }
const rimOf = (left: boolean): Pt => ({ x: left ? 5.25 : 94 - 5.25, y: 25 })
// where the bucket came from: ESPN's spot (x across, y out from the baseline) turned onto this end, the free-throw
// line for a free throw, 12 ft out when ESPN has no spot
function originOf(p: CourtPlay, left: boolean): Pt {
  const s = p.shot
  const out = s ? s.y : /free throw/i.test(p.text) ? 19 : 12
  const across = s ? s.x : 25
  return { x: left ? out : 94 - out, y: left ? across : 50 - across }
}
const kindOf = (p: CourtPlay) => (/free throw/i.test(p.text) ? 'ft' : p.pts >= 3 ? 'three' : /dunk/i.test(p.text) ? 'dunk' : 'two')
const CALL = { three: 'FROM DOWNTOWN', dunk: 'SLAM!', ft: 'AT THE LINE', two: 'FOR TWO' }

const HIT = 0.8 // seconds until the ball goes through
// "up" off the floor. The camera looks down at the court, so true verticals all but vanish; standing things lean
// toward it by this much instead (90 would be straight up)
const LEAN = 52
const UPY = -Math.cos((LEAN * Math.PI) / 180), UPZ = Math.sin((LEAN * Math.PI) / 180)
const STEP = 3000

function CourtCard({ row, buckets, byId, run }: { row: GameRow; buckets: CourtPlay[]; byId: Map<string, Move<CourtPlay>>; run: { team: string; points: number } | null }) {
  const reduce = useReducedMotion()
  const n = buckets.length
  const newestId = buckets[n - 1].id
  // how many buckets have played; on first look (or Replay) it counts up from 0, a new bucket just plays itself
  const [shown, setShown] = useState(reduce ? n : 0)
  const [pick, setPick] = useState<number | null>(null)
  const [taps, setTaps] = useState(0) // replays the picked bucket when tapped again
  const [runK, setRunK] = useState(0)
  const seen = useRef(newestId)
  useEffect(() => {
    if (seen.current === newestId) return
    seen.current = newestId
    setShown(reduce ? n : n - 1)
    setPick(null)
  }, [newestId, n, reduce])
  useEffect(() => {
    if (reduce) { setShown(n); return }
    if (shown >= n) return
    const t = setTimeout(() => setShown((s) => Math.min(n, s + 1)), shown === 0 ? 450 : STEP)
    return () => clearTimeout(t)
  }, [shown, n, reduce, runK])
  const replay = () => { setPick(null); setShown(0); setRunK((r) => r + 1) }

  // feet to pixels on the court as drawn
  const plane = useRef<HTMLDivElement>(null)
  const [k, setK] = useState(3.5)
  useEffect(() => {
    const el = plane.current
    if (!el) return
    const ro = new ResizeObserver(() => setK(el.clientWidth / 94 || 3.5))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const colors = row.colors ?? { away: '#5b6472', home: '#5b6472' }
  const colorOf = (team: string | null) => (team === row.away ? colors.away : colors.home)
  const cur = pick ?? shown - 1
  const tick = cur < 0 ? null : buckets[cur]
  const mv = tick ? byId.get(tick.id) : undefined
  const live = row.state === 'in'
  const done = shown >= n
  const latest = buckets[n - 1]
  const score = scoreAfter(tick ?? latest, row.away, row.home)
  const logo = teamLogo(row.sport, row.home, row.ids?.home, 128)
  const animKey = tick ? `${tick.id}-${runK}-${taps}` : 'none'
  const go = !!tick && !reduce
  const left = tick ? tick.team === row.away : true
  const kind = tick ? kindOf(tick) : 'two'
  const color = tick ? colorOf(tick.team) : '#fff'
  const label = `3D court: ${row.away} shoots at the left basket, ${row.home} at the right. The last ${n} buckets, newest: ${playText(latest)}.`

  return (
    <section aria-label={live ? 'Latest buckets' : 'Last buckets'} className='overflow-hidden rounded-2xl bg-card'>
      <div role='img' aria-label={label} className='relative mx-auto w-full max-w-[420px] overflow-hidden'
        style={{ aspectRatio: `${CW + 32} / 280`, perspective: 820, perspectiveOrigin: '50% -10%',
          background: 'radial-gradient(120% 90% at 50% 0%, color-mix(in oklab, var(--muted) 70%, #3a2a1a) 0%, var(--card) 62%)' }}>
        {/* the camera leans toward the basket, and a dunk shakes it */}
        <div key={go ? animKey : 'still'} className='absolute inset-0' style={{ transformStyle: 'preserve-3d',
          ...(go ? { ['--dx' as string]: left ? '5%' : '-5%', animation: `ct-cam 2.7s ${HIT - 0.5}s cubic-bezier(.4,0,.2,1) both` } : {}) } as CSSProperties}>
          <div className='absolute inset-0' style={{ transformStyle: 'preserve-3d', ...(go && kind === 'dunk' ? { animation: `ct-shake .4s ${HIT}s` } : {}) }}>
            <div aria-hidden='true' className='absolute inset-x-[6%] bottom-[5%] h-[16%] rounded-[50%] blur-md'
              style={{ background: 'radial-gradient(closest-side, rgba(0,0,0,.7), rgba(0,0,0,0))' }} />
            <div ref={plane} className='absolute bottom-[9%] left-[4.5%] w-[91%]'
              style={{ aspectRatio: `${CW} / ${CH}`, transformOrigin: '50% 100%', transform: 'rotateX(42deg)', transformStyle: 'preserve-3d' }}>
              <svg viewBox={`0 0 ${CW} ${CH}`} className='absolute inset-0 block size-full' aria-hidden='true'>
                <Floor row={row} colors={colors} logo={logo} />
                {go && <Glow key={animKey} p={tick!} left={left} kind={kind} color={color} L={linesOf(row.sport)} />}
              </svg>
              <Crowd k={k} colors={colors} cheer={go ? { key: animKey, color } : null} />
              <Hoop k={k} left dunk={go && left && kind === 'dunk' ? animKey : null} swish={go && left ? animKey : null} />
              <Hoop k={k} left={false} dunk={go && !left && kind === 'dunk' ? animKey : null} swish={go && !left ? animKey : null} />
              {go && <Ball key={animKey} k={k} from={originOf(tick!, left)} to={rimOf(left)} />}
              {go && <Pop key={`p${animKey}`} k={k} at={{ x: rimOf(left).x + (left ? 9 : -9), y: 25 }} pts={tick!.pts} color={color} />}
              <div aria-hidden='true' className='absolute inset-x-0 top-full h-2.5 rounded-b-[3px]'
                style={{ transformOrigin: '50% 0', transform: 'rotateX(-90deg)', background: 'linear-gradient(#6b4422, #2e1c0c)' }} />
            </div>
          </div>
        </div>
        <Jumbotron row={row} tick={tick} animKey={animKey} animate={go} color={color} kind={kind} />
        {go && kind === 'three' && <Confetti key={`c${animKey}`} color={color} delay={HIT} className='top-[17%]' />}
      </div>

      <div className='px-4'>
        <div className='flex gap-1.5' role='group' aria-label='Latest buckets'>
          {buckets.map((p, i) => (
            <button key={p.id} type='button' disabled={i >= shown}
              onClick={() => { if (pick === i) setTaps((t) => t + 1); else setPick(i) }}
              aria-label={`Bucket ${i + 1}: ${playText(p)}`} aria-pressed={pick === i}
              className='flex h-6 flex-1 items-center disabled:cursor-default'>
              <span className={cn('h-[3px] w-full rounded-full transition-colors duration-500', i >= shown && 'bg-muted', pick === i && 'bg-devig')}
                style={i < shown && pick !== i ? { background: colorOf(p.team), boxShadow: '0 0 0 .5px rgba(255,255,255,.35)' } : undefined} />
            </button>
          ))}
        </div>
        <div className='flex min-h-14 items-center gap-3' aria-live='polite'>
          {tick && (
            <span className='grid size-9 shrink-0 place-items-center rounded-full font-display text-lg font-extrabold text-white'
              style={{ background: colorOf(tick.team), boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,.35)' }}>
              +{tick.pts}
            </span>
          )}
          <div className='min-w-0 flex-1'>
            <div className='text-[11px] font-semibold text-muted-foreground tabular-nums'>
              {tick ? `${tick.team ?? ''} · ${when(tick, row.sport)} · ${score}` : `The last ${n} buckets`}
            </div>
            <div className='line-clamp-2 text-[15px] leading-snug font-bold'>{tick ? playText(tick) : 'Tip-off…'}</div>
          </div>
          {mv && <Pill d={mv.delta} className='min-w-[54px]' />}
        </div>
        <div className='flex items-center justify-between gap-2 pt-1 pb-3 text-xs text-muted-foreground'>
          <span className='truncate tabular-nums'>
            {mv ? `${mv.before}¢ → ${mv.after}¢ around this bucket` : run && live ? `${run.team} on a ${run.points}-0 run` : `Tap a bar to replay a bucket`}
          </span>
          {!reduce && (
            <button type='button' onClick={replay} disabled={!done} aria-label='Replay the buckets'
              className='-me-2 grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40'>
              <RotateCcw className='size-4' aria-hidden='true' />
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

// a point standing up off the floor: children are drawn upright (facing the camera), `z` feet above the spot
function Upright({ k, at, z = 0, face = -42, children }: { k: number; at: Pt; z?: number; face?: number; children: ReactNode }) {
  return (
    <div aria-hidden='true' className='pointer-events-none absolute size-0' style={{ left: at.x * k, top: at.y * k, transformStyle: 'preserve-3d' }}>
      <div className='absolute bottom-0 left-0' style={{ transform: `translateZ(${z * k}px) translateX(-50%) rotateX(${face}deg)`, transformOrigin: '50% 100%' }}>
        {children}
      </div>
    </div>
  )
}

// the ball: up from where the shot was taken, over to the rim, down through the net, one bounce. Its shadow
// follows on the floor.
function Ball({ k, from, to }: { k: number; from: Pt; to: Pt }) {
  const ball = useRef<HTMLDivElement>(null), shade = useRef<HTMLDivElement>(null)
  const ghosts = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)]
  const d = Math.max(10, 3.4 * k)
  useEffect(() => {
    const dist = Math.hypot(to.x - from.x, to.y - from.y)
    const z0 = 7, zr = 10, apex = zr + Math.min(10, 2 + dist * 0.3)
    const c = 2 * apex - (z0 + zr) / 2
    const pos: { x: number; y: number; z: number; o: number }[] = []
    for (let i = 0; i <= 14; i++) { // the flight
      const t = i / 14, u = 1 - t
      pos.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t + 0.6 * t, z: u * u * z0 + 2 * t * u * c + t * t * zr, o: 0.55 * i / 14 })
    }
    const at = { x: to.x, y: to.y + 0.6 }
    pos.push({ ...at, z: 8.4, o: 0.62 }, { ...at, z: 0.4, o: 0.75 }, { ...at, z: 2.2, o: 0.85 }, { ...at, z: 0.4, o: 0.93 })
    const tf = (p: { x: number; y: number; z: number }, r: number) =>
      `translate3d(${p.x * k - d / 2}px, ${(p.y + p.z * UPY) * k - d / 2}px, ${p.z * UPZ * k}px) rotateX(-42deg) rotate(${r}deg)`
    const opts = { duration: 1450, easing: 'linear', fill: 'both' as const }
    const frames = (fade: number) => pos.map((p, i) => ({ transform: tf(p, i * 40), offset: p.o, opacity: i === pos.length - 1 ? 0 : fade }))
    const a = ball.current?.animate(frames(1), opts)
    const g = ghosts.map((r, i) => r.current?.animate(frames(0.32 - i * 0.09).map((f, j) => (j > 14 ? { ...f, opacity: 0 } : f)), { ...opts, delay: (i + 1) * 45 }))
    const b = shade.current?.animate(pos.map((p, i) => ({ transform: `translate(${p.x * k - d / 2}px, ${p.y * k - d / 2}px) scale(${Math.max(0.35, 1 - p.z / 22)})`,
      offset: p.o, opacity: i === pos.length - 1 ? 0 : 0.5 * Math.max(0.3, 1 - p.z / 22) })), opts)
    return () => { a?.cancel(); b?.cancel(); g.forEach((x) => x?.cancel()) }
  }, [k, d, from.x, from.y, to.x, to.y]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      {ghosts.map((r, i) => (
        <div key={i} ref={r} aria-hidden='true' className='pointer-events-none absolute top-0 left-0 rounded-full bg-[#ff9a3d] blur-[1px]' style={{ width: d, height: d, opacity: 0 }} />
      ))}
      <div ref={shade} aria-hidden='true' className='pointer-events-none absolute top-0 left-0 rounded-full bg-black blur-[1.5px]' style={{ width: d, height: d * 0.8, opacity: 0 }} />
      <div ref={ball} aria-hidden='true' className='pointer-events-none absolute top-0 left-0 rounded-full' style={{ width: d, height: d, opacity: 0,
        background: 'radial-gradient(circle at 35% 30%, #ffb066, #e06a12 58%, #8a3c08)', boxShadow: 'inset 0 0 0 .7px #3a1a05, 0 0 6px rgba(255,140,40,.7)' }}>
        <svg viewBox='0 0 10 10' className='size-full' aria-hidden='true'><path d='M0 5H10M5 0V10M1.6 1.6Q5 5 1.6 8.4M8.4 1.6Q5 5 8.4 8.4' stroke='#3a1a05' strokeWidth='.5' fill='none' /></svg>
      </div>
    </>
  )
}

// a hoop standing at each baseline, seen from the side: stanchion, backboard edge-on, rim and net
function Hoop({ k, left, dunk, swish }: { k: number; left: boolean; dunk: string | null; swish: string | null }) {
  const x0 = -5, w = 12, h = 14
  return (
    <div aria-hidden='true' className='pointer-events-none absolute size-0' style={{ left: left ? 0 : 94 * k, top: 25 * k, transformStyle: 'preserve-3d' }}>
      <svg viewBox={`${left ? x0 : -w - x0} ${-h} ${w} ${h}`} className='absolute bottom-0 overflow-visible'
        style={{ width: w * k, height: h * k, left: (left ? x0 : -w - x0) * k, transform: `rotateX(-${LEAN}deg)`, transformOrigin: '50% 100%', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,.6))' }}>
        <g transform={left ? undefined : 'scale(-1 1)'}>
          <rect x='-5' y='-2.4' width='3.8' height='2.4' rx='.4' fill='#232936' stroke='#3a4252' strokeWidth='.15' />
          <rect x='-3.6' y='-12.6' width='.9' height='10.6' rx='.2' fill='#c3cad5' />
          <path d='M-3.15 -12.2 L3.9 -11.6' stroke='#c3cad5' strokeWidth='.7' strokeLinecap='round' />
          <rect x='3.8' y='-13.8' width='.7' height='4.4' rx='.15' fill='#f4f6f9' stroke='#9aa3b0' strokeWidth='.12' />
          <g key={`r${dunk ?? ''}`} style={dunk ? { transformBox: 'view-box', transformOrigin: '4.5px -10px', animation: `ct-rim .6s ${HIT}s` } : undefined}>
            <line x1='4.5' x2='6.3' y1='-10' y2='-10' stroke='#ff6a1a' strokeWidth='.5' strokeLinecap='round' />
            <g key={`n${swish ?? ''}`} style={swish ? { transformBox: 'fill-box', transformOrigin: '50% 0', animation: `ct-net .7s ${HIT + 0.02}s ease-out` } : undefined}>
              <path d='M4.6 -10 L5 -7.9 L5.8 -7.9 L6.2 -10 M4.6 -10 L5.8 -7.9 M6.2 -10 L5 -7.9 M5.1 -10 L5.4 -7.9 M5.7 -10 L5.4 -7.9 M4.8 -9 H6'
                stroke='#fff' strokeOpacity='.9' strokeWidth='.16' fill='none' />
            </g>
          </g>
        </g>
      </svg>
    </div>
  )
}

// the crowd along the far sideline: the scoring team's fans jump
function Crowd({ k, colors, cheer }: { k: number; colors: { away: string; home: string }; cheer: { key: string; color: string } | null }) {
  const fans = useMemo(() => Array.from({ length: 90 }, (_, i) => {
    const r = Math.sin(i * 12.9898) * 43758.5453, f = r - Math.floor(r)
    const row = i % 3
    return { row, x: 1 + (Math.floor(i / 3) + row * 0.33) * (92 / 30), team: f < 0.55 ? 'home' : f < 0.7 ? 'away' : 'none', delay: (f * 260) | 0 }
  }), [])
  const tone = { home: colors.home, away: colors.away, none: '#4a5262' }
  return (
    <div aria-hidden='true' className='pointer-events-none absolute left-0 top-0' style={{ width: 94 * k, height: 0, transformStyle: 'preserve-3d' }}>
      <div key={cheer?.key ?? 'quiet'} className='absolute bottom-0 left-0' style={{ width: 94 * k, height: 9 * k, transform: `translateY(-2px) rotateX(-${LEAN}deg)`, transformOrigin: '50% 100%',
        background: 'linear-gradient(transparent, rgba(0,0,0,.35))' }}>
        {fans.map((f, i) => {
          const c = tone[f.team as 'home'], on = !!cheer && c === cheer.color
          return (
            <span key={i} className='absolute flex flex-col items-center' style={{ left: f.x * k, bottom: (0.3 + (2 - f.row) * 2.6) * k, width: 2.3 * k,
              opacity: 1 - f.row * 0.22, filter: on ? `drop-shadow(0 0 3px ${c})` : undefined,
              animation: on ? `ct-cheer .5s ${HIT + f.delay / 1000}s 3 ease-out` : undefined }}>
              <span className='rounded-full' style={{ width: 1.3 * k, height: 1.3 * k, background: '#d9b08c', filter: `brightness(${0.55 + (f.delay % 5) * 0.12})` }} />
              <span className='rounded-t-full' style={{ width: 2.3 * k, height: 1.3 * k, marginTop: 0.1 * k, background: c }} />
            </span>
          )
        })}
      </div>
    </div>
  )
}

// the floor lights up: a three traces its arc, a free throw its line, a two its paint; a ring where it was taken
function Glow({ p, left, kind, color, L }: { p: CourtPlay; left: boolean; kind: string; color: string; L: Lines }) {
  const f = (x: number) => (left ? X(x) : CW - X(x))
  const sw = left ? 1 : 0
  const o = originOf(p, left)
  const glow = { filter: `drop-shadow(0 0 3px ${color}) drop-shadow(0 0 6px ${color})` }
  return (
    <g>
      {p.shot && <circle cx={X(o.x)} cy={Y(o.y)} r='3' fill='none' stroke='#fff' strokeWidth='1.5' opacity='0'
        style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: 'fm-ripple .9s ease-out' }} />}
      {kind === 'three' && (
        <path d={threePath(f, sw, L)} pathLength={1}
          fill='none' stroke={color} strokeWidth='3' strokeLinecap='round' strokeDasharray='1'
          style={{ ...glow, animation: `ct-trace 2.2s ${HIT}s both` }} />
      )}
      {kind === 'ft' && (
        <g style={{ ...glow, opacity: 0, animation: `ct-glow 1.8s ${HIT}s both` }}>
          <path d={`M${f(19)} ${Y(25 - L.lane)} V${Y(25 + L.lane)}`} stroke='#fff' strokeWidth='3.2' strokeLinecap='round' />
          <path d={`M${f(19)} ${Y(19)} A${6 * S} ${6 * S} 0 0 ${sw} ${f(19)} ${Y(31)}`} fill='none' stroke='#fff' strokeWidth='2.4' />
        </g>
      )}
      {(kind === 'two' || kind === 'dunk') && (
        <rect x={Math.min(f(0), f(19))} y={Y(25 - L.lane)} width={X(19)} height={X(2 * L.lane)} fill='#fff' fillOpacity='.22' stroke='#fff' strokeWidth='2.6'
          style={{ ...glow, opacity: 0, animation: `ct-glow 1.8s ${HIT}s both` }} />
      )}
    </g>
  )
}

// over the hoop: +2 / +3 pops up (a three gets sparks)
function Pop({ k, at, pts, color }: { k: number; at: Pt; pts: number; color: string }) {
  const three = pts >= 3
  return (
    <Upright k={k} at={at} z={12}>
      <div className='relative grid place-items-center' style={{ animation: `ct-float 2.2s ${HIT}s both` }}>
        {three && Array.from({ length: 12 }, (_, i) => (
          <span key={i} className='absolute h-3 w-[2.5px] rounded-full'
            style={{ background: i % 2 ? '#fff' : color, ['--a' as string]: `${i * 30}deg`, animation: `ct-spark .8s ${HIT + 0.1}s ease-out both` } as CSSProperties} />
        ))}
        <span className='font-display leading-none font-black text-white italic tabular-nums'
          style={{ fontSize: three ? 44 : 34, textShadow: `0 0 14px ${color}, 0 0 2px #000, 0 3px 0 ${color}`, WebkitTextStroke: `1px ${color}`,
            animation: `ct-pop .7s ${HIT}s cubic-bezier(.2,.8,.3,1.2) both` }}>
          +{pts}
        </span>
      </div>
    </Upright>
  )
}

// the big screen over centre court: the score, and on a bucket it strobes in that team's colour and calls it
function Jumbotron({ row, tick, animKey, animate, color, kind }: { row: GameRow; tick: CourtPlay | null; animKey: string; animate: boolean; color: string; kind: string }) {
  const word = !tick ? '' : tick.pts >= 3 ? '3!!' : tick.pts === 2 ? '2!' : '+1'
  const who = tick ? courtLabel(tick).split(' ')[0].toUpperCase() : ''
  return (
    <div aria-hidden='true' className='absolute top-[3%] left-1/2 w-[46%] -translate-x-1/2'>
      <div className='absolute -top-3 left-[22%] h-3 w-px bg-white/25' />
      <div className='absolute -top-3 right-[22%] h-3 w-px bg-white/25' />
      <div className='relative overflow-hidden rounded-md border-2 border-[#262b35] bg-[#06080b] shadow-[0_6px_18px_rgba(0,0,0,.55)]'
        style={{ aspectRatio: '2.6 / 1' }}>
        <div className='absolute inset-0 opacity-60' style={{ background: 'radial-gradient(circle, rgba(255,255,255,.09) .8px, transparent 1.1px) 0 0 / 3px 3px' }} />
        {/* the score, LED amber: the old one while the ball flies, the new one once the screen calms down */}
        {tick && animate ? (
          <div key={animKey}>
            <Score row={row} a={tick.team === row.away ? (tick.away_score ?? 0) - tick.pts : tick.away_score} h={tick.team === row.home ? (tick.home_score ?? 0) - tick.pts : tick.home_score}
              style={{ animation: `ct-in .1s ${HIT}s reverse both` }} />
            <Score row={row} a={tick.away_score} h={tick.home_score} style={{ animation: `ct-in .35s ${HIT + 1.9}s both` }} />
            <div className='absolute inset-0' style={{ background: color, animation: `ct-strobe 1.7s ${HIT}s both` }} />
            <div className='absolute inset-0 flex flex-col items-center justify-center bg-[#06080b]' style={{ animation: `ct-jumbo 1.9s ${HIT}s both` }}>
              <span className='font-display text-[30px] leading-none font-black text-white italic'
                style={{ textShadow: `0 0 10px ${color}, 0 0 22px ${color}` }}>{word}</span>
              <span className='mt-0.5 w-full overflow-hidden text-center font-display text-[9px] font-black tracking-[.18em] whitespace-nowrap text-[#ffb547]'>
                <span className='inline-block' style={{ animation: `ct-marquee 1.9s ${HIT}s linear both` }}>{who} · {CALL[kind as 'two']}</span>
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

function Floor({ row, colors, logo }: { row: GameRow; colors: { away: string; home: string }; logo: string | null }) {
  const planks = Array.from({ length: 13 }, (_, i) => (i + 1) * (CH / 14))
  const ln = { stroke: LINE, strokeWidth: 1.3, fill: 'none' }
  return (
    <g>
      <defs>
        <linearGradient id='ct-wood' x1='0' y1='0' x2='1' y2='0'>
          <stop offset='0' stopColor='#b98249' /><stop offset='.5' stopColor='#d4a066' /><stop offset='1' stopColor='#b47d45' />
        </linearGradient>
        <filter id='ct-grain' x='0' y='0' width='100%' height='100%'>
          <feTurbulence type='fractalNoise' baseFrequency='1.2 .04' numOctaves='2' seed='7' />
          <feColorMatrix values='0 0 0 0 .25  0 0 0 0 .13  0 0 0 0 .04  0 0 0 .9 -.3' />
        </filter>
        <linearGradient id='ct-light' x1='0' y1='0' x2='0' y2='1'>
          <stop offset='0' stopColor='#000' stopOpacity='.32' /><stop offset='.5' stopColor='#fff' stopOpacity='.03' /><stop offset='1' stopColor='#fff' stopOpacity='.1' />
        </linearGradient>
      </defs>
      <rect width={CW} height={CH} fill='url(#ct-wood)' />
      <rect width={CW} height={CH} filter='url(#ct-grain)' opacity='.5' />
      {planks.map((y) => <line key={y} x1='0' x2={CW} y1={y} y2={y} stroke='#6e4220' strokeOpacity='.16' strokeWidth='.5' />)}
      {logo && <image href={logo} x={CW / 2 - 17} y={CH / 2 - 17} width='34' height='34' opacity='.3' preserveAspectRatio='xMidYMid meet' />}
      <End side='left' color={colors.away} code={row.away} L={linesOf(row.sport)} />
      <End side='right' color={colors.home} code={row.home} L={linesOf(row.sport)} />
      <rect width={CW} height={CH} fill='url(#ct-light)' />
      <rect x='1' y='1' width={CW - 2} height={CH - 2} rx='2' {...ln} strokeWidth='2' />
      <line x1={X(47)} x2={X(47)} y1='0' y2={CH} {...ln} />
      <circle cx={X(47)} cy={Y(25)} r={6 * S} {...ln} />
      <circle cx={X(47)} cy={Y(25)} r={2 * S} {...ln} strokeOpacity='.5' />
    </g>
  )
}

// one end: the paint in the team's colour with its name, the lines, the backboard and the rim
function End({ side, color, code, L }: { side: 'left' | 'right'; color: string; code: string; L: Lines }) {
  const f = (x: number) => (side === 'left' ? X(x) : CW - X(x))
  const sw = side === 'left' ? 1 : 0 // arcs bulge toward centre court
  const ln = { stroke: LINE, strokeWidth: 1.3, fill: 'none' }
  const rim = { x: f(5.25), y: Y(25) }
  return (
    <g>
      <rect x={Math.min(f(0), f(19))} y={Y(25 - L.lane)} width={X(19)} height={X(2 * L.lane)} fill={color} opacity='.88' />
      <text transform={`translate(${f(11.5)} ${Y(25)}) rotate(${side === 'left' ? -90 : 90})`} textAnchor='middle' dominantBaseline='central'
        fill='#fff' fillOpacity='.9' fontSize='17' fontWeight='900' letterSpacing='2' fontFamily='var(--font-display)'>{code}</text>
      <rect x={Math.min(f(0), f(19))} y={Y(25 - L.lane)} width={X(19)} height={X(2 * L.lane)} {...ln} />
      <path d={`M${f(19)} ${Y(19)} A${6 * S} ${6 * S} 0 0 ${sw} ${f(19)} ${Y(31)}`} {...ln} />
      <path d={`M${f(19)} ${Y(19)} A${6 * S} ${6 * S} 0 0 ${1 - sw} ${f(19)} ${Y(31)}`} {...ln} strokeDasharray='3 3' strokeOpacity='.55' />
      <path d={threePath(f, sw, L)} {...ln} strokeWidth='1.6' />
      <path d={`M${f(4)} ${Y(21)} H${rim.x} A${4 * S} ${4 * S} 0 0 ${sw} ${rim.x} ${Y(29)} H${f(4)}`} {...ln} strokeWidth='1' strokeOpacity='.8' />
      <ellipse cx={rim.x - (side === 'left' ? 1 : -1) * 0.5 * S} cy={rim.y + 0.6 * S} rx={1.6 * S} ry={1.1 * S} fill='#000' opacity='.22' />
    </g>
  )
}
