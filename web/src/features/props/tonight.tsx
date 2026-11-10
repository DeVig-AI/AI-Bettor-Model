// The drawer's "Tonight vs usual" and "Kalshi's price" sections: the game around him (total and spread), the defense
// he faces, how much he's being used lately, his season and home/away rates, past games against this opponent, who's
// out on both teams, and how Kalshi's price for this line has moved. All counts and prices; none of it is a pick.
import { Fragment, useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { type GameRow, nflNick, useGames } from '@/lib/devig'
import { useInjuries } from '@/lib/injuries'
import { usePriceHistory } from '@/lib/props'
import { gamesOf, splits, usage, yardsAllowed } from '@/lib/prop-context'
import { normName } from '@/lib/streak-math'
import { ordinal, rsTeamQuery } from '@/lib/research'
import { cn } from '@/lib/utils'
import type { Logs, Shown } from './board-data'
import { needOf } from './board-data'
import type { PropWhy } from './why'
import { plainStat } from './words'

const dayFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const whenFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric' })
const dateOf = (d: string) => dayFmt.format(new Date(`${d}T12:00:00`))
const f1 = (v: number) => (Math.round(v * 10) / 10).toString()
const pct = (p: number) => `${Math.round(p * 100)}%`
// what counts as a big total gap and a lopsided spread, per sport
const TOTAL_GAP: Record<string, number> = { NFL: 3, NBA: 6, NHL: 0.5 }
const BLOWOUT: Record<string, number> = { NFL: 10, NBA: 12 }

function Fact({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <li className='flex flex-col gap-0.5 border-b px-3 py-2.5 last:border-b-0'>
      <span className='text-xs font-semibold tracking-wide text-muted-foreground uppercase'>{t}</span>
      <span className='text-sm leading-relaxed'>{children}</span>
    </li>
  )
}

export function Tonight({ l, game, team, opp, logs, w }: {
  l: Shown; game: GameRow | null; team: string | null; opp: string | null; logs: Logs | null; w: PropWhy | null
}) {
  const need = needOf(l.line)
  const word = plainStat(l.stat)
  const home = team != null ? team === l.home : null
  const name = (c: string) => (l.sport === 'NFL' && nflNick(c)) ||
    (game ? (c === game.home ? game.homeName : c === game.away ? game.awayName : c) : c) || c

  // his games (newest first), splits, usage
  const me = logs?.player(l.player) ?? null
  const cols = logs?.cols(l.stat) ?? null
  const gs = useMemo(() => (me && cols && logs ? gamesOf(me.log, l.sport, logs.L, cols) : []), [me, cols, logs, l.sport])
  const sp = home != null && opp && gs.length ? splits(gs, l.line, logs?.season ?? null, opp, home) : null
  const use = me && team && logs ? usage(l.sport, l.stat, me, logs.roster(team), logs.L, logs.season) : null

  // the game: total against this sport's other games on the board, and the spread for his team
  const { rows } = useGames()
  const typTotal = useMemo(() => {
    const t = (rows ?? []).filter((r) => r.sport === l.sport && r.total?.line != null).map((r) => r.total!.line).sort((a, b) => a - b)
    return t.length >= 4 ? t[Math.floor(t.length / 2)] : null
  }, [rows, l.sport])
  const total = game?.total?.line ?? null
  const hp = game?.spread?.home_point ?? null
  const mine = hp != null && home != null ? (home ? hp : -hp) : null // his team's spread: negative = favored

  // the defense: the opponent's team file; for the NFL, pass and rush yards allowed from the teams it played
  const of = opp ? logs?.file(opp) ?? null : null
  const season = logs?.season ?? null
  const faced = useMemo(() => (l.sport === 'NFL' && of?.games && season != null
    ? [...new Set(of.games.filter((g) => Number(g[7]) === season).map((g) => String(g[1])))] : []), [l.sport, of, season])
  const facedFiles = useQueries({
    queries: faced.map((c) => ({ ...rsTeamQuery(l.sport, c), retry: false })),
    combine: (rs) => rs.map((r) => r.data),
  })
  const allowed = useMemo(() => {
    if (!opp || !of?.games || season == null || !logs || facedFiles.some((f) => !f)) return null
    const files = Object.fromEntries(faced.map((c, i) => [c, (facedFiles[i]?.players ?? []).map((p) => ({ name: p.name, log: p.log ?? [] }))]))
    return yardsAllowed(opp, of.games, files, logs.L, season)
  }, [opp, of, season, logs, faced, facedFiles])

  // who's out for this game, his team first; the other team's starters only
  const inj = useInjuries().data
  const out = useMemo(() => {
    if (!inj || !team) return null
    const here = inj.filter((x) => x.sport === l.sport && x.away === l.away && x.home === l.home && /out|doubt|question/i.test(x.status))
    const pos = new Map((logs?.roster(team) ?? []).map((p) => [normName(p.name), p.pos ?? '']))
    const mates = here.filter((x) => x.team === team && normName(x.player) !== normName(l.player))
      .map((x) => ({ ...x, pos: pos.get(normName(x.player)) ?? '' }))
    const them = here.filter((x) => x.team !== team && x.starter)
    return { mates, them }
  }, [inj, team, l.sport, l.away, l.home, l.player, logs])
  // NFL: teammates out who'd share his work (same kind of player)
  const myPos = me?.pos ?? ''
  const shares = (p: string) => (/rec|tgt|receptions/.test(l.stat) ? ['WR', 'TE'].includes(p) && ['WR', 'TE', 'RB'].includes(myPos)
    : /rush/.test(l.stat) ? p === 'RB' && myPos === 'RB' : false)
  const sharers = l.sport === 'NFL' && out ? out.mates.filter((x) => /out|doubt/i.test(x.status) && shares(x.pos)) : []

  const facts: [string, React.ReactNode][] = []
  if (total != null || mine != null) {
    const bits: string[] = []
    if (total != null) {
      const gap = typTotal != null ? total - typTotal : 0
      const big = Math.abs(gap) >= (TOTAL_GAP[l.sport] ?? 99)
      bits.push(`Kalshi's total is ${total}${typTotal != null ? (big ? `, ${gap > 0 ? 'more' : 'less'} scoring than most ${l.sport} games on the board (typical ${typTotal})` : `, about normal for ${l.sport} (typical ${typTotal})`) : ''}.`)
    }
    if (mine != null && team) {
      const by = Math.abs(mine)
      bits.push(by < 0.5 ? `It's a pick'em.` : `The ${name(team)} are ${by}-point ${mine < 0 ? 'favorites' : 'underdogs'}.`)
      if (by >= (BLOWOUT[l.sport] ?? 99)) {
        bits.push(l.sport === 'NFL'
          ? mine > 0 && /pass|rec/.test(l.stat) ? 'Teams that fall behind usually throw more.'
            : mine < 0 && /rush/.test(l.stat) ? 'Teams with a big lead usually run more.'
            : 'A lopsided game can change how much he plays late.'
          : 'If it turns into a blowout, starters often sit late.')
      }
    }
    facts.push(['The game', bits.join(' ')])
  }
  if (of?.this && opp) {
    const t = of.this, r = of.ranks ?? {}
    const rk = (k: string, wd: string) => (r[k] ? ` (${ordinal(r[k])} ${wd})` : '')
    if (l.sport === 'NFL' && t.oypg != null) {
      facts.push(['The defense', <>The {name(opp)} allow <b>{f1(Number(t.oypg))}</b> yards a game{rk('oypg', 'fewest')}
        {allowed ? <>: about <b>{Math.round(allowed.pass)}</b> passing and <b>{Math.round(allowed.rush)}</b> rushing ({allowed.n} games).</> : '.'}
        {' '}They give up {f1(Number(t.oppg))} points a game{rk('oppg', 'fewest')}.</>])
    } else if (l.sport === 'NBA' && t.drtg != null) {
      facts.push(['The defense', <>The {name(opp)} allow <b>{f1(Number(t.drtg))}</b> points per 100 possessions{rk('drtg', 'best')}
        {t.pace != null ? <> and play at a pace of {f1(Number(t.pace))} possessions a game</> : null}.
        {w?.read.opp_allows != null ? <> They give up {w.read.opp_allows.toFixed(1)} {word} a game to players like him.</> : null}</>])
    } else if (l.sport === 'NHL' && t.sa != null) {
      facts.push(['The defense', <>The {name(opp)} allow <b>{f1(Number(t.sa))}</b> shots{rk('sa', 'fewest')} and{' '}
        <b>{Number(t.ga).toFixed(2)}</b> goals a game{rk('ga', 'fewest')}.</>])
    }
  }
  if (use) {
    const d = (use.recent - use.season) / (use.season || 1)
    const tone = Math.abs(d) < 0.1 ? '' : d > 0 ? 'text-good' : 'text-bad'
    facts.push(['How much he plays', <>
      <b className={tone}>{f1(use.recent)}</b> {use.word} a game his last {use.recentN}, <b>{f1(use.season)}</b> this season.
      {use.share && <> That&apos;s {pct(use.share.recent)} of the team&apos;s {use.word.split(' ')[0]} lately, {pct(use.share.season)} this season.</>}
      {Math.abs(d) >= 0.1 && <> His role is {d > 0 ? 'growing' : 'shrinking'}.</>}
    </>])
  }
  if (sp) {
    const parts: React.ReactNode[] = []
    if (sp.season.n) parts.push(<Fragment key="s">This season he got {need}+ in <b>{sp.season.hit} of {sp.season.n}</b> games.</Fragment>)
    if (sp.venue.n >= 3) parts.push(<Fragment key="v"> {sp.venue.home ? 'At home' : 'On the road'} like tonight: <b>{sp.venue.hit} of {sp.venue.n}</b>{sp.venue.since ? ` since ${dateOf(sp.venue.since)}` : ''}.</Fragment>)
    if (parts.length) facts.push(['Season and home/away', <>{parts}</>])
    if (opp) facts.push([`Against the ${name(opp)}`, sp.vsOpp.length
      ? <>{sp.vsOpp.map((g, i) => <span key={g.date}>{i ? ' · ' : ''}<b className={g.v > l.line ? 'text-good' : ''}>{g.v}</b> {word} ({dateOf(g.date)})</span>)}</>
      : <>No games against them in his log.</>])
  }
  if (out && (out.mates.length || out.them.length)) {
    const list = (xs: { player: string; status: string; pos?: string }[]) => xs.slice(0, 6).map((x) => `${x.player}${x.pos ? ` (${x.pos})` : ''}, ${x.status.toLowerCase()}`).join(' · ')
    facts.push(["Who's out", <>
      {out.mates.length > 0 && <span className='block'><b>{team ? name(team) : 'His team'}:</b> {list(out.mates)}</span>}
      {out.them.length > 0 && <span className='block'><b>{opp ? name(opp) : 'Opponent'} starters:</b> {list(out.them)}</span>}
      {sharers.length > 0 && <span className='mt-1 block text-muted-foreground'>
        With {sharers.map((x) => x.player).join(' and ')} {sharers.length > 1 ? 'out' : sharers[0].status.toLowerCase()}, more of the {/rush/.test(l.stat) ? 'carries' : 'targets'} may go his way. Kalshi&apos;s price usually already knows.</span>}
    </>])
  }
  if (!facts.length) return null
  return (
    <section className='flex flex-col gap-2'>
      <h3 className='text-xs font-semibold tracking-wide text-muted-foreground uppercase'>Tonight vs. usual</h3>
      <ul className='overflow-hidden rounded-2xl border bg-card'>
        {facts.map(([t, c]) => <Fact key={t} t={t}>{c}</Fact>)}
      </ul>
    </section>
  )
}

// How Kalshi's price for this line moved over the last few days (hourly), ending at the price now
export function PriceMove({ l }: { l: Pick<Shown, 'ticker' | 'mid'> }) {
  const q = usePriceHistory(l.ticker ?? null)
  const pts = q.data ?? []
  if (pts.length < 3) return null
  const series = [...pts.map(([, p]) => p), l.mid]
  const first = pts[0], move = Math.round((l.mid - first[1]) * 100)
  const lo = Math.min(...series), hi = Math.max(...series)
  const W = 320, H = 56, pad = 4
  const y = (p: number) => pad + (H - 2 * pad) * (hi === lo ? 0.5 : 1 - (p - lo) / (hi - lo))
  const d = series.map((p, i) => `${i ? 'L' : 'M'}${((i / (series.length - 1)) * W).toFixed(1)},${y(p).toFixed(1)}`).join(' ')
  return (
    <section className='flex flex-col gap-2'>
      <h3 className='flex items-baseline justify-between text-xs font-semibold tracking-wide text-muted-foreground uppercase'>
        Kalshi&apos;s price
        <span className={cn('font-sans text-sm font-semibold tracking-normal normal-case', Math.abs(move) < 2 ? 'text-foreground' : move > 0 ? 'text-good' : 'text-bad')}>
          {Math.abs(move) < 1 ? 'About the same' : `${move > 0 ? 'Up' : 'Down'} ${Math.abs(move)} point${Math.abs(move) === 1 ? '' : 's'}`}
        </span>
      </h3>
      <svg viewBox={`0 0 ${W} ${H}`} width='100%' role='img' aria-label={`Kalshi's price went from ${pct(first[1])} to ${pct(l.mid)}`}>
        <path d={d} fill='none' stroke='var(--foreground)' strokeWidth={2} strokeLinejoin='round' strokeLinecap='round' />
      </svg>
      <p className='text-sm leading-relaxed text-muted-foreground'>
        {pct(first[1])} on {whenFmt.format(new Date(first[0] * 1000))}, {pct(l.mid)} now. Prices move with news and with money;
        a move alone isn&apos;t a reason to bet.
      </p>
    </section>
  )
}
