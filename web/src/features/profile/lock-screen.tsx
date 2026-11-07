import { useEffect, useState } from 'react'
import { Star } from 'lucide-react'
import { type Item, lockScreenOn, useLockItems } from '@/lib/lock-screen'
import { cn } from '@/lib/utils'

// Profile → Lock screen, in the DeVig iPhone app only (it takes the place of Alerts there, since the app can't get
// web push). Shows whether iOS allows the cards and exactly what's on them now: ★ tracked games, saved parlays and saved Kalshi bets only.

const MAX = 5

function line(it: Item) {
  const s = it.state
  if (it.kind === 'parlay') return { top: it.title, sub: s.detail }
  const score = s.awayScore != null && s.homeScore != null ? `${s.away} ${s.awayScore} – ${s.home} ${s.homeScore}` : `${s.away} @ ${s.home}`
  return { top: score, sub: `${it.sport} · ${s.detail}` }
}

export function LockScreen() {
  // finals end a card that's already up but never start one, so the list is live games and ones starting soon
  const items = useLockItems().filter((it) => it.state.phase !== 'post')
  const [on, setOn] = useState<boolean | null>(null)
  useEffect(() => {
    let live = true
    const check = () => { lockScreenOn().then((v) => { if (live) setOn(v) }) }
    check()
    // coming back from iPhone Settings re-checks
    document.addEventListener('visibilitychange', check)
    return () => { live = false; document.removeEventListener('visibilitychange', check) }
  }, [])
  const shown = items.slice(0, MAX)

  return (
    <section aria-label='Lock screen' className='flex flex-col gap-2'>
      <h2 className='px-1 font-display text-[22px] font-extrabold'>Lock screen</h2>
      <div className='overflow-hidden rounded-[18px] bg-card'>
        <div className='flex items-start gap-3 border-b px-4 py-3'>
          <span aria-hidden='true' className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', on ? 'bg-good' : on === false ? 'bg-bad' : 'bg-muted-foreground/40')} />
          <div className='min-w-0 flex-1 text-sm leading-relaxed'>
            {on === false ? (
              <>
                <p className='font-semibold'>Lock-screen cards are off</p>
                <p className='text-muted-foreground'>Turn on <b className='text-foreground'>Settings → DeVig → Live Activities</b>. Needs iOS 16.2 or newer.</p>
              </>
            ) : (
              <>
                <p className='font-semibold'>{on ? 'Lock-screen cards are on' : 'Checking…'}</p>
                <p className='text-muted-foreground'>
                  Only games you <Star className='inline size-3.5 align-[-2px]' aria-label='track' /> track, parlays you save, and Kalshi bets you save from
                  their link, from an hour before the start until the final.
                </p>
              </>
            )}
          </div>
        </div>

        <p className='px-4 pt-3 pb-1 text-xs font-bold tracking-wide text-muted-foreground'>ON YOUR LOCK SCREEN NOW</p>
        {shown.length === 0 ? (
          <p className='px-4 pb-3 text-sm leading-relaxed text-muted-foreground'>
            Nothing right now. Star a game on Games and its card shows up an hour before it starts.
          </p>
        ) : (
          <ul className='pb-1'>
            {shown.map((it) => {
              const l = line(it)
              return (
                <li key={it.id} className='flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0'>
                  <span aria-hidden='true' className={cn('size-2 shrink-0 rounded-full', it.state.phase === 'in' ? 'bg-devig' : it.state.phase === 'post' ? 'bg-muted-foreground/40' : 'bg-muted-foreground')} />
                  <div className='min-w-0 flex-1'>
                    <p className='truncate font-semibold tabular-nums'>{l.top}</p>
                    <p className='truncate text-xs text-muted-foreground'>{l.sub}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        {items.length > MAX && (
          <p className='border-t px-4 py-2.5 text-xs text-muted-foreground'>
            {items.length - MAX} more waiting: iPhone shows {MAX} at a time, live games first.
          </p>
        )}
      </div>
      <p className='px-1 text-xs leading-relaxed text-muted-foreground'>
        Cards update while DeVig is open, and say so when they&apos;re out of date. Pings with DeVig closed need the Home Screen
        version from Safari: open devigai.pages.dev, tap Share, then Add to Home Screen.
      </p>
    </section>
  )
}
