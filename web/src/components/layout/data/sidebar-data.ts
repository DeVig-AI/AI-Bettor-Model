import { CalendarDays, Cross, Layers, Trophy, UserRound } from 'lucide-react'
import { type SidebarData } from '../types'

export const sidebarData: SidebarData = {
  navGroups: [
    {
      title: '',
      items: [
        { title: 'Games', url: '/', icon: CalendarDays },
        { title: 'Props', url: '/props', icon: UserRound },
        { title: 'Parlay', url: '/parlay', icon: Layers },
        { title: 'Injuries', url: '/injuries', icon: Cross },
        { title: 'Track record', url: '/track-record', icon: Trophy },
      ],
    },
  ],
}
