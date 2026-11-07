import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { type GameRow, fmtPct, isSoccer } from '@/lib/devig'
import { TeamLogo } from '@/components/team-logo'
import { leagueTag } from '../games/plate'

// Soccer's player markets on the Props tab: each upcoming match Kalshi has opened them for, with its three likeliest
// scorers; a tap opens the match's Players tab. Kalshi's mid price from the board file. No model, no picks.

const whenFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })

export const soccerPropGames = (rows: GameRow[]) =>
  rows.filter((r) => isSoccer(r.sport) && r.state === 'pre' && r.soccer?.more?.players.length)
    .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff))

export function SoccerProps({ rows }: { rows: GameRow[] }) {
  const games = soccerPropGames(rows)
  if (!games.length) {
    const next = rows.filter((r) => isSoccer(r.sport) && r.state === 'pre').sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff))[0]
    return (
      <p className='rounded-[18px] border border-dashed p-8 text-center text-muted-foreground'>
        No soccer player markets open right now. Kalshi opens goalscorer and assist markets about an hour before kickoff.
        {next && (
          <>
            {' '}Next match:{' '}
            <Link to='/game/$id' params={{ id: next.id }} className='font-medium text-foreground underline underline-offset-2'>
              {next.homeName} vs {next.awayName}
            </Link>
            , {leagueTag(next.sport)}, {whenFmt.format(new Date(next.kickoff))}.
          </>
        )}
      </p>
    )
  }
  return (
    <ul className='grid gap-3 lg:grid-cols-2'>
      {games.map((g) => {
        const top = g.soccer!.more!.players.filter((p) => p[2] === 'goal' && p[3] === 1).sort((a, b) => b[4] - a[4]).slice(0, 3)
        const n = new Set(g.soccer!.more!.players.map((p) => p[1])).size
        return (
          <li key={g.id}>
            <Link to='/game/$id' params={{ id: g.id }} className='flex flex-col gap-3 rounded-[18px] bg-card p-4 hover:bg-muted/50'>
              <span className='flex items-center gap-2'>
                <TeamLogo sport={g.sport} code={g.home} id={g.ids?.home} color={g.colors?.home} px={64} className='size-8 text-[10px]' />
                <span className='min-w-0 flex-1'>
                  <span className='block truncate font-semibold'>{g.homeName} vs {g.awayName}</span>
                  <span className='block text-xs text-muted-foreground'>{leagueTag(g.sport)} · {whenFmt.format(new Date(g.kickoff))} · {n} players</span>
                </span>
                <TeamLogo sport={g.sport} code={g.away} id={g.ids?.away} color={g.colors?.away} px={64} className='size-8 text-[10px]' />
                <ChevronRight aria-hidden='true' className='size-5 shrink-0 text-muted-foreground' />
              </span>
              {top.length > 0 && (
                <span className='flex flex-col gap-1.5 border-t pt-3'>
                  <span className='text-xs text-muted-foreground'>Likeliest to score</span>
                  {top.map((p) => (
                    <span key={p[6]} className='flex items-center gap-2 text-sm'>
                      <span className='w-9 shrink-0 font-condensed text-[13px] font-bold text-muted-foreground'>{p[0] === 'home' ? g.home : g.away}</span>
                      <span className='min-w-0 flex-1 truncate'>{p[1]}</span>
                      <span className='font-condensed text-[15px] font-bold tabular-nums'>{fmtPct(p[4])}</span>
                    </span>
                  ))}
                </span>
              )}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
