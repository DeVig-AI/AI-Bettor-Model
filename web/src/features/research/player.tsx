import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { type RsPlayer, isDefense, logIdx, rsCell, rsDate, rsShort, seasonYear, statValue, useRsIndex, useRsTeam } from '@/lib/research'
import { useRosterPlayer } from '@/lib/headshots'
import { statsPhoto } from '@/lib/logos'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { BackBar, TeamPlate } from './team'

// One player: this season next to last, how often he cleared a line you pick (counts, not chances), and his game log.

type Row = (string | number | null)[]

function Count({ label, games, line, val }: { label: string; games: Row[]; line: number; val: (g: Row) => number | null }) {
  const vals = games.map(val).filter((v): v is number => v != null)
  const n = vals.length
  const o = vals.filter((v) => v > line).length
  const share = n ? o / n : 0
  return (
    <li className='flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0'>
      <span className='w-32 shrink-0 text-sm'>{label}</span>
      <span aria-hidden='true' className='relative h-2 min-w-0 flex-1 rounded-full bg-muted'>
        {n > 0 && <span className={cn('absolute inset-y-0 left-0 rounded-full', share >= 0.5 ? 'bg-good' : 'bg-bad')} style={{ width: `${share * 100}%` }} />}
      </span>
      <span className='w-24 shrink-0 text-end font-condensed text-[15px] font-semibold tabular-nums'>
        {n ? `${o} of ${n}` : 'no games'}
      </span>
    </li>
  )
}

// the player's cut-out photo, standing on the bottom edge of the team plate; nothing if there's no photo
function Photo({ sport, team, id, name }: { sport: string; team: string; id: string; name: string }) {
  const [bad, setBad] = useState(false)
  const espn = useRosterPlayer(sport === 'NFL' || sport === 'NHL' ? sport : '', name, team).pid
  const src = statsPhoto(sport, id, espn)
  if (!src || bad) return null
  return (
    <img src={src} alt='' aria-hidden='true' draggable={false} onError={() => setBad(true)}
      className={cn('-me-2 -mb-4 h-[120px] w-auto shrink-0 self-end object-contain object-bottom md:h-[132px]', sport === 'MLB' ? 'aspect-square' : 'aspect-[600/436]')} />
  )
}

export function ResearchPlayer({ sport, team, id, stat, line }: { sport: string; team: string; id: string; stat?: string; line?: number }) {
  const idxQ = useRsIndex(sport)
  const tQ = useRsTeam(sport, team)
  const idx = idxQ.data, t = tQ.data
  const p: RsPlayer | undefined = t?.players?.find((x) => String(x.id) === id)
  const def = !!(idx && p && isDefense(idx, p.grp))
  const stats = idx ? (def ? idx.hit_stats_def : idx.hit_stats) ?? idx.hit_stats ?? [] : []
  const [pick, setPick] = useState<string | null>(stat ?? null)
  const hs = stats.find((s) => s[0] === pick) ?? stats[0]
  const L = idx ? logIdx(idx) : {}
  const log = useMemo(() => p?.log ?? [], [p])
  const val = (g: Row) => (hs ? statValue(g, L, hs[2]) : null)

  // the default line: his season average rounded down, plus a half (so there's no push)
  const avgLine = useMemo(() => {
    if (!hs || !idx) return 0.5
    const cur = seasonYear(t ?? idx)
    const season = log.filter((g) => g[L.season] === cur)
    const vals = (season.length ? season : log.slice(0, 10)).map((g) => statValue(g, L, hs[2])).filter((v): v is number => v != null)
    const a = vals.length ? vals.reduce((m, v) => m + v, 0) / vals.length : 0
    return Math.floor(a) + 0.5
  }, [hs, idx, t, log, L])
  const [typed, setTyped] = useState<string | null>(null)
  // the line from a Props link applies only to that link's stat
  const fromLink = line != null && stat != null && pick === stat && hs?.[0] === stat ? String(line) : null
  const shownLine = typed ?? fromLink
  const ln = shownLine != null && shownLine.trim() !== '' && !Number.isNaN(Number(shownLine)) ? Number(shownLine) : avgLine

  if (idxQ.error || tQ.error || (t && !p)) {
    return (<><BackBar /><p className='p-8 text-center text-muted-foreground'>This player&apos;s stats aren&apos;t available right now.</p></>)
  }
  if (!idx || !t || !p) {
    return (<><BackBar /><Skeleton className='h-[132px] w-full rounded-none' /><div className='p-4'><Skeleton className='h-80 w-full rounded-[18px]' /></div></>)
  }
  const cur = seasonYear(t)
  const cols = (def ? idx.player_cols_def : idx.player_cols) ?? idx.player_cols ?? []
  const show = (def ? idx.log_show_def : idx.log_show) ?? idx.log_show ?? []
  const has = (k: string) => L[k] != null
  const reg = (g: Row) => !has('type') || g[L.type] !== 'P'
  const thisSeason = log.filter((g) => g[L.season] === cur)
  const lastSeason = log.filter((g) => g[L.season] !== cur)
  const last10 = log.slice(0, 10)
  const homeAway = has('ha')
  const shown = log.slice(0, 20)

  return (
    <>
      <BackBar label={t.name} />
      <TeamPlate sport={sport} code={t.code} color={t.color} title={p.name}
        sub={[p.pos, p.num != null && p.num !== '' ? `#${p.num}` : null, t.name].filter(Boolean).join(' · ')}
        mark={p.num != null && p.num !== '' ? String(p.num) : undefined}
        right={<Photo sport={sport} team={t.code} id={String(p.id)} name={p.name} />} />
      <main className='flex flex-col gap-5 px-4 py-5 md:px-6'>
        <section aria-label='Season stats' className='overflow-x-auto rounded-[18px] bg-card'>
          <table className='w-full whitespace-nowrap min-w-[420px] text-sm'>
            <thead>
              <tr className='text-xs text-muted-foreground'>
                <th className='px-4 py-2.5 text-start font-semibold'>Per game</th>
                {cols.map((c) => <th key={c[1]} className='px-2 py-2.5 text-end font-semibold'>{c[0]}</th>)}
              </tr>
            </thead>
            <tbody>
              {([[rsShort(t.season), p.this], [rsShort(t.last_season), p.last]] as const).filter(([, s]) => s).map(([label, s]) => (
                <tr key={label} className='border-t'>
                  <td className='px-4 py-2 text-muted-foreground'>{label}</td>
                  {cols.map((c) => <td key={c[1]} className='px-2 py-2 text-end font-condensed text-[15px] font-semibold tabular-nums'>{rsCell(s![c[1]], c)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {hs && (
          <section aria-label='How often they cleared a line' className='flex flex-col gap-2'>
            <h2 className='px-1 font-display text-[22px] font-extrabold'>How often they cleared a line</h2>
            <div className='flex gap-2'>
              <select value={hs[0]} onChange={(e) => { setPick(e.target.value); setTyped(null) }} aria-label='Stat'
                className='h-11 min-w-0 flex-1 rounded-xl border bg-card px-3 text-base'>
                {stats.map((s) => <option key={s[0]} value={s[0]}>{s[1]}</option>)}
              </select>
              <label className='flex h-11 w-32 items-center gap-2 rounded-xl border bg-card px-3 focus-within:border-foreground'>
                <span className='text-sm text-muted-foreground'>Over</span>
                <input inputMode='decimal' value={shownLine ?? String(avgLine)} onChange={(e) => setTyped(e.target.value)} aria-label='Line'
                  className='h-full min-w-0 flex-1 bg-transparent text-base font-semibold tabular-nums outline-none' />
              </label>
            </div>
            <ul className='overflow-hidden rounded-[18px] bg-card'>
              <Count label='Last 5' games={log.slice(0, 5)} line={ln} val={val} />
              <Count label='Last 10' games={last10} line={ln} val={val} />
              {homeAway && <Count label='Last 10 at home' games={log.filter((g) => g[L.ha] === 'H').slice(0, 10)} line={ln} val={val} />}
              {homeAway && <Count label='Last 10 away' games={log.filter((g) => g[L.ha] === 'A').slice(0, 10)} line={ln} val={val} />}
              <Count label={`This season (${rsShort(t.season)})`} games={thisSeason.filter(reg)} line={ln} val={val} />
              {lastSeason.length > 0 && <Count label={`Last season (${rsShort(t.last_season)})`} games={lastSeason.filter(reg)} line={ln} val={val} />}
            </ul>
            <p className='px-1 text-xs leading-relaxed text-muted-foreground'>
              Counts, not chances: games where they went over {ln} {hs[1].toLowerCase()}. Small samples swing a lot, and Kalshi&apos;s price usually
              already knows about a streak. Compare with Kalshi&apos;s % before you buy. Season rows leave out playoff games.
            </p>
          </section>
        )}

        {shown.length > 0 && (
          <section aria-label='Game log' className='flex flex-col gap-2'>
            <h2 className='px-1 font-display text-[22px] font-extrabold'>Game log</h2>
            <div className='overflow-x-auto rounded-[18px] bg-card'>
              <table className='w-full whitespace-nowrap min-w-[420px] text-sm'>
                <thead>
                  <tr className='text-xs text-muted-foreground'>
                    <th className='px-4 py-2.5 text-start font-semibold'>Game</th>
                    {show.map(([label]) => <th key={label} className='px-2 py-2.5 text-end font-semibold'>{label}</th>)}
                    {hs && <th className='px-4 py-2.5 text-end font-semibold'>{hs[1].length > 10 ? 'Total' : hs[1]}</th>}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((g, i) => {
                    const v = val(g)
                    const sep = i > 0 && g[L.season] !== shown[i - 1][L.season]
                    return (
                      <tr key={`${g[0]}${g[1]}`} className={cn('border-t', sep && 'border-t-4 border-t-muted')}>
                        <td className='px-4 py-2 whitespace-nowrap'>
                          <span className='text-muted-foreground tabular-nums'>{rsDate(g[0])}</span>{' '}
                          {homeAway ? (g[L.ha] === 'H' ? 'vs ' : 'at ') : ''}<span className='font-semibold'>{g[1]}</span>
                          {has('type') && g[L.type] === 'P' && <span className='ms-1 text-xs text-muted-foreground'>PO</span>}
                        </td>
                        {show.map(([label, k]) => (
                          <td key={label} className='px-2 py-2 text-end font-condensed text-[15px] tabular-nums'>{g[L[k]] ?? '—'}</td>
                        ))}
                        {hs && (
                          <td className={cn('px-4 py-2 text-end font-condensed text-[15px] font-bold tabular-nums', v != null && (v > ln ? 'text-good' : 'text-muted-foreground'))}>
                            {v ?? '—'}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className='px-1 text-xs text-muted-foreground'>
              Last {shown.length} games, newest first; green = over {ln}. A thick line marks where last season ends.{' '}
              <Link to='/research/team/$sport/$code' params={{ sport, code: t.code }} className='font-semibold text-devig'>All of {t.name}</Link>
            </p>
          </section>
        )}
      </main>
    </>
  )
}
