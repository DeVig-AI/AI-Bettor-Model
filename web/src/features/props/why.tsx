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
import { useExperience } from '@/lib/experience'
import { LevelPicker } from '../games/explain-sheet'
import { cents, gapWords, inTen, money, needs, payout, plainStat, sideShort } from './words'
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
  const { level, setLevel } = useExperience()
  const lv = level ?? 'sometimes'
  const nums = lv === 'numbers'
  const pay = payout(l, over)
  const last = l.player.split(' ').slice(-1)[0]
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
                  {lv === 'new' ? sideShort(l.stat, l.line, s === 'over') : s === 'over' ? overTxt(l.stat, l.line) : 'Under'} · {fmtPct(pct)}
                </button>
              )
            })}
          </div>

          <LevelPicker level={lv} onLevel={setLevel} />

          {lv === 'new' ? (
            <NewBody l={l} w={w} over={over} m={m} k={k} pay={pay} last={last} />
          ) : (
            <>
              {m != null && (
                <div className='grid grid-cols-3 gap-1.5 font-condensed tabular-nums'>
                  <Box label='DeVig' value={nums ? pct1(m) : fmtPct(m)} amber />
                  <Box label='Kalshi' value={nums ? pct1(k) : fmtPct(k)} />
                  <Box label={nums ? 'Break-even' : 'You need'} value={pay ? (nums ? pct1(pay.breakEven) : fmtPct(pay.breakEven)) : '—'}
                    sub={leg ? fmtAmerican(leg.odds) : undefined} />
                </div>
              )}
              {w && m != null ? (
                <>
                  <p className='text-lg leading-snug font-semibold'>
                    DeVig expects <span className='text-devig'>{w.expected.toFixed(1)} {st}</span>
                    {over ? ' and gives ' : ', so it gives '}{sideTxt} a <span className='text-devig'>{fmtPct(m)}</span> chance.
                  </p>
                  <Steps w={w} l={l} over={over} d={d} />
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
                <p className='text-[15px] leading-relaxed'>DeVig has no number for this prop, so there&apos;s no &quot;why&quot; here. Kalshi&apos;s price says {fmtPct(k)}.</p>
              )}

              <div className='rounded-xl bg-muted px-3 py-2.5'>
                <span className='font-semibold'>{m == null ? "Kalshi's price" : 'DeVig vs Kalshi'}</span>
                <p className='mt-1 text-sm leading-relaxed text-muted-foreground'>
                  {pay && leg ? `At ${fmtAmerican(leg.odds)} (${cents(pay.cost)} a contract with the fee) this side has to hit ${fmtPct(pay.breakEven)} of the time to break even. ` : ''}
                  {m != null && gap != null
                    ? `DeVig says ${fmtPct(m)}, Kalshi ${fmtPct(k)}: ${Math.abs(gap) < 0.02 ? 'about the same' : `${Math.abs(gap * 100).toFixed(0)} points ${gap > 0 ? 'higher' : 'lower'}`}. On past games Kalshi's price was more right than this model, so treat a gap as a second opinion, not an edge.`
                    : ''}
                  {l.injury ? ` Injury report: ${l.injury}.` : ''}
                  {l.games < 40 ? ` Only ${l.games} games to learn from, so the numbers are less settled.` : ''}
                </p>
              </div>

              {nums && (
                <table className='w-full border-collapse font-condensed text-sm tabular-nums'>
                  <caption className='pb-1 text-start font-sans text-xs font-semibold text-muted-foreground'>{w ? 'What the model read' : 'Market'}</caption>
                  <tbody>
                    {([
                      ...(w ? [
                        [`${statName(l.stat)}, recent / longer`, `${n1(w.read.avg_recent)} / ${n1(w.read.avg_longer)}`],
                        ['Minutes, recent / longer', `${n1(w.read.min_recent)} / ${n1(w.read.min_longer)}`],
                        ['Minutes last game', n1(w.read.last_min, 0)],
                        ['Starts', `${Math.round((w.read.start_rate ?? 0) * 100)}%`],
                        ['Usage a game (shots, FTs, turnovers)', n1(w.read.usage_recent)],
                        [`${w.opp} allows a game`, `${n1(w.read.opp_allows)} ${st}`],
                        [`Pace, ${w.opp} / ${w.team}`, `${n1(w.read.opp_pace)} / ${n1(w.read.team_pace)}`],
                        ['Teammates out', w.teammates_out.length ? w.teammates_out.map(([n, mn]) => `${n} (${mn.toFixed(0)} min)`).join(', ') : 'None'],
                      ] : []),
                      ['Career games the model has seen', String(l.games)],
                      ['Kalshi bid / ask (Over)', `${cents(l.bid!)} / ${cents(l.ask!)}`],
                      ['Spread', cents(l.spread)],
                      ['Open interest', Math.round(l.oi).toLocaleString()],
                      ...(pay ? [[`Cost with fee (${over ? 'Over' : 'Under'})`, `${(pay.cost * 100).toFixed(1)}¢`]] : []),
                    ] as [string, string][]).map(([kk, v]) => (
                      <tr key={kk} className='border-t align-top'>
                        <td className='py-1.5 pe-3'>{kk}</td>
                        <td className='py-1.5 text-end'>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {w && nums && (
                <p className='text-xs leading-relaxed text-muted-foreground'>
                  DeVig&apos;s NBA props model learns from past box scores. The steps multiply out exactly to its expected number.
                  The inputs inside each step overlap, so only each step&apos;s total is shown.
                </p>
              )}
            </>
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

const pct1 = (p: number) => `${(p * 100).toFixed(1)}%`

function Box({ label, value, sub, amber }: { label: string; value: string; sub?: string; amber?: boolean }) {
  return (
    <div className={cn('rounded-xl px-3 py-2', amber ? 'bg-devig/10' : 'bg-muted')}>
      <div className='font-sans text-xs text-muted-foreground'>{label}</div>
      <div className={cn('text-xl font-bold', amber && 'text-devig')}>{value}</div>
      {sub && <div className='text-xs text-muted-foreground'>{sub}</div>}
    </div>
  )
}

// The model's steps, each with how much it moved the number (green helps this side, red hurts it)
function Steps({ w, l, over, d }: { w: PropWhy; l: Shown; over: boolean; d: number }) {
  const st = statName(l.stat, true)
  return (
    <div>
      <h3 className='mb-2 text-sm font-semibold text-muted-foreground'>How the model got to {w.expected.toFixed(1)} {st}</h3>
      <ol className='flex flex-col gap-1.5'>
        {w.steps.map(([s, to], i) => {
          const move = i === 0 ? null : to - w.steps[i - 1][1]
          const flat = move != null && Math.abs(move) < 0.5 * 10 ** -d
          const helps = move != null && (move > 0) === over
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
      <p className='mt-1.5 text-xs text-muted-foreground'>
        Green helps {over ? 'the over' : 'the under'}, red hurts it{over ? '' : ' (a lower number is better for the under)'}.
      </p>
    </div>
  )
}

// "New to this": the same numbers in plain words, no jargon. What the side needs, what DeVig expects and why, what
// Kalshi's price says, and what $10 would pay.
function plainStep(s: Step, w: PropWhy, l: Shown, last: string): string | null {
  const r = w.read, ps = plainStat(l.stat), rd = (x: N) => (x == null ? '?' : String(Math.round(x)))
  switch (s) {
    case 'typical': return null
    case 'role': {
      const sr = r.start_rate ?? 0
      const t = `Plays about ${rd(r.min_recent)} minutes a game and ${sr >= 0.8 ? 'starts most games' : sr <= 0.2 ? 'comes off the bench' : 'starts some games'}.`
      return r.missed_10 ? `${t} Missed ${rd(r.missed_10)} of the team's last 10 games.` : t
    }
    case 'form': return `Has averaged about ${rd(r.avg_recent)} ${ps} a game lately.`
    case 'opponent': return `${w.opp} is the opponent. DeVig looks at how much ${w.opp} usually gives up and how fast both teams play.`
    case 'rest': return `${r.home ? 'Playing at home' : 'Playing on the road'}${r.b2b ? ', on the second night in a row (tired legs)' : (r.rest_days ?? 0) >= 2 ? `, after ${rd(r.rest_days)} days of rest` : ''}.`
    case 'out': {
      const n = w.teammates_out.length
      return n ? `${n === 1 ? '1 teammate is' : `${n} teammates are`} out (${w.teammates_out.map(([x]) => x).join(', ')}), so there's more to go around for ${last}.`
        : 'No teammates are out.'
    }
  }
}

function NewBody({ l, w, over, m, k, pay, last }: {
  l: Shown; w: PropWhy | null; over: boolean; m: number | null; k: number; pay: ReturnType<typeof payout>; last: string
}) {
  const need = needs(l.stat, l.line, over)
  const x = w?.expected ?? l.expected
  const steps = w ? w.steps.map(([s, to], i) => ({ s, move: i === 0 ? 0 : to - w.steps[i - 1][1], txt: plainStep(s, w, l, last) }))
    .filter((r) => r.txt) : []
  return (
    <div className='flex flex-col gap-4'>
      <p className='text-lg leading-snug font-semibold'>
        This side wins if {last} gets <span className='text-devig'>{need}</span>.
        {m != null && x != null
          ? <> DeVig expects about {Math.round(x)}, so it thinks that happens <span className='text-devig'>{inTen(m)}</span> times ({fmtPct(m)}).</>
          : m != null ? <> DeVig gives it <span className='text-devig'>{inTen(m)}</span> ({fmtPct(m)}).</> : null}
      </p>

      {steps.length > 0 && (
        <div className='flex flex-col gap-2'>
          <h3 className='text-sm font-semibold text-muted-foreground'>Why DeVig expects about {Math.round(x!)}</h3>
          <ul className='flex flex-col gap-2'>
            {steps.map(({ s, move, txt }) => {
              const flat = Math.abs(move) < 0.3
              const helps = (move > 0) === over
              return (
                <li key={s} className='flex gap-3 text-[15px] leading-relaxed'>
                  <span aria-hidden='true' className={cn('mt-2 size-2 shrink-0 rounded-full', flat ? 'bg-muted-foreground/50' : helps ? 'bg-good' : 'bg-bad')} />
                  <span>
                    {txt}{' '}
                    <span className={cn('text-sm font-semibold', flat ? 'text-muted-foreground' : helps ? 'text-good' : 'text-bad')}>
                      {flat ? '(barely matters)' : `(${move > 0 ? '+' : '−'}${Math.abs(move).toFixed(1)} ${plainStat(l.stat)}, ${helps ? 'good' : 'bad'} for this side)`}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {m != null && !w && (
        <p className='text-sm leading-relaxed text-muted-foreground'>DeVig doesn&apos;t show the steps behind this {l.sport} number yet.</p>
      )}

      <div className='rounded-2xl bg-muted p-3.5'>
        <p className='font-semibold'>What Kalshi&apos;s price says</p>
        <p className='mt-1 text-sm leading-relaxed text-muted-foreground'>
          Kalshi is a market where people trade on this. Its price says {inTen(k)} ({fmtPct(k)}).
          {m != null && ` DeVig's ${fmtPct(m)} is ${gapWords(m - k)}.`}
          {m != null && " On past games Kalshi's price has been right more often than DeVig's props model, so treat DeVig as a second opinion."}
        </p>
      </div>

      {pay && (
        <div className='rounded-2xl bg-muted p-3.5'>
          <p className='font-semibold'>If you bet $10</p>
          <p className='mt-1 text-sm leading-relaxed text-muted-foreground'>
            You get <b className='text-foreground'>{money(pay.back)}</b> back if it hits ({money(pay.profit)} profit, after Kalshi&apos;s
            fee), and lose the $10 if it doesn&apos;t. That only pays off over time if this side hits more than{' '}
            <b className='text-foreground'>{fmtPct(pay.breakEven)}</b> of the time.
            {m != null && (m > pay.breakEven
              ? ` DeVig thinks it does (${fmtPct(m)}); Kalshi's price thinks ${k > pay.breakEven ? 'so too' : 'not'}.`
              : ` DeVig thinks it doesn't (${fmtPct(m)}).`)}
          </p>
        </div>
      )}

      {(l.injury || l.games < 40) && (
        <p className='text-sm leading-relaxed text-bad'>
          {l.injury ? `Injury report: ${l.injury}. ` : ''}
          {l.games < 40 ? `DeVig has only seen ${l.games} of ${last}'s games, so its number is less sure.` : ''}
        </p>
      )}
    </div>
  )
}
