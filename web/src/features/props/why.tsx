// Why DeVig's NBA props model expects what it does for one player, from nba/props_why.json
// (nba/nba_props_explain_v2.py). The model is LightGBM predicting the player's expected stat, and its number splits
// exactly into steps that multiply out to it: a typical player, then minutes & role, recent form, the opponent,
// rest & home, and teammates out. Only each step's total is shown: the inputs inside a step overlap, so one input's
// share alone means little. Then the chance of the line comes from the expected number and how much games vary.
import { Minus, Plus } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { type GameRow, fmtAmerican, fmtPct, getJson } from '@/lib/devig'
import { useSlip } from '@/lib/parlay'
import { overTxt, statName, underTxt } from '@/lib/props'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { PlayerPhoto } from '@/components/team-logo'
import { useRosterPlayer } from '@/lib/headshots'
import { propLeg } from '../parlay/legs'
import type { Shown } from '.'

type Step = 'typical' | 'role' | 'form' | 'opponent' | 'rest' | 'out'
type N = number | null
export type PropWhy = {
  team: string
  pid?: string // the player's ESPN id (for the headshot)
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

export type PropSide = 'over' | 'under'
const whenFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
const hex = (c?: string | null) => (c ? (c.startsWith('#') ? c : `#${c}`) : null)

// The player's team and its color, when DeVig knows the team (the NBA explainer says which side the player is on)
// who the player is for the photo: the props explanation's id and team when there is one (NBA), else the roster map
export function usePropPlayer(l: Shown, w: PropWhy | null, game?: GameRow | null) {
  const r = useRosterPlayer(l.sport, l.player, l.away, l.home)
  const unit = /\bD\/ST$/.test(l.player)
  const pid = w?.pid ?? r.pid
  const team = w?.team ?? r.team ?? (unit ? [l.away, l.home].find((c) => l.player.startsWith(`${c} `)) ?? null : null)
  const color = team && game?.colors ? hex(team === game.home ? game.colors.home : team === game.away ? game.colors.away : null) : null
  return { pid, team, color, unit }
}

// What opens when someone taps Over or Under on a prop (Props, a game's page, or a leg in the parlay): the player,
// a switch between the two sides, why DeVig's props model says what it does, and the parlay button.
export function PropSheet({ l, w, game, side, onSide, open, onOpenChange }: {
  l: Shown; w: PropWhy | null; game?: GameRow | null; side: PropSide; onSide: (s: PropSide) => void
  open: boolean; onOpenChange: (v: boolean) => void
}) {
  const { toggle, has } = useSlip()
  const { pid, team, color, unit } = usePropPlayer(l, w, game)
  const bg = color ?? 'var(--side-home)'
  const over = side === 'over'
  const st = statName(l.stat, true)
  const sideTxt = over ? overTxt(l.stat, l.line) : underTxt(l.stat, l.line)
  const m = l.modelOver == null ? null : over ? l.modelOver : 1 - l.modelOver
  const k = over ? l.mid : 1 - l.mid
  const gap = m == null ? null : m - k
  const leg = Date.parse(l.kickoff) > Date.now() ? propLeg(l, side, { bid: l.bid, ask: l.ask, title: null }) : null
  const on = leg ? has(leg.id) : false
  const d = w && w.expected >= 10 ? 1 : 2
  const opp = w ? w.opp : null
  const sub = [sideTxt, team && opp ? `${team} vs ${opp}` : `${l.away} at ${l.home}`, whenFmt.format(new Date(l.kickoff))].join(' · ')
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side='bottom'
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>('[role=tab][aria-selected=true]')?.focus({ preventScroll: true })
        }}
        className='max-h-[90svh] gap-0 overflow-y-auto rounded-t-3xl border-t p-0 md:mx-auto md:max-w-xl [&>button:last-child]:top-3.5 [&>button:last-child]:grid [&>button:last-child]:size-9 [&>button:last-child]:place-items-center [&>button:last-child]:rounded-full [&>button:last-child]:bg-black/30 [&>button:last-child]:text-white [&>button:last-child]:opacity-100'>
        <div className='relative flex shrink-0 flex-col items-center gap-2 overflow-hidden rounded-t-3xl px-5 pt-7 pb-5 text-white' style={{ background: bg }}>
          <span aria-hidden='true' className='absolute inset-0 bg-linear-to-b from-transparent from-40% to-black/35' />
          <span aria-hidden='true' className='absolute top-2.5 h-1.5 w-10 rounded-full bg-white/45' />
          <PlayerPhoto sport={l.sport} unit={unit} pid={pid} team={team} teamColor={color} className='size-24 [&>span:first-child]:bg-white/90 [&>span:first-child]:shadow-[0_6px_24px_rgba(0,0,0,0.4)]' badge='size-9 text-[11px]' />
          <div className='relative text-center'>
            <SheetTitle className='font-display text-[28px] leading-none font-black text-white'>{l.player}</SheetTitle>
            <SheetDescription className='mt-1 text-sm text-white/85'>{sub}</SheetDescription>
          </div>
        </div>

        <div className='flex shrink-0 flex-col gap-4 px-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))]'>
          <div role='tablist' aria-label='Side' className='grid grid-cols-2 gap-1 rounded-xl bg-muted p-1'>
            {(['over', 'under'] as const).map((s) => {
              const pct = l.modelOver == null ? (s === 'over' ? l.mid : 1 - l.mid) : s === 'over' ? l.modelOver : 1 - l.modelOver
              return (
                <button key={s} type='button' role='tab' aria-selected={side === s} onClick={() => onSide(s)}
                  className={cn('h-10 truncate rounded-lg px-2 text-sm font-semibold text-muted-foreground tabular-nums transition-colors duration-150',
                    side === s && 'bg-foreground text-background')}>
                  {s === 'over' ? overTxt(l.stat, l.line) : 'Under'} · {fmtPct(pct)}
                </button>
              )
            })}
          </div>

          {w && m != null ? (
            <>
              <p className='text-lg leading-snug font-semibold'>
                DeVig expects <span className='text-devig'>{w.expected.toFixed(1)} {st}</span>
                {over ? ' and gives ' : ', so it gives '}{sideTxt} a <span className='text-devig'>{fmtPct(m)}</span> chance.
              </p>
              <div>
                <h3 className='mb-2 text-sm font-semibold text-muted-foreground'>How the model got to {w.expected.toFixed(1)} {st}</h3>
                <ol className='flex flex-col gap-1.5'>
                  {w.steps.map(([s, to], i) => {
                    const move = i === 0 ? null : to - w.steps[i - 1][1]
                    const flat = move != null && Math.abs(move) < 0.5 * 10 ** -d
                    const helps = move != null && (move > 0) === over // a higher number helps the over, hurts the under
                    return (
                      <li key={s} className='rounded-xl bg-muted px-3 py-2.5'>
                        <div className='flex items-center justify-between gap-3'>
                          <span className='font-semibold'>{TITLES[s]}</span>
                          <span className='flex shrink-0 items-center gap-2 font-condensed tabular-nums'>
                            {move != null && (
                              <span className={cn('rounded-full px-2.5 py-1 text-xs font-bold',
                                flat ? 'text-muted-foreground' : helps ? 'bg-good/15 text-good' : 'bg-bad/15 text-bad')}>
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
                {!over && <p className='mt-1.5 text-xs text-muted-foreground'>Green helps the under: a lower number is better for it.</p>}
              </div>
              <div className='rounded-xl border border-devig/30 bg-devig/10 px-3 py-2.5'>
                <span className='font-semibold text-devig'>From {w.expected.toFixed(1)} {st} to {fmtPct(m)}</span>
                <p className='mt-1 text-sm leading-relaxed'>
                  Players don&apos;t hit their expected number every night. In past seasons, players the model expected to get
                  about {w.expected.toFixed(1)} {st} got {sideTxt} about {fmtPct(m)} of the time.
                  {(w.expected > l.line) === over
                    ? ` The expected number is on the ${over ? 'over' : 'under'} side of the line, so this side is the likelier one.`
                    : ` The expected number is on the other side of the line, so this side needs a ${over ? 'better' : 'quieter'}-than-usual night.`}
                </p>
              </div>
            </>
          ) : m != null ? (
            <p className='text-[15px] leading-relaxed'>
              DeVig&apos;s {l.sport} props model gives {sideTxt} a <span className='font-semibold text-devig'>{fmtPct(m)}</span> chance
              {l.expected != null ? `, expecting ${l.expected.toFixed(1)} ${st}` : ''}. It doesn&apos;t publish the steps behind
              {l.sport === 'NBA' ? ' this number yet (the explainer runs after the model; check back soon).' : ` ${l.sport} numbers yet.`}
            </p>
          ) : (
            <p className='text-[15px] leading-relaxed'>DeVig has no number for this prop, so there&apos;s no &quot;why&quot; here. This is what the price says.</p>
          )}

          <div className='rounded-xl bg-muted px-3 py-2.5'>
            <span className='font-semibold'>{m == null ? "Kalshi's price" : 'DeVig vs Kalshi'}</span>
            <p className='mt-1 text-sm leading-relaxed text-muted-foreground'>
              Kalshi&apos;s price says {fmtPct(k)}{m != null && gap != null
                ? `. DeVig says ${fmtPct(m)}${Math.abs(gap) < 0.02 ? ', about the same.' : `, ${Math.abs(gap * 100).toFixed(0)} points ${gap > 0 ? 'higher' : 'lower'}.`} On past games Kalshi's price was more right than this model, so treat a gap as a second opinion, not an edge.`
                : '.'}
              {l.injury ? ` Injury report: ${l.injury}.` : ''}
              {w && l.games < 40 ? ` Only ${l.games} games to learn from, so the numbers are less settled.` : ''}
            </p>
          </div>

          {w && (
            <table className='w-full border-collapse font-condensed text-sm tabular-nums'>
              <caption className='pb-1 text-start font-sans text-xs font-semibold text-muted-foreground'>What the model read</caption>
              <tbody>
                {([
                  [`${statName(l.stat)}, recent / longer`, `${n1(w.read.avg_recent)} / ${n1(w.read.avg_longer)}`],
                  ['Minutes, recent / longer', `${n1(w.read.min_recent)} / ${n1(w.read.min_longer)}`],
                  ['Minutes last game', n1(w.read.last_min, 0)],
                  ['Starts', `${Math.round((w.read.start_rate ?? 0) * 100)}%`],
                  ['Plays used a game (shots, FTs, turnovers)', n1(w.read.usage_recent)],
                  [`${w.opp} allows a game`, `${n1(w.read.opp_allows)} ${st}`],
                  [`Pace, ${w.opp} / ${w.team}`, `${n1(w.read.opp_pace)} / ${n1(w.read.team_pace)}`],
                  ['Teammates out', w.teammates_out.length ? w.teammates_out.map(([n, mn]) => `${n} (${mn.toFixed(0)} min)`).join(', ') : 'None'],
                  ['Career games the model has seen', String(l.games)],
                ] as const).map(([kk, v]) => (
                  <tr key={kk} className='border-t align-top'>
                    <td className='py-1.5 pe-3'>{kk}</td>
                    <td className='py-1.5 text-end'>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {w && (
            <p className='text-xs leading-relaxed text-muted-foreground'>
              DeVig&apos;s NBA props model learns from past box scores. The steps multiply out exactly to its expected number.
              The inputs inside each step overlap, so only each step&apos;s total is shown.
            </p>
          )}

          {leg && (
            <button type='button' aria-pressed={on} onClick={() => toggle(leg)}
              className={cn('mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-bold transition-opacity duration-150 hover:opacity-90',
                on ? 'border bg-background text-foreground' : 'text-white')}
              style={on ? undefined : { background: bg }}>
              {on ? <Minus className='size-4.5' aria-hidden='true' /> : <Plus className='size-4.5' aria-hidden='true' />}
              {on ? `Remove ${sideTxt} from parlay` : `Add ${sideTxt} to parlay ${fmtAmerican(leg.odds)}`}
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
