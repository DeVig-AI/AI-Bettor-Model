// Why DeVig's NBA props model expects what it does for one player, from nba/props_why.json
// (nba/nba_props_explain_v2.py). The model is LightGBM predicting the player's expected stat, and its number splits
// exactly into steps that multiply out to it: a typical player, then minutes & role, recent form, the opponent,
// rest & home, and teammates out. Only each step's total is shown: the inputs inside a step overlap, so one input's
// share alone means little. Then the chance of the line comes from the expected number and how much games vary.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fmtPct, getJson } from '@/lib/devig'
import { overTxt, statName } from '@/lib/props'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { Shown } from '.'

type Step = 'typical' | 'role' | 'form' | 'opponent' | 'rest' | 'out'
type N = number | null
export type PropWhy = {
  team: string
  opp: string
  expected: number
  steps: [Step, number][]
  read: {
    avg_recent: N; avg_longer: N; min_recent: N; min_longer: N; last_min: N; start_rate: N; per_min: N
    usage_recent: N; days_since: N; missed_10: N; opp_allows: N; opp_pace: N; team_pace: N; home: boolean
    rest_days: N; b2b: boolean; n_out: N; vac_min: N; vac_stat: N
  }
  teammates_out: [string, number][]
}

export function usePropsWhy(enabled: boolean) {
  return useQuery({
    queryKey: ['props-why'],
    queryFn: () => getJson<{ generated_at: string; players: Record<string, PropWhy> }>('nba/props_why.json'),
    enabled,
    staleTime: 10 * 60e3,
  })
}

// The explanation when it matches the number on the row (the explainer runs right after the model; a row from an
// older run gets no explanation rather than one for a different number)
export function usePropWhy(l: Shown) {
  const nba = l.sport === 'NBA' && l.expected != null
  const q = usePropsWhy(nba)
  const w = nba ? q.data?.players[`${l.gameKey}|${l.player}|${l.stat}`] : undefined
  return w && Math.abs(w.expected - l.expected!) < 0.006 ? w : null
}

const n1 = (x: N, d = 1) => (x == null ? '—' : x.toFixed(d))

function stepText(s: Step, w: PropWhy, l: Shown) {
  const r = w.read, st = statName(l.stat, true)
  switch (s) {
    case 'typical':
      return `Where every player starts: an average rotation player's ${statName(l.stat).toLowerCase()} in the seasons the model learned from.`
    case 'role': {
      const t = [`Plays ${n1(r.min_recent)} minutes a game lately (${n1(r.min_longer)} over a longer stretch) and starts ${Math.round((r.start_rate ?? 0) * 100)}% of the time.`]
      if (r.last_min != null) t.push(`${n1(r.last_min, 0)} minutes last game.`)
      if (r.missed_10) t.push(`Missed ${n1(r.missed_10, 0)} of the team's last 10 games.`)
      if ((r.days_since ?? 0) > 7) t.push(`Last played ${n1(r.days_since, 0)} days ago.`)
      return t.join(' ')
    }
    case 'form':
      return `Averaging ${n1(r.avg_recent)} ${st} lately and ${n1(r.avg_longer)} over a longer stretch` +
        (r.per_min != null ? `, about ${n1(r.per_min * 36)} per 36 minutes.` : '.')
    case 'opponent':
      return `${w.opp} gives up ${n1(r.opp_allows)} ${st} a game lately. Pace: ${w.opp} plays ${n1(r.opp_pace)} possessions a game, ${w.team} ${n1(r.team_pace)}.`
    case 'rest':
      return `${r.home ? 'At home' : 'On the road'}, ${r.b2b ? 'second night of a back-to-back' : `${n1(r.rest_days, 0)}${(r.rest_days ?? 0) >= 7 ? '+' : ''} days of rest`}.`
    case 'out': {
      const names = w.teammates_out.map(([n]) => n)
      if (!names.length) return `No ${w.team} player who's played lately is ruled out.`
      return `${names.length === 1 ? '1 teammate' : `${names.length} teammates`} who played lately ${names.length === 1 ? 'is' : 'are'} out (${names.join(', ')}), leaving about ${n1(r.vac_min, 0)} minutes a game` +
        (r.vac_stat != null ? ` and ${n1(r.vac_stat)} ${st}.` : '.')
    }
  }
}

const TITLES: Record<Step, string> = {
  typical: 'A typical player', role: 'Minutes & role', form: 'Recent form', opponent: 'Opponent & pace',
  rest: 'Rest & home', out: 'Teammates out',
}

export function PropWhyButton({ l }: { l: Shown }) {
  const w = usePropWhy(l)
  const [open, setOpen] = useState(false)
  if (!w) return null
  return (
    <>
      <button type='button' onClick={() => setOpen(true)}
        className='h-8 rounded-full border border-devig/60 px-3 text-xs font-semibold text-devig hover:bg-devig/10'
        aria-label={`Why DeVig says ${fmtPct(l.modelOver!)} for ${l.player} ${overTxt(l.stat, l.line)}`}>
        Why?
      </button>
      <PropWhySheet l={l} w={w} open={open} onOpenChange={setOpen} />
    </>
  )
}

function PropWhySheet({ l, w, open, onOpenChange }: {
  l: Shown; w: PropWhy; open: boolean; onOpenChange: (v: boolean) => void
}) {
  const st = statName(l.stat, true)
  const d = w.expected >= 10 ? 1 : 2
  const m = l.modelOver!
  const gap = m - l.mid
  const r = w.read
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side='bottom'
        className='max-h-[88svh] overflow-y-auto rounded-t-3xl border-t px-5 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:mx-auto md:max-w-xl'>
        <div aria-hidden='true' className='mx-auto h-1.5 w-10 rounded-full bg-border' />
        <SheetHeader className='p-0 text-start'>
          <SheetTitle className='font-display text-3xl font-black'>{l.player}</SheetTitle>
          <SheetDescription className='text-sm'>{overTxt(l.stat, l.line)} · {w.team} vs {w.opp}</SheetDescription>
        </SheetHeader>

        <p className='text-lg leading-snug font-semibold'>
          DeVig expects <span className='text-devig'>{w.expected.toFixed(1)} {st}</span> and gives{' '}
          {overTxt(l.stat, l.line)} a <span className='text-devig'>{fmtPct(m)}</span> chance.
        </p>

        <div>
          <h3 className='mb-2 text-sm font-semibold text-muted-foreground'>How the model got to {w.expected.toFixed(1)} {st}</h3>
          <ol className='flex flex-col gap-1.5'>
            {w.steps.map(([s, to], i) => {
              const move = i === 0 ? null : to - w.steps[i - 1][1]
              const flat = move != null && Math.abs(move) < 0.5 * 10 ** -d
              return (
                <li key={s} className='rounded-xl bg-muted px-3 py-2.5'>
                  <div className='flex items-center justify-between gap-3'>
                    <span className='font-semibold'>{TITLES[s]}</span>
                    <span className='flex shrink-0 items-center gap-2 font-condensed tabular-nums'>
                      {move != null && (
                        <span className={cn('rounded-full px-2.5 py-1 text-xs font-bold',
                          flat ? 'text-muted-foreground' : move > 0 ? 'bg-good/15 text-good' : 'bg-bad/15 text-bad')}>
                          {flat ? 'No change' : `${move > 0 ? '+' : '−'}${Math.abs(move).toFixed(d)}`}
                        </span>
                      )}
                      <span className='min-w-16 text-end text-sm font-semibold whitespace-nowrap'>{to.toFixed(d)} {st}</span>
                    </span>
                  </div>
                  <p className='mt-1 text-sm leading-relaxed text-muted-foreground'>{stepText(s, w, l)}</p>
                </li>
              )
            })}
          </ol>
        </div>

        <div className='rounded-xl bg-muted px-3 py-2.5'>
          <span className='font-semibold'>From {w.expected.toFixed(1)} {st} to {fmtPct(m)}</span>
          <p className='mt-1 text-sm leading-relaxed text-muted-foreground'>
            Players don&apos;t hit their expected number every night. In past seasons, players the model expected to get
            about {w.expected.toFixed(1)} {st} got {overTxt(l.stat, l.line)} about {fmtPct(m)} of the time.
            {w.expected > l.line ? ' The line is below the expected number, so the over is more likely than not.' :
              ' The line is above the expected number, so the over needs a better-than-usual night.'}
          </p>
        </div>

        <div className='rounded-xl bg-muted px-3 py-2.5'>
          <span className='font-semibold'>DeVig vs Kalshi</span>
          <p className='mt-1 text-sm leading-relaxed text-muted-foreground'>
            Kalshi&apos;s price says {fmtPct(l.mid)}. DeVig says {fmtPct(m)}
            {Math.abs(gap) < 0.02 ? ', about the same.' : `, ${Math.abs(gap * 100).toFixed(0)} points ${gap > 0 ? 'higher' : 'lower'}.`}{' '}
            On past games Kalshi&apos;s price was more right than this model, so treat a gap as a second opinion, not an edge.
            {l.injury ? ` Injury report: ${l.injury}.` : ''}
            {l.games < 40 ? ` Only ${l.games} games to learn from, so the numbers are less settled.` : ''}
          </p>
        </div>

        <table className='w-full border-collapse font-condensed text-sm tabular-nums'>
          <caption className='pb-1 text-start font-sans text-xs font-semibold text-muted-foreground'>What the model read</caption>
          <tbody>
            {([
              [`${statName(l.stat)}, recent / longer`, `${n1(r.avg_recent)} / ${n1(r.avg_longer)}`],
              ['Minutes, recent / longer', `${n1(r.min_recent)} / ${n1(r.min_longer)}`],
              ['Minutes last game', n1(r.last_min, 0)],
              ['Starts', `${Math.round((r.start_rate ?? 0) * 100)}%`],
              ['Plays used a game (shots, FTs, turnovers)', n1(r.usage_recent)],
              [`${w.opp} allows a game`, `${n1(r.opp_allows)} ${st}`],
              [`Pace, ${w.opp} / ${w.team}`, `${n1(r.opp_pace)} / ${n1(r.team_pace)}`],
              ['Teammates out', w.teammates_out.length ? w.teammates_out.map(([n, mn]) => `${n} (${mn.toFixed(0)} min)`).join(', ') : 'None'],
              ['Career games the model has seen', String(l.games)],
            ] as const).map(([k, v]) => (
              <tr key={k} className='border-t align-top'>
                <td className='py-1.5 pe-3'>{k}</td>
                <td className='py-1.5 text-end'>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className='text-xs leading-relaxed text-muted-foreground'>
          DeVig&apos;s NBA props model learns from past box scores. The steps multiply out exactly to its expected number.
          The inputs inside each step overlap, so only each step&apos;s total is shown.
        </p>
      </SheetContent>
    </Sheet>
  )
}
