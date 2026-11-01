import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Bell, Minus, Plus, Trash2 } from 'lucide-react'
import { fmtOdds, useAlerts, useRemoveTarget, useSetTarget, useThisDevice } from '@/lib/alerts'
import { type GameRow } from '@/lib/devig'
import { useAccount } from '@/lib/profile'
import { cn } from '@/lib/utils'

// Game page → "Alert me at a price": a ping when Kalshi's price for one team reaches the odds picked, before the start.

// American odds step by 5, and skip the gap between -100 and +100 (both are even money)
export function stepOdds(o: number, d: number) {
  const v = o + d
  if (v > -100 && v < 100) return d > 0 ? 100 : -100
  return v
}

export function PriceAlert({ row }: { row: GameRow }) {
  const { data: acct } = useAccount()
  const { data } = useAlerts()
  const here = useThisDevice()
  const set = useSetTarget()
  const remove = useRemoveTarget()
  const [open, setOpen] = useState(false)
  const [side, setSide] = useState<'away' | 'home'>(row.pick?.side === row.home ? 'home' : 'away')
  const now = row.ml?.[side] ?? null
  const [odds, setOdds] = useState<number | null>(null)
  if (row.state !== 'pre' || !row.ticker || Date.parse(row.kickoff) <= Date.now()) return null

  const gid = row.id.split('|')[1] ?? row.id
  const mine = (data?.targets ?? []).filter((t) => t.ticker === row.ticker)
  const ready = acct?.state === 'joined' && data?.ready && here.data
  const want = odds ?? (now != null ? stepOdds(Math.round(now), 10) : 100)
  const team = side === 'home' ? row.homeName : row.awayName

  const save = () => set.mutate(
    { sport: row.sport, gid, away: row.away, home: row.home, kickoff: row.kickoff, ticker: row.ticker!, side, odds: want },
    { onSuccess: () => { setOpen(false); setOdds(null) } },
  )

  return (
    <section aria-label='Price alert' className='rounded-[18px] bg-card'>
      {mine.map((t) => (
        <div key={t.id} className='flex items-center gap-3 border-b px-4 py-2.5'>
          <Bell className='size-4 shrink-0 text-devig' aria-hidden='true' />
          <p className='min-w-0 flex-1 text-sm'>
            Alert at <b className='tabular-nums'>{t.side === 'home' ? row.homeName : row.awayName} {fmtOdds(t.odds)}</b> or better
          </p>
          <button type='button' onClick={() => remove.mutate(t.id)} disabled={remove.isPending} aria-label='Remove this price alert'
            className='grid size-9 shrink-0 place-items-center rounded-full border text-muted-foreground'>
            <Trash2 className='size-4' aria-hidden='true' />
          </button>
        </div>
      ))}
      {!open ? (
        <button type='button' onClick={() => setOpen(true)} aria-expanded={false}
          className='flex h-12 w-full items-center gap-2 px-4 text-sm font-semibold'>
          <Bell className='size-4' aria-hidden='true' />{mine.length ? 'Another price alert' : 'Alert me at a price'}
          <span className='ms-auto text-xs font-normal text-muted-foreground'>Before the start</span>
        </button>
      ) : !ready ? (
        <div className='flex flex-col gap-2 p-4 text-sm'>
          <p className='text-muted-foreground'>
            {acct?.state !== 'joined' ? 'Price alerts need a free account.' : 'Turn on alerts for this device first, in Profile.'}
          </p>
          <Link to='/profile' className='inline-flex h-10 items-center self-start rounded-full bg-devig px-4 font-bold text-devig-ink'>Go to Profile</Link>
        </div>
      ) : (
        <div className='flex flex-col gap-3 p-4'>
          <div className='grid grid-cols-2 gap-2' role='radiogroup' aria-label='Team'>
            {(['away', 'home'] as const).map((s) => (
              <button key={s} type='button' role='radio' aria-checked={side === s} onClick={() => { setSide(s); setOdds(null) }}
                className={cn('h-11 truncate rounded-xl border px-3 text-sm font-bold', side === s ? 'border-devig bg-devig/15 text-devig' : 'text-muted-foreground')}>
                {s === 'home' ? row.homeName : row.awayName}
              </button>
            ))}
          </div>
          <div className='flex items-center gap-3'>
            <button type='button' onClick={() => setOdds(stepOdds(want, -5))} aria-label='Lower'
              className='grid size-11 shrink-0 place-items-center rounded-full border'><Minus className='size-4' aria-hidden='true' /></button>
            <div className='min-w-0 flex-1 text-center'>
              <p className='font-display text-3xl font-black tabular-nums' aria-live='polite'>{fmtOdds(want)}</p>
              <p className='text-xs text-muted-foreground tabular-nums'>or better · Kalshi now {now != null ? fmtOdds(Math.round(now)) : '—'}</p>
            </div>
            <button type='button' onClick={() => setOdds(stepOdds(want, 5))} aria-label='Higher'
              className='grid size-11 shrink-0 place-items-center rounded-full border'><Plus className='size-4' aria-hidden='true' /></button>
          </div>
          <p className='text-xs leading-relaxed text-muted-foreground'>
            One ping when {team} is {fmtOdds(want)} or better on Kalshi. Prices are checked about every 30 minutes, so it can come a little late.
          </p>
          {set.error && <p role='alert' className='text-sm text-bad'>{set.error.message}</p>}
          <div className='flex gap-2'>
            <button type='button' onClick={save} disabled={set.isPending}
              className='h-11 flex-1 rounded-full bg-devig font-bold text-devig-ink disabled:opacity-50'>{set.isPending ? 'Saving…' : 'Set alert'}</button>
            <button type='button' onClick={() => { setOpen(false); setOdds(null) }}
              className='h-11 rounded-full border px-5 text-sm font-semibold'>Cancel</button>
          </div>
        </div>
      )}
    </section>
  )
}
