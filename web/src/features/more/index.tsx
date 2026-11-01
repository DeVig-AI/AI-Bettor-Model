import { Link } from '@tanstack/react-router'
import { BarChart3, ChevronRight, CircleUserRound, Cross, ExternalLink, History, Info, MessageCircle, Search } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ThemeSwitch } from '@/components/theme-switch'

// More: the pages that don't fit in five tabs, and the classic app for what hasn't moved over yet.

const PAGES = [
  { to: '/ask', icon: MessageCircle, title: 'Ask', note: 'Questions about the picks, answered from DeVig’s data' },
  { to: '/research', icon: Search, title: 'Research', note: 'Power rankings, team and player stats, and how often a player cleared a line' },
  { to: '/history', icon: History, title: 'History', note: 'Check a Kalshi bet from its link, combos leg by leg, and recent finals' },
  { to: '/injuries', icon: Cross, title: 'Injuries', note: "Each league's report, game by game, starters first" },
  { to: '/models', icon: BarChart3, title: 'Models', note: "DeVig's models next to other people's, graded the same way" },
  { to: '/about', icon: Info, title: 'About', note: 'How DeVig works, and what testing has found' },
  { to: '/profile', icon: CircleUserRound, title: 'Profile', note: 'Your name tag, favorite teams, and account' },
] as const

const CLASSIC = ['Odds-screen photo scans', 'Tracking games and props (★ Track)']

export function More() {
  return (
    <>
      <Header>
        <h1 className='me-auto font-display text-[26px] leading-none font-black'>More</h1>
        <ThemeSwitch />
      </Header>
      <Main className='flex flex-col gap-5'>
        <ul className='overflow-hidden rounded-[18px] bg-card'>
          {PAGES.map(({ to, icon: Icon, title, note }) => (
            <li key={to} className='border-b last:border-b-0'>
              <Link to={to} className='flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-muted/50'>
                <span className='grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-devig'><Icon className='size-5' aria-hidden='true' /></span>
                <span className='min-w-0 flex-1'>
                  <span className='block font-display text-xl font-extrabold leading-tight'>{title}</span>
                  <span className='block text-sm text-muted-foreground'>{note}</span>
                </span>
                <ChevronRight className='size-5 shrink-0 text-muted-foreground' aria-hidden='true' />
              </Link>
            </li>
          ))}
        </ul>

        <section aria-label='Beta' className='rounded-[18px] border border-dashed p-4'>
          <h2 className='font-display text-xl font-extrabold'>This is the new DeVig, in beta</h2>
          <p className='mt-1 text-sm text-muted-foreground'>
            The classic app stays the main one until this is finished and reviewed. These are still only in the classic app, and move here next:
          </p>
          <ul className='mt-3 flex flex-col gap-1 text-sm'>
            {CLASSIC.map((c) => <li key={c}>{c}</li>)}
          </ul>
          <a href='../' className='mt-4 inline-flex h-10 items-center gap-1.5 rounded-full bg-foreground px-4 text-sm font-bold text-background'>
            Back to the classic app <ExternalLink className='size-4' aria-hidden='true' />
          </a>
        </section>
      </Main>
    </>
  )
}
