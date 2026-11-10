// Team props in the team drawer: Kalshi's line closest to even for this team's points, this team winning by N+, and
// both teams' points together, each next to how often the team got there in its last 10 games. A row opens its own
// drawer with every line Kalshi has, the chances, what Kalshi's lines expect, the last 10, tonight vs. usual, the price
// over time, and what each side costs (a link to Kalshi; not in the parlay, since its legs are priced as if unrelated).
// DeVig has no model for these: it's the history next to the price, never a pick.
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { type GameRow, fmtAmerican, nflNick } from '@/lib/devig'
import { RS_SPORTS, statsCode, useRsTeam } from '@/lib/research'
import { priceToAmerican, propSide } from '@/lib/props'
import {
  type Kind, type Rung, type TeamPropsData, allowedOf, expected, hitCount, mainRung, mid, valuesOf,
} from '@/lib/team-props-math'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { TeamLogo } from '@/components/team-logo'
import { kalshiLink } from '../parlay/legs'
import { Bar } from '../props/player-sheet'
import { PriceMove } from '../props/tonight'
import { money, payout } from '../props/words'
import type { Side } from './team-sheet'

const LAST = 10
const SPORT_WORDS: Record<string, string> = { CBB: 'college basketball', CFB: 'college football' }
const whenFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
export const pct = (p: number) => `${Math.round(p * 100)}%`
export const under = (p: number) => `${100 - Math.round(p * 100)}%` // so Over + Under shows 100%
export const one = (x: number) => x.toFixed(1).replace(/\.0$/, '')
const signed = (x: number) => (x > 0 ? '+' : x < 0 ? '−' : '') + one(Math.abs(x))
const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length

export function useTeamProps(row: GameRow, on: boolean) {
  return useQuery({
    queryKey: ['team_props', row.ticker],
    enabled: on && !!row.ticker && row.state === 'pre',
    staleTime: 60e3,
    retry: false,
    queryFn: async () => {
      const r = await fetch(`/api/team-props?game=${encodeURIComponent(row.ticker!)}`, { headers: { accept: 'application/json' } })
      if (!r.ok) return null
      return (await r.json()) as TeamPropsData
    },
  })
}

// a team's games from the stats bot
export function useGames(sport: string, code: string) {
  const ok = (RS_SPORTS as readonly string[]).includes(sport)
  const q = useRsTeam(sport, ok ? statsCode(sport, code) : '')
  return ok ? q.data ?? null : null
}

export type Ctx = {
  row: GameRow; side: Side; d: TeamPropsData
  k: string; ko: string // Kalshi's codes for this team and the other one
  code: string; oppCode: string; nick: string; oppNick: string; unit: string
  the: string // 'the ' before a pro nickname ("the Knicks"), nothing before a school ("Florida")
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const poss = (n: string) => (/s$/.test(n) ? `${n}'` : `${n}'s`)

// "New York Knicks" -> "Knicks", "Portland Trail Blazers" -> "Trail Blazers"
const TWO = /(Trail Blazers|Red Sox|White Sox|Blue Jays|Maple Leafs|Blue Jackets|Golden Knights|Red Wings)$/
export const nickname = (full: string) => full.match(TWO)?.[1] ?? full.split(' ').pop() ?? full

export function useCtx(row: GameRow, side: Side, d: TeamPropsData | null | undefined): Ctx | null {
  const home = side === 'home'
  const code = home ? row.home : row.away, oppCode = home ? row.away : row.home
  const mine = useGames(row.sport, code), theirs = useGames(row.sport, oppCode)
  if (!d) return null
  // stats files carry the full name; pro rows only have the code
  const nickOf = (c: string, full: string | undefined, name: string) =>
    (row.sport === 'NFL' && nflNick(c)) || (full && row.sport !== 'CFB' && row.sport !== 'CBB' ? nickname(full) : '') || name || c
  return {
    row, side, d, k: home ? d.home : d.away, ko: home ? d.away : d.home, code, oppCode,
    nick: nickOf(code, mine?.name, home ? row.homeName : row.awayName),
    oppNick: nickOf(oppCode, theirs?.name, home ? row.awayName : row.homeName),
    unit: row.sport === 'NHL' ? 'goals' : row.sport === 'MLB' ? 'runs' : 'points',
    the: row.sport === 'CBB' || row.sport === 'CFB' ? '' : 'the ',
  }
}

export const rungsOf = (c: Ctx, kind: Kind): Rung[] => (kind === 'total' ? c.d.total : (kind === 'tt' ? c.d.tt : c.d.by)[c.k] ?? [])
// points and the game total read as over/under a half-point line (Kalshi's "22+" is over 21.5); win-by stays N+
export const ln = (need: number) => (need - 0.5).toFixed(1)
const got = (kind: Kind) => (kind === 'by' ? 'got there' : 'went over')

export function TeamPropSheet({ c, kind, open, onOpenChange, start, devigMargin }: {
  c: Ctx; kind: Kind; open: boolean; onOpenChange: (v: boolean) => void
  start?: number // the line to open on (the game's spread); else the one nearest even
  devigMargin?: number | null // DeVig's expected margin for this team (its model's number, not a chance)
}) {
  const { row } = c
  const rungs = rungsOf(c, kind)
  const [pick, setPick] = useState(() => (start != null && rungs.some((x) => x[0] === start) ? start : mainRung(rungs)![0]))
  const r = rungs.find((x) => x[0] === pick) ?? mainRung(rungs)!
  const need = r[0]
  const file = useGames(row.sport, c.code)
  const oppFile = useGames(row.sport, c.oppCode)
  const season = file?.season_year ?? null
  const all = useMemo(() => valuesOf(file?.games, kind), [file, kind])
  const last = all.slice(0, LAST).map((g) => g.v)
  const now = season == null ? [] : all.filter((g) => g.season === season)
  const h10 = hitCount(last, need), hs = hitCount(now.map((g) => g.v), need)
  const color = (c.side === 'home' ? row.colors?.home : row.colors?.away) || 'var(--side-home)'
  const id = c.side === 'home' ? row.ids?.home : row.ids?.away
  const title = kind === 'tt' ? `${c.nick} ${c.unit}` : kind === 'by' ? `${c.nick} win by` : 'Game total'
  const ask = kind === 'tt' ? `${cap(c.the)}${c.nick}: over or under ${ln(need)} ${c.unit}?`
    : kind === 'by' ? `Will ${c.the}${c.nick} win by ${need}+?` : `Both teams together: over or under ${ln(need)} ${c.unit}?`
  const m = mid(r)
  const chips = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const t = setTimeout(() => chips.current?.querySelector<HTMLElement>('[aria-pressed=true]')?.scrollIntoView({ inline: 'center', block: 'nearest' }), 250)
    return () => clearTimeout(t)
  }, [])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side='bottom' onOpenAutoFocus={(e) => e.preventDefault()}
        className='max-h-[92svh] gap-0 overflow-y-auto rounded-t-3xl border-t p-0 md:mx-auto md:max-w-xl [&>button:last-child]:top-3.5 [&>button:last-child]:grid [&>button:last-child]:size-9 [&>button:last-child]:place-items-center [&>button:last-child]:rounded-full [&>button:last-child]:bg-black/30 [&>button:last-child]:text-white [&>button:last-child]:opacity-100'>
        <div className='relative flex shrink-0 items-center gap-3 overflow-hidden rounded-t-3xl px-5 pt-6 pb-4 text-white' style={{ background: color }}>
          <span aria-hidden='true' className='absolute inset-0 bg-linear-to-b from-black/5 to-black/40' />
          <span aria-hidden='true' className='absolute top-2 left-1/2 h-1.5 w-10 -translate-x-1/2 rounded-full bg-white/45' />
          <TeamLogo sport={row.sport} code={c.code} id={id} color={color} px={128} className='relative size-14 text-lg' />
          <div className='relative min-w-0 flex-1 pe-10'>
            <SheetTitle className='truncate font-display text-[26px] leading-none font-black text-white'>{title}</SheetTitle>
            <SheetDescription className='mt-1 text-sm text-white/85'>
              {c.side === 'home' ? 'vs' : 'at'} {c.oppNick} · {whenFmt.format(new Date(row.kickoff))}
            </SheetDescription>
          </div>
        </div>

        <div className='flex flex-col gap-5 px-5 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]'>
          <section className='flex flex-col gap-2'>
            <h3 className='text-xs font-semibold tracking-wide text-muted-foreground uppercase'>Pick a line</h3>
            <div ref={chips} className='no-scrollbar -mx-5 flex gap-1.5 overflow-x-auto px-5'>
              {rungs.map((x) => (
                <button key={x[3]} type='button' aria-pressed={x[0] === need} onClick={() => setPick(x[0])}
                  className={cn('h-10 min-w-14 shrink-0 rounded-xl border px-3 font-condensed text-base font-bold tabular-nums transition-colors duration-150',
                    x[0] === need ? 'border-foreground bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}>
                  {kind === 'by' ? `${x[0]}+` : ln(x[0])}
                </button>
              ))}
            </div>
          </section>

          <p className='font-display text-[26px] leading-tight font-extrabold'>{ask}</p>

          {r[2] - r[1] > 0.1 && (
            <p className='rounded-2xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm leading-relaxed'>
              Few trades on this line ({Math.round((r[2] - r[1]) * 100)}¢ between buy and sell), so Kalshi&apos;s price is shaky.
            </p>
          )}

          <section className='flex flex-col gap-3'>
            <h3 className='text-xs font-semibold tracking-wide text-muted-foreground uppercase'>{kind === 'by' ? 'Chance it happens' : 'Chance of the over'}</h3>
            <Bar label='Kalshi' sub='what bettors pay' p={m} value={pct(m)} tone='bg-foreground' />
            {last.length > 0 && <Bar label={`Last ${last.length}`} sub={`${h10} of ${last.length} ${got(kind)}`} p={h10 / last.length} value={`${h10}/${last.length}`} tone='bg-good' />}
            {now.length > 0 && <Bar label='This season' sub={`${hs} of ${now.length}`} p={hs / now.length} value={`${hs}/${now.length}`} tone='bg-good' />}
            <div aria-hidden='true' className='grid grid-cols-[6.5rem_1fr_3rem] gap-3 text-[11px] text-muted-foreground tabular-nums'>
              <span /><span className='flex justify-between'><span>0%</span><span>50%</span><span>100%</span></span><span />
            </div>
            <p className='rounded-2xl bg-muted px-4 py-3 text-sm leading-relaxed text-muted-foreground'>
              {kind !== 'by' && <>Under is the other side: Kalshi {under(m)}{last.length ? `, last ${last.length}: ${last.length - h10} of ${last.length}` : ''}. </>}
              DeVig has no chance model for {kind === 'tt' ? 'team totals' : kind === 'by' ? 'winning margins' : 'game totals'} yet, so there&apos;s
              no DeVig chance here. {last.length ? 'These are counts, not a pick.' : `DeVig doesn't save ${SPORT_WORDS[row.sport] ?? row.sport} scores yet, so there are no past games to count.`}
            </p>
          </section>

          {kind === 'by' && devigMargin != null && (
            <section className='flex flex-col gap-2 rounded-2xl border border-devig/25 bg-devig/10 p-4'>
              <div className='flex items-end justify-between gap-3'>
                <div className='text-xs font-semibold tracking-wide text-muted-foreground uppercase'>DeVig&apos;s model expects</div>
                <div className='font-display text-[36px] leading-none font-black text-devig tabular-nums'>{signed(devigMargin)}</div>
              </div>
              <p className='text-sm leading-relaxed'>
                {devigMargin > 0 ? <>{cap(c.the)}{c.nick} by <b>{one(devigMargin)}</b></> : <>{cap(c.the)}{c.nick} losing by <b>{one(-devigMargin)}</b></>}
                {devigMargin > 0 && <>{devigMargin >= need ? `, past the ${need}+ line` : `, short of the ${need}+ line`}</>}.
                {' '}That&apos;s its margin, not a chance: DeVig&apos;s model is tested on who wins, not on spreads, so it isn&apos;t a spread pick.
              </p>
            </section>
          )}

          <Expect c={c} kind={kind} need={need} last={last} oppLast={valuesOf(oppFile?.games, kind).slice(0, LAST).map((g) => g.v)} />

          {last.length > 0 && (
            <section className='flex flex-col gap-2'>
              <h3 className='flex items-baseline justify-between text-xs font-semibold tracking-wide text-muted-foreground uppercase'>
                {kind === 'by' ? `Their last ${last.length} margins` : `Their last ${last.length} games`}
                <span className='font-sans text-sm font-semibold tracking-normal text-foreground normal-case'>{h10} of {last.length} {got(kind)}</span>
              </h3>
              <LastChart last={last} need={need} margin={kind === 'by'} />
              <p className='flex items-center gap-2 text-xs text-muted-foreground'>
                <svg width='22' height='4' aria-hidden='true'><line x1='0' x2='22' y1='2' y2='2' stroke='currentColor' strokeWidth='1.5' strokeDasharray='5 4' /></svg>
                {kind === 'by' ? `wins by ${need}` : `line ${ln(need)}`} · green games {got(kind)}{kind === 'by' ? ' · below zero = lost' : ''}
              </p>
            </section>
          )}

          <Facts c={c} kind={kind} need={need} all={all} season={season} oppGames={oppFile?.games} oppSeason={oppFile?.season_year ?? null} />
          <PriceMove l={{ ticker: r[3], mid: m }} />
          <Costs c={c} kind={kind} r={r} />
        </div>
      </SheetContent>
    </Sheet>
  )
}

// What Kalshi's own lines expect: where its game total and margin ladders cross 50%
function Expect({ c, kind, need, last, oppLast }: { c: Ctx; kind: Kind; need: number; last: number[]; oppLast: number[] }) {
  const e = expected(c.d)
  const fav = e.fav === c.k ? c.nick : e.fav === c.ko ? c.oppNick : null
  let big: string | null = null, body: React.ReactNode = null
  if (kind === 'tt' && e.pts[c.k] != null && e.total != null && e.margin != null) {
    big = one(e.pts[c.k])
    body = <>Kalshi&apos;s lines put the game total near <b>{one(e.total)}</b> and the {fav} ahead by about <b>{one(e.margin)}</b>.
      Split the total by the margin: ({one(e.total)} {e.fav === c.k ? '+' : '−'} {one(e.margin)}) ÷ 2 ≈ <b>{one(e.pts[c.k])}</b> {c.unit} for {c.the}{c.nick}.
      {Math.abs(e.pts[c.k] - need) <= 1.5 ? ` That's why ${ln(need)} is priced near even.` : ''}</>
  } else if (kind === 'by' && e.margin != null && fav) {
    big = e.fav === c.k ? `by ${one(e.margin)}` : `−${one(e.margin)}`
    body = <>Kalshi&apos;s lines have {c.the}<b>{fav}</b> winning by about <b>{one(e.margin)}</b>.
      {e.fav === c.k ? ` Winning by ${need}+ is a slice of their chance to win at all.` : ` For ${c.the}${c.nick} to win by ${need}+, the favorite has to lose by that much.`}</>
  } else if (kind === 'total' && e.total != null) {
    big = one(e.total)
    body = <>Kalshi&apos;s lines put the game total near <b>{one(e.total)}</b>.
      {last.length > 0 && ` ${cap(c.the)}${poss(c.nick)} last ${last.length} games averaged ${one(avg(last))} together`}
      {oppLast.length > 0 && `${last.length ? `, ${c.the}` : ` ${cap(c.the)}`}${poss(c.oppNick)} ${one(avg(oppLast))}`}{(last.length || oppLast.length) ? '.' : ''}</>
  }
  if (!body) return null
  return (
    <section className='flex flex-col gap-2 rounded-2xl border border-devig/25 bg-devig/10 p-4'>
      <div className='flex items-end justify-between gap-3'>
        <div className='text-xs font-semibold tracking-wide text-muted-foreground uppercase'>What Kalshi&apos;s lines expect</div>
        <div className='font-display text-[36px] leading-none font-black text-devig tabular-nums'>{big}</div>
      </div>
      <p className='text-sm leading-relaxed'>{body}</p>
    </section>
  )
}

function Facts({ c, kind, need, all, season, oppGames, oppSeason }: {
  c: Ctx; kind: Kind; need: number; all: ReturnType<typeof valuesOf>; season: number | null
  oppGames: (string | number | null)[][] | undefined; oppSeason: number | null
}) {
  if (!all.length) return null
  const now = season == null ? [] : all.filter((g) => g.season === season)
  const last4 = all.slice(0, 4).map((g) => g.v)
  const venue = now.filter((g) => g.ha === (c.side === 'home' ? 'H' : 'A')).map((g) => g.v)
  const opp = oppSeason == null ? [] : allowedOf(oppGames, kind).filter((g) => g.season === oppSeason).map((g) => g.v)
  const show = (v: number) => (kind === 'by' ? signed(v) : String(v))
  const won = now.filter((g) => g.v > 0).length // 'by' only: wins this season
  const items: [string, React.ReactNode][] = []
  if (kind === 'tt') {
    items.push(["Their offense lately", <>{last4.join(', ')} in their last {last4.length} games{now.length ? <>, <b>{one(avg(now.map((g) => g.v)))}</b> a game this season</> : null}.</>])
    if (opp.length) items.push(['The defense they face', <>{cap(c.the)}{c.oppNick} give up <b>{one(avg(opp))}</b> a game this season. Their opponents went over {ln(need)} in <b>{hitCount(opp, need)} of {opp.length}</b>.</>])
  } else if (kind === 'by') {
    items.push(['Their margins lately', <>{last4.map(signed).join(', ')} in their last {last4.length} games.{now.length ? ` ${won}-${now.length - won} this season.` : ''}</>])
    if (opp.length) items.push(['The other side', <>{cap(c.the)}{c.oppNick} lost by {need}+ in <b>{hitCount(opp, need)} of {opp.length}</b> games this season.</>])
  } else {
    items.push(["Their games", <>{last4.join(', ')} total {c.unit} in their last {last4.length}{now.length ? <>, <b>{one(avg(now.map((g) => g.v)))}</b> a game this season</> : null}.</>])
    if (opp.length) items.push(["The other team's games", <>{cap(c.the)}{poss(c.oppNick)} games went over {ln(need)} in <b>{hitCount(opp, need)} of {opp.length}</b> this season (avg {one(avg(opp))}).</>])
  }
  if (venue.length) items.push([c.side === 'home' ? 'At home' : 'On the road',
    <>{c.side === 'home' ? 'At home' : 'On the road'} this season: <b>{hitCount(venue, need)} of {venue.length}</b> {got(kind)} ({venue.map(show).join(', ')}).</>])
  return (
    <section className='flex flex-col gap-2'>
      <h3 className='text-xs font-semibold tracking-wide text-muted-foreground uppercase'>Tonight vs. usual</h3>
      <ul className='overflow-hidden rounded-2xl border'>
        {items.map(([t, b]) => (
          <li key={t} className='flex flex-col gap-0.5 border-b px-3.5 py-2.5 last:border-b-0'>
            <span className='text-[11px] font-semibold tracking-wide text-muted-foreground uppercase'>{t}</span>
            <span className='text-sm leading-relaxed'>{b}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

// last games, oldest to newest; margins can go below zero (a loss)
function LastChart({ last, need, margin }: { last: number[]; need: number; margin: boolean }) {
  const xs = last.slice().reverse()
  // margins start at their lowest loss; points start a bit under the lowest game so the gaps between games show
  const lo = margin ? Math.min(0, ...xs) : Math.max(0, Math.floor(Math.min(need, ...xs) * 0.8))
  const W = 320, H = lo < 0 ? 160 : 140, top = 18, bot = lo < 0 ? 36 : 20, n = xs.length, top0 = Math.max(need, ...xs), hi = top0 + (top0 - lo) * 0.1 || 1, base = margin ? 0 : lo
  const y = (v: number) => top + ((hi - v) / (hi - lo)) * (H - top - bot)
  const bw = W / n
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width='100%' role='img' aria-label={`Last ${n} games: ${xs.join(', ')}. Needs ${need}.`}>
      {xs.map((v, i) => {
        const hit = v >= need, y0 = y(Math.max(base, v)), y1 = y(Math.min(base, v)), x0 = i * bw + 3
        return (
          <g key={i}>
            <rect x={x0} y={y0} width={bw - 6} height={Math.max(2, y1 - y0)} rx={3} fill={hit ? 'var(--good)' : 'var(--muted-foreground)'} opacity={hit ? 1 : 0.35} />
            <text x={x0 + (bw - 6) / 2} y={v >= base ? y0 - 4 : y1 + 12} textAnchor='middle' fontSize={11} fontWeight={700}
              fill={hit ? 'var(--foreground)' : 'var(--muted-foreground)'}>{margin ? signed(v) : v}</text>
          </g>
        )
      })}
      {lo < 0 && <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke='var(--muted-foreground)' strokeWidth={1} opacity={0.5} />}
      <line x1={0} x2={W} y1={y(need)} y2={y(need)} stroke='var(--foreground)' strokeWidth={1.5} strokeDasharray='5 4' />
      <text x={2} y={H - 5} fontSize={10.5} fill='var(--muted-foreground)'>{n} games ago</text>
      <text x={W - 2} y={H - 5} textAnchor='end' fontSize={10.5} fill='var(--muted-foreground)'>last game</text>
    </svg>
  )
}

// What each side costs with Kalshi's fee and pays on $10; each opens that side on Kalshi
function Costs({ c, kind, r }: { c: Ctx; kind: Kind; r: Rung }) {
  const pre = Date.parse(c.row.kickoff) > Date.now()
  const px = { bid: r[1], ask: r[2] }
  const sides = (['yes', 'no'] as const).map((s) => {
    const ps = propSide(px, s === 'yes' ? 'over' : 'under')
    const pay = payout(px, s === 'yes')
    const label = kind === 'by' ? (s === 'yes' ? `Yes, win by ${r[0]}+` : `No, not by ${r[0]}+`) : `${s === 'yes' ? 'Over' : 'Under'} ${ln(r[0])}`
    return { s, ps, pay, label, link: pre ? kalshiLink(r[3], s) : null }
  })
  return (
    <section className='flex flex-col gap-2'>
      <h3 className='text-xs font-semibold tracking-wide text-muted-foreground uppercase'>What it costs</h3>
      <div className='grid grid-cols-2 gap-2'>
        {sides.map(({ s, ps, pay, label, link }) => {
          if (!ps || !pay) return <div key={s} className='rounded-2xl bg-muted p-3 text-sm text-muted-foreground'>{label}: no price</div>
          const odds = priceToAmerican(ps.cost)
          const inner = (
            <>
              <span className='text-sm font-semibold'>{label}</span>
              <span className='font-condensed text-2xl font-bold tabular-nums'>
                {Math.round(ps.price * 100)}¢ <span className='text-base text-muted-foreground'>{odds == null ? '' : fmtAmerican(Math.round(odds))}</span>
              </span>
              <span className='text-xs text-muted-foreground'>$10 wins {money(pay.profit)}</span>
              {link && <span className='mt-1 inline-flex items-center gap-1 text-xs font-semibold'>Open on Kalshi <ArrowUpRight className='size-3.5' aria-hidden='true' /></span>}
            </>
          )
          const cls = 'flex flex-col items-start gap-0.5 rounded-2xl border bg-card p-3 text-start transition-colors duration-150'
          return link
            ? <a key={s} href={link.url} target='_blank' rel='noopener noreferrer' className={cn(cls, 'hover:border-foreground/40')}>{inner}</a>
            : <div key={s} className={cn(cls, 'opacity-70')}>{inner}</div>
        })}
      </div>
      <p className='text-xs text-muted-foreground'>
        Costs include Kalshi&apos;s fee. {pct(mid(r))} is the middle of Kalshi&apos;s buy and sell prices. Not in the parlay builder yet:
        it would price these as unrelated to who wins, and they aren&apos;t.
      </p>
    </section>
  )
}
