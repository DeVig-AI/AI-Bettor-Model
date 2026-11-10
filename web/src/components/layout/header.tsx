import { Link, useLocation } from '@tanstack/react-router'
import { Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'

type HeaderProps = React.HTMLAttributes<HTMLElement> & {
  ref?: React.Ref<HTMLElement>
}

// Sticky top bar. On phones it carries the DeVig mark (navigation lives in the bottom tab bar);
// from md up the sidebar toggle takes that place. Friends floats at its right end on phones (on a computer it's in the sidebar).
export function Header({ className, children, ...props }: HeaderProps) {
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
        <span className='relative shrink-0 md:hidden'>
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
