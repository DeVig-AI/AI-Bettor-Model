import { type GameRow, fmtAmerican } from '@/lib/devig'
import { useSlip } from '@/lib/parlay'
import { cn } from '@/lib/utils'
import { mlLeg } from '../parlay/legs'

// Tap a team's half of the plate to add that team to win to the parlay slip (tap again to take it out)
export function PlateTaps({ row }: { row: GameRow }) {
  const { toggle, has } = useSlip()
  return (
    <div className='absolute inset-0 grid grid-cols-2'>
      {(['away', 'home'] as const).map((side) => {
        const leg = mlLeg(row, side)
        if (!leg) return <span key={side} />
        const on = has(leg.id)
        return (
          <button
            key={side}
            type='button'
            aria-pressed={on}
            aria-label={`${on ? 'Remove' : 'Add'} ${leg.label} (${fmtAmerican(leg.odds)}) ${on ? 'from' : 'to'} parlay`}
            onClick={() => toggle(leg)}
            className={cn(
              'group relative rounded-[18px] transition-colors duration-150 hover:bg-white/5 focus-visible:outline-offset-[-3px]',
              side === 'away' ? 'rounded-e-none' : 'rounded-s-none'
            )}
          >
            {on && (
              <span className={cn('absolute top-2.5 rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-black', side === 'away' ? 'start-[42%]' : 'end-[42%]')}>
                In parlay
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

