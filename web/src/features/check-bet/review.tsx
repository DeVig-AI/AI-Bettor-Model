import { useEffect, useMemo } from 'react'
import { AlertTriangle, Check, Lightbulb, Minus, X } from 'lucide-react'
import type { KLeg, KRead, Saved } from '@/lib/kalshi-link'
import {
  type GradeLeg, type LegGame, type LegInfo, type Outcome, type Snap, type TakeLeg,
  SUMMARY, grade, legOutcome, lessons, parseLeg, priceAt, rowOf, snapOf, takeaways, useDevigViews, useHistories, useLegGames, weakSpots, weakestOf,
} from '@/lib/review'
import { useSummary } from '@/lib/wrap'
import { cn } from '@/lib/utils'
import { GameWrap } from '../game/wrap'

// The parlay review under a Kalshi combo: a grade with its reasons, the weak spots, each game's legs with what they
// needed and what happened, the price path (when you saved it, at kickoff, now), and what to learn from it. The first
// read is kept as a snapshot on this device, and the outcome once it's decided, so later tickets can be compared.

type Combo = Extract<KRead, { kind: 'combo' }>
const pct = (p: number | null | undefined) => (p == null ? '—' : `${Math.round(p * 100)}%`)
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const TONE: Record<string, string> = { A: 'bg-good/15 text-good', B: 'bg-good/10 text-good', C: 'bg-muted text-foreground', D: 'bg-[#F5C77A]/15 text-[#F5C77A]', F: 'bg-bad/15 text-bad' }

export function ParlayReview({ d, entry, all, onStore }: { d: Combo; entry: Saved | null; all: Saved[]; onStore: (s: Partial<Saved>) => void }) {
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

  const learn = decided ? takeaways(take, snap?.hit ?? g.hit, snap?.letter ?? g.letter) : []
  const outs = all.map((s) => s.outcome).filter((o): o is Outcome => !!o)
  const past = lessons(outs)

  return (
    <div className='flex flex-col gap-3'>
      <GradeCard g={snap && anyStarted ? { ...g, letter: snap.letter, score: snap.score, summary: SUMMARY[snap.letter] } : g} snap={snap} started={anyStarted} />
      {weak.length > 0 && !decided && (
        <section aria-label='Weak spots' className='rounded-[18px] bg-card p-4'>
          <h3 className='flex items-center gap-2 font-display text-lg font-extrabold'><AlertTriangle className='size-4 text-[#F5C77A]' aria-hidden='true' />Weak spots</h3>
          <ul className='mt-2 flex flex-col gap-2 text-sm leading-relaxed'>{weak.map((w, n) => <li key={n}>{w.text}</li>)}</ul>
        </section>
      )}
      {groups.map(([k, ls]) => (
        <GameGroup key={k} legs={ls} game={k === 'other' ? null : games[ls[0].key]} devig={devig} snap={snap} kick={(i) => kickOf(i)} weakestKey={weakestKey} />
      ))}
      {learn.length > 0 && (
        <section aria-label='What to learn from this one' className='rounded-[18px] bg-card p-4'>
          <h3 className='flex items-center gap-2 font-display text-lg font-extrabold'><Lightbulb className='size-4 text-devig' aria-hidden='true' />What to learn from this one</h3>
          <ul className='mt-2 flex list-disc flex-col gap-2 ps-5 text-sm leading-relaxed'>{learn.map((t, n) => <li key={n}>{t}</li>)}</ul>
        </section>
      )}
      {outs.length >= 2 && (
        <section aria-label='What your saved parlays say' className='rounded-[18px] bg-card p-4'>
          <h3 className='font-display text-lg font-extrabold'>What your {outs.length} finished parlays say</h3>
          <ul className='mt-2 flex list-disc flex-col gap-2 ps-5 text-sm leading-relaxed'>{past.map((t, n) => <li key={n}>{t}</li>)}</ul>
          <p className='mt-2 text-xs text-muted-foreground'>From the combos you&apos;ve checked here, saved on this device.</p>
        </section>
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

function Mark({ r }: { r: KLeg['result'] }) {
  if (r === 'won') return <span className='grid size-6 shrink-0 place-items-center rounded-full bg-good/15 text-good'><Check className='size-3.5' aria-label='Won' /></span>
  if (r === 'lost') return <span className='grid size-6 shrink-0 place-items-center rounded-full bg-bad/15 text-bad'><X className='size-3.5' aria-label='Lost' /></span>
  return <span className='grid size-6 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground'><Minus className='size-3.5' aria-label='Not decided' /></span>
}

function GameGroup({ legs, game, devig, snap, kick, weakestKey }: {
  legs: LegInfo[]; game: LegGame | null | undefined; devig: Record<string, { p: number; note: string } | null>; snap: Snap | null
  kick: (i: LegInfo) => number | null; weakestKey: string | null
}) {
  const row = game ? rowOf(game) : null
  const { data: sum } = useSummary(row && row.state !== 'pre' ? row : null)
  const head = game
    ? `${game.away} at ${game.home} · ${game.state === 'pre' ? dayFmt.format(new Date(game.kickoff)) : game.state === 'post' ? `Final ${game.awayScore}–${game.homeScore}` : `${game.awayScore}–${game.homeScore}, ${game.detail}`}`
    : 'Other legs'
  return (
    <section aria-label={head} className='overflow-hidden rounded-[18px] bg-card'>
      <h3 className='flex items-center gap-2 border-b px-4 py-3 text-sm font-bold'>
        {game?.state === 'in' && <span className='size-2 rounded-full bg-bad' aria-label='Live' />}
        {head}
      </h3>
      <ul>
        {legs.map((i) => {
          const l = i.leg
          const dv = devig[i.key]
          const before = snap?.legs[i.key]?.chance ?? null
          const k = kick(i)
          const out = legOutcome(i, game ?? null, sum ?? null)
          // saved -> kickoff -> now, skipping a step that says the same as the one before; one step alone says nothing new, unless it's the kickoff price
          const steps: [string, number][] = []
          for (const [w, v] of [['saved', before], ['kickoff', k], ['now', l.result ? null : l.chance]] as const)
            if (v != null && (!steps.length || pct(steps[steps.length - 1][1]) !== pct(v))) steps.push([w, v])
          const path = steps.length > 1 || steps[0]?.[0] === 'kickoff' ? steps.map(([w, v]) => `${w} ${pct(v)}`) : []
          const moved = !l.result && before != null && l.chance != null ? l.chance - before : null
          return (
            <li key={i.key} className='flex gap-3 border-b px-4 py-3 last:border-b-0'>
              <Mark r={l.result} />
              <div className='min-w-0 flex-1'>
                <div className='flex items-baseline justify-between gap-3'>
                  <span className={cn('font-semibold', l.result === 'lost' && 'text-bad')}>{i.label}</span>
                  <span className='shrink-0 text-end font-condensed text-[17px] font-bold tabular-nums'>
                    {l.result ? (l.result === 'won' ? 'Won' : 'Lost') : pct(l.chance)}
                    {moved != null && Math.abs(moved) >= 0.02 && (
                      <span className={cn('ms-1 text-xs', moved > 0 ? 'text-good' : 'text-bad')}>{moved > 0 ? '▲' : '▼'}{Math.round(Math.abs(moved) * 100)}</span>
                    )}
                  </span>
                </div>
                {out && <p className='mt-0.5 text-sm text-muted-foreground'>{out}</p>}
                <p className='mt-0.5 text-xs text-muted-foreground'>
                  {dv && <>DeVig {pct(dv.p)}{dv.p - (k ?? before ?? l.chance ?? dv.p) <= -0.03 ? ' (less sure than Kalshi)' : dv.p - (k ?? before ?? l.chance ?? dv.p) >= 0.03 ? ' (likes it more than Kalshi)' : ''} · </>}
                  {path.length > 0 && <>Kalshi {path.join(' → ')}</>}
                  {i.key === weakestKey && <> · <span className='text-[#F5C77A]'>weakest leg</span></>}
                </p>
              </div>
            </li>
          )
        })}
      </ul>
      {row && row.state !== 'pre' && (
        <div className='border-t p-4'>
          <GameWrap row={row} compact />
        </div>
      )}
    </section>
  )
}
