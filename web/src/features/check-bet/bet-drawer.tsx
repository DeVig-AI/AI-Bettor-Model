import { type ReactNode, createContext, useContext, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'

// A tracked bet opens in a bottom drawer instead of unrolling on the page. At the top of the drawer you pick what to
// show (legs, the chance chart, the grade, prices, your stake, lessons); the choice is remembered on this device.

export type Sec = 'legs' | 'bet' | 'chance' | 'grade' | 'prices' | 'learn'
export const SECS: { k: Sec; t: string }[] = [
  { k: 'legs', t: 'Legs' },
  { k: 'bet', t: 'My stake' },
  { k: 'chance', t: 'Chance chart' },
  { k: 'grade', t: 'Grade' },
  { k: 'prices', t: 'Prices' },
  { k: 'learn', t: 'Lessons' },
]
const DEFAULT: Sec[] = ['legs']
const KEY = 'devig.betDrawer.v1'

function load(): Sec[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null')
    return Array.isArray(v) ? v.filter((x): x is Sec => SECS.some((s) => s.k === x)) : DEFAULT
  } catch {
    return DEFAULT
  }
}
let cur: Sec[] | null = null
const subs = new Set<(v: Sec[]) => void>()
export function useShowPrefs() {
  const [v, setV] = useState<Sec[]>(() => (cur ??= load()))
  useEffect(() => { subs.add(setV); return () => { subs.delete(setV) } }, [])
  const set = (next: Sec[]) => {
    cur = next
    try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* private mode: this visit only */ }
    subs.forEach((f) => f(next))
  }
  return [v, set] as const
}

// null = no drawer around it (a friend's page, a fresh check): everything shows, as before
const ShowCtx = createContext<Sec[] | null>(null)
export function useShow() {
  const s = useContext(ShowCtx)
  return (k: Sec) => s == null || s.includes(k)
}
// inside a drawer the header already says how it's going, so the big status block steps aside
export const useInDrawer = () => useContext(ShowCtx) != null

function ShowChips({ v, set, only }: { v: Sec[]; set: (x: Sec[]) => void; only?: Sec[] }) {
  const list = only ? SECS.filter((s) => only.includes(s.k)) : SECS
  const all = list.every((s) => v.includes(s.k))
  return (
    <div className='flex flex-col gap-1.5'>
      <div className='flex items-center justify-between px-1'>
        <span className='text-xs font-bold tracking-wide text-muted-foreground uppercase'>Show</span>
        <button type='button' onClick={() => set(all ? [] : list.map((s) => s.k))}
          className='h-8 rounded-full px-2 text-xs font-semibold text-devig'>
          {all ? 'Hide all' : 'Show all'}
        </button>
      </div>
      <div className='no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5' role='group' aria-label='What to show'>
        {list.map(({ k, t }) => {
          const on = v.includes(k)
          return (
            <button key={k} type='button' aria-pressed={on} onClick={() => set(on ? v.filter((x) => x !== k) : [...v, k])}
              className={cn('h-9 shrink-0 rounded-full border px-3.5 text-sm font-medium transition-colors duration-150',
                on ? 'border-foreground bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}>
              {t}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function BetDrawer({ open, onClose, title, sub, head, only, children }: {
  open: boolean; onClose: () => void; title: string; sub?: ReactNode; head?: ReactNode; only?: Sec[]; children: ReactNode
}) {
  const [v, set] = useShowPrefs()
  const shown = only ? (only.length === 1 ? only : v.filter((k) => only.includes(k))) : v
  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent side='bottom' onOpenAutoFocus={(e) => e.preventDefault()}
        className='max-h-[92svh] gap-0 overflow-y-auto rounded-t-3xl border-t p-0 md:mx-auto md:max-w-xl [&>button:last-child]:top-4 [&>button:last-child]:grid [&>button:last-child]:size-9 [&>button:last-child]:place-items-center [&>button:last-child]:rounded-full [&>button:last-child]:bg-muted [&>button:last-child]:opacity-100'>
        <div className='sticky top-0 z-10 flex flex-col gap-3 border-b bg-background/95 px-5 pt-6 pb-3 backdrop-blur'>
          <span aria-hidden='true' className='absolute top-2 left-1/2 h-1.5 w-10 -translate-x-1/2 rounded-full bg-muted-foreground/30' />
          <div className='min-w-0 pe-10'>
            <SheetTitle className='truncate font-display text-[22px] leading-tight font-black'>{title}</SheetTitle>
            {sub ? <SheetDescription asChild><div className='mt-0.5 text-sm text-muted-foreground'>{sub}</div></SheetDescription> : <SheetDescription className='sr-only'>Your bet</SheetDescription>}
          </div>
          {head}
          {(!only || only.length > 1) && <ShowChips v={v} set={set} only={only} />}
        </div>
        <div className='flex flex-col gap-3 px-4 pt-3 pb-8'>
          <ShowCtx.Provider value={shown}>{children}</ShowCtx.Provider>
          {shown.length === 0 && (
            <p className='rounded-[18px] border border-dashed p-4 text-center text-sm text-muted-foreground'>Everything&apos;s hidden. Tap a chip above to show it.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
