// The top of the team drawer: the matchup (both teams, pinned while the drawer scrolls) and what's useful to know
// about the game before picking a side: Kalshi's lines, how the two teams are playing (the stats bot's team files; none for soccer),
// who might sit (the injuries bot), and whose chances the tabs below show. Facts and prices only; nothing here is a pick.
import { useMemo } from 'react'
import { ChevronRight } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { type GameRow, fmtPct, isSoccer, nflNick } from '@/lib/devig'
import { useInjuries } from '@/lib/injuries'
import type { RsTeam } from '@/lib/research'
import { expected } from '@/lib/team-props-math'
import { cn } from '@/lib/utils'
import { SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { TeamLogo } from '@/components/team-logo'
import { nickname, useGames, useTeamProps } from './team-props'

const whenFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
const PRO = ['NBA', 'NHL', 'NFL', 'MLB', 'WNBA']

// "Milwaukee Bucks" -> "Bucks" for pro teams; schools and soccer clubs keep their name
// (pro rows often carry only the code, so the stats file's full name is the fallback)
export function shortName(row: GameRow, side: 'away' | 'home', file?: RsTeam | null) {
  const code = side === 'home' ? row.home : row.away
  const name = side === 'home' ? row.homeName : row.awayName
  if (row.sport === 'NFL') return nflNick(code) ?? name ?? code
  if (!PRO.includes(row.sport)) return name || code
  const full = name && name !== code ? name : file?.name
  return full ? nickname(full) : code
}

const colorOf = (row: GameRow, side: 'away' | 'home') => (side === 'home' ? row.colors?.home : row.colors?.away) || `var(--side-${side})`

export function MatchupHeader({ row, small, onGamePage, onClose }: { row: GameRow; small: boolean; onGamePage: boolean; onClose: () => void }) {
  const away = useGames(row.sport, row.away), home = useGames(row.sport, row.home)
  const live = row.state !== 'pre'
  const when = row.state === 'pre' ? whenFmt.format(new Date(row.kickoff)) : row.state === 'in' ? `Live · ${row.detail}` : 'Final'
  const score = live && row.awayScore != null && row.homeScore != null ? `${row.awayScore}–${row.homeScore}` : null
  const team = (side: 'away' | 'home', file: RsTeam | null) => (
    <div className={cn('flex min-w-0 items-center gap-1.5 text-center', small ? 'flex-row justify-center' : 'flex-col')}>
      <TeamLogo sport={row.sport} code={side === 'home' ? row.home : row.away} id={side === 'home' ? row.ids?.home : row.ids?.away}
        color={colorOf(row, side)} px={128} className={cn('relative transition-[width,height] duration-200', small ? 'size-8 text-[11px]' : 'size-14 text-base')} />
      <span className={cn('truncate font-display leading-none font-black', small ? 'text-lg' : 'text-[22px]')}>{shortName(row, side, file)}</span>
      {!small && file?.this?.record && <span className='text-xs text-white/80'>{String(file.this.record)}</span>}
    </div>
  )
  return (
    <div className='relative shrink-0 overflow-hidden rounded-t-3xl text-white'
      style={{ background: `linear-gradient(110deg, ${colorOf(row, 'away')} 0 50%, ${colorOf(row, 'home')} 50% 100%)` }}>
      <span aria-hidden='true' className='absolute inset-0 bg-linear-to-b from-transparent from-30% to-black/35' />
      {!small && <span aria-hidden='true' className='absolute top-2.5 left-1/2 h-1.5 w-10 -translate-x-1/2 rounded-full bg-white/45' />}
      {!onGamePage && !small && (
        <Link to='/game/$id' params={{ id: row.id }} onClick={onClose}
          className='absolute top-3.5 left-3.5 z-10 flex h-9 items-center gap-0.5 rounded-full bg-black/30 ps-3 pe-2 text-sm font-semibold text-white hover:bg-black/45'>
          Game page
          <ChevronRight className='size-4' aria-hidden='true' />
        </Link>
      )}
      <div className={cn('relative grid grid-cols-[1fr_auto_1fr] items-center gap-1.5', small ? 'py-3 ps-4 pe-14' : 'px-4 pt-14 pb-4')}>
        {team('away', away)}
        <div className='flex flex-col items-center gap-0.5 text-center'>
          <SheetTitle className={cn('font-condensed font-extrabold text-white/75', small ? 'sr-only' : 'text-[15px]')}>
            <span className='sr-only'>{shortName(row, 'away', away)} </span>{isSoccer(row.sport) ? 'vs' : 'at'}<span className='sr-only'> {shortName(row, 'home', home)}</span>
          </SheetTitle>
          {score && <span className={cn('font-display font-black tabular-nums', small ? 'text-lg' : 'text-2xl')}>{score}</span>}
          <SheetDescription className={cn('font-condensed font-bold text-white', small ? 'text-xs' : 'text-[15px]')}>{when}</SheetDescription>
          {!small && <span className='text-xs text-white/80'>{row.sport}</span>}
        </div>
        {team('home', home)}
      </div>
    </div>
  )
}

const H = ({ children }: { children: React.ReactNode }) => (
  <h3 className='mb-2 text-[11.5px] font-semibold tracking-[0.06em] text-muted-foreground uppercase'>{children}</h3>
)
const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : v != null && v !== '' && isFinite(Number(v)) ? Number(v) : null)
const winPct = (rec: unknown) => {
  const [w, l, t] = String(rec ?? '').split('-').map(Number)
  return isFinite(w) && isFinite(l) && w + l + (t || 0) > 0 ? w / (w + l + (t || 0)) : null
}
const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`

export function GameInfo({ row, chanceWho }: { row: GameRow; chanceWho: string }) {
  const away = useGames(row.sport, row.away), home = useGames(row.sport, row.home)
  const tp = useTeamProps(row, true).data
  const injuries = useInjuries().data
  const hurt = useMemo(
    () => (injuries ?? []).filter((x) => x.sport === row.sport && x.away === row.away && x.home === row.home)
      .sort((a, b) => (b.impact?.bars ?? 0) - (a.impact?.bars ?? 0)),
    [injuries, row]
  )

  // Kalshi's lines: the moneyline's fair chance, then the spread and total from the games data, else read off the
  // team-props ladders (where they cross 50%)
  const exp = tp ? expected(tp) : null
  const half = (x: number) => (Math.round(x * 2) / 2).toFixed(1)
  const sp = row.spread?.home_point
  const spread = sp != null ? (sp === 0 ? "Pick'em" : `${sp < 0 ? row.home : row.away} −${Math.abs(sp)}`)
    : exp?.fav && exp.margin != null ? `${exp.fav === tp!.home ? row.home : row.away} by ~${half(exp.margin)}` : null
  const total = row.total?.line != null ? `O/U ${row.total.line}` : exp?.total != null ? `O/U ~${half(exp.total)}` : null
  const fav = row.fairHome == null ? null : row.fairHome >= 0.5 ? 'home' : 'away'
  const lines = [
    row.fairHome != null && fav && (
      <div key='win' className='flex flex-col gap-px p-2.5 px-3'>
        <span className='text-[11.5px] text-muted-foreground'>To win</span>
        <b className='font-condensed text-[19px] leading-tight tabular-nums'>{fav === 'home' ? row.home : row.away} {fmtPct(fav === 'home' ? row.fairHome : 1 - row.fairHome)}</b>
        <div className='mt-1 flex h-2 overflow-hidden rounded-full' aria-hidden='true'>
          <i style={{ width: `${(1 - row.fairHome) * 100}%`, background: colorOf(row, 'away') }} />
          <i style={{ width: `${row.fairHome * 100}%`, background: colorOf(row, 'home') }} />
        </div>
      </div>
    ),
    spread && (
      <div key='sp' className='flex flex-col gap-px p-2.5 px-3'>
        <span className='text-[11.5px] text-muted-foreground'>Spread</span>
        <b className='font-condensed text-[19px] leading-tight tabular-nums'>{spread}</b>
      </div>
    ),
    total && (
      <div key='tot' className='flex flex-col gap-px p-2.5 px-3'>
        <span className='text-[11.5px] text-muted-foreground'>Total</span>
        <b className='font-condensed text-[19px] leading-tight tabular-nums'>{total}</b>
      </div>
    ),
  ].filter(Boolean)

  // how they're playing, from the stats bot's team files (none for soccer)
  const a = away?.this, h = home?.this
  const pts = (s: typeof a) => num(s?.gf ?? s?.rpg ?? s?.ppg) // NHL's ppg is power-play goals, so goals first
  const opp = (s: typeof a) => num(s?.ga ?? s?.rapg ?? s?.oppg)
  const unit = row.sport === 'NHL' ? 'Goals' : row.sport === 'MLB' ? 'Runs' : 'Points'
  const one = (x: number | null) => (x == null ? '—' : x.toFixed(1))
  type Cmp = [label: string, away: string, home: string, better: 'away' | 'home' | null]
  const by = (x: number | null, y: number | null, high = true): Cmp[3] => (x == null || y == null || x === y ? null : (x > y) === high ? 'away' : 'home')
  const cmp: Cmp[] = !a || !h ? [] : ([
    a.record && h.record ? ['Record', String(a.record), String(h.record), by(winPct(a.record), winPct(h.record))] : null,
    a.streak && h.streak ? ['Streak', String(a.streak), String(h.streak), null] : null,
    a.away && h.home ? ['Road / home', String(a.away), String(h.home), by(winPct(a.away), winPct(h.home))] : null,
    pts(a) != null && pts(h) != null ? [`${unit} a game`, one(pts(a)), one(pts(h)), by(pts(a), pts(h))] : null,
    opp(a) != null && opp(h) != null ? ['Allowed a game', one(opp(a)), one(opp(h)), by(opp(a), opp(h), false)] : null,
    away!.rank && home!.rank ? ['DeVig power rank', ord(away!.rank), ord(home!.rank), by(away!.rank, home!.rank, false)] : null,
  ].filter(Boolean) as Cmp[])

  const whose = chanceWho === 'Kalshi' ? null : chanceWho === 'Lab' ? "the Research Lab's" : chanceWho === 'Model' ? "DeVig's model's lean" : "DeVig's"

  return (
    <div className='flex flex-col gap-5'>
      {lines.length > 0 && (
        <section>
          <H>Kalshi&apos;s lines</H>
          <div className='grid overflow-hidden rounded-2xl border [&>div+div]:border-s' style={{ gridTemplateColumns: lines.length === 3 ? '1.25fr 1fr 1fr' : `repeat(${lines.length}, 1fr)` }}>
            {lines}
          </div>
        </section>
      )}

      {cmp.length > 0 && (
        <section>
          <H>How they&apos;re playing</H>
          <div className='overflow-hidden rounded-2xl border'>
            <div className='grid grid-cols-[1fr_1.3fr_1fr] px-3.5 py-2 font-condensed text-[13px] font-bold text-muted-foreground'>
              <span>{row.away}</span><span /><span className='text-end'>{row.home}</span>
            </div>
            {cmp.map(([label, x, y, b]) => (
              <div key={label} className='grid grid-cols-[1fr_1.3fr_1fr] items-center border-t px-3.5 py-2 tabular-nums'>
                <span className={cn('font-condensed text-base font-bold', b === 'away' && 'text-good')}>{x}</span>
                <span className='text-center text-xs text-muted-foreground'>{label}</span>
                <span className={cn('text-end font-condensed text-base font-bold', b === 'home' && 'text-good')}>{y}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {hurt.length > 0 && (
        <section>
          <H>Who might sit</H>
          <ul className='overflow-hidden rounded-2xl border'>
            {hurt.slice(0, 5).map((x) => {
              const side = x.team === row.home ? 'home' : 'away'
              return (
                <li key={x.team + x.player} className='flex items-center gap-2.5 border-t px-3.5 py-2.5 first:border-t-0'>
                  <span className='shrink-0 rounded-[5px] px-1.5 py-0.5 font-condensed text-[11px] font-bold text-white' style={{ background: colorOf(row, side) }}>{x.team}</span>
                  <span className='min-w-0'>
                    <span className='block text-sm font-bold'>{x.player}</span>
                    {(x.reason || x.starter) && <span className='block text-xs text-muted-foreground'>{[x.reason, x.starter && 'starter'].filter(Boolean).join(' · ')}</span>}
                  </span>
                  <span className='ms-auto shrink-0 text-end text-xs'>
                    <span className={cn('block text-[13px] font-bold', /out|suspend|reserve/i.test(x.status) ? 'text-bad' : 'text-[#B98A1E] dark:text-[#F5C77A]')}>{x.status}</span>
                    {x.impact?.label && <span className='text-muted-foreground'>{x.impact.label.toLowerCase()} impact</span>}
                  </span>
                </li>
              )
            })}
          </ul>
          {hurt.length > 5 && <p className='mt-1.5 px-1 text-xs text-muted-foreground'>{hurt.length - 5} more on the game page.</p>}
        </section>
      )}

      <p className='rounded-2xl bg-devig/10 px-3.5 py-3 text-sm'>
        {whose
          ? <>The chances below are <b className='text-devig'>{whose}</b>.</>
          : <>DeVig has <b className='text-devig'>no model</b> for this {isSoccer(row.sport) ? 'match' : `${row.sport} game`}, so the chances below are Kalshi&apos;s.</>}
      </p>
    </div>
  )
}
