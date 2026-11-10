import { Link, useLocation } from '@tanstack/react-router'
import { ChevronLeft, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { morePages } from './data/sidebar-data'

type HeaderProps = React.HTMLAttributes<HTMLElement> & {
  ref?: React.Ref<HTMLElement>
}

// Sticky top bar. On phones it carries the DeVig mark (navigation lives in the bottom tab bar);
// from md up the sidebar toggle takes that place. A page opened from the More tab shows a back button to More there instead. Friends floats at its right end on phones (on a computer it's in the sidebar).
export function Header({ className, children, ...props }: HeaderProps) {
  const fromMore = useLocation({ select: (l) => morePages.includes(l.pathname.replace(/\/$/, '')) })
  return (
    <header
      className={cn(
        // the before: block paints above the bar, so pulling the page down past the top (or a phone's status-bar
        // area) never shows the cards through it
        'sticky top-0 z-40 border-b bg-background pt-[env(safe-area-inset-top)] before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-[100vh] before:bg-background',
        className
      )}
      {...props}
    >
      <div className='flex h-14 items-center gap-3 px-4 md:h-16'>
        <BackToMore />
        <span className={cn('relative shrink-0 md:hidden', fromMore && 'hidden')}>
          <img src='./icon.svg' alt='DeVig' className='size-7 rounded-md' />
          <span className='absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-devig px-1 font-mono text-[8px] leading-[12px] font-bold tracking-wider text-devig-ink'>
            BETA
          </span>
        </span>
        <SidebarTrigger variant='ghost' className='max-md:hidden' />
        <Separator orientation='vertical' className='h-6 max-md:hidden' />
        {children}
        <FriendsButton />
      </div>
    </header>
  )
}

function FriendsButton() {
  const here = useLocation({ select: (l) => l.pathname.startsWith('/friends') })
  return (
    <Link
      to='/friends'
      aria-label='Friends'
      aria-current={here ? 'page' : undefined}
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-full border bg-card text-muted-foreground shadow-[0_6px_18px_rgba(0,0,0,0.18)] transition-colors duration-150 hover:text-foreground md:hidden',
        here && 'border-devig text-devig'
      )}
    >
      <Users className='size-5' aria-hidden='true' />
    </Link>
  )
}

// phones only: back to the More tab from a page it lists (deeper pages, like a Research team, keep their own back link)
function BackToMore() {
  const fromMore = useLocation({ select: (l) => morePages.includes(l.pathname.replace(/\/$/, '')) })
  if (!fromMore) return null
  return (
    <Link
      to='/more'
      aria-label='Back to More'
      className='-ml-2 flex h-10 shrink-0 items-center gap-0.5 rounded-full pr-2 pl-1 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground md:hidden'
    >
      <ChevronLeft className='size-5' aria-hidden='true' />
      More
    </Link>
  )
}
