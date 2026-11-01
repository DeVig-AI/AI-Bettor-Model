import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, RotateCcw } from 'lucide-react'
import { type GameRow } from '@/lib/devig'
import {
  type FieldPlay, type Move, FOOTBALL, allMoves, biggestMoves, kindOf, latestDrive, playLabel, spotText,
  useFieldPlays, usePriceLine,
} from '@/lib/field'
import { teamLogo } from '@/lib/logos'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { TeamLogo } from '@/components/team-logo'
import { isPick } from '../games/plate'

// The latest drive on a tilted 3D field: each play draws in one after another, the ball follows, the line of
// scrimmage and the first-down line move, and the ticker under the field shows what Kalshi's price did around that
// play. Then the plays that moved the price most this game. NFL and college football, during and after a game.

const FW = 326, FH = 200, EZ = 26, PPY = (FW - 2 * EZ) / 100
const X = (spot: number) => EZ + Math.max(-2, Math.min(102, spot)) * PPY
const STEP_MS = 1500
const LOS = '#60a5fa', FD = '#f5e663', LOSS = '#ffa3a3', WIN = '#8ef0b4'

function useReducedMotion() {
  const [r, setR] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const m = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!m) return
    const on = () => setR(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return r
}

const lastWord = (s: string) => (s.trim().split(/\s+/).pop() ?? s).toUpperCase()

export function FieldMovers({ row }: { row: GameRow }) {
  const plays = useFieldPlays(row)
  const prices = usePriceLine(row)
  if (!FOOTBALL.includes(row.sport) || row.state === 'pre') return null
  if (plays.isLoading) return <Skeleton className='h-[330px] w-full rounded-2xl' />
  const feed = plays.data
  if (!feed?.plays?.length) return null
  return <Body row={row} plays={feed.plays} points={prices.data ?? []} />
}

function Body({ row, plays, points }: { row: GameRow; plays: FieldPlay[]; points: [number, number][] }) {
  // whose price we follow: DeVig's pick if it made one, else the home team (Kalshi's market is the home team's)
  const side: 'home' | 'away' = isPick(row) && row.pick?.side === row.away ? 'away' : 'home'
  const sideCode = side === 'home' ? row.home : row.away
  const moves = useMemo(() => allMoves(plays, points, side), [plays, points, side])
  const byId = useMemo(() => new Map(moves.map((m) => [m.play.id, m])), [moves])
  const drive = useMemo(() => latestDrive(plays), [plays])
  const big = useMemo(() => biggestMoves(moves), [moves])
  return (
    <>
      {drive.length > 0 && <DriveCard row={row} drive={drive} byId={byId} />}
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

function Pill({ d, className }: { d: number; className?: string }) {
  const up = d > 0, down = d < 0
  return (
    <span className={cn('inline-flex h-7 shrink-0 items-center justify-center gap-0.5 rounded-full px-2.5 font-condensed text-[15px] font-bold tabular-nums',
      up ? 'bg-good/15 text-good' : down ? 'bg-bad/15 text-bad' : 'bg-muted text-muted-foreground', className)}>
      {up ? <ArrowUp className='size-3.5' strokeWidth={2.5} aria-hidden='true' /> : down ? <ArrowDown className='size-3.5' strokeWidth={2.5} aria-hidden='true' /> : null}
      <span className='sr-only'>{up ? 'up' : down ? 'down' : 'no change,'} </span>
      {Math.abs(d)}¢
    </span>
  )
}

function MoveRow({ row, m }: { row: GameRow; m: Move }) {
  const team = m.play.team ?? row.home
  const tid = team === row.away ? row.ids?.away : team === row.home ? row.ids?.home : null
  return (
    <li className='flex items-center gap-3 border-b border-border px-3.5 py-2.5 last:border-b-0'>
      <Pill d={m.delta} className='w-[60px]' />
      <span className='min-w-0 flex-1'>
        <span className='block truncate text-sm font-semibold'>{playLabel(m.play)}</span>
        <span className='block font-condensed text-xs text-muted-foreground tabular-nums'>
          {m.play.q ? `Q${m.play.q > 4 ? 'OT' : m.play.q} ${m.play.clock}`.replace('QOT', 'OT') : m.play.clock} · {m.before}¢ → {m.after}¢
        </span>
      </span>
      <TeamLogo sport={row.sport} code={team} id={tid} px={64} className='size-6' />
    </li>
  )
}

function DriveCard({ row, drive, byId }: { row: GameRow; drive: FieldPlay[]; byId: Map<string, Move> }) {
  const reduce = useReducedMotion()
  const n = drive.length
  const key = String(drive[0].drive ?? drive[0].id)
  const firstId = drive[0].id
  // how many plays are drawn; on a new drive (or Replay) it counts up from 0, a new play on the same drive just adds one
  const [shown, setShown] = useState(reduce ? n : 0)
  const [pick, setPick] = useState<number | null>(null) // a play tapped on the progress bar
  const seen = useRef({ key, firstId })
  const [run, setRun] = useState(0)
  useEffect(() => {
    if (seen.current.key !== key) setShown(reduce ? n : 0)
    else if (seen.current.firstId !== firstId) setShown(reduce ? n : n - 1) // a long drive: the oldest play scrolled off
    else return
    seen.current = { key, firstId }
    setPick(null)
  }, [key, firstId, n, reduce])
  useEffect(() => {
    if (reduce) { setShown(n); return }
    if (shown >= n) return
    const t = setTimeout(() => setShown((s) => Math.min(n, s + 1)), shown === 0 ? 450 : STEP_MS)
    return () => clearTimeout(t)
  }, [shown, n, reduce, run])
  const replay = () => { setPick(null); setShown(0); setRun((r) => r + 1) }

  const offense = drive[0].team ?? drive[n - 1].team
  const cur = pick ?? shown - 1 // the play the ticker shows (-1: the drive's start)
  const last = drive[Math.max(0, shown - 1)]
  const los = shown === 0 ? drive[0].from! : last.to!
  const dir: 1 | -1 = offense === row.home ? -1 : 1 // the away team's goal line is on the left, so the away team drives right
  // the first-down line for the next snap: the next play's, or after the last one, its line or a new one if it got there
  const lastFd = last.fd == null ? undefined : (last.to! - last.fd) * dir >= 0 ? last.to! + 10 * dir : last.fd
  const fdNow = shown === 0 ? drive[0].fd : shown < n ? drive[shown].fd : kindOf(last) === 'score' || kindOf(last) === 'kick' || kindOf(last) === 'turnover' ? undefined : lastFd
  const gap = n > 1 ? Math.min(24, 132 / (n - 1)) : 0
  const y0 = n > 1 ? Math.max(34, (FH - (n - 1) * gap) / 2 - 4) : FH / 2
  const rowY = (i: number) => y0 + i * gap
  const ball = shown === 0 ? { x: X(drive[0].from!), y: rowY(0) } : { x: X(last.to!), y: rowY(shown - 1) }
  const colors = row.colors ?? { away: '#3a3f4b', home: '#3a3f4b' }
  const homeId = row.ids?.home
  const logo = teamLogo(row.sport, row.home, homeId, 128)
  const done = shown >= n

  const tick = cur < 0 ? null : drive[cur]
  const mv = tick ? byId.get(tick.id) : undefined
  const offName = offense ?? ''
  const startSpot = spotText(drive[0].from!, row.away, row.home)
  const ballSpot = spotText(drive[n - 1].to!, row.away, row.home)
  const live = row.state === 'in'
  const label = `3D field: ${offName}'s ${live ? 'current' : 'last'} drive, ${n} play${n === 1 ? '' : 's'} from the ${startSpot} to the ${ballSpot}.`

  return (
    <section aria-label={live ? 'The drive' : 'Last drive'} className='overflow-hidden rounded-2xl bg-card'>
      <div role='img' aria-label={label} className='relative mx-auto w-full max-w-[420px]'
        style={{ aspectRatio: `${FW + 32} / 218`, perspective: 820, perspectiveOrigin: '50% -20%',
          background: 'radial-gradient(120% 90% at 50% 0%, color-mix(in oklab, var(--muted) 70%, #1f2b3a) 0%, var(--card) 62%)' }}>
        <div aria-hidden='true' className='absolute inset-x-[8%] bottom-[9%] h-[21%] rounded-[50%] blur-md'
          style={{ background: 'radial-gradient(closest-side, rgba(0,0,0,.7), rgba(0,0,0,0))' }} />
        <div className='absolute top-[2.5%] left-[4.5%] w-[91%]'
          style={{ aspectRatio: `${FW} / ${FH}`, transformOrigin: '50% 100%', transform: 'rotateX(40deg)', transformStyle: 'preserve-3d' }}>
          <svg viewBox={`0 0 ${FW} ${FH}`} className='absolute inset-0 block size-full' aria-hidden='true'>
            <Turf away={lastWord(row.awayName)} home={lastWord(row.homeName)} colors={colors} />
            {logo && <image href={logo} x={FW / 2 - 26} y={FH / 2 - 26} width='52' height='52' opacity='.28' preserveAspectRatio='xMidYMid meet' />}
            {fdNow != null && <line x1={X(fdNow)} x2={X(fdNow)} y1='0' y2={FH} stroke={FD} strokeWidth='3' style={{ transition: 'all .5s ease' }} />}
            <line x1={X(los)} x2={X(los)} y1='0' y2={FH} stroke={LOS} strokeWidth='3' style={{ transition: 'all .5s ease' }} />
            {drive.map((p, i) => <Trace key={p.id} p={p} y={rowY(i)} on={i < shown} big={Math.abs(byId.get(p.id)?.delta ?? 0) >= 3} sel={pick === i} dir={dir} />)}
            <g style={{ transform: `translate(${ball.x}px, ${ball.y}px)`, transition: reduce ? 'none' : 'transform .9s cubic-bezier(.3,.7,.3,1)' }}>
              <ellipse cx='1.5' cy='4' rx='8' ry='3.5' fill='#000' opacity='.45' />
              <ellipse cx='0' cy='-3' rx='8' ry='5' fill='url(#fm-leather)' stroke='#2a1205' strokeWidth='.8' />
              <path d='M-3 -3 H3 M-1.5 -4.5 V-1.5 M0 -4.5 V-1.5 M1.5 -4.5 V-1.5' stroke='#fff' strokeWidth='.8' />
            </g>
          </svg>
          <div aria-hidden='true' className='absolute inset-x-0 top-full h-2.5 rounded-b-[3px]'
            style={{ transformOrigin: '50% 0', transform: 'rotateX(-90deg)', background: 'linear-gradient(#0f3a22, #071a0f)' }} />
        </div>
      </div>

      <div className='px-4'>
        <div className='flex gap-1.5' role='group' aria-label='Plays on this drive'>
          {drive.map((p, i) => (
            <button key={p.id} type='button' onClick={() => setPick(pick === i ? null : i)} disabled={i >= shown}
              aria-label={`Play ${i + 1}: ${playLabel(p)}`} aria-pressed={pick === i}
              className='group flex h-6 flex-1 items-center disabled:cursor-default'>
              <span className={cn('h-[3px] w-full rounded-full transition-colors duration-500',
                i < shown ? (pick === i ? 'bg-devig' : 'bg-foreground') : 'bg-muted')} />
            </button>
          ))}
        </div>
        <div className='flex min-h-12 items-center gap-3' aria-live='polite'>
          <div className='min-w-0 flex-1'>
            <div className='text-[11px] font-semibold text-muted-foreground'>{tick ? `Play ${cur + 1} of ${n}` : 'Drive starts'}</div>
            <div className='truncate text-[15px] font-bold'>{tick ? playLabel(tick) : `${offName} ball at the ${startSpot}`}</div>
          </div>
          {mv && (
            <>
              <span className='shrink-0 font-condensed text-xs text-muted-foreground tabular-nums'>{mv.before}¢ → {mv.after}¢</span>
              <Pill d={mv.delta} className='min-w-[54px]' />
            </>
          )}
        </div>
        <div className='flex items-center justify-between gap-2 pt-1 pb-3 text-xs text-muted-foreground'>
          <span className='truncate font-semibold text-foreground'>
            {live ? `${offName} ball · ${ballSpot}` : `${offName}'s last drive · ended at the ${ballSpot}`}
          </span>
          <span className='flex shrink-0 items-center gap-3'>
            <span className='inline-flex items-center gap-1.5'><span className='h-3 w-[3px] rounded-sm' style={{ background: LOS }} />Ball</span>
            <span className='inline-flex items-center gap-1.5'><span className='h-3 w-[3px] rounded-sm' style={{ background: FD }} />1st down</span>
            {!reduce && (
              <button type='button' onClick={replay} disabled={!done} aria-label='Replay the drive'
                className='-me-2 grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40'>
                <RotateCcw className='size-4' aria-hidden='true' />
              </button>
            )}
          </span>
        </div>
      </div>
    </section>
  )
}

// one play's line: drawn in when `on`
function Trace({ p, y, on, big, sel, dir }: { p: FieldPlay; y: number; on: boolean; big: boolean; sel: boolean; dir: 1 | -1 }) {
  const k = kindOf(p)
  const a = X(p.from!), b = X(p.to!)
  const draw = { transition: 'stroke-dashoffset .9s cubic-bezier(.2,.7,.3,1), opacity .3s', strokeDasharray: 1, strokeDashoffset: on ? 0 : 1 }
  const fade = { transition: 'opacity .25s .85s', opacity: on ? 1 : 0 }
  const col = k === 'loss' || k === 'turnover' ? LOSS : k === 'score' ? WIN : '#ffffff'
  const w = big || sel ? 4 : 2.5
  if (k === 'incomplete') {
    // an incompletion: a dashed arc to about 12 yards downfield, then an X
    const tx = X(p.from! + dir * 12)
    return (
      <g style={fade}>
        <path d={`M${a} ${y} Q${(a + tx) / 2} ${y - 16} ${tx} ${y}`} fill='none' stroke='#fff' strokeOpacity='.75' strokeWidth='2' strokeDasharray='3 4' />
        <g stroke={LOSS} strokeWidth='2.5' strokeLinecap='round'>
          <line x1={tx - 4} y1={y - 4} x2={tx + 4} y2={y + 4} /><line x1={tx - 4} y1={y + 4} x2={tx + 4} y2={y - 4} />
        </g>
      </g>
    )
  }
  if (Math.abs(b - a) < 1.5) return <circle cx={a} cy={y} r='3' fill={col} style={fade} />
  return (
    <g>
      <path d={`M${a} ${y} H${b}`} pathLength={1} stroke={col} strokeWidth={w} strokeLinecap='round' fill='none' style={draw} />
      <circle cx={b} cy={y} r={big ? 4 : 3} fill={col} style={fade} />
      {big && on && (
        <circle cx={b} cy={y} r='4' fill='none' stroke={WIN} strokeWidth='2' opacity='0'
          style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: 'fm-ripple 1s .9s ease-out' }} />
      )}
    </g>
  )
}

function Turf({ away, home, colors }: { away: string; home: string; colors: { away: string; home: string } }) {
  const stripes = Array.from({ length: 10 }, (_, i) => i)
  const fives = Array.from({ length: 19 }, (_, i) => (i + 1) * 5)
  const hashes = Array.from({ length: 99 }, (_, i) => i + 1).filter((yd) => yd % 5)
  const tens = Array.from({ length: 9 }, (_, i) => (i + 1) * 10)
  const word = { fill: '#fff', fontSize: 20, fontWeight: 900, letterSpacing: 3, fontFamily: 'var(--font-display)' }
  return (
    <g>
      <defs>
        <filter id='fm-grain' x='0' y='0' width='100%' height='100%'>
          <feTurbulence type='fractalNoise' baseFrequency='1.4 .35' numOctaves='2' seed='4' />
          <feColorMatrix values='0 0 0 0 0  0 0 0 0 0.08  0 0 0 0 0.03  0 0 0 .9 -.25' />
        </filter>
        <linearGradient id='fm-light' x1='0' y1='0' x2='0' y2='1'>
          <stop offset='0' stopColor='#000' stopOpacity='.35' /><stop offset='.45' stopColor='#fff' stopOpacity='.04' /><stop offset='1' stopColor='#fff' stopOpacity='.1' />
        </linearGradient>
        <radialGradient id='fm-leather' cx='.35' cy='.3' r='.8'>
          <stop offset='0' stopColor='#c47a3e' /><stop offset='.6' stopColor='#8a4b22' /><stop offset='1' stopColor='#5a2c10' />
        </radialGradient>
        <linearGradient id='fm-veil' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stopColor='#000' stopOpacity='.25' /><stop offset='1' stopColor='#000' stopOpacity='.25' /></linearGradient>
      </defs>
      {stripes.map((i) => <rect key={i} x={X(i * 10)} y='0' width={PPY * 10} height={FH} fill={i % 2 ? '#1d5a37' : '#1a5232'} />)}
      <rect x='0' y='0' width={EZ} height={FH} fill={colors.away} />
      <rect x={FW - EZ} y='0' width={EZ} height={FH} fill={colors.home} />
      <rect x='0' y='0' width={EZ} height={FH} fill='url(#fm-veil)' />
      <rect x={FW - EZ} y='0' width={EZ} height={FH} fill='url(#fm-veil)' />
      <rect x={EZ} y='0' width={FW - 2 * EZ} height={FH} filter='url(#fm-grain)' opacity='.5' />
      <rect x='0' y='0' width={FW} height={FH} fill='url(#fm-light)' />
      {fives.map((yd) => <line key={yd} x1={X(yd)} x2={X(yd)} y1='0' y2={FH} stroke='#fff' strokeOpacity={yd % 10 ? 0.3 : 0.55} strokeWidth={yd === 50 ? 1.2 : 1} />)}
      {hashes.map((yd) => [3, 74, 122, FH - 7].map((h) => <line key={`${yd}-${h}`} x1={X(yd)} x2={X(yd)} y1={h} y2={h + 4} stroke='#fff' strokeOpacity='.35' />))}
      <line x1={EZ} x2={EZ} y1='0' y2={FH} stroke='#fff' strokeWidth='2' />
      <line x1={FW - EZ} x2={FW - EZ} y1='0' y2={FH} stroke='#fff' strokeWidth='2' />
      <rect x='1' y='1' width={FW - 2} height={FH - 2} fill='none' stroke='#fff' strokeWidth='2' rx='3' />
      {tens.map((yd) => [[FH - 16, 0], [22, 180]].map(([yy, rot]) => (
        <text key={`${yd}-${rot}`} transform={`translate(${X(yd)} ${yy}) rotate(${rot})`} textAnchor='middle' fill='#fff' fillOpacity='.6'
          fontSize='15' fontWeight='800' fontFamily='var(--font-display)'>{yd <= 50 ? yd : 100 - yd}</text>
      )))}
      <text transform={`translate(${EZ / 2 + 6} ${FH / 2}) rotate(-90)`} textAnchor='middle' {...word}>{away}</text>
      <text transform={`translate(${FW - EZ / 2 - 6} ${FH / 2}) rotate(90)`} textAnchor='middle' {...word}>{home}</text>
      {[EZ, FW - EZ].map((px) => [0, FH - 5].map((py) => <rect key={`${px}-${py}`} x={px - 2.5} y={py} width='5' height='5' fill='#ff7a1a' />))}
    </g>
  )
}
