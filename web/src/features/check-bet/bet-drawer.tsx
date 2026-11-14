import { type ReactNode, Fragment, createContext, useContext, useState } from 'react'
import { Check, ChevronDown, Clock, Minus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'

// A tracked bet opens in a bottom drawer built for following it live: how far along it is up top, then one short row
// per leg (how it's doing right now). Tap a leg for its breakdown; the rest (grade, chart, lessons, stake) sits below.

const InDrawer = createContext(false)
export const useInDrawer = () => useContext(InDrawer)

// one part of a bet. Outside a drawer (a friend's page, a fresh check) it just shows, as before
export function Fold({ title, peek, tone, children }: { title: string; peek?: ReactNode; tone?: string; children: ReactNode }) {
  const inDrawer = useInDrawer()
  const [open, setOpen] = useState(false)
  if (!inDrawer) return <>{children}</>
  return (
    <section className={cn('overflow-hidden rounded-2xl bg-card', open && 'ring-1 ring-border')}>
      <button type='button' aria-expanded={open} onClick={() => setOpen(!open)}
        className='flex min-h-13 w-full items-center gap-3 px-4 py-3 text-start active:bg-muted/50'>
        <span className='min-w-0 flex-1 font-semibold'>{title}</span>
        {peek != null && <span className={cn('max-w-[55%] truncate text-sm tabular-nums text-muted-foreground', tone)}>{peek}</span>}
        <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none', open && 'rotate-180')} aria-hidden='true' />
      </button>
      {open && <div className='flex flex-col gap-3 border-t px-2 pt-2 pb-3 [&>*]:bg-transparent'>{children}</div>}
    </section>
  )
}

export function BetDrawer({ open, onClose, title, sub, head, children }: {
  open: boolean; onClose: () => void; title: string; sub?: ReactNode; head?: ReactNode; children: ReactNode
}) {
  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent side='bottom' onOpenAutoFocus={(e) => e.preventDefault()}
        className='max-h-[92svh] gap-0 overflow-y-auto rounded-t-3xl border-t p-0 md:mx-auto md:max-w-xl [&>button:last-child]:top-4 [&>button:last-child]:grid [&>button:last-child]:size-9 [&>button:last-child]:place-items-center [&>button:last-child]:rounded-full [&>button:last-child]:bg-muted [&>button:last-child]:opacity-100'>
        <div className='flex flex-col gap-3 px-5 pt-6 pb-3'>
          <span aria-hidden='true' className='absolute top-2 left-1/2 h-1.5 w-10 -translate-x-1/2 rounded-full bg-muted-foreground/30' />
          <div className='min-w-0 pe-10'>
            <SheetTitle className='truncate font-display text-[22px] leading-tight font-black'>{title}</SheetTitle>
            {sub ? <SheetDescription asChild><div className='mt-0.5 text-sm text-muted-foreground'>{sub}</div></SheetDescription> : <SheetDescription className='sr-only'>Your bet</SheetDescription>}
          </div>
          {head}
        </div>
        <div className='flex flex-col gap-2 px-4 pb-8'>
          <InDrawer.Provider value>{children}</InDrawer.Provider>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ---------- following a bet: progress, then the legs ----------
export type Seg = 'won' | 'lost' | 'live' | 'later' | 'push'
const SEG_ORDER: Record<Seg, number> = { won: 0, push: 1, lost: 2, live: 3, later: 4 }
const SEG_BG: Record<Seg, string> = { won: 'bg-good', push: 'bg-muted-foreground/50', lost: 'bg-bad', live: 'bg-devig motion-safe:animate-pulse', later: 'bg-muted' }

// "6 of 10 hit", a bar that fills from the left as legs hit, and what's still going
export function Progress({ segs, side }: { segs: Seg[]; side?: ReactNode }) {
  const n = segs.length
  const c = (k: Seg) => segs.filter((s) => s === k).length
  const won = c('won'), lost = c('lost'), live = c('live'), later = c('later'), push = c('push')
  const bits = [
    live && { t: `${live} live`, dot: 'bg-devig' },
    later && { t: `${later} not started`, dot: 'bg-muted-foreground/40' },
    lost && { t: `${lost} missed`, dot: 'bg-bad' },
    push && { t: `${push} pushed`, dot: 'bg-muted-foreground/60' },
  ].filter(Boolean) as { t: string; dot: string }[]
  return (
    <section aria-label='Progress' className='flex flex-col gap-2.5 rounded-2xl bg-card px-4 py-3.5'>
      <div className='flex items-end justify-between gap-3'>
        <p className='font-display leading-none font-black tabular-nums'>
          <span className={cn('text-4xl', lost ? 'text-bad' : won === n ? 'text-good' : '')}>{won}</span>
          <span className='text-xl text-muted-foreground'> of {n} hit</span>
        </p>
        {side}
      </div>
      <div className='grid gap-[3px]' style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} aria-hidden='true'>
        {[...segs].sort((a, b) => SEG_ORDER[a] - SEG_ORDER[b]).map((s, i) => <span key={i} className={cn('h-2 rounded-full', SEG_BG[s])} />)}
      </div>
      {bits.length > 0 && (
        <p className='flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-muted-foreground'>
          {bits.map((b) => <span key={b.t} className='flex items-center gap-1.5'><span className={cn('size-2 rounded-full', b.dot)} aria-hidden='true' />{b.t}</span>)}
        </p>
      )}
    </section>
  )
}

export function SegIcon({ st }: { st: Seg }) {
  const box = 'grid size-7 shrink-0 place-items-center rounded-full'
  if (st === 'won') return <span className={cn(box, 'bg-good/15 text-good')}><Check className='size-4' strokeWidth={3} aria-label='Hit' /></span>
  if (st === 'lost') return <span className={cn(box, 'bg-bad/15 text-bad')}><X className='size-4' strokeWidth={3} aria-label='Missed' /></span>
  if (st === 'push') return <span className={cn(box, 'bg-muted text-muted-foreground')}><Minus className='size-4' aria-label='Push' /></span>
  if (st === 'live') return <span className={cn(box, 'bg-devig/15')} aria-label='Live'><span className='size-2.5 rounded-full bg-devig motion-safe:animate-pulse' /></span>
  return <span className={cn(box, 'bg-muted text-muted-foreground')}><Clock className='size-3.5' aria-label='Not started' /></span>
}

// one leg: how it's doing in a line; tap for the breakdown
export function TrackRow({ st, title, sub, subTone, right, children }: {
  st: Seg; title: string; sub?: ReactNode; subTone?: string; right?: ReactNode; children?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <li className='border-b last:border-b-0'>
      <button type='button' aria-expanded={open} onClick={() => setOpen(!open)} disabled={!children}
        className={cn('flex min-h-14 w-full items-center gap-3 px-3.5 py-2.5 text-start active:bg-muted/50', open && 'bg-muted/30')}>
        <SegIcon st={st} />
        <span className='min-w-0 flex-1'>
          <span className={cn('block truncate font-semibold', st === 'lost' && 'text-bad')}>{title}</span>
          {sub && <span className={cn('block truncate text-xs font-medium', subTone ?? 'text-muted-foreground')}>{sub}</span>}
        </span>
        {right}
        {children && <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none', open && 'rotate-180')} aria-hidden='true' />}
      </button>
      {open && <div className='flex flex-col gap-2.5 bg-muted/30 px-3.5 pt-1 pb-4 text-sm'>{children}</div>}
    </li>
  )
}

// the legs, the ones still in play first; a long run of legs that already hit folds into one line
export function TrackList({ items }: { items: { key: string; st: Seg; row: ReactNode }[] }) {
  const [all, setAll] = useState(false)
  const order: Record<Seg, number> = { lost: 0, live: 1, later: 2, push: 3, won: 4 }
  const sorted = [...items].sort((a, b) => order[a.st] - order[b.st])
  const won = items.filter((i) => i.st === 'won').length
  const fold = won > 4 && won < items.length
  const shown = fold && !all ? sorted.filter((i) => i.st !== 'won') : sorted
  return (
    <ul aria-label='Legs' className='overflow-hidden rounded-2xl bg-card'>
      {shown.map((i) => <Fragment key={i.key}>{i.row}</Fragment>)}
      {fold && (
        <li>
          <button type='button' onClick={() => setAll(!all)} aria-expanded={all}
            className='flex min-h-12 w-full items-center gap-3 px-3.5 text-start text-sm font-semibold text-good active:bg-muted/50'>
            <SegIcon st='won' />
            <span className='flex-1'>{all ? 'Hide the legs that hit' : `${won} legs already hit`}</span>
            <ChevronDown className={cn('size-4 text-muted-foreground', all && 'rotate-180')} aria-hidden='true' />
          </button>
        </li>
      )}
    </ul>
  )
}

export function MoreLabel() {
  return <p className='px-1 pt-3 text-xs font-bold tracking-wide text-muted-foreground uppercase'>More about this bet</p>
}
