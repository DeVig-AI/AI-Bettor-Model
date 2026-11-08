import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowUpRight, Check, X } from 'lucide-react'
import { type GameRow, fmtAmerican, fmtPct, useGames } from '@/lib/devig'
import { type Leg, decimal, legRead, slipMath, useSlip } from '@/lib/parlay'
import { SaferSwap } from './safer'
import { type Pair, REL_WORDS, adjustedMath, useSameGameHistory } from '@/lib/samegame'
import {
  type LivePrice,
  type PropLine,
  fetchLiveProps,
  overTxt,
  priceToAmerican,
  propSide,
  underTxt,
  useProps,
} from '@/lib/props'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ThemeSwitch } from '@/components/theme-switch'
import { PlayerPhoto, TeamLogo } from '@/components/team-logo'
import { LegBar } from '@/components/leg-bar'
import { type Side, TeamSheet } from '../games/team-sheet'
import { type Shown, withLive } from '../props'
import { type PropSide, PropSheet, usePropPlayer, usePropWhy } from '../props/why'
import { kalshiBuy, kalshiTeam, mlLeg } from './legs'
import { buildCombo, comboLeg, useKalshiKey } from '@/lib/kalshi-key'
import { type TrackedLeg, saveParlay, trackedParlays, useTracked } from '@/lib/track'
import { LinkReader } from '../check-bet/link-reader'
import { YourParlays } from '../history/parlays'
import { BookLinkReader, ScreenshotReader } from '../check-bet/scan'

const oneIn = (p: number) => (p > 0 ? Math.round(1 / p).toLocaleString() : '—')
const money = (x: number) => `$${x.toFixed(2)}`

// ---------- a leg as a small plate (tap it for the same sheet Games and Props open) ----------
type LegSrc = { kind: 'ml'; row: GameRow; side: Side } | { kind: 'prop'; line: Shown; side: PropSide; game: GameRow | null }

// where a leg came from, still on the board: its game, or its prop line at the price we have
function useLegSource() {
  const { rows } = useGames()
  const { lines } = useProps()
  return (leg: Leg): LegSrc | null => {
    if (leg.kind === 'ml') {
      if (leg.outcome === 'draw') return null       // no team to open a sheet for
      const row = rows.find((r) => r.id === leg.gameId)
      return row ? { kind: 'ml', row, side: leg.sideIsHome ? 'home' : 'away' } : null
    }
    const cut = leg.id.lastIndexOf('|')
    const key = leg.id.slice(0, cut)
    const line = lines.find((l) => l.key === key)
    const shown = line ? withLive(line, {}) : null
    if (!shown) return null
    const game = rows.find((r) => r.sport === shown.sport && r.away === shown.away && r.home === shown.home) ?? null
    return { kind: 'prop', line: shown, side: leg.id.slice(cut + 1) === 'under' ? 'under' : 'over', game }
  }
}

function LegPlate({ leg, right, src, onOpen }: { leg: Leg; right?: React.ReactNode; src?: LegSrc | null; onOpen?: () => void }) {
  const c = leg.colors
  const row = src?.kind === 'ml' ? src.row : null
  return (
    <LegBar
      title={leg.label}
      sub={`${leg.sport} · ${leg.game}`}
      colors={c}
      sideIsHome={leg.sideIsHome ?? false}
      logo={leg.outcome === 'draw' ? (
        <span aria-hidden='true' className='grid size-11 place-items-center rounded-full bg-muted font-condensed text-[11px] font-bold text-muted-foreground'>DRAW</span>
      ) : leg.kind === 'ml' ? (
        <TeamLogo sport={leg.sport} code={leg.short} id={row ? (leg.sideIsHome ? row.ids?.home : row.ids?.away) : null}
          color={c ? (leg.sideIsHome ? c.home : c.away) : null} px={96} className='size-11 text-sm' />
      ) : src?.kind === 'prop' ? <PropLegPhoto src={src} /> : null}
      right={<><span className='pointer-events-none font-condensed text-[15px] font-bold tabular-nums'>{fmtAmerican(leg.odds)}</span>{right}</>}
    >
      {onOpen && (
        <button type='button' aria-haspopup='dialog' aria-label={`Why ${leg.label}`} onClick={onOpen}
          className='absolute inset-0 rounded-2xl transition-colors duration-150 hover:bg-white/5 focus-visible:outline-offset-[-3px]' />
      )}
    </LegBar>
  )
}

function PropLegPhoto({ src }: { src: Extract<LegSrc, { kind: 'prop' }> }) {
  const w = usePropWhy(src.line)
  const { pid, team, color, unit } = usePropPlayer(src.line, w, src.game)
  return <PlayerPhoto sport={src.line.sport} unit={unit} pid={pid} team={team} teamColor={color} className='size-11' badge='size-5 text-[7px]' />
}

// the sheet for whichever leg was tapped: the team's (ml) or the prop's, with Remove when it's in the slip
function LegSheet({ src, open, onOpenChange }: { src: LegSrc | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [side, setSide] = useState<string | null>(null)
  if (!src) return null
  if (src.kind === 'ml') {
    const s = (side as Side | null) ?? src.side
    return <TeamSheet row={src.row} side={s} onSide={setSide} open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setSide(null) }} />
  }
  return <PropLegSheet src={src} side={(side as PropSide | null) ?? src.side} onSide={setSide} open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setSide(null) }} />
}

function PropLegSheet({ src, side, onSide, open, onOpenChange }: {
  src: Extract<LegSrc, { kind: 'prop' }>; side: PropSide; onSide: (s: PropSide) => void; open: boolean; onOpenChange: (v: boolean) => void
}) {
  const w = usePropWhy(src.line)
  return <PropSheet l={src.line} w={w} game={src.game} side={side} onSide={onSide} open={open} onOpenChange={onOpenChange} />
}

// which leg's sheet is open (kept after closing so the sheet can animate out)
function useLegSheet() {
  const find = useLegSource()
  const [src, setSrc] = useState<LegSrc | null>(null)
  const [open, setOpen] = useState(false)
  return {
    find,
    openFor: (leg: Leg) => {
      const x = find(leg)
      return x ? () => { setSrc(x); setOpen(true) } : undefined
    },
    sheet: <LegSheet key={src ? (src.kind === 'ml' ? src.row.id + src.side : src.line.key + src.side) : 'none'} src={src} open={open} onOpenChange={setOpen} />,
  }
}

function ReadTag({ leg }: { leg: Leg }) {
  const r = legRead(leg)
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-xs font-bold',
        r.tone === 'good' && 'bg-devig/15 text-devig',
        r.tone === 'bad' && 'bg-bad/15 text-bad',
        r.tone === 'even' && 'bg-muted text-muted-foreground',
        r.tone === 'none' && 'bg-muted text-muted-foreground'
      )}
    >
      {r.tag}
    </span>
  )
}

// a slip leg in the shape classic's tracked parlays use, so either app (and the account copy) can follow it
function trackedLeg(l: Leg, rows: GameRow[]): TrackedLeg {
  const [away, home] = l.game.split(' at ')
  const row = rows.find((r) => r.sport === l.sport && r.away === away && r.home === home &&
    Math.abs(Date.parse(r.kickoff) - Date.parse(l.kickoff)) < 18 * 3600e3)
  const when = l.kickoff ? new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(l.kickoff)) : ''
  const base = { desc: l.label, odds: Math.round(l.odds), game: l.game, when, sport: l.sport, away, home, kickoff: l.kickoff, gkey: row?.trackKey }
  if (l.kind === 'ml') {
    const side = l.outcome ?? (l.sideIsHome ? 'home' : 'away')
    const ticker = l.ticker ?? (row && side !== 'draw' ? kalshiTeam(row.ticker, side) : null)
    return { ...base, kind: 'ml', mk: 'ml', side, ...(ticker ? { ticker } : {}) }
  }
  return {
    ...base, kind: 'prop', mk: 'prop', side: l.id.endsWith('|under') ? 'UNDER' : 'OVER',
    player: l.player, stat: l.stat, line: l.line, ...(l.ticker ? { ticker: l.ticker } : {}),
  }
}

// ---------- same-game legs: what past games say about each pair ----------
function SameGameNote({ pairs, changed, raw }: { pairs: Pair[]; changed: boolean; raw: number | null }) {
  // pairs with a clear past-game link get their own line; the rest are grouped into one
  const moved = pairs.filter((p) => p.factor !== 1)
  const flat = pairs.filter((p) => p.factor === 1 && p.games > 0)
  const none = pairs.filter((p) => p.games === 0)
  const rels = (ps: Pair[]) => [...new Set(ps.map((p) => (p.rel ? REL_WORDS[p.rel] : 'other')))].join(', ')
  const n = (ps: Pair[]) => (ps.length === 1 ? 'The other pair' : `The other ${ps.length} pairs`)
  const sport = pairs[0].a.sport
  return (
    <div className='mt-3 flex flex-col gap-1.5 rounded-xl bg-muted p-3 text-sm leading-relaxed'>
      <p className='font-semibold'>Same-game legs</p>
      {moved.map((p) => (
        <p key={`${p.a.id}~${p.b.id}`} className='text-muted-foreground'>
          <span className='text-foreground'>{p.a.label}</span> + <span className='text-foreground'>{p.b.label}</span>
          {p.rel && ` (${REL_WORDS[p.rel]})`}: on past {p.a.sport} games, legs like these both hit{' '}
          <span className={cn('font-semibold', p.factor > 1 ? 'text-good' : 'text-bad')}>
            {p.factor > 1 ? `${Math.round((p.factor - 1) * 100)}% more` : `${Math.round((1 - p.factor) * 100)}% less`}
          </span>{' '}
          often than their chances multiplied.
        </p>
      ))}
      {flat.length > 0 && (
        <p className='text-muted-foreground'>
          {moved.length ? n(flat) : flat.length === 1 ? 'These two' : `All ${flat.length} pairs`} ({rels(flat)}): on past {sport} games, legs like
          these hit together about as often as their chances multiplied, so nothing changes.
        </p>
      )}
      {none.length > 0 && (
        <p className='text-muted-foreground'>
          {none.length === 1 ? 'One pair' : `${none.length} pairs`} ({rels(none)}): no past {sport} games to check, so they&apos;re multiplied as
          if unrelated.
        </p>
      )}
      {changed && raw != null && (
        <p className='text-xs text-muted-foreground'>
          The chances above include this. Multiplied straight, Kalshi&apos;s prices would say {fmtPct(raw, raw < 0.1 ? 1 : 0)}. From past prices
          and results; it corrects the math, it isn&apos;t an edge.
          {moved.some((p) => p.factor > 1) && ' Sportsbooks and Kalshi\u2019s own combos usually price this in, so a same-game ticket built there tends to pay less than the multiplied odds above.'}
        </p>
      )}
    </div>
  )
}

// ---------- the slip, explained ----------
function SlipCard() {
  const { legs, remove, replace } = useSlip()
  const sheet = useLegSheet()
  const [stake, setStake] = useState('10')
  const { rows } = useGames()
  const [savedAs, setSavedAs] = useState<{ n: number; stake: number; win: number; first: string } | null>(null)
  const saveSlip = () => {
    const st = parseFloat(stake)
    const stakeN = isFinite(st) && st > 0 ? st : 0
    const mm = slipMath(legs)
    saveParlay({ stake: stakeN, odds: Math.round(mm.american), legs: legs.map((l) => trackedLeg(l, rows)) })
    const first = legs.map((l) => l.kickoff).filter(Boolean).sort()[0] ?? ''
    setSavedAs({ n: legs.length, stake: stakeN, win: stakeN * (mm.dec - 1), first })
    replace([]) // saved: the slip starts fresh, like classic's Track
  }
  const sg = useSameGameHistory()
  const raw = slipMath(legs)
  const adj = adjustedMath(legs, sg)
  // legs from one game: the whole-ticket chances use the same-game correction (lib/samegame)
  const m = adj.changed ? { ...raw, market: adj.market, devig: raw.devig == null ? null : adj.devig } : raw
  const s = parseFloat(stake)
  const started = legs.filter((l) => Date.parse(l.kickoff) <= Date.now())
  const weakest = legs
    .filter((l) => l.devig != null && l.fair != null)
    .sort((a, b) => (a.devig! - a.fair!) - (b.devig! - b.fair!))[0]
  const weakestGap = weakest ? weakest.devig! - weakest.fair! : 0
  if (savedAs) {
    return (
      <section id='your-parlay' aria-label='Saved' className='flex scroll-mt-20 flex-col gap-3 rounded-[18px] border border-good/30 bg-good/10 p-4'>
        <div className='flex items-center gap-2.5'>
          <span className='grid size-8 shrink-0 place-items-center rounded-full bg-good text-background'><Check className='size-[18px]' strokeWidth={3} aria-hidden='true' /></span>
          <span className='flex flex-col'>
            <span className='font-display text-xl font-extrabold'>Saved</span>
            <span className='text-[13px] text-muted-foreground'>
              {savedAs.n} {savedAs.n === 1 ? 'leg' : 'legs'}{savedAs.stake > 0 ? ` · ${money(savedAs.stake)} to win ${money(savedAs.win)}` : ''}
            </span>
          </span>
        </div>
        <p className='text-[13px] leading-relaxed'>
          {savedAs.first && Date.parse(savedAs.first) > Date.now() ? `First game starts ${new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(savedAs.first))}. ` : ''}
          You&apos;ll see each leg turn green or red as games finish, and a grade at the end.
        </p>
        <div className='grid grid-cols-2 gap-2'>
          <button type='button' onClick={() => document.getElementById('live-parlays')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className='h-11 rounded-full bg-good text-sm font-bold text-background'>See it live</button>
          <button type='button' onClick={() => setSavedAs(null)} className='h-11 rounded-full border text-sm font-semibold'>Start a new slip</button>
        </div>
      </section>
    )
  }
  if (!legs.length) {
    return (
      <section id='your-parlay' className='scroll-mt-20 rounded-[18px] border border-dashed p-6 text-center'>
        <p className='font-display text-2xl font-black'>Your slip is empty</p>
        <p className='mx-auto mt-1 max-w-sm text-sm text-muted-foreground'>
          Tap a team on any game in <Link to='/' className='text-devig'>Games</Link> and add it from its sheet, or let the long-shot builder below
          build one and explain it.
        </p>
      </section>
    )
  }
  const value = m.devig != null && m.devig > m.needs
  return (
    <section id='your-parlay' aria-label='Your parlay' className='flex scroll-mt-20 flex-col gap-4'>
      {sheet.sheet}
      <div className='flex items-baseline justify-between px-1'>
        <h2 className='font-display text-[22px] font-extrabold'>Your parlay, explained</h2>
        <button type='button' onClick={() => replace([])} className='text-sm text-muted-foreground hover:text-foreground'>Clear</button>
      </div>

      <div
        className='relative overflow-hidden rounded-[20px] text-white'
        style={{ background: 'linear-gradient(102deg, #232A38 0 52%, #3C2A10 52% 100%)' }}
      >
        <div className='grid grid-cols-2 gap-y-3 p-4'>
          <div>
            <div className='text-xs font-semibold text-white/85'>Pays</div>
            <div className='font-display text-[44px] leading-[0.9] font-black'>{fmtAmerican(m.american)}</div>
            {s > 0 && <div className='text-[13px] text-white/80'>{money(s)} wins {money(s * (m.dec - 1))}</div>}
          </div>
          <div className='text-end'>
            <div className='text-xs font-semibold text-white/85'>Needs to hit</div>
            <div className='font-display text-[44px] leading-[0.9] font-black'>{fmtPct(m.needs, 1)}</div>
            <div className='text-[13px] text-white/80'>to break even</div>
          </div>
          <div>
            <div className='text-xs font-semibold text-white/85'>Kalshi&apos;s prices say</div>
            <div className='font-display text-[28px] font-extrabold'>{m.market == null ? '—' : fmtPct(m.market, m.market < 0.1 ? 1 : 0)}</div>
          </div>
          <div className='text-end'>
            <div className='text-xs font-semibold text-[#FFB547]'>DeVig says</div>
            <div className='font-display text-[28px] font-extrabold text-[#FFB547]'>
              {m.devig == null ? 'no view' : fmtPct(m.devig, m.devig < 0.1 ? 1 : 0)}
            </div>
          </div>
        </div>
      </div>

      <div className='rounded-2xl bg-card p-4'>
        <p className={cn('font-display text-xl font-extrabold', value ? 'text-good' : 'text-devig')}>
          {m.devig == null
            ? 'DeVig has no model for these legs'
            : value
              ? weakest && weakestGap < -0.03
                ? 'DeVig likes it, with a catch'
                : 'DeVig likes this ticket'
              : 'DeVig says skip it'}
        </p>
        <p className='mt-1.5 text-sm leading-relaxed text-muted-foreground'>
          {m.market != null && `If Kalshi is right, it hits about 1 time in ${oneIn(m.market)}. `}
          {m.devig != null && `If DeVig is right, 1 in ${oneIn(m.devig)}. `}
          One missed leg loses the whole ticket.
          {m.devigLegs > 0 && m.devigLegs < legs.length && ` DeVig has its own number for ${m.devigLegs} of ${legs.length} legs; the rest use Kalshi's price.`}
          {weakest && weakestGap < -0.03 && ` The weakest leg is ${weakest.label}: DeVig gives it ${fmtPct(weakest.devig)} vs Kalshi's ${fmtPct(weakest.fair)}.`}
        </p>
        {adj.pairs.length > 0 && <SameGameNote pairs={adj.pairs} changed={adj.changed} raw={raw.market} />}
        {m.sameGame.length > adj.pairs.length && adj.pairs.length === 0 && (
          <p className='mt-2 text-sm font-semibold text-bad'>
            Two legs are from the same game. They move together, so these chances aren&apos;t exact for this ticket.
          </p>
        )}
        {started.length > 0 && (
          <p className='mt-2 text-sm font-semibold text-bad'>
            {started.map((l) => l.short).join(', ')}: game already started; that price is old.
          </p>
        )}
      </div>

      <ul className='flex flex-col gap-3'>
        {legs.map((l) => (
          <li key={l.id} className='flex flex-col gap-1.5'>
            <LegPlate
              leg={l}
              src={sheet.find(l)}
              onOpen={sheet.openFor(l)}
              right={
                <button type='button' aria-label={`Remove ${l.label}`} onClick={() => remove(l.id)} className='grid size-8 place-items-center rounded-full bg-black/35 hover:bg-black/55'>
                  <X className='size-4' />
                </button>
              }
            />
            <div className='flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-sm'>
              <ReadTag leg={l} />
              {l.devig != null && <span className='font-semibold text-devig'>DeVig {fmtPct(l.devig)}</span>}
              {l.fair != null && <span className='text-muted-foreground'>Kalshi {fmtPct(l.fair)}</span>}
              {l.devigNote && <span className='text-xs text-muted-foreground'>{l.devigNote}</span>}
            </div>
            <SaferSwap leg={l} />
          </li>
        ))}
      </ul>

      <div className='flex flex-col gap-1.5'>
        <button type='button' onClick={saveSlip}
          className='h-12 rounded-full bg-devig text-sm font-bold text-devig-ink'>
          Save this parlay
        </button>
        <p className='px-1 text-xs text-muted-foreground'>
          Saves all {legs.length} {legs.length === 1 ? 'leg' : 'legs'}{s > 0 ? ` and your ${money(s)} stake` : ''}, on this device and your account. Live parlays follows each leg below; once its games end it moves to History, graded.
        </p>
      </div>

      <OnKalshi legs={legs} />

      <label className='flex items-center gap-3 px-1 text-sm text-muted-foreground'>
        Stake $
        <Input inputMode='decimal' value={stake} onChange={(e) => setStake(e.target.value)} className='h-10 w-24 rounded-xl' />
        {s > 0 && <span>pays {money(s * m.dec)} back if every leg hits</span>}
      </label>
      <p className='px-1 text-xs text-muted-foreground'>
        Uses each leg&apos;s own Kalshi price with its fee. A combo bought as one ticket on Kalshi is priced by Kalshi and may differ.
      </p>
    </section>
  )
}

// Each leg's Kalshi buy link, Yes or No already picked: tap, put the money in, submit on Kalshi
function OnKalshi({ legs: saved }: { legs: Leg[] }) {
  const now = Date.now()
  const key = useKalshiKey()
  const { rows } = useGames()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // a team leg saved before legs carried their Kalshi market gets it again from today's board
  const legs = saved.map((l) => {
    if (l.ticker || l.kind !== 'ml' || l.outcome) return l
    const r = rows.find((x) => x.id === l.gameId)
    return r ? { ...l, ticker: kalshiTeam(r.ticker, l.sideIsHome ? 'home' : 'away') ?? undefined } : l
  })
  const links = legs.map((l) => ({ l, b: Date.parse(l.kickoff) > now ? kalshiBuy(l) : null }))
  if (!links.some((x) => x.b)) return null
  // the whole parlay as one combo: needs the Kalshi key set up in Profile (iPhone app), every leg pre-game with a market
  const blocked = links.filter((x) => !x.b || !comboLeg(x.l)).map((x) => x.l.short || x.l.label)
  const combo = key.ready && legs.length >= 2 && !blocked.length
  // with the key ready, say why there's no combo button instead of leaving it out
  const whyNot = !key.ready || combo ? '' : legs.length < 2 ? 'Add a second leg to send the parlay as one Kalshi combo.'
    : `${blocked.join(', ')} ${blocked.length > 1 ? 'have' : 'has'} no Kalshi market open now (or the game started). Take ${blocked.length > 1 ? 'them' : 'it'} off to send the rest as one combo.`
  const send = async () => {
    setBusy(true)
    setErr('')
    try { window.open(await buildCombo(legs), '_blank') } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setBusy(false)
  }
  return (
    <div className='flex flex-col gap-2 rounded-[18px] bg-card p-4'>
      <h3 className='font-display text-lg font-extrabold'>Bet it on Kalshi</h3>
      {combo && (
        <>
          <button type='button' disabled={busy} onClick={send}
            className='mt-1 flex h-12 items-center justify-center gap-1.5 rounded-full bg-devig text-sm font-bold text-devig-ink disabled:opacity-60'>
            {busy ? 'Building the combo…' : <>Open all {legs.length} legs as one Kalshi combo <ArrowUpRight className='size-4' aria-hidden='true' /></>}
          </button>
          {err && <p role='alert' className='text-sm font-semibold text-bad'>{err}</p>}
          <p className='text-sm leading-relaxed text-muted-foreground'>Face ID unlocks your key, Kalshi builds the combo, and it opens ready to buy. Kalshi sets the combo&apos;s price. Or open the legs one at a time:</p>
        </>
      )}
      {whyNot && <p className='text-sm font-semibold leading-relaxed'>{whyNot}</p>}
      {!combo && (
      <p className='text-sm leading-relaxed text-muted-foreground'>
        Each button opens that leg on Kalshi with {links.length > 1 ? 'its side' : 'the side'} already picked. You put in the money and submit there.
        {links.length > 1 && !key.ready && (key.available
          ? <> To send all of them as one combo, set up your Kalshi key in <Link to='/profile' className='font-semibold text-foreground underline underline-offset-4'>Profile</Link>.</>
          : <> To bet them as one ticket, add each leg to a combo on Kalshi.</>)}
      </p>
      )}
      <ul className='flex flex-col'>
        {links.map(({ l, b }) => (
          <li key={l.id} className='flex min-h-12 items-center gap-3 border-t py-1.5 first:border-t-0'>
            <span className='min-w-0 flex-1'>
              <span className='block truncate text-sm font-semibold'>{l.label}</span>
              <span className='block truncate text-xs text-muted-foreground'>{b ? `Buy ${b.side === 'yes' ? 'Yes' : 'No'} · ${l.game}` : 'Game started or no Kalshi market'}</span>
            </span>
            {b && (
              <a href={b.url} target='_blank' rel='noopener noreferrer' aria-label={`Open ${l.label} on Kalshi`}
                className='flex h-9 shrink-0 items-center gap-1 rounded-full bg-devig px-3.5 text-sm font-bold text-devig-ink'>
                Kalshi <ArrowUpRight className='size-4' aria-hidden='true' />
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------- the long-shot builder (same search as the classic app: the likeliest ticket at Kalshi's prices) ----------
type Cand = { leg: Leg; dec: number; fair: number; game: string; why: string }
const MAX_LEGS = 5, POOL = 36, PROPS_PER_GAME = 2, POOL_WITH_PROPS = 44

function candidates(rows: GameRow[], props: PropLine[], live: Record<string, LivePrice>, sport: string, withProps: boolean): Cand[] {
  const now = Date.now()
  const out: Cand[] = []
  for (const r of rows) {
    if (r.state !== 'pre' || Date.parse(r.kickoff) <= now || r.fairHome == null) continue
    if (sport !== 'ALL' && r.sport !== sport) continue
    for (const side of ['away', 'home'] as const) {
      const leg = mlLeg(r, side)
      if (!leg || leg.fair == null) continue
      out.push({ leg, dec: decimal(leg.odds), fair: leg.fair, game: r.id, why: '' })
    }
  }
  out.sort((a, b) => b.fair * b.dec - a.fair * a.dec)
  let pool = out.slice(0, POOL)
  if (withProps) {
    const pp: Cand[] = []
    for (const l of props) {
      if (sport !== 'ALL' && l.sport !== sport) continue
      if (!l.ticker || Date.parse(l.kickoff) <= now) continue
      const lv = live[l.ticker]
      const priced = lv ? { ...l, bid: lv.bid, ask: lv.ask } : l
      if ((l.oi || 0) < 100) continue
      for (const side of ['over', 'under'] as const) {
        const ps = propSide(priced, side)
        if (!ps || ps.spread > 0.1 || !(ps.cost >= 0.15 && ps.cost <= 0.85)) continue
        const odds = priceToAmerican(ps.cost)
        if (odds == null) continue
        const devig = l.modelOver == null ? null : side === 'over' ? l.modelOver : 1 - l.modelOver
        pp.push({
          leg: {
            id: `${l.key}|${side}`, kind: 'prop', label: `${l.player.split(' ').slice(-1)[0]} ${side === 'over' ? overTxt(l.stat, l.line) : underTxt(l.stat, l.line)}`,
            short: l.player.split(' ').slice(-1)[0], game: `${l.away} at ${l.home}`, gameId: `${l.sport}|${l.gameKey}`, sport: l.sport,
            kickoff: l.kickoff, odds, fair: ps.fair, devig, devigNote: devig == null ? null : 'props model: Kalshi beat it on past games',
            colors: null, sideIsHome: null, ticker: l.ticker, player: l.player, stat: l.stat, line: l.line,
          },
          dec: 1 / ps.cost, fair: ps.fair, game: `${l.sport}|${l.gameKey}`, why: '',
        })
      }
    }
    const per = new Map<string, number>()
    pp.sort((a, b) => b.fair * b.dec - a.fair * a.dec).forEach((c) => {
      const n = (per.get(c.game) ?? 0) + 1
      per.set(c.game, n)
      if (n <= PROPS_PER_GAME) pool.push(c)
    })
    pool = pool.sort((a, b) => b.fair * b.dec - a.fair * a.dec).slice(0, POOL_WITH_PROPS)
  }
  return pool
}

function search(cands: Cand[], target: number) {
  const best: { key: string; legs: Cand[]; prob: number; mult: number }[] = []
  const consider = (legs: Cand[], prob: number, mult: number) => {
    const key = legs.map((l) => l.leg.id).sort().join('|')
    if (best.some((b) => b.key === key)) return
    best.push({ key, legs: legs.slice(), prob, mult })
    best.sort((a, b) => b.prob - a.prob || a.legs.length - b.legs.length)
    if (best.length > 12) best.length = 12
  }
  const games = new Set<string>()
  const legs: Cand[] = []
  const dfs = (start: number, prob: number, mult: number) => {
    if (mult >= target) return consider(legs, prob, mult)
    if (legs.length >= MAX_LEGS) return
    if (best.length >= 12 && prob <= best[best.length - 1].prob) return
    for (let i = start; i < cands.length; i++) {
      const c = cands[i]
      if (games.has(c.game)) continue
      games.add(c.game); legs.push(c)
      dfs(i + 1, prob * c.fair, mult * c.dec)
      legs.pop(); games.delete(c.game)
    }
  }
  dfs(0, 1, 1)
  return best.slice(0, 3)
}

const TARGETS = [
  { label: '+300', mult: 4 },
  { label: '+1000', mult: 11 },
  { label: '+5000', mult: 51 },
]

function LongShot() {
  const { rows } = useGames()
  const { lines } = useProps()
  const { replace } = useSlip()
  const sheet = useLegSheet()
  const [target, setTarget] = useState(11)
  const [sport, setSport] = useState('ALL')
  const [withProps, setWithProps] = useState(true)
  const [busy, setBusy] = useState(false)
  const [tickets, setTickets] = useState<ReturnType<typeof search> | null>(null)
  const [note, setNote] = useState('')
  const sports = useMemo(() => ['ALL', ...Array.from(new Set(rows.filter((r) => r.state === 'pre').map((r) => r.sport))).sort()], [rows])

  async function build() {
    setBusy(true)
    setNote("Checking Kalshi's live prices…")
    let live: Record<string, LivePrice> = {}
    if (withProps) {
      const pre = candidates(rows, lines, {}, sport, true).filter((c) => c.leg.ticker)
      live = await Promise.race([
        fetchLiveProps(pre.map((c) => c.leg.ticker as string)),
        new Promise<Record<string, LivePrice>>((r) => setTimeout(() => r({}), 6000)),
      ])
    }
    const cands = candidates(rows, lines, live, sport, withProps)
    const found = search(cands, target)
    setTickets(found)
    setNote(
      cands.length < 2
        ? 'Not enough upcoming games with prices right now.'
        : found.length
          ? `Built from ${cands.length} sides on the board${Object.keys(live).length ? ', props at live prices' : ''}.`
          : `No ticket of up to ${MAX_LEGS} legs reaches that payout right now. Try a smaller one.`
    )
    setBusy(false)
  }

  return (
    <section aria-label='Long-shot builder' className='flex flex-col gap-4'>
      {sheet.sheet}
      <div className='px-1'>
        <h2 className='font-display text-[22px] font-extrabold'>Long-shot builder</h2>
        <p className='text-sm text-muted-foreground'>Pick a payout. DeVig builds the ticket most likely to hit at Kalshi&apos;s prices, then tells you why, and how likely it is to lose.</p>
      </div>
      <div className='flex flex-col gap-3 rounded-[18px] bg-card p-4'>
        <div role='radiogroup' aria-label='Payout' className='grid grid-cols-3 gap-1 rounded-xl bg-muted p-1'>
          {TARGETS.map((t) => (
            <button key={t.label} type='button' role='radio' aria-checked={target === t.mult} onClick={() => setTarget(t.mult)}
              className={cn('h-10 rounded-lg text-sm font-semibold text-muted-foreground', target === t.mult && 'bg-foreground text-background')}>
              {t.label} or more
            </button>
          ))}
        </div>
        <div className='flex flex-wrap gap-2'>
          {sports.map((s) => (
            <button key={s} type='button' aria-pressed={sport === s} onClick={() => setSport(s)}
              className={cn('h-9 rounded-full border px-4 text-sm font-medium text-muted-foreground', sport === s && 'border-foreground bg-foreground text-background')}>
              {s === 'ALL' ? 'All sports' : s}
            </button>
          ))}
          <button type='button' aria-pressed={withProps} onClick={() => setWithProps((v) => !v)}
            className={cn('h-9 rounded-full border px-4 text-sm font-medium text-muted-foreground', withProps && 'border-foreground bg-foreground text-background')}>
            Player props
          </button>
        </div>
        <Button onClick={build} disabled={busy} className='h-12 rounded-xl text-base font-bold'>
          {busy ? 'Building…' : 'Build my long shot'}
        </Button>
        {note && <p className='text-sm text-muted-foreground'>{note}</p>}
      </div>

      {tickets?.map((t, i) => {
        const dec = t.legs.reduce((m, c) => m * c.dec, 1)
        const devigLegs = t.legs.filter((c) => c.leg.devig != null).length
        const devigProb = devigLegs ? t.legs.reduce((m, c) => m * (c.leg.devig ?? c.fair), 1) : null
        return (
          <article key={t.key} className='flex flex-col gap-3 rounded-[18px] bg-card p-4'>
            <div className='flex items-baseline justify-between'>
              <span className='font-display text-2xl font-black'>{i === 0 ? 'Best build' : `Option ${i + 1}`}</span>
              <span className='font-display text-2xl font-black'>{fmtAmerican((dec - 1) * 100)}</span>
            </div>
            <p className='rounded-xl bg-bad/10 px-3 py-2 text-sm leading-relaxed text-foreground'>
              By Kalshi&apos;s prices this hits about 1 time in {oneIn(t.prob)} ({fmtPct(t.prob, 1)}); it needs {fmtPct(1 / dec, 1)} to
              break even.{devigProb != null && ` Counting DeVig's numbers where it has them: ${fmtPct(devigProb, 1)}.`} Only stake what you&apos;re fine losing.
            </p>
            <ul className='flex flex-col gap-3'>
              {t.legs.map((c) => (
                <li key={c.leg.id} className='flex flex-col gap-1.5'>
                  <LegPlate leg={c.leg} src={sheet.find(c.leg)} onOpen={sheet.openFor(c.leg)} />
                  <p className='px-1 text-sm leading-relaxed text-muted-foreground'>
                    <b className='text-foreground'>Picked because</b>{' '}
                    {c.dec >= 3
                      ? `it's the long leg: on its own it pays ${fmtAmerican(c.leg.odds)}, so it carries most of the payout, and at ${fmtPct(c.fair)} by Kalshi's prices it's the main reason this ticket usually loses.`
                      : `it's a safer leg that adds a little payout: Kalshi gives it ${fmtPct(c.fair)}.`}{' '}
                    Every leg is from a different game.{' '}
                    {c.leg.devig != null && (
                      <>
                        <ReadTag leg={c.leg} /> DeVig {fmtPct(c.leg.devig)}
                        {c.leg.devigNote ? ` (${c.leg.devigNote})` : ''}.
                      </>
                    )}
                  </p>
                </li>
              ))}
            </ul>
            <Button variant='outline' className='h-11 rounded-xl' onClick={() => replace(t.legs.map((c) => c.leg))}>
              Put this ticket in my slip
            </Button>
          </article>
        )
      })}
    </section>
  )
}

// ---------- check a bet you already made: a screenshot (any book), a sportsbook share link, or a Kalshi link ----------
function CheckBet() {
  const [how, setHow] = useState<'shot' | 'book' | 'link'>('shot')
  const toSlip = () => setTimeout(() => document.getElementById('your-parlay')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  return (
    <section aria-label='Check a bet you made' className='flex flex-col gap-3'>
      <div className='flex flex-wrap items-end justify-between gap-3'>
        <div>
          <h2 className='font-display text-[22px] font-extrabold'>Check a bet you made</h2>
          <p className='mt-0.5 text-sm text-muted-foreground'>See every leg, what it needs, and how the price compares.</p>
        </div>
        <div role='radiogroup' aria-label='How' className='grid grid-cols-3 gap-1 rounded-xl bg-muted p-1'>
          {([['shot', 'Screenshot'], ['book', 'Book link'], ['link', 'Kalshi link']] as const).map(([k, t]) => (
            <button key={k} type='button' role='radio' aria-checked={how === k} onClick={() => setHow(k)}
              className={cn('h-9 rounded-lg px-3 text-sm font-semibold transition-colors duration-150', how === k ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
              {t}
            </button>
          ))}
        </div>
      </div>
      {how === 'shot' ? <ScreenshotReader onExplained={toSlip} /> : how === 'book' ? <BookLinkReader onExplained={toSlip} /> : (
        <LinkReader showSaved={false} title='From a Kalshi link' blurb={<>On Kalshi, tap Share on your bet and paste the link here: a combo shows every leg, what&apos;s won, and the prices now.</>} />
      )}
    </section>
  )
}

// ---------- your saved parlays that are still going: live and coming up. Once their games end they move to History ----------
function LiveParlays() {
  const { tracked } = useTracked()
  const list = useMemo(() => trackedParlays(tracked), [tracked])
  return (
    <section id='live-parlays' aria-label='Live parlays' className='flex scroll-mt-20 flex-col gap-3'>
      <div className='flex items-end justify-between gap-3'>
        <h2 className='font-display text-[22px] font-extrabold'>Live parlays</h2>
        <Link to='/history' className='text-sm font-semibold text-devig'>Finished ›</Link>
      </div>
      <YourParlays list={list} part='open' />
      <LinkReader part='open' />
    </section>
  )
}

export function Parlay() {
  return (
    <>
      <Header>
        <div className='me-auto min-w-0'>
          <h1 className='font-display text-[26px] leading-none font-black'>Parlay</h1>
          <p className='mt-0.5 truncate text-xs text-muted-foreground'>Every leg multiplies the risk. DeVig shows what it needs.</p>
        </div>
        <ThemeSwitch />
      </Header>
      <Main className='flex flex-col gap-8'>
        <SlipCard />
        <LiveParlays />
        <CheckBet />
        <LongShot />
        <p className='max-w-prose text-xs leading-relaxed text-muted-foreground'>
          Chances use Kalshi&apos;s prices with the fee gap removed; payouts use Kalshi&apos;s price with its fee. DeVig doesn&apos;t
          bet and doesn&apos;t promise wins.
        </p>
      </Main>
    </>
  )
}
