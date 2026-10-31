import { Link } from '@tanstack/react-router'
import { BarChart3, ChevronRight, Cross, ExternalLink, Info, MessageCircle } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ThemeSwitch } from '@/components/theme-switch'

// More: the pages that don't fit in five tabs, and the classic app for what hasn't moved over yet.

const PAGES = [
  { to: '/ask', icon: MessageCircle, title: 'Ask', note: 'Questions about the picks, answered from DeVig’s data' },
  { to: '/injuries', icon: Cross, title: 'Injuries', note: "Each league's report, game by game, starters first" },
  { to: '/models', icon: BarChart3, title: 'Models', note: "DeVig's models next to other people's, graded the same way" },
  { to: '/about', icon: Info, title: 'About', note: 'How DeVig works, and what testing has found' },
] as const

const CLASSIC = ['Research: rankings, team and player stats', 'History: past games and odds-screen scans', 'Profile: name and favorite teams']

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

        <section aria-label='In the classic app' className='rounded-[18px] border border-dashed p-4'>
          <h2 className='font-display text-xl font-extrabold'>Still in the classic app</h2>
          <p className='mt-1 text-sm text-muted-foreground'>These are moving to the new look next. Until then they work as before.</p>
          <ul className='mt-3 flex flex-col gap-1 text-sm'>
            {CLASSIC.map((c) => <li key={c}>{c}</li>)}
          </ul>
          <a href='../' className='mt-4 inline-flex h-10 items-center gap-1.5 rounded-full bg-foreground px-4 text-sm font-bold text-background'>
            Open the classic app <ExternalLink className='size-4' aria-hidden='true' />
          </a>
        </section>
      </Main>
    </>
  )
}
