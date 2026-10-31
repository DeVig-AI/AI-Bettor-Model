import { CalendarDays, Trophy } from 'lucide-react'
import { type SidebarData } from '../types'

export const sidebarData: SidebarData = {
  navGroups: [
    {
      title: 'DeVig',
      items: [
        { title: 'Games', url: '/', icon: CalendarDays },
        { title: 'Track record', url: '/track-record', icon: Trophy },
      ],
    },
  ],
}
