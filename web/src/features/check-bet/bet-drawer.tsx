import { type ReactNode, createContext, useContext, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'

// A tracked bet opens in a bottom drawer that fits on one screen: the bet up top, then one short row per part
// (legs, prices, chance chart, grade, game by game, lessons, your stake). Tap a row to open it, tap again to close.

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
