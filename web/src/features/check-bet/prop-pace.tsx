import { useQuery } from '@tanstack/react-query'
import { normName } from '@/lib/headshots'
import { PACE_WORD, type Pace, pace, usualOf } from '@/lib/pace-math'
import { rsIndexQuery, useRsTeam } from '@/lib/research'
import type { LegGame, LegInfo } from '@/lib/review'
import { cn } from '@/lib/utils'
import { type Raw, boxPlayers, playedShare, sideMap } from '@/lib/wrap'

// A player prop mid-game: what they have against the line, with a mark where they usually are by this point of the
// game (their last 15 games, scaled to the time played). Live from ESPN's box score. Display only.

const dayOf = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(iso))
const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v >= 10 ? String(Math.round(v)) : v.toFixed(1))
const TONE: Record<Pace['status'], [string, string]> = { // [fill, chip]
  hit: ['bg-good', 'bg-good/15 text-good'], missed: ['bg-bad', 'bg-bad/15 text-bad'], ahead: ['bg-good', 'bg-good/15 text-good'],
  behind: ['bg-bad', 'bg-bad/15 text-bad'], on: ['bg-devig', 'bg-devig/15 text-devig'], early: ['bg-muted-foreground', 'bg-muted text-muted-foreground'],
}

export function usePropPace(i: LegInfo, game: LegGame | null, sum: Raw | null): Pace | null {
  const sport = game?.sport ?? ''
  const want = i.kind === 'prop' && !!i.stat && !!i.player && i.strike != null && !!game && game.state !== 'pre' && !!sum
  const idx = useQuery({ ...rsIndexQuery(sport), enabled: want })
  const ta = useRsTeam(sport, want ? game!.away : '')
  const th = useRsTeam(sport, want ? game!.home : '')
  if (!want) return null
  const who = normName(i.player!)
  const p = boxPlayers(sum!, sideMap(sum!)).find((x) => normName(x.name) === who)
  const v = p ? i.stat!.get(p.s) : null
  if (v == null) return null
  const comp = sum!.header?.competitions?.[0]
  const final = comp?.status?.type?.completed ?? game!.state === 'post'
  const played = playedShare(sport, comp?.status, final)
  if (!final && played == null) return null
  const cols = idx.data?.log_cols ?? []
  const at = Object.fromEntries(cols.map((c, n) => [c, n]))
  const me = [...(ta.data?.players ?? []), ...(th.data?.players ?? [])].find((x) => normName(x.name) === who || String(x.id) === p!.id)
  const avg = me?.log ? usualOf(me.log, at, i.stat!.log, dayOf(game!.kickoff)) : null
  return pace(v, Math.floor(i.strike!) + 1, i.leg.side, avg, played)
}

export function PaceBar({ p, label, side }: { p: Pace; label: string; side: 'yes' | 'no' }) {
  const x = (v: number) => `${Math.min(100, (v / p.max) * 100)}%`
  const [fill, chip] = TONE[p.status]
  const done = p.status === 'hit' || p.status === 'missed'
  const usualText = p.usual == null ? null : done ? `usually ${fmt(p.usual)} a game` : `usually ${fmt(p.usual)} by now`
  const needText = side === 'no'
    ? done ? null : `needs to stay under ${p.target}`
    : p.need != null ? `needs ${fmt(p.need)} more` : null
  const summary = `${PACE_WORD[p.status]}: ${fmt(p.v)} ${label}, line ${p.target}${usualText ? `, ${usualText}` : ''}${needText ? `, ${needText}` : ''}`
  return (
    <div role='img' aria-label={summary} className='flex flex-col gap-1.5 rounded-[14px] bg-card px-3 py-2.5'>
      <div className='flex items-baseline justify-between gap-3'>
        <span className='flex items-baseline gap-2'>
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold', chip)}>{PACE_WORD[p.status]}</span>
          <span className='font-condensed text-[19px] leading-none font-bold tabular-nums'>
            {fmt(p.v)}
            <span className='text-sm font-semibold text-muted-foreground'> / {p.target}{side === 'no' ? ' (under)' : ''}</span>
          </span>
        </span>
        <span className='text-xs text-muted-foreground'>{label}</span>
      </div>
      <div className='relative h-5' aria-hidden='true'>
        <div className='absolute inset-x-0 top-1.5 h-2 rounded-full bg-muted' />
        <div className={cn('absolute top-1.5 left-0 h-2 rounded-full transition-[width] duration-500', fill)} style={{ width: x(p.v) }} />
        {p.usual != null && (
          <div className='absolute top-0 h-5 w-0.5 -translate-x-1/2 rounded-full bg-foreground/45' style={{ left: x(p.usual) }} />
        )}
        <div className='absolute top-0 h-5 w-[3px] -translate-x-1/2 rounded-full bg-foreground' style={{ left: x(p.target) }} />
      </div>
      <p className='flex flex-wrap justify-between gap-x-3 text-xs text-muted-foreground'>
        <span>
          <span className='mr-1 inline-block h-2.5 w-[3px] translate-y-px rounded-full bg-foreground' aria-hidden='true' />line {p.target}
          {usualText && (
            <>
              <span className='mr-1 ml-3 inline-block h-2.5 w-0.5 translate-y-px rounded-full bg-foreground/45' aria-hidden='true' />
              {usualText}
            </>
          )}
        </span>
        {needText && <span className='font-semibold text-foreground'>{needText}</span>}
      </p>
    </div>
  )
}
