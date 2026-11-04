import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { type GameRow } from '@/lib/devig'
import { espnCode } from '@/lib/logos'
import { betLabel, narrativeFor, tally, useNarrative } from '@/lib/narrative'
import { cn } from '@/lib/utils'

// The Narrative button at the bottom of an NBA game's sheet: picks from a model that reads games the way the
// experts do (tired legs, bounce-back spots, stars out, what the line says), with its reasons. Not proven, and
// never DeVig's own pick. Only shows when the model has a pick on this game.
const RESULT = { W: ['Won', 'bg-good/15 text-good'], L: ['Lost', 'bg-bad/15 text-bad'], P: ['Push', 'bg-muted text-muted-foreground'] } as const

export function NarrativeButton({ row }: { row: GameRow }) {
  const f = useNarrative().data
  const [open, setOpen] = useState(false)
  const picks = narrativeFor(f, row, espnCode)
  if (!picks.length) return null
  const rec = tally(f!.picks)
  return (
    <div className='overflow-hidden rounded-2xl border'>
      <button type='button' aria-expanded={open} onClick={() => setOpen(!open)}
        className='flex h-12 w-full items-center gap-2 px-4 text-start hover:bg-muted/50'>
        <span className='font-semibold'>Narrative</span>
        <span className='truncate text-sm text-muted-foreground tabular-nums'>{picks.map(betLabel).join(' · ')}</span>
        <ChevronDown aria-hidden='true' className={cn('ms-auto size-4.5 shrink-0 transition-transform duration-150 motion-reduce:transition-none', open && 'rotate-180')} />
      </button>
      {open && (
        <div className='flex flex-col gap-3 border-t px-4 pt-3 pb-4'>
          <p className='text-sm text-muted-foreground'>
            How the experts would read this game. <b className='text-devig'>Not proven</b>, and not DeVig’s pick.
          </p>
          {picks.map((p) => {
            const [label, tone] = p.result ? RESULT[p.result] : ['Pending', 'bg-muted text-muted-foreground']
            return (
              <div key={p.type} className='flex flex-col gap-1.5'>
                <div className='flex items-baseline justify-between gap-3'>
                  <span className='font-condensed text-xl leading-tight font-bold tabular-nums'>{betLabel(p)}</span>
                  <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-bold', tone)}>{label}</span>
                </div>
                <ul className='flex flex-col gap-1 text-sm'>
                  {p.why_for.map((w) => <li key={w} className='flex gap-2'><span aria-hidden='true' className='text-good'>+</span><span>{w}</span></li>)}
                  {p.why_opp.map((w) => <li key={w} className='flex gap-2 text-muted-foreground'><span aria-hidden='true'>−</span><span>{w}</span></li>)}
                </ul>
              </div>
            )
          })}
          <p className='text-xs text-muted-foreground tabular-nums'>
            {rec.w + rec.l + rec.p ? `Live record ${rec.w}–${rec.l}${rec.p ? `–${rec.p}` : ''}. ` : 'No live picks graded yet. '}
            Before going live it went {f!.tests.reduce((a, t) => a + t.w, 0)}–{f!.tests.reduce((a, t) => a + t.l, 0)} on nights it had never seen.
          </p>
        </div>
      )}
    </div>
  )
}
