import { cn } from '@/lib/utils'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'

type HeaderProps = React.HTMLAttributes<HTMLElement> & {
  ref?: React.Ref<HTMLElement>
}

// Sticky top bar. On phones it carries the DeVig mark (navigation lives in the bottom tab bar);
// from md up the sidebar toggle takes that place.
export function Header({ className, children, ...props }: HeaderProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-40 border-b bg-background pt-[env(safe-area-inset-top)]',
        className
      )}
      {...props}
    >
      <div className='flex h-14 items-center gap-3 px-4 md:h-16'>
        <img src='./icon.svg' alt='DeVig' className='size-7 rounded-md md:hidden' />
        <SidebarTrigger variant='ghost' className='max-md:hidden' />
        <Separator orientation='vertical' className='h-6 max-md:hidden' />
        {children}
      </div>
    </header>
  )
}
