import { useEffect, useMemo, useRef, useState } from 'react'
import type { GameRow } from '@/lib/devig'
import { normName } from '@/lib/headshots'
import { sideMap, teamStats, useSummary } from '@/lib/wrap'
import { cn } from '@/lib/utils'

// Game page → Box score: every player's line from ESPN, refreshed every 15s while the game is on. A parlay leg on a
// player opens here with ?player=Name, and that player's row is highlighted and scrolled into view.

// ESPN's stat keys → short column heads (anything not listed falls back to a shortened key)
const HEAD: Record<string, string> = {
  minutes: 'MIN', points: 'PTS', rebounds: 'REB', assists: 'AST', steals: 'STL', blocks: 'BLK', turnovers: 'TO', fouls: 'PF',
  plusMinus: '+/-', offensiveRebounds: 'OR', defensiveRebounds: 'DR',
  'fieldGoalsMade-fieldGoalsAttempted': 'FG', 'threePointFieldGoalsMade-threePointFieldGoalsAttempted': '3PT', 'freeThrowsMade-freeThrowsAttempted': 'FT',
  goals: 'G', shotsTotal: 'SOG', hits: 'HIT', blockedShots: 'BS', timeOnIce: 'TOI', penaltyMinutes: 'PIM', saves: 'SV', savePct: 'SV%',
  atBats: 'AB', runs: 'R', RBIs: 'RBI', homeRuns: 'HR', walks: 'BB', strikeouts: 'K', avg: 'AVG', fullInnings: 'IP', earnedRuns: 'ER', pitches: 'P',
}
// basketball: the order people read a box score in; the rest go after
const ORDER = ['minutes', 'points', 'rebounds', 'assists', 'fouls', 'steals', 'blocks', 'turnovers', 'fieldGoalsMade-fieldGoalsAttempted',
  'threePointFieldGoalsMade-threePointFieldGoalsAttempted', 'freeThrowsMade-freeThrowsAttempted', 'offensiveRebounds', 'defensiveRebounds', 'plusMinus']
const head = (k: string) => HEAD[k] ?? k.replace(/[a-z]+/g, (w, i) => (i ? '' : w.slice(0, 3))).toUpperCase().slice(0, 4)
// team totals worth a line under each table
const TEAM = [['totalRebounds', 'Reb'], ['fouls', 'Fouls'], ['turnovers', 'TO'], ['fieldGoalPct', 'FG%'], ['threePointFieldGoalPct', '3P%'], ['largestLead', 'Lead']]

type Raw = any // eslint-disable-line @typescript-eslint/no-explicit-any
type Group = { name: string; keys: string[]; rows: { id: string; name: string; stats: string[] }[] }

function groups(t: Raw): Group[] {
  return (t.statistics ?? []).map((g: Raw) => {
    const keys: string[] = g.keys ?? []
    const idx = keys.map((_, i) => i).sort((a, b) => {
      const x = ORDER.indexOf(keys[a]), y = ORDER.indexOf(keys[b])
      return (x < 0 ? 99 : x) - (y < 0 ? 99 : y)
    })
    return {
      name: g.name ?? '',
      keys: idx.map((i) => keys[i]),
      rows: (g.athletes ?? []).filter((a: Raw) => a.stats?.length)
        .map((a: Raw) => ({ id: String(a.athlete?.id ?? ''), name: a.athlete?.displayName ?? '', stats: idx.map((i) => a.stats[i] ?? '') })),
    }
  }).filter((g: Group) => g.rows.length)
}

export function BoxScore({ row, focus }: { row: GameRow; focus?: string }) {
  const { data: sum } = useSummary(row)
  const [side, setSide] = useState<'away' | 'home' | null>(null)
  const hit = useRef<HTMLTableRowElement>(null)
  const want = focus ? normName(focus) : ''

  const teams = useMemo(() => {
    if (!sum) return null
    const sides = sideMap(sum)
    const tot = teamStats(sum, sides)
    const out: Record<'away' | 'home', Group[]> = { away: [], home: [] }
    for (const t of sum.boxscore?.players ?? []) {
      const s = sides[String(t.team?.id)]
      if (s) out[s] = groups(t)
    }
    return out.away.length || out.home.length ? { g: out, tot } : null
  }, [sum])

  // open on the focused player's team
  const focusSide = useMemo(() => {
    if (!teams || !want) return null
    for (const s of ['away', 'home'] as const) if (teams.g[s].some((g) => g.rows.some((r) => normName(r.name) === want))) return s
    return null
  }, [teams, want])
  const shown = side ?? focusSide ?? 'away'

  useEffect(() => {
    if (focusSide && hit.current) hit.current.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [focusSide])

  if (row.state === 'pre' || !teams) return null
  const code = { away: row.away, home: row.home }
  const tot = teams.tot[shown]

  return (
    <section aria-label='Box score' className='flex flex-col gap-2'>
      <div className='flex items-end justify-between gap-3 px-1'>
        <h2 className='font-display text-[22px] font-extrabold'>Box score</h2>
        {row.state === 'in' && <span className='pb-1 text-xs font-semibold text-devig'>Live · updates every 15s</span>}
      </div>
      <div className='overflow-hidden rounded-[18px] bg-card'>
        <div role='tablist' className='flex gap-1 border-b p-1.5'>
          {(['away', 'home'] as const).map((s) => (
            <button key={s} type='button' role='tab' aria-selected={shown === s} onClick={() => setSide(s)}
              className={cn('h-10 flex-1 rounded-xl text-sm font-bold', shown === s ? 'bg-devig text-devig-ink' : 'text-muted-foreground')}>
              {code[s]}
            </button>
          ))}
        </div>
        {teams.g[shown].map((g) => (
          <div key={g.name} className='overflow-x-auto'>
            {teams.g[shown].length > 1 && g.name && <p className='px-4 pt-2.5 text-xs font-bold tracking-wide text-muted-foreground uppercase'>{g.name}</p>}
            <table className='w-full text-sm tabular-nums'>
              <thead>
                <tr className='text-xs text-muted-foreground'>
                  <th scope='col' className='sticky left-0 bg-card px-4 py-2 text-left font-semibold'>Player</th>
                  {g.keys.map((k) => <th key={k} scope='col' className='px-2 py-2 text-right font-semibold whitespace-nowrap'>{head(k)}</th>)}
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r) => {
                  const me = !!want && normName(r.name) === want
                  return (
                    <tr key={r.id} ref={me ? hit : undefined} className={cn('border-t', me && 'bg-devig/15')}>
                      <th scope='row' className={cn('sticky left-0 max-w-[9.5rem] truncate px-4 py-2 text-left font-semibold', me ? 'bg-[color-mix(in_oklab,var(--devig)_15%,var(--card))]' : 'bg-card')}>{r.name}</th>
                      {r.stats.map((v, i) => <td key={i} className='px-2 py-2 text-right whitespace-nowrap'>{v}</td>)}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))}
        {TEAM.some(([k]) => tot[k]) && (
          <p className='flex flex-wrap gap-x-4 gap-y-1 border-t px-4 py-2.5 text-xs text-muted-foreground'>
            <span className='font-bold text-foreground'>{code[shown]} team</span>
            {TEAM.filter(([k]) => tot[k]).map(([k, l]) => <span key={k}>{l} <b className='text-foreground tabular-nums'>{tot[k]}</b></span>)}
          </p>
        )}
      </div>
    </section>
  )
}
