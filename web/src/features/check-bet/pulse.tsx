import { useId, useMemo, useState } from 'react'
import type { KRead } from '@/lib/kalshi-link'
import { type PricePoint, pulse, useLegLines } from '@/lib/pulse'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

// The parlay pulse: the chance a saved parlay hits, minute by minute, from each leg's Kalshi price multiplied together.
// Settled legs count as 1 (won) or 0 (lost) from the minute they settled, and each one is marked on the line.

type Combo = Extract<KRead, { kind: 'combo' }>
const W = 326, H = 150, PAD_T = 22, PAD_B = 22, PAD_R = 34
const hourFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric' })
const dayHourFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric' })
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const pct = (p: number) => (p > 0 && p < 0.1 ? `${(p * 100).toFixed(p < 0.001 ? 2 : 1).replace(/\.0+$/, '')}%` : `${Math.round(p * 100)}%`)
const TOPS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.4, 0.5, 0.6, 0.8, 1]

export function PulseCard({ d, savedAt }: { d: Combo; savedAt: string | null }) {
  const live = d.combo.result == null && d.lost === 0 && d.won < d.legs.length
  // from an hour before it was saved (or the last 12 hours for a combo read without saving), at most two days back
  const start = useMemo(() => {
    const now = Math.floor(Date.now() / 1000)
    const s = savedAt ? Math.floor(Date.parse(savedAt) / 1000) - 3600 : now - 12 * 3600
    return Math.floor(Math.max(s, now - 2 * 86400 + 600) / 300) * 300
  }, [savedAt])
  const { lines, loading } = useLegLines(d.legs, start, live)
  const p = useMemo(() => {
    const legs = d.legs.map((l, i) => ({ title: l.title, pick: l.pick, side: l.side, result: l.result, chance: l.chance, points: lines[i] ?? [] }))
    return pulse(legs, start, Math.floor(Date.parse(d.fetched_at) / 1000))
  }, [lines, d, start])

  if (d.legs.some((l) => !l.ticker)) return null
  if (loading) return <Skeleton className='h-[268px] w-full rounded-[18px]' />
  if (!p || !p.start || !p.end) return null

  const lost = d.lost > 0 || d.combo.result === 'lost'
  const won = !lost && (d.combo.result === 'won' || d.won === d.legs.length)
  const now = p.end[1]
  const from = p.start
  const n = now > 0 ? Math.round(1 / now) : null
  const sub = lost
    ? `Peaked at ${pct(p.high![1])} at ${timeFmt.format(p.high![0] * 1000)}`
    : won
      ? `From ${pct(from[1])} at ${timeFmt.format(from[0] * 1000)}`
      : `${now >= from[1] ? 'Up' : 'Down'} from ${pct(from[1])} at ${timeFmt.format(from[0] * 1000)}`

  return (
    <section aria-label='Parlay pulse' className='rounded-[18px] bg-card p-4'>
      <div className='flex items-center justify-between gap-3'>
        <h3 className='text-sm font-semibold text-muted-foreground'>Chance it all hits</h3>
        {live && (
          <span className='flex items-center gap-1.5 text-xs font-semibold text-good'>
            <span aria-hidden='true' className='relative flex size-2'>
              <span className='absolute inset-0 animate-ping rounded-full bg-good opacity-60 motion-reduce:hidden' />
              <span className='relative size-2 rounded-full bg-good' />
            </span>
            Live
          </span>
        )}
      </div>
      <div className='mt-0.5 flex items-baseline gap-3'>
        <span className={cn('font-display text-[52px] leading-none font-black tabular-nums', lost ? 'text-bad' : won ? 'text-good' : 'text-devig')}>
          {won ? 'Hit' : lost ? 'Missed' : pct(now)}
        </span>
        <span className='text-sm text-muted-foreground'>{sub}</span>
      </div>
      <Chart line={p.line} marks={p.marks} live={live} tone={lost ? 'bad' : won ? 'good' : 'devig'} />
      <p className='mt-2 text-xs leading-relaxed text-muted-foreground'>
        Each leg&apos;s Kalshi price, multiplied{live && n && n > 1 ? `: about 1 in ${n} right now` : ''}. Legs from the same game move together, so
        it&apos;s a rough read. Updates every minute while it plays.
      </p>
    </section>
  )
}

function Chart({ line, marks, live, tone }: { line: PricePoint[]; marks: { t: number; label: string; won: boolean }[]; live: boolean; tone: 'bad' | 'good' | 'devig' }) {
  const gid = useId().replace(/:/g, '')
  const [hover, setHover] = useState<number | null>(null)
  const t0 = line[0][0], t1 = line[line.length - 1][0]
  const high = Math.max(...line.map((x) => x[1]))
  const top = TOPS.find((v) => v >= high * 1.12) ?? 1
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * (W - PAD_R)
  const y = (v: number) => PAD_T + (1 - v / top) * (H - PAD_T - PAD_B)
  const path = line.map(([t, v], i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const area = `${path}L${x(t1).toFixed(1)},${H - PAD_B}L0,${H - PAD_B}Z`
  const color = `var(--${tone})`

  // 3 or 4 time labels on the hour
  const span = t1 - t0
  const stepH = [1, 2, 3, 4, 6, 12, 24].find((h) => span / (h * 3600) <= 4) ?? 24
  const ticks: number[] = []
  for (let t = Math.ceil(t0 / (stepH * 3600)) * stepH * 3600; t < t1 - 0.06 * span; t += stepH * 3600) if (x(t) > 14) ticks.push(t)
  const fmt = span > 20 * 3600 ? dayHourFmt : hourFmt

  // mark labels, skipping any that would sit on top of the one before
  let lastX = -99
  const shown = marks.map((m) => {
    const mx = x(m.t)
    const ok = mx - lastX > 64
    if (ok) lastX = mx
    return { ...m, mx, label: ok ? m.label : null }
  })

  const end = line[line.length - 1]
  const h = hover == null ? null : line[hover]
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const t = t0 + ((e.clientX - r.left) / r.width) * (W / (W - PAD_R)) * (t1 - t0)
    let i = 0
    while (i < line.length - 1 && line[i + 1][0] <= t) i++
    setHover(i)
  }
  const summary = `From ${pct(line[0][1])} at ${timeFmt.format(t0 * 1000)} to ${pct(end[1])}${live ? ' now' : ''}. ${marks.map((m) => `${m.label} at ${timeFmt.format(m.t * 1000)}`).join('. ')}`

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className='mt-3 block w-full touch-pan-y select-none'
      role='img'
      aria-label={summary}
      onPointerMove={onMove}
      onPointerDown={onMove}
      onPointerLeave={() => setHover(null)}
    >
      <defs>
        <linearGradient id={gid} x1='0' x2='0' y1='0' y2='1'>
          <stop offset='0' stopColor={color} stopOpacity='0.32' />
          <stop offset='1' stopColor={color} stopOpacity='0' />
        </linearGradient>
      </defs>
      {[top / 2, top].map((v) => (
        <g key={v}>
          <line x1='0' x2={W - PAD_R} y1={y(v)} y2={y(v)} stroke='currentColor' strokeOpacity='0.1' strokeDasharray='2 4' />
          <text x={W} y={y(v) + 4} textAnchor='end' className='fill-muted-foreground text-[11px] tabular-nums'>{pct(v)}</text>
        </g>
      ))}
      <line x1='0' x2={W - PAD_R} y1={H - PAD_B} y2={H - PAD_B} stroke='currentColor' strokeOpacity='0.18' />
      {ticks.map((t) => (
        <text key={t} x={x(t)} y={H - 6} textAnchor='middle' className='fill-muted-foreground text-[11px]'>{fmt.format(t * 1000)}</text>
      ))}
      {shown.map((m) => (
        <g key={m.t + m.label!}>
          <line x1={m.mx} x2={m.mx} y1={PAD_T - 6} y2={H - PAD_B} stroke={m.won ? 'var(--good)' : 'var(--bad)'} strokeOpacity='0.45' strokeDasharray='2 3' />
          {m.label && (
            <text x={Math.min(Math.max(m.mx, 30), W - PAD_R - 30)} y={PAD_T - 10} textAnchor='middle' className={cn('text-[10.5px] font-semibold', m.won ? 'fill-good' : 'fill-bad')}>{m.label}</text>
          )}
        </g>
      ))}
      <path d={area} fill={`url(#${gid})`} />
      <path d={path} fill='none' stroke={color} strokeWidth='2.25' strokeLinejoin='round' strokeLinecap='round' />
      {live && (
        <circle cx={x(end[0])} cy={y(end[1])} r='8' fill={color} fillOpacity='0.25' className='motion-safe:animate-pulse' />
      )}
      <circle cx={x(end[0])} cy={y(end[1])} r='3.5' fill={color} stroke='var(--card)' strokeWidth='1.5' />
      {h && (
        <g pointerEvents='none'>
          <line x1={x(h[0])} x2={x(h[0])} y1={PAD_T - 4} y2={H - PAD_B} stroke='currentColor' strokeOpacity='0.35' />
          <circle cx={x(h[0])} cy={y(h[1])} r='4' fill={color} stroke='var(--card)' strokeWidth='1.5' />
          <g transform={`translate(${Math.min(Math.max(x(h[0]), 44), W - 44)},${Math.max(y(h[1]) - 26, 2)})`}>
            <rect x='-42' y='0' width='84' height='19' rx='9.5' className='fill-foreground' />
            <text y='13.5' textAnchor='middle' className='fill-background text-[11px] font-semibold tabular-nums'>
              {timeFmt.format(h[0] * 1000)} · {pct(h[1])}
            </text>
          </g>
        </g>
      )}
    </svg>
  )
}
