// How NFL Model 2.0 got to its number for one game, picks and passes alike, from nfl/model2/why.json
// (nfl/model2/explain_v1.py). The model is a logistic regression, so its number splits exactly into three steps:
// home field, then both teams' form (last 6 and 12 games: points, results, EPA per play, rest), then who is out.
// Only the form total is shown, never one stat's share: the stats overlap so much that the model's weight on any one
// alone means nothing. The stats themselves are shown so people can see what it read.
import { type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { type GameRow, fmtPct, getJson } from '@/lib/devig'
import { type Level } from '@/lib/experience'
import { cn } from '@/lib/utils'

type TeamStats = Partial<Record<
  | 's6_win' | 's6_margin' | 's6_pf' | 's6_pa' | 's6_net_epa' | 's6_off_epa' | 's6_def_epa_allowed'
  | 's12_win' | 's12_margin' | 's12_net_epa' | 's12_off_epa' | 's12_def_epa_allowed' | 'rest',
  number | null
>>
export type NflWhyGame = {
  home: string
  away: string
  home_wp: number
  steps: { home_field: number; form: number; who_is_out: number }
  teams: { home: TeamStats; away: TeamStats }
  injuries: { d_qb: number | null; d_out: number | null; d_q: number | null }
}

export function useNflWhy(enabled: boolean) {
  return useQuery({
    queryKey: ['nfl-why'],
    queryFn: () => getJson<{ generated_at: string; games: Record<string, NflWhyGame> }>('nfl/model2/why.json'),
    enabled,
    staleTime: 10 * 60e3,
  })
}

const pts = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1)}`
const num = (x: number | null | undefined, d = 1, sign = false) =>
  x == null ? '—' : `${sign && x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(d)}`

// The game's breakdown when it matches the number on the card (the explainer runs right after the model; between
// runs, or for a game whose number came from an older run, it says nothing rather than explain a different number).
export function useGameWhy(row: GameRow, side: string, prob: number) {
  const q = useNflWhy(row.sport === 'NFL')
  const g = row.sport === 'NFL' ? q.data?.games[row.trackKey] : undefined
  if (!g) return null
  const forSide = (h: number) => (side === g.home ? h : 1 - h)
  if (Math.abs(forSide(g.home_wp) - prob) > 0.006) return null
  return { g, forSide }
}

export function NflWhy({ row, side, prob, level, fallback = null }: {
  row: GameRow; side: string; prob: number; level: Level; fallback?: ReactNode
}) {
  const w = useGameWhy(row, side, prob)
  if (!w) return <>{fallback}</>
  const { g, forSide } = w
  const other = side === g.home ? g.away : g.home
  const hf = forSide(g.steps.home_field)
  const form = forSide(g.steps.form) - hf
  const out = forSide(g.steps.who_is_out) - forSide(g.steps.form)
  const H = g.teams.home, A = g.teams.away
  const color = (team: string) => (team === row.home ? row.colors?.home : row.colors?.away) || 'var(--side-home)'

  // plain words for the form step: what the last 6 and last 12 games say, then the model's net read
  const better = (h: number | null | undefined, a: number | null | undefined) =>
    h == null || a == null || Math.abs(h - a) < 1e-9 ? null : h > a ? g.home : g.away
  const m6 = better(H.s6_margin, A.s6_margin)
  const marginOf = (t: string) => (t === g.home ? H.s6_margin : A.s6_margin) ?? 0
  const winsOf = (t: string) => Math.round(((t === g.home ? H.s12_win : A.s12_win) ?? 0) * 12)
  // compare records as shown (whole wins), so it never says one 3–9 beats another
  const w12 = H.s12_win == null || A.s12_win == null ? null : better(winsOf(g.home), winsOf(g.away))
  const formFavors = form >= 0 ? side : other
  const formWords = [
    m6 &&
      `Over their last 6 games, ${m6} has the better point margin (${num(marginOf(m6), 1, true)} a game vs ${num(marginOf(m6 === g.home ? g.away : g.home), 1, true)}).`,
    w12 &&
      (w12 === m6
        ? `${w12} also has the better record over 12 (${winsOf(w12)}–${12 - winsOf(w12)} vs ${winsOf(w12 === g.home ? g.away : g.home)}–${12 - winsOf(w12 === g.home ? g.away : g.home)}).`
        : `But over 12 games, ${w12} has the better record (${winsOf(w12)}–${12 - winsOf(w12)} vs ${winsOf(w12 === g.home ? g.away : g.home)}–${12 - winsOf(w12 === g.home ? g.away : g.home)}).`),
    Math.abs(form) < 0.01
      ? 'Weighed together with how well each moves the ball per play, it comes out about even.'
      : `Weighed together with how well each moves the ball per play, form adds ${Math.abs(form * 100).toFixed(1)} points to ${formFavors}'s chance.`,
  ].filter(Boolean)

  const inj = g.injuries
  const injWords: string[] = []
  const who = (d: number) => (d > 0 ? g.home : g.away) // inputs are home minus away
  if (inj.d_qb) injWords.push(`${who(inj.d_qb)} is without its starting quarterback from last game.`)
  if (inj.d_out) injWords.push(`${who(inj.d_out)} has ${Math.abs(inj.d_out)} more regular${Math.abs(inj.d_out) === 1 ? '' : 's'} ruled out.`)
  if (inj.d_q) injWords.push(`${who(inj.d_q)} has ${Math.abs(inj.d_q)} more regular${Math.abs(inj.d_q) === 1 ? '' : 's'} listed questionable.`)
  if (!injWords.length) injWords.push('Neither team is missing more regulars than the other.')

  const steps = [
    {
      title: 'Home field',
      move: hf - 0.5,
      to: hf,
      text: `${row.home} is at home. Two average teams, nobody hurt: the home team wins about ${fmtPct(Math.max(hf, 1 - hf))} of the time.`,
    },
    { title: 'Recent form', move: form, to: hf + form, text: formWords.join(' ') },
    { title: 'Who is out', move: out, to: forSide(g.steps.who_is_out), text: injWords.join(' ') },
  ]

  return (
    <div>
      <h3 className='mb-2 text-sm font-semibold text-muted-foreground'>How the model got to {side} {fmtPct(prob)}</h3>
      <ol className='flex flex-col gap-1.5'>
        {steps.map((s) => {
          const fav = Math.abs(s.move) < 0.0005 ? null : s.move > 0 ? side : other
          return (
            <li key={s.title} className='rounded-xl bg-muted px-3 py-2.5'>
              <div className='flex items-center justify-between gap-3'>
                <span className='font-semibold'>{s.title}</span>
                <span className='flex shrink-0 items-center gap-2 font-condensed tabular-nums'>
                  <span
                    className={cn('rounded-full px-2.5 py-1 text-xs font-bold', fav ? 'text-white' : 'text-muted-foreground')}
                    style={fav ? { background: color(fav) } : undefined}
                  >
                    {fav ? `${pts(Math.abs(s.move))} ${fav}` : 'Even'}
                  </span>
                  <span className='min-w-16 text-end text-sm font-semibold whitespace-nowrap'>
                    {side} {fmtPct(s.to)}
                  </span>
                </span>
              </div>
              <p className='mt-1 text-sm leading-relaxed text-muted-foreground'>{s.text}</p>
            </li>
          )
        })}
      </ol>

      {level !== 'new' && (
        <table className='mt-3 w-full border-collapse font-condensed text-sm tabular-nums'>
          <caption className='pb-1 text-start font-sans text-xs font-semibold text-muted-foreground'>
            What the model read about each team
          </caption>
          <thead>
            <tr className='text-xs text-muted-foreground'>
              <th scope='col' className='py-1 text-start font-semibold'>Before this game</th>
              <th scope='col' className='text-end font-bold text-foreground'>{g.away}</th>
              <th scope='col' className='text-end font-bold text-foreground'>{g.home}</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ['Point margin, last 6', 's6_margin', (v: number) => num(v, 1, true), true],
                ['Points for / against, last 6', null, null, null],
                ['EPA per play (net), last 6', 's6_net_epa', (v: number) => num(v, 3, true), true],
                ['Record, last 12', 's12_win', (v: number) => `${Math.round(v * 12)}–${12 - Math.round(v * 12)}`, true],
                ['Point margin, last 12', 's12_margin', (v: number) => num(v, 1, true), true],
                ['EPA per play (net), last 12', 's12_net_epa', (v: number) => num(v, 3, true), true],
                ['Days of rest', 'rest', (v: number) => String(Math.round(v)), true],
              ] as const
            ).map(([label, k, f, high]) => {
              if (!k) {
                return (
                  <tr key={label} className='border-t'>
                    <td className='py-1.5'>{label}</td>
                    <td className='text-end'>{num(A.s6_pf)} / {num(A.s6_pa)}</td>
                    <td className='text-end'>{num(H.s6_pf)} / {num(H.s6_pa)}</td>
                  </tr>
                )
              }
              // records compare as shown (whole wins), like the words above
              const a = k === 's12_win' && A[k] != null ? Math.round(A[k]! * 12) / 12 : A[k]
              const h = k === 's12_win' && H[k] != null ? Math.round(H[k]! * 12) / 12 : H[k]
              const best = high && a != null && h != null && Math.abs(a - h) > 1e-9 ? (h > a ? 'h' : 'a') : null
              return (
                <tr key={label} className='border-t'>
                  <td className='py-1.5'>{label}</td>
                  <td className={cn('text-end', best === 'a' && 'font-bold text-foreground', best === 'h' && 'text-muted-foreground')}>
                    {a == null ? '—' : f!(a)}
                  </td>
                  <td className={cn('text-end', best === 'h' && 'font-bold text-foreground', best === 'a' && 'text-muted-foreground')}>
                    {h == null ? '—' : f!(h)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {level === 'numbers' && (
        <p className='mt-2 text-xs leading-relaxed text-muted-foreground'>
          NFL Model 2.0 is a logistic regression on 66 inputs: these stats over the last 6 and 12 games (with offense and
          defense split out), rest, and 3 injury counts. The steps add up exactly to its number. The form inputs overlap,
          so only their total is shown; the model weighs them together, not one at a time.
        </p>
      )}
    </div>
  )
}
