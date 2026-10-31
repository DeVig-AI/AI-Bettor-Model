import { BarChart3, CalendarDays, Cross, Ellipsis, Info, Layers, Trophy, UserRound } from 'lucide-react'
import { type SidebarData } from '../types'

// Phones get five tabs (the last is More, which lists the rest); the computer's sidebar lists every page.
export const sidebarData: SidebarData = {
  navGroups: [
    {
      title: '',
      items: [
        { title: 'Games', url: '/', icon: CalendarDays },
        { title: 'Props', url: '/props', icon: UserRound },
        { title: 'Parlay', url: '/parlay', icon: Layers },
        { title: 'Record', url: '/track-record', icon: Trophy, only: 'tabs' },
        { title: 'Track record', url: '/track-record', icon: Trophy, only: 'sidebar' },
        { title: 'Injuries', url: '/injuries', icon: Cross, only: 'sidebar' },
        { title: 'Models', url: '/models', icon: BarChart3, only: 'sidebar' },
        { title: 'About', url: '/about', icon: Info, only: 'sidebar' },
        { title: 'More', url: '/more', icon: Ellipsis, only: 'tabs' },
      ],
    },
  ],
}

// the pages the More tab lists
export const morePages = ['/injuries', '/models', '/about']
