import { Fragment, type ReactNode, useEffect, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { Check, ChevronDown, Link2, Minus, X } from 'lucide-react'
import {
  type KLeg, type KRead, type Saved, LinkError, getSaved, labelFor, legLabel, readLink, removeSaved, storeSaved, useReadLink, useSaved,
} from '@/lib/kalshi-link'
import { ParlayReview } from './review'
import { BetBox, betFacts, betLine, hasBet } from './bet-box'
import { cn } from '@/lib/utils'
import { useAccount } from '@/lib/profile'
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
    // a game link (Kalshi's Share on a game page) doesn't say which side you took: once you pick one, that single bet
    // is saved in the game link's place, so it can be graded and followed like any other bet
    pickSide: (m: KLeg) => {
      if (!m.ticker) return
      const old = getSaved().find((s) => s.link === lastLink)
      if (old) removeSaved(old.link)
      const cur = getSaved().filter((s) => s.link !== m.ticker)
      storeSaved([{ link: m.ticker, label: legLabel(m), savedAt: old?.savedAt ?? new Date().toISOString() }, ...cur])
      go(m.ticker)
    },
    remove: removeSaved,
    close: () => { setLastLink(''); setData(null); read.reset() },
  }
}
type Reader = ReturnType<typeof useBetReader>

function ReaderBody({ r }: { r: Reader }) {
  if (r.pending) return <Skeleton className='h-48 w-full rounded-[18px]' />
  if (!r.data) return null
  const d = r.data
  return (
    <>
      {d.kind === 'market' && <KeepResult r={r} d={d} />}
      <ReaderInner r={r} d={d} />
    </>
  )
}

function KeepResult({ r, d }: { r: Reader; d: Extract<KRead, { kind: 'market' }> }) {
  const res = d.market.result
  useEffect(() => {
    if (res && r.entry && !r.entry.outcome) r.store({ outcome: { at: d.fetched_at, won: res === 'won', legs: 1, hit: null, letter: null, lost: [] } })
  }, [res, r.entry?.link]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

// a game link: every market in the game, and you pick the one you bet
function SidePicker({ d, onPick }: { d: Extract<KRead, { kind: 'event' }>; onPick: (m: KLeg) => void }) {
  return (
    <section className='flex flex-col gap-2 rounded-[18px] bg-card p-4'>
      <h3 className='font-display text-xl font-extrabold'>Which side did you take?</h3>
      <p className='text-sm text-muted-foreground'>This link is for the whole game{d.title ? ` (${d.title})` : ''}, so it doesn&apos;t say which side is yours. Pick it and DeVig will follow just that bet.</p>
      <div className='mt-1 flex flex-col gap-2'>
        {d.markets.filter((m) => m.ticker).map((m) => (
          <button key={m.ticker} type='button' onClick={() => onPick(m)}
            className='flex min-h-12 items-center justify-between gap-3 rounded-xl border bg-background px-4 py-2 text-start font-semibold hover:border-foreground'>
            <span className='min-w-0'>{legLabel(m)}</span>
            <span className='shrink-0 text-sm text-muted-foreground tabular-nums'>{m.result ? (m.result === 'won' ? 'Won' : 'Lost') : pct(m.chance)}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function ReaderInner({ r, d }: { r: Reader; d: KRead }) {
  if (d.kind === 'event') {
    return (
      <>
        <SidePicker d={d} onPick={r.pickSide} />
        {r.isSaved && (
          <button type='button' onClick={() => { r.remove(r.lastLink); r.close() }}
            className='h-10 self-end rounded-full px-3 text-sm font-semibold text-muted-foreground hover:text-bad'>Remove</button>
        )}
      </>
    )
  }
  return (
    <>
      <BetBox key={r.lastLink} bet={r.entry?.bet} {...betFacts(d)} onSave={(bet) => r.store({ bet })} />
      <Result d={d} review={d.kind === 'combo' ? <ParlayReview d={d} entry={r.entry} all={r.saved} onStore={r.store} /> : undefined} />
      <div className='flex gap-2'>
        {!r.isSaved && <button type='button' onClick={r.save} className='h-10 rounded-full border px-4 text-sm font-semibold'>Save this</button>}
        <button type='button' onClick={() => r.go(r.lastLink)} className='h-10 rounded-full border px-4 text-sm font-semibold'>Check again</button>
        {r.isSaved && (
          <button type='button' onClick={() => { r.remove(r.lastLink); r.close() }}
            className='ms-auto h-10 rounded-full px-3 text-sm font-semibold text-muted-foreground hover:text-bad'>Remove</button>
        )}
      </div>
    </>
  )
}


const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
const legsOf = (d: KRead | undefined): KLeg[] => (!d ? [] : d.kind === 'combo' ? d.legs : d.kind === 'market' ? [d.market] : d.markets)
const PEEK = 3
const peek = (link: string) => ({ queryKey: ['kalshi-peek', link], queryFn: () => readLink(link), staleTime: 2 * 60e3, retry: 1 })

// one saved bet, closed: what you bet, how it's going, and its first few legs. Read from Kalshi like the review (kept 2 minutes)
function SavedCard({ s, open, onToggle, owner }: { s: Saved; open: boolean; onToggle: () => void; owner?: string }) {
  const q = useQuery(peek(s.link))
  const d = q.data
  const legs = legsOf(d)
  const result = s.outcome ? (s.outcome.won ? 'won' : 'lost') : d ? betFacts(d).result : null
  // a single bet that has settled keeps its result, so it moves to History
  useEffect(() => {
    if (!owner && d?.kind === 'market' && d.market.result && !s.outcome) {
      storeSaved(getSaved().map((x) => (x.link === s.link ? { ...x, outcome: { at: d.fetched_at, won: d.market.result === 'won', legs: 1, hit: null, letter: null, lost: [] } } : x)))
    }
  }, [d?.fetched_at]) // eslint-disable-line react-hooks/exhaustive-deps
  const won = legs.filter((l) => l.result === 'won').length
  const letter = s.outcome?.letter ?? s.snap?.letter ?? null
  const label = owner ? s.label.replace(/^Your parlay/, 'DeVig parlay') : s.label
  const tone = result === 'won' ? 'text-good' : result === 'lost' ? 'text-bad' : 'text-muted-foreground'
  const status = result === 'won' ? 'Won' : result === 'lost' ? 'Lost' : legs.length > 1 ? `${won} of ${legs.length} hit` : 'Open'
  return (
    <button type='button' onClick={onToggle} aria-expanded={open}
      className={cn('block w-full rounded-[18px] bg-card p-4 text-start transition-colors duration-150 hover:bg-muted/40', open && 'ring-1 ring-devig/60')}>
      <span className='flex items-start gap-3'>
        <span className='min-w-0 flex-1'>
          <span className={cn('block text-xs font-bold tracking-wide uppercase', tone)}>{status} · {dayFmt.format(new Date(s.savedAt))}</span>
          <span className='mt-0.5 block truncate font-semibold'>{label}</span>
          {hasBet(s.bet) && <span className='block font-display text-[22px] leading-tight font-extrabold tabular-nums'>{betLine(s.bet)}</span>}
        </span>
        {letter && (
          <span className='grid size-11 shrink-0 place-items-center rounded-xl bg-muted font-display text-xl font-black' aria-label={`Grade ${letter}`}>{letter}</span>
        )}
      </span>
      {legs.length > 1 && (
        <span className='mt-3 flex gap-1' aria-hidden='true'>
          {legs.map((l, i) => <span key={i} className={cn('h-1.5 flex-1 rounded-full', l.result === 'won' ? 'bg-good' : l.result === 'lost' ? 'bg-bad' : 'bg-muted')} />)}
        </span>
      )}
      {q.isPending ? (
        <span className='mt-3 flex flex-col gap-2'><Skeleton className='h-4 w-3/4' /><Skeleton className='h-4 w-2/3' /></span>
      ) : legs.length > 0 && (
        <span className='mt-3 flex flex-col gap-1.5'>
          {[...legs].sort((x, y) => rank(x) - rank(y)).slice(0, PEEK).map((l, i) => (
            <span key={i} className='flex items-center gap-2.5 text-sm'>
              <Mark r={l.result} />
              <span className={cn('min-w-0 flex-1 truncate', l.result === 'lost' && 'text-bad')}>{legLabel(l)}</span>
              <span className='shrink-0 tabular-nums text-muted-foreground'>{l.result ? (l.result === 'won' ? 'Won' : 'Lost') : pct(l.chance)}</span>
            </span>
          ))}
        </span>
      )}
      <span className='mt-3 flex items-center justify-between text-sm'>
        <span className='text-muted-foreground'>{legs.length > PEEK ? `+${legs.length - PEEK} more ${legs.length - PEEK === 1 ? 'leg' : 'legs'}` : ''}</span>
        <span className='flex items-center gap-1 font-semibold text-devig'>
          {open ? 'Hide' : 'Open'}<ChevronDown className={cn('size-4 transition-transform duration-150 motion-reduce:transition-none', open && 'rotate-180')} aria-hidden='true' />
        </span>
      </span>
    </button>
  )
}

function SavedCards({ list, openLink, onToggle, owner, body }: { list: Saved[]; openLink: string | null; onToggle: (s: Saved) => void; owner?: string; body: ReactNode }) {
  return (
    <div className='flex flex-col gap-3'>
      {list.map((s) => (
        <Fragment key={s.link}>
          <SavedCard s={s} open={s.link === openLink} onToggle={() => onToggle(s)} owner={owner} />
          {s.link === openLink && <div className='flex flex-col gap-3'>{body}</div>}
        </Fragment>
      ))}
    </div>
  )
}

function SavedList({ r, list, title, onPick }: { r: Reader; list: Saved[]; title: string; onPick?: (s: Saved) => void }) {
  if (!list.length) return null
  return (
    <div className='flex flex-col gap-2'>
      <h3 className='px-1 pt-2 font-display text-xl font-extrabold'>{title}</h3>
      <SavedCards list={list} openLink={r.lastLink || null}
        onToggle={(s) => { if (s.link === r.lastLink) r.close(); else { onPick?.(s); r.go(s.link) } }}
        body={<>{r.err && <p role='alert' className='px-1 text-sm text-bad'>{r.err}</p>}<ReaderBody r={r} /></>} />
      <SavedWhere />
    </div>
  )
}

function SavedWhere() {
  const { data: acct } = useAccount()
  return (
    <p className='px-1 text-xs text-muted-foreground'>
      {acct?.state === 'joined' ? 'Saved to your account, so they show on every device you sign in on.' : 'Saved on this device only. Sign in on Profile to keep them on every device.'}
    </p>
  )
}

// a friend's saved bets, Kalshi links and parlays built in DeVig (Friends page): the same review, read-only
export function FriendSaved({ list, owner }: { list: Saved[]; owner: string }) {
  const read = useReadLink()
  const [cur, setCur] = useState<Saved | null>(null)
  const [data, setData] = useState<KRead | null>(null)
  if (!list.length) return null
  // a DeVig parlay reads back as "Your parlay": on a friend's page it's theirs
  const theirs = (d: KRead): KRead => d.kind === 'combo' && d.ticker === 'slip' ? { ...d, combo: { ...d.combo, title: `${owner}'s parlay`, pick: `${owner}'s parlay` } } : d
  const go = (s: Saved) => { setCur(s); setData(null); read.mutate(s.link, { onSuccess: (d) => setData(theirs(d)) }) }
  return (
    <section aria-label={`${owner}'s saved bets`} className='flex flex-col gap-2'>
      <h2 className='px-1 font-display text-[22px] font-extrabold'>Saved bets</h2>
      <SavedCards list={list} owner={owner} openLink={cur?.link ?? null}
        onToggle={(s) => { if (s.link === cur?.link) { setCur(null); setData(null) } else go(s) }}
        body={<>
          {read.error && <p role='alert' className='px-1 text-sm text-bad'>{read.error instanceof LinkError ? read.error.message : 'Something went wrong. Try again.'}</p>}
          {read.isPending ? <Skeleton className='h-48 w-full rounded-[18px]' /> : data && (
            <>
              {data.kind !== 'event' && <BetBox bet={cur?.bet} {...betFacts(data)} owner={owner} />}
              <Result d={data} review={data.kind === 'combo' ? <ParlayReview d={data} entry={cur} all={list} onStore={() => {}} /> : undefined} />
            </>
          )}
        </>} />
    </section>
  )
}

// a saved bet is done once it's been read after it settled (its outcome is kept), or Kalshi's latest read says it's decided
const isDone = (s: Saved, d: KRead | undefined) => !!s.outcome || (!!d && d.kind !== 'event' && betFacts(d).result != null)

// part: with no paste box, just your saved bets, 'open' ones (Parlay tab) or 'done' ones (History), each opened right under its card
export function LinkReader({ title = 'Check a Kalshi bet', blurb, showSaved = true, part }: {
  title?: string; blurb?: React.ReactNode; showSaved?: boolean; part?: 'open' | 'done'
} = {}) {
  const r = useBetReader()
  const [link, setLink] = useState('')
  const reads = useQueries({ queries: (part ? r.saved : []).map((s) => peek(s.link)) })
  if (part) {
    const list = r.saved.filter((s, i) => isDone(s, reads[i]?.data) === (part === 'done'))
    if (!list.length && !r.data) return null
    const heading = part === 'done' ? 'Finished Kalshi bets' : 'Saved Kalshi bets'
    return (
      <section aria-label={heading} className='flex flex-col gap-3'>
        <SavedList r={r} list={list} title={heading} />
        {r.data && !list.some((s) => s.link === r.lastLink) && <ReaderBody r={r} />}
      </section>
    )
  }
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
      {!(showSaved && r.saved.some((s) => s.link === r.lastLink)) && <ReaderBody r={r} />}
      {showSaved && (
        <SavedList r={r} list={r.saved} title='Saved bets' onPick={(s) => setLink(s.link.startsWith('slip:') ? '' : s.link)} />
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
      {list.length ? <SavedList r={r} list={list} title={`Saved parlays (${list.length})`} /> : (
        <div className='flex flex-col gap-2'>
          <h3 className='px-1 font-display text-xl font-extrabold'>Saved parlays</h3>
          <p className='rounded-[18px] border border-dashed p-4 text-sm text-muted-foreground'>
            Nothing saved yet. Tap Save this parlay on your slip, or check a Kalshi combo link (it saves itself). Each one keeps its grade, follows
            the games live, and tells you what happened and what to learn.
          </p>
        </div>
      )}
      {r.err && <p role='alert' className='px-1 text-sm text-bad'>{r.err}</p>}
      {!list.some((s) => s.link === r.lastLink) && <ReaderBody r={r} />}
    </section>
  )
}
