import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Check, ChevronRight, Copy, Share2, UserPlus, Users } from 'lucide-react'
import { useAccount } from '@/lib/profile'
import { type Friend, formatCode, record, shareLink, useFriend, useFriendOp, useFriends } from '@/lib/friends'
import { type TrackedLeg } from '@/lib/track'
import { type Leg, useSlip } from '@/lib/parlay'
import { type GameRow, useGames } from '@/lib/devig'
import { useProps } from '@/lib/props'
import { mlLeg, propLeg } from '@/features/parlay/legs'
import { type Graded, OpenCard, YourParlays, useGradedParlays } from '@/features/history/parlays'
import { FriendSaved } from '@/features/check-bet/link-reader'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ThemeSwitch } from '@/components/theme-switch'

// Friends: follow people by their friend code and see the parlays they saved, graded live, with their record and
// the return on what they put in. Tail copies a friend's parlay into your own slip at today's prices.

const money = (v: number) => `$${Math.abs(v) >= 1000 ? Math.round(Math.abs(v)).toLocaleString() : Math.abs(v).toFixed(2)}`
const signed = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '') + money(v)
const pct = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v * 100))}%`

function NeedsAccount() {
  return (
    <section className='flex flex-col gap-3 rounded-[18px] bg-card p-4'>
      <h2 className='font-display text-[22px] font-extrabold leading-tight'>Friends need an account</h2>
      <p className='text-sm leading-relaxed text-muted-foreground'>
        Sign in on Profile to follow friends and see the parlays they save. Your own stay private until you turn sharing on.
      </p>
      <Link to='/profile' className='inline-flex h-11 items-center self-start rounded-full bg-devig px-5 font-bold text-devig-ink'>Go to Profile</Link>
    </section>
  )
}

// ---------- your sharing ----------
function Sharing({ me }: { me: { code: string | null; share: boolean } }) {
  const op = useFriendOp()
  const [sure, setSure] = useState(false)
  const [copied, setCopied] = useState(false)
  useEffect(() => { if (!copied) return; const t = setTimeout(() => setCopied(false), 2000); return () => clearTimeout(t) }, [copied])
  useEffect(() => { if (!sure) return; const t = setTimeout(() => setSure(false), 3000); return () => clearTimeout(t) }, [sure])
  const send = async () => {
    if (!me.code) return
    const url = shareLink(me.code)
    try {
      if (navigator.share) await navigator.share({ title: 'Follow my parlays on DeVig', url })
      else { await navigator.clipboard.writeText(url); setCopied(true) }
    } catch { /* closed the share sheet */ }
  }
  return (
    <section aria-label='Your sharing' className='flex flex-col gap-3 rounded-[18px] bg-card p-4'>
      <div className='flex items-start gap-3'>
        <div className='min-w-0 flex-1'>
          <h2 className='font-display text-xl font-extrabold leading-tight'>Let friends see my parlays</h2>
          <p className='mt-1 text-sm leading-relaxed text-muted-foreground'>
            People with your code see your name tag and the parlays you save, stakes included. Nothing else on your account.
          </p>
        </div>
        <button type='button' role='switch' aria-checked={me.share} aria-label='Let friends see my parlays'
          disabled={op.isPending} onClick={() => op.mutate({ op: 'share', on: !me.share })}
          className={cn('relative mt-1 h-8 w-14 shrink-0 rounded-full transition-colors motion-reduce:transition-none disabled:opacity-60', me.share ? 'bg-devig' : 'bg-muted')}>
          <span className={cn('absolute top-1 left-1 size-6 rounded-full bg-background shadow transition-transform motion-reduce:transition-none', me.share && 'translate-x-6')} />
        </button>
      </div>
      {me.share && me.code && (
        <div className='flex flex-col gap-2 rounded-xl bg-muted p-3'>
          <span className='text-xs font-bold tracking-wide text-muted-foreground uppercase'>Your friend code</span>
          <span className='font-condensed text-[28px] font-bold leading-none tracking-wider tabular-nums'>{formatCode(me.code)}</span>
          <div className='flex flex-wrap gap-2 pt-1'>
            <button type='button' onClick={send} className='inline-flex h-10 items-center gap-1.5 rounded-full bg-foreground px-4 text-sm font-bold text-background'>
              {typeof navigator !== 'undefined' && 'share' in navigator ? <Share2 className='size-4' aria-hidden='true' /> : <Copy className='size-4' aria-hidden='true' />}
              {copied ? 'Link copied' : 'Send my link'}
            </button>
            <button type='button' disabled={op.isPending} onClick={() => { if (sure) { op.mutate({ op: 'code' }); setSure(false) } else setSure(true) }}
              className={cn('h-10 rounded-full border px-4 text-sm font-semibold', sure ? 'border-bad text-bad' : 'text-muted-foreground')}>
              {sure ? 'Tap again: old code stops working' : 'New code'}
            </button>
          </div>
        </div>
      )}
      {op.error && <p role='alert' className='text-sm text-bad'>{op.error.message}</p>}
    </section>
  )
}

function AddFriend() {
  const op = useFriendOp()
  const [code, setCode] = useState('')
  return (
    <section aria-label='Add a friend' className='flex flex-col gap-2'>
      <form className='flex gap-2' onSubmit={(e) => { e.preventDefault(); if (code.trim()) op.mutate({ op: 'follow', code }, { onSuccess: () => setCode('') }) }}>
        <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={14} autoComplete='off' autoCapitalize='characters' spellCheck={false}
          aria-label="A friend's code" placeholder="A friend's code"
          className='h-11 min-w-0 flex-1 rounded-xl border bg-card px-3 font-condensed text-lg tracking-wider uppercase outline-none placeholder:font-sans placeholder:text-base placeholder:tracking-normal placeholder:normal-case focus:border-foreground' />
        <button type='submit' disabled={op.isPending || !code.trim()}
          className='inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-devig px-4 font-bold text-devig-ink disabled:opacity-50'>
          <UserPlus className='size-4' aria-hidden='true' /> {op.isPending ? 'Finding…' : 'Follow'}
        </button>
      </form>
      {op.error && <p role='alert' className='px-1 text-sm text-bad'>{op.error.message}</p>}
    </section>
  )
}

// ---------- the people you follow, and what they're playing ----------
type Mine = Graded & { owner: string; ownerCode: string }

function Initial({ name, className }: { name: string; className?: string }) {
  return (
    <span aria-hidden='true' className={cn('grid shrink-0 place-items-center rounded-full bg-devig/15 font-display font-black text-devig', className)}>
      {(name.trim()[0] || '?').toUpperCase()}
    </span>
  )
}

function FriendRow({ f, graded }: { f: Friend; graded: Mine[] }) {
  const settled = graded.filter((p) => p.status === 'hit' || p.status === 'missed')
  const r = record(settled)
  const open = graded.length - settled.length
  const line = !f.share
    ? f.gone ? 'Changed their code; ask them for the new one' : 'Sharing is off right now'
    : settled.length
      ? `${r.hit}–${r.missed} · ${signed(r.net)}${r.roi != null ? ` · ${pct(r.roi)} return` : ''}`
      : f.parlays.length ? 'Nothing settled yet'
        : f.saved?.length ? `${f.saved.length} saved ${f.saved.length === 1 ? 'bet' : 'bets'}` : 'Nothing shared yet'
  return (
    <li className='border-b last:border-b-0'>
      <Link to='/friends/$code' params={{ code: f.code }} className='flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-muted/50'>
        <Initial name={f.name} className='size-10 text-lg' />
        <span className='min-w-0 flex-1'>
          <span className='block truncate font-display text-xl font-extrabold leading-tight'>{f.name}</span>
          <span className={cn('block truncate text-sm tabular-nums', f.share && settled.length ? (r.net >= 0 ? 'text-good' : 'text-bad') : 'text-muted-foreground')}>{line}</span>
        </span>
        {open > 0 && <span className='shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-bold'>{open} open</span>}
        <ChevronRight className='size-5 shrink-0 text-muted-foreground' aria-hidden='true' />
      </Link>
    </li>
  )
}

export function Friends() {
  const { data: acct } = useAccount()
  const joined = acct?.state === 'joined'
  const q = useFriends(joined)
  const friends = q.data?.friends ?? []
  const all = useMemo(
    () => friends.flatMap((f) => f.parlays.map((p) => ({ ...p, id: `${f.code}:${p.id}`, owner: f.name, ownerCode: f.code }))),
    [friends]
  )
  const graded = useGradedParlays(all) as Mine[]
  const playing = graded.filter((p) => p.status === 'live' || p.status === 'upcoming')
    .sort((a, b) => (a.status === b.status ? String(b.at).localeCompare(String(a.at)) : a.status === 'live' ? -1 : 1))
  return (
    <>
      <Header>
        <div className='me-auto min-w-0'>
          <h1 className='font-display text-[26px] leading-none font-black'>Friends</h1>
          <p className='mt-0.5 truncate text-xs text-muted-foreground'>Their saved parlays, graded as their games go</p>
        </div>
        <ThemeSwitch />
      </Header>
      <Main className='flex flex-col gap-6'>
        {!acct ? <Skeleton className='h-36 w-full rounded-[18px]' /> : !joined ? <NeedsAccount /> : q.isLoading ? (
          <Skeleton className='h-48 w-full rounded-[18px]' />
        ) : q.error ? (
          <p role='alert' className='rounded-[18px] bg-card p-4 text-sm text-bad'>{q.error.message}</p>
        ) : (
          <>
            <Sharing me={q.data!.me} />
            <section aria-label='Following' className='flex flex-col gap-2'>
              <h2 className='px-1 font-display text-[22px] font-extrabold'>Following</h2>
              <AddFriend />
              {friends.length ? (
                <ul className='overflow-hidden rounded-[18px] bg-card'>
                  {friends.map((f) => <FriendRow key={f.code} f={f} graded={graded.filter((p) => p.ownerCode === f.code)} />)}
                </ul>
              ) : (
                <p className='flex flex-col items-center gap-2 rounded-[18px] border border-dashed p-6 text-center text-sm text-muted-foreground'>
                  <Users className='size-6' aria-hidden='true' />
                  No one yet. Ask a friend for their code or link: it&apos;s on their Friends page once they turn sharing on.
                </p>
              )}
            </section>
            {playing.length > 0 && (
              <section aria-label="What they're playing" className='flex flex-col gap-2'>
                <h2 className='px-1 font-display text-[22px] font-extrabold'>What they&apos;re playing</h2>
                {playing.map((p) => (
                  <OpenCard key={p.id} p={p} by={p.owner} foot={{ own: false, action: (x) => <TailButton p={x} /> }} />
                ))}
              </section>
            )}
          </>
        )}
      </Main>
    </>
  )
}

// ---------- one friend ----------
export function FriendPage({ code }: { code: string }) {
  const { data: acct } = useAccount()
  const joined = acct?.state === 'joined'
  const q = useFriend(code, joined)
  const op = useFriendOp()
  const f = q.data
  return (
    <>
      <Header>
        <div className='me-auto flex min-w-0 items-center gap-3'>
          {f && <Initial name={f.name} className='size-9 text-base' />}
          <div className='min-w-0'>
            <h1 className='truncate font-display text-[26px] leading-none font-black'>{f?.name ?? 'Friend'}</h1>
            <p className='mt-0.5 truncate text-xs text-muted-foreground'>
              <Link to='/friends' className='underline-offset-2 hover:underline'>Friends</Link> · {formatCode(code)}
            </p>
          </div>
        </div>
        <ThemeSwitch />
      </Header>
      <Main className='flex flex-col gap-5'>
        {!acct ? <Skeleton className='h-36 w-full rounded-[18px]' /> : !joined ? <NeedsAccount /> : q.isLoading ? (
          <Skeleton className='h-64 w-full rounded-[18px]' />
        ) : q.error || !f ? (
          <p role='alert' className='rounded-[18px] bg-card p-4 text-sm text-bad'>{q.error?.message ?? 'No one has that code.'}</p>
        ) : (
          <>
            {f.following ? (
              <div className='flex items-center gap-2'>
                <span className='inline-flex h-10 items-center gap-1.5 rounded-full bg-good/15 px-4 text-sm font-bold text-good'>
                  <Check className='size-4' aria-hidden='true' /> Following
                </span>
                <button type='button' disabled={op.isPending} onClick={() => op.mutate({ op: 'unfollow', code: f.code })}
                  className='h-10 rounded-full px-3 text-sm font-semibold text-muted-foreground hover:text-foreground disabled:opacity-60'>
                  Unfollow
                </button>
              </div>
            ) : (
              <button type='button' disabled={op.isPending} onClick={() => op.mutate({ op: 'follow', code: f.code })}
                className='inline-flex h-11 items-center gap-1.5 self-start rounded-full bg-devig px-5 font-bold text-devig-ink disabled:opacity-60'>
                <UserPlus className='size-4' aria-hidden='true' /> Follow {f.name}
              </button>
            )}
            {op.error && <p role='alert' className='text-sm text-bad'>{op.error.message}</p>}
            {!f.share ? (
              <p className='rounded-[18px] border border-dashed p-6 text-center text-sm text-muted-foreground'>
                {f.name} has sharing off right now. Their parlays show here once it&apos;s back on.
              </p>
            ) : (
              <>
                {f.parlays.length > 0 && (
                  <YourParlays list={f.parlays} owner={f.name} action={(p) => (p.status === 'upcoming' ? <TailButton p={p} /> : null)} />
                )}
                <FriendSaved list={f.saved ?? []} owner={f.name} />
                {!f.parlays.length && !f.saved?.length && (
                  <p className='rounded-[18px] border border-dashed p-6 text-center text-sm leading-relaxed text-muted-foreground'>
                    Nothing from {f.name} yet. Bets they save show here once they open DeVig signed in on Profile. If theirs
                    say &ldquo;Saved on this device only&rdquo;, they aren&apos;t signed in on that phone.
                  </p>
                )}
              </>
            )}
          </>
        )}
      </Main>
    </>
  )
}

// ---------- Tail: their legs into your slip, at today's prices ----------
function findRow(l: TrackedLeg, rows: GameRow[]) {
  const t = l.kickoff ? Date.parse(l.kickoff) : NaN
  return rows.find((r) => r.sport === l.sport && r.away === l.away && r.home === l.home &&
    (!isFinite(t) || Math.abs(Date.parse(r.kickoff) - t) < 18 * 3600e3)) ?? null
}

function TailButton({ p }: { p: Graded }) {
  const { rows } = useGames()
  const { lines } = useProps()
  const slip = useSlip()
  const [done, setDone] = useState<string | null>(null)
  useEffect(() => { if (!done) return; const t = setTimeout(() => setDone(null), 4000); return () => clearTimeout(t) }, [done])
  const legs = useMemo(() => p.legs.map((l): Leg | null => {
    if (l.mk === 'ml') {
      const r = findRow(l, rows)
      return r && r.state === 'pre' && (l.side === 'home' || l.side === 'away') ? mlLeg(r, l.side) : null
    }
    const line = lines.find((x) => x.sport === l.sport && x.away === l.away && x.home === l.home && x.player === l.player &&
      x.stat === l.stat && x.line === l.line)
    return line && Date.parse(line.kickoff) > Date.now() ? propLeg(line, l.side === 'UNDER' ? 'under' : 'over') : null
  }), [p.legs, rows, lines])
  const ok = legs.filter((l): l is Leg => !!l)
  if (!ok.length) return null
  const tail = () => {
    const add = ok.filter((l) => !slip.has(l.id))
    slip.replace([...slip.legs, ...add])
    const n = p.legs.length
    setDone(ok.length === n ? `All ${n} legs are on your slip` : `${ok.length} of ${n} legs are on your slip; the rest aren't on the board now`)
  }
  return (
    <span className='flex min-w-0 items-center gap-2'>
      {done && <Link to='/parlay' className='truncate text-xs font-semibold text-devig underline-offset-2 hover:underline' aria-live='polite'>{done} →</Link>}
      <button type='button' onClick={tail} className='h-9 shrink-0 rounded-full bg-devig/15 px-3 text-xs font-bold text-devig'>
        Tail at today&apos;s prices
      </button>
    </span>
  )
}
