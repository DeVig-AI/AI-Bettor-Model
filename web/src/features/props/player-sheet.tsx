// The player drawer: one player's lines for one stat, the question each line asks, the chance it happens (Kalshi,
// his last 10, DeVig's props model), DeVig's projection with the model's own reasons (nba/props_why.json), his last 10
// games against the line, and what each side costs with Kalshi's fee. Either side goes straight into the parlay.
// Nothing here is a pick: on past games Kalshi's price has been more right than the props model.
import { useMemo, useState } from 'react'
import { Check, Plus } from 'lucide-react'
import { type GameRow, fmtAmerican, fmtPct } from '@/lib/devig'
import { useSlip } from '@/lib/parlay'
import type { PropLine } from '@/lib/props'
import { pastHit, useLadderHistory } from '@/lib/ladder'
import { propSides } from '@/lib/track'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { PlayerPhoto } from '@/components/team-logo'
import { TrackButton } from '@/components/track-button'
import { propLeg } from '../parlay/legs'
import { type PropWhy, usePropPlayer, usePropWhy } from './why'
import { useStreakSummary } from './streaks'
import { LAST, type Shown, groupLines, projOf, hits, needOf, tenOfTen, thinLine, useLivePrices, usePlayerLogs } from './board-data'
import { money, payout, plainStat } from './words'
import { PriceMove, Tonight } from './tonight'

const whenFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
const pct = (p: number) => `${Math.round(p * 100)}%`
const signed = (v: number, d = 1) => (Math.abs(v) < 0.05 ? '±0' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}`)
const VERB: Record<string, string> = { points: 'score', threes: 'make', rebounds: 'grab', goals: 'score', touchdowns: 'score' }
export const lastName = (n: string) => n.replace(/ (Jr\.?|Sr\.?|III|II|IV)$/, '').split(' ').slice(-1)[0]
export const fullName = (g: GameRow | null | undefined, code: string) =>
  g ? (code === g.home ? g.homeName : code === g.away ? g.awayName : code) || code : code

export function PlayerSheet({ ls, line, game, open, onOpenChange }: {
  ls: PropLine[]; line: number; game: GameRow | null; open: boolean; onOpenChange: (v: boolean) => void
}) {
  const { live } = useLivePrices(open ? ls.map((l) => l.ticker).filter(Boolean) as string[] : [])
  const g = useMemo(() => groupLines(ls, live)[0], [ls, live])
  const [pick, setPick] = useState(line)
  if (!g) return null
  const l = g.lines.find((x) => x.line === pick) ?? g.lines.find((x) => x.line === line) ?? g.main
  return <Body g={g.lines} l={l} typical={projOf(g)} onPick={setPick} game={game} open={open} onOpenChange={onOpenChange} />
}

function Body({ g, l, typical, onPick, game, open, onOpenChange }: {
  g: Shown[]; l: Shown; typical: number | null; onPick: (line: number) => void; game: GameRow | null; open: boolean; onOpenChange: (v: boolean) => void
}) {
  const w = usePropWhy(l)
  const { pid, team: t0, color, unit } = usePropPlayer(l, w, game)
  const teams = useMemo(() => [l.away, l.home], [l.away, l.home])
  const logs = usePlayerLogs(l.sport, teams)
  const team = t0 ?? logs?.team(l.player) ?? null
  const opp = w?.opp ?? (team ? (team === l.home ? l.away : l.home) : null)
  const last = logs?.last(l.player, l.stat) ?? null
  const h10 = hits(last, l.line)
  const ten = tenOfTen(last, l.line)
  const need = needOf(l.line)
  const word = plainStat(l.stat)
  const hist = useLadderHistory()
  const past = pastHit(hist, l.sport, 'over', l.stat, l.mid)
  const sum = useStreakSummary().data?.sports?.[l.sport]
  const m = l.modelOver
  const avg = w?.expected ?? l.expected
  const x = typical ?? avg
  const bg = color ?? 'var(--side-home)'
  const nm = lastName(l.player)
  const sub = [team && opp ? `${fullName(game, team)} vs ${fullName(game, opp)}` : `${l.away} at ${l.home}`, whenFmt.format(new Date(l.kickoff))]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side='bottom' onOpenAutoFocus={(e) => e.preventDefault()}
        className='max-h-[92svh] gap-0 overflow-y-auto rounded-t-3xl border-t p-0 md:mx-auto md:max-w-xl [&>button:last-child]:top-3.5 [&>button:last-child]:grid [&>button:last-child]:size-9 [&>button:last-child]:place-items-center [&>button:last-child]:rounded-full [&>button:last-child]:bg-black/30 [&>button:last-child]:text-white [&>button:last-child]:opacity-100'>
        <div className='relative flex shrink-0 items-center gap-3 overflow-hidden rounded-t-3xl px-5 pt-6 pb-4 text-white' style={{ background: bg }}>
          <span aria-hidden='true' className='absolute inset-0 bg-linear-to-b from-black/5 to-black/40' />
          <span aria-hidden='true' className='absolute top-2 left-1/2 h-1.5 w-10 -translate-x-1/2 rounded-full bg-white/45' />
          <PlayerPhoto sport={l.sport} unit={unit} pid={pid} team={team} teamColor={color}
            className='relative size-16 [&>span:first-child]:bg-white/90' badge='size-6 text-[8px]' />
          <div className='relative min-w-0 flex-1 pe-10'>
            <SheetTitle className='truncate font-display text-[26px] leading-none font-black text-white'>{l.player}</SheetTitle>
            <SheetDescription className='mt-1 text-sm text-white/85'>
              {sub.join(' · ')}{l.injury ? <> · <b className='text-white'>{l.injury}</b></> : null}
            </SheetDescription>
          </div>
        </div>

        <div className='flex flex-col gap-5 px-5 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]'>
          <section className='flex flex-col gap-2'>
            <div className='flex items-center justify-between gap-2'>
              <h3 className='text-xs font-semibold tracking-wide text-muted-foreground uppercase'>Pick a line</h3>
              <TrackButton kind='p' compact label={`${l.player} ${need}+ ${word}`} keys={propSides(l)} />
            </div>
            <div className='no-scrollbar -mx-5 flex gap-1.5 overflow-x-auto px-5'>
              {g.map((x) => {
                const t = tenOfTen(last, x.line)
                return (
                  <button key={x.key} type='button' aria-pressed={x.line === l.line} onClick={() => onPick(x.line)}
                    aria-label={`${needOf(x.line)} or more${t ? `, reached in each of his last ${LAST}` : ''}`}
                    className={cn('relative h-10 min-w-14 shrink-0 rounded-xl border px-3 font-condensed text-base font-bold tabular-nums transition-colors duration-150',
                      x.line === l.line ? 'border-foreground bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}>
                    {needOf(x.line)}+
                    {t && <span aria-hidden='true' className='absolute -top-1 -end-1 size-2.5 rounded-full bg-good ring-2 ring-background' />}
                  </button>
                )
              })}
            </div>
          </section>

          <p className='font-display text-[26px] leading-tight font-extrabold'>
            Will {nm} {VERB[l.stat] ?? 'get'} {need} or more {word}?
          </p>

          {ten && (
            <div className='rounded-2xl border border-good/30 bg-good/10 px-4 py-3 text-sm leading-relaxed'>
              <b className='text-good'>{LAST} for {LAST}.</b> He&apos;s reached {need} in each of his last {LAST} games.
              {sum && sum.rungs >= 200
                ? ` Past ${l.sport} lines like this came in ${pct(sum.hit)} of the time, and Kalshi had priced them at ${pct(sum.kalshi)}. A streak alone hasn't beaten the price.`
                : ' There aren\'t enough past streaks yet to say how they did against the price.'}
            </div>
          )}
          {thinLine(l) && (
            <p className='rounded-2xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm leading-relaxed'>
              Few trades on this line ({Math.round(l.spread * 100)}¢ between buy and sell), so Kalshi&apos;s price is shaky.
            </p>
          )}

          <Chances l={l} h10={h10} n={last?.length ?? 0} m={m} past={past} />

          {x != null && <Projection l={l} w={w} x={x} avg={avg} m={m} last={last} game={game} team={team} />}

          {last && last.length > 0 && (
            <section className='flex flex-col gap-2'>
              <h3 className='flex items-baseline justify-between text-xs font-semibold tracking-wide text-muted-foreground uppercase'>
                His last {last.length} games
                <span className='font-sans text-sm font-semibold tracking-normal text-foreground normal-case'>{h10} of {last.length} got there</span>
              </h3>
              <LastChart last={last} line={l.line} />
              <p className='flex items-center gap-2 text-xs text-muted-foreground'>
                <svg width='22' height='4' aria-hidden='true'><line x1='0' x2='22' y1='2' y2='2' stroke='currentColor' strokeWidth='1.5' strokeDasharray='5 4' /></svg>
                needs {needOf(l.line)} · green games got there
              </p>
            </section>
          )}

          <Tonight l={l} game={game} team={team} opp={opp} logs={logs} w={w} />
          <PriceMove l={l} />

          <Costs l={l} />
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Bar({ label, sub, p, value, tone }: { label: string; sub: string; p: number | null; value: string; tone: string }) {
  return (
    <div className='grid grid-cols-[6.5rem_1fr_3rem] items-center gap-3'>
      <div className='leading-tight'>
        <div className='text-sm font-semibold'>{label}</div>
        <div className='text-xs text-muted-foreground'>{sub}</div>
      </div>
      <div className='relative h-2.5 overflow-hidden rounded-full bg-muted'>
        <span aria-hidden='true' className='absolute inset-y-0 left-1/2 w-px bg-background' />
        {p != null && <i className={cn('absolute inset-y-0 left-0 rounded-full', tone)} style={{ width: `${p * 100}%` }} />}
      </div>
      <div className={cn('text-end font-condensed text-lg font-bold tabular-nums', tone.replace('bg-', 'text-'))}>{value}</div>
    </div>
  )
}

function Chances({ l, h10, n, m, past }: { l: Shown; h10: number | null; n: number; m: number | null; past: ReturnType<typeof pastHit> }) {
  const gap = m == null ? null : m - l.mid
  const vs = gap == null ? null : Math.abs(gap) < 0.05 ? 'agrees with Kalshi' : gap > 0 ? 'is higher than Kalshi' : 'is lower than Kalshi'
  const games = h10 == null || !n ? null : h10 / n >= 0.7 ? 'most of' : h10 / n >= 0.4 ? 'some of' : 'few of'
  return (
    <section className='flex flex-col gap-3'>
      <h3 className='text-xs font-semibold tracking-wide text-muted-foreground uppercase'>Chance it happens</h3>
      <Bar label='Kalshi' sub='what bettors pay' p={l.mid} value={pct(l.mid)} tone='bg-foreground' />
      {h10 != null && n > 0 && <Bar label={`His last ${n}`} sub='small sample' p={h10 / n} value={`${h10}/${n}`} tone='bg-good' />}
      {m != null && <Bar label='DeVig model' sub='second opinion' p={m} value={pct(m)} tone='bg-devig' />}
      <div aria-hidden='true' className='grid grid-cols-[6.5rem_1fr_3rem] gap-3 text-[11px] text-muted-foreground tabular-nums'>
        <span /><span className='flex justify-between'><span>0%</span><span>50%</span><span>100%</span></span><span />
      </div>
      <p className='text-[15px] leading-relaxed'>
        Kalshi gives it about <b>{pct(l.mid)}</b>.
        {games && ` He got there in ${games} his last ${n}.`}
        {vs && <> DeVig&apos;s model <b className='text-devig'>{vs}</b> at {pct(m!)}.</>}
        {m == null && ' DeVig has no number for this line.'}
      </p>
      {past && past.n >= 100 && (
        <p className='text-sm leading-relaxed text-muted-foreground'>
          Past {l.sport} lines Kalshi priced near {pct(past.paid)} came in {pct(past.hit)} of the time ({past.n.toLocaleString('en-US')} lines).
        </p>
      )}
    </section>
  )
}

// DeVig's projection, from the model's own split of tonight's number: his recent games first, then what's different
// about tonight. Each change is measured against an average night, so "teammates out" can be a minus when fewer
// teammates than usual are out.
function Projection({ l, w, x, avg, m, last, game, team }: {
  l: Shown; w: PropWhy | null; x: number; avg: number | null; m: number | null; last: number[] | null; game: GameRow | null; team: string | null
}) {
  const need = needOf(l.line)
  const word = plainStat(l.stat)
  const gap = x - need
  // the average sits well away from the typical night (lopsided stats like yards): say both, plainly
  const skew = avg != null && Math.abs(avg - x) >= Math.max(1, 0.08 * Math.abs(x))
  const at = (s: string) => w?.steps.find(([k]) => k === s)?.[1] ?? null
  const form = at('form'), op = at('opponent'), rest = at('rest'), out = at('out')
  const steps: [string, string, number][] = []
  if (w && form != null && op != null && rest != null && out != null) {
    const r = w.read
    const pace = (r.opp_pace ?? 100) >= 103 ? ' and play fast, so more chances' : (r.opp_pace ?? 100) <= 98.5 ? ' and play slow, so fewer chances' : ''
    const names = w.teammates_out.map(([n]) => n)
    const d = out - rest
    steps.push(
      ['Tonight\'s opponent', `The ${fullName(game, w.opp)} give up ${r.opp_allows?.toFixed(1) ?? '?'} ${word} a game${pace}`, op - form],
      ['Rest and home', `${r.home ? 'Home' : 'Away'}, ${r.b2b ? 'second night of a back-to-back' : `${r.rest_days ?? '?'}${(r.rest_days ?? 0) >= 7 ? '+' : ''} days of rest`}`, rest - op],
      ['Teammates out', (names.length ? `Ruled out for the ${fullName(game, team ?? w.team)}: ${names.join(', ')}` : 'No teammates ruled out') +
        (d < -0.05 ? '. Fewer minutes and shots open up than on a usual night' : d > 0.05 ? '. More minutes and shots open up than on a usual night' : ''), d],
    )
  }
  const big = steps.reduce<[string, string, number] | null>((a, b) => (!a || Math.abs(b[2]) > Math.abs(a[2]) ? b : a), null)
  const role = w ? ((w.read.start_rate ?? 0) >= 0.8 ? 'starts' : (w.read.start_rate ?? 0) <= 0.2 ? 'comes off the bench' : 'starts some games') : ''
  const lo = last?.length ? Math.min(...last) : null, hi = last?.length ? Math.max(...last) : null
  const under = last ? last.filter((v) => v <= l.line).length : null
  return (
    <section className='flex flex-col gap-3 rounded-2xl border border-devig/25 bg-devig/10 p-4'>
      <div className='flex flex-wrap items-end justify-between gap-x-3 gap-y-2'>
        <div>
          <div className='text-xs font-semibold tracking-wide text-muted-foreground uppercase'>DeVig&apos;s typical night</div>
          <div className='font-display text-[40px] leading-none font-black text-devig tabular-nums'>
            {x.toFixed(1)} <span className='font-sans text-base font-semibold whitespace-nowrap text-foreground'>{word}</span>
          </div>
        </div>
        <span className={cn('rounded-full px-2.5 py-1 text-sm font-semibold', gap >= 0 ? 'bg-good/15 text-good' : 'bg-bad/15 text-bad')}>
          {Math.abs(gap) < 0.5 ? `right at the ${need}+ line` : `${Math.abs(gap).toFixed(1)} ${gap >= 0 ? 'above' : 'below'} the ${need}+ line`}
        </span>
      </div>
      {skew && (
        <p className='text-sm leading-relaxed'>
          He averages <b>{avg!.toFixed(1)}</b>, but a few big games pull that up. A typical night for him is about{' '}
          <b>{Math.round(x)}</b>, so DeVig gives {need}+ {m != null ? `a ${pct(m)} chance` : 'about even odds'}.
        </p>
      )}
      {w && form != null ? (
        <>
          <p className='text-sm leading-relaxed text-muted-foreground'>
            Starts from his own recent games, then adjusts for tonight. Each change compares tonight with an average night.
          </p>
          <ol className='flex flex-col overflow-hidden rounded-xl bg-card'>
            <Step t="What he's been doing" v={form.toFixed(1)}
              d={`${w.read.avg_recent?.toFixed(1) ?? '?'} a game his last 5, ${w.read.avg_longer?.toFixed(1) ?? '?'} over his last 20. Plays about ${Math.round(w.read.min_recent ?? 0)} minutes and ${role}.`} />
            {steps.map(([t, d, v]) => (
              <Step key={t} t={t} d={d} v={signed(v)} tone={Math.abs(v) < 0.05 ? undefined : v > 0 ? 'text-good' : 'text-bad'} />
            ))}
            <Step total t={skew ? "Tonight's average" : "Tonight's projection"} v={(avg ?? x).toFixed(1)}
              d={big && Math.abs(big[2]) >= 0.3 ? `Biggest change for tonight: ${big[0].toLowerCase()} (${signed(big[2])}).` : 'Tonight looks like a normal game for him.'} />
          </ol>
        </>
      ) : (
        <p className='text-sm leading-relaxed text-muted-foreground'>
          {l.sport === 'NBA' ? 'The reasons behind this number aren\'t published yet (they come right after the model runs; check back soon).' : `DeVig doesn't show the reasons behind ${l.sport} projections yet.`}
        </p>
      )}
      {m != null && lo != null && (
        <p className='text-sm leading-relaxed'>
          <b>Why it isn&apos;t a lock:</b> a typical night is his middle game, not his floor. His last {last!.length} ranged from {lo} to {hi}, and{' '}
          {under} of them {under === 1 ? 'was' : 'were'} under {need}. That&apos;s why DeVig gives {need}+ a {pct(m)} chance, not 100%.
        </p>
      )}
    </section>
  )
}

function Step({ t, d, v, tone, total }: { t: string; d: string; v: string; tone?: string; total?: boolean }) {
  return (
    <li className={cn('flex items-start justify-between gap-3 border-b px-3 py-2.5 last:border-b-0', total && 'bg-devig/10')}>
      <div className='min-w-0'>
        <div className='text-sm font-semibold'>{t}</div>
        <div className='text-sm leading-snug text-muted-foreground'>{d}</div>
      </div>
      <div className={cn('shrink-0 font-condensed text-lg font-bold tabular-nums', total ? 'text-devig' : tone)}>{v}</div>
    </li>
  )
}

function LastChart({ last, line }: { last: number[]; line: number }) {
  const W = 320, H = 132, top = 18, bot = 20, n = last.length
  const need = needOf(line)
  const max = Math.max(...last, need) * 1.12 || 1
  const y = (v: number) => top + (H - top - bot) * (1 - v / max)
  const bw = W / n
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width='100%' role='img' aria-label={`Last ${n} games: ${last.join(', ')}. Needs ${need}.`}>
      {last.map((v, i) => {
        const hit = v > line, bh = Math.max(H - bot - y(v), 2), x0 = i * bw + 3
        return (
          <g key={i}>
            <rect x={x0} y={H - bot - bh} width={bw - 6} height={bh} rx={3} fill={hit ? 'var(--good)' : 'var(--muted-foreground)'} opacity={hit ? 1 : 0.35} />
            <text x={x0 + (bw - 6) / 2} y={H - bot - bh - 4} textAnchor='middle' fontSize={11} fontWeight={700}
              fill={hit ? 'var(--foreground)' : 'var(--muted-foreground)'}>{v}</text>
          </g>
        )
      })}
      <line x1={0} x2={W} y1={y(need)} y2={y(need)} stroke='var(--foreground)' strokeWidth={1.5} strokeDasharray='5 4' />
      <text x={2} y={H - 5} fontSize={10.5} fill='var(--muted-foreground)'>{n} games ago</text>
      <text x={W - 2} y={H - 5} textAnchor='end' fontSize={10.5} fill='var(--muted-foreground)'>last game</text>
    </svg>
  )
}

// What each side costs (fee included) and pays on $10; tap one to put it in the parlay
function Costs({ l }: { l: Shown }) {
  const { has, toggle } = useSlip()
  const pre = Date.parse(l.kickoff) > Date.now()
  const need = needOf(l.line)
  const sides = (['over', 'under'] as const).map((s) => {
    const leg = propLeg(l, s, { bid: l.bid, ask: l.ask, title: null })
    return { s, leg, pay: payout(l, s === 'over'), label: s === 'over' ? `Yes, ${need}+` : need - 1 <= 0 ? 'No, none' : `No, ${need - 1} or fewer` }
  })
  return (
    <section className='flex flex-col gap-2'>
      <h3 className='text-xs font-semibold tracking-wide text-muted-foreground uppercase'>What it costs</h3>
      <div className='grid grid-cols-2 gap-2'>
        {sides.map(({ s, leg, pay, label }) => {
          if (!leg || !pay) return <div key={s} className='rounded-2xl bg-muted p-3 text-sm text-muted-foreground'>{label}: no price</div>
          const on = has(leg.id)
          return (
            <button key={s} type='button' aria-pressed={on} disabled={!pre} onClick={() => toggle(leg)}
              className={cn('flex flex-col items-start gap-0.5 rounded-2xl border p-3 text-start transition-colors duration-150 disabled:opacity-70',
                on ? 'border-devig bg-devig/10' : 'bg-card hover:border-foreground/40')}>
              <span className='text-sm font-semibold'>{label}</span>
              <span className='font-condensed text-2xl font-bold tabular-nums'>
                {Math.round((s === 'over' ? l.ask! : 1 - l.bid!) * 100)}¢ <span className='text-base text-muted-foreground'>{fmtAmerican(leg.odds)}</span>
              </span>
              <span className='text-xs text-muted-foreground'>$10 wins {money(pay.profit)}</span>
              {pre && (
                <span className={cn('mt-1 inline-flex items-center gap-1 text-xs font-semibold', on ? 'text-devig' : 'text-foreground')}>
                  {on ? <Check className='size-3.5' aria-hidden='true' /> : <Plus className='size-3.5' aria-hidden='true' />}
                  {on ? 'In your parlay' : 'Add to parlay'}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <p className='text-xs text-muted-foreground'>Costs include Kalshi&apos;s fee. {fmtPct(l.mid)} is the middle of Kalshi&apos;s buy and sell prices.</p>
    </section>
  )
}
