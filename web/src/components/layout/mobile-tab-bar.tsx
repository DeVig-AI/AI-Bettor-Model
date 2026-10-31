import { Link, useLocation } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { sidebarData } from './data/sidebar-data'

// Phone navigation: the same pages as the sidebar, as a bottom tab bar within thumb reach.
export function MobileTabBar() {
  const path = useLocation({ select: (l) => l.pathname })
  const items = sidebarData.navGroups.flatMap((g) => g.items)
  return (
    <nav
      aria-label='Main'
      className='fixed inset-x-0 bottom-0 z-40 border-t bg-sidebar pb-[env(safe-area-inset-bottom)] md:hidden'
    >
      <ul className='grid grid-cols-2'>
        {items.map((item) => {
          if (!item.url) return null
          const active = path === item.url
          const Icon = item.icon
          return (
            <li key={item.title}>
              <Link
                to={item.url}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium text-muted-foreground transition-colors duration-150',
                  active && 'text-devig'
                )}
              >
                {Icon && <Icon className='size-5' aria-hidden='true' />}
                {item.title}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
