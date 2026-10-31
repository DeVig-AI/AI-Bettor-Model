import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'
import { useProps } from '@/lib/props'
import {
  type Col, type RsIndex, type RsPlayer, type RsTeam, isLight, logIdx, norm, ordinal, rsCell, rsDate, rsShort, rsSigned,
  statValue, teamColor, useRsIndex, useRsTeam,
} from '@/lib/research'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

// One team: a plate in its colour, where it ranks, this season next to last, recent games, and the roster. When the
// team's next game has Kalshi prop lines, each player shows his main line and how often he went over it lately.

const timeFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
const updatedFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })

export function BackBar({ to = '/research', label = 'Research' }: { to?: string; label?: string }) {
  return (
    <div className='bg-background px-2 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2'>
      <button type='button' onClick={() => (history.length > 1 ? history.back() : (location.hash = `#${to}`))}
        className='inline-flex h-10 items-center gap-1 rounded-full ps-2 pe-4 text-sm font-semibold text-muted-foreground hover:text-foreground'>
        <ChevronLeft className='size-4' aria-hidden='true' /> {label}
      </button>
    </div>
  )
}

export function TeamPlate({ sport, code, color, title, sub, right }: {
  sport: string; code: string; color?: string | null; title: string; sub: string; right?: React.ReactNode
}) {
  const c = teamColor(sport, code, color)
  const light = isLight(c)
  return (
    <section aria-label={title} className={cn('relative overflow-hidden', light ? 'text-[#111]' : 'text-white')}
      style={{ background: `linear-gradient(102deg, ${c} 0 68%, color-mix(in srgb, ${c} 70%, #000) 68% 100%)` }}>
      <span aria-hidden='true' className='pointer-events-none absolute -end-3 -bottom-6 font-display text-[120px] leading-none font-black opacity-15'>
        {code}
      </span>
      <div className='relative flex min-h-[132px] items-end justify-between gap-3 px-4 py-4 md:px-6'>
        <div className='min-w-0'>
          <h1 className='font-display text-[34px] leading-[0.95] font-black'>{title}</h1>
          <p className={cn('mt-1.5 text-sm font-medium', light ? 'text-black/70' : 'text-white/80')}>{sub}</p>
        </div>
        {right}
      </div>
    </section>
  )
}

type Lines = { opp: string; home: boolean; kickoff: string; byPlayer: Map<string, Map<string, number>> }

function Notes({ idx, sport, team, p, lines }: { idx: RsIndex; sport: string; team: string; p: RsPlayer; lines: Lines | null }) {
  const mine = lines?.byPlayer.get(norm(p.name))
  if (!mine) return null
  const L = logIdx(idx)
  const src = p.this || p.last || {}
  const stats = (idx.hit_stats ?? []).filter((s) => mine.has(s[0])).slice(0, 2)
  if (!stats.length) return null
  return (
    <div className='flex flex-wrap gap-1.5 pt-1.5'>
      {stats.map((s) => {
        const line = mine.get(s[0])!
        let o = 0, n = 0
        for (const g of (p.log ?? []).slice(0, 5)) {
          const v = statValue(g, L, s[2])
          if (v == null) continue
          n++
          if (v > line) o++
        }
        const avg = s[2].reduce((m, c) => m + Number(src[c] ?? 0), 0)
        const tone = n && o / n >= 0.8 ? 'border-good/40 text-good' : n && o / n <= 0.2 ? 'border-bad/40 text-bad' : 'text-muted-foreground'
        return (
          <Link key={s[0]} to='/research/player/$sport/$team/$id' params={{ sport, team, id: String(p.id) }} search={{ stat: s[0], line }}
            className={cn('rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums hover:bg-muted/50', tone)}>
            {s[1]} {line}{n ? ` · over ${o} of last ${n}` : ''} · avg {avg.toFixed(1)}
          </Link>
        )
      })}
    </div>
  )
}

function Roster({ idx, t, sport, lines }: { idx: RsIndex; t: RsTeam; sport: string; lines: Lines | null }) {
  const units = idx.roster_units
  const [unit, setUnit] = useState(units?.[0][0] ?? '')
  const groups: { name: string | null; list: RsPlayer[]; cols: Col[] }[] = units
    ? (units.find((u) => u[0] === unit) ?? units[0])[1].map((grp) => ({
        name: idx.group_names?.[grp] ?? grp,
        list: (t.players ?? []).filter((p) => p.grp === grp),
        cols: idx.group_cols?.[grp] ?? idx.roster_cols ?? [],
      }))
    : [{ name: null, list: t.players ?? [], cols: idx.roster_cols ?? [] }]
  const onDef = !!(units && units[1] && unit === units[1][0] && idx.player_note_def)
  return (
    <section aria-label='Roster' className='flex flex-col gap-2'>
      <h2 className='px-1 font-display text-[22px] font-extrabold'>Roster</h2>
      {lines && (
        <p className='-mt-1 px-1 text-xs text-muted-foreground'>
          Lines: {lines.home ? 'vs' : 'at'} {lines.opp}, {timeFmt.format(new Date(lines.kickoff))}. Kalshi&apos;s main line (priced nearest 50/50), and how often
          he went over it in his last 5 games.
        </p>
      )}
      {units && (
        <div className='flex gap-2'>
          {units.map((u) => (
            <button key={u[0]} type='button' aria-pressed={unit === u[0]} onClick={() => setUnit(u[0])}
              className={cn('h-9 rounded-full border px-4 text-sm font-medium text-muted-foreground', unit === u[0] && 'border-foreground bg-foreground text-background')}>
              {u[0]}
            </button>
          ))}
        </div>
      )}
      {groups.filter((g) => g.list.length).map((g) => (
        <div key={g.name ?? 'all'} className='overflow-hidden rounded-[18px] bg-card'>
          {g.name && <div className='px-4 pt-3 text-xs font-bold tracking-wide text-muted-foreground uppercase'>{g.name}</div>}
          <div className='overflow-x-auto'>
            <table className='w-full whitespace-nowrap min-w-[420px] text-sm'>
              <thead>
                <tr className='text-xs text-muted-foreground'>
                  <th className='px-4 py-2 text-start font-semibold'>Player</th>
                  {g.cols.map((c) => <th key={c[1]} className='px-2 py-2 text-end font-semibold'>{c[0]}</th>)}
                </tr>
              </thead>
              <tbody>
                {g.list.map((p) => {
                  const s = p.this || p.last || {}
                  return (
                    <tr key={String(p.id)} className='border-t align-top'>
                      <td className='px-4 py-2.5'>
                        <Link to='/research/player/$sport/$team/$id' params={{ sport, team: t.code, id: String(p.id) }} className='font-semibold hover:text-devig'>
                          {p.name}
                        </Link>{' '}
                        <span className='text-xs text-muted-foreground'>{p.pos}{!p.this ? ` · ${rsShort(t.last_season)}` : ''}</span>
                        <Notes idx={idx} sport={sport} team={t.code} p={p} lines={lines} />
                      </td>
                      {g.cols.map((c) => <td key={c[1]} className='px-2 py-2.5 text-end font-condensed text-[15px] tabular-nums'>{rsCell(s[c[1]], c)}</td>)}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <p className='px-1 text-xs text-muted-foreground'>
        {(onDef ? idx.player_note_def : idx.player_note) || ''} A player&apos;s team is the team of his latest game. Updated {updatedFmt.format(new Date(t.generated_at))}.
      </p>
    </section>
  )
}

export function ResearchTeam({ sport, code }: { sport: string; code: string }) {
  const idxQ = useRsIndex(sport)
  const tQ = useRsTeam(sport, code)
  const { lines: propLines } = useProps()
  const idx = idxQ.data, t = tQ.data

  // the team's next game with prop lines: each player's main line per stat (the Kalshi rung nearest 50/50)
  const lines = useMemo<Lines | null>(() => {
    const mine = propLines
      .filter((l) => l.sport === sport && (l.away === code || l.home === code) && Date.parse(l.kickoff) > Date.now())
      .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff))
    if (!mine.length) return null
    const g = mine[0].gameKey
    const best = new Map<string, Map<string, { line: number; gap: number }>>()
    for (const l of mine.filter((x) => x.gameKey === g)) {
      const gap = l.bid != null && l.ask != null ? Math.abs((l.bid + l.ask) / 2 - 0.5) : 1
      const k = norm(l.player)
      const m = best.get(k) ?? new Map()
      const cur = m.get(l.stat)
      if (!cur || gap < cur.gap) m.set(l.stat, { line: l.line, gap })
      best.set(k, m)
    }
    const f = mine[0]
    return {
      opp: f.away === code ? f.home : f.away, home: f.home === code, kickoff: f.kickoff,
      byPlayer: new Map([...best].map(([k, m]) => [k, new Map([...m].map(([s, v]) => [s, v.line]))])),
    }
  }, [propLines, sport, code])

  if (idxQ.error || tQ.error) {
    return (<><BackBar /><p className='p-8 text-center text-muted-foreground'>No stats for {code} right now.</p></>)
  }
  if (!idx || !t) {
    return (<><BackBar /><Skeleton className='h-[132px] w-full rounded-none' /><div className='p-4'><Skeleton className='h-80 w-full rounded-[18px]' /></div></>)
  }
  const nTeams = idx.teams.length || 32
  const ranks = t.ranks ?? {}
  const hasLast = !!t.last_season && t.last_season !== '—'
  const best = (idx.team_rows ?? []).filter((c) => ranks[c[1]]).sort((a, b) => ranks[a[1]] - ranks[b[1]]).slice(0, 3)
  const games = (t.games ?? []).slice(0, 10)

  return (
    <>
      <BackBar />
      <TeamPlate sport={sport} code={t.code} color={t.color} title={t.name}
        sub={`#${t.rank} in DeVig's ${sport} power rankings · rating ${rsSigned(t.rating)}`}
        right={t.this?.record ? <span className='shrink-0 font-display text-4xl font-black tabular-nums'>{String(t.this.record).replace(/-/g, '–')}</span> : null} />
      <main className='flex flex-col gap-5 px-4 py-5 md:px-6'>
        {best.length > 0 && t.this && (
          <div className='grid grid-cols-3 gap-2'>
            {best.map((c) => (
              <div key={c[1]} className='rounded-2xl bg-card px-3 py-2.5'>
                <div className='font-display text-2xl font-black text-good'>{ordinal(ranks[c[1]])}</div>
                <div className='text-xs leading-tight text-muted-foreground'>{c[0]}</div>
              </div>
            ))}
          </div>
        )}

        <section aria-label='Team stats' className='overflow-hidden rounded-[18px] bg-card'>
          <table className='w-full whitespace-nowrap text-sm'>
            <thead>
              <tr className='text-xs text-muted-foreground'>
                <th className='px-4 py-2.5 text-start font-semibold'>Per game</th>
                <th className='px-2 py-2.5 text-end font-semibold'>{rsShort(t.season)}</th>
                <th className='w-12 px-2 py-2.5 text-end font-semibold'>Rank</th>
                {hasLast && <th className='px-4 py-2.5 text-end font-semibold'>{rsShort(t.last_season)}</th>}
              </tr>
            </thead>
            <tbody>
              {(idx.team_rows ?? []).map((c) => {
                const k = ranks[c[1]]
                return (
                  <tr key={c[1]} className='border-t'>
                    <td className='px-4 py-2'>{c[0]}</td>
                    <td className='px-2 py-2 text-end font-condensed text-[15px] font-semibold tabular-nums'>{t.this ? rsCell(t.this[c[1]], c) : '—'}</td>
                    <td className={cn('px-2 py-2 text-end text-xs font-semibold tabular-nums', k && k <= 5 ? 'text-good' : k && k > nTeams - 5 ? 'text-bad' : 'text-muted-foreground')}>
                      {k ? ordinal(k) : ''}
                    </td>
                    {hasLast && <td className='px-4 py-2 text-end font-condensed text-[15px] tabular-nums text-muted-foreground'>{t.last ? rsCell(t.last[c[1]], c) : '—'}</td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
        {t.ranks && (
          <p className='-mt-3 px-1 text-xs text-muted-foreground'>
            Rank among all {nTeams} teams this season (1st = best; where fewer is better, like points allowed, the fewest is 1st).
          </p>
        )}

        {games.length > 0 && (
          <section aria-label='Recent games' className='flex flex-col gap-2'>
            <h2 className='px-1 font-display text-[22px] font-extrabold'>Recent games</h2>
            <ul className='overflow-hidden rounded-[18px] bg-card'>
              {games.map((g) => (
                <li key={`${g[0]}${g[1]}`} className='flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0'>
                  <span className={cn('grid size-7 shrink-0 place-items-center rounded-md text-xs font-black', g[5] === 'W' ? 'bg-good/15 text-good' : 'bg-bad/15 text-bad')}>{g[5]}</span>
                  <span className='min-w-0 flex-1 text-sm'>
                    <span className='text-muted-foreground'>{rsDate(g[0])}</span> {g[2] === 'H' ? 'vs' : 'at'} <span className='font-semibold'>{g[1]}</span>
                    {g[6] === 'P' && <span className='ms-1.5 text-xs text-muted-foreground'>playoffs</span>}
                  </span>
                  <span className='font-condensed text-[17px] font-bold tabular-nums'>{g[3]}–{g[4]}</span>
                  {g[8] && <span className='text-xs text-muted-foreground'>{g[8]}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <Roster idx={idx} t={t} sport={sport} lines={lines} />
        <p className='px-1 text-xs text-muted-foreground'>{idx.source}</p>
      </main>
    </>
  )
}

