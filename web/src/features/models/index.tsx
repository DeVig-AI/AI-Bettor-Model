import { useState } from 'react'
import { type CalibRow, type ModelRow, type Slot, useModels } from '@/lib/models'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ThemeSwitch } from '@/components/theme-switch'

// Models: every model graded on the same games with the same rules, Kalshi's price as the baseline. Each model is a
// row with its win rate drawn against the rate its prices needed (the amber tick). A comparison, not proof.

const SPORTS = ['NFL', 'NBA', 'MLB', 'CFB']
const BETS = [['ml', 'Moneyline'], ['spread', 'Spread'], ['total', 'Total'], ['props', 'Props']] as const
type Bet = (typeof BETS)[number][0]

const pct = (x: number | null | undefined, dec = false) => (x == null ? '—' : dec ? `${(x * 100).toFixed(1)}%` : `${Math.round(x * 100)}%`)
const units = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(1)}u`

const NOTES: Record<Bet, string> = {
  ml: "Each model's favorite in every game it covers, so DeVig's row isn't the same as its confident picks on Track record. Picking favorites wins often, so look at profit: 1 unit on each pick at Kalshi's last price before the game, fee included.",
  spread: "Each model's line against Kalshi's last line before the game. Market = Kalshi's favorite at its main line.",
  total: "None of these models picks totals yet. Market = the over at Kalshi's main total, as a baseline.",
  props: "DeVig's props model, its whole live record, graded from settled results. Profit after Kalshi's price and fee. Market = the win rate Kalshi's price implied.",
}

function Row({ m, money, dec }: { m: ModelRow; money: boolean; dec: boolean }) {
  const bench = m.key === 'kalshi'
  const empty = m.none || m.bar_only || !m.n
  const beat = m.pct != null && m.breakeven != null ? m.pct > m.breakeven : null
  return (
    <li className={cn('flex flex-col gap-1.5 border-b px-4 py-3 last:border-b-0', bench && 'bg-muted/40')}>
      <div className='flex items-baseline justify-between gap-3'>
        <span className='font-semibold'>{m.name}{bench && <span className='ms-1.5 text-xs font-normal text-muted-foreground'>baseline</span>}</span>
        {money && m.profit != null && !empty && (
          <span className={cn('font-condensed text-lg font-bold tabular-nums', m.profit >= 0 ? 'text-good' : 'text-bad')}>
            {units(m.profit)}
            {m.roi != null && <span className='ms-1 text-xs font-medium text-muted-foreground'>{m.roi >= 0 ? '+' : '−'}{Math.abs(Math.round(m.roi * 100))}%</span>}
          </span>
        )}
      </div>
      {empty ? (
        <span className='text-sm text-muted-foreground'>{m.bar_only ? `Kalshi's price needed ${pct(m.breakeven, dec)}` : 'No picks of this kind'}</span>
      ) : (
        <>
          <div aria-hidden='true' className='relative h-2.5 rounded-full bg-muted'>
            <div className={cn('absolute inset-y-0 start-0 rounded-full', beat ? 'bg-good/70' : 'bg-bad/60')} style={{ width: pct(m.pct, true) }} />
            {m.breakeven != null && <div className='absolute -top-1 -bottom-1 w-[3px] -translate-x-1/2 rounded-full bg-devig' style={{ left: pct(m.breakeven, true) }} />}
          </div>
          <div className='flex justify-between text-xs text-muted-foreground tabular-nums'>
            <span>{m.w}–{m.l} · won <b className={cn(beat == null ? 'text-foreground' : beat ? 'text-good' : 'text-bad')}>{pct(m.pct, dec)}</b></span>
            <span>needed {pct(m.breakeven, dec)}</span>
          </div>
        </>
      )}
    </li>
  )
}

// said vs won: a dot per group on a 50-100% line, the gap is how far off the model's percentages were
function Calib({ c }: { c: CalibRow }) {
  const bench = c.key === 'kalshi'
  const better = !bench && c.logloss < c.mkt_logloss
  return (
    <li className='flex flex-col gap-2 border-b px-4 py-3 last:border-b-0'>
      <div className='flex items-baseline justify-between gap-3'>
        <span className='font-semibold'>{c.name} <span className='text-xs font-normal text-muted-foreground'>{c.n} games</span></span>
        <span className={cn('text-sm tabular-nums', bench ? 'text-muted-foreground' : better ? 'text-good' : 'text-bad')}>
          {c.logloss.toFixed(3)}{!bench && <span className='text-xs text-muted-foreground'> vs market {c.mkt_logloss.toFixed(3)}</span>}
        </span>
      </div>
      <div className='grid grid-cols-4 gap-1.5'>
        {c.bins.map((b) => (
          <div key={b.lo} className={cn('rounded-xl bg-muted px-2 py-1.5 text-center', b.n < 10 && 'opacity-45')}>
            <div className='text-[11px] text-muted-foreground'>{b.n ? `said ${Math.round(b.said * 100)}%` : `${Math.round(b.lo * 100)}–${Math.round(b.hi * 100)}%`}</div>
            <div className='font-condensed text-base font-bold tabular-nums'>{b.n ? `${Math.round(b.won * 100)}%` : '—'}</div>
            <div className='text-[11px] text-muted-foreground'>{b.n} {b.n === 1 ? 'game' : 'games'}</div>
          </div>
        ))}
      </div>
    </li>
  )
}

function Champion({ slot, names }: { slot: Slot | undefined; names: Record<string, string> }) {
  if (!slot) return null
  const nm = (k: string) => names[k] ?? k
  return (
    <section className='rounded-2xl bg-accent p-4 text-sm leading-relaxed text-accent-foreground'>
      <p><b className='text-devig'>The app uses {nm(slot.champion)}</b> for this sport&apos;s picks.</p>
      {slot.trial && (
        <p className='mt-1'>On trial: {nm(slot.trial.challenger)} replaced {nm(slot.trial.previous)}; {slot.trial.games ?? 0} of {slot.trial.target} trial games graded. It stays only if it&apos;s more accurate and no worse on profit.</p>
      )}
      {!slot.trial && slot.hold && <p className='mt-1'>{slot.hold.replace(/[\w/.-]+\.(json|md),?\s*/g, '')}.</p>}
      {slot.challengers.map((c) => (
        <p key={c.id} className='mt-1 text-xs text-muted-foreground'>Challenger {nm(c.id)}: {c.games} of {c.needed} games needed before it can take over (it must be more accurate and no worse on profit).</p>
      ))}
    </section>
  )
}

export function Models() {
  const q = useModels()
  const [sport, setSport] = useState('NFL')
  const [bet, setBet] = useState<Bet>('ml')
  const r = q.data?.report
  const s = r?.sports?.[sport] ?? {}
  const rows = (s[bet] ?? []) as ModelRow[]
  const money = bet === 'ml' || bet === 'props'
  const calib = (bet === 'props' ? s.props_calib : s.calib) ?? []
  const close = s.close ?? []
  const names: Record<string, string> = { devig: 'DeVig', devig2: 'DeVig 2.0', market: "Kalshi's price (DeVig has no model here)" }
  ;(r?.models ?? []).forEach((m) => { names[m.key] ??= m.name })
  const since = r?.tracking_since ? new Date(r.tracking_since) : null

  return (
    <>
      <Header>
        <div className='me-auto min-w-0'>
          <h1 className='font-display text-[26px] leading-none font-black'>Models</h1>
          <p className='mt-0.5 truncate text-xs text-muted-foreground'>Graded on the same games, Kalshi as the baseline</p>
        </div>
        <ThemeSwitch />
      </Header>
      <Main className='flex flex-col gap-5'>
        <p className='rounded-2xl bg-card px-4 py-3 text-sm leading-relaxed'>
          DeVig&apos;s models next to open-source models other people publish, all graded here the same way. A comparison, not proof that any of them beats the market.
        </p>
        <div className='flex flex-col gap-2'>
          <div className='flex gap-2'>
            {SPORTS.map((x) => (
              <button key={x} type='button' aria-pressed={sport === x} onClick={() => setSport(x)}
                className={cn('h-9 rounded-full border px-4 text-sm font-medium text-muted-foreground', sport === x && 'border-foreground bg-foreground text-background')}>{x}</button>
            ))}
          </div>
          <div className='no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4'>
            {BETS.map(([k, label]) => (
              <button key={k} type='button' aria-pressed={bet === k} onClick={() => setBet(k)}
                className={cn('h-8 shrink-0 rounded-lg border px-3 text-sm text-muted-foreground', bet === k && 'border-foreground bg-foreground font-semibold text-background')}>{label}</button>
            ))}
          </div>
        </div>

        {q.isLoading ? <Skeleton className='h-72 w-full rounded-[18px]' /> : (
          <div className='grid gap-5 lg:grid-cols-2 lg:items-start'>
            <div className='flex flex-col gap-3'>
              <section aria-label='Record'>
                <h2 className='mb-2 px-1 font-display text-[22px] font-extrabold'>Record</h2>
                {rows.length ? (
                  <ul className='overflow-hidden rounded-[18px] bg-card'>{rows.map((m) => <Row key={m.key} m={m} money={money} dec={!money} />)}</ul>
                ) : <p className='rounded-[18px] border border-dashed p-6 text-center text-muted-foreground'>No model records yet.</p>}
                <p className='mt-2 px-1 text-xs leading-relaxed text-muted-foreground'>
                  Amber tick: the win rate the prices needed to break even. {NOTES[bet]} Pushes and ties don&apos;t count.
                  {since && bet !== 'props' ? ` Tracking since ${since.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}.` : ''}
                </p>
              </section>
              {bet === 'ml' && <Champion slot={q.data?.slots[`${sport}.ml`]} names={names} />}
            </div>

            <div className='flex flex-col gap-5'>
              {bet !== 'props' && close.length > 0 && (
                <section aria-label='Beat the closing line'>
                  <h2 className='mb-2 px-1 font-display text-[22px] font-extrabold'>Did the price move their way?</h2>
                  <ul className='overflow-hidden rounded-[18px] bg-card'>
                    {close.map((m) => {
                  const avg = m.avg == null ? null : Math.round(m.avg * 1000) / 10
                  return (
                      <li key={m.key} className='flex items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0'>
                        <span><span className='font-semibold'>{m.name}</span> <span className='text-xs text-muted-foreground'>{m.n ? `${m.beat} of ${m.n} moved toward it` : 'no picks yet'}</span></span>
                        <span className={cn('font-condensed text-lg font-bold tabular-nums', avg == null || avg === 0 ? 'text-muted-foreground' : avg > 0 ? 'text-good' : 'text-bad')}>
                          {avg == null ? '—' : `${avg > 0 ? '+' : avg < 0 ? '−' : ''}${Math.abs(avg).toFixed(1)} pts`}
                        </span>
                      </li>
                  )})}
                  </ul>
                  <p className='mt-2 px-1 text-xs leading-relaxed text-muted-foreground'>
                    Kalshi&apos;s price for the picked side when the pick was made, then its last price before the game. If prices keep moving toward a model&apos;s picks, that&apos;s the earliest sign of a real edge; win-loss records take hundreds of games.
                  </p>
                </section>
              )}
              <section aria-label='Do the percentages come true'>
                <h2 className='mb-2 px-1 font-display text-[22px] font-extrabold'>Do the percentages come true?</h2>
                {calib.length ? (
                  <ul className='overflow-hidden rounded-[18px] bg-card'>{calib.map((c) => <Calib key={c.key} c={c} />)}</ul>
                ) : <p className='rounded-[18px] border border-dashed p-6 text-center text-muted-foreground'>Nothing graded yet.</p>}
                <p className='mt-2 px-1 text-xs leading-relaxed text-muted-foreground'>
                  Of the games where a model said about 65%, how many did it win? An honest model&apos;s 65% wins about 65% of the time. The number by each name scores every chance against what happened (log loss: lower is better), next to the market&apos;s. Faded groups have under 10 games, too few to judge.
                </p>
              </section>
            </div>
          </div>
        )}

        {r?.models?.length ? (
          <section aria-label='Who made these models'>
            <h2 className='mb-2 px-1 font-display text-[22px] font-extrabold'>Who made these models</h2>
            <ul className='grid gap-2 lg:grid-cols-2'>
              {r.models.map((m) => (
                <li key={m.key} className='rounded-2xl bg-card px-4 py-3 text-sm'>
                  <div className='flex items-baseline justify-between gap-2'><b>{m.name}</b><span className='text-xs text-muted-foreground'>{m.sports.join(', ')}</span></div>
                  <div className='text-muted-foreground'>{m.author} · <a className='text-devig underline-offset-2 hover:underline' href={m.url} target='_blank' rel='noopener noreferrer'>{m.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 48)}</a></div>
                  <div className='mt-1 text-xs text-muted-foreground'>License: {m.license}. {m.note}</div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </Main>
    </>
  )
}
