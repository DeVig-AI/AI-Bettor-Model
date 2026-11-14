import { useEffect, useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { AlertTriangle, Check, ChevronRight, Lightbulb, X } from 'lucide-react'
import type { KRead, Saved } from '@/lib/kalshi-link'
import {
  type GradeLeg, type LegGame, type LegInfo, type Outcome, type Snap, type TakeLeg,
  SUMMARY, codes, grade, legOutcome, lessons, parseLeg, priceAt, rowOf, snapOf, takeaways, useDevigViews, useHistories, useLegGames, weakSpots, weakestOf,
} from '@/lib/review'
import { type Raw, useSummary } from '@/lib/wrap'
import type { Pace } from '@/lib/pace-math'
import { PaceBar, usePropPace } from './prop-pace'
import { cn } from '@/lib/utils'
import { GameWrap } from '../game/wrap'
import { PulseCard } from './pulse'
import { Fold, MoreLabel, Progress, type Seg, TrackList, TrackRow, useInDrawer } from './bet-drawer'
import { ShareCard } from './share-card'
import { type ShareLeg, shareText } from '@/lib/share-math'
import { LegBar } from '@/components/leg-bar'
import { PlayerPhoto, TeamLogo } from '@/components/team-logo'
import { useRosterPlayer } from '@/lib/headshots'

// The parlay review under a Kalshi combo: a grade with its reasons, the weak spots, each game's legs with what they
// needed and what happened, the price path (when you saved it, at kickoff, now), and what to learn from it. The first
// read is kept as a snapshot on this device, and the outcome once it's decided, so later tickets can be compared.

type Combo = Extract<KRead, { kind: 'combo' }>
const pct = (p: number | null | undefined) => (p == null ? '—' : `${Math.round(p * 100)}%`)
const shareDay = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const TONE: Record<string, string> = { A: 'bg-good/15 text-good', B: 'bg-good/10 text-good', C: 'bg-muted text-foreground', D: 'bg-[#F5C77A]/15 text-[#F5C77A]', F: 'bg-bad/15 text-bad' }

export function ParlayReview({ d, entry, all, onStore }: { d: Combo; entry: Saved | null; all: Saved[]; onStore: (s: Partial<Saved>) => void }) {
  const inDrawer = useInDrawer()
  const infos = useMemo(() => d.legs.map(parseLeg), [d.legs])
  const { games, loading: gLoading } = useLegGames(infos)
  const { views: devig, loading: dLoading } = useDevigViews(infos, games)
  const snap = entry?.snap ?? null

  // the price at kickoff, for legs whose game has started: the "closing" price
  const savedAt = snap ? Math.floor(Date.parse(snap.at) / 1000) : null
  const hist = useHistories(infos.map((i) => {
    const g = games[i.key]
    const kick = g ? Math.floor(Date.parse(g.kickoff) / 1000) : null
    return { key: i.key, ticker: i.leg.ticker, from: kick ? Math.min(savedAt ?? kick, kick) - 6 * 3600 : null, on: !!g && g.state !== 'pre' }
  }))
  const yesAt = (i: LegInfo, p: number | null) => (p == null ? null : i.leg.side === 'no' ? 1 - p : p)
  const kickOf = (i: LegInfo) => { const g = games[i.key]; return g && g.state !== 'pre' ? yesAt(i, priceAt(hist[i.key], g.kickoff)) : null }

  const gameName = (g: LegGame | null | undefined, i: LegInfo) => (g ? `${g.away} at ${g.home}` : i.match)
  // grade on the prices now for open legs; legs already started use their kickoff price (else what was saved)
  const gl: (GradeLeg & { open: boolean })[] = infos.map((i) => {
    const g = games[i.key]
    const started = !!i.leg.result || (g && g.state !== 'pre')
    const chance = started ? (kickOf(i) ?? snap?.legs[i.key]?.chance ?? null) : i.leg.chance
    return {
      key: i.key, label: i.label, chance, bid: started ? null : i.leg.bid, ask: started ? null : i.leg.ask,
      devig: devig[i.key]?.p ?? snap?.legs[i.key]?.devig ?? null, game: gameName(g, i), open: !i.leg.result && (!g || g.state !== 'post'),
    }
  })
  const anyStarted = gl.some((l) => !l.open || games[l.key]?.state === 'in')
  const g = grade(gl, anyStarted ? null : d.combo.ask, anyStarted ? null : d.multiplied)
  const weak = weakSpots(gl)
  // once settled, show the grade it was given then (same letter as the drawer header), not a re-score on today's prices
  const kept = entry?.outcome?.letter ?? (snap && anyStarted ? snap.letter : null)
  const shownG = kept ? { ...g, letter: kept, score: kept === snap?.letter ? snap.score : g.score, summary: SUMMARY[kept] } : g
  const decided = d.combo.result != null || d.lost > 0 || d.won === d.legs.length
  const won = d.combo.result === 'won' || (d.combo.result == null && d.lost === 0 && d.won === d.legs.length)

  // keep the first read (while legs are open), and the outcome once it's decided
  useEffect(() => {
    if (!snap && !anyStarted && !gLoading && !dLoading && gl.every((l) => l.chance != null)) onStore({ snap: snapOf(d, g, gl) })
  }, [d.fetched_at, gLoading, dLoading]) // eslint-disable-line react-hooks/exhaustive-deps
  const weakestKey = snap?.weakest ?? weakestOf(gl)?.key ?? null
  const take: (TakeLeg & { key: string })[] = infos.map((i, n) => ({
    key: i.key, label: i.label, result: i.leg.result, before: snap?.legs[i.key]?.chance ?? null, kick: kickOf(i),
    devig: gl[n].devig, weakest: i.key === weakestKey,
  }))
  const histReady = infos.every((i) => games[i.key]?.state == null || games[i.key]!.state === 'pre' || hist[i.key] !== undefined)
  useEffect(() => {
    if (!decided || entry?.outcome || !histReady) return
    const o: Outcome = {
      at: d.fetched_at, won, legs: d.legs.length, hit: snap?.hit ?? g.hit, letter: snap?.letter ?? g.letter,
      lost: take.filter((l) => l.result === 'lost').map((l) => {
        const p = l.kick ?? l.before
        return { kind: infos.find((i) => i.key === l.key)!.kind, weakest: l.weakest, fav: p != null && p >= 0.7, doubted: l.devig != null && p != null && l.devig - p <= -0.03 }
      }),
    }
    onStore({ outcome: o })
  }, [decided, histReady]) // eslint-disable-line react-hooks/exhaustive-deps

  // legs grouped by game, games in kickoff order; legs DeVig can't place go last
  const groups = useMemo(() => {
    const m = new Map<string, LegInfo[]>()
    for (const i of infos) { const k = games[i.key] ? `${games[i.key]!.sport}|${games[i.key]!.eid}` : 'other'; m.set(k, [...(m.get(k) ?? []), i]) }
    return [...m.entries()].sort(([a, x], [b, y]) => (a === 'other' ? 1 : b === 'other' ? -1 : Date.parse(games[x[0].key]!.kickoff) - Date.parse(games[y[0].key]!.kickoff)))
  }, [infos, games])

  // the share card, once it's decided: each leg with its game's final score, and Kalshi's odds at kickoff
  const share = useMemo(() => {
    if (!decided) return null
    const legs: ShareLeg[] = infos.map((i) => {
      const gm = games[i.key]
      const score = gm && gm.awayScore != null && gm.homeScore != null ? `${gm.state === 'post' ? 'Final' : 'Now'}: ${gm.away} ${gm.awayScore}, ${gm.home} ${gm.homeScore}` : null
      return { label: i.label, result: i.leg.result, score, weakest: i.key === weakestKey }
    })
    const kicks = infos.map((i) => games[i.key]?.kickoff).filter((x): x is string => !!x).sort()
    return { legs, t: shareText(legs, anyStarted ? g.hit : (snap?.hit ?? g.hit), shareDay.format(new Date(kicks[0] ?? d.fetched_at))) }
  }, [decided, infos, games, weakestKey, anyStarted, g.hit, snap?.hit, d.fetched_at])

  const learn = decided ? takeaways(take, snap?.hit ?? g.hit, snap?.letter ?? g.letter) : []
  // every OTHER combo you checked here that's over; this one counts only once it's decided
  const outs = all.filter((s) => s !== entry || decided).map((s) => s.outcome).filter((o): o is Outcome => !!o)
  const past = lessons(outs)

  const segOf = (i: LegInfo): Seg => i.leg.result ?? (games[i.key] && games[i.key]!.state !== 'pre' ? 'live' : 'later')
  const stillOpen = infos.filter((i) => !i.leg.result)
  const cashNow = d.lost > 0 || d.combo.result ? null
    : d.combo.chance ?? (stillOpen.every((i) => i.leg.chance != null) ? stillOpen.reduce((m, i) => m * i.leg.chance!, 1) : null)

  return (
    <div className={inDrawer ? 'contents' : 'flex flex-col gap-3'}>
      {inDrawer && (
        <>
          <Progress segs={infos.map(segOf)} side={cashNow != null && (
            <span className='text-end'>
              <span className='block font-condensed text-2xl leading-none font-bold tabular-nums'>{fine(cashNow)}</span>
              <span className='block text-xs text-muted-foreground'>to cash now{snap?.hit != null ? ` · was ${fine(snap.hit)}` : ''}</span>
            </span>
          )} />
          <TrackList items={infos.map((i) => ({
            key: i.key, st: segOf(i),
            row: <ComboLegRow i={i} st={segOf(i)} game={games[i.key] ?? null} dv={devig[i.key] ?? null} snap={snap} k={kickOf(i)} weakest={i.key === weakestKey && stillOpen.length > 1} />,
          }))} />
          <MoreLabel />
        </>
      )}
      <Fold title='Chance it all hits' peek='Chart'>
        <PulseCard d={d} savedAt={entry?.savedAt ?? null} label={entry?.label ?? null} />
      </Fold>
      <Fold title='Grade' peek={shownG.letter + (weak.length && !decided ? ` · ${weak.length} weak ${weak.length === 1 ? 'spot' : 'spots'}` : '')}>
        <GradeCard g={shownG} snap={snap} started={anyStarted} />
        {weak.length > 0 && !decided && (
          <section aria-label='Weak spots' className='rounded-[18px] bg-card p-4'>
            <h3 className='flex items-center gap-2 font-display text-lg font-extrabold'><AlertTriangle className='size-4 text-[#F5C77A]' aria-hidden='true' />Weak spots</h3>
            <ul className='mt-2 flex flex-col gap-2 text-sm leading-relaxed'>{weak.map((w, n) => <li key={n}>{w.text}</li>)}</ul>
          </section>
        )}
      </Fold>
      {!inDrawer && groups.map(([k, ls]) => (
        <GameGroup key={k} legs={ls} game={k === 'other' ? null : games[ls[0].key]} devig={devig} snap={snap} kick={(i) => kickOf(i)} weakestKey={weakestKey} />
      ))}
      {(learn.length > 0 || (decided && share) || outs.length >= 2) && (
        <Fold title='Lessons' peek={decided ? 'What to learn' : 'Your past combos'}>
          {learn.length > 0 && (
            <section aria-label='What to learn from this one' className='rounded-[18px] bg-card p-4'>
              <h3 className='flex items-center gap-2 font-display text-lg font-extrabold'><Lightbulb className='size-4 text-devig' aria-hidden='true' />What to learn from this one</h3>
              <ul className='mt-2 flex list-disc flex-col gap-2 ps-5 text-sm leading-relaxed'>{learn.map((t, n) => <li key={n}>{t}</li>)}</ul>
            </section>
          )}
          {decided && share && <ShareCard t={share.t} legs={share.legs} letter={snap?.letter ?? g.letter} won={won} />}
          {outs.length >= 2 && (
            <section aria-label='Your past checked combos' className='rounded-[18px] bg-card p-4'>
              <h3 className='font-display text-lg font-extrabold'>What your {outs.length} finished combos say</h3>
              <p className='mt-1 text-sm text-muted-foreground'>{decided ? 'Includes this one.' : 'Not this one: it’s still going. These are earlier combos you checked here.'}</p>
              <ul className='mt-2 flex list-disc flex-col gap-2 ps-5 text-sm leading-relaxed'>{past.map((t, n) => <li key={n}>{t}</li>)}</ul>
              <p className='mt-2 text-xs text-muted-foreground'>Each combo counts once its result is in. Saved on this device.</p>
            </section>
          )}
        </Fold>
      )}
    </div>
  )
}

function GradeCard({ g, snap, started }: { g: ReturnType<typeof grade>; snap: Snap | null; started: boolean }) {
  const when = snap && started ? `Graded when you first checked it, ${dayFmt.format(new Date(snap.at))}.` : started ? 'Graded on the prices at kickoff.' : 'Graded on the prices now.'
  return (
    <section aria-label='Grade' className='rounded-[18px] bg-card p-4'>
      <div className='flex items-center gap-4'>
        <span className={cn('grid size-16 shrink-0 place-items-center rounded-2xl font-display text-4xl font-black', TONE[g.letter])} aria-label={`Grade ${g.letter}`}>{g.letter}</span>
        <div className='min-w-0'>
          <p className='font-semibold leading-snug'>{g.summary}</p>
          <p className='mt-1 text-xs text-muted-foreground'>
            {when}{g.hit != null && <> Kalshi&apos;s prices give it about <b className='text-foreground'>1 in {Math.max(1, Math.round(1 / g.hit))}</b>{g.devigHit != null && Math.abs(g.devigHit - g.hit) > 0.005 ? <>; DeVig&apos;s, 1 in {Math.max(1, Math.round(1 / g.devigHit))}</> : null}.</>}
          </p>
        </div>
      </div>
      <details className='group mt-3'>
        <summary className='cursor-pointer list-none text-sm font-semibold text-devig'>Why this grade<span className='group-open:hidden'> ›</span></summary>
        <ul className='mt-2 flex flex-col gap-2 text-sm leading-relaxed'>
          {g.reasons.map((r, n) => (
            <li key={n} className='flex gap-2'>
              <span className={cn('mt-[7px] size-1.5 shrink-0 rounded-full', r.tone === 'good' ? 'bg-good' : r.tone === 'bad' ? 'bg-bad' : 'bg-muted-foreground')} aria-hidden='true' />
              <span>{r.text}</span>
            </li>
          ))}
        </ul>
        <p className='mt-2 text-xs text-muted-foreground'>The grade is about the price and the build, not a prediction. A great ticket still loses often.</p>
      </details>
    </section>
  )
}

function GameGroup({ legs, game, devig, snap, kick, weakestKey }: {
  legs: LegInfo[]; game: LegGame | null | undefined; devig: Record<string, { p: number; note: string } | null>; snap: Snap | null
  kick: (i: LegInfo) => number | null; weakestKey: string | null
}) {
  const row = game ? rowOf(game) : null
  const { data: sum } = useSummary(row && row.state !== 'pre' ? row : null)
  const when = game
    ? game.state === 'post' || game.state === 'in'
      ? [game.state === 'post' ? 'Final' : 'Live', game.awayScore != null && game.homeScore != null ? `${game.away} ${game.awayScore}, ${game.home} ${game.homeScore}` : null, game.state === 'in' ? game.detail : null].filter(Boolean).join(' · ')
      : dayFmt.format(new Date(game.kickoff))
    : null
  return (
    <section aria-label={game ? `${game.away} at ${game.home}` : 'Other legs'} className='flex flex-col gap-3'>
      {when && (
        <p className='flex items-center gap-2 px-1 text-xs font-semibold text-muted-foreground'>
          {game?.state === 'in' && <span className='size-2 rounded-full bg-bad' aria-label='Live' />}
          {when}
        </p>
      )}
      <ul className='flex flex-col gap-3'>
        {legs.map((i) => {
          const l = i.leg
          const before = snap?.legs[i.key]?.chance ?? null
          const moved = !l.result && before != null && l.chance != null ? l.chance - before : null
          return (
            <li key={i.key} className='flex flex-col gap-1.5'>
              <LegLink id={game?.row?.id} player={i.player}><KalshiLegBar i={i} game={game ?? null} right={
                l.result ? (
                  <span className={cn('flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold', l.result === 'won' ? 'bg-white text-[#0f7a3d]' : 'bg-black/45 text-white')}>
                    {l.result === 'won' ? <Check className='size-3.5' aria-hidden='true' /> : <X className='size-3.5' aria-hidden='true' />}
                    {l.result === 'won' ? 'Won' : 'Lost'}
                  </span>
                ) : (
                  <span className='text-end'>
                    <span className='block font-condensed text-[19px] leading-none font-bold tabular-nums'>{pct(l.chance)}</span>
                    {moved != null && Math.abs(moved) >= 0.02 && (
                      <span className='block text-xs font-semibold text-white/85'>{moved > 0 ? '▲' : '▼'} {Math.round(Math.abs(moved) * 100)} since saved</span>
                    )}
                  </span>
                )
              } /></LegLink>
              <div className='flex flex-col gap-1 px-1 text-sm'>
                <LegDetails i={i} game={game ?? null} sum={sum ?? null} dv={devig[i.key] ?? null} before={before} k={kick(i)} weakest={i.key === weakestKey} />
              </div>
            </li>
          )
        })}
      </ul>
      {row && row.state !== 'pre' && (
        <div className='rounded-[18px] bg-card p-4'>
          <GameWrap row={row} compact />
        </div>
      )}
    </section>
  )
}

// what's happened in the leg's game so far: a pace bar for a player prop, else the line of text
function LegNow({ i, game, sum, out, lost }: { i: LegInfo; game: LegGame | null; sum: Raw | null; out: string | null; lost: boolean }) {
  const p = usePropPace(i, game, sum)
  if (p && i.stat) return <PaceBar p={p} label={i.stat.label} side={i.leg.side} />
  return out ? <p className={cn(lost ? 'text-bad' : 'text-foreground')}>{out}</p> : null
}

// a Kalshi leg as the same team-colored bar the slip uses: the team (or player) it's about, and the matchup under it
function KalshiLegBar({ i, game, right }: { i: LegInfo; game: LegGame | null; right: React.ReactNode }) {
  const sport = game?.sport ?? i.sport ?? ''
  const side = (c: string | null) => (!game || !c ? null : codes(game.away).includes(c) ? 'away' : codes(game.home).includes(c) ? 'home' : null)
  const roster = useRosterPlayer(sport, i.kind === 'prop' ? i.player ?? '' : '', game?.away, game?.home)
  const s = i.kind === 'prop' ? (roster.team ? (roster.team === game?.away ? 'away' : 'home') : null) : side(i.code)
  const colors = game?.colors ?? null
  const logoOf = (k: 'away' | 'home') => game && (
    <TeamLogo sport={sport} code={game[k]} id={game.ids?.[k] ?? null} color={colors?.[k] ?? null} px={96} className='size-11 text-sm' />
  )
  const logo = i.kind === 'prop'
    ? <PlayerPhoto sport={sport} pid={roster.pid} team={roster.team} teamColor={s && colors ? colors[s] : null} className='size-11' badge='size-5 text-[7px]' />
    : s ? logoOf(s)
      : game ? <span className='flex -space-x-3'>{logoOf('away')}{logoOf('home')}</span> : null
  return (
    <LegBar
      title={i.label}
      sub={game ? `${sport} · ${game.away} at ${game.home}` : [i.sport, i.teams].filter(Boolean).join(' · ') || 'Kalshi'}
      colors={colors}
      sideIsHome={s == null ? null : s === 'home'}
      logo={logo}
      right={right}
      className={i.leg.result === 'lost' ? 'opacity-75' : undefined}
    />
  )
}

// tapping a leg opens its game page (box score, with a prop's player highlighted); legs on games DeVig doesn't list stay put
function LegLink({ id, player, children }: { id: string | undefined; player: string | null; children: React.ReactNode }) {
  if (!id) return <>{children}</>
  return (
    <Link to='/game/$id' params={{ id }} search={(player ? { player } : {}) as never} aria-label='Open this game' className='block rounded-[18px] active:opacity-80'>
      {children}
    </Link>
  )
}

const fine = (p: number) => (p > 0 && p < 0.001 ? '<0.1%' : p < 0.1 && p > 0 ? `${(p * 100).toFixed(1)}%` : `${Math.round(p * 100)}%`)
const n1 = (v: number) => String(Math.round(v * 10) / 10)
const timeOnly = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
// "today 9:30 PM" for tonight's games, else the day and time
export const when2 = (iso: string) => { const d = new Date(iso); return d.toDateString() === new Date().toDateString() ? `today ${timeOnly.format(d)}` : dayFmt.format(d) }

// what happened in the leg's game, then the price path and DeVig's view
function LegDetails({ i, game, sum, dv, before, k, weakest }: {
  i: LegInfo; game: LegGame | null; sum: Raw | null; dv: { p: number; note: string } | null; before: number | null; k: number | null; weakest: boolean
}) {
  const l = i.leg
  const out = legOutcome(i, game, sum)
  // saved -> kickoff -> now, skipping a step that says the same as the one before; one step alone says nothing new, unless it's the kickoff price
  const steps: [string, number][] = []
  for (const [w, v] of [['saved', before], ['kickoff', k], ['now', l.result ? null : l.chance]] as const)
    if (v != null && (!steps.length || pct(steps[steps.length - 1][1]) !== pct(v))) steps.push([w, v])
  const path = steps.length > 1 || steps[0]?.[0] === 'kickoff' ? steps.map(([w, v]) => `${w} ${pct(v)}`) : []
  const ref = k ?? before ?? l.chance
  const gap = dv && ref != null ? dv.p - ref : 0
  return (
    <>
      <LegNow i={i} game={game} sum={sum} out={out} lost={l.result === 'lost'} />
      <p className='flex flex-wrap items-center gap-x-3 gap-y-1'>
        {dv && (
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold', gap <= -0.03 ? 'bg-bad/15 text-bad' : gap >= 0.03 ? 'bg-devig/15 text-devig' : 'bg-muted text-muted-foreground')}>
            {gap <= -0.03 ? 'DeVig is less sure' : gap >= 0.03 ? 'DeVig likes it' : 'About even with Kalshi'}
          </span>
        )}
        {!dv && <span className='rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground'>Market only</span>}
        {weakest && <span className='rounded-full bg-[#F5C77A]/15 px-2 py-0.5 text-xs font-bold text-[#F5C77A]'>Weakest leg</span>}
        {dv && <span className='font-semibold text-devig'>DeVig {pct(dv.p)}</span>}
        {path.length > 0 && <span className='text-muted-foreground'>Kalshi {path.join(' → ')}</span>}
      </p>
    </>
  )
}

// the leg in one line, while it plays: "BYU up 7, needs 4+ · 3rd 5:12", "18 points, needs 25+ · Q3"
function legShort(i: LegInfo, g: LegGame | null, pace: Pace | null): [string | null, boolean | null] {
  const [t, on] = legLine(i, g, pace)
  return [t, on == null ? null : i.leg.side === 'no' && !pace ? !on : on]
}
// the line, and whether the leg is winning right now (null when the score can't say)
function legLine(i: LegInfo, g: LegGame | null, pace: Pace | null): [string | null, boolean | null] {
  const l = i.leg
  if (!g) return [l.result ? null : l.closes ? `Closes ${when2(l.closes)}` : null, null]
  if (g.state === 'pre') return [`Starts ${when2(g.kickoff)}`, null]
  const when = g.state === 'post' ? (l.result ? 'Final' : "Final · waiting on Kalshi's result") : g.detail
  const a = g.awayScore, h = g.homeScore
  const need = (strike: number) => { const t = Math.floor(strike) + 1; return l.side === 'no' ? `needs under ${t}` : `needs ${t}+` }
  if (pace && i.stat) return [`${n1(pace.v)} ${i.stat.label}, ${need(pace.target - 0.5)} · ${when}`, pace.status === 'early' ? null : ['hit', 'ahead', 'on'].includes(pace.status) === (l.side !== 'no')]
  if (a == null || h == null) return [when, null]
  const side = i.code ? (codes(g.away).includes(i.code) ? 'away' : codes(g.home).includes(i.code) ? 'home' : null) : null
  if ((i.kind === 'game' || i.kind === 'spread') && side) {
    const m = side === 'away' ? a - h : h - a
    const who = side === 'away' ? g.away : g.home
    const lead = m > 0 ? `${who} ${g.state === 'post' ? 'won' : 'up'} by ${m}` : m < 0 ? `${who} ${g.state === 'post' ? 'lost' : 'down'} by ${-m}` : 'Tied'
    return i.kind === 'spread' && i.strike != null ? [`${lead}, ${need(i.strike)} · ${when}`, m > i.strike] : [`${lead} · ${when}`, m === 0 ? null : m > 0]
  }
  if (i.kind === 'total' && i.strike != null) return [`${a + h} total, ${need(i.strike)} · ${when}`, a + h > i.strike ? true : null]
  return [`${g.away} ${a}–${h} ${g.home} · ${when}`, null]
}

export function Scoreline({ g }: { g: Pick<LegGame, 'sport' | 'away' | 'home' | 'awayScore' | 'homeScore' | 'state' | 'detail' | 'colors' | 'ids'> }) {
  const team = (k: 'away' | 'home') => (
    <span className='flex items-center gap-2'>
      <TeamLogo sport={g.sport} code={g[k]} id={g.ids?.[k] ?? null} color={g.colors?.[k] ?? null} px={48} className='size-6 text-[8px]' />
      <span className='font-semibold'>{g[k]}</span>
      <span className='ms-auto font-condensed text-lg font-bold tabular-nums'>{(k === 'away' ? g.awayScore : g.homeScore) ?? '–'}</span>
    </span>
  )
  return (
    <div className='flex items-center gap-4 rounded-xl bg-background/60 px-3 py-2'>
      <div className='flex min-w-0 flex-1 flex-col gap-1'>{team('away')}{team('home')}</div>
      <span className={cn('shrink-0 text-xs font-bold', g.state === 'in' ? 'text-devig' : 'text-muted-foreground')}>{g.state === 'post' ? 'Final' : g.detail}</span>
    </div>
  )
}

// one leg of a combo in the drawer: a line on how it's doing now; tap for the score, the pace and the prices
function ComboLegRow({ i, st, game, dv, snap, k, weakest }: {
  i: LegInfo; st: Seg; game: LegGame | null; dv: { p: number; note: string } | null; snap: Snap | null; k: number | null; weakest: boolean
}) {
  const l = i.leg
  const started = !!game && game.state !== 'pre'
  const { data: sum } = useSummary(started && i.kind === 'prop' ? rowOf(game!) : null)
  const pace = usePropPace(i, game, sum ?? null)
  const before = snap?.legs[i.key]?.chance ?? null
  const ref = k ?? before
  const moved = !l.result && ref != null && l.chance != null ? l.chance - ref : null
  const live = !l.result && game?.state === 'in'
  const [sub, on] = legShort(i, game, pace)
  const tone = live && l.chance != null ? (l.chance >= 0.6 ? 'text-good' : l.chance <= 0.4 ? 'text-bad' : 'text-foreground') : undefined
  const subTone = live ? (on == null ? undefined : on ? 'text-good' : 'text-bad') : undefined
  return (
    <TrackRow st={st} title={i.label} sub={sub} subTone={subTone}
      right={!l.result && l.chance != null && (
        <span className='text-end'>
          <span className={cn('block font-condensed text-lg leading-none font-bold tabular-nums', tone)}>{pct(l.chance)}</span>
          {moved != null && Math.abs(moved) >= 0.02 && (
            <span className={cn('block text-[11px] font-semibold', moved > 0 ? 'text-good' : 'text-bad')}>{moved > 0 ? '▲' : '▼'} {Math.round(Math.abs(moved) * 100)}</span>
          )}
        </span>
      )}>
      {started && <Scoreline g={game!} />}
      {!started && <p className='text-muted-foreground'>{game ? `${game.away} at ${game.home} · ${dayFmt.format(new Date(game.kickoff))}` : i.sport ? `${i.sport} · not on DeVig's board` : "Kalshi market"}</p>}
      <LegDetails i={i} game={game} sum={sum ?? null} dv={dv} before={before} k={k} weakest={weakest} />
      {game?.row?.id && (
        <Link to='/game/$id' params={{ id: game.row.id }} search={(i.player ? { player: i.player } : {}) as never}
          className='flex min-h-10 items-center gap-1 self-start font-semibold text-devig'>
          {i.kind === 'prop' ? 'Box score' : 'Full game'}<ChevronRight className='size-4' aria-hidden='true' />
        </Link>
      )}
    </TrackRow>
  )
}
