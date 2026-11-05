import { type ReactNode, useState } from 'react'
import { type GameRow, type Half, type PlayerKind, type Px, type SoccerExtra, fmtPct } from '@/lib/devig'
import { useFresh } from '@/lib/soccer'
import { cn } from '@/lib/utils'
import { TeamLogo } from '@/components/team-logo'

// The rest of Kalshi's markets on a soccer match, one tab each: player goals and assists, correct score, each half,
// team goals and first to score, corners. Kalshi's mid price for yes (fresh from Kalshi for the open tab, else the
// board file's). Settles on 90 minutes plus stoppage time. No model: numbers to read, not picks.

type Side = 'home' | 'away'
type Now = (t: string, mid: number, ask: number | null) => [number, number | null]

export function Box({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className={cn('min-w-0 rounded-2xl px-3 py-2.5', strong ? 'bg-accent' : 'bg-card')}>
      <div className='truncate text-xs text-muted-foreground'>{label}</div>
      <div className='font-condensed text-[17px] font-bold tabular-nums'>{value}</div>
      {sub && <div className='text-[11px] text-muted-foreground tabular-nums'>{sub}</div>}
    </div>
  )
}

// a probability bar row: label, bar, percent
export function Rung({ label, p, strong, wide }: { label: ReactNode; p: number; strong?: boolean; wide?: boolean }) {
  if (!Number.isFinite(p)) return null              // too thinly quoted to show (see SoccerMarkets)
  return (
    <li className='flex min-h-10 items-center gap-3 border-t px-4 py-2 first:border-t-0'>
      <span className={cn('shrink-0 truncate text-sm', wide ? 'w-36' : 'w-20', strong ? 'font-bold' : 'text-muted-foreground')}>{label}</span>
      <span aria-hidden='true' className='h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted'>
        <span className={cn('block h-full rounded-full', strong ? 'bg-devig' : 'bg-foreground/45')} style={{ width: `${Math.max(1, Math.min(100, p * 100))}%` }} />
      </span>
      <span className={cn('w-10 shrink-0 text-end font-condensed text-[15px] tabular-nums', strong ? 'font-bold' : 'font-semibold')}>{pct(p)}</span>
    </li>
  )
}

const pct = (p: number) => (p > 0 && p < 0.005 ? '<1%' : fmtPct(p))
const px = (p: Px, now: Now) => now(p[2], p[0], p[1])[0]

// three prices that cover every outcome (a half's winner, first to score), scaled to add up to 1 like the game's
function scale3(xs: number[]) {
  const s = xs.reduce((a, b) => a + b, 0)
  return s > 0 ? xs.map((x) => x / s) : xs
}

function Three({ labels, ps }: { labels: [string, string, string]; ps: number[] }) {
  if (ps.some((p) => !Number.isFinite(p))) return null
  const f = scale3(ps)
  const top = f.indexOf(Math.max(...f))
  return (
    <div className='grid grid-cols-3 gap-2'>
      {labels.map((l, i) => <Box key={l} label={l} value={fmtPct(f[i])} strong={i === top} />)}
    </div>
  )
}

const KINDS: { key: string; label: string; kind: PlayerKind; n: number }[] = [
  { key: 'goal1', label: 'Scores', kind: 'goal', n: 1 },
  { key: 'first', label: 'First goal', kind: 'firstgoal', n: 1 },
  { key: 'goal2', label: '2+ goals', kind: 'goal', n: 2 },
  { key: 'ast', label: 'Assist', kind: 'ast', n: 1 },
  { key: 'soa', label: 'Goal or assist', kind: 'soa', n: 1 },
]

function Chips<T extends string>({ items, value, onChange, label }: { items: { key: T; label: string }[]; value: T; onChange: (k: T) => void; label: string }) {
  return (
    <div role='group' aria-label={label} className='no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4'>
      {items.map((x) => (
        <button key={x.key} type='button' aria-pressed={value === x.key} onClick={() => onChange(x.key)}
          className={cn('h-9 shrink-0 rounded-full border px-4 text-sm font-medium text-muted-foreground transition-colors duration-150', value === x.key && 'border-foreground bg-foreground text-background')}>
          {x.label}
        </button>
      ))}
    </div>
  )
}

function Players({ row, m, now, kind, setKind }: { row: GameRow; m: SoccerExtra; now: Now; kind: string; setKind: (k: string) => void }) {
  const [all, setAll] = useState(false)
  const kinds = KINDS.filter((k) => m.players.some((p) => p[2] === k.kind && p[3] === k.n))
  const k = kinds.find((x) => x.key === kind) ?? kinds[0]
  const list = m.players.filter((p) => p[2] === k.kind && p[3] === k.n)
    .map((p) => ({ side: p[0], name: p[1], p: now(p[6], p[4], p[5])[0], t: p[6] }))
    .filter((x) => Number.isFinite(x.p)).sort((a, b) => b.p - a.p)
  const shown = all ? list : list.slice(0, 10)
  return (
    <>
      {kinds.length > 1 && <Chips label='Player market' items={kinds} value={k.key} onChange={(x) => { setKind(x); setAll(false) }} />}
      <ul aria-label={`${k.label}: each player's chance`} className='overflow-hidden rounded-2xl bg-card'>
        {shown.map((x, i) => (
          <Rung key={x.t} wide strong={i === 0} p={x.p} label={
            <span className='flex min-w-0 items-center gap-2'>
              <TeamLogo sport={row.sport} code={x.side === 'home' ? row.home : row.away} id={row.ids?.[x.side]} color={row.colors?.[x.side]} px={64} className='size-5 shrink-0 text-[7px]' />
              <span className='truncate'>{x.name}</span>
            </span>
          } />
        ))}
      </ul>
      {list.length > 10 && (
        <button type='button' onClick={() => setAll(!all)} className='h-10 self-start rounded-full px-1 text-sm font-semibold text-devig'>
          {all ? 'Show the top 10' : `Show all ${list.length}`}
        </button>
      )}
    </>
  )
}

function ScoreGrid({ row, scores, now }: { row: GameRow; scores: SoccerExtra['scores']; now: Now }) {
  const cells = new Map(scores.map((s) => [`${s[0]}-${s[1]}`, now(s[4], s[2], s[3])[0]] as const).filter(([, p]) => Number.isFinite(p)))
  const maxH = Math.max(...scores.map((s) => s[0]))
  const maxA = Math.max(...scores.map((s) => s[1]))
  const top = Math.max(...cells.values())
  const best = [...cells.entries()].find(([, p]) => p === top)?.[0]
  const hs = Array.from({ length: maxH + 1 }, (_, i) => i)
  const as = Array.from({ length: maxA + 1 }, (_, i) => i)
  return (
    <div className='overflow-hidden rounded-2xl bg-card p-3'>
      <table className='w-full table-fixed border-separate border-spacing-1 text-center'>
        <caption className='sr-only'>Chance of each final score, {row.home} goals down the side, {row.away} goals across</caption>
        <thead>
          <tr>
            <th scope='col' className='w-9 text-[11px] font-semibold text-muted-foreground'><span className='sr-only'>{row.home} goals</span></th>
            {as.map((a) => <th key={a} scope='col' className='font-condensed text-[13px] font-bold text-muted-foreground'><span className='sr-only'>{row.away} </span>{a}</th>)}
          </tr>
        </thead>
        <tbody>
          {hs.map((h) => (
            <tr key={h}>
              <th scope='row' className='font-condensed text-[13px] font-bold text-muted-foreground'><span className='sr-only'>{row.home} </span>{h}</th>
              {as.map((a) => {
                const p = cells.get(`${h}-${a}`)
                const isBest = best === `${h}-${a}`
                return (
                  <td key={a} className={cn('h-9 rounded-md font-condensed text-[12px] tabular-nums', p == null ? 'text-muted-foreground/40' : isBest ? 'bg-devig font-bold text-background' : 'font-semibold')}
                    style={p != null && !isBest ? { background: `color-mix(in oklab, var(--devig) ${Math.round(8 + 60 * (p / top))}%, transparent)` } : undefined}>
                    {p == null ? '·' : pct(p)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className='mt-1 flex justify-between px-1 text-[11px] text-muted-foreground'>
        <span>↓ {row.home} goals</span><span>{row.away} goals →</span>
      </div>
    </div>
  )
}

function Score({ row, m, now, half, setHalf }: { row: GameRow; m: SoccerExtra; now: Now; half: string; setHalf: (h: string) => void }) {
  const opts = [{ key: 'ft', label: 'Full time' }, ...(m.scores_1h.length ? [{ key: '1h', label: '1st half' }] : [])].filter((o) => o.key === '1h' || m.scores.length)
  const h = opts.find((o) => o.key === half)?.key ?? opts[0]?.key
  const scores = h === '1h' ? m.scores_1h : m.scores
  const best = scores.filter((s) => Number.isFinite(px(s.slice(2) as Px, now))).sort((a, b) => px(b.slice(2) as Px, now) - px(a.slice(2) as Px, now))[0]
  return (
    <>
      {opts.length > 1 && <Chips label='Which score' items={opts} value={h} onChange={setHalf} />}
      {best && (
        <p className='px-1 text-sm text-muted-foreground'>
          Most likely: <b className='font-semibold text-foreground'>{row.home} {best[0]}–{best[1]} {row.away}</b>, {pct(px(best.slice(2) as Px, now))}. Every exact score is a long shot.
        </p>
      )}
      <ScoreGrid row={row} scores={scores} now={now} />
    </>
  )
}

function HalfBlock({ row, title, x, now }: { row: GameRow; title: string; x: Half; now: Now }) {
  const by = (s: Side) => x.spreads.filter((v) => v[0] === s).sort((a, b) => a[1] - b[1])
  return (
    <div className='flex flex-col gap-2'>
      <h3 className='px-1 text-sm font-bold'>{title}</h3>
      {x.win && <Three labels={[`${row.home} ahead`, 'Level', `${row.away} ahead`]} ps={[px(x.win.home, now), px(x.win.draw, now), px(x.win.away, now)]} />}
      {(x.totals.length > 0 || x.btts || x.spreads.length > 0) && (
        <ul className='overflow-hidden rounded-2xl bg-card'>
          {x.totals.map((t) => <Rung key={t[3]} label={`${Math.ceil(t[0])}+ goals`} p={now(t[3], t[1], t[2])[0]} />)}
          {x.btts && <Rung label='Both score' p={px(x.btts, now)} />}
          {(['home', 'away'] as const).flatMap((s) => by(s).map((v) => <Rung key={v[4]} label={`${s === 'home' ? row.home : row.away} by ${Math.ceil(v[1])}+`} p={now(v[4], v[2], v[3])[0]} />))}
        </ul>
      )}
    </div>
  )
}

function Teams({ row, m, now }: { row: GameRow; m: SoccerExtra; now: Now }) {
  const f = (w: 'home' | 'away' | 'none') => m.first.find((v) => v[0] === w)
  const fh = f('home'), fn = f('none'), fa = f('away')
  return (
    <>
      {fh && fa && (
        <div className='flex flex-col gap-2'>
          <h3 className='px-1 text-sm font-bold'>Scores first</h3>
          <Three labels={[row.home, 'No goal', row.away]} ps={[px(fh.slice(1) as Px, now), fn ? px(fn.slice(1) as Px, now) : 0, px(fa.slice(1) as Px, now)]} />
        </div>
      )}
      {m.team_totals.length > 0 && (
        <div className='flex flex-col gap-2'>
          <h3 className='px-1 text-sm font-bold'>Each team&apos;s goals</h3>
          <ul className='overflow-hidden rounded-2xl bg-card'>
            {(['home', 'away'] as const).flatMap((s) => m.team_totals.filter((v) => v[0] === s).map((v) => (
              <Rung key={v[4]} label={`${s === 'home' ? row.home : row.away} ${Math.ceil(v[1])}+`} p={now(v[4], v[2], v[3])[0]} />
            )))}
          </ul>
        </div>
      )}
    </>
  )
}

function Corners({ row, m, now }: { row: GameRow; m: SoccerExtra; now: Now }) {
  return (
    <>
      {m.corners.length > 0 && (
        <ul aria-label='Chance of at least each number of corners' className='overflow-hidden rounded-2xl bg-card'>
          {m.corners.map((v) => <Rung key={v[3]} label={`${v[0]}+ corners`} wide p={now(v[3], v[1], v[2])[0]} />)}
        </ul>
      )}
      {m.team_corners.length > 0 && (
        <ul aria-label="Each team's corners" className='overflow-hidden rounded-2xl bg-card'>
          {(['home', 'away'] as const).flatMap((s) => m.team_corners.filter((v) => v[0] === s).map((v) => (
            <Rung key={v[4]} wide label={`${s === 'home' ? row.home : row.away} ${v[1]}+ corners`} p={now(v[4], v[2], v[3])[0]} />
          )))}
        </ul>
      )}
    </>
  )
}

const TABS = [
  { key: 'players', label: 'Players' },
  { key: 'score', label: 'Correct score' },
  { key: 'halves', label: 'Halves' },
  { key: 'teams', label: 'Team goals' },
  { key: 'corners', label: 'Corners' },
] as const
type Tab = (typeof TABS)[number]['key']

// which tickers a tab shows, for the fresh prices (Kalshi answers 40 at a time)
function tickersOf(tab: Tab, m: SoccerExtra, kind: string, half: string): string[] {
  const k = KINDS.find((x) => x.key === kind)
  switch (tab) {
    case 'players': {
      const ps = m.players.filter((p) => !k || (p[2] === k.kind && p[3] === k.n))
      return ps.sort((a, b) => b[4] - a[4]).map((p) => p[6])
    }
    case 'score': return (half === '1h' ? m.scores_1h : m.scores).map((s) => s[4])
    case 'halves': return Object.values(m.halves).flatMap((h) => h ? [...(h.win ? [h.win.home[2], h.win.draw[2], h.win.away[2]] : []), ...h.totals.map((t) => t[3]), ...(h.btts ? [h.btts[2]] : []), ...h.spreads.map((s) => s[4])] : [])
    case 'teams': return [...m.first.map((f) => f[3]), ...m.team_totals.map((t) => t[4])]
    case 'corners': return [...m.corners.map((c) => c[3]), ...m.team_corners.map((c) => c[4])]
  }
}

export function SoccerMarkets({ row, m }: { row: GameRow; m: SoccerExtra | null | undefined }) {
  const [tab, setTab] = useState<Tab | null>(null)
  const [kind, setKind] = useState('goal1')
  const [half, setHalf] = useState('ft')
  const has: Record<Tab, boolean> = {
    players: !!m?.players.length,
    score: !!(m?.scores.length || m?.scores_1h.length),
    halves: !!m && Object.values(m.halves).some((h) => h && (h.win || h.totals.length || h.btts || h.spreads.length)),
    teams: !!(m?.first.length || m?.team_totals.length),
    corners: !!(m?.corners.length || m?.team_corners.length),
  }
  const tabs = TABS.filter((t) => has[t.key])
  const t = tabs.find((x) => x.key === tab)?.key ?? tabs[0]?.key
  const fresh = useFresh(m && t ? tickersOf(t, m, kind, half) : [], row.state)
  // a market whose bid and ask are more than 15¢ apart says little: its price comes back NaN and its row is left out
  const now: Now = (tk, mid, ask) => {
    const [md, a] = fresh(tk, mid, ask)
    return a != null && 2 * (a - md) > 0.15 ? [NaN, a] : [md, a]
  }
  if (!m || !t || row.state === 'post') return null
  const halves = (['1', '2'] as const).filter((h) => { const x = m.halves[h]; return x && (x.win || x.totals.length || x.btts || x.spreads.length) })
  return (
    <section aria-labelledby='mkts-h' className='flex flex-col gap-3'>
      <h2 id='mkts-h' className='px-1 font-display text-[22px] font-extrabold'>More markets</h2>
      <div role='tablist' aria-label='Market' className='no-scrollbar -mx-4 -mt-1 flex gap-1 overflow-x-auto border-b px-4'>
        {tabs.map((x) => (
          <button key={x.key} type='button' role='tab' aria-selected={t === x.key} aria-controls='mkts-panel' onClick={() => setTab(x.key)}
            className={cn('-mb-px h-10 shrink-0 border-b-2 border-transparent px-3 text-[13px] font-semibold text-muted-foreground transition-colors duration-150', t === x.key && 'border-foreground text-foreground')}>
            {x.label}
          </button>
        ))}
      </div>
      <div id='mkts-panel' role='tabpanel' className='flex flex-col gap-3'>
        {t === 'players' && <Players row={row} m={m} now={now} kind={kind} setKind={setKind} />}
        {t === 'score' && <Score row={row} m={m} now={now} half={half} setHalf={setHalf} />}
        {t === 'halves' && halves.map((h) => <HalfBlock key={h} row={row} title={h === '1' ? '1st half' : '2nd half on its own'} x={m.halves[h]!} now={now} />)}
        {t === 'teams' && <Teams row={row} m={m} now={now} />}
        {t === 'corners' && <Corners row={row} m={m} now={now} />}
      </div>
      <p className='px-1 text-xs leading-relaxed text-muted-foreground'>
        {t === 'players' ? 'Kalshi’s mid price for yes on each player. Kalshi opens these a day or two before kickoff. ' : ''}
        {t === 'halves' ? 'The 2nd half counts only goals after the break. Who’s ahead is scaled to add up to 100%. ' : ''}
        {t === 'teams' ? 'Scores first is scaled to add up to 100%. ' : ''}
        {t === 'score' ? 'Each cell is Kalshi’s mid price for that exact score; scores Kalshi doesn’t list show a dot. ' : ''}
        Kalshi&apos;s prices now when it answers; thinly quoted ones (bid and ask over 15¢ apart) are left out. 90 minutes plus stoppage time.
      </p>
    </section>
  )
}
