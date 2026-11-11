import { useQuery } from '@tanstack/react-query'
import { type GameRow, fmtPct, getJson } from '@/lib/devig'

// "Where the sharps are": Polymarket's top 20 sports earners this month and their moneyline money on this game, before
// the start (tools/sharps_now.py writes live/sharps/now.json twice an hour). A trader counts for a team with at least
// $1,000 more on it than on the other team. Not a DeVig pick and not proven: SHARPS_LIVE_V1_PREREG.md tests it.

type Trader = { rank: number; name: string; pnl: number; side: 'away' | 'home'; usd: number }
type Card = {
  sport: string; away: string; home: string; kickoff: string; at: string
  usd_away: number; usd_home: number; n_away: number; n_home: number
  side: '' | 'away' | 'home'; poly_away: number | null; traders: Trader[]
}
type File = { generated_at: string; games: Record<string, Card> }

function hex(c: string | undefined | null) {
  if (!c) return null
  const v = c.startsWith('#') ? c : `#${c}`
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : null
}

function usd(n: number) {
  const a = Math.abs(n)
  if (a >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (a >= 1e3) return `$${(n / 1e3).toFixed(1)}k`
  return `$${Math.round(n)}`
}

function useSharps(row: GameRow) {
  const q = useQuery({ queryKey: ['sharps'], queryFn: () => getJson<File>('live/sharps/now.json'), refetchInterval: 10 * 60e3, retry: 1 })
  const t = Date.parse(row.kickoff)
  return Object.values(q.data?.games ?? {}).find((g) =>
    g.sport === row.sport && g.away === row.away && g.home === row.home && Math.abs(Date.parse(g.kickoff) - t) < 12 * 3600e3)
}

export function Sharps({ row }: { row: GameRow }) {
  const c = useSharps(row)
  if (!c) return null
  const started = Date.now() >= Date.parse(c.kickoff)
  const when = started ? 'at the start' : 'so far'
  const team = (s: 'away' | 'home') => (s === 'away' ? row.away : row.home)
  if (!c.side) {
    return (
      <section className='rounded-2xl bg-card p-4'>
        <div className='flex items-center gap-2'>
          <h3 className='font-display text-xl font-extrabold'>Where the sharps are</h3>
          <span className='ms-auto shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground'>Polymarket · not a pick</span>
        </div>
        <p className='mt-1 text-sm text-muted-foreground'>
          None of Polymarket&apos;s top 20 sports earners this month has $1,000 or more on either team {when}.
        </p>
      </section>
    )
  }
  const colors = { away: hex(row.colors?.away) ?? 'var(--side-away)', home: hex(row.colors?.home) ?? 'var(--side-home)' }
  const total = c.usd_away + c.usd_home
  const n = c.n_away + c.n_home
  const shown = c.traders.slice(0, 3)
  const polyFor = c.poly_away == null ? null : c.side === 'away' ? c.poly_away : 1 - c.poly_away
  const kalFor = row.fairHome == null ? null : c.side === 'home' ? row.fairHome : 1 - row.fairHome
  return (
    <section className='rounded-2xl bg-card p-4'>
      <div className='flex items-center gap-2'>
        <h3 className='font-display text-xl font-extrabold'>Where the sharps are</h3>
        <span className='ms-auto shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground'>Polymarket · not a pick</span>
      </div>
      <p className='mt-1 text-sm text-muted-foreground'>
        Moneyline money from Polymarket&apos;s top 20 sports earners this month, {started ? 'at the start' : 'before the start'}.
      </p>
      <div className='mt-3 flex items-baseline justify-between font-condensed text-[15px] font-bold tabular-nums'>
        {(['away', 'home'] as const).map((s) => (
          <span key={s} className={c.side === s ? '' : 'text-muted-foreground'}>{team(s)} {usd(s === 'away' ? c.usd_away : c.usd_home)}</span>
        ))}
      </div>
      <div className='mt-1.5 flex h-2.5 gap-1' role='img'
        aria-label={`${row.away} ${usd(c.usd_away)}, ${row.home} ${usd(c.usd_home)}`}>
        {(['away', 'home'] as const).map((s) => {
          const v = s === 'away' ? c.usd_away : c.usd_home
          return <div key={s} className={v ? 'rounded-full' : 'rounded-full bg-muted'}
            style={{ flex: v ? v / total : 0.02, background: v ? colors[s] : undefined, boxShadow: v ? 'inset 0 0 0 1px rgba(255,255,255,.25)' : undefined }} />
        })}
      </div>
      <div className='mt-1 flex justify-between text-[11px] text-muted-foreground tabular-nums'>
        <span>{c.n_away} trader{c.n_away === 1 ? '' : 's'}</span><span>{c.n_home} trader{c.n_home === 1 ? '' : 's'}</span>
      </div>
      <ul className='mt-3 flex flex-col gap-1.5'>
        {shown.map((t) => (
          <li key={t.rank} className='rounded-xl bg-muted/60 px-3 py-2 text-[13px]'>
            <div className='flex items-center gap-2'>
              <span className='font-bold tabular-nums text-muted-foreground'>#{t.rank}</span>
              <span className='min-w-0 truncate font-semibold'>{t.name || 'Anonymous'}</span>
              <span className='ms-auto shrink-0 font-bold tabular-nums'>{team(t.side)} {usd(t.usd)}</span>
            </div>
            <div className='mt-0.5 text-[11px] text-muted-foreground tabular-nums'>{t.pnl >= 0 ? '+' : '−'}{usd(Math.abs(t.pnl))} on sports this month</div>
          </li>
        ))}
        {c.traders.length > shown.length && (
          <li className='px-1 text-[11px] text-muted-foreground'>+{c.traders.length - shown.length} more</li>
        )}
      </ul>
      <div className='mt-3 grid grid-cols-2 gap-2 text-center'>
        <div className='rounded-xl bg-muted/60 py-1.5'>
          <div className='text-[11px] text-muted-foreground'>Polymarket</div>
          <div className='font-condensed font-bold tabular-nums'>{team(c.side)} {fmtPct(polyFor, 1)}</div>
        </div>
        <div className='rounded-xl bg-muted/60 py-1.5'>
          <div className='text-[11px] text-muted-foreground'>Kalshi, no fee</div>
          <div className='font-condensed font-bold tabular-nums'>{team(c.side)} {fmtPct(kalFor)}</div>
        </div>
      </div>
      <p className='mt-3 text-[11px] leading-snug text-muted-foreground'>
        {n === 1 ? "One wallet's bet, not a consensus. " : ''}
        Not a DeVig pick and not proven: topping a month&apos;s list doesn&apos;t prove an edge, and some of these wallets
        bet both sides. We&apos;re testing whether following them beats Kalshi&apos;s price (first look Dec 15).
      </p>
    </section>
  )
}
