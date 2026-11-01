import { useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { ImageUp, Link2 } from 'lucide-react'
import { type GameRow, fmtAmerican, fmtPct, impliedProb, useGames } from '@/lib/devig'
import { decimal, toAmerican, useSlip } from '@/lib/parlay'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { mlLeg } from '../parlay/legs'

// Check a bet from a screenshot: /api/scan (functions/api/scan.js) reads the legs with the AI, then this matches
// moneyline legs to today's games and puts the book's price next to Kalshi's fair chance and DeVig's pick.
// Classic did the reading with Claude inside claude.ai; on the site it's the same free AI as Ask, so it needs an account.

export type ScanLeg = {
  sport: string | null; away: string | null; home: string | null
  market: 'moneyline' | 'spread' | 'total' | 'prop' | 'other'; side: string; point: number | null; odds: number | null
}
export type Scan = { book: string | null; legs: ScanLeg[]; total_odds: number | null; stake: number | null; payout: number | null; notes: string }

class ScanError extends Error {
  constructor(msg: string, public account = false) { super(msg) }
}

// a photo -> a JPEG data URL no wider or taller than 1600px (small enough to send, sharp enough to read)
async function shrink(file: File): Promise<string> {
  const bmp = await createImageBitmap(file)
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k)
  c.height = Math.round(bmp.height * k)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close()
  return c.toDataURL('image/jpeg', 0.88)
}

async function scan(file: File): Promise<Scan> {
  let image: string
  try { image = await shrink(file) } catch { throw new ScanError("That file isn't an image this browser can open.") }
  return send({ image })
}

// a sportsbook's Share link: the server opens the page and reads its picture of the slip
export const isBookLink = (s: string) => /^(https:\/\/)?([a-z0-9-]+\.)*(draftkings|fanduel|betmgm|caesars|espnbet|fanatics|hardrock|bet365|betrivers|fliff|prizepicks|underdogfantasy)\.(com|bet|app)(\/|$)/i.test(s.trim())
async function scanLink(link: string): Promise<Scan> {
  const l = link.trim()
  if (!isBookLink(l)) throw new ScanError("That isn't a sportsbook share link. Paste the link from your book's Share button.")
  return send({ link: l.startsWith('https://') ? l : `https://${l}` })
}

async function send(body: { image: string } | { link: string }): Promise<Scan> {
  let r: Response
  try {
    r = await fetch('/api/scan', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  } catch {
    throw new ScanError("You're offline. Try again when you're connected.")
  }
  const d = await r.json().catch(() => null)
  if (r.ok && d && Array.isArray(d.legs)) return d as Scan
  const code = d?.code
  if (code === 'account' || r.status === 401) throw new ScanError('Reading screenshots needs a free DeVig account.', true)
  if (code === 'limit') throw new ScanError("That's today's screenshots for your account. More tomorrow.")
  if (code === 'quota') throw new ScanError('The free AI has used up its reads for today. Try again tomorrow, or paste a Kalshi link instead.')
  if (code === 'off' || r.status === 404) throw new ScanError("Screenshot reading isn't switched on for this site yet. A Kalshi link works now.")
  if (code === 'noimage') throw new ScanError("That book's page doesn't show the bet. Take a screenshot of it instead.")
  if (code === 'link' && d?.error) throw new ScanError(`Couldn't open that link: ${d.error}. A screenshot works too.`)
  throw new ScanError("Couldn't read that one. Try again, or a clearer screenshot.")
}

// ---------- matching a leg to a game ----------
const norm = (s: string | null | undefined) => String(s ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
function names(r: GameRow, side: 'away' | 'home') {
  const code = side === 'home' ? r.home : r.away
  const full = side === 'home' ? r.homeName : r.awayName
  const words = norm(full).split(' ')
  return [norm(code), norm(full), words[words.length - 1], words.slice(0, -1).join(' ')].filter((x) => x.length >= 2)
}
const hits = (text: string, r: GameRow, side: 'away' | 'home') => {
  const t = norm(text)
  if (!t) return false
  return names(r, side).some((n) => t === n || ` ${t} `.includes(` ${n} `))
}
const SPORTS: Record<string, string> = { ncaaf: 'CFB', 'college football': 'CFB', ncaa: 'CFB', 'ncaa football': 'CFB', cfb: 'CFB', nfl: 'NFL',
  football: 'NFL', nba: 'NBA', basketball: 'NBA', wnba: 'WNBA', nhl: 'NHL', hockey: 'NHL', mlb: 'MLB', baseball: 'MLB' }
const sportOf = (s: string | null) => SPORTS[norm(s)] ?? (s ?? '').toUpperCase()
// the game a moneyline leg is on, and which side it took (games not yet final, both teams agreeing when the slip names them)
export function matchLeg(l: ScanLeg, rows: GameRow[]): { row: GameRow; side: 'away' | 'home' } | null {
  if (l.market !== 'moneyline') return null
  const open = rows.filter((r) => r.state !== 'post')
  const found: { row: GameRow; side: 'away' | 'home' }[] = []
  for (const r of open) {
    for (const side of ['away', 'home'] as const) {
      if (!hits(l.side, r, side)) continue
      const other = side === 'away' ? 'home' : 'away'
      const opp = side === 'away' ? l.home : l.away
      const mine = side === 'away' ? l.away : l.home
      if (opp && !hits(opp, r, other) && !(mine && hits(opp, r, side))) continue
      found.push({ row: r, side })
    }
  }
  // the slip's sport only breaks ties (Miami, Arizona...), since the AI may call CFB "NCAAF" or "college football"
  const same = (r: GameRow) => (sportOf(l.sport) === r.sport ? 0 : 1)
  found.sort((a, b) => same(a.row) - same(b.row) || Date.parse(a.row.kickoff) - Date.parse(b.row.kickoff))
  return found[0] ?? null
}

const mkt = (l: ScanLeg) =>
  l.market === 'spread' ? `${l.point != null && l.point > 0 ? '+' : ''}${l.point ?? ''} spread`
    : l.market === 'total' ? `${l.point ?? ''} total`
      : l.market === 'moneyline' ? 'to win' : l.market === 'prop' ? 'prop' : ''

function LegRow({ l, m }: { l: ScanLeg; m: ReturnType<typeof matchLeg> }) {
  const be = impliedProb(l.odds)
  const fair = m && m.row.fairHome != null ? (m.side === 'home' ? m.row.fairHome : 1 - m.row.fairHome) : null
  const code = m ? (m.side === 'home' ? m.row.home : m.row.away) : null
  const p = m?.row.pick
  const devig = m && p?.side && p.prob != null && p.action !== 'PASS' ? (p.side === code ? p.prob : 1 - p.prob) : null
  const live = m?.row.state === 'in'
  const gap = fair != null && be != null && !live ? fair - be : null // a started game's price is live; the slip's isn't
  return (
    <li className='border-b px-4 py-3 last:border-b-0'>
      <div className='flex items-baseline justify-between gap-3'>
        <span className='min-w-0'>
          <span className='font-semibold'>{l.side}</span>{' '}
          <span className='text-sm text-muted-foreground'>{mkt(l)}</span>
        </span>
        <span className='shrink-0 font-condensed text-[17px] font-bold tabular-nums'>{l.odds == null ? '—' : fmtAmerican(l.odds)}</span>
      </div>
      <div className='mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground tabular-nums'>
        {be != null && <span>Needs {fmtPct(be)} to break even</span>}
        {m ? (
          <>
            <Link to='/game/$id' params={{ id: m.row.id }} className='underline-offset-2 hover:underline'>{m.row.away} at {m.row.home}</Link>
            {fair != null && <span>Kalshi fair {fmtPct(fair)}{live ? ' live now' : ''}</span>}
            {devig != null && <span className='font-semibold text-devig'>DeVig {fmtPct(devig)}{p?.side === code ? ' (its pick)' : ''}</span>}
          </>
        ) : (
          <span>{l.market === 'moneyline' ? 'Not on today’s board' : 'DeVig only prices game winners and props'}</span>
        )}
      </div>
      {gap != null && (
        <p className={cn('mt-1 text-xs font-semibold', gap >= 0 ? 'text-good' : 'text-bad')}>
          {gap >= 0
            ? `This price is ${Math.abs(gap * 100).toFixed(1)} points better than Kalshi's fair chance.`
            : `This price costs ${Math.abs(gap * 100).toFixed(1)} points more than Kalshi's fair chance.`}
        </p>
      )}
    </li>
  )
}

function ScanResult({ d, onExplain, source = 'screenshot' }: { d: Scan; onExplain?: () => void; source?: string }) {
  const { rows } = useGames()
  const matches = d.legs.map((l) => matchLeg(l, rows))
  const priced = d.legs.every((l) => l.odds != null)
  const dec = d.total_odds != null ? decimal(d.total_odds) : priced && d.legs.length ? d.legs.reduce((a, l) => a * decimal(l.odds!), 1) : null
  const fairAll = d.legs.length > 1 && matches.every((m) => m && m.row.fairHome != null)
    ? matches.reduce((a, m) => a * (m!.side === 'home' ? m!.row.fairHome! : 1 - m!.row.fairHome!), 1) : null
  const matched = matches.filter(Boolean).length
  if (!d.legs.length) {
    return <p role='alert' className='rounded-[18px] bg-card p-4 text-sm'>No bets found in that {source}.{d.notes ? ` ${d.notes}` : ''} Try a screenshot of the whole slip.</p>
  }
  return (
    <div className='flex flex-col gap-2'>
      <section className='rounded-[18px] bg-card p-4'>
        <div className='flex items-baseline justify-between gap-3'>
          <span className='font-display text-2xl font-black'>{d.legs.length > 1 ? `${d.legs.length}-leg parlay` : 'One bet'}</span>
          <span className='text-sm text-muted-foreground'>{d.book ?? 'Book not shown'}</span>
        </div>
        {(dec != null || fairAll != null) && (
          <dl className='mt-3 grid grid-cols-2 gap-2 text-sm'>
            {dec != null && (<>
            <div>
              <dt className='text-xs text-muted-foreground'>{d.total_odds != null ? 'Odds on the slip' : 'Legs multiplied'}</dt>
              <dd className='font-condensed text-[17px] font-bold tabular-nums'>{fmtAmerican(Math.round(toAmerican(dec)))}</dd>
            </div>
            <div>
              <dt className='text-xs text-muted-foreground'>Needs to hit</dt>
              <dd className='font-condensed text-[17px] font-bold tabular-nums'>{fmtPct(1 / dec, 1)}</dd>
            </div>
            </>)}
            {fairAll != null && (
              <div className='col-span-2'>
                <dt className='text-xs text-muted-foreground'>Kalshi&apos;s fair chance, legs multiplied</dt>
                <dd className={cn('font-condensed text-[17px] font-bold tabular-nums', dec != null && (fairAll >= 1 / dec ? 'text-good' : 'text-bad'))}>
                  {fmtPct(fairAll, 1)}{dec == null ? '' : fairAll >= 1 / dec ? ' · the payout is fair or better' : ' · the payout is short of fair'}
                </dd>
              </div>
            )}
          </dl>
        )}
        {d.stake != null && (
          <p className='mt-2 text-xs text-muted-foreground tabular-nums'>
            {d.payout != null ? `$${d.stake.toFixed(2)} to win $${d.payout.toFixed(2)}, as shown on the slip.` : `$${d.stake.toFixed(2)} bet, as shown on the slip.`}
          </p>
        )}
      </section>
      <ul className='overflow-hidden rounded-[18px] bg-card'>
        {d.legs.map((l, i) => <LegRow key={i} l={l} m={matches[i]} />)}
      </ul>
      {onExplain && matched > 0 && (
        <button type='button' onClick={onExplain} className='h-11 rounded-full bg-devig px-5 text-sm font-bold text-devig-ink'>
          Explain {matched === d.legs.length ? 'this parlay' : `the ${matched} game ${matched === 1 ? 'leg' : 'legs'} DeVig knows`} at Kalshi&apos;s prices
        </button>
      )}
      <p className='px-1 text-xs leading-relaxed text-muted-foreground'>
        Read by AI, which can misread a number: check the legs against your {source === 'link' ? 'bet' : 'screenshot'}. Legs multiplied treats legs as unrelated; same-game legs
        usually aren&apos;t.
      </p>
    </div>
  )
}

// put the legs DeVig knows on the slip below
function useExplain(d: Scan | undefined, onExplained?: () => void) {
  const { rows } = useGames()
  const { replace } = useSlip()
  return () => {
    if (!d) return
    replace(d.legs.map((l) => { const m = matchLeg(l, rows); return m ? mlLeg(m.row, m.side) : null }).filter((x) => x != null))
    onExplained?.()
  }
}

function ErrorLine({ err }: { err: ScanError | null }) {
  if (!err) return null
  return (
    <p role='alert' className='px-1 text-sm text-bad'>
      {err.message}{' '}
      {err.account && <Link to='/profile' className='font-semibold text-foreground underline underline-offset-2'>Open Profile</Link>}
    </p>
  )
}

export function BookLinkReader({ onExplained }: { onExplained?: () => void }) {
  const [link, setLink] = useState('')
  const read = useMutation({ mutationFn: scanLink })
  const explain = useExplain(read.data, onExplained)
  return (
    <div className='flex flex-col gap-3'>
      <div className='rounded-[18px] bg-card p-4'>
        <p className='text-sm text-muted-foreground'>
          On your sportsbook, tap Share on the bet and paste the link. DeVig reads the picture of the slip the link shows, so odds for
          each leg may be missing; a screenshot shows more.
        </p>
        <form className='mt-3 flex gap-2' onSubmit={(e) => { e.preventDefault(); if (link.trim()) read.mutate(link) }}>
          <label className='flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border bg-background px-3 focus-within:border-foreground'>
            <Link2 className='size-4 shrink-0 text-muted-foreground' aria-hidden='true' />
            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder='sportsbook.draftkings.com/social/post/…' aria-label='Sportsbook share link'
              inputMode='url' autoComplete='off' autoCapitalize='off' spellCheck={false}
              className='h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground' />
          </label>
          <button type='submit' disabled={!link.trim() || read.isPending}
            className='h-11 shrink-0 rounded-xl bg-devig px-5 text-sm font-bold text-devig-ink disabled:opacity-50'>
            {read.isPending ? 'Reading…' : 'Check'}
          </button>
        </form>
        <p className='mt-2 text-xs text-muted-foreground'>Tested with DraftKings. FanDuel, BetMGM, Caesars, ESPN BET, Fanatics and others are tried the same way.</p>
      </div>
      {read.isPending && (
        <>
          <p className='px-1 text-sm text-muted-foreground' role='status'>Opening the link and reading the bet…</p>
          <Skeleton className='h-48 w-full rounded-[18px]' />
        </>
      )}
      {!read.isPending && <ErrorLine err={read.error as ScanError | null} />}
      {read.data && !read.isPending && <ScanResult d={read.data} onExplain={explain} source='link' />}
    </div>
  )
}

export function ScreenshotReader({ onExplained }: { onExplained?: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const read = useMutation({ mutationFn: scan })
  const explain = useExplain(read.data, onExplained)
  const pick = (f: File | null | undefined) => {
    if (!f || !f.type.startsWith('image/')) return
    setPreview((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(f) })
    read.mutate(f)
  }
  return (
    <div className='flex flex-col gap-3' onPaste={(e) => pick([...e.clipboardData.files].find((f) => f.type.startsWith('image/')))}>
      <button type='button' onClick={() => input.current?.click()}
        className='flex min-h-28 items-center gap-4 rounded-[18px] border border-dashed bg-card p-4 text-start hover:border-foreground/50'>
        {preview
          ? <img src={preview} alt='Your screenshot' className='h-20 w-14 shrink-0 rounded-lg object-cover object-top' />
          : <span className='grid size-12 shrink-0 place-items-center rounded-full bg-devig/15 text-devig'><ImageUp className='size-6' aria-hidden='true' /></span>}
        <span>
          <span className='block font-semibold'>{preview ? 'Choose a different screenshot' : 'Upload a screenshot of your bet'}</span>
          <span className='block text-sm text-muted-foreground'>A bet slip or parlay from any sportsbook or Kalshi. On a computer you can paste one too.</span>
        </span>
      </button>
      <input ref={input} type='file' accept='image/jpeg,image/png,image/webp,image/gif' hidden
        onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
      {read.isPending && (
        <>
          <p className='px-1 text-sm text-muted-foreground' role='status'>Reading your screenshot…</p>
          <Skeleton className='h-48 w-full rounded-[18px]' />
        </>
      )}
      {!read.isPending && <ErrorLine err={read.error as ScanError | null} />}
      {read.data && !read.isPending && <ScanResult d={read.data} onExplain={explain} />}
    </div>
  )
}
