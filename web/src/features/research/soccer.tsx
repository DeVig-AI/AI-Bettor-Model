import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { SOCCER } from '@/lib/devig'
import { type Zone, useSoccerTables } from '@/lib/soccer'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { TeamLogo } from '@/components/team-logo'
import { leagueTag } from '../games/plate'
import { SeasonMarkets } from './soccer-futures'

// Soccer tables: each league's own ranking (points, then its tie-breakers) as ESPN publishes it, with the zones ESPN
// marks (Champions League places, relegation, playoffs) and each team's last five results; a tap opens the team.
// From live/soccer_tables.json (tools/soccer_tables.py). Numbers to check for yourself, no picks.

const KEY = 'devig_soccer_league'
const updatedFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
const r0 = (n: number | null) => n ?? 0
export const signed = (n: number | null) => (n == null ? '—' : n > 0 ? `+${n}` : `${n}`)
const RESULT_WORD = { W: 'won', D: 'drew', L: 'lost' } as const
export const zoneColor = (z: Zone | null) => (z?.color && /^#[0-9a-fA-F]{6}$/.test(z.color) ? z.color : null)

export function FormDots({ form }: { form: string }) {
  return (
    <span className='mt-1 flex gap-[3px]' aria-label={`Last ${form.length}: ${[...form].map((r) => RESULT_WORD[r as 'W']).join(', ')}`}>
      {[...form].map((r, i) => (
        <span key={i} aria-hidden='true'
          className={cn('grid size-4 place-items-center rounded-[4px] font-condensed text-[10px] font-bold',
            r === 'W' ? 'bg-good text-background' : r === 'L' ? 'bg-bad text-background' : 'bg-muted text-muted-foreground')}>
          {r}
        </span>
      ))}
    </span>
  )
}

export function SoccerTables() {
  const { data, isLoading, error } = useSoccerTables()
  const [league, setLeagueRaw] = useState(() => {
    try { const s = localStorage.getItem(KEY); return s && s in SOCCER ? s : 'EPL' } catch { return 'EPL' }
  })
  const setLeague = (s: string) => {
    setLeagueRaw(s)
    try { localStorage.setItem(KEY, s) } catch { /* private mode */ }
  }
  const codes = Object.keys(SOCCER).filter((c) => !data || data.leagues[c])
  const lg = data?.leagues[league]
  const zones = lg
    ? [...new Map(lg.groups.flatMap((g) => g.rows).filter((r) => r.zone && zoneColor(r.zone)).map((r) => [r.zone!.label, r.zone!])).values()]
    : []

  return (
    <div className='flex flex-col gap-3'>
      <div role='tablist' aria-label='Soccer league' className='no-scrollbar -mx-4 flex gap-1 overflow-x-auto border-b px-4'>
        {codes.map((c) => (
          <button key={c} type='button' role='tab' aria-selected={league === c} onClick={() => setLeague(c)}
            className={cn('-mb-px h-10 shrink-0 border-b-2 border-transparent px-3 text-[13px] font-semibold text-muted-foreground transition-colors duration-150', league === c && 'border-foreground text-foreground')}>
            {leagueTag(c)}
          </button>
        ))}
      </div>

      {error ? (
        <p className='rounded-[18px] border border-dashed p-8 text-center text-muted-foreground'>
          The soccer tables aren&apos;t available right now. Check your connection and try again.
        </p>
      ) : isLoading || !data ? (
        <Skeleton className='h-96 w-full rounded-[18px]' />
      ) : !lg ? (
        <p className='rounded-[18px] border border-dashed p-8 text-center text-muted-foreground'>No table for {SOCCER[league]} yet.</p>
      ) : (
        <>
          {lg.groups.map((g) => (
            <section key={g.name} aria-label={`${SOCCER[league]} ${g.name}`} className='flex flex-col gap-2'>
              {lg.groups.length > 1 && <h2 className='px-1 font-display text-xl font-extrabold'>{g.name}</h2>}
              <ol className='overflow-hidden rounded-[18px] bg-card'>
                <li aria-hidden='true' className='flex items-center gap-2.5 border-b py-2 ps-4 pe-3 text-xs font-semibold text-muted-foreground'>
                  <span className='w-6 text-end'>#</span>
                  <span className='flex-1'>Team</span>
                  <span className='w-9 text-end'>GD</span>
                  <span className='w-8 text-end'>Pts</span>
                  <span className='w-4' />
                </li>
                {g.rows.map((r) => {
                  const key = `${league}|${r.id}`
                  const zc = zoneColor(r.zone)
                  return (
                    <li key={key} className='relative border-b last:border-b-0'>
                      {zc && <span aria-hidden='true' className='absolute inset-y-0 start-0 w-1' style={{ background: zc }} />}
                      <Link to='/research/team/$sport/$code' params={{ sport: league, code: r.id }}
                        className='flex min-h-14 w-full items-center gap-2.5 py-2 ps-4 pe-3 text-start hover:bg-muted/50'>
                        <span className='w-6 shrink-0 text-end font-display text-xl font-black tabular-nums text-muted-foreground'>{r.rank}</span>
                        <TeamLogo sport={league} code={r.code} id={r.id} color={r.color} px={64} className='size-8 text-[10px]' />
                        <span className='min-w-0 flex-1'>
                          <span className='block truncate font-semibold'>{r.name}</span>
                          {r.form ? <FormDots form={r.form} /> : <span className='block text-xs text-muted-foreground'>No games yet</span>}
                          <span className='sr-only'>{`. Record ${r0(r.w)}–${r0(r.d)}–${r0(r.l)}${r.zone ? `. ${r.zone.label}` : ''}`}</span>
                        </span>
                        <span className={cn('w-9 shrink-0 text-end font-condensed text-[15px] font-semibold tabular-nums', (r.gd ?? 0) > 0 ? 'text-good' : (r.gd ?? 0) < 0 ? 'text-bad' : 'text-muted-foreground')}>
                          <span className='sr-only'>Goal difference </span>{signed(r.gd)}
                        </span>
                        <span className='w-8 shrink-0 text-end font-condensed text-[19px] font-bold tabular-nums'>{r.pts ?? '—'}</span>
                        <ChevronRight aria-hidden='true' className='size-4 shrink-0 text-muted-foreground' />
                      </Link>
                    </li>
                  )
                })}
              </ol>
            </section>
          ))}
          {zones.length > 0 && (
            <ul className='flex flex-col gap-1 px-1 text-xs text-muted-foreground'>
              {zones.map((z) => (
                <li key={z.label} className='flex items-center gap-2'>
                  <span aria-hidden='true' className='h-3 w-1 rounded-full' style={{ background: zoneColor(z)! }} />
                  {z.label}
                </li>
              ))}
            </ul>
          )}
          <p className='px-1 text-xs leading-relaxed text-muted-foreground'>
            {lg.season ? `${lg.season}. ` : ''}The league&apos;s own table from ESPN: points, then its tie-breakers. Last five results read left to right, newest on the right; GD is goal difference. Tap a team for its record, every result and what's next. Updated {updatedFmt.format(new Date(data.generated_at))}.
          </p>
          <SeasonMarkets league={league} teams={Object.fromEntries(lg.groups.flatMap((g) => g.rows).map((r) => [r.id, { code: r.code, color: r.color }]))} />
        </>
      )}
    </div>
  )
}
