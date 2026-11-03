import { useState } from 'react'
import { Bell, BellOff, Share, Trash2 } from 'lucide-react'
import {
  type AlertPrefs, type LivePrefs, fmtOdds, support, useAlerts, useRemoveParlay, useRemoveTarget, useSavePrefs, useTest, useThisDevice,
  useTurnOff, useTurnOn,
} from '@/lib/alerts'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

// Profile → Alerts: turn push alerts on for this device, and pick what pings.

const PICK_SPORTS = ['NFL', 'NBA', 'MLB']
const whenFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
const pct = (p: number) => `${Math.round(p * 100)}%`
const NO_LIVE: LivePrefs = { start: false, half: false, lead: false, plays: false, winner: false, final: false, legs: false }
const LIVE_ROWS: { k: keyof LivePrefs; title: string; sub: string }[] = [
  { k: 'start', title: 'Game starting', sub: 'At kickoff or tip-off.' },
  { k: 'half', title: 'Halftime score', sub: 'The score at the break.' },
  { k: 'lead', title: 'Lead changes', sub: 'When the other team goes ahead. Basketball and hockey only ping late in the game.' },
  { k: 'plays', title: 'Big plays', sub: 'Touchdowns, field goals, interceptions, fumbles, safeties, and 10–0 basketball runs.' },
  { k: 'winner', title: 'Game winners', sub: 'A go-ahead score in the last two minutes, or the last minute of basketball.' },
  { k: 'final', title: 'Final score', sub: 'When the game ends.' },
  { k: 'legs', title: 'Parlay legs', sub: 'Each leg of a saved parlay as it hits or misses.' },
]
const hourFmt = (h: number) => new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).format(new Date(2026, 0, 1, h))
const HOURS = Array.from({ length: 24 }, (_, h) => h)

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
  const live = { ...NO_LIVE, ...data.prefs.live }
  const setLive = (k: keyof LivePrefs, v: boolean) => setPrefs({ live: { ...live, [k]: v } })
  const quiet = data.prefs.quiet ?? null
  const nothing = !data.prefs.picks.length && !data.prefs.moves && !data.prefs.lab && !Object.values(live).some(Boolean)
    && !data.targets.length && !data.parlays.length
  const err = on.error || off.error || save.error || untarget.error || unparlay.error

  if (!endpoint) {
    return (
      <Shell>
        <div className='flex flex-col gap-3 rounded-[18px] bg-card p-4'>
          <p className='text-sm leading-relaxed text-muted-foreground'>
            A ping on this device for the things you pick: DeVig picks, prices reaching your number, line moves, and live
            scores, big plays and parlay legs from games you follow. Nothing is on until you choose it. Works with DeVig closed.
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
      {nothing && (
        <p className='rounded-[18px] border border-devig/40 bg-devig/10 p-4 text-sm leading-relaxed'>
          <b>Nothing pings yet.</b> <span className='text-muted-foreground'>Pick what you want below. Everything starts off.</span>
        </p>
      )}
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

      <div className={cn('overflow-hidden rounded-[18px] bg-card', busy && 'opacity-80')}>
        <div className='border-b px-4 pt-3 pb-2.5'>
          <p className='text-xs font-bold tracking-wide text-muted-foreground'>LIVE GAMES</p>
          <p className='mt-1 text-xs leading-relaxed text-muted-foreground'>
            Only games you ★ track, games with a ★ tracked prop, and games on a saved parlay. Football, basketball and hockey.
          </p>
        </div>
        {LIVE_ROWS.map((r) => (
          <Row key={r.k} title={r.title} sub={r.sub}>
            <Switch checked={live[r.k]} disabled={busy} onCheckedChange={(v) => setLive(r.k, v)} aria-label={`${r.title} alerts`} className='mt-1' />
          </Row>
        ))}
      </div>

      <div className={cn('overflow-hidden rounded-[18px] bg-card', busy && 'opacity-80')}>
        <Row title='Quiet hours' sub={quiet ? `Nothing sends from ${hourFmt(quiet.from)} to ${hourFmt(quiet.to)}. Missed pings are skipped, not saved up.` : 'Hold every alert overnight.'}>
          <Switch checked={!!quiet} disabled={busy} onCheckedChange={(v) => setPrefs({ quiet: v ? { from: 23, to: 8 } : null })}
            aria-label='Quiet hours' className='mt-1' />
        </Row>
        {quiet && (
          <div className='flex items-center gap-2 px-4 pb-3 text-sm'>
            {(['from', 'to'] as const).map((k, i) => (
              <label key={k} className='flex items-center gap-2'>
                <span className='text-muted-foreground'>{i ? 'to' : 'From'}</span>
                <select value={quiet[k]} disabled={busy} onChange={(e) => setPrefs({ quiet: { ...quiet, [k]: Number(e.target.value) } })}
                  className='h-9 rounded-full border bg-background px-3 font-semibold tabular-nums'>
                  {HOURS.map((h) => <option key={h} value={h} disabled={h === quiet[k === 'from' ? 'to' : 'from']}>{hourFmt(h)}</option>)}
                </select>
              </label>
            ))}
          </div>
        )}
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
        On for {data.devices.length === 1 ? 'this device' : `this device and ${others} more`}. While games are on, DeVig
        checks about every minute, so live alerts land within a minute or two of the play. Prices are checked about every
        30 minutes otherwise. Alerts are information, never a bet.
      </p>
      <span className='sr-only' aria-live='polite'>{tested ? 'Test sent' : ''}</span>
    </Shell>
  )
}
