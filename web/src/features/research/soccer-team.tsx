import { useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { SOCCER, fmtPct, useGames } from '@/lib/devig'
import { type Result, resultOf, tableRow, useSoccerTables } from '@/lib/soccer'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { BackBar, TeamPlate } from './team'
import { FormDots, signed } from './soccer'
import { useTeamFutures } from './soccer-futures'

// A soccer team in one competition: where it sits in the table, its record home and away, how many goals its games
// have had, its next matches with Kalshi's prices, and every result this season. From live/soccer_tables.json and the
// board's soccer lines. Counts from past games, not predictions.

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const shortDay = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })

function record(games: Result[]) {
  let w = 0, d = 0, l = 0
  for (const g of games) { const r = resultOf(g); if (r === 'W') w++; else if (r === 'D') d++; else l++ }
  return `${w}–${d}–${l}`
}
const share = (games: Result[], f: (g: Result) => boolean) => (games.length ? games.filter(f).length / games.length : null)
const perGame = (n: number, games: Result[]) => (games.length ? (n / games.length).toFixed(1) : '—')

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className='min-w-0 rounded-2xl bg-card px-3 py-2.5'>
      <div className='truncate text-xs text-muted-foreground'>{label}</div>
      <div className='font-condensed text-[19px] font-bold tabular-nums'>{value}</div>
      {sub && <div className='truncate text-[11px] text-muted-foreground tabular-nums'>{sub}</div>}
    </div>
  )
}

export function SoccerTeam({ sport, id }: { sport: string; id: string }) {
  const { data, isLoading, error } = useSoccerTables()
  const { rows } = useGames()
  const team = data?.teams[`${sport}|${id}`]
  const t = tableRow(data, sport, id)
  const fut = useTeamFutures(sport, id)
  const next = useMemo(
    () => rows.filter((r) => r.sport === sport && r.state !== 'post' && (r.ids?.home === id || r.ids?.away === id))
      .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff)).slice(0, 5),
    [rows, sport, id]
  )

  if (error) return (<><BackBar /><p className='p-8 text-center text-muted-foreground'>The soccer tables aren&apos;t available right now.</p></>)
  if (isLoading || !data) {
    return (<><BackBar /><Skeleton className='h-[132px] w-full rounded-none' /><div className='p-4'><Skeleton className='h-80 w-full rounded-[18px]' /></div></>)
  }
  if (!team) return (<><BackBar /><p className='p-8 text-center text-muted-foreground'>No {SOCCER[sport] ?? sport} team with that id.</p></>)

  const games = team.games
  const home = games.filter((g) => g[2] === 'H')
  const away = games.filter((g) => g[2] === 'A')
  const gf = games.reduce((n, g) => n + g[3], 0)
  const ga = games.reduce((n, g) => n + g[4], 0)
  const clean = games.filter((g) => g[4] === 0).length
  const btts = share(games, (g) => g[3] > 0 && g[4] > 0)
  const over = share(games, (g) => g[3] + g[4] > 2)
  const lg = SOCCER[sport] ?? sport

  return (
    <>
      <BackBar />
      <TeamPlate sport={sport} code={team.code} color={t?.row.color} title={team.name}
        sub={t ? `${ordinal(t.row.rank)} of ${t.size}${t.groups > 1 ? ` in the ${t.group}` : ''} · ${lg} · ${t.row.pts ?? 0} pts` : lg}
        right={<span className='shrink-0 font-display text-4xl font-black tabular-nums'>{record(games)}</span>} />
      <main className='flex flex-col gap-5 px-4 py-5 md:px-6'>
        {t?.row.zone && <p className='-mb-2 px-1 text-sm text-muted-foreground'>In the table&apos;s {t.row.zone.label} places.</p>}
        <section aria-label='Season so far' className='flex flex-col gap-2'>
          <div className='grid grid-cols-3 gap-2'>
            <Stat label='Home' value={record(home)} sub={`${home.length} played`} />
            <Stat label='Away' value={record(away)} sub={`${away.length} played`} />
            <Stat label='Goal difference' value={signed(gf - ga)} sub={`${gf} for, ${ga} against`} />
            <Stat label='Scored a game' value={perGame(gf, games)} />
            <Stat label='Let in a game' value={perGame(ga, games)} />
            <Stat label='Clean sheets' value={String(clean)} />
            <Stat label='Both scored' value={fmtPct(btts)} sub='of its games' />
            <Stat label='Over 2.5 goals' value={fmtPct(over)} sub='of its games' />
            <Stat label='Played' value={String(games.length)} />
          </div>
          {t?.row.form && (
            <div className='flex items-center gap-3 px-1'>
              <span className='text-xs text-muted-foreground'>Last 5</span>
              <FormDots form={t.row.form} />
            </div>
          )}
        </section>

        {fut.length > 0 && (
          <section aria-labelledby='fut-h' className='flex flex-col gap-2'>
            <h2 id='fut-h' className='px-1 font-display text-[22px] font-extrabold'>Season markets</h2>
            <div className='grid grid-cols-3 gap-2'>
              {fut.map((f) => <Stat key={f.key} label={f.label} value={f.p > 0 && f.p < 0.005 ? '<1%' : fmtPct(f.p)} />)}
            </div>
            <p className='px-1 text-xs text-muted-foreground'>Kalshi&apos;s price for each, the middle of its bid and ask. Thinly quoted ones are left out.</p>
          </section>
        )}

        {next.length > 0 && (
          <section aria-labelledby='next-h' className='flex flex-col gap-2'>
            <h2 id='next-h' className='px-1 font-display text-[22px] font-extrabold'>Next</h2>
            <ul className='overflow-hidden rounded-[18px] bg-card'>
              {next.map((r) => {
                const isHome = r.ids?.home === id
                const p = r.three ? (isHome ? r.three.home : r.three.away) : null
                const live = r.state === 'in'
                return (
                  <li key={r.id} className='border-b last:border-b-0'>
                    <Link to='/game/$id' params={{ id: r.id }} className='flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-muted/50'>
                      <span className='w-24 shrink-0 text-xs text-muted-foreground tabular-nums'>
                        {live ? <span className='font-bold text-bad'>Live</span> : <>{dayFmt.format(new Date(r.kickoff))}<span className='block'>{timeFmt.format(new Date(r.kickoff))}</span></>}
                      </span>
                      <span className='min-w-0 flex-1 truncate'>{isHome ? 'vs' : 'at'} <b className='font-semibold'>{isHome ? r.awayName : r.homeName}</b></span>
                      {p != null && (
                        <span className='shrink-0 text-end'>
                          <span className='block font-condensed text-[17px] font-bold tabular-nums'>{fmtPct(p)}</span>
                          <span className='block text-[11px] text-muted-foreground'>to win</span>
                        </span>
                      )}
                      <ChevronRight aria-hidden='true' className='size-4 shrink-0 text-muted-foreground' />
                    </Link>
                  </li>
                )
              })}
            </ul>
            <p className='px-1 text-xs text-muted-foreground'>Kalshi&apos;s chance it wins in 90 minutes, fee taken out.</p>
          </section>
        )}

        <section aria-labelledby='res-h' className='flex flex-col gap-2'>
          <h2 id='res-h' className='px-1 font-display text-[22px] font-extrabold'>Results</h2>
          {!games.length ? <p className='rounded-[18px] border border-dashed p-6 text-center text-sm text-muted-foreground'>No results yet this season.</p> : (
            <ol className='overflow-hidden rounded-[18px] bg-card'>
              {[...games].reverse().map((g, i) => {
                const r = resultOf(g)
                return (
                  <li key={i} className='flex items-center gap-3 border-b px-4 py-2.5 text-sm last:border-b-0'>
                    <span className='w-14 shrink-0 text-muted-foreground tabular-nums'>{shortDay.format(new Date(`${g[0]}T12:00:00`))}</span>
                    <span className='min-w-0 flex-1 truncate'>{g[2] === 'H' ? 'vs' : 'at'} <b className='font-semibold'>{g[1]}</b></span>
                    <span className='font-condensed text-[15px] font-bold tabular-nums'>{g[3]}–{g[4]}</span>
                    <span className={cn('w-5 text-center font-condensed font-bold', r === 'W' ? 'text-good' : r === 'L' ? 'text-bad' : 'text-muted-foreground')}>{r}</span>
                  </li>
                )
              })}
            </ol>
          )}
          <p className='px-1 text-xs text-muted-foreground'>{lg} games only, from ESPN. Counts from past games, not a prediction.</p>
        </section>
      </main>
    </>
  )
}
