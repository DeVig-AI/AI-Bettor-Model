import { Link } from '@tanstack/react-router'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'

export function AppTitle() {
  const { setOpenMobile } = useSidebar()
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          size='lg'
          className='gap-0 py-0 hover:bg-transparent active:bg-transparent'
          asChild
        >
          <div>
            <Link
              to='/'
              onClick={() => setOpenMobile(false)}
              className='grid flex-1 text-start text-sm leading-tight'
            >
              <span className='flex items-center gap-2 truncate font-bold'>
                <img src='./icon.svg' alt='' className='size-6 rounded-md' />
                DeVig
                <span className='rounded-full bg-devig px-1.5 font-mono text-[10px] leading-4 font-bold tracking-wider text-devig-ink'>BETA</span>
              </span>
              <span className='truncate text-xs text-muted-foreground'>
                Odds, read straight.
              </span>
            </Link>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
