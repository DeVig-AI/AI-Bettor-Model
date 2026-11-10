// The top of the team drawer: the matchup (both teams, pinned while the drawer scrolls) and what's useful to know
// about the game before picking a side: DeVig's call (its pick only when it made one, its chances next to Kalshi's), the
// spread and O/U as rows that open like a player prop, how the two teams are playing (the stats bot's team files; none
// for soccer) and who might sit (the injuries bot).
import { useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { type GameRow, fmtPct, isSoccer, nflNick } from '@/lib/devig'
import { useInjuries } from '@/lib/injuries'
import type { RsTeam } from '@/lib/research'
import { type Kind, expected, hitCount, mainRung, mid, valuesOf } from '@/lib/team-props-math'
import { cn } from '@/lib/utils'
import { SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { TeamLogo } from '@/components/team-logo'
import { TeamPropSheet, ln, nickname, pct, rungsOf, under, useCtx, useGames, useTeamProps } from './team-props'
import { isPick } from './plate'
import type { Side } from './team-sheet'

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

type Chance = { pct: number | null; who: string }

export function GameInfo({ row, chances, homeMargin }: { row: GameRow; chances: { away: Chance; home: Chance }; homeMargin: number | null }) {
  const away = useGames(row.sport, row.away), home = useGames(row.sport, row.home)
  const injuries = useInjuries().data
  const hurt = useMemo(
    () => (injuries ?? []).filter((x) => x.sport === row.sport && x.away === row.away && x.home === row.home)
      .sort((a, b) => (b.impact?.bars ?? 0) - (a.impact?.bars ?? 0)),
    [injuries, row]
  )

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

  return (
    <div className='flex flex-col gap-5'>
      <DevigCall row={row} chances={chances} />
      <GameLines row={row} homeMargin={homeMargin} />

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

    </div>
  )
}

// DeVig's call on who wins: its pick (only when it made one), else its chances with no pick, else Kalshi's alone
function DevigCall({ row, chances }: { row: GameRow; chances: { away: Chance; home: Chance } }) {
  const who = chances.home.who
  const pick = isPick(row) && row.pick?.side ? (row.pick.side === row.home ? 'home' : 'away') : null
  const kalshi = row.fairHome
  const model = who !== 'Kalshi' && chances.home.pct != null ? chances.home.pct : null
  const name = who === 'Lab' ? "Research Lab" : 'DeVig'
  const split = (label: string, h: number, tone: string) => (
    <div className='flex flex-col gap-1'>
      <div className='flex justify-between font-condensed text-[15px] font-bold tabular-nums'>
        <span>{row.away} {fmtPct(1 - h)}</span>
        <span className={cn('text-xs font-semibold font-sans', tone)}>{label}</span>
        <span>{row.home} {fmtPct(h)}</span>
      </div>
      <div className='flex h-2 overflow-hidden rounded-full' aria-hidden='true'>
        <i style={{ width: `${(1 - h) * 100}%`, background: colorOf(row, 'away') }} />
        <i style={{ width: `${h * 100}%`, background: colorOf(row, 'home') }} />
      </div>
    </div>
  )
  return (
    <section>
      <H>{model != null ? `${name}'s call` : 'Who wins'}</H>
      <div className='flex flex-col gap-3 rounded-2xl border p-3.5'>
        {pick ? (
          <div className='flex items-center justify-between gap-3'>
            <span className='flex items-center gap-2'>
              <span className='rounded-full bg-devig px-2 py-0.5 text-[11px] font-bold tracking-wide text-devig-ink uppercase'>DeVig pick</span>
              <b className='font-display text-xl font-black'>{pick === 'home' ? row.home : row.away} to win</b>
            </span>
            {chances[pick].pct != null && <b className='font-display text-2xl font-black text-devig tabular-nums'>{fmtPct(chances[pick].pct!)}</b>}
          </div>
        ) : model != null ? (
          <p className='text-sm'>
            <b>No pick</b> on this game{who === 'Model' ? `: the model leans ${model >= 0.5 ? row.home : row.away} but not by enough to bet` : `: these are ${name}'s chances, not a bet`}.
          </p>
        ) : (
          <p className='text-sm'>DeVig has <b className='text-devig'>no model</b> for this {isSoccer(row.sport) ? 'match' : `${row.sport} game`}, so the chances are Kalshi&apos;s.</p>
        )}
        {model != null && split(name, model, 'text-devig')}
        {kalshi != null && split('Kalshi', kalshi, 'text-muted-foreground')}
      </div>
    </section>
  )
}

// The spread and the O/U, each a row like a player prop: Kalshi's line and chance, the last 10, and DeVig's number when
// it has one. A row opens the prop's drawer (every line, chances, last 10, chart, costs).
function GameLines({ row, homeMargin }: { row: GameRow; homeMargin: number | null }) {
  const tp = useTeamProps(row, true).data
  const cAway = useCtx(row, 'away', tp), cHome = useCtx(row, 'home', tp)
  const [open, setOpen] = useState<string | null>(null)
  const exp = tp ? expected(tp) : null

  // the favorite: the spread's, else Kalshi's ladders', else the moneyline's
  const sp = row.spread?.home_point
  const favSide: Side | null = sp != null && sp !== 0 ? (sp < 0 ? 'home' : 'away')
    : exp?.fav && tp ? (exp.fav === tp.home ? 'home' : 'away') : row.fairHome != null ? (row.fairHome >= 0.5 ? 'home' : 'away') : null
  const fc = favSide === 'home' ? cHome : favSide === 'away' ? cAway : null
  const favCode = favSide === 'home' ? row.home : row.away, dogCode = favSide === 'home' ? row.away : row.home
  const byRungs = fc ? rungsOf(fc, 'by') : []
  const spNeed = sp != null ? Math.round(Math.abs(sp) + 0.5) : null
  const byR = byRungs.find((x) => x[0] === spNeed) ?? mainRung(byRungs)
  const totRungs = cHome ? rungsOf(cHome, 'total') : []
  const totR = (row.total?.line != null && totRungs.find((x) => x[0] === Math.round(row.total!.line + 0.5))) || mainRung(totRungs)
  const favMargin = homeMargin == null || !favSide ? null : favSide === 'home' ? homeMargin : -homeMargin

  const awayF = useGames(row.sport, row.away), homeF = useGames(row.sport, row.home)
  const favF = favSide === 'home' ? homeF : awayF
  const last = (f: typeof awayF, k: Kind) => valuesOf(f?.games, k).slice(0, 10).map((g) => g.v)

  type Line = { id: string; kind: Kind; title: string; sub: string; right: string; right2: string; opens: boolean }
  const rows: Line[] = []
  const spText = byR ? `${favCode} −${ln(byR[0])}` : sp != null ? (sp === 0 ? "Pick'em" : `${favCode} −${Math.abs(sp)}`) : null
  if (spText) {
    const l = byR ? last(favF, 'by') : []
    const bits = [l.length && byR ? `last ${l.length}: ${favCode} covered ${hitCount(l, byR[0])}` : '',
      favMargin != null ? `DeVig expects ${favMargin >= 0 ? `${favCode} by ${favMargin.toFixed(1)}` : `${dogCode} by ${(-favMargin).toFixed(1)}`}` : '']
    rows.push({ id: 'by', kind: 'by', title: `Spread ${spText}`, sub: bits.filter(Boolean).join(' · ') || `${dogCode} +${byR ? ln(byR[0]) : Math.abs(sp ?? 0)} the other side`,
      right: byR ? `${favCode} ${pct(mid(byR))}` : '', right2: byR ? `${dogCode} ${under(mid(byR))}` : '', opens: !!byR && !!fc })
  }
  const tot = totR ? ln(totR[0]) : row.total?.line != null ? String(row.total.line) : null
  if (tot) {
    const la = totR ? last(awayF, 'total') : [], lh = totR ? last(homeF, 'total') : []
    const bits = [la.length && totR ? `${row.away} ${hitCount(la, totR[0])}/${la.length} over` : '', lh.length && totR ? `${row.home} ${hitCount(lh, totR[0])}/${lh.length} over` : '']
    rows.push({ id: 'total', kind: 'total', title: `O/U ${tot}`, sub: bits.filter(Boolean).join(' · ') || 'no past games saved yet',
      right: totR ? `Over ${pct(mid(totR))}` : '', right2: totR ? `Under ${under(mid(totR))}` : '', opens: !!totR && !!cHome })
  }
  // each team's points (Kalshi's team totals), the way player props read
  const ttStart: Record<string, number> = {}
  for (const [s, c, f] of [['away', cAway, awayF], ['home', cHome, homeF]] as const) {
    const rs = c ? rungsOf(c, 'tt') : []
    const m = mainRung(rs)
    if (!c || !m) continue
    ttStart[s] = m[0]
    const l = last(f, 'tt')
    rows.push({ id: `tt-${s}`, kind: 'tt', title: `${c.code} ${c.unit} O/U ${ln(m[0])}`,
      sub: l.length ? `last ${l.length}: ${hitCount(l, m[0])} over, ${l.length - hitCount(l, m[0])} under` : 'no past games saved yet',
      right: `Over ${pct(mid(m))}`, right2: `Under ${under(mid(m))}`, opens: true })
  }
  if (!rows.length) return null
  return (
    <section>
      <H>Spread, O/U and team totals</H>
      <ul className='overflow-hidden rounded-2xl border'>
        {rows.map((r) => {
          const inner = (
            <>
              <span className='flex min-w-0 flex-1 flex-col leading-tight'>
                <span className='truncate font-condensed text-[17px] font-bold tabular-nums'>{r.title}</span>
                <span className='text-xs text-muted-foreground'>{r.sub}</span>
              </span>
              {r.right && (
                <span className='flex shrink-0 flex-col items-end font-condensed leading-tight tabular-nums'>
                  <span className='text-[15px] font-bold'>{r.right}</span>
                  <span className='text-xs text-muted-foreground'>{r.right2}</span>
                </span>
              )}
              {r.opens && <ChevronRight className='size-4 shrink-0 text-muted-foreground' aria-hidden='true' />}
            </>
          )
          return (
            <li key={r.id} className='border-t first:border-t-0'>
              {r.opens
                ? <button type='button' aria-haspopup='dialog' onClick={() => setOpen(r.id)}
                    className='flex w-full items-center gap-3 px-3.5 py-2.5 text-start transition-colors duration-150 hover:bg-white/5'>{inner}</button>
                : <div className='flex items-center gap-3 px-3.5 py-2.5'>{inner}</div>}
            </li>
          )
        })}
      </ul>
      <p className='mt-1.5 px-1 text-xs text-muted-foreground'>Chances here are Kalshi&apos;s. DeVig&apos;s chances only cover who wins, so none of these is a DeVig pick. Tap a line for every line, the last 10 and what it costs.</p>
      {open === 'by' && fc && byR && (
        <TeamPropSheet c={fc} kind='by' start={byR[0]} devigMargin={favMargin} open onOpenChange={(v) => !v && setOpen(null)} />
      )}
      {open === 'total' && cHome && totR && <TeamPropSheet c={cHome} kind='total' start={totR[0]} open onOpenChange={(v) => !v && setOpen(null)} />}
      {(['away', 'home'] as const).map((s) => {
        const c = s === 'home' ? cHome : cAway
        return open === `tt-${s}` && c && ttStart[s] != null
          ? <TeamPropSheet key={s} c={c} kind='tt' start={ttStart[s]} open onOpenChange={(v) => !v && setOpen(null)} />
          : null
      })}
    </section>
  )
}
