import { useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { type GameRow } from '@/lib/devig'
import { type Pt, valueAt } from '@/lib/gap-math'
import { type MatchEvent, useMatch } from '@/lib/soccer'
import { useWidth } from '@/lib/use-width'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

// A soccer match's price chart: Kalshi's price for each of the three outcomes (home win, draw, away win) through the
// match, minute by minute, with every goal marked where it happened (ESPN's wallclock), and under it what each goal
// did to the prices. Each line is that market's own mid price, so the three don't have to add up to exactly 100.
// Display only.

type O = 'home' | 'draw' | 'away'
const OS: O[] = ['home', 'draw', 'away']
const H = 210, PAD_T = 12, PAD_B = 26, PAD_R = 44
const n = (v: number) => Math.round(v * 100)
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const hex = (c?: string | null) => (c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : null)
const GOALS: MatchEvent['kind'][] = ['goal', 'own', 'pen']
const AFTER = 4 * 60            // a goal's effect: the price 4 minutes on, once the market has settled down

function usePriceLines(row: GameRow) {
  const start = Math.floor(Date.parse(row.kickoff) / 1000) - 15 * 60
  const t = row.tickers3
  const on = !!t && row.state !== 'pre' && Number.isFinite(start)
  return useQueries({
    queries: OS.map((o) => ({
      queryKey: ['winline_fine', t?.[o], start],
      queryFn: async () => {
        const r = await fetch(`/api/winline?ticker=${encodeURIComponent(t![o])}&start=${start}&fine=1`)
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return ((await r.json()) as { points: Pt[] }).points ?? []
      },
      enabled: on,
      staleTime: row.state === 'post' ? 30 * 6e4 : 8e3,
      refetchInterval: row.state === 'in' ? 15e3 : (false as const),
    })),
  })
}

export function SoccerChart({ row }: { row: GameRow }) {
  const qs = usePriceLines(row)
  const match = useMatch(row)
  if (!row.tickers3 || row.state === 'pre') return null
  if (qs.some((q) => q.isPending)) return <Skeleton className='h-[300px] w-full rounded-[22px]' />
  const lines = Object.fromEntries(OS.map((o, i) => [o, qs[i].data ?? []])) as Record<O, Pt[]>
  if (OS.every((o) => lines[o].length < 2)) return null
  return <Chart row={row} lines={lines} events={match.data?.events ?? []} />
}

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const near = (a: string, b: string) => { const [x, y] = [rgb(a), rgb(b)]; return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) < 120 }

// drawn once the prices are in, so it measures its own width from the start
function Chart({ row, lines, events }: { row: GameRow; lines: Record<O, Pt[]>; events: MatchEvent[] }) {
  const [box, W] = useWidth<HTMLDivElement>(358)
  const [hover, setHover] = useState<number | null>(null)

  const hc = hex(row.colors?.home), ac = hex(row.colors?.away)
  const color: Record<O, string> = {
    home: hc ?? 'var(--side-home)',
    draw: 'var(--muted-foreground)',
    // two reds (LIV v ARS) would read as one line: the away side is then drawn in the text colour
    away: !ac ? 'var(--side-away)' : hc && near(hc, ac) ? 'var(--foreground)' : ac,
  }
  const code: Record<O, string> = { home: row.home, draw: 'Draw', away: row.away }
  const kick = Math.floor(Date.parse(row.kickoff) / 1000)
  const all = OS.flatMap((o) => lines[o])
  const first = Math.max(kick - 5 * 60, Math.min(...all.map((p) => p[0])))
  const lastT = Math.max(...all.map((p) => p[0]))
  const end = row.state === 'in' ? Math.max(lastT, Math.floor(Date.now() / 1000)) : lastT
  const span = Math.max(60, end - first)
  const cw = W - PAD_R
  const x = (t: number) => ((t - first) / span) * cw
  const y = (v: number) => PAD_T + (1 - v) * (H - PAD_T - PAD_B)
  const path = (pts: Pt[]) => pts.filter((p) => p[0] >= first).map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join('')
  const now = Object.fromEntries(OS.map((o) => [o, lines[o].length ? lines[o][lines[o].length - 1][1] : null])) as Record<O, number | null>

  // goals, at ESPN's wallclock; each with the outcome that rose most across it (an own goal's side isn't relied on)
  const goals = events.filter((e) => GOALS.includes(e.kind) && e.at && Number.isFinite(Date.parse(e.at)))
    .map((e) => {
      const at = Math.floor(Date.parse(e.at!) / 1000)
      const moves = OS.map((o) => {
        const a = valueAt(lines[o], at - 30), b = valueAt(lines[o], Math.min(at + AFTER, end))
        return { o, a, b, d: a != null && b != null ? b - a : null }
      })
      const up = moves.filter((m) => m.d != null).sort((p, q) => q.d! - p.d!)[0] ?? null
      return { e, at, up, settled: end - at >= AFTER }
    })
    .filter((g) => g.at >= first && g.at <= end)

  // right-edge labels, nudged apart so they don't overlap
  const tags = OS.filter((o) => now[o] != null).map((o) => ({ o, v: now[o]!, ty: y(now[o]!) })).sort((a, b) => a.ty - b.ty)
  for (let i = 1; i < tags.length; i++) if (tags[i].ty - tags[i - 1].ty < 13) tags[i].ty = tags[i - 1].ty + 13

  const ht = hover == null ? null : first + (hover / cw) * span
  const onMove = (ev: React.PointerEvent<SVGSVGElement>) => {
    const r = ev.currentTarget.getBoundingClientRect()
    const px = ((ev.clientX - r.left) / r.width) * W
    setHover(px >= 0 && px <= cw ? px : null)
  }
  const summary = `Kalshi through the match: ${OS.filter((o) => now[o] != null).map((o) => `${code[o]} ${n(now[o]!)}%`).join(', ')}. ${goals.length} ${goals.length === 1 ? 'goal' : 'goals'} marked.`

  return (
    <section aria-labelledby='sc-chart-h' className='overflow-hidden rounded-[22px] bg-card'>
      <div className='flex items-baseline justify-between gap-3 px-4 pt-4'>
        <h2 id='sc-chart-h' className='font-display text-[19px] font-extrabold'>Kalshi through the match</h2>
        <ul aria-hidden='true' className='flex shrink-0 gap-3 text-xs font-semibold text-muted-foreground'>
          {OS.map((o) => (
            <li key={o} className='flex items-center gap-1.5'>
              <span className={cn('h-0.5 w-3 rounded-full', o === 'draw' && 'opacity-80')} style={{ background: color[o] }} />{code[o]}
            </li>
          ))}
        </ul>
      </div>
      <div ref={box} className='mt-2 px-4'>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className='block h-auto w-full touch-pan-y select-none' role='img' aria-label={summary}
          onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}>
          {[0, 0.25, 0.5, 0.75, 1].map((v) => (
            <g key={v}>
              <line x1='0' x2={cw} y1={y(v)} y2={y(v)} stroke='currentColor' strokeOpacity={v === 0.5 ? 0.2 : 0.08} strokeDasharray={v === 0.5 ? undefined : '2 4'} />
              {!tags.some((t) => Math.abs(t.ty - y(v)) < 11) && (
                <text x={cw + 6} y={y(v) + 3.5} className='fill-muted-foreground text-[10px] tabular-nums'>{n(v)}</text>
              )}
            </g>
          ))}
          {kick > first && (
            <g>
              <line x1={x(kick)} x2={x(kick)} y1={PAD_T} y2={H - PAD_B} stroke='currentColor' strokeOpacity='0.12' />
              <text x={x(kick) + 3} y={H - 8} className='fill-muted-foreground text-[10px] font-semibold'>Kickoff</text>
            </g>
          )}
          {goals.map((g, i) => (
            <line key={`l${i}`} x1={x(g.at)} x2={x(g.at)} y1={PAD_T} y2={H - PAD_B} stroke='var(--devig)' strokeOpacity='0.55' strokeDasharray='2 3' />
          ))}
          {OS.map((o) => lines[o].length > 1 && (
            <path key={o} d={path(lines[o])} fill='none' stroke={color[o]} strokeWidth={o === 'draw' ? 1.75 : 2.25}
              strokeDasharray={o === 'draw' ? '4 3' : undefined} strokeLinejoin='round' strokeLinecap='round' />
          ))}
          {goals.map((g, i) => (
            <g key={`g${i}`} transform={`translate(${Math.min(Math.max(x(g.at), 9), cw - 9)},${H - PAD_B + 12})`}>
              <circle r='8' fill='var(--devig)' />
              <text y='3.2' textAnchor='middle' className='fill-devig-ink text-[8.5px] font-bold tabular-nums'>{g.e.min.replace(/'.*$/, '')}</text>
              <title>{`${g.e.min} ${g.e.who}${g.e.kind === 'own' ? ' (own goal)' : g.e.kind === 'pen' ? ' (penalty)' : ''}`}</title>
            </g>
          ))}
          {tags.map((t) => (
            <g key={t.o}>
              <circle cx={x(end)} cy={y(t.v)} r='3.25' fill={color[t.o]} stroke='var(--card)' strokeWidth='1.5' />
              <text x={cw + 6} y={t.ty + 4} className='text-[11px] font-bold tabular-nums' fill={color[t.o]}>{n(t.v)}</text>
            </g>
          ))}
          {hover != null && ht != null && (
            <g pointerEvents='none'>
              <line x1={hover} x2={hover} y1={PAD_T} y2={H - PAD_B} stroke='currentColor' strokeOpacity='0.4' />
              <g transform={`translate(${Math.min(Math.max(hover, 74), cw - 74)},${PAD_T})`}>
                <rect x='-74' y='-2' width='148' height='19' rx='9.5' className='fill-foreground' />
                <text y='11.5' textAnchor='middle' className='fill-background text-[10px] font-semibold tabular-nums'>
                  {timeFmt.format(ht * 1000)} · {OS.map((o) => { const v = valueAt(lines[o], ht); return `${o === 'draw' ? 'D' : code[o]} ${v != null ? n(v) : '—'}` }).join(' · ')}
                </text>
              </g>
            </g>
          )}
        </svg>
      </div>

      {goals.length > 0 && (
        <ol aria-label='What each goal did to the prices' className='mt-1 border-t'>
          {goals.map((g, i) => (
            <li key={i} className='flex items-center gap-3 border-b px-4 py-2 text-sm last:border-b-0'>
              <span aria-hidden='true' className='grid size-6 shrink-0 place-items-center rounded-full bg-devig font-condensed text-[11px] font-bold text-devig-ink tabular-nums'>{g.e.min.replace(/'.*$/, '')}</span>
              <span className='min-w-0 flex-1 truncate'>
                <span className='sr-only'>{g.e.min} </span>
                <b className='font-semibold'>{g.e.who || 'Goal'}</b>
                {g.e.kind !== 'goal' && <span className='text-muted-foreground'>{g.e.kind === 'own' ? ' · own goal' : ' · penalty'}</span>}
              </span>
              {g.up && g.up.a != null && g.up.b != null ? (
                <span className='shrink-0 font-condensed text-[15px] tabular-nums'>
                  <span className='text-muted-foreground'>{code[g.up.o]} {n(g.up.a)}%</span>
                  <span aria-hidden='true' className='text-muted-foreground'> → </span><span className='sr-only'> to </span>
                  <b style={{ color: g.up.o === 'draw' ? undefined : color[g.up.o] }}>{n(g.up.b)}%</b>
                  {!g.settled && <span className='ms-1 text-[11px] text-muted-foreground'>so far</span>}
                </span>
              ) : <span className='shrink-0 text-xs text-muted-foreground'>No price yet</span>}
            </li>
          ))}
        </ol>
      )}
      <p className='px-4 pt-2 pb-4 text-xs leading-relaxed text-muted-foreground'>
        Each line is that outcome&apos;s Kalshi price (the middle of its bid and ask), a minute at a time; the three needn&apos;t add to exactly 100. Goals at ESPN&apos;s time; beside each, the outcome that rose most, just before it and four minutes on.
      </p>
    </section>
  )
}
