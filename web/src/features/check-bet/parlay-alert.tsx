import { Link } from '@tanstack/react-router'
import { Bell } from 'lucide-react'
import type { KLeg } from '@/lib/kalshi-link'
import { type ParlayAlert as PA, useAlerts, useRemoveParlay, useSetParlay, useThisDevice } from '@/lib/alerts'
import { useAccount } from '@/lib/profile'
import { cn } from '@/lib/utils'

// Under the parlay pulse while it plays: "Alert me" when each leg settles, and/or when the chance reaches a number.

const LEVELS = [0.02, 0.05, 0.1, 0.15, 0.2, 0.25, 0.33, 0.4, 0.5, 0.6, 0.67, 0.75, 0.8, 0.9]
const pct = (p: number) => `${Math.round(p * 100)}%`

// the same parlay gets the same id on every device: its legs, in order
export function parlayId(legs: { ticker: string | null; side: string }[]) {
  let h = 5381
  for (const c of legs.map((l) => `${l.ticker}:${l.side}`).sort().join('|')) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0
  return `p${h.toString(36)}${legs.length}`
}

export function ParlayAlert({ legs, now, label }: { legs: KLeg[]; now: number; label: string | null }) {
  const { data: acct } = useAccount()
  const { data } = useAlerts()
  const here = useThisDevice()
  const set = useSetParlay()
  const remove = useRemoveParlay()
  if (acct?.state !== 'joined' || legs.some((l) => !l.ticker)) return null
  const id = parlayId(legs)
  const cur = data?.parlays.find((p) => p.id === id) ?? null
  if (!data?.ready || !here.data) {
    return (
      <Link to='/profile' className='mt-3 flex h-10 items-center gap-2 border-t pt-3 text-sm font-semibold text-muted-foreground'>
        <Bell className='size-4' aria-hidden='true' />Alerts for this parlay: turn them on in Profile
      </Link>
    )
  }
  const save = (settle: boolean, at: number | null) => {
    if (!settle && at == null) { remove.mutate(id); return }
    const p: PA = {
      id, label: label ?? '', settle, at, from: at == null ? null : Math.round(now * 1000) / 1000,
      legs: legs.map((l) => ({ ticker: l.ticker!, side: l.side === 'no' ? 'no' : 'yes', label: (l.side === 'no' ? `No: ${l.title || l.pick}` : l.title || l.pick || '').slice(0, 60) })),
    }
    set.mutate(p)
  }
  const busy = set.isPending || remove.isPending
  const settle = cur?.settle ?? false
  const at = cur?.at ?? null
  const levels = LEVELS.filter((v) => Math.abs(v - now) >= 0.02)
  const err = set.error || remove.error
  return (
    <div className='mt-3 flex flex-col gap-2 border-t pt-3'>
      <p className='flex items-center gap-1.5 text-xs font-bold tracking-wide text-muted-foreground'>
        <Bell className={cn('size-3.5', (settle || at != null) && 'text-devig')} aria-hidden='true' />ALERT ME
      </p>
      <div className='flex flex-wrap items-center gap-2'>
        <button type='button' aria-pressed={settle} disabled={busy} onClick={() => save(!settle, at)}
          className={cn('h-9 rounded-full border px-3 text-sm font-semibold', settle ? 'border-devig bg-devig/15 text-devig' : 'text-muted-foreground')}>
          When a leg settles
        </button>
        <label className={cn('flex h-9 items-center gap-1 rounded-full border ps-3 pe-1 text-sm font-semibold', at != null ? 'border-devig bg-devig/15 text-devig' : 'text-muted-foreground')}>
          When it reaches
          <select value={at ?? ''} disabled={busy} aria-label='Chance to alert at'
            onChange={(e) => save(settle, e.target.value === '' ? null : Number(e.target.value))}
            className='h-8 rounded-full bg-transparent px-1 tabular-nums outline-none'>
            <option value=''>—</option>
            {levels.map((v) => <option key={v} value={v}>{pct(v)}</option>)}
          </select>
        </label>
      </div>
      {err && <p role='alert' className='text-sm text-bad'>{err.message}</p>}
    </div>
  )
}
