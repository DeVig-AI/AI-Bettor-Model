import { useState } from 'react'
import { Monitor, RefreshCw, Tv } from 'lucide-react'
import { formatTvCode, TV_DELAYS, TV_SPORTS, type TvSettings, useTv, useTvOp } from '@/lib/tv'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

// Profile → TV: the score dock on the living-room TV. It stays a small pill; Paramount+ ×3 opens the full view and hold hides it; it shows the
// games in your bets with each leg, your ★ teams' games, and a small note when a prop hits. Set up with a TV code
// typed once into the launcher's settings.

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section aria-label='TV' className='flex flex-col gap-2'>
      <h2 className='px-1 font-display text-[22px] font-extrabold'>TV</h2>
      {children}
    </section>
  )
}

function Row({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className='flex items-start gap-3 border-b px-4 py-3 last:border-b-0'>
      <div className='min-w-0 flex-1'>
        <p className='font-semibold'>{title}</p>
        <p className='text-xs leading-relaxed text-muted-foreground'>{sub}</p>
      </div>
      {children}
    </div>
  )
}

function Choice<T extends string | number>({ label, value, options, onPick, disabled }:
  { label: string; value: T; options: readonly (readonly [T, string])[]; onPick: (v: T) => void; disabled?: boolean }) {
  return (
    <div role='radiogroup' aria-label={label} className='mt-2.5 flex flex-wrap gap-1.5'>
      {options.map(([v, t]) => (
        <button key={String(v)} type='button' role='radio' aria-checked={value === v} disabled={disabled} onClick={() => onPick(v)}
          className={cn('h-8 rounded-full border px-3 text-xs font-bold', value === v ? 'border-devig bg-devig/15 text-devig' : 'text-muted-foreground')}>
          {t}
        </button>
      ))}
    </div>
  )
}

const note = (s: string) => <p className='rounded-[18px] bg-card p-4 text-sm leading-relaxed text-muted-foreground'>{s}</p>

export function TvDock({ joined }: { joined: boolean }) {
  const { data, isLoading, error } = useTv(joined)
  const op = useTvOp()
  const [sure, setSure] = useState<'' | 'new' | 'off'>('')
  if (!joined) return <Shell>{note('Live scores and your bets on the TV, in a small dock over the game. Opens once you have an account.')}</Shell>
  if (isLoading) return <Shell><Skeleton className='h-40 w-full rounded-[18px]' /></Shell>
  if (error || !data) return <Shell>{note(error?.message ?? "Couldn't load the TV settings.")}</Shell>

  const s = data.settings
  const computer = typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches
  const set = (p: Partial<TvSettings>) => op.mutate({ op: 'settings', settings: { ...s, ...p } })
  const busy = op.isPending
  const twice = (k: 'new' | 'off', run: () => void) => { if (sure === k) { setSure(''); run() } else setSure(k) }

  if (!data.code) {
    return (
      <Shell>
        <div className='flex flex-col gap-3 rounded-[18px] bg-card p-4'>
          <p className='text-sm leading-relaxed text-muted-foreground'>
            A small pill over whatever you&apos;re watching with the score and how your bet is doing, plus a quick note
            when a prop hits. Press <b className='text-foreground'>Paramount+</b> three times to open the full view (and
            again to shrink it). Hold it to hide the dock.
          </p>
          <button type='button' onClick={() => op.mutate({ op: 'code' })} disabled={busy}
            className='inline-flex h-11 items-center justify-center gap-2 self-start rounded-full bg-devig px-5 font-bold text-devig-ink disabled:opacity-50'>
            <Tv className='size-4' aria-hidden='true' />{busy ? 'Making a code…' : 'Get a TV code'}
          </button>
          {op.error && <p role='alert' className='text-sm text-bad'>{op.error.message}</p>}
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className='flex flex-col gap-3 rounded-[18px] bg-card p-4'>
        <div className='flex items-center gap-3'>
          <span className='grid size-10 shrink-0 place-items-center rounded-xl bg-devig/15 text-devig'><Tv className='size-5' aria-hidden='true' /></span>
          <div className='min-w-0 flex-1'>
            <p className='text-xs font-bold tracking-wide text-muted-foreground'>TV CODE</p>
            <p className='font-mono text-[26px] font-black leading-none tracking-[0.12em] tabular-nums'>{formatTvCode(data.code)}</p>
          </div>
        </div>
        <p className='text-xs leading-relaxed text-muted-foreground'>
          On the TV: Settings → DeVig → TV code. It only lets the TV read your open bets, ★ teams and scores. Anyone
          with it could see those, so make a new one if it gets out.
        </p>
        <div className='flex flex-wrap gap-2'>
          <button type='button' disabled={busy} onClick={() => twice('new', () => op.mutate({ op: 'code' }))} onBlur={() => setSure('')}
            className={cn('inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold', sure === 'new' ? 'border-bad text-bad' : 'text-muted-foreground')}>
            <RefreshCw className='size-3.5' aria-hidden='true' />{sure === 'new' ? 'Tap again: the TV needs the new one' : 'New code'}
          </button>
          <button type='button' disabled={busy} onClick={() => twice('off', () => op.mutate({ op: 'off' }))} onBlur={() => setSure('')}
            className={cn('h-9 rounded-full border px-3.5 text-xs font-semibold', sure === 'off' ? 'border-bad text-bad' : 'text-muted-foreground')}>
            {sure === 'off' ? 'Tap again to unlink every TV' : 'Turn off'}
          </button>
        </div>
      </div>

      {computer && (
        <div className='flex items-center gap-3 rounded-[18px] bg-card p-4'>
          <span className='grid size-10 shrink-0 place-items-center rounded-xl bg-devig/15 text-devig'><Monitor className='size-5' aria-hidden='true' /></span>
          <div className='min-w-0 flex-1'>
            <p className='font-semibold'>Score pill on this computer</p>
            <p className='text-xs leading-relaxed text-muted-foreground'>
              The same pill, floating over a game you watch here. In the DeVig app it stays on top, even full screen (⌘⇧P).
            </p>
          </div>
          <button type='button' onClick={() => window.open('./pill.html', 'devig-pill', 'popup,width=420,height=260')}
            className='h-9 shrink-0 rounded-full bg-devig px-4 text-xs font-bold text-devig-ink'>
            Open
          </button>
        </div>
      )}

      <div className={cn('overflow-hidden rounded-[18px] bg-card', busy && 'opacity-80')}>
        <div className='border-b px-4 py-3'>
          <p className='font-semibold'>What the dock shows</p>
          <p className='text-xs leading-relaxed text-muted-foreground'>Games in your bets always come first.</p>
          <Choice label='What the dock shows' value={s.show} onPick={(v) => set({ show: v })}
            options={[['bets', 'Only my bets'], ['teams', '+ ★ teams'], ['all', '+ every live game']] as const} />
        </div>
        {s.show !== 'bets' && (
          <div className='border-b px-4 py-3'>
            <p className='font-semibold'>Sports</p>
            <div role='group' aria-label='Sports on the dock' className='mt-2.5 flex flex-wrap gap-1.5'>
              {TV_SPORTS.map(([k, t]) => {
                const on = s.sports.includes(k)
                return (
                  <button key={k} type='button' aria-pressed={on} onClick={() => set({ sports: on ? s.sports.filter((x) => x !== k) : [...s.sports, k] })}
                    className={cn('h-8 rounded-full border px-3 text-xs font-bold', on ? 'border-devig bg-devig/15 text-devig' : 'text-muted-foreground')}>
                    {t}
                  </button>
                )
              })}
            </div>
          </div>
        )}
        <div className='border-b px-4 py-3'>
          <p className='font-semibold'>Stream delay</p>
          <p className='text-xs leading-relaxed text-muted-foreground'>
            TV streams run behind the real game. The dock holds scores back this long so it doesn&apos;t spoil a play
            before you see it.
          </p>
          <Choice label='Stream delay' value={s.delay} onPick={(v) => set({ delay: v })}
            options={TV_DELAYS.map((d) => [d, d ? `${d}s` : 'None'] as const)} />
        </div>
        <div className='border-b px-4 py-3'>
          <p className='font-semibold'>Where it sits</p>
          <Choice label='Dock position' value={s.pos} onPick={(v) => set({ pos: v })}
            options={[['corner', 'Corner'], ['bar', 'Bar along the bottom']] as const} />
        </div>
        <Row title='Prop hits' sub='A small note when a player prop in your bet hits, e.g. "Herro 20+ pts hit · 2 of 3 in".'>
          <Switch checked={s.props} onCheckedChange={(v) => set({ props: v })} aria-label='Prop hit notes' className='mt-1' />
        </Row>
        <Row title='Lost legs' sub='A note when a leg is out, so you know without opening the dock.'>
          <Switch checked={s.lost} onCheckedChange={(v) => set({ lost: v })} aria-label='Lost leg notes' className='mt-1' />
        </Row>
        <Row title='Close finishes' sub='A note when a game in your bets is within one score late.'>
          <Switch checked={s.close} onCheckedChange={(v) => set({ close: v })} aria-label='Close finish notes' className='mt-1' />
        </Row>
        <Row title='Bet settled' sub='A short note when a whole bet hits or misses, with what it pays.'>
          <Switch checked={s.settled} onCheckedChange={(v) => set({ settled: v })} aria-label='Bet settled notes' className='mt-1' />
        </Row>
        <Row title='Show on its own' sub='The small pill shows up when a game in your bets starts. It only opens when you ask.'>
          <Switch checked={s.auto} onCheckedChange={(v) => set({ auto: v })} aria-label='Show the pill on its own' className='mt-1' />
        </Row>
        <Row title='Hide when nothing is live' sub="With no game going in your bets, the pill tucks away until there's something to show.">
          <Switch checked={s.quiet} onCheckedChange={(v) => set({ quiet: v })} aria-label='Hide when nothing is live' className='mt-1' />
        </Row>
      </div>
      {op.error && <p role='alert' className='px-1 text-sm text-bad'>{op.error.message}</p>}
    </Shell>
  )
}
