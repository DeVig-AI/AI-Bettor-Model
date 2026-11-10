// The props board: pick a game (or all of them) and a stat, see the lines players reached in each of their last 10
// games, then one row per player with DeVig's projection, Kalshi's chance and DeVig's chance side by side. A row opens
// the player drawer (player-sheet.tsx). Kalshi's live price is asked for what's on screen.
import { useMemo, useState } from 'react'
import { type GameRow, fmtAmerican } from '@/lib/devig'
import { type PropLine, priceToAmerican, propSide, statName, useProps } from '@/lib/props'
import { cn } from '@/lib/utils'
import { TeamLogo, PlayerPhoto } from '@/components/team-logo'
import { usePropPlayer, usePropWhy } from './why'
import { useStreakSummary } from './streaks'
import { LAST, type Group, type Logs, groupLines, hits, needOf, tenOfTen, thinLine, useLivePrices, usePlayerLogs } from './board-data'
import { PlayerSheet } from './player-sheet'
import { plainStat } from './words'

const clockFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
const pct = (p: number) => `${Math.round(p * 100)}%`
const gkey = (l: PropLine) => `${l.sport}|${l.gameKey}`
const odds = (c: number | null | undefined) => (c == null ? null : fmtAmerican(priceToAmerican(c)))
const yesCost = (l: Pick<PropLine, 'bid' | 'ask'>) => propSide(l, 'over')?.cost ?? null

// the list says "points" in full and long stats short ("rec yds")
const listStat = (s: string) => (plainStat(s).length <= 10 ? plainStat(s) : statName(s, true))

type Ten = { g: Group; line: number; thin: boolean }

export function PropsBoard({ ls, gameFor, pickGame = true, strip = true }: {
  ls: PropLine[]; gameFor: (l: PropLine) => GameRow | null; pickGame?: boolean; strip?: boolean
}) {
  const sport = ls[0]?.sport ?? ''
  const [game, setGame] = useState<string | null>(null)
  const [stat, setStat] = useState<string | null>(null)
  const [showThin, setShowThin] = useState(false)
  const [sel, setSel] = useState<{ key: string; line: number } | null>(null)
  const [open, setOpen] = useState(false)

  const games = useMemo(() => {
    const m = new Map<string, PropLine>()
    ls.forEach((l) => { if (!m.has(gkey(l))) m.set(gkey(l), l) })
    return [...m.values()].sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff) || a.away.localeCompare(b.away))
  }, [ls])
  const cur = game && games.some((g) => gkey(g) === game) ? game : null
  const scope = useMemo(() => (cur ? ls.filter((l) => gkey(l) === cur) : ls), [ls, cur])
  const stats = useMemo(() => {
    const c = new Map<string, number>()
    scope.forEach((l) => c.set(l.stat, (c.get(l.stat) ?? 0) + 1))
    return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([x]) => x)
  }, [scope])
  const st = stat && stats.includes(stat) ? stat : stats.includes('points') ? 'points' : stats[0]

  const teams = useMemo(() => [...new Set((cur ? games.filter((g) => gkey(g) === cur) : games).flatMap((g) => [g.away, g.home]))], [games, cur])
  const logs = usePlayerLogs(sport, teams)

  // what's on screen at the file's price, to know which tickers to ask Kalshi about
  const base = useMemo(() => groupLines(scope, {}), [scope])
  const tenOf = (gs: Group[]): Ten[] => {
    if (!logs) return []
    const out: Ten[] = []
    for (const g of gs) {
      const last = logs.last(g.player, g.stat)
      const ok = g.lines.filter((x) => tenOfTen(last, x.line))
      if (!ok.length) continue
      const real = ok.filter((x) => !thinLine(x))
      const pool = real.length ? real : ok
      const x = pool[pool.length - 1]
      out.push({ g, line: x.line, thin: !real.length })
    }
    return out
  }
  const tickers = useMemo(() => {
    const t = [...base.filter((g) => g.stat === st).map((g) => g.main), ...tenOf(base).map((x) => x.g.lines.find((y) => y.line === x.line)!)]
    return t.map((l) => l.ticker).filter(Boolean).slice(0, 400) as string[]
  }, [base, st, logs])
  const { live, at } = useLivePrices(tickers)
  const groups = useMemo(() => groupLines(scope, live), [scope, live])
  const tens = useMemo(() => tenOf(groups).sort((a, b) => (lineOf(b).oi || 0) - (lineOf(a).oi || 0)),
    [groups, logs])
  const rows = useMemo(() => groups.filter((g) => g.stat === st), [groups, st])

  const openAt = (key: string, line: number) => { setSel({ key, line }); setOpen(true) }
  const selLines = useMemo(() => (sel ? ls.filter((l) => `${l.sport}|${l.gameKey}|${l.player}|${l.stat}` === sel.key) : []), [ls, sel])
  const shownGames = cur ? games.filter((g) => gkey(g) === cur) : games

  return (
    <div className='flex flex-col gap-4'>
      {pickGame && games.length > 1 && (
        <div className='no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4'>
          {[null, ...games].map((g) => {
            const k = g ? gkey(g) : null
            const row = g ? gameFor(g) : null
            return (
              <button key={k ?? 'all'} type='button' aria-pressed={cur === k} onClick={() => setGame(k)}
                className={cn('flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium text-muted-foreground',
                  cur === k && 'border-foreground bg-foreground text-background')}>
                {g ? (
                  <>
                    <TeamLogo sport={g.sport} code={g.away} id={row?.ids?.away} color={row?.colors?.away} px={64} className='size-5 text-[7px]' />
                    {g.away} at {g.home}
                    <TeamLogo sport={g.sport} code={g.home} id={row?.ids?.home} color={row?.colors?.home} px={64} className='size-5 text-[7px]' />
                  </>
                ) : 'All games'}
              </button>
            )
          })}
        </div>
      )}

      {strip && tens.length > 0 && <TenStrip tens={tens} showThin={showThin} onThin={() => setShowThin((v) => !v)} gameFor={gameFor} onOpen={openAt} sport={sport} />}

      <div className='no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4'>
        {stats.map((x) => (
          <button key={x} type='button' aria-pressed={st === x} onClick={() => setStat(x)}
            className={cn('h-8 shrink-0 rounded-lg border px-3 text-sm text-muted-foreground', st === x && 'border-foreground bg-foreground font-semibold text-background')}>
            {statName(x)}
          </button>
        ))}
      </div>

      <div className='overflow-hidden rounded-[18px] bg-card'>
        <div className='grid grid-cols-[minmax(0,1fr)_3.1rem_3.1rem_3.1rem] gap-1.5 border-b px-3 py-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase'>
          <span>Player · line</span><span className='text-end'>Proj</span><span className='text-end'>Kalshi</span><span className='text-end text-devig'>DeVig</span>
        </div>
        {rows.length === 0 ? (
          <p className='p-8 text-center text-muted-foreground'>No {statName(st ?? '').toLowerCase()} props with prices right now.</p>
        ) : shownGames.map((g) => {
          const gr = rows.filter((r) => r.main.gameKey === g.gameKey).sort((a, b) => (b.main.expected ?? -1) - (a.main.expected ?? -1))
          if (!gr.length) return null
          const row = gameFor(g)
          return (
            <div key={gkey(g)}>
              {(!cur && games.length > 1) && (
                <div className='flex items-center gap-2 bg-muted/60 px-3 py-1.5 text-xs font-semibold'>
                  <TeamLogo sport={g.sport} code={g.away} id={row?.ids?.away} color={row?.colors?.away} px={64} className='size-5 text-[7px]' />
                  {g.away} at {g.home}
                  <TeamLogo sport={g.sport} code={g.home} id={row?.ids?.home} color={row?.colors?.home} px={64} className='size-5 text-[7px]' />
                  <span className='ms-auto font-normal text-muted-foreground'>{clockFmt.format(new Date(g.kickoff))}</span>
                </div>
              )}
              <ul>{gr.map((r) => <Row key={r.key} g={r} logs={logs} game={row} onOpen={openAt} />)}</ul>
            </div>
          )
        })}
      </div>

      <Footer sport={sport} at={at} />

      {sel && selLines.length > 0 && (
        <PlayerSheet key={`${sel.key}|${sel.line}`} ls={selLines} line={sel.line} game={gameFor(selLines[0])} open={open} onOpenChange={setOpen} />
      )}
    </div>
  )
}

const lineOf = (t: Ten) => t.g.lines.find((x) => x.line === t.line)!

function TenStrip({ tens, showThin, onThin, gameFor, onOpen, sport }: {
  tens: Ten[]; showThin: boolean; onThin: () => void; gameFor: (l: PropLine) => GameRow | null; onOpen: (k: string, line: number) => void; sport: string
}) {
  const sum = useStreakSummary().data?.sports?.[sport]
  const ok = tens.filter((t) => !t.thin && !thinLine(lineOf(t)))
  const shown = showThin ? tens : ok
  const [lo, hi] = sum?.diff_95 ?? [0, 0]
  return (
    <section className='flex flex-col gap-2 rounded-[18px] border border-good/25 bg-good/10 p-3.5'>
      <h2 className='flex items-center gap-2 font-display text-xl font-extrabold'>
        <span className='rounded-md bg-good px-1.5 py-0.5 font-condensed text-sm text-background'>{LAST}/{LAST}</span>
        Hit in each of his last {LAST}
      </h2>
      <p className='text-sm leading-relaxed text-muted-foreground'>
        {sum && sum.rungs >= 200
          ? <>Past {sport} lines like these came in {pct(sum.hit)} of the time; Kalshi had priced them at {pct(sum.kalshi)} ({sum.rungs.toLocaleString('en-US')} lines).
            {lo > 0 ? ' They came in a bit more often than the price said.' : hi < 0 ? ' They came in less often than the price said: the streak was already in the price.' : ' The streak is usually already in the price.'}</>
          : `Not enough past ${sport} streaks yet to say how they did against Kalshi's price.`}
      </p>
      {shown.length ? (
        <div className='no-scrollbar -mx-3.5 flex snap-x gap-2 overflow-x-auto px-3.5 pb-1'>
          {shown.map((t) => <TenCard key={t.g.key} t={t} game={gameFor(t.g.main)} onOpen={onOpen} />)}
        </div>
      ) : (
        <p className='text-sm text-muted-foreground'>None with real trading on Kalshi right now.</p>
      )}
      {tens.length > ok.length && (
        <button type='button' onClick={onThin} className='self-start text-sm font-semibold text-foreground underline underline-offset-4'>
          {showThin ? 'Hide the barely traded ones' : `Show ${tens.length - ok.length} more that barely trade`}
        </button>
      )}
    </section>
  )
}

function TenCard({ t, game, onOpen }: { t: Ten; game: GameRow | null; onOpen: (k: string, line: number) => void }) {
  const l = lineOf(t)
  const w = usePropWhy(l)
  const { pid, team, color, unit } = usePropPlayer(l, w, game)
  const opp = w?.opp ?? (team ? (team === l.home ? l.away : l.home) : null)
  const c = yesCost(l)
  return (
    <button type='button' aria-haspopup='dialog' onClick={() => onOpen(t.g.key, l.line)}
      className='flex w-[15.5rem] shrink-0 snap-start flex-col gap-2.5 rounded-2xl bg-card p-3 text-start transition-opacity duration-150 hover:opacity-90'>
      <span className='flex items-center gap-2.5'>
        <PlayerPhoto sport={l.sport} unit={unit} pid={pid} team={team} teamColor={color} className='size-10' badge='size-4 text-[6px]' />
        <span className='min-w-0 leading-tight'>
          <span className='block truncate font-semibold'>{l.player}</span>
          <span className='block truncate text-xs text-muted-foreground'>{needOf(l.line)}+ {listStat(l.stat)}{opp ? ` · vs ${opp}` : ''}</span>
        </span>
      </span>
      <span className='grid grid-cols-3 gap-1 font-condensed tabular-nums'>
        <Trio k='Proj' v={l.expected != null ? l.expected.toFixed(1) : '—'} devig />
        <Trio k='Kalshi' v={pct(l.mid)} />
        <Trio k='DeVig' v={l.modelOver != null ? pct(l.modelOver) : '—'} devig />
      </span>
      <span className='text-xs text-muted-foreground'>
        Yes costs {Math.round(l.ask! * 100)}¢{c != null ? ` (${odds(c)})` : ''}
        {thinLine(l) && <b className='text-bad'> · few trades</b>}
      </span>
    </button>
  )
}

function Trio({ k, v, devig }: { k: string; v: string; devig?: boolean }) {
  return (
    <span className='rounded-lg bg-muted px-2 py-1'>
      <span className='block font-sans text-[10px] text-muted-foreground'>{k}</span>
      <b className={cn('text-base', devig && 'text-devig')}>{v}</b>
    </span>
  )
}

function Row({ g, logs, game, onOpen }: { g: Group; logs: Logs | null; game: GameRow | null; onOpen: (k: string, line: number) => void }) {
  const l = g.main
  const w = usePropWhy(l)
  const { pid, team, color, unit } = usePropPlayer(l, w, game)
  const last = logs?.last(l.player, l.stat) ?? null
  const h = hits(last, l.line)
  const any10 = g.lines.some((x) => tenOfTen(last, x.line))
  const need = needOf(l.line)
  const x = l.expected
  const up = x != null && x > l.line
  const c = yesCost(l)
  const gap = l.modelOver == null ? null : Math.round((l.modelOver - l.mid) * 100)
  return (
    <li className='border-b last:border-b-0'>
      <button type='button' aria-haspopup='dialog' onClick={() => onOpen(g.key, l.line)}
        className='grid w-full grid-cols-[minmax(0,1fr)_3.1rem_3.1rem_3.1rem] items-center gap-1.5 px-3 py-2.5 text-start transition-colors duration-150 hover:bg-muted/50'>
        <span className='flex min-w-0 items-center gap-2.5'>
          <PlayerPhoto sport={l.sport} unit={unit} pid={pid} team={team} teamColor={color} className='size-9' badge='size-4 text-[6px]' />
          <span className='min-w-0 leading-tight'>
            <span className='flex items-center gap-1.5'>
              <span className='truncate font-semibold'>{l.player}</span>
              {any10 && <span className='shrink-0 rounded bg-good/15 px-1 font-condensed text-[11px] font-bold text-good'>{LAST}/{LAST}</span>}
            </span>
            <span className='block truncate text-xs text-muted-foreground'>
              {need}+ {listStat(l.stat)}{h != null && last ? ` · ${h} of last ${last.length}` : ''}
              {l.injury && <span className='text-bad'> · {l.injury}</span>}
            </span>
          </span>
        </span>
        <Num v={x != null ? x.toFixed(1) : '—'} sub={x != null ? `${up ? 'over' : 'under'} ${need}` : ''} tone='text-devig' subTone={up ? 'text-good' : 'text-bad'} />
        <Num v={pct(l.mid)} sub={c != null ? odds(c) ?? '' : ''} />
        <Num v={l.modelOver != null ? pct(l.modelOver) : '—'} sub={gap == null ? '' : gap === 0 ? '±0' : `${gap > 0 ? '+' : '−'}${Math.abs(gap)}`} tone='text-devig' />
      </button>
    </li>
  )
}

function Num({ v, sub, tone, subTone }: { v: string; sub: string; tone?: string; subTone?: string }) {
  return (
    <span className='flex flex-col items-end font-condensed leading-tight tabular-nums'>
      <b className={cn('text-[17px]', tone)}>{v}</b>
      <span className={cn('text-[11px] text-muted-foreground', subTone)}>{sub}</span>
    </span>
  )
}

function Footer({ sport, at }: { sport: string; at: Date | null }) {
  const t = useProps().tests.find((x) => x.sport === sport)
  return (
    <p className='max-w-prose px-1 text-xs leading-relaxed text-muted-foreground'>
      <b className='text-foreground'>Proj</b> is what DeVig&apos;s props model expects him to get. <b className='text-foreground'>Kalshi</b> is the
      chance bettors are paying for (the middle of the buy and sell price), with what Yes costs in odds, fee included.{' '}
      <b className='text-devig'>DeVig</b> is the model&apos;s chance, and how far it is from Kalshi.{' '}
      {t && t.graded > 0
        ? `Kalshi has been more right so far: DeVig's ${sport} prop picks won ${t.wins} of ${t.graded}${t.roi != null ? `, ${t.roi < 0 ? 'down' : 'up'} ${Math.abs(t.roi * 100).toFixed(1)}%` : ''}. Use it as a second opinion.`
        : "On past games Kalshi's price has been more right than this model, so use it as a second opinion."}
      {at ? ` Kalshi prices live as of ${new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(at)}.` : ''}
    </p>
  )
}
