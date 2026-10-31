import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { X } from 'lucide-react'
import { type GameRow, fmtAmerican, fmtPct, useGames } from '@/lib/devig'
import { type Leg, decimal, legRead, slipMath, useSlip } from '@/lib/parlay'
import {
  type LivePrice,
  type PropLine,
  fetchLiveProps,
  overTxt,
  priceToAmerican,
  propSide,
  underTxt,
  useProps,
} from '@/lib/props'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ThemeSwitch } from '@/components/theme-switch'
import { mlLeg } from './legs'

const oneIn = (p: number) => (p > 0 ? Math.round(1 / p).toLocaleString() : '—')
const money = (x: number) => `$${x.toFixed(2)}`

// ---------- a leg as a small plate ----------
function LegPlate({ leg, right }: { leg: Leg; right?: React.ReactNode }) {
  const c = leg.colors
  const bg = c
    ? leg.sideIsHome
      ? `linear-gradient(102deg, ${c.away} 0 18%, ${c.home} 18% 100%)`
      : `linear-gradient(102deg, ${c.away} 0 82%, ${c.home} 82% 100%)`
    : 'linear-gradient(102deg, var(--side-away) 0 50%, var(--side-home) 50% 100%)'
  return (
    <div className='relative flex h-14 items-center justify-between gap-3 overflow-hidden rounded-2xl px-4 text-white' style={{ background: bg }}>
      <div aria-hidden='true' className='absolute inset-0 bg-black/25' />
      <div className='relative min-w-0'>
        <div className='truncate font-display text-[22px] leading-none font-black'>{leg.label}</div>
        <div className='mt-0.5 truncate text-xs font-semibold text-white/85'>{leg.sport} · {leg.game}</div>
      </div>
      <div className='relative flex shrink-0 items-center gap-2'>
        <span className='font-condensed text-[15px] font-bold tabular-nums'>{fmtAmerican(leg.odds)}</span>
        {right}
      </div>
    </div>
  )
}

function ReadTag({ leg }: { leg: Leg }) {
  const r = legRead(leg)
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-xs font-bold',
        r.tone === 'good' && 'bg-devig/15 text-devig',
        r.tone === 'bad' && 'bg-bad/15 text-bad',
        r.tone === 'even' && 'bg-muted text-muted-foreground',
        r.tone === 'none' && 'bg-muted text-muted-foreground'
      )}
    >
      {r.tag}
    </span>
  )
}

// ---------- the slip, explained ----------
function SlipCard() {
  const { legs, remove, replace } = useSlip()
  const [stake, setStake] = useState('10')
  const m = slipMath(legs)
  const s = parseFloat(stake)
  const started = legs.filter((l) => Date.parse(l.kickoff) <= Date.now())
  const weakest = legs
    .filter((l) => l.devig != null && l.fair != null)
    .sort((a, b) => (a.devig! - a.fair!) - (b.devig! - b.fair!))[0]
  const weakestGap = weakest ? weakest.devig! - weakest.fair! : 0
  if (!legs.length) {
    return (
      <section className='rounded-[18px] border border-dashed p-6 text-center'>
        <p className='font-display text-2xl font-black'>Your slip is empty</p>
        <p className='mx-auto mt-1 max-w-sm text-sm text-muted-foreground'>
          Tap a team on any game in <Link to='/' className='text-devig'>Games</Link> to add it, or let the long-shot builder below
          build one and explain it.
        </p>
      </section>
    )
  }
  const value = m.devig != null && m.devig > m.needs
  return (
    <section aria-label='Your parlay' className='flex flex-col gap-4'>
      <div className='flex items-baseline justify-between px-1'>
        <h2 className='font-display text-[22px] font-extrabold'>Your parlay, explained</h2>
        <button type='button' onClick={() => replace([])} className='text-sm text-muted-foreground hover:text-foreground'>Clear</button>
      </div>

      <div
        className='relative overflow-hidden rounded-[20px] text-white'
        style={{ background: 'linear-gradient(102deg, #232A38 0 52%, #3C2A10 52% 100%)' }}
      >
        <div className='grid grid-cols-2 gap-y-3 p-4'>
          <div>
            <div className='text-xs font-semibold text-white/85'>Pays</div>
            <div className='font-display text-[44px] leading-[0.9] font-black'>{fmtAmerican(m.american)}</div>
            {s > 0 && <div className='text-[13px] text-white/80'>{money(s)} wins {money(s * (m.dec - 1))}</div>}
          </div>
          <div className='text-end'>
            <div className='text-xs font-semibold text-white/85'>Needs to hit</div>
            <div className='font-display text-[44px] leading-[0.9] font-black'>{fmtPct(m.needs, 1)}</div>
            <div className='text-[13px] text-white/80'>to break even</div>
          </div>
          <div>
            <div className='text-xs font-semibold text-white/85'>Kalshi&apos;s prices say</div>
            <div className='font-display text-[28px] font-extrabold'>{m.market == null ? '—' : fmtPct(m.market, m.market < 0.1 ? 1 : 0)}</div>
          </div>
          <div className='text-end'>
            <div className='text-xs font-semibold text-[#FFB547]'>DeVig says</div>
            <div className='font-display text-[28px] font-extrabold text-[#FFB547]'>
              {m.devig == null ? 'no view' : fmtPct(m.devig, m.devig < 0.1 ? 1 : 0)}
            </div>
          </div>
        </div>
      </div>

      <div className='rounded-2xl bg-card p-4'>
        <p className={cn('font-display text-xl font-extrabold', value ? 'text-good' : 'text-devig')}>
          {m.devig == null
            ? 'DeVig has no model for these legs'
            : value
              ? weakest && weakestGap < -0.03
                ? 'DeVig likes it, with a catch'
                : 'DeVig likes this ticket'
              : 'DeVig says skip it'}
        </p>
        <p className='mt-1.5 text-sm leading-relaxed text-muted-foreground'>
          {m.market != null && `If Kalshi is right, it hits about 1 time in ${oneIn(m.market)}. `}
          {m.devig != null && `If DeVig is right, 1 in ${oneIn(m.devig)}. `}
          One missed leg loses the whole ticket.
          {m.devigLegs > 0 && m.devigLegs < legs.length && ` DeVig has its own number for ${m.devigLegs} of ${legs.length} legs; the rest use Kalshi's price.`}
          {weakest && weakestGap < -0.03 && ` The weakest leg is ${weakest.label}: DeVig gives it ${fmtPct(weakest.devig)} vs Kalshi's ${fmtPct(weakest.fair)}.`}
        </p>
        {m.sameGame.length > 0 && (
          <p className='mt-2 text-sm font-semibold text-bad'>
            Two legs are from the same game. They move together, so these chances aren&apos;t exact for this ticket.
          </p>
        )}
        {started.length > 0 && (
          <p className='mt-2 text-sm font-semibold text-bad'>
            {started.map((l) => l.short).join(', ')}: game already started; that price is old.
          </p>
        )}
      </div>

      <ul className='flex flex-col gap-3'>
        {legs.map((l) => (
          <li key={l.id} className='flex flex-col gap-1.5'>
            <LegPlate
              leg={l}
              right={
                <button type='button' aria-label={`Remove ${l.label}`} onClick={() => remove(l.id)} className='grid size-8 place-items-center rounded-full bg-black/35 hover:bg-black/55'>
                  <X className='size-4' />
                </button>
              }
            />
            <div className='flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-sm'>
              <ReadTag leg={l} />
              {l.devig != null && <span className='font-semibold text-devig'>DeVig {fmtPct(l.devig)}</span>}
              {l.fair != null && <span className='text-muted-foreground'>Kalshi {fmtPct(l.fair)}</span>}
              {l.devigNote && <span className='text-xs text-muted-foreground'>{l.devigNote}</span>}
            </div>
          </li>
        ))}
      </ul>

      <label className='flex items-center gap-3 px-1 text-sm text-muted-foreground'>
        Stake $
        <Input inputMode='decimal' value={stake} onChange={(e) => setStake(e.target.value)} className='h-10 w-24 rounded-xl' />
        {s > 0 && <span>pays {money(s * m.dec)} back if every leg hits</span>}
      </label>
      <p className='px-1 text-xs text-muted-foreground'>
        Uses each leg&apos;s own Kalshi price with its fee. A combo bought as one ticket on Kalshi is priced by Kalshi and may differ.
      </p>
    </section>
  )
}

// ---------- the long-shot builder (same search as the classic app: the likeliest ticket at Kalshi's prices) ----------
type Cand = { leg: Leg; dec: number; fair: number; game: string; why: string }
const MAX_LEGS = 5, POOL = 36, PROPS_PER_GAME = 2, POOL_WITH_PROPS = 44

function candidates(rows: GameRow[], props: PropLine[], live: Record<string, LivePrice>, sport: string, withProps: boolean): Cand[] {
  const now = Date.now()
  const out: Cand[] = []
  for (const r of rows) {
    if (r.state !== 'pre' || Date.parse(r.kickoff) <= now || r.fairHome == null) continue
    if (sport !== 'ALL' && r.sport !== sport) continue
    for (const side of ['away', 'home'] as const) {
      const leg = mlLeg(r, side)
      if (!leg || leg.fair == null) continue
      out.push({ leg, dec: decimal(leg.odds), fair: leg.fair, game: r.id, why: '' })
    }
  }
  out.sort((a, b) => b.fair * b.dec - a.fair * a.dec)
  let pool = out.slice(0, POOL)
  if (withProps) {
    const pp: Cand[] = []
    for (const l of props) {
      if (sport !== 'ALL' && l.sport !== sport) continue
      if (!l.ticker || Date.parse(l.kickoff) <= now) continue
      const lv = live[l.ticker]
      const priced = lv ? { ...l, bid: lv.bid, ask: lv.ask } : l
      if ((l.oi || 0) < 100) continue
      for (const side of ['over', 'under'] as const) {
        const ps = propSide(priced, side)
        if (!ps || ps.spread > 0.1 || !(ps.cost >= 0.15 && ps.cost <= 0.85)) continue
        const odds = priceToAmerican(ps.cost)
        if (odds == null) continue
        const devig = l.modelOver == null ? null : side === 'over' ? l.modelOver : 1 - l.modelOver
        pp.push({
          leg: {
            id: `${l.key}|${side}`, kind: 'prop', label: `${l.player.split(' ').slice(-1)[0]} ${side === 'over' ? overTxt(l.stat, l.line) : underTxt(l.stat, l.line)}`,
            short: l.player.split(' ').slice(-1)[0], game: `${l.away} at ${l.home}`, gameId: `${l.sport}|${l.gameKey}`, sport: l.sport,
            kickoff: l.kickoff, odds, fair: ps.fair, devig, devigNote: devig == null ? null : 'props model: Kalshi beat it on past games',
            colors: null, sideIsHome: null, ticker: l.ticker,
          },
          dec: 1 / ps.cost, fair: ps.fair, game: `${l.sport}|${l.gameKey}`, why: '',
        })
      }
    }
    const per = new Map<string, number>()
    pp.sort((a, b) => b.fair * b.dec - a.fair * a.dec).forEach((c) => {
      const n = (per.get(c.game) ?? 0) + 1
      per.set(c.game, n)
      if (n <= PROPS_PER_GAME) pool.push(c)
    })
    pool = pool.sort((a, b) => b.fair * b.dec - a.fair * a.dec).slice(0, POOL_WITH_PROPS)
  }
  return pool
}

function search(cands: Cand[], target: number) {
  const best: { key: string; legs: Cand[]; prob: number; mult: number }[] = []
  const consider = (legs: Cand[], prob: number, mult: number) => {
    const key = legs.map((l) => l.leg.id).sort().join('|')
    if (best.some((b) => b.key === key)) return
    best.push({ key, legs: legs.slice(), prob, mult })
    best.sort((a, b) => b.prob - a.prob || a.legs.length - b.legs.length)
    if (best.length > 12) best.length = 12
  }
  const games = new Set<string>()
  const legs: Cand[] = []
  const dfs = (start: number, prob: number, mult: number) => {
    if (mult >= target) return consider(legs, prob, mult)
    if (legs.length >= MAX_LEGS) return
    if (best.length >= 12 && prob <= best[best.length - 1].prob) return
    for (let i = start; i < cands.length; i++) {
      const c = cands[i]
      if (games.has(c.game)) continue
      games.add(c.game); legs.push(c)
      dfs(i + 1, prob * c.fair, mult * c.dec)
      legs.pop(); games.delete(c.game)
    }
  }
  dfs(0, 1, 1)
  return best.slice(0, 3)
}

const TARGETS = [
  { label: '+300', mult: 4 },
  { label: '+1000', mult: 11 },
  { label: '+5000', mult: 51 },
]

function LongShot() {
  const { rows } = useGames()
  const { lines } = useProps()
  const { replace } = useSlip()
  const [target, setTarget] = useState(11)
  const [sport, setSport] = useState('ALL')
  const [withProps, setWithProps] = useState(true)
  const [busy, setBusy] = useState(false)
  const [tickets, setTickets] = useState<ReturnType<typeof search> | null>(null)
  const [note, setNote] = useState('')
  const sports = useMemo(() => ['ALL', ...Array.from(new Set(rows.filter((r) => r.state === 'pre').map((r) => r.sport))).sort()], [rows])

  async function build() {
    setBusy(true)
    setNote("Checking Kalshi's live prices…")
    let live: Record<string, LivePrice> = {}
    if (withProps) {
      const pre = candidates(rows, lines, {}, sport, true).filter((c) => c.leg.ticker)
      live = await Promise.race([
        fetchLiveProps(pre.map((c) => c.leg.ticker as string)),
        new Promise<Record<string, LivePrice>>((r) => setTimeout(() => r({}), 6000)),
      ])
    }
    const cands = candidates(rows, lines, live, sport, withProps)
    const found = search(cands, target)
    setTickets(found)
    setNote(
      cands.length < 2
        ? 'Not enough upcoming games with prices right now.'
        : found.length
          ? `Built from ${cands.length} sides on the board${Object.keys(live).length ? ', props at live prices' : ''}.`
          : `No ticket of up to ${MAX_LEGS} legs reaches that payout right now. Try a smaller one.`
    )
    setBusy(false)
  }

  return (
    <section aria-label='Long-shot builder' className='flex flex-col gap-4'>
      <div className='px-1'>
        <h2 className='font-display text-[22px] font-extrabold'>Long-shot builder</h2>
        <p className='text-sm text-muted-foreground'>Pick a payout. DeVig builds the ticket most likely to hit at Kalshi&apos;s prices, then tells you why, and how likely it is to lose.</p>
      </div>
      <div className='flex flex-col gap-3 rounded-[18px] bg-card p-4'>
        <div role='radiogroup' aria-label='Payout' className='grid grid-cols-3 gap-1 rounded-xl bg-muted p-1'>
          {TARGETS.map((t) => (
            <button key={t.label} type='button' role='radio' aria-checked={target === t.mult} onClick={() => setTarget(t.mult)}
              className={cn('h-10 rounded-lg text-sm font-semibold text-muted-foreground', target === t.mult && 'bg-foreground text-background')}>
              {t.label} or more
            </button>
          ))}
        </div>
        <div className='flex flex-wrap gap-2'>
          {sports.map((s) => (
            <button key={s} type='button' aria-pressed={sport === s} onClick={() => setSport(s)}
              className={cn('h-9 rounded-full border px-4 text-sm font-medium text-muted-foreground', sport === s && 'border-foreground bg-foreground text-background')}>
              {s === 'ALL' ? 'All sports' : s}
            </button>
          ))}
          <button type='button' aria-pressed={withProps} onClick={() => setWithProps((v) => !v)}
            className={cn('h-9 rounded-full border px-4 text-sm font-medium text-muted-foreground', withProps && 'border-foreground bg-foreground text-background')}>
            Player props
          </button>
        </div>
        <Button onClick={build} disabled={busy} className='h-12 rounded-xl text-base font-bold'>
          {busy ? 'Building…' : 'Build my long shot'}
        </Button>
        {note && <p className='text-sm text-muted-foreground'>{note}</p>}
      </div>

      {tickets?.map((t, i) => {
        const dec = t.legs.reduce((m, c) => m * c.dec, 1)
        const devigLegs = t.legs.filter((c) => c.leg.devig != null).length
        const devigProb = devigLegs ? t.legs.reduce((m, c) => m * (c.leg.devig ?? c.fair), 1) : null
        return (
          <article key={t.key} className='flex flex-col gap-3 rounded-[18px] bg-card p-4'>
            <div className='flex items-baseline justify-between'>
              <span className='font-display text-2xl font-black'>{i === 0 ? 'Best build' : `Option ${i + 1}`}</span>
              <span className='font-display text-2xl font-black'>{fmtAmerican((dec - 1) * 100)}</span>
            </div>
            <p className='rounded-xl bg-bad/10 px-3 py-2 text-sm leading-relaxed text-foreground'>
              By Kalshi&apos;s prices this hits about 1 time in {oneIn(t.prob)} ({fmtPct(t.prob, 1)}); it needs {fmtPct(1 / dec, 1)} to
              break even.{devigProb != null && ` Counting DeVig's numbers where it has them: ${fmtPct(devigProb, 1)}.`} Only stake what you&apos;re fine losing.
            </p>
            <ul className='flex flex-col gap-3'>
              {t.legs.map((c) => (
                <li key={c.leg.id} className='flex flex-col gap-1.5'>
                  <LegPlate leg={c.leg} />
                  <p className='px-1 text-sm leading-relaxed text-muted-foreground'>
                    <b className='text-foreground'>Picked because</b>{' '}
                    {c.dec >= 3
                      ? `it's the long leg: on its own it pays ${fmtAmerican(c.leg.odds)}, so it carries most of the payout, and at ${fmtPct(c.fair)} by Kalshi's prices it's the main reason this ticket usually loses.`
                      : `it's a safer leg that adds a little payout: Kalshi gives it ${fmtPct(c.fair)}.`}{' '}
                    Every leg is from a different game.{' '}
                    {c.leg.devig != null && (
                      <>
                        <ReadTag leg={c.leg} /> DeVig {fmtPct(c.leg.devig)}
                        {c.leg.devigNote ? ` (${c.leg.devigNote})` : ''}.
                      </>
                    )}
                  </p>
                </li>
              ))}
            </ul>
            <Button variant='outline' className='h-11 rounded-xl' onClick={() => replace(t.legs.map((c) => c.leg))}>
              Put this ticket in my slip
            </Button>
          </article>
        )
      })}
    </section>
  )
}

export function Parlay() {
  return (
    <>
      <Header>
        <div className='me-auto min-w-0'>
          <h1 className='font-display text-[26px] leading-none font-black'>Parlay</h1>
          <p className='mt-0.5 truncate text-xs text-muted-foreground'>Every leg multiplies the risk. DeVig shows what it needs.</p>
        </div>
        <ThemeSwitch />
      </Header>
      <Main className='flex flex-col gap-8'>
        <SlipCard />
        <LongShot />
        <p className='max-w-prose text-xs leading-relaxed text-muted-foreground'>
          Chances use Kalshi&apos;s prices with the fee gap removed; payouts use Kalshi&apos;s price with its fee. DeVig doesn&apos;t
          bet and doesn&apos;t promise wins.
        </p>
      </Main>
    </>
  )
}
