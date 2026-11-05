import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { fmtPct } from '@/lib/devig'
import { type Future, type FutureRow, type GoalsRow, midOf, useSoccerFutures } from '@/lib/soccer'
import { cn } from '@/lib/utils'
import { TeamLogo } from '@/components/team-logo'

// Kalshi's season markets beside a league's table: who wins it, top finishes, who goes down, the Golden Boot, players'
// season goals. The middle of Kalshi's bid and ask; a market quoted too thinly to say much is left out. No model.

const pct = (p: number) => (p > 0 && p < 0.005 ? '<1%' : fmtPct(p))

function Bar({ p, strong }: { p: number; strong?: boolean }) {
  return (
    <span aria-hidden='true' className='h-2 w-20 shrink-0 overflow-hidden rounded-full bg-muted sm:w-32'>
      <span className={cn('block h-full rounded-full', strong ? 'bg-devig' : 'bg-foreground/45')} style={{ width: `${Math.max(1, Math.min(100, p * 100))}%` }} />
    </span>
  )
}

function rowsOf(m: Future) {
  if (m.key === 'seasongoal') {
    // one line per player: the count nearest an even chance
    const by = new Map<string, { n: number; p: number }[]>()
    for (const r of m.rows as GoalsRow[]) {
      const p = midOf(r[3], r[4])
      if (p != null) by.set(r[1], [...(by.get(r[1]) ?? []), { n: r[2], p }])
    }
    return [...by.entries()].map(([name, xs]) => {
      const x = xs.reduce((a, b) => (Math.abs(b.p - 0.5) < Math.abs(a.p - 0.5) ? b : a))
      return { id: null, name: `${name}: ${x.n}+ goals`, p: x.p, t: name }
    }).sort((a, b) => b.p - a.p)
  }
  return (m.rows as FutureRow[]).map((r) => ({ id: r[0], name: r[1], p: midOf(r[2], r[3]), t: r[4] }))
    .filter((r): r is { id: string | null; name: string; p: number; t: string } => r.p != null)
    .sort((a, b) => (m.key === 'margin' ? 0 : b.p - a.p))
}

export function SeasonMarkets({ league, teams }: { league: string; teams?: Record<string, { code: string; color: string | null }> }) {
  const { data } = useSoccerFutures()
  const [key, setKey] = useState<string | null>(null)
  const [all, setAll] = useState(false)
  const ms = (data?.leagues[league] ?? []).filter((m) => rowsOf(m).length > 0)
  if (!ms.length) return null
  const m = ms.find((x) => x.key === key) ?? ms[0]
  const rows = rowsOf(m)
  const shown = all ? rows : rows.slice(0, 8)
  return (
    <section aria-labelledby='season-h' className='flex flex-col gap-3'>
      <h2 id='season-h' className='px-1 font-display text-[22px] font-extrabold'>Season markets</h2>
      <div role='group' aria-label='Season market' className='no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4'>
        {ms.map((x) => (
          <button key={x.key} type='button' aria-pressed={m.key === x.key} onClick={() => { setKey(x.key); setAll(false) }}
            className={cn('h-9 shrink-0 rounded-full border px-4 text-sm font-medium text-muted-foreground transition-colors duration-150', m.key === x.key && 'border-foreground bg-foreground text-background')}>
            {x.label}
          </button>
        ))}
      </div>
      <ul aria-label={`${m.label}: Kalshi's chances`} className='overflow-hidden rounded-[18px] bg-card'>
        {shown.map((r, i) => {
          const inner = (
            <>
              {m.who === 'team' && <TeamLogo sport={league} code={(r.id && teams?.[r.id]?.code) || r.name.slice(0, 3).toUpperCase()} id={r.id} color={r.id ? teams?.[r.id]?.color : null} px={64} className='size-7 shrink-0 text-[9px]' />}
              <span className={cn('min-w-0 flex-1 truncate', i === 0 && m.key !== 'margin' && 'font-semibold')}>{r.name}</span>
              <Bar p={r.p} strong={i === 0 && m.key !== 'margin'} />
              <span className='w-11 shrink-0 text-end font-condensed text-[16px] font-bold tabular-nums'>{pct(r.p)}</span>
            </>
          )
          return (
            <li key={r.t} className='border-b last:border-b-0'>
              {r.id ? (
                <Link to='/research/team/$sport/$code' params={{ sport: league, code: r.id }} className='flex min-h-12 items-center gap-3 px-4 py-2 hover:bg-muted/50'>{inner}</Link>
              ) : <div className='flex min-h-12 items-center gap-3 px-4 py-2'>{inner}</div>}
            </li>
          )
        })}
      </ul>
      {rows.length > 8 && (
        <button type='button' onClick={() => setAll(!all)} className='-mt-1 h-10 self-start px-1 text-sm font-semibold text-devig'>
          {all ? 'Show fewer' : `Show all ${rows.length}`}
        </button>
      )}
      <p className='px-1 text-xs leading-relaxed text-muted-foreground'>
        Kalshi&apos;s price for yes, the middle of its bid and ask, so a column can add up to a bit more or less than it should.
        {m.key === 'seasongoal' ? ' Each player shows the goal count Kalshi rates nearest a coin flip.' : ''} Thinly quoted ones are left out.
      </p>
    </section>
  )
}

// one team's season markets, for its profile: [label, chance]
export function useTeamFutures(league: string, id: string) {
  const { data } = useSoccerFutures()
  return (data?.leagues[league] ?? []).filter((m) => m.who === 'team').flatMap((m) => {
    const r = (m.rows as FutureRow[]).find((x) => x[0] === id)
    const p = r ? midOf(r[2], r[3]) : null
    return p == null ? [] : [{ key: m.key, label: m.label, p }]
  })
}
