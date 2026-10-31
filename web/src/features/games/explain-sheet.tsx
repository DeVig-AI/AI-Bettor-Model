import { type Level } from '@/lib/experience'
import {
  type GameRow,
  type SideInputs,
  type SportRecord,
  fmtAmerican,
  fmtPct,
  impliedProb,
} from '@/lib/devig'
import { cn } from '@/lib/utils'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

// "Why?": DeVig explains one pick from the model's real locked inputs and the real prices, at the reader's level.
// The numbers are the same at every level; only how much is said changes. The model stores its inputs, not how much
// each one moved the number, so this says what the model looked at and which side each input favors, never more.

const LEVELS: { id: Level; label: string }[] = [
  { id: 'new', label: 'New to this' },
  { id: 'sometimes', label: 'Sometimes' },
  { id: 'numbers', label: 'Numbers' },
]

const lockFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const one = (x: number) => (Math.round(x * 10) / 10).toFixed(1)
const signed = (x: number) => (x >= 0 ? '+' : '−') + one(Math.abs(x))

type Factor = { title: string; detail: string; favors: string | null; plain: string }

function factors(row: GameRow, side: string): Factor[] {
  const inp = row.pick?.inputs
  if (!inp) return []
  const a: SideInputs = inp.away
  const h: SideInputs = inp.home
  const other = side === row.home ? row.away : row.home
  const mine = side === row.home ? h : a
  const theirs = side === row.home ? a : h
  const nameOf = (code: string) => (code === row.home ? row.homeName : row.awayName)
  const out: Factor[] = []
  if (a.winpct_last10 != null && h.winpct_last10 != null) {
    const wA = Math.round(a.winpct_last10 * 10)
    const wH = Math.round(h.winpct_last10 * 10)
    out.push({
      title: 'Last 10 games',
      detail: `${row.away} ${wA}–${10 - wA}, ${row.home} ${wH}–${10 - wH}`,
      favors: wA === wH ? null : wA > wH ? row.away : row.home,
      plain: '',
    })
  }
  if (a.ppg_last10 != null && a.papg_last10 != null && h.ppg_last10 != null && h.papg_last10 != null) {
    const mA = a.ppg_last10 - a.papg_last10
    const mH = h.ppg_last10 - h.papg_last10
    out.push({
      title: 'Point margin, last 10',
      detail: `${row.away} ${signed(mA)} a game, ${row.home} ${signed(mH)}`,
      favors: Math.abs(mA - mH) < 0.5 ? null : mA > mH ? row.away : row.home,
      plain: '',
    })
  }
  const b2bA = !!a.back_to_back
  const b2bH = !!h.back_to_back
  if (a.rest_days != null && h.rest_days != null) {
    const restTxt = (code: string, s: SideInputs) =>
      s.back_to_back ? `${code} on a back-to-back` : `${code} ${one(s.rest_days ?? 0).replace('.0', '')} day${s.rest_days === 1 ? '' : 's'} off`
    out.push({
      title: 'Rest',
      detail: `${restTxt(row.away, a)}, ${restTxt(row.home, h)}`,
      favors:
        b2bA !== b2bH ? (b2bA ? row.home : row.away) : a.rest_days === h.rest_days ? null : a.rest_days > h.rest_days ? row.away : row.home,
      plain: '',
    })
  }
  // plain-English versions, written from the picked side's point of view
  for (const f of out) {
    if (f.title === 'Last 10 games' && mine.winpct_last10 != null && theirs.winpct_last10 != null) {
      const w = Math.round(mine.winpct_last10 * 10)
      const wo = Math.round(theirs.winpct_last10 * 10)
      f.plain = `${nameOf(side)} won ${w} of its last 10 games; ${nameOf(other)} won ${wo}.`
    }
    if (f.title === 'Point margin, last 10' && mine.ppg_last10 != null && mine.papg_last10 != null && theirs.ppg_last10 != null && theirs.papg_last10 != null) {
      const m = mine.ppg_last10 - mine.papg_last10
      const mo = theirs.ppg_last10 - theirs.papg_last10
      const say = (x: number) => (x >= 0 ? `winning by about ${Math.round(x)}` : `losing by about ${Math.round(-x)}`)
      f.plain = `Over those games ${nameOf(side)} has been ${say(m)} points a game; ${nameOf(other)} ${say(mo)}.`
    }
    if (f.title === 'Rest') {
      if (mine.back_to_back && !theirs.back_to_back) f.plain = `One thing against ${nameOf(side)}: it played last night, so it's on tired legs.`
      else if (theirs.back_to_back && !mine.back_to_back) f.plain = `${nameOf(other)} played last night, which helps ${nameOf(side)}.`
      else f.plain = 'Neither team has a rest advantage.'
    }
  }
  return out
}

export function ExplainSheet({
  row,
  open,
  onOpenChange,
  level,
  onLevel,
  record,
}: {
  row: GameRow | null
  open: boolean
  onOpenChange: (v: boolean) => void
  level: Level
  onLevel: (l: Level) => void
  record: SportRecord | null
}) {
  const p = row?.pick
  if (!row || !p?.side || p.prob == null) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side='bottom' className='rounded-t-3xl'>
          <SheetHeader>
            <SheetTitle>No pick here</SheetTitle>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    )
  }
  const side = p.side
  const sideName = side === row.home ? row.homeName : row.awayName
  const odds = side === row.home ? row.ml?.home : row.ml?.away
  const fairNow = row.fairHome == null ? null : side === row.home ? row.fairHome : 1 - row.fairHome
  const breakEven = impliedProb(odds ?? null) // Kalshi prices here include its fee, so this is what you really need
  const edgeNow = fairNow == null ? null : p.prob - fairNow
  const edgeLock = p.fairAtLock == null ? null : p.prob - p.fairAtLock
  const value = breakEven != null && p.prob > breakEven
  const fs = factors(row, side)
  const live = row.state === 'in'
  const done = row.state === 'post'
  const recTxt = record
    ? `${record.sport} model this season: ${record.won}–${record.lost}, ${record.units >= 0 ? '+' : '−'}${Math.abs(record.units).toFixed(2)} u at locked prices (before fee).`
    : null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side='bottom'
        className='max-h-[88svh] overflow-y-auto rounded-t-3xl border-t px-5 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:mx-auto md:max-w-xl'
      >
        <div aria-hidden='true' className='mx-auto h-1.5 w-10 rounded-full bg-border' />
        <SheetHeader className='p-0 text-start'>
          <SheetTitle className='font-display text-3xl font-black'>
            {level === 'numbers' ? 'The numbers' : `Why ${sideName}?`}
          </SheetTitle>
          <SheetDescription className='sr-only'>DeVig&apos;s reasoning for this pick</SheetDescription>
        </SheetHeader>

        <div role='radiogroup' aria-label='How much to explain' className='grid grid-cols-3 gap-1 rounded-xl bg-muted p-1'>
          {LEVELS.map((l) => (
            <button
              key={l.id}
              type='button'
              role='radio'
              aria-checked={level === l.id}
              onClick={() => onLevel(l.id)}
              className={cn(
                'h-9 rounded-lg text-sm font-medium text-muted-foreground transition-colors duration-150',
                level === l.id && 'bg-foreground font-semibold text-background'
              )}
            >
              {l.label}
            </button>
          ))}
        </div>

        {(live || done) && (
          <p className='rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground'>
            {done
              ? 'This game is over. The explanation is what DeVig saw before it started.'
              : "The game is on, so Kalshi's price is a live price and DeVig's pregame number is getting old."}
          </p>
        )}

        {level === 'new' && (
          <div className='flex flex-col gap-4'>
            <p className='text-lg leading-snug font-semibold'>
              DeVig thinks {sideName} wins about{' '}
              <span className='text-devig'>{Math.round(p.prob * 10)} times out of 10</span> ({fmtPct(p.prob)}).
            </p>
            {fs.length ? (
              <ul className='flex flex-col gap-3'>
                {fs.map((f) => (
                  <li key={f.title} className='text-[15px] leading-relaxed'>
                    {f.plain}
                  </li>
                ))}
              </ul>
            ) : (
              <p className='text-[15px] leading-relaxed text-muted-foreground'>
                This model doesn&apos;t publish what it looked at yet, so DeVig can only show its chance and the price.
              </p>
            )}
            {fairNow != null && (
              <div className='rounded-2xl bg-muted p-3.5'>
                <p className='font-semibold'>What the price says</p>
                <p className='mt-1 text-sm leading-relaxed text-muted-foreground'>
                  Kalshi&apos;s price gives {sideName} {fmtPct(fairNow)}.{' '}
                  {Math.abs(edgeNow ?? 0) < 0.01
                    ? "That's about what DeVig thinks too."
                    : (edgeNow ?? 0) < 0
                      ? `That's more than DeVig's ${fmtPct(p.prob)}, so a bet on ${sideName} here pays less than DeVig thinks it should.`
                      : `That's less than DeVig's ${fmtPct(p.prob)}, so DeVig thinks the price is generous.`}
                </p>
              </div>
            )}
            <p className={cn('font-semibold', value ? 'text-good' : 'text-devig')}>
              {value
                ? `Bottom line: DeVig thinks ${sideName} wins more often than this price needs.`
                : `Bottom line: DeVig expects ${sideName} to win, but the price is too high to call it a good bet.`}
            </p>
            <p className='text-xs text-muted-foreground'>A paper pick, locked before the game. Nothing is bet.</p>
          </div>
        )}

        {level === 'sometimes' && (
          <div className='flex flex-col gap-4'>
            <div className='flex items-baseline justify-between'>
              <span className='font-display text-3xl font-black text-devig'>DeVig {fmtPct(p.prob)}</span>
              {fairNow != null && <span className='font-display text-2xl font-extrabold'>Kalshi {fmtPct(fairNow)}{live ? ' live' : ' now'}</span>}
            </div>
            {fs.length > 0 && (
              <div>
                <h3 className='mb-2 text-sm font-semibold text-muted-foreground'>What the model looked at</h3>
                <ul className='flex flex-col gap-1.5'>
                  {fs.map((f) => (
                    <li key={f.title} className='flex items-center justify-between gap-3 rounded-xl bg-muted px-3 py-2.5'>
                      <span>
                        <span className='font-semibold'>{f.title}</span>
                        <br />
                        <span className='text-sm text-muted-foreground'>{f.detail}</span>
                      </span>
                      <span
                        className='shrink-0 rounded-full px-2.5 py-1 text-xs font-bold text-white'
                        style={{ background: f.favors ? (f.favors === row.home ? row.colors?.home : row.colors?.away) || 'var(--side-home)' : 'var(--muted)' }}
                      >
                        {f.favors ? `Favors ${f.favors}` : 'Even'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {edgeLock != null && edgeNow != null && (
              <div className='rounded-2xl bg-muted p-3.5'>
                <p className='font-semibold'>{Math.sign(edgeLock) !== Math.sign(edgeNow) ? 'The price moved past it' : 'How the price moved'}</p>
                <p className='mt-1 text-sm leading-relaxed text-muted-foreground'>
                  When DeVig locked this pick{p.lockedAt ? ` (${lockFmt.format(new Date(p.lockedAt))})` : ''}, Kalshi had{' '}
                  {side} at {fmtPct(p.fairAtLock)}, so DeVig was {Math.abs(edgeLock * 100).toFixed(1)} points{' '}
                  {edgeLock >= 0 ? 'higher' : 'lower'}. {live ? 'Live' : 'Now'} it&apos;s {fmtPct(fairNow)}
                  {odds != null ? `, ${fmtAmerican(odds)}` : ''}.
                </p>
              </div>
            )}
            {breakEven != null && (
              <p className={cn('font-semibold', value ? 'text-good' : 'text-bad')}>
                At {fmtAmerican(odds)} you need {fmtPct(breakEven)} to break even. DeVig says {fmtPct(p.prob)}:{' '}
                {value ? 'worth it at this price.' : 'skip at this price.'}
              </p>
            )}
            {recTxt && <p className='text-xs text-muted-foreground'>{recTxt}</p>}
          </div>
        )}

        {level === 'numbers' && (
          <div className='flex flex-col gap-4 font-condensed tabular-nums'>
            {p.inputs ? (
              <table className='w-full border-collapse text-sm'>
                <caption className='pb-1 text-start font-sans text-xs font-semibold text-muted-foreground'>
                  Model inputs ({p.inputs.model_version})
                </caption>
                <thead>
                  <tr className='text-xs text-muted-foreground'>
                    <th scope='col' className='py-1 text-start font-semibold'>Last 10 games</th>
                    <th scope='col' className='text-end font-bold text-foreground'>{row.away}</th>
                    <th scope='col' className='text-end font-bold text-foreground'>{row.home}</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ['Points for', 'ppg_last10', (v: number) => one(v)],
                      ['Points against', 'papg_last10', (v: number) => one(v)],
                      ['Win rate', 'winpct_last10', (v: number) => v.toFixed(3).replace(/^0/, '')],
                      ['Rest days', 'rest_days', (v: number) => String(Math.round(v))],
                    ] as const
                  ).map(([label, k, f]) => (
                    <tr key={k} className='border-t'>
                      <td className='py-1.5'>{label}</td>
                      <td className='text-end'>{p.inputs!.away[k] == null ? '—' : f(p.inputs!.away[k] as number)}</td>
                      <td className='text-end'>{p.inputs!.home[k] == null ? '—' : f(p.inputs!.home[k] as number)}</td>
                    </tr>
                  ))}
                  <tr className='border-t'>
                    <td className='py-1.5'>Back-to-back</td>
                    <td className='text-end'>{p.inputs.away.back_to_back ? 'Yes' : 'No'}</td>
                    <td className='text-end'>{p.inputs.home.back_to_back ? 'Yes' : 'No'}</td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <p className='font-sans text-sm text-muted-foreground'>This model&apos;s inputs aren&apos;t published yet.</p>
            )}
            <div className='grid grid-cols-3 gap-1.5'>
              <Box label={`Model ${side}`} value={fmtPct(p.prob, 1)} amber />
              <Box label='Kalshi at lock' value={fmtPct(p.fairAtLock, 1)} sub={p.lockedOdds != null ? fmtAmerican(p.lockedOdds) : undefined} />
              <Box label={live ? 'Kalshi live' : 'Kalshi now'} value={fmtPct(fairNow, 1)} sub={odds != null ? fmtAmerican(odds) : undefined} />
            </div>
            <dl className='grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm'>
              <dt className='text-muted-foreground'>Edge at lock</dt>
              <dd className={cn('text-end font-semibold', (edgeLock ?? 0) >= 0 ? 'text-good' : 'text-bad')}>
                {edgeLock == null ? '—' : `${signed(edgeLock * 100)} pts`}
              </dd>
              <dt className='text-muted-foreground'>Edge {live ? 'live' : 'now'}</dt>
              <dd className={cn('text-end font-semibold', (edgeNow ?? 0) >= 0 ? 'text-good' : 'text-bad')}>
                {edgeNow == null ? '—' : `${signed(edgeNow * 100)} pts`}
              </dd>
              <dt className='text-muted-foreground'>Break-even at {fmtAmerican(odds)}</dt>
              <dd className='text-end font-semibold'>{fmtPct(breakEven, 1)}</dd>
              <dt className='text-muted-foreground'>Locked</dt>
              <dd className='text-end'>{p.lockedAt ? lockFmt.format(new Date(p.lockedAt)) : '—'}</dd>
              {record && (
                <>
                  <dt className='text-muted-foreground'>Season record</dt>
                  <dd className='text-end'>
                    {record.won}–{record.lost}, {record.units >= 0 ? '+' : '−'}{Math.abs(record.units).toFixed(2)} u
                  </dd>
                </>
              )}
            </dl>
            <p className='font-sans text-xs leading-relaxed text-muted-foreground'>
              Fair chance splits Kalshi&apos;s two prices in proportion. Break-even uses Kalshi&apos;s price with its fee.
              Units at the locked price, before fee. Not proven to beat market prices.
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Box({ label, value, sub, amber }: { label: string; value: string; sub?: string; amber?: boolean }) {
  return (
    <div className='rounded-xl bg-muted px-2.5 py-2'>
      <div className='font-sans text-[11px] text-muted-foreground'>{label}</div>
      <div className={cn('text-lg font-bold', amber && 'text-devig')}>{value}</div>
      {sub && <div className='text-[11px] text-muted-foreground'>{sub}</div>}
    </div>
  )
}
