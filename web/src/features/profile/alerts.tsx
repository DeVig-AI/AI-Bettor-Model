import { useState } from 'react'
import { Bell, BellOff, Share, Trash2 } from 'lucide-react'
import {
  type AlertPrefs, fmtOdds, support, useAlerts, useRemoveParlay, useRemoveTarget, useSavePrefs, useTest, useThisDevice,
  useTurnOff, useTurnOn,
} from '@/lib/alerts'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

// Profile → Alerts: turn push alerts on for this device, and pick what pings.

const PICK_SPORTS = ['NFL', 'NBA', 'MLB']
const whenFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
const pct = (p: number) => `${Math.round(p * 100)}%`

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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section aria-label='Alerts' className='flex flex-col gap-2'>
      <h2 className='px-1 font-display text-[22px] font-extrabold'>Alerts</h2>
      {children}
    </section>
  )
}

const note = (s: string) => <p className='rounded-[18px] bg-card p-4 text-sm leading-relaxed text-muted-foreground'>{s}</p>

export function Alerts({ joined }: { joined: boolean }) {
  const can = support()
  const { data, isLoading, error } = useAlerts()
  const here = useThisDevice()
  const on = useTurnOn()
  const off = useTurnOff()
  const save = useSavePrefs()
  const test = useTest()
  const untarget = useRemoveTarget()
  const unparlay = useRemoveParlay()
  const [tested, setTested] = useState(false)

  if (!joined) return <Shell>{note('A ping on your phone when DeVig makes a pick, a price hits your number, or a line moves. Alerts open once you have an account.')}</Shell>
  if (can === 'ios-install') {
    return (
      <Shell>
        <div className='flex flex-col gap-2 rounded-[18px] bg-card p-4 text-sm leading-relaxed'>
          <p className='font-semibold'>On iPhone, alerts come to the DeVig app on your Home Screen</p>
          <p className='text-muted-foreground'>
            Tap <Share className='inline size-3.5 align-[-2px]' aria-label='Share' /> in Safari, then <b className='text-foreground'>Add to Home Screen</b>.
            Open DeVig from the new icon, come back to Profile, and turn alerts on there. Needs iOS 16.4 or newer.
          </p>
        </div>
      </Shell>
    )
  }
  if (can === 'no') return <Shell>{note("This browser can't show alerts. Chrome, Edge, Firefox and Safari can.")}</Shell>
  if (isLoading || here.isLoading) return <Shell><Skeleton className='h-28 w-full rounded-[18px]' /></Shell>
  if (error || !data) return <Shell>{note(error?.message ?? "Couldn't load alerts.")}</Shell>
  if (!data.ready) return <Shell>{note('Alerts are almost here: they switch on once DeVig finishes setting them up.')}</Shell>

  const endpoint = here.data
  const others = data.devices.length - (endpoint ? 1 : 0)
  const busy = save.isPending
  const setPrefs = (p: Partial<AlertPrefs>) => save.mutate({ ...data.prefs, ...p })
  const err = on.error || off.error || save.error || untarget.error || unparlay.error

  if (!endpoint) {
    return (
      <Shell>
        <div className='flex flex-col gap-3 rounded-[18px] bg-card p-4'>
          <p className='text-sm leading-relaxed text-muted-foreground'>
            A ping on this device when DeVig makes a pick, a price reaches your number, a line moves on a game you follow,
            or a Lab model passes. Works with DeVig closed.
          </p>
          <button type='button' onClick={() => on.mutate(data.key)} disabled={on.isPending}
            className='inline-flex h-11 items-center justify-center gap-2 self-start rounded-full bg-devig px-5 font-bold text-devig-ink disabled:opacity-50'>
            <Bell className='size-4' aria-hidden='true' />{on.isPending ? 'Turning on…' : 'Turn on alerts on this device'}
          </button>
          {others > 0 && <p className='text-xs text-muted-foreground'>On for {others} other {others === 1 ? 'device' : 'devices'}.</p>}
          {err && <p role='alert' className='text-sm text-bad'>{err.message}</p>}
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className={cn('overflow-hidden rounded-[18px] bg-card', busy && 'opacity-80')}>
        <Row title='New DeVig picks' sub='When a pick locks, about an hour before the start.'>
          <div className='flex shrink-0 gap-1.5' role='group' aria-label='Sports for pick alerts'>
            {PICK_SPORTS.map((s) => {
              const sel = data.prefs.picks.includes(s)
              return (
                <button key={s} type='button' aria-pressed={sel} disabled={busy}
                  onClick={() => setPrefs({ picks: sel ? data.prefs.picks.filter((x) => x !== s) : [...data.prefs.picks, s] })}
                  className={cn('h-8 rounded-full border px-2.5 text-xs font-bold', sel ? 'border-devig bg-devig/15 text-devig' : 'text-muted-foreground')}>
                  {s}
                </button>
              )
            })}
          </div>
        </Row>
        <Row title='Big line moves' sub="Your favorite teams' games and ★ tracked games, when Kalshi's chance moves 5+ points within 6 hours before the start.">
          <Switch checked={data.prefs.moves} disabled={busy} onCheckedChange={(v) => setPrefs({ moves: v })} aria-label='Big line move alerts' className='mt-1' />
        </Row>
        <Row title='Lab models' sub='When a Research Lab model passes its check or the sealed exam.'>
          <Switch checked={data.prefs.lab} disabled={busy} onCheckedChange={(v) => setPrefs({ lab: v })} aria-label='Lab model alerts' className='mt-1' />
        </Row>
      </div>

      <div className='overflow-hidden rounded-[18px] bg-card'>
        <p className='border-b px-4 pt-3 pb-2 text-xs font-bold tracking-wide text-muted-foreground'>PRICE TARGETS</p>
        {data.targets.length === 0 && <p className='px-4 py-3 text-sm text-muted-foreground'>None yet. Set one with <b className='text-foreground'>Alert me</b> on a game.</p>}
        {data.targets.map((t) => (
          <div key={t.id} className='flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0'>
            <div className='min-w-0 flex-1'>
              <p className='truncate font-semibold tabular-nums'>{t.side === 'home' ? t.home : t.away} at {fmtOdds(t.odds)} or better</p>
              <p className='text-xs text-muted-foreground'>{t.sport} · {t.away} at {t.home} · {whenFmt.format(new Date(t.kickoff))}</p>
            </div>
            <button type='button' onClick={() => untarget.mutate(t.id)} disabled={untarget.isPending} aria-label='Remove this price target'
              className='grid size-9 shrink-0 place-items-center rounded-full border text-muted-foreground'>
              <Trash2 className='size-4' aria-hidden='true' />
            </button>
          </div>
        ))}
        <p className='border-t px-4 pt-3 pb-2 text-xs font-bold tracking-wide text-muted-foreground'>PARLAYS</p>
        {data.parlays.length === 0 && <p className='px-4 py-3 text-sm text-muted-foreground'>None yet. Set one with <b className='text-foreground'>Alert me</b> on a saved parlay in History.</p>}
        {data.parlays.map((p) => (
          <div key={p.id} className='flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0'>
            <div className='min-w-0 flex-1'>
              <p className='truncate font-semibold'>{p.label || `${p.legs.length}-leg parlay`}</p>
              <p className='text-xs text-muted-foreground tabular-nums'>
                {[p.settle && 'each leg as it settles', p.at != null && `at ${pct(p.at)}`].filter(Boolean).join(' · ')}
              </p>
            </div>
            <button type='button' onClick={() => unparlay.mutate(p.id)} disabled={unparlay.isPending} aria-label='Remove this parlay alert'
              className='grid size-9 shrink-0 place-items-center rounded-full border text-muted-foreground'>
              <Trash2 className='size-4' aria-hidden='true' />
            </button>
          </div>
        ))}
      </div>

      <div className='flex flex-wrap gap-2'>
        <button type='button' onClick={() => test.mutate(undefined, { onSuccess: () => { setTested(true); setTimeout(() => setTested(false), 4000) } })}
          disabled={test.isPending} className='inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold'>
          <Bell className='size-4' aria-hidden='true' />{tested ? 'Sent. Check your notifications' : test.isPending ? 'Sending…' : 'Send a test'}
        </button>
        <button type='button' onClick={() => off.mutate(endpoint)} disabled={off.isPending}
          className='inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold text-muted-foreground'>
          <BellOff className='size-4' aria-hidden='true' />Turn off on this device
        </button>
      </div>
      {(err || test.error) && <p role='alert' className='px-1 text-sm text-bad'>{(err || test.error)!.message}</p>}
      <p className='px-1 text-xs leading-relaxed text-muted-foreground'>
        On for {data.devices.length === 1 ? 'this device' : `this device and ${others} more`}. DeVig checks prices about every
        30 minutes (every few minutes while games are on), so an alert can come a little after the move. Alerts are
        information, never a bet.
      </p>
      <span className='sr-only' aria-live='polite'>{tested ? 'Test sent' : ''}</span>
    </Shell>
  )
}
