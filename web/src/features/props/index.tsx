import { useMemo, useState } from 'react'
import { type GameRow, useGames } from '@/lib/devig'
import { type PropLine, useProps } from '@/lib/props'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ThemeSwitch } from '@/components/theme-switch'
import { TeamLogo } from '@/components/team-logo'
import { SoccerProps } from './soccer'
import { PropsBoard } from './board'

// Player props: pick a game and a stat, see who reached a line in each of their last 10 games, then one row per player
// with DeVig's projection, Kalshi's chance and DeVig's chance. A row opens the player drawer: the chance it happens,
// DeVig's projection and the reasons behind it, his last 10 games, and what each side costs. The model has lost to
// Kalshi on past games, and the page says so. Lines are worded the way Kalshi words them (6+ assists).

export { type Shown, withLive } from './board-data'

const timeFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })

// One game's props in a drawer (from the game's card on Games): the same board, for this game only
export function GameProps({ ls, game, open, onOpenChange }: { ls: PropLine[]; game: GameRow | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const g = ls[0]
  const c = game?.colors ?? null
  const gameFor = () => game
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side='bottom'
        className='max-h-[92svh] gap-0 overflow-y-auto rounded-t-3xl border-t p-0 md:mx-auto md:max-w-xl [&>button:last-child]:top-3 [&>button:last-child]:grid [&>button:last-child]:size-9 [&>button:last-child]:place-items-center [&>button:last-child]:rounded-full [&>button:last-child]:bg-black/30 [&>button:last-child]:text-white [&>button:last-child]:opacity-100'>
        <div className='relative flex shrink-0 flex-col gap-1 overflow-hidden rounded-t-3xl px-5 pt-6 pb-4 text-white'
          style={{ background: c ? `linear-gradient(102deg, ${c.away} 0 50%, ${c.home} 50% 100%)` : 'linear-gradient(102deg, var(--side-away) 0 50%, var(--side-home) 50% 100%)' }}>
          <span aria-hidden='true' className='absolute inset-0 bg-black/30' />
          <span aria-hidden='true' className='absolute top-2 left-1/2 h-1.5 w-10 -translate-x-1/2 rounded-full bg-white/45' />
          <SheetTitle className='relative flex items-center gap-2 font-display text-2xl font-black text-white'>
            <TeamLogo sport={g.sport} code={g.away} id={game?.ids?.away} color={c?.away} px={64} className='size-8 text-[10px]' />
            {g.away} at {g.home}
            <TeamLogo sport={g.sport} code={g.home} id={game?.ids?.home} color={c?.home} px={64} className='size-8 text-[10px]' />
          </SheetTitle>
          <SheetDescription className='relative text-sm text-white/85'>{timeFmt.format(new Date(g.kickoff))} · Player props · tap a player</SheetDescription>
        </div>
        <div className='px-4 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]'>
          <PropsBoard ls={ls} gameFor={gameFor} pickGame={false} />
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function Props() {
  const { lines, isLoading } = useProps()
  const { rows } = useGames()
  const [sport, setSport] = useState<string | null>(null)

  const upcoming = useMemo(() => lines.filter((l) => Date.parse(l.kickoff) > Date.now()), [lines])
  // Soccer last: its player markets come from the board's soccer lines, not the props file
  const sports = useMemo(() => [...Array.from(new Set(upcoming.map((l) => l.sport))).sort(), 'Soccer'], [upcoming])
  const sp = sport && sports.includes(sport) ? sport : sports[0]
  const ls = useMemo(() => upcoming.filter((l) => l.sport === sp), [upcoming, sp])
  const gameFor = (l: PropLine) => rows.find((r) => r.sport === l.sport && r.away === l.away && r.home === l.home) ?? null

  return (
    <>
      <Header>
        <div className='me-auto min-w-0'>
          <h1 className='font-display text-[26px] leading-none font-black'>Player props</h1>
          <p className='mt-0.5 truncate text-xs text-muted-foreground'>Tap a player for the projection, the why and the price</p>
        </div>
        <ThemeSwitch />
      </Header>
      <Main className='mx-auto flex w-full max-w-3xl flex-col gap-4'>
        <div className='no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4'>
          {sports.map((x) => (
            <button key={x} type='button' aria-pressed={sp === x} onClick={() => setSport(x)}
              className={cn('h-9 shrink-0 rounded-full border px-4 text-sm font-medium text-muted-foreground', sp === x && 'border-foreground bg-foreground text-background')}>
              {x}
            </button>
          ))}
        </div>

        {sp === 'Soccer' ? (
          <SoccerProps rows={rows} />
        ) : isLoading ? (
          <Skeleton className='h-64 w-full rounded-[18px]' />
        ) : ls.length === 0 ? (
          <p className='rounded-[18px] border border-dashed p-8 text-center text-muted-foreground'>
            No upcoming {sp ?? ''} props with prices right now.
          </p>
        ) : (
          <PropsBoard key={sp} ls={ls} gameFor={gameFor} />
        )}
      </Main>
    </>
  )
}
