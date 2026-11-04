import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { type GameRow } from '@/lib/devig'
import { type Level } from '@/lib/experience'
import { espnCode } from '@/lib/logos'
import { betLabel, narrativeFor, readFor, tally, useNarrative, type NarrativeLean } from '@/lib/narrative'
import { cn } from '@/lib/utils'

// The Narrative button at the bottom of a game's sheet: picks from a model that reads games the way the experts do
// (tired legs, bounce-back spots, key players out, what the line says), with its reasons. Not proven, and never
// DeVig's own pick. On a game it doesn't pick, it still says which way it leans and why.
const RESULT = { W: ['Won', 'bg-good/15 text-good'], L: ['Lost', 'bg-bad/15 text-bad'], P: ['Push', 'bg-muted text-muted-foreground'] } as const

export function NarrativeButton({ row, level }: { row: GameRow; level: Level }) {
  const f = useNarrative(row.sport).data
  const [open, setOpen] = useState(false)
  const picks = narrativeFor(f, row, espnCode)
  const read = readFor(f, row, espnCode)
  if (!f) return null
  const hasSide = picks.some((p) => p.type === 'side')
  const hasTotal = picks.some((p) => p.type === 'total')
  // leans that didn't clear the bar, shown next to the picks that did
  const leans = [
    !hasSide && read?.side ? { key: 'side', l: read.side, text: read.side.lean ? `Leans ${read.side.lean}` : 'Even on the side' } : null,
    !hasTotal && read?.total?.lean && level !== 'new'
      ? { key: 'total', l: read.total, text: `Total leans ${read.total.lean === 'OVER' ? 'Over' : 'Under'} ${read.total.line}` } : null,
  ].filter((x): x is { key: string; l: NarrativeLean; text: string } => !!x)
  const summary = picks.length ? picks.map((p) => betLabel(p, p.type === 'side' ? f.kind : 'spread')).join(' · ')
    : !read || read.note ? 'No read yet'
    : read?.side?.lean ? `Leans ${read.side.lean} · no pick` : 'No lean · no pick'

  const rec = tally(f.picks)
  const tw = f.tests.reduce((a, t) => a + t.w, 0)
  const tl = f.tests.reduce((a, t) => a + t.l, 0)
  const label = (p: (typeof picks)[number]) => betLabel(p, p.type === 'side' ? f.kind : 'spread')
  return (
    <div className='overflow-hidden rounded-2xl border'>
      <button type='button' aria-expanded={open} onClick={() => setOpen(!open)}
        className='flex h-12 w-full items-center gap-2 px-4 text-start hover:bg-muted/50'>
        <span className='font-semibold'>Narrative</span>
        <span className='truncate text-sm text-muted-foreground tabular-nums'>{summary}</span>
        <ChevronDown aria-hidden='true' className={cn('ms-auto size-4.5 shrink-0 transition-transform duration-150 motion-reduce:transition-none', open && 'rotate-180')} />
      </button>
      {open && (
        <div className='flex flex-col gap-3 border-t px-4 pt-3 pb-4'>
          <p className='text-sm text-muted-foreground'>
            How the experts would read this game. <b className='text-devig'>Not proven</b>, and not DeVig’s pick.
          </p>
          {picks.map((p) => {
            const [chip, tone] = p.result ? RESULT[p.result] : ['Pending', 'bg-muted text-muted-foreground']
            const reasons = level === 'new' ? p.why_for.slice(0, 2) : p.why_for
            return (
              <div key={p.type} className='flex flex-col gap-1.5'>
                <div className='flex items-baseline justify-between gap-3'>
                  <span className='font-condensed text-xl leading-tight font-bold tabular-nums'>{label(p)}</span>
                  <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-bold', tone)}>{chip}</span>
                </div>
                {level === 'new' && p.type === 'side' && f.kind === 'ml' && (
                  <p className='text-xs text-muted-foreground'>A bet on {p.pick} to win the game.</p>
                )}
                <ul className='flex flex-col gap-1 text-sm'>
                  {reasons.map((w) => <li key={w} className='flex gap-2'><span aria-hidden='true' className='text-good'>+</span><span>{w}</span></li>)}
                  {level !== 'new' && p.why_opp.map((w) => <li key={w} className='flex gap-2 text-muted-foreground'><span aria-hidden='true'>−</span><span>{w}</span></li>)}
                </ul>
                {level === 'numbers' && (
                  <p className='text-xs text-muted-foreground tabular-nums'>Reasons add up to {p.score.toFixed(1)}. It picks at 2.0 or more.</p>
                )}
              </div>
            )
          })}
          {!picks.length && (read?.note || !read) && (
            <p className='text-sm'>{read?.note ? `${read.note}.` : 'It reads every game on the board each hour, so this one is coming.'}</p>
          )}
          {!read?.note && leans.map(({ key, l, text }) => {
            const reasons = level === 'new' ? l.why_for.slice(0, 2) : l.why_for
            return (
              <div key={key} className='flex flex-col gap-1.5'>
                <div className='flex items-baseline justify-between gap-3'>
                  <span className='font-condensed text-xl leading-tight font-bold tabular-nums'>{text}</span>
                  <span className='shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground'>No pick</span>
                </div>
                <p className='text-xs text-muted-foreground'>
                  {l.capped ? 'It won’t lay a number this big, so it passes.'
                    : l.lean ? 'The reasons point this way, just not strongly enough to make it a pick.'
                    : 'Nothing in this game pushes the experts either way.'}
                </p>
                {reasons.length > 0 && (
                  <ul className='flex flex-col gap-1 text-sm'>
                    {reasons.map((w) => <li key={w} className='flex gap-2'><span aria-hidden='true' className='text-good'>+</span><span>{w}</span></li>)}
                    {level !== 'new' && (l.why_opp ?? []).map((w) => <li key={w} className='flex gap-2 text-muted-foreground'><span aria-hidden='true'>−</span><span>{w}</span></li>)}
                  </ul>
                )}
                {level === 'numbers' && l.lean && (
                  <p className='text-xs text-muted-foreground tabular-nums'>Reasons add up to {l.score.toFixed(1)}. It picks at 2.0 or more.</p>
                )}
              </div>
            )
          })}
          <p className='text-xs text-muted-foreground tabular-nums'>
            {rec.w + rec.l + rec.p ? `${row.sport} live record ${rec.w}–${rec.l}${rec.p ? `–${rec.p}` : ''}. ` : 'No live picks graded yet. '}
            {f.tested ? `Before going live it went ${tw}–${tl} on nights it had never seen.` : `New in ${row.sport}: not tested on past games yet.`}
          </p>
        </div>
      )}
    </div>
  )
}
