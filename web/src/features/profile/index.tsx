import { useEffect, useMemo, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Check, LogIn, LogOut, Star, X } from 'lucide-react'
import { type Account, SIGN_IN, SIGN_OUT, type Prefs, useAccount, useJoin, usePrefs, useSyncNote } from '@/lib/profile'
import { gameCode, rsIndexQuery } from '@/lib/research'
import { useGames } from '@/lib/devig'
import { overTxt, underTxt, useProps } from '@/lib/props'
import { parsePropKey, useTracked } from '@/lib/track'
import { TrackButton } from '@/components/track-button'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ThemeSwitch } from '@/components/theme-switch'
import { TeamChip } from '@/features/research'

// Profile: the name tag, favorite teams, and the free account that keeps them on every device.
// Same rules as the classic app: without an account (where accounts exist), name and teams are locked.

const whenFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
const SPORTS = ['NFL', 'NBA', 'MLB', 'NHL', 'WNBA', 'CFB'] as const

type Team = { code: string; name: string; color?: string | null }

// every team per sport: the stats files list whole leagues; games add any team they don't have
function useTeams() {
  const qs = useQueries({ queries: SPORTS.map((s) => rsIndexQuery(s)) })
  const { rows } = useGames()
  const loading = qs.some((q) => q.isLoading)
  const data = qs.map((q) => q.data)
  return useMemo(() => {
    const out: Record<string, Map<string, Team>> = {}
    SPORTS.forEach((s, i) => {
      const m = (out[s] = new Map())
      for (const t of data[i]?.teams ?? []) { const c = gameCode(s, t.code); m.set(c, { code: c, name: t.name, color: t.color }) }
    })
    for (const r of rows) {
      const m = out[r.sport] ?? (out[r.sport] = new Map())
      if (!m.has(r.away)) m.set(r.away, { code: r.away, name: r.awayName, color: r.colors?.away })
      if (!m.has(r.home)) m.set(r.home, { code: r.home, name: r.homeName, color: r.colors?.home })
    }
    return { loading, bySport: out }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, rows, ...data])
}

function AccountCard({ acct }: { acct: Account | undefined }) {
  const note = useSyncNote()
  const join = useJoin()
  const [code, setCode] = useState('')
  if (!acct) return <Skeleton className='h-36 w-full rounded-[18px]' />
  if (acct.state === 'device') {
    return (
      <section className='rounded-[18px] bg-card p-4 text-sm text-muted-foreground'>
        Saved on this device{acct.why ? ` (${acct.why})` : ''}.
      </section>
    )
  }
  if (acct.state === 'guest') {
    return (
      <section className='flex flex-col gap-3 rounded-[18px] bg-card p-4'>
        <h2 className='font-display text-[22px] font-extrabold leading-tight'>You&apos;re using DeVig as a guest</h2>
        <p className='text-sm leading-relaxed text-muted-foreground'>
          A free account saves what you track, your name tag and favorite teams on every device. Sign in
          with your email: you get a 6-digit code, no password. A new account needs the invite code from the person who
          shared DeVig.
        </p>
        <a href={SIGN_IN} className='inline-flex h-11 items-center justify-center gap-2 self-start rounded-full bg-devig px-5 font-bold text-devig-ink'>
          <LogIn className='size-4' aria-hidden='true' /> Sign in or create account
        </a>
      </section>
    )
  }
  const signOut = (
    <a href={SIGN_OUT} className='inline-flex h-10 items-center gap-1.5 self-start rounded-full border px-4 text-sm font-semibold'>
      <LogOut className='size-4' aria-hidden='true' /> Sign out
    </a>
  )
  if (acct.state === 'invite') {
    return (
      <section className='flex flex-col gap-3 rounded-[18px] bg-card p-4'>
        <h2 className='font-display text-[22px] font-extrabold leading-tight'>One step left</h2>
        <p className='text-sm text-muted-foreground'>Signed in as <b className='text-foreground'>{acct.email}</b>. Enter the invite code to open your account.</p>
        <form className='flex gap-2' onSubmit={(e) => { e.preventDefault(); if (code.trim()) join.mutate({ code, email: acct.email }) }}>
          <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={64} autoComplete='off' autoCapitalize='off' spellCheck={false}
            aria-label='Invite code' placeholder='From the person who shared DeVig'
            className='h-11 min-w-0 flex-1 rounded-xl border bg-background px-3 text-base outline-none focus:border-foreground' />
          <button type='submit' disabled={join.isPending || !code.trim()}
            className='h-11 shrink-0 rounded-xl bg-devig px-4 font-bold text-devig-ink disabled:opacity-50'>
            {join.isPending ? 'Checking…' : 'Open account'}
          </button>
        </form>
        {join.error && <p role='alert' className='text-sm text-bad'>{join.error.message}</p>}
        {signOut}
      </section>
    )
  }
  return (
    <section className='flex flex-col gap-3 rounded-[18px] bg-card p-4'>
      <p className='flex items-center gap-2 text-sm'>
        <Check className='size-4 shrink-0 text-good' aria-hidden='true' />
        <span className='min-w-0'>Signed in as <b>{acct.email}</b>. {note || 'Saved to your account.'}</span>
      </p>
      {signOut}
    </section>
  )
}

function NameTag({ prefs, update, locked }: { prefs: Prefs; update: (fn: (p: Prefs) => Prefs) => void; locked: boolean }) {
  const [v, setV] = useState(prefs.name)
  useEffect(() => { setV(prefs.name) }, [prefs.name]) // an account load can change it
  useEffect(() => {
    if (v.trim() === prefs.name) return
    const t = setTimeout(() => update((p) => ({ ...p, name: v.trim().slice(0, 24) })), 500)
    return () => clearTimeout(t)
  }, [v, prefs.name, update])
  return (
    <label className='flex flex-col gap-1.5'>
      <span className='px-1 font-display text-[22px] font-extrabold'>Name tag</span>
      <input value={v} onChange={(e) => setV(e.target.value)} maxLength={24} autoComplete='nickname' disabled={locked}
        placeholder='What DeVig calls you'
        className='h-12 rounded-xl border bg-card px-3 text-base outline-none focus:border-foreground disabled:opacity-50' />
    </label>
  )
}

function Favorites({ prefs, update, locked }: { prefs: Prefs; update: (fn: (p: Prefs) => Prefs) => void; locked: boolean }) {
  const { loading, bySport } = useTeams()
  const set = (sport: string, list: string[]) => update((p) => ({ ...p, teams: { ...p.teams, [sport]: list } }))
  const sports = [...SPORTS, ...Object.keys(prefs.teams).filter((s) => !(SPORTS as readonly string[]).includes(s))]
  return (
    <section aria-label='Favorite teams' className='flex flex-col gap-2'>
      <h2 className='px-1 font-display text-[22px] font-extrabold'>Favorite teams</h2>
      <p className='px-1 text-sm text-muted-foreground'>Their games come first on Games and show under Mine, here and in the classic app.</p>
      {loading ? <Skeleton className='h-72 w-full rounded-[18px]' /> : (
        <ul className={cn('overflow-hidden rounded-[18px] bg-card', locked && 'pointer-events-none opacity-50')} aria-disabled={locked || undefined}>
          {sports.map((s) => {
            const all = bySport[s] ?? new Map<string, Team>()
            const fav = prefs.teams[s] ?? []
            const left = [...all.values()].filter((t) => !fav.includes(t.code)).sort((a, b) => a.name.localeCompare(b.name))
            if (!all.size && !fav.length) return null
            return (
              <li key={s} className='flex flex-col gap-2 border-b px-4 py-3 last:border-b-0'>
                <span className='text-xs font-bold tracking-wide text-muted-foreground'>{s}</span>
                <div className='flex flex-wrap gap-2'>
                  {fav.map((c) => {
                    const t = all.get(c)
                    return (
                      <button key={c} type='button' disabled={locked} onClick={() => set(s, fav.filter((x) => x !== c))}
                        aria-label={`Remove ${t?.name ?? c}`}
                        className='flex h-10 items-center gap-2 rounded-full border border-foreground ps-1 pe-3 text-sm font-semibold'>
                        <TeamChip sport={s} code={c} color={t?.color} className='h-8 w-8 rounded-full' />
                        {t?.name ?? c}
                        <X className='size-4 text-muted-foreground' aria-hidden='true' />
                      </button>
                    )
                  })}
                  {left.length > 0 && (
                    <select value='' disabled={locked} aria-label={`Add a ${s} team`}
                      onChange={(e) => e.target.value && set(s, [...fav, e.target.value])}
                      className='h-10 min-w-0 max-w-full rounded-full border border-dashed bg-transparent px-3 text-sm text-muted-foreground'>
                      <option value=''>+ Add team</option>
                      {left.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
                    </select>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function Tracking({ locked }: { locked: boolean }) {
  const { tracked, set, clear } = useTracked()
  const { rows } = useGames()
  const { lines } = useProps()
  const [sure, setSure] = useState(false)
  const gKeys = Object.keys(tracked.g)
  const pKeys = Object.keys(tracked.p).filter((k) => parsePropKey(k))
  const games = rows.filter((r) => tracked.g[r.trackKey]).sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff))
  const props = pKeys.map((k) => {
    const f = parsePropKey(k)!
    const l = lines.find((x) => x.away === f.away && x.home === f.home && x.player === f.player && x.stat === f.stat && x.line === f.line && x.kickoff.slice(0, 10) === f.date)
    return { k, f, l }
  }).sort((a, b) => a.f.date.localeCompare(b.f.date) || a.f.player.localeCompare(b.f.player))
  const off = gKeys.length - games.length
  return (
    <section aria-label='Tracking' className='flex flex-col gap-2'>
      <h2 className='px-1 font-display text-[22px] font-extrabold'>Tracking</h2>
      {!gKeys.length && !pKeys.length ? (
        <p className='rounded-[18px] border border-dashed p-6 text-center text-sm text-muted-foreground'>
          Nothing tracked yet. Tap <Star className='inline size-3.5 align-[-2px]' aria-hidden='true' /> Track on a game or a prop; Games&apos; <b>Mine</b> filter shows them with your teams&apos; games.
        </p>
      ) : (
        <ul className={cn('overflow-hidden rounded-[18px] bg-card', locked && 'pointer-events-none opacity-50')}>
          {games.map((r) => (
            <li key={r.id} className='flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0'>
              <Link to='/game/$id' params={{ id: r.id }} className='min-w-0 flex-1'>
                <span className='block truncate font-semibold'>{r.awayName} at {r.homeName}</span>
                <span className='block text-xs text-muted-foreground'>
                  {r.sport} · {r.state === 'in' ? `Live · ${r.detail}` : r.state === 'post' ? `Final ${r.awayScore}–${r.homeScore}` : whenFmt.format(new Date(r.kickoff))}
                </span>
              </Link>
              <TrackButton kind='g' compact keys={[r.trackKey]} label={`${r.awayName} at ${r.homeName}`} />
            </li>
          ))}
          {props.map(({ k, f, l }) => (
            <li key={k} className='flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0'>
              <span className='min-w-0 flex-1'>
                <span className='block truncate font-semibold'>
                  {f.player} {f.side === 'UNDER' ? underTxt(f.stat, f.line) : overTxt(f.stat, f.line)}
                </span>
                <span className='block text-xs text-muted-foreground tabular-nums'>
                  {f.away} at {f.home} · {l && l.bid != null && l.ask != null
                    ? `Kalshi ${f.side === 'UNDER' ? `${Math.round((1 - l.ask) * 100)}–${Math.round((1 - l.bid) * 100)}` : `${Math.round(l.bid * 100)}–${Math.round(l.ask * 100)}`}¢ now`
                    : 'not on the board now'}
                </span>
              </span>
              <button type='button' onClick={() => set('p', [k], false)} aria-label={`Stop tracking ${f.player}`}
                className='grid size-8 shrink-0 place-items-center rounded-full border border-devig bg-devig/15 text-devig'>
                <Star className='size-4 fill-current' aria-hidden='true' />
              </button>
            </li>
          ))}
          {off > 0 && (
            <li className='px-4 py-2.5 text-xs text-muted-foreground'>
              And {off} tracked {off === 1 ? 'game' : 'games'} that {off === 1 ? 'is' : 'are'}n&apos;t on the board now.
            </li>
          )}
        </ul>
      )}
      {(gKeys.length > 0 || pKeys.length > 0) && !locked && (
        <button type='button' onClick={() => { if (sure) { clear(); setSure(false) } else setSure(true) }} onBlur={() => setSure(false)}
          className={cn('h-10 self-start rounded-full border px-4 text-sm font-semibold', sure ? 'border-bad text-bad' : 'text-muted-foreground')}>
          {sure ? 'Tap again to stop tracking everything' : 'Clear tracking'}
        </button>
      )}
    </section>
  )
}

export function Profile() {
  const { data: acct } = useAccount()
  const { prefs, update } = usePrefs()
  // like classic: where accounts exist, name and teams need one; elsewhere they're saved on the device
  const locked = !acct || acct.state === 'guest' || acct.state === 'invite'
  const hi = prefs.name ? `Hi, ${prefs.name}` : 'Name tag and favorite teams'
  return (
    <>
      <Header>
        <div className='me-auto min-w-0'>
          <h1 className='font-display text-[26px] leading-none font-black'>Profile</h1>
          <p className='mt-0.5 truncate text-xs text-muted-foreground'>{hi}</p>
        </div>
        <ThemeSwitch />
      </Header>
      <Main className='flex flex-col gap-6'>
        <AccountCard acct={acct} />
        {acct && locked && (
          <p className='-mt-3 px-1 text-sm text-muted-foreground'>
            Tracking, name tag and favorite teams open once you have an account.
          </p>
        )}
        <Tracking locked={locked} />
        <NameTag prefs={prefs} update={update} locked={locked} />
        <Favorites prefs={prefs} update={update} locked={locked} />
      </Main>
    </>
  )
}
