// Under a prop leg on the parlay: the safer line on the same player's ladder (the hardest rung both DeVig and Kalshi
// give 70%+), what swapping to it does to the whole ticket's chance and payout, and a Swap button. Shown only when
// that line is easier than the leg on the slip. A safer line costs more per win; the text says so.
import { buildLadder } from '@/lib/ladder'
import { type Leg, slipMath, useSlip } from '@/lib/parlay'
import { overTxt, underTxt, useProps } from '@/lib/props'
import { fmtAmerican, fmtPct } from '@/lib/devig'
import { propLeg } from './legs'

const oneIn = (p: number) => (p > 0 ? Math.round(1 / p).toLocaleString() : '—')

export function SaferSwap({ leg }: { leg: Leg }) {
  const { lines } = useProps()
  const { legs, replace } = useSlip()
  if (leg.kind !== 'prop' || Date.parse(leg.kickoff) <= Date.now()) return null
  const side = leg.id.endsWith('|under') ? 'under' : 'over'
  const key = leg.id.slice(0, -(side.length + 1))
  const cur = lines.find((x) => x.key === key)
  if (!cur) return null
  const rungs = buildLadder(lines, cur, side, {})
  const safe = rungs.find((r) => r.safe)
  const here = rungs.findIndex((r) => r.current)
  if (!safe || safe.current || rungs.indexOf(safe) > here) return null // only point to an easier line
  const next = propLeg(safe.l, side, null)
  if (!next || legs.some((l) => l.id === next.id)) return null
  const swapped = legs.map((l) => (l.id === leg.id ? next : l))
  const a = slipMath(legs)
  const b = slipMath(swapped)
  if (a.market == null || b.market == null) return null
  const txt = side === 'over' ? overTxt(safe.l.stat, safe.l.line) : underTxt(safe.l.stat, safe.l.line)
  return (
    <div className='flex items-center gap-3 rounded-xl border border-good/30 bg-good/5 px-3 py-2.5'>
      <p className='min-w-0 flex-1 text-sm leading-snug'>
        <span className='font-semibold text-good'>Safer line: {txt}</span>{' '}
        <span className='text-muted-foreground'>
          ({fmtPct(safe.chance)} by Kalshi{safe.model != null ? `, DeVig ${fmtPct(safe.model)}` : ''}). Ticket hits about 1 in{' '}
          {oneIn(a.market)} → 1 in {oneIn(b.market)}, pays {fmtAmerican(a.american)} → {fmtAmerican(b.american)}.
        </span>
      </p>
      <button type='button' onClick={() => replace(swapped)}
        className='h-9 shrink-0 rounded-full border border-good/50 px-4 text-sm font-semibold text-good hover:bg-good/10'>
        Swap
      </button>
    </div>
  )
}
