// The ladder inside a prop's sheet: every line Kalshi offers for this player and stat, on the side being viewed,
// easiest first. Marks the parlay-safe rung, rungs a safer rung beats on price, and crossed pairs. Every rung can go
// straight into the parlay. Past hit rates are descriptive (stats/props_ladder.json); nothing here claims an edge.
import type { ReactNode } from 'react'
import { Check, Plus } from 'lucide-react'
import { fmtAmerican, fmtPct } from '@/lib/devig'
import { type Rung, pastHit, useLadder, useLadderHistory } from '@/lib/ladder'
import { slipMath, useSlip } from '@/lib/parlay'
import { type PropLine, overTxt, priceToAmerican, propSide, underTxt } from '@/lib/props'
import { cn } from '@/lib/utils'
import { propLeg } from '../parlay/legs'
import { cents, inTen, sideShort } from './words'

type Level = 'new' | 'sometimes' | 'numbers'

const label = (r: Rung, lv: Level) =>
  lv === 'new' ? sideShort(r.l.stat, r.l.line, r.side === 'over') : r.side === 'over' ? overTxt(r.l.stat, r.l.line) : underTxt(r.l.stat, r.l.line)

export function Ladder({ l, side, lv, open }: { l: PropLine; side: 'over' | 'under'; lv: Level; open: boolean }) {
  const rungs = useLadder(l, side, open)
  const hist = useLadderHistory()
  const { toggle, has, legs } = useSlip()
  const upcoming = Date.parse(l.kickoff) > Date.now()
  if (rungs.length < 2) return null
  const nums = lv === 'numbers'
  const last = l.player.split(' ').slice(-1)[0]
  const cross = rungs.find((r) => r.crossed)

  // how far off Kalshi's price was on past games, this side, all prices together (cents per $1 paid)
  const t = hist?.sports[l.sport]?.table[side]?.all
  const tot = t ? Object.values(t).reduce((a, c) => ({ n: a.n + c.n, off: a.off + (c.paid - c.hit) * c.n }), { n: 0, off: 0 }) : null
  const off = tot && tot.n ? tot.off / tot.n : null

  return (
    <section className='flex flex-col gap-2' aria-labelledby='ladder-h'>
      <h3 id='ladder-h' className='text-sm font-semibold'>
        {lv === 'new' ? `Other lines for ${last}` : nums ? 'Ladder' : `Every ${side === 'over' ? 'Over' : 'Under'} line for ${last}`}
      </h3>
      {lv === 'new' && (
        <p className='text-sm leading-relaxed text-muted-foreground'>
          Kalshi sells more than one line. An easier line wins more often but pays less. In a parlay, a leg that wins
          7 or more times in 10 rarely breaks it, so DeVig marks one as the safer leg.
        </p>
      )}
      <ul className='flex flex-col overflow-hidden rounded-2xl bg-muted/50'>
        {rungs.map((r) => {
          const leg = upcoming ? propLeg(r.l, side, null) : null
          const on = leg ? has(leg.id) : false
          const odds = priceToAmerican(r.cost)
          const past = pastHit(hist, l.sport, side, l.stat, r.price)
          return (
            <li key={r.l.key} className={cn('flex items-center gap-3 border-b border-background/60 px-3 py-2.5 last:border-b-0', r.current && 'bg-muted')}>
              <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
                <div className='flex flex-wrap items-baseline gap-x-2'>
                  <span className={cn('font-semibold tabular-nums', r.skip && 'text-muted-foreground line-through decoration-1')}>{label(r, lv)}</span>
                  <span className='font-condensed text-sm text-muted-foreground tabular-nums'>
                    {lv === 'new' ? inTen(r.chance) : `Kalshi ${nums ? (r.chance * 100).toFixed(1) + '%' : fmtPct(r.chance)}`}
                    {r.model != null && lv !== 'new' && <> · <span className='text-devig'>DeVig {nums ? (r.model * 100).toFixed(1) + '%' : fmtPct(r.model)}</span></>}
                  </span>
                </div>
                <div className='flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground'>
                  {r.current && <Tag>This one</Tag>}
                  {r.safe && <Tag tone='good'>Safer parlay leg</Tag>}
                  {r.skip && <Tag tone='bad'>Skip: {label(r.skip, lv)} costs the same or less</Tag>}
                  {past && !r.skip && (
                    <span className='tabular-nums'>
                      {nums
                        ? `Past: paid ${(past.paid * 100).toFixed(1)}¢, hit ${(past.hit * 100).toFixed(1)}% (n ${past.n.toLocaleString()})`
                        : lv === 'new'
                          ? `Past bets at this price won ${inTen(past.hit)}`
                          : `Past bets at this price won ${fmtPct(past.hit)}`}
                    </span>
                  )}
                </div>
              </div>
              {leg ? (
                <button type='button' aria-pressed={on} onClick={() => toggle(leg)}
                  aria-label={on ? `Remove ${label(r, 'sometimes')} from parlay` : `Add ${label(r, 'sometimes')} to parlay`}
                  className={cn('flex h-9 shrink-0 items-center gap-1 rounded-full border px-3 text-sm font-semibold tabular-nums transition-colors duration-150',
                    on ? 'border-foreground bg-foreground text-background' : 'hover:bg-background')}>
                  {on ? <Check className='size-4' aria-hidden='true' /> : <Plus className='size-4' aria-hidden='true' />}
                  {fmtAmerican(odds == null ? null : Math.round(odds))}
                </button>
              ) : (
                <span className='shrink-0 font-condensed text-sm tabular-nums'>{fmtAmerican(odds == null ? null : Math.round(odds))}</span>
              )}
            </li>
          )
        })}
      </ul>

      {legs.length > 1 && (() => {
        const m = slipMath(legs)
        return (
          <p className='rounded-xl bg-muted px-3 py-2 text-sm tabular-nums'>
            <span className='font-semibold'>Your parlay: </span>
            {legs.length} legs, pays {fmtAmerican(Math.round(m.american))}
            {m.market != null && (lv === 'new' ? `, hits about 1 in ${Math.max(1, Math.round(1 / m.market))} by Kalshi's prices` : ` · Kalshi ${fmtPct(m.market, m.market < 0.1 ? 1 : 0)}`)}
            {m.devig != null && lv !== 'new' && <span className='text-devig'> · DeVig {fmtPct(m.devig, m.devig < 0.1 ? 1 : 0)}</span>}
          </p>
        )
      })()}

      {cross?.crossed && (
        <p className='rounded-xl border border-good/40 bg-good/10 p-3 text-sm leading-relaxed'>
          <span className='font-semibold'>Ladder mistake right now: </span>
          {overTxt(l.stat, cross.l.line)} at {cents(cross.cost)} plus {underTxt(l.stat, cross.crossed.l.line)} at{' '}
          {cents(propSide(cross.crossed.l, 'under')?.cost ?? 1)} costs
          less than $1 together, fees in, and one of them always pays $1 (both do if {last} lands right between). Prices move
          fast and these rungs are often thin, so it may be gone before you get filled.
        </p>
      )}

      {off != null && (
        <p className='text-xs leading-relaxed text-muted-foreground'>
          {lv === 'new'
            ? `On past ${l.sport} games, ${side === 'over' ? 'Overs' : 'Unders'} won ${off <= 0.02 ? "about as often as Kalshi's price said, so you mostly pay just the fee" : "a little less often than Kalshi's price said"}. A safer line costs more for each win; it's peace of mind for a parlay, not a bargain.`
            : `Past ${l.sport} ${side === 'over' ? 'Overs' : 'Unders'} (${hist!.sports[l.sport].seasons.join(', ')}): paid about ${(off * 100).toFixed(1)}¢ more per $1 than they won back, fee in. Safer rungs aren't cheaper; DeVig marks the hardest one both it and Kalshi give 70%+.`}
        </p>
      )}
    </section>
  )
}

function Tag({ children, tone }: { children: ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <span className={cn('rounded-full border px-2 py-px text-[11px] font-semibold',
      tone === 'good' ? 'border-good/50 text-good' : tone === 'bad' ? 'border-bad/50 text-bad' : 'border-foreground/30 text-foreground')}>
      {children}
    </span>
  )
}
