import { useState } from 'react'
import { Pencil } from 'lucide-react'
import type { KRead } from '@/lib/kalshi-link'
import type { SavedBet } from '@/lib/saved-merge'
import { cn } from '@/lib/utils'

// "Your bet" on a saved Kalshi bet: what you put in and what it pays if it hits. A Kalshi share link doesn't carry
// either, so you type them (Kalshi shows Cost and Payout on the position). Leave Pays empty and it's estimated from
// today's price: each contract pays $1, fees left out. Read-only on a friend's page.

const money = (x: number) => `$${x.toLocaleString(undefined, { minimumFractionDigits: x % 1 ? 2 : 0, maximumFractionDigits: 2 })}`
const num = (s: string) => { const v = parseFloat(s.replace(/[$,\s]/g, '')); return isFinite(v) && v >= 0 ? v : null }

export const hasBet = (b: SavedBet | undefined): b is SavedBet => !!b && b.stake > 0
export const betLine = (b: SavedBet) => `${money(b.stake)} to win ${money(Math.max(0, b.pays - b.stake))}`

// the price to buy now, for the estimate, and how it ended
export function betFacts(d: KRead): { price: number | null; result: 'won' | 'lost' | null } {
  if (d.kind === 'market') return { price: d.market.ask ?? d.market.chance, result: d.market.result }
  if (d.kind === 'combo') {
    const c = d.combo
    const result = c.result === 'won' || (d.won === d.legs.length && d.legs.length > 0) ? 'won' : c.result === 'lost' || d.lost > 0 ? 'lost' : null
    return { price: d.ticker === 'slip' ? d.multiplied : (c.ask ?? c.last ?? d.multiplied), result }
  }
  return { price: null, result: null }
}

export function BetBox({ bet, price, result, onSave, owner }: {
  bet: SavedBet | undefined; price: number | null; result: 'won' | 'lost' | null; onSave?: (b: SavedBet) => void; owner?: string
}) {
  const [editing, setEditing] = useState(false)
  const [stake, setStake] = useState('')
  const [pays, setPays] = useState('')
  const on = hasBet(bet)
  if (!onSave && !on) return null

  const st = num(stake)
  const guess = st && price && price > 0.005 && price < 1 ? st / price : null
  const open = () => { setStake(on ? String(bet.stake) : ''); setPays(on ? String(bet.pays) : ''); setEditing(true) }
  const save = (e: React.FormEvent) => {
    e.preventDefault()
    if (!st || !onSave) return
    const p = num(pays) ?? guess ?? st
    onSave({ stake: Math.round(st * 100) / 100, pays: Math.round(Math.max(p, st) * 100) / 100, at: Date.now() })
    setEditing(false)
  }

  if (editing && onSave) {
    return (
      <form onSubmit={save} className='rounded-[18px] bg-card p-4'>
        <h3 className='font-display text-xl font-extrabold'>Your bet</h3>
        <div className='mt-3 grid grid-cols-2 gap-2'>
          <label className='flex flex-col gap-1 text-xs font-semibold text-muted-foreground'>
            You put in
            <span className='flex h-11 items-center gap-1 rounded-xl border bg-background px-3 text-base text-foreground focus-within:border-foreground'>
              $<input value={stake} onChange={(e) => setStake(e.target.value)} inputMode='decimal' autoFocus placeholder='10'
                aria-label='You put in, dollars' className='h-full min-w-0 flex-1 bg-transparent tabular-nums outline-none placeholder:text-muted-foreground' />
            </span>
          </label>
          <label className='flex flex-col gap-1 text-xs font-semibold text-muted-foreground'>
            It pays if it hits
            <span className='flex h-11 items-center gap-1 rounded-xl border bg-background px-3 text-base text-foreground focus-within:border-foreground'>
              $<input value={pays} onChange={(e) => setPays(e.target.value)} inputMode='decimal' placeholder={guess ? guess.toFixed(2) : ''}
                aria-label='It pays if it hits, dollars' className='h-full min-w-0 flex-1 bg-transparent tabular-nums outline-none placeholder:text-muted-foreground' />
            </span>
          </label>
        </div>
        <p className='mt-2 text-xs leading-relaxed text-muted-foreground'>
          Kalshi shows both on your position (Cost and Payout).
          {guess && !pays.trim() ? ` Left empty, it's about ${money(Math.round(guess * 100) / 100)} at today's price, fees left out.` : ''}
        </p>
        <div className='mt-3 flex gap-2'>
          <button type='submit' disabled={!st} className='h-10 rounded-full bg-devig px-5 text-sm font-bold text-devig-ink disabled:opacity-50'>Save</button>
          <button type='button' onClick={() => setEditing(false)} className='h-10 rounded-full border px-4 text-sm font-semibold'>Cancel</button>
          {on && (
            <button type='button' onClick={() => { onSave({ stake: 0, pays: 0, at: Date.now() }); setEditing(false) }}
              className='ms-auto h-10 rounded-full px-3 text-sm font-semibold text-muted-foreground hover:text-foreground'>Clear</button>
          )}
        </div>
      </form>
    )
  }

  if (!on) {
    return (
      <button type='button' onClick={open}
        className='flex min-h-14 w-full items-center justify-between gap-3 rounded-[18px] border border-dashed px-4 py-3 text-start hover:bg-muted/40'>
        <span>
          <span className='block font-semibold'>How much did you bet?</span>
          <span className='block text-xs text-muted-foreground'>Add it to see what it pays.</span>
        </span>
        <Pencil className='size-4 shrink-0 text-muted-foreground' aria-hidden='true' />
      </button>
    )
  }

  const win = Math.max(0, bet.pays - bet.stake)
  return (
    <section aria-label={owner ? `${owner}'s bet` : 'Your bet'}
      className={cn('flex items-center gap-3 rounded-[18px] p-4', result === 'won' ? 'bg-good/10' : result === 'lost' ? 'bg-bad/10' : 'bg-card')}>
      <div className='min-w-0 flex-1'>
        <p className='text-xs font-semibold text-muted-foreground'>{owner ? `${owner}'s bet` : 'Your bet'}</p>
        <p className='font-display text-[22px] leading-tight font-extrabold tabular-nums'>{betLine(bet)}</p>
        <p className={cn('text-sm tabular-nums', result === 'won' ? 'text-good' : result === 'lost' ? 'text-bad' : 'text-muted-foreground')}>
          {result === 'won' ? `Won ${money(win)}` : result === 'lost' ? `Lost ${money(bet.stake)}` : `Pays ${money(bet.pays)} if it hits`}
        </p>
      </div>
      {onSave && (
        <button type='button' onClick={open} aria-label='Edit your bet'
          className='grid size-10 shrink-0 place-items-center rounded-full border text-muted-foreground hover:text-foreground'>
          <Pencil className='size-4' aria-hidden='true' />
        </button>
      )}
    </section>
  )
}
