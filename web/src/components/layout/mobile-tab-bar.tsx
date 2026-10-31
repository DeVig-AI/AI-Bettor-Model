import { Link, useLocation } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { morePages, sidebarData } from './data/sidebar-data'

// Phone navigation: the same pages as the sidebar, as a bottom tab bar within thumb reach.
export function MobileTabBar() {
  const path = useLocation({ select: (l) => l.pathname })
  const items = sidebarData.navGroups.flatMap((g) => g.items).filter((i) => i.only !== 'sidebar')
  return (
    <nav
      aria-label='Main'
      // the after: block paints below the bar: when a phone browser's toolbar shrinks or the page bounces at the
      // bottom, the space under the tabs stays solid instead of showing the cards scrolling behind it
      className='fixed inset-x-0 bottom-0 z-40 border-t bg-sidebar pb-[env(safe-area-inset-bottom)] after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-[50vh] after:bg-sidebar md:hidden'
    >
      <ul className='grid' style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          if (!item.url) return null
          const active = path === item.url || (item.url === '/more' && morePages.includes(path))
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
