import { useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { type GameRow, fmtPct } from '@/lib/devig'
import { type PropLine, overTxt, underTxt, useProps } from '@/lib/props'
import { PlayerPhoto } from '@/components/team-logo'
import { GameProps, type Shown, withLive } from '@/features/props'
import { usePropPlayer, usePropWhy } from '@/features/props/why'

// A game's player props, right under its card on Games (the Props tab's per-game drawer, without the extra tab): the
// two props where (before tip-off) DeVig's props model and Kalshi's price are furthest apart, then "All N props" opens the full list.
// Same filters as the Props page's Biggest gaps: no thin markets, no players with fewer than 40 games. Not proven.

const fair = (l: Shown) => l.modelOver != null && l.spread <= 0.05 && (l.oi || 0) >= 100 && l.games >= 40

export function usePropsFor(row: GameRow): PropLine[] {
  const { lines } = useProps()
  return useMemo(() => lines.filter((l) => l.sport === row.sport && l.away === row.away && l.home === row.home), [lines, row.sport, row.away, row.home])
}

function StripRow({ l, row }: { l: Shown; row: GameRow }) {
  const w = usePropWhy(l)
  const { pid, team, color, unit } = usePropPlayer(l, w, row)
  const over = l.modelOver! >= l.mid // the side DeVig likes more than Kalshi does
  const dv = over ? l.modelOver! : 1 - l.modelOver!
  const k = over ? l.mid : 1 - l.mid
  return (
    <li className='flex items-center gap-3 border-b px-3 py-2'>
      <PlayerPhoto sport={l.sport} unit={unit} pid={pid} team={team} teamColor={color} className='size-9' badge='size-4 text-[6px]' />
      <span className='flex min-w-0 flex-1 flex-col leading-tight'>
        <span className='truncate text-sm font-semibold'>{l.player}</span>
        <span className='truncate text-xs text-muted-foreground'>{over ? overTxt(l.stat, l.line) : underTxt(l.stat, l.line)}</span>
      </span>
      <span className='flex shrink-0 flex-col items-end font-condensed leading-tight tabular-nums'>
        <span className='text-[15px] font-bold text-devig'>DeVig {fmtPct(dv)}</span>
        <span className='text-xs text-muted-foreground'>Kalshi {fmtPct(k)}</span>
      </span>
    </li>
  )
}

export function GamePropsStrip({ row }: { row: GameRow }) {
  const ls = usePropsFor(row)
  const [open, setOpen] = useState(false)
  const pre = row.state === 'pre' // once it starts these prices are pregame, so only the full (live-priced) list shows
  const top = useMemo(() => !pre ? [] : ls
    .map((l) => withLive(l, {}))
    .filter((l): l is Shown => !!l && fair(l))
    .sort((a, b) => Math.abs(b.modelOver! - b.mid) - Math.abs(a.modelOver! - a.mid))
    .filter((l, i, a) => a.findIndex((x) => x.player === l.player) === i) // one per player
    .slice(0, 2), [ls, pre])
  if (ls.length === 0) return null
  const players = new Set(ls.map((l) => l.player)).size
  return (
    <div className='overflow-hidden rounded-[14px] bg-card'>
      {top.length > 0 && (
        <ul>
          {top.map((l) => <StripRow key={l.key} l={l} row={row} />)}
        </ul>
      )}
      <button type='button' aria-haspopup='dialog' onClick={() => setOpen(true)}
        className='flex w-full items-center gap-2 px-3 py-2.5 text-start text-sm font-semibold transition-colors duration-150 hover:bg-white/5'>
        <span className='flex-1'>All {ls.length} props · {players} {players === 1 ? 'player' : 'players'}</span>
        <span className='text-xs font-normal text-muted-foreground'>props model not proven</span>
        <ChevronRight className='size-4 shrink-0 text-muted-foreground' aria-hidden='true' />
      </button>
      {open && <GameProps ls={ls} game={row} open={open} onOpenChange={setOpen} />}
    </div>
  )
}
