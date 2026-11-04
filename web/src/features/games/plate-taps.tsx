import { useState } from 'react'
import { useMatchRoute, useNavigate } from '@tanstack/react-router'
import { type GameRow } from '@/lib/devig'
import { useSlip } from '@/lib/parlay'
import { cn } from '@/lib/utils'
import { mlLeg } from '../parlay/legs'
import { type Side, TeamSheet } from './team-sheet'

// Tap a team's half of the plate to see why DeVig gives it the chance it does (the sheet also adds it to the parlay).
// Once the game has started, a tap goes straight to the game's page instead (on that page, it still opens the sheet).
export function PlateTaps({ row }: { row: GameRow }) {
  const { has } = useSlip()
  const [open, setOpen] = useState(false)
  const [side, setSide] = useState<Side>('home')
  const navigate = useNavigate()
  const matchRoute = useMatchRoute()
  const toGame = row.state !== 'pre' && !matchRoute({ to: '/game/$id', params: { id: row.id } })
  return (
    <>
      <div className='absolute inset-0 grid grid-cols-2'>
        {(['away', 'home'] as const).map((s) => {
          const leg = row.state === 'pre' ? mlLeg(row, s) : null
          const on = leg ? has(leg.id) : false
          const code = s === 'home' ? row.home : row.away
          return (
            <button
              key={s}
              type='button'
              aria-haspopup={toGame ? undefined : 'dialog'}
              aria-label={toGame ? `${row.away} at ${row.home} game page` : `Why ${code}${on ? ' (in your parlay)' : ''}`}
              onClick={() => {
                if (toGame) return void navigate({ to: '/game/$id', params: { id: row.id } })
                setSide(s)
                setOpen(true)
              }}
              className={cn(
                'group relative rounded-[18px] transition-colors duration-150 hover:bg-white/5 focus-visible:outline-offset-[-3px]',
                s === 'away' ? 'rounded-e-none' : 'rounded-s-none'
              )}
            >
              {on && (
                <span className={cn('absolute top-2.5 rounded-full bg-white px-2 py-0.5 text-[11px] font-bold whitespace-nowrap text-black shadow-sm', s === 'away' ? 'end-2' : 'start-2')}>
                  {code} in parlay
                </span>
              )}
            </button>
          )
        })}
      </div>
      <TeamSheet row={row} side={side} onSide={setSide} open={open} onOpenChange={setOpen} />
    </>
  )
}
