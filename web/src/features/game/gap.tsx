import { useId, useMemo, useState } from 'react'
import { type GameRow } from '@/lib/devig'
import { FOOTBALL, playLabel, useFieldPlays, usePriceLine } from '@/lib/field'
import { type Pt, KIND_LABEL, forSide, gapRead, since, valueAt, yRange } from '@/lib/gap-math'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { isPick } from '../games/plate'

// The gap chart on an NFL or college football game page: Kalshi's price for a team next to ESPN's own win chance,
// play by play, with the scores and turnovers marked and DeVig's pregame read as a dashed line. When the two lines
// split, the market and ESPN's model disagree about the same game. Display only.

const W = 340, H = 190, PAD_T = 14, PAD_B = 40, PAD_R = 58
const ESPN = '#60a5fa'
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const n = (v: number) => Math.round(v * 100)
const RECENT = 30 * 60
const last = <T,>(a: T[] | undefined): T | undefined => (a && a.length ? a[a.length - 1] : undefined)

export function GapChart({ row }: { row: GameRow }) {
  const plays = useFieldPlays(row)
  const prices = usePriceLine(row)
  const pickSide: 'home' | 'away' = isPick(row) && row.pick?.side === row.away ? 'away' : 'home'
  const [side, setSide] = useState<'home' | 'away'>(pickSide)
  const [range, setRange] = useState<'recent' | 'game'>('game')

  if (!FOOTBALL.includes(row.sport) || row.state === 'pre') return null
  if (plays.isPending || prices.isPending) return <Skeleton className='h-[380px] w-full rounded-[22px]' />
  const wp = plays.data?.wp ?? []
  const kal = prices.data ?? []
  if (wp.length < 2 && kal.length < 2) return null

  const code = side === 'home' ? row.home : row.away
  const espn = forSide(wp, side)
  const kalshi = forSide(kal, side)
  const kick = Math.floor(Date.parse(row.kickoff) / 1000)
  const lastT = Math.max(last(espn)?.[0] ?? 0, last(kalshi)?.[0] ?? 0)
  const end = row.state === 'in' ? Math.max(lastT, Math.floor(Date.now() / 1000)) : lastT
  const start = range === 'recent' && row.state === 'in' ? end - RECENT : Math.max(kick - 5 * 60, Math.min(espn[0]?.[0] ?? end, kalshi.find((p) => p[0] >= kick - 300)?.[0] ?? end))
  const e = since(espn, start), k = since(kalshi, start)
  const devig = isPick(row) && row.pick?.prob != null ? (row.pick.side === code ? row.pick.prob : 1 - row.pick.prob) : null
  const keys = (plays.data?.keys ?? []).filter((x) => x.at >= start && x.at <= end)
  const lastKey = last(plays.data?.keys)
  const eNow = last(espn)?.[1] ?? null, kNow = last(kalshi)?.[1] ?? null
  const read = gapRead(kNow, eNow)
  const chance = (s: 'home' | 'away') => {
    const v = last(kal)?.[1] ?? last(wp)?.[1]
    return v == null ? null : s === 'home' ? v : 1 - v
  }

  return (
    <section aria-label={`Kalshi against ESPN, ${code} to win`} className='overflow-hidden rounded-[22px] bg-card'>
      <div className='flex items-center justify-between gap-3 px-4 pt-4'>
        <h2 className='font-display text-[19px] font-extrabold whitespace-nowrap'>Kalshi vs the game</h2>
        <div role='tablist' aria-label='Team' className='flex gap-1 rounded-full bg-muted p-1'>
          {([pickSide, pickSide === 'home' ? 'away' : 'home'] as const).map((s) => {
            const c = chance(s)
            const color = (s === 'home' ? row.colors?.home : row.colors?.away) || undefined
            return (
              <button key={s} type='button' role='tab' aria-selected={side === s} onClick={() => setSide(s)}
                className={cn('flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-bold tabular-nums transition-colors', side === s ? 'bg-foreground text-background' : 'text-muted-foreground')}>
                <span aria-hidden='true' className='size-2 rounded-full' style={{ background: color ?? 'currentColor' }} />
                {s === 'home' ? row.home : row.away}
                {c != null && <span className={side === s ? 'opacity-70' : ''}>{n(c)}%</span>}
              </button>
            )
          })}
        </div>
      </div>

      <div className='px-4 pt-3'>
        <p className={cn('font-display text-[26px] leading-tight font-black', read.gap != null && Math.abs(read.gap) >= 3 ? 'text-devig' : '')}>{read.text}</p>
        <p className='mt-1 text-sm leading-relaxed text-muted-foreground'>
          {lastKey && eNow != null
            ? <>After {playLabel({ id: '', team: null, q: lastKey.q, clock: lastKey.clock, text: lastKey.text, type: lastKey.kind === 'FUM' ? 'Fumble Recovery (Opponent)' : '', yards: null, down: '', scoring: false })} ({lastKey.q ? `Q${lastKey.q} ` : ''}{lastKey.clock}), ESPN gives {code} {n(eNow)}%{kNow != null && <>. Kalshi&apos;s price is {n(kNow)}¢</>}.</>
            : <>ESPN&apos;s win chance and Kalshi&apos;s price for {code} to win, play by play.</>}
        </p>
      </div>

      {row.state === 'in' && (
        <div role='radiogroup' aria-label='Time range' className='mx-4 mt-3 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1'>
          {([['recent', 'Last 30 min'], ['game', 'Whole game']] as const).map(([v, label]) => (
            <button key={v} type='button' role='radio' aria-checked={range === v} onClick={() => setRange(v)}
              className={cn('h-8 rounded-lg text-xs font-semibold transition-colors', range === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground')}>
              {label}
            </button>
          ))}
        </div>
      )}

      <Chart e={e} k={k} start={start} end={end} devig={devig} keys={keys} periods={plays.data?.periods ?? []} live={row.state === 'in'} code={code} />

      <div className='flex flex-wrap items-center gap-x-4 gap-y-1 px-4 text-xs text-muted-foreground'>
        <span className='flex items-center gap-1.5'><i aria-hidden='true' className='h-0.5 w-4 rounded-full bg-foreground' />Kalshi price</span>
        <span className='flex items-center gap-1.5'><i aria-hidden='true' className='h-0.5 w-4 rounded-full' style={{ background: ESPN }} />ESPN win chance</span>
        {devig != null && <span className='flex items-center gap-1.5'><i aria-hidden='true' className='h-0 w-4 border-t-2 border-dashed border-devig' />DeVig pregame</span>}
      </div>
      <p className='px-4 pt-2 pb-4 text-xs leading-relaxed text-muted-foreground'>
        Display only. DeVig hasn&apos;t tested how often gaps like this close, so it isn&apos;t a pick.{devig != null && " The dashed line is DeVig's pregame read; it doesn't know the score."}
      </p>
    </section>
  )
}

function Chart({ e, k, start, end, devig, keys, periods, live, code }: {
  e: Pt[]; k: Pt[]; start: number; end: number; devig: number | null; live: boolean; code: string
  keys: { at: number; kind: string; q: number | null; clock: string; text: string }[]; periods: [number, number][]
}) {
  const gid = useId().replace(/:/g, '')
  const [hover, setHover] = useState<number | null>(null)
  const [lo, hi] = useMemo(() => yRange([...e.map((p) => p[1]), ...k.map((p) => p[1]), ...(devig != null ? [devig] : [])]), [e, k, devig])
  const span = Math.max(60, end - start)
  const x = (t: number) => ((t - start) / span) * (W - PAD_R)
  const y = (v: number) => PAD_T + (1 - (v - lo) / (hi - lo)) * (H - PAD_T - PAD_B)
  const step = (pts: Pt[]) => pts.map(([t, v], i) => `${i ? `H${x(t).toFixed(1)}V` : `M${x(t).toFixed(1)},`}${y(v).toFixed(1)}`).join('') + (pts.length ? `H${x(end).toFixed(1)}` : '')
  const smooth = (pts: Pt[]) => pts.map(([t, v], i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join('') + (pts.length ? `L${x(end).toFixed(1)},${y(pts[pts.length - 1][1]).toFixed(1)}` : '')
  const eNow = last(e)?.[1], kNow = last(k)?.[1]
  const grid = [] as number[]
  for (let v = lo; v <= hi + 1e-9; v += (hi - lo) / 4) grid.push(Math.round(v * 100) / 100)

  // end labels, pushed apart if the lines finish close together
  let ye = eNow != null ? y(eNow) : null, yk = kNow != null ? y(kNow) : null
  if (ye != null && yk != null && Math.abs(ye - yk) < 15) {
    const mid = (ye + yk) / 2, up = ye < yk || (ye === yk && (eNow ?? 0) >= (kNow ?? 0))
    ye = mid + (up ? -7.5 : 7.5)
    yk = mid + (up ? 7.5 : -7.5)
  }

  const ht = hover == null ? null : start + (hover / (W - PAD_R)) * span
  const he = ht == null ? null : valueAt(e, ht), hk = ht == null ? null : valueAt(k, ht)
  const onMove = (ev: React.PointerEvent<SVGSVGElement>) => {
    const r = ev.currentTarget.getBoundingClientRect()
    const px = ((ev.clientX - r.left) / r.width) * W
    setHover(px >= 0 && px <= W - PAD_R ? px : null)
  }

  // key plays along the bottom, one row, skipping any that would overlap the one before
  let lastX = -99
  const marks = keys.map((m) => {
    const mx = x(m.at)
    const ok = mx - lastX >= 22
    if (ok) lastX = mx
    return { ...m, mx, ok }
  })
  const quarters = periods.filter(([, t]) => t >= start && t <= end).map(([q, t]) => ({ q, mx: x(t) })).filter((p) => p.mx > 10)
  const summary = `${code}: ESPN ${eNow != null ? n(eNow) + '%' : 'no data'}, Kalshi ${kNow != null ? n(kNow) + '¢' : 'no data'}${devig != null ? `, DeVig pregame ${n(devig)}%` : ''}. ${keys.length} scores and turnovers marked.`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className='mt-3 block w-full touch-pan-y select-none px-4' role='img' aria-label={summary}
      onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}>
      <defs>
        <linearGradient id={gid} x1='0' x2='0' y1='0' y2='1'>
          <stop offset='0' stopColor={ESPN} stopOpacity='0.18' />
          <stop offset='1' stopColor={ESPN} stopOpacity='0' />
        </linearGradient>
      </defs>
      {grid.map((v) => (
        <g key={v}>
          <line x1='0' x2={W - PAD_R} y1={y(v)} y2={y(v)} stroke='currentColor' strokeOpacity={v === 0.5 ? 0.22 : 0.08} strokeDasharray={v === 0.5 ? undefined : '2 4'} />
          <text x={W - PAD_R + 6} y={y(v) + 3.5} className='fill-muted-foreground text-[10px] tabular-nums'>{n(v)}</text>
        </g>
      ))}
      {quarters.map((p) => (
        <g key={p.q}>
          <line x1={p.mx} x2={p.mx} y1={PAD_T} y2={H - PAD_B} stroke='currentColor' strokeOpacity='0.1' />
          <text x={p.mx + 3} y={H - PAD_B + 30} className='fill-muted-foreground text-[10px] font-semibold'>{p.q > 4 ? 'OT' : `Q${p.q}`}</text>
        </g>
      ))}
      {devig != null && devig >= lo && devig <= hi && (
        <g>
          <line x1='0' x2={W - PAD_R} y1={y(devig)} y2={y(devig)} stroke='var(--devig)' strokeWidth='1.5' strokeDasharray='5 4' />
          <text x='2' y={y(devig) - 4} className='fill-devig text-[10px] font-semibold'>DeVig pregame {n(devig)}</text>
        </g>
      )}
      {e.length > 0 && <path d={`${step(e)}V${H - PAD_B}H${x(e[0][0]).toFixed(1)}Z`} fill={`url(#${gid})`} />}
      {e.length > 0 && <path d={step(e)} fill='none' stroke={ESPN} strokeWidth='2' strokeLinejoin='round' />}
      {k.length > 0 && <path d={smooth(k)} fill='none' stroke='var(--foreground)' strokeWidth='2.25' strokeLinejoin='round' strokeLinecap='round' />}
      {marks.map((m, i) => (
        <g key={i}>
          <line x1={m.mx} x2={m.mx} y1={PAD_T} y2={H - PAD_B + 2} stroke='currentColor' strokeOpacity='0.2' strokeDasharray='1 3' />
          {m.ok && (
            <g transform={`translate(${Math.min(Math.max(m.mx, 11), W - PAD_R - 11)},${H - PAD_B + 13})`}>
              <rect x='-11' y='-7' width='22' height='14' rx='7' className={m.kind === 'INT' || m.kind === 'FUM' ? 'fill-bad/20' : 'fill-muted'} />
              <text y='3.5' textAnchor='middle' className={cn('text-[8.5px] font-bold', m.kind === 'INT' || m.kind === 'FUM' ? 'fill-bad' : 'fill-foreground')}>{KIND_LABEL[m.kind] ?? m.kind}</text>
              <title>{`Q${m.q} ${m.clock}: ${m.text}`}</title>
            </g>
          )}
        </g>
      ))}
      {eNow != null && ye != null && (
        <g>
          <circle cx={x(end)} cy={y(eNow)} r='3.5' fill={ESPN} stroke='var(--card)' strokeWidth='1.5' />
          <text x={W - PAD_R + 6} y={ye + 4} className='text-[11px] font-bold tabular-nums' fill={ESPN}>{n(eNow)} ESPN</text>
        </g>
      )}
      {kNow != null && yk != null && (
        <g>
          {live && <circle cx={x(end)} cy={y(kNow)} r='7' fill='var(--foreground)' fillOpacity='0.18' className='motion-safe:animate-pulse' />}
          <circle cx={x(end)} cy={y(kNow)} r='3.5' fill='var(--foreground)' stroke='var(--card)' strokeWidth='1.5' />
          <text x={W - PAD_R + 6} y={yk + 4} className='fill-foreground text-[11px] font-bold tabular-nums'>{n(kNow)} Kalshi</text>
        </g>
      )}
      {hover != null && ht != null && (
        <g pointerEvents='none'>
          <line x1={hover} x2={hover} y1={PAD_T} y2={H - PAD_B} stroke='currentColor' strokeOpacity='0.4' />
          {he != null && <circle cx={hover} cy={y(he)} r='3.5' fill={ESPN} />}
          {hk != null && <circle cx={hover} cy={y(hk)} r='3.5' fill='var(--foreground)' />}
          <g transform={`translate(${Math.min(Math.max(hover, 62), W - PAD_R - 62)},${PAD_T})`}>
            <rect x='-62' y='-2' width='124' height='19' rx='9.5' className='fill-foreground' />
            <text y='11.5' textAnchor='middle' className='fill-background text-[10px] font-semibold tabular-nums'>
              {timeFmt.format(ht * 1000)} · ESPN {he != null ? n(he) : '—'} · Kalshi {hk != null ? n(hk) : '—'}
            </text>
          </g>
        </g>
      )}
    </svg>
  )
}
