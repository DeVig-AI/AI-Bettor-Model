import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { Undo2, X } from 'lucide-react'
import { fmtAmerican, useGames } from '@/lib/devig'
import { labFor, useLab } from '@/lib/lab'
import { type Graded, type LoggedBet, grade, useBets, useCloses } from '@/lib/bets'
import { americanFrom, breakeven, expectedValue, kelly, noVig, parseAmerican } from '@/lib/odds'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ThemeSwitch } from '@/components/theme-switch'
import { isPick } from '../games/plate'

// Fair price: take the vig off any sportsbook's moneyline, see what it needs against Kalshi's and DeVig's numbers,
// size the bet, and log it. My bets then grades each logged bet against Kalshi's last price before the game
// (beating the close) and the final.

// the sports the model comparison logs a closing price for (tools/models_compare.py SPORTS)
const GRADED = ['NFL', 'NBA', 'MLB', 'NHL', 'CFB']
const BOOKS = ['DraftKings', 'FanDuel', 'BetMGM', 'Caesars', 'ESPN BET', 'Fanatics', 'Hard Rock', 'bet365', 'BetRivers', 'Kalshi', 'Other']
const BANKROLL_KEY = 'devig.bankroll.v1'

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`
const pts = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1)} pts`
const money = (x: number) => `${x < 0 ? '−' : ''}$${Math.abs(x).toFixed(2)}`
const signedPct = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1)}%`
const when = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const day = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const tone = (x: number | null) => (x == null ? '' : x > 0.0005 ? 'text-good' : x < -0.0005 ? 'text-bad' : '')

function loadBankroll() {
  try { return localStorage.getItem(BANKROLL_KEY) ?? '' } catch { return '' }
}

type Ref = { key: string; name: string; note?: string; chance: number }

export function Fair() {
  return (
    <>
      <Header>
        <div className='me-auto min-w-0'>
          <h1 className='font-display text-[26px] leading-none font-black'>Fair price</h1>
          <p className='mt-0.5 truncate text-xs text-muted-foreground'>Take the vig off any sportsbook&apos;s price, then see if you beat the close.</p>
        </div>
        <ThemeSwitch />
      </Header>
      <Main className='flex flex-col gap-8'>
        <Calculator />
        <MyBets />
      </Main>
    </>
  )
}

// ---------- the calculator ----------
function Calculator() {
  const { rows } = useGames()
  const { data: lab } = useLab()
  const { add } = useBets()
  const [gameId, setGameId] = useState('')
  const [side, setSide] = useState<'away' | 'home'>('away')
  const [mineText, setMine] = useState('')
  const [otherText, setOther] = useState('')
  const [bankroll, setBankroll] = useState(loadBankroll)
  const [sizeOn, setSizeOn] = useState<string | null>(null)
  const [book, setBook] = useState('DraftKings')
  const [stakeText, setStake] = useState('')
  const [logged, setLogged] = useState('')

  useEffect(() => {
    try { localStorage.setItem(BANKROLL_KEY, bankroll) } catch { /* private mode */ }
  }, [bankroll])

  const now = Date.now()
  const upcoming = useMemo(
    () => (rows ?? []).filter((r) => GRADED.includes(r.sport) && r.state === 'pre' && Date.parse(r.kickoff) > now - 10 * 60e3),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows]
  )
  const row = upcoming.find((r) => r.id === gameId) ?? null
  const mine = parseAmerican(mineText)
  const other = otherText.trim() ? parseAmerican(otherText) : null
  const nv = mine != null && other != null ? noVig(mine, other) : null
  const needs = breakeven(mine)

  // what each number says your side's chance is
  const refs: Ref[] = []
  if (nv) refs.push({ key: 'book', name: 'This book, vig off', chance: nv.mine })
  if (row) {
    const code = side === 'home' ? row.home : row.away
    if (row.fairHome != null) refs.push({ key: 'kalshi', name: 'Kalshi', chance: side === 'home' ? row.fairHome : 1 - row.fairHome })
    if (isPick(row) && row.pick?.prob != null) {
      refs.push({ key: 'devig', name: 'DeVig', note: `picked ${row.pick.side}`, chance: row.pick.side === code ? row.pick.prob : 1 - row.pick.prob })
    }
    const lg = labFor(lab, row)
    if (lg) refs.push({ key: 'lab', name: 'DeVig Lab', note: 'new, not proven', chance: side === 'home' ? lg.home_wp : 1 - lg.home_wp })
  }
  const sizing = refs.find((r) => r.key === sizeOn) ?? refs.find((r) => r.key === 'devig') ?? refs.find((r) => r.key === 'kalshi') ?? refs[0] ?? null
  const bank = Number(bankroll)
  const k = sizing && mine != null ? kelly(sizing.chance, mine) : null
  const suggested = k != null && bank > 0 ? Math.floor(bank * k * 0.25 * 100) / 100 : null

  const pickGame = (id: string) => {
    setGameId(id)
    setSizeOn(null)
    setLogged('')
  }
  const log = () => {
    if (!row || mine == null) return
    const stake = Number(stakeText)
    add({
      sport: row.sport, game: row.id.split('|')[1], away: row.away, home: row.home, kickoff: row.kickoff,
      side, odds: mine, other, book, stake: stakeText.trim() && isFinite(stake) && stake >= 0 ? stake : null,
    })
    setLogged(`Logged ${side === 'home' ? row.home : row.away} ${fmtAmerican(mine)} at ${book}. It's in My bets below.`)
    setStake('')
  }

  return (
    <section aria-labelledby='calc-h' className='flex flex-col gap-3'>
      <h2 id='calc-h' className='px-1 font-display text-2xl font-extrabold'>Check a price</h2>
      <div className='flex flex-col gap-4 rounded-[18px] bg-card p-4'>
        <label className='flex flex-col gap-1.5 text-sm font-medium'>
          <span>Game <span className='font-normal text-muted-foreground'>(optional: adds Kalshi&apos;s and DeVig&apos;s numbers)</span></span>
          <select value={gameId} onChange={(e) => pickGame(e.target.value)}
            className='h-11 rounded-xl border border-input bg-background px-3 text-base'>
            <option value=''>Any moneyline, no game</option>
            {GRADED.map((s) => {
              const games = upcoming.filter((r) => r.sport === s)
              return games.length ? (
                <optgroup key={s} label={s}>
                  {games.map((r) => <option key={r.id} value={r.id}>{r.away} at {r.home} · {when.format(new Date(r.kickoff))}</option>)}
                </optgroup>
              ) : null
            })}
          </select>
        </label>

        {row && (
          <div role='radiogroup' aria-label='Your side' className='grid grid-cols-2 rounded-xl bg-background p-1'>
            {(['away', 'home'] as const).map((s) => (
              <button key={s} type='button' role='radio' aria-checked={side === s} onClick={() => { setSide(s); setLogged('') }}
                className={cn('h-10 truncate rounded-lg px-2 text-sm font-semibold text-muted-foreground', side === s && 'bg-card text-foreground shadow-sm')}>
                {s === 'home' ? row.homeName : row.awayName}
              </button>
            ))}
          </div>
        )}

        <div className='grid grid-cols-2 gap-3'>
          <OddsField label={row ? `${side === 'home' ? row.home : row.away} odds` : 'Your side'} value={mineText} onChange={setMine} bad={!!mineText.trim() && mine == null} />
          <OddsField label={row ? `${side === 'home' ? row.away : row.home} odds` : 'Other side'} hint='optional' value={otherText} onChange={setOther} bad={!!otherText.trim() && other == null} />
        </div>
        <p className='-mt-2 text-xs text-muted-foreground'>American odds from the sportsbook, like −110 or +150. Add the other side to take the book&apos;s vig off.</p>
      </div>

      {mine != null && needs != null && (
        <div className='flex flex-col gap-3 rounded-[18px] bg-card p-4' aria-live='polite'>
          <div className='flex items-baseline justify-between gap-3'>
            <span className='text-sm text-muted-foreground'>{fmtAmerican(mine)} needs</span>
            <span className='font-condensed text-3xl font-black tabular-nums'>{pct(needs)}</span>
          </div>
          <p className='-mt-2 text-xs text-muted-foreground'>to break even. Any chance above that is an edge.</p>
          {nv && (
            <p className='text-sm'>
              With the vig off, this book rates it <b className='tabular-nums'>{pct(nv.mine)}</b> (fair odds {fmtAmerican(americanFrom(nv.mine))}).
              The book keeps <span className='tabular-nums'>{pct(nv.vig)}</span> on this market.
            </p>
          )}

          {refs.length > 0 ? (
            <ul className='flex flex-col gap-1.5' aria-label='Numbers for your side'>
              {refs.map((r) => {
                const ev = expectedValue(r.chance, mine)
                const on = sizing?.key === r.key
                return (
                  <li key={r.key}>
                    <button type='button' aria-pressed={on} onClick={() => setSizeOn(r.key)}
                      className={cn('flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-start', on ? 'border-devig' : 'border-transparent bg-background')}>
                      <span className='min-w-0 flex-1'>
                        <span className={cn('block font-semibold', r.key === 'devig' || r.key === 'lab' ? 'text-devig' : '')}>{r.name}</span>
                        <span className='block text-xs text-muted-foreground'>{r.note ? `${r.note} · ` : ''}{pct(r.chance)} chance, edge {pts(r.chance - needs)}</span>
                      </span>
                      <span className='text-end'>
                        <span className={cn('block font-condensed text-lg font-bold tabular-nums', tone(ev))}>{signedPct(ev)}</span>
                        <span className='block text-[11px] text-muted-foreground'>{money(ev * 100)} per $100</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className='text-sm text-muted-foreground'>Add the other side&apos;s odds or pick a game to compare this price with a fair chance.</p>
          )}

          {sizing && (
            <div className='flex flex-col gap-2 border-t pt-3'>
              <label className='flex items-center gap-3 text-sm text-muted-foreground'>
                Bankroll $
                <Input inputMode='decimal' value={bankroll} onChange={(e) => setBankroll(e.target.value)} placeholder='500' className='h-10 w-28 rounded-xl' />
              </label>
              <p className='text-sm'>
                {k == null
                  ? <>No bet: {sizing.key === 'book' ? 'with the vig off, the book' : sizing.name} gives this side {pct(sizing.chance)}, below the {pct(needs)} the price needs.</>
                  : suggested != null
                    ? <>Quarter Kelly on {sizing.name}: <b className='tabular-nums'>{money(suggested)}</b> ({pct(k * 0.25)} of the bankroll).</>
                    : <>Quarter Kelly on {sizing.name}: {pct(k * 0.25)} of the bankroll. Enter it for a dollar amount.</>}
              </p>
              <p className='text-xs text-muted-foreground'>
                Kelly sizes a bet by how big the edge is; a quarter of it allows for the number being wrong. Tap a row above to size on it instead.
              </p>
            </div>
          )}

          {row ? (
            <div className='flex flex-col gap-2 border-t pt-3'>
              <div className='flex flex-wrap items-end gap-2'>
                <label className='flex flex-col gap-1 text-xs text-muted-foreground'>
                  Book
                  <select value={book} onChange={(e) => setBook(e.target.value)} className='h-10 rounded-xl border border-input bg-background px-2 text-sm text-foreground'>
                    {BOOKS.map((b) => <option key={b}>{b}</option>)}
                  </select>
                </label>
                <label className='flex flex-col gap-1 text-xs text-muted-foreground'>
                  Stake $
                  <Input inputMode='decimal' value={stakeText} onChange={(e) => setStake(e.target.value)} placeholder={suggested ? String(suggested) : 'optional'} className='h-10 w-28 rounded-xl' />
                </label>
                <button type='button' onClick={log} className='h-10 rounded-full bg-devig px-5 text-sm font-bold text-devig-ink'>Log this bet</button>
              </div>
              {logged && <p className='text-sm text-good' role='status'>{logged}</p>}
            </div>
          ) : (
            <p className='border-t pt-3 text-xs text-muted-foreground'>Pick a game to log this bet and see later whether it beat the close.</p>
          )}
        </div>
      )}
    </section>
  )
}

function OddsField({ label, hint, value, onChange, bad }: { label: string; hint?: string; value: string; onChange: (v: string) => void; bad: boolean }) {
  return (
    <label className='flex min-w-0 flex-col gap-1.5 text-sm font-medium'>
      <span className='truncate'>{label}{hint && <span className='font-normal text-muted-foreground'> ({hint})</span>}</span>
      <Input inputMode='text' autoComplete='off' value={value} onChange={(e) => onChange(e.target.value)} placeholder='−110' aria-invalid={bad}
        className='h-11 rounded-xl font-condensed text-lg tabular-nums' />
    </label>
  )
}

// ---------- my bets ----------
function MyBets() {
  const { bets, remove, restore } = useBets()
  const { data, isLoading } = useCloses()
  const [undo, setUndo] = useState<LoggedBet | null>(null)
  const graded = bets.map((b) => grade(b, data))
  const closed = graded.filter((g) => g.clv)
  const beat = closed.filter((g) => g.clv!.points > 0).length
  const avg = closed.length ? closed.reduce((s, g) => s + g.clv!.points, 0) / closed.length : null
  const final = graded.filter((g) => g.result)
  const w = final.filter((g) => g.result === 'won').length, l = final.filter((g) => g.result === 'lost').length
  const p = final.length - w - l
  const units = final.reduce((s, g) => s + (g.units ?? 0), 0)
  const staked = final.filter((g) => g.bet.stake != null)
  const dollars = staked.length ? staked.reduce((s, g) => s + (g.units ?? 0) * (g.bet.stake as number), 0) : null

  return (
    <section aria-labelledby='bets-h' className='flex flex-col gap-3'>
      <h2 id='bets-h' className='px-1 font-display text-2xl font-extrabold'>My bets</h2>
      {bets.length === 0 ? (
        <p className='rounded-[18px] border border-dashed p-4 text-sm text-muted-foreground'>
          Bets you log above show up here. After each game starts, DeVig checks your price against Kalshi&apos;s last price before the game.
          Beating that closing price again and again is the surest sign of a real edge, long before wins and losses can show it.
        </p>
      ) : (
        <>
          <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
            <Tile k='Beat the close' v={closed.length ? `${beat} of ${closed.length}` : '—'} />
            <Tile k='Average vs close' v={avg == null ? '—' : pts(avg)} cls={tone(avg)} />
            <Tile k='Record' v={final.length ? `${w}–${l}${p ? `–${p}` : ''}` : '—'} />
            <Tile k='Profit' v={final.length ? (dollars != null ? money(dollars) : `${units >= 0 ? '+' : '−'}${Math.abs(units).toFixed(2)} u`) : '—'} cls={tone(final.length ? units : null)} />
          </div>
          {undo && (
            <div className='flex items-center justify-between gap-3 rounded-xl bg-muted px-4 py-2 text-sm' role='status'>
              Removed {undo.side === 'home' ? undo.home : undo.away} {fmtAmerican(undo.odds)}.
              <button type='button' onClick={() => { restore(undo); setUndo(null) }} className='inline-flex items-center gap-1 font-semibold text-devig'>
                <Undo2 className='size-4' aria-hidden='true' /> Undo
              </button>
            </div>
          )}
          {isLoading ? <Skeleton className='h-20 rounded-[18px]' /> : (
            <ul className='overflow-hidden rounded-[18px] bg-card'>
              {graded.map((g) => <BetRow key={g.bet.id} g={g} onRemove={() => { setUndo(g.bet); remove(g.bet.id) }} />)}
            </ul>
          )}
          <p className='px-1 text-xs text-muted-foreground'>
            The close is Kalshi&apos;s last price before the game with its fee gap split evenly, read once an hour, so it can be up to an hour early.
            Points are that closing chance minus what your price needed. Profit counts the stake you entered, or 1 unit per bet when there isn&apos;t one.
          </p>
        </>
      )}
    </section>
  )
}

function Tile({ k, v, cls }: { k: string; v: string; cls?: string }) {
  return (
    <div className='rounded-xl bg-card px-3 py-2.5'>
      <div className='text-xs text-muted-foreground'>{k}</div>
      <div className={cn('font-condensed text-xl font-bold tabular-nums', cls)}>{v}</div>
    </div>
  )
}

function BetRow({ g, onRemove }: { g: Graded; onRemove: () => void }) {
  const b = g.bet
  const team = b.side === 'home' ? b.home : b.away
  const needs = breakeven(b.odds)
  let status: ReactNode
  if (g.clv && g.close != null) {
    status = (
      <>
        <span className={cn('block font-condensed text-lg font-bold tabular-nums', tone(g.clv.points))}>{pts(g.clv.points)}</span>
        <span className='block text-[11px] text-muted-foreground tabular-nums'>close {pct(g.close, 0)} vs {needs != null ? pct(needs, 0) : '—'}</span>
      </>
    )
  } else {
    status = <span className='block text-xs text-muted-foreground'>{g.started ? 'Close coming' : 'Close after start'}</span>
  }
  const result = g.result && (
    <span className={cn('font-semibold', g.result === 'won' ? 'text-good' : g.result === 'lost' ? 'text-bad' : 'text-muted-foreground')}>
      {g.result === 'won' ? 'Won' : g.result === 'lost' ? 'Lost' : 'Push'}
      {b.stake != null && g.units != null && g.result !== 'push' ? ` ${money(g.units * b.stake)}` : ''}
    </span>
  )
  return (
    <li className='flex items-center gap-3 border-b px-4 py-3 last:border-b-0'>
      <span className='min-w-0 flex-1'>
        <span className='block font-semibold'>
          {team} <span className='font-condensed tabular-nums'>{fmtAmerican(b.odds)}</span>
          <span className='ms-2 text-xs font-normal text-muted-foreground'>{b.sport}</span>
        </span>
        <span className='block truncate text-xs text-muted-foreground'>
          {b.away} at {b.home} · {day.format(new Date(b.kickoff))} · {b.book}{b.stake != null ? ` · ${money(b.stake)}` : ''}
        </span>
        {result && <span className='block text-xs'>{result}</span>}
      </span>
      <span className='shrink-0 text-end'>{status}</span>
      <button type='button' aria-label={`Remove ${team} ${fmtAmerican(b.odds)}`} onClick={onRemove}
        className='grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted'>
        <X className='size-4' />
      </button>
    </li>
  )
}

