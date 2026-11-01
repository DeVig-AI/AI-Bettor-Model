import { useEffect, useState } from 'react'
import { Check, Link2, Minus, X } from 'lucide-react'
import {
  type KLeg, type KRead, type Saved, LinkError, getSaved, labelFor, legLabel, readLink, storeSaved, useReadLink, useSaved,
} from '@/lib/kalshi-link'
import { ParlayReview } from './review'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

// Check a Kalshi bet from its Share link (one bet, a game, or a combo leg by leg), and keep links on this device.
// Used on History and on Parlay.

const timeFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const cents = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}¢`)
const pct = (v: number | null) => (v == null ? '—' : v < 0.01 && v > 0 ? `${(v * 100).toFixed(2)}%` : `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`)

function Mark({ r }: { r: KLeg['result'] }) {
  if (r === 'won') return <span className='grid size-6 shrink-0 place-items-center rounded-full bg-good/15 text-good'><Check className='size-3.5' aria-label='Won' /></span>
  if (r === 'lost') return <span className='grid size-6 shrink-0 place-items-center rounded-full bg-bad/15 text-bad'><X className='size-3.5' aria-label='Lost' /></span>
  return <span className='grid size-6 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground'><Minus className='size-3.5' aria-label='Not decided' /></span>
}

function Price({ l }: { l: KLeg }) {
  if (l.result) return <span className='text-sm font-semibold text-muted-foreground'>{l.result === 'won' ? 'Won' : 'Lost'}</span>
  const wide = l.bid != null && l.ask != null && l.ask - l.bid > 0.1
  return (
    <span className='text-end'>
      <span className='block font-condensed text-[17px] font-bold tabular-nums'>{pct(l.chance)}</span>
      <span className={cn('block text-xs tabular-nums text-muted-foreground', wide && 'text-[#F5C77A]')}>
        {l.bid == null && l.ask == null ? (l.last != null ? `last ${cents(l.last)}` : 'no offers') : `${cents(l.bid)}–${cents(l.ask)}`}
      </span>
    </span>
  )
}

function LegRow({ l }: { l: KLeg }) {
  return (
    <li className='flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0'>
      <Mark r={l.result} />
      <span className='min-w-0 flex-1'>
        <span className={cn('block font-semibold', l.result === 'lost' && 'text-bad')}>{legLabel(l)}</span>
        {!l.result && l.closes && <span className='block text-xs text-muted-foreground'>Closes {timeFmt.format(new Date(l.closes))}</span>}
      </span>
      <Price l={l} />
    </li>
  )
}

function Result({ d, review }: { d: KRead; review?: React.ReactNode }) {
  const updated = <p className='px-1 text-xs text-muted-foreground'>Kalshi&apos;s prices as of {timeFmt.format(new Date(d.fetched_at))}. Gold buy–sell gap = more than 10¢ apart, so the % is rough.</p>
  if (d.kind === 'market') {
    return (
      <div className='flex flex-col gap-2'>
        <ul className='overflow-hidden rounded-[18px] bg-card'><LegRow l={d.market} /></ul>
        {updated}
      </div>
    )
  }
  if (d.kind === 'event') {
    return (
      <div className='flex flex-col gap-2'>
        <h3 className='px-1 font-display text-xl font-extrabold'>{d.title || d.ticker}</h3>
        <ul className='overflow-hidden rounded-[18px] bg-card'>{d.markets.map((l) => <LegRow key={l.ticker} l={l} />)}</ul>
        {updated}
      </div>
    )
  }
  const c = d.combo
  const open = d.legs.length - d.won - d.lost
  const legs = [...d.legs].sort((a, b) => rank(a) - rank(b))
  const status = c.result === 'won' ? 'Won' : c.result === 'lost' || d.lost > 0 ? 'Lost' : open === 0 ? 'Every leg won' : 'Still alive'
  return (
    <div className='flex flex-col gap-2'>
      <section className={cn('rounded-[18px] p-4', status === 'Lost' ? 'bg-bad/10' : status === 'Still alive' ? 'bg-card' : 'bg-good/10')}>
        <div className='flex items-baseline justify-between gap-3'>
          <span className='font-display text-2xl font-black'>{status}</span>
          <span className='text-sm text-muted-foreground'>{d.legs.length} legs</span>
        </div>
        <div className='mt-3 grid grid-cols-3 gap-2 text-center'>
          {([['Won', d.won, 'text-good'], ['Lost', d.lost, 'text-bad'], ['To go', open, '']] as const).map(([k, v, tone]) => (
            <div key={k} className='rounded-xl bg-background/60 py-2'>
              <div className={cn('font-display text-2xl font-black tabular-nums', v ? tone : 'text-muted-foreground')}>{v}</div>
              <div className='text-xs text-muted-foreground'>{k}</div>
            </div>
          ))}
        </div>
        {!c.result && d.lost === 0 && d.ticker !== 'slip' && (
          <dl className='mt-3 grid grid-cols-2 gap-2 text-sm'>
            <div>
              <dt className='text-xs text-muted-foreground'>Kalshi&apos;s combo price</dt>
              <dd className='font-condensed text-[17px] font-bold tabular-nums'>
                {c.bid == null && c.ask == null ? 'no offers' : `${cents(c.bid)} sell · ${cents(c.ask)} buy`}
              </dd>
            </div>
            <div>
              <dt className='text-xs text-muted-foreground'>Legs multiplied</dt>
              <dd className='font-condensed text-[17px] font-bold tabular-nums'>{pct(d.multiplied)}</dd>
            </div>
          </dl>
        )}
      </section>
      {!c.result && d.lost === 0 && d.ticker !== 'slip' && (
        <p className='px-1 text-xs leading-relaxed text-muted-foreground'>
          Legs multiplied = each leg&apos;s Kalshi chance multiplied together, as if the legs had nothing to do with each other. Legs from the same game
          usually move together, so treat it as a rough check on the combo price, not a fair price.
        </p>
      )}
      {d.truncated && <p className='px-1 text-xs text-muted-foreground'>Only the first 80 legs are shown.</p>}
      {review ?? <Legs legs={legs} won={d.won} />}
      {updated}
    </div>
  )
}

// long combos: the legs still to play (and any that lost) first; the winners fold away
function Legs({ legs, won }: { legs: KLeg[]; won: number }) {
  const fold = won > 5 && won < legs.length
  const [all, setAll] = useState(false)
  const shown = fold && !all ? legs.filter((l) => l.result !== 'won') : legs
  return (
    <ul className='overflow-hidden rounded-[18px] bg-card'>
      {shown.map((l, i) => <LegRow key={`${l.ticker}${i}`} l={l} />)}
      {fold && (
        <li>
          <button type='button' onClick={() => setAll(!all)} aria-expanded={all}
            className='flex h-12 w-full items-center justify-center gap-1 text-sm font-semibold text-devig hover:bg-muted/50'>
            {all ? 'Hide the legs that won' : `Show the ${won} legs that won`}
          </button>
        </li>
      )}
    </ul>
  )
}
const rank = (l: KLeg) => (l.result === 'lost' ? 0 : l.result ? 2 : 1)

// everything a reader keeps: the link being read, the answer (kept on screen while a refresh runs), the saved list
function useBetReader() {
  const read = useReadLink()
  const saved = useSaved()
  const [lastLink, setLastLink] = useState('')
  const [data, setData] = useState<KRead | null>(null)
  const go = (l: string) => {
    if (!l.trim()) return
    setLastLink(l.trim())
    setData(null)
    read.mutate(l.trim(), { onSuccess: setData })
  }
  // live prices: while a combo has legs to go, read it again every minute (only while the tab is in view)
  const live = data?.kind === 'combo' && data.combo.result == null && data.lost === 0 && data.won < data.legs.length
  useEffect(() => {
    if (!live || !lastLink) return
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') readLink(lastLink).then(setData).catch(() => {})
    }, 60_000)
    return () => clearInterval(t)
  }, [live, lastLink])

  const isSaved = saved.some((s) => s.link === lastLink)
  // combos are saved as soon as they're read, with the review's snapshot, so you can look back at how they went
  const store = (patch: Partial<Saved>) => {
    if (!data || !lastLink) return
    const cur = getSaved()
    const old = cur.find((s) => s.link === lastLink)
    storeSaved(old
      ? cur.map((s) => (s.link === lastLink ? { ...s, ...patch } : s))
      : [{ link: lastLink, label: labelFor(data), savedAt: new Date().toISOString(), ...patch }, ...cur])
  }
  const err = read.error instanceof LinkError ? read.error.message : read.error ? 'Something went wrong. Try again.' : null
  return {
    go, data, lastLink, saved, isSaved, store, err, pending: read.isPending,
    entry: saved.find((s) => s.link === lastLink) ?? null,
    save: () => { if (data && !isSaved) store({}) },
    remove: (l: string) => storeSaved(getSaved().filter((s) => s.link !== l)),
  }
}
type Reader = ReturnType<typeof useBetReader>

function ReaderBody({ r }: { r: Reader }) {
  if (r.pending) return <Skeleton className='h-48 w-full rounded-[18px]' />
  if (!r.data) return null
  const d = r.data
  return (
    <>
      <Result d={d} review={d.kind === 'combo' ? <ParlayReview d={d} entry={r.entry} all={r.saved} onStore={r.store} /> : undefined} />
      <div className='flex gap-2'>
        <button type='button' onClick={r.save} disabled={r.isSaved}
          className='h-10 rounded-full border px-4 text-sm font-semibold disabled:text-muted-foreground'>
          {r.isSaved ? 'Saved' : 'Save this'}
        </button>
        <button type='button' onClick={() => r.go(r.lastLink)} className='h-10 rounded-full border px-4 text-sm font-semibold'>Check again</button>
      </div>
    </>
  )
}

function SavedList({ r, list, title, onPick }: { r: Reader; list: Saved[]; title: string; onPick: (s: Saved) => void }) {
  if (!list.length) return null
  return (
    <div className='flex flex-col gap-2'>
      <h3 className='px-1 pt-2 font-display text-xl font-extrabold'>{title}</h3>
      <ul className='overflow-hidden rounded-[18px] bg-card'>
        {list.map((s) => (
          <li key={s.link} className={cn('flex items-center border-b last:border-b-0', s.link === r.lastLink && 'bg-muted/40')}>
            <button type='button' onClick={() => onPick(s)} className='flex min-h-14 min-w-0 flex-1 flex-col items-start px-4 py-2 text-start hover:bg-muted/50'>
              <span className='w-full truncate font-semibold'>{s.label}</span>
              <span className='text-xs text-muted-foreground'>
                {s.outcome ? `${s.outcome.won ? 'Won' : 'Lost'}${s.outcome.letter ? ` · grade ${s.outcome.letter}` : ''}` : s.snap ? `Grade ${s.snap.letter}` : `Saved ${timeFmt.format(new Date(s.savedAt))}`} · tap to review
              </span>
            </button>
            <button type='button' onClick={() => r.remove(s.link)} aria-label={`Remove ${s.label}`}
              className='grid size-12 shrink-0 place-items-center text-muted-foreground hover:text-foreground'>
              <X className='size-4' />
            </button>
          </li>
        ))}
      </ul>
      <p className='px-1 text-xs text-muted-foreground'>Saved on this device only.</p>
    </div>
  )
}

export function LinkReader({ title = 'Check a Kalshi bet', blurb, showSaved = true }: { title?: string; blurb?: React.ReactNode; showSaved?: boolean } = {}) {
  const r = useBetReader()
  const [link, setLink] = useState('')
  return (
    <section aria-label={title} className='flex flex-col gap-3'>
      <div className='rounded-[18px] bg-card p-4'>
        <h2 className='font-display text-[22px] font-extrabold'>{title}</h2>
        <p className='mt-1 text-sm text-muted-foreground'>{blurb ?? <>Paste a link from Kalshi&apos;s Share button: one bet, a game, or a combo. You&apos;ll see every leg, what&apos;s won, and the prices now.</>}</p>
        <form className='mt-3 flex gap-2' onSubmit={(e) => { e.preventDefault(); r.go(link) }}>
          <label className='flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border bg-background px-3 focus-within:border-foreground'>
            <Link2 className='size-4 shrink-0 text-muted-foreground' aria-hidden='true' />
            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder='kalshi.com/markets/…' aria-label='Kalshi link'
              inputMode='url' autoComplete='off' autoCapitalize='off' spellCheck={false}
              className='h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground' />
          </label>
          <button type='submit' disabled={!link.trim() || r.pending}
            className='h-11 shrink-0 rounded-xl bg-devig px-5 text-sm font-bold text-devig-ink disabled:opacity-50'>
            {r.pending ? 'Reading…' : 'Check'}
          </button>
        </form>
        {r.err && <p role='alert' className='mt-2 text-sm text-bad'>{r.err}</p>}
      </div>
      <ReaderBody r={r} />
      {showSaved && (
        <SavedList r={r} list={r.saved} title='Saved bets' onPick={(s) => { setLink(s.link.startsWith('slip:') ? '' : s.link); r.go(s.link) }} />
      )}
    </section>
  )
}

// Parlay page: the parlays you saved (built here or read from Kalshi), each reviewed when tapped
export function SavedParlays() {
  const r = useBetReader()
  const list = r.saved
  // the slip's Save button asks for its parlay to be opened here
  const go = r.go
  useEffect(() => {
    const on = (e: Event) => go((e as CustomEvent<string>).detail)
    window.addEventListener('devig:review', on)
    return () => window.removeEventListener('devig:review', on)
  }, [go])
  return (
    <section id='saved-parlays' aria-label='Saved parlays' className='flex scroll-mt-20 flex-col gap-3'>
      {list.length ? <SavedList r={r} list={list} title={`Saved parlays (${list.length})`} onPick={(s) => r.go(s.link)} /> : (
        <div className='flex flex-col gap-2'>
          <h3 className='px-1 font-display text-xl font-extrabold'>Saved parlays</h3>
          <p className='rounded-[18px] border border-dashed p-4 text-sm text-muted-foreground'>
            Nothing saved yet. Tap Save this parlay on your slip, or check a Kalshi combo link (it saves itself). Each one keeps its grade, follows
            the games live, and tells you what happened and what to learn.
          </p>
        </div>
      )}
      {r.err && <p role='alert' className='px-1 text-sm text-bad'>{r.err}</p>}
      <ReaderBody r={r} />
    </section>
  )
}
