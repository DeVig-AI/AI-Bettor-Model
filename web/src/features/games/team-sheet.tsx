import { useEffect, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { useMatchRoute } from '@tanstack/react-router'
import { type GameRow, fmtAmerican, fmtPct, useRecord } from '@/lib/devig'
import { useExperience } from '@/lib/experience'
import { labFor, useDevigFiles, useLab } from '@/lib/lab'
import { useSlip } from '@/lib/parlay'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { TeamLogo } from '@/components/team-logo'
import { mlLeg } from '../parlay/legs'
import { LevelPicker, PassBody, PickBody } from './explain-sheet'
import { CollegeCall, NoModelBody } from './model-why'
import { GameInfo, MatchupHeader } from './game-info'
import { NarrativeButton } from './narrative'
import { TeamProps } from './team-props'
import { isPick } from './plate'

// What opens when someone taps a team's half of a plate (Games, a game's page, or a leg in the parlay): the matchup
// pinned on top, the game's facts (Kalshi's lines, form, who might sit), then a tab per team with why DeVig gives it the
// chance it does, its props, the parlay button, and a link to the game's page.
export type Side = 'away' | 'home'

// the chance shown for a side: DeVig's model (its pick or its lean, or its NHL ratings model), else the Lab's, else
// Kalshi's fair price
export function sideChance(row: GameRow, side: Side, labHome?: number | null, devigHome?: number | null): { pct: number | null; who: string } {
  const code = side === 'home' ? row.home : row.away
  const p = row.pick
  if (p?.side && p.prob != null && p.action !== 'PASS') return { pct: p.side === code ? p.prob : 1 - p.prob, who: 'DeVig' }
  if (p?.lean && p.leanProb != null) return { pct: p.lean === code ? p.leanProb : 1 - p.leanProb, who: 'Model' }
  if (devigHome != null) return { pct: side === 'home' ? devigHome : 1 - devigHome, who: 'DeVig' }
  if (labHome != null) return { pct: side === 'home' ? labHome : 1 - labHome, who: 'Lab' }
  const f = row.fairHome == null ? null : side === 'home' ? row.fairHome : 1 - row.fairHome
  return { pct: f, who: 'Kalshi' }
}

export function TeamSheet({
  row,
  side,
  onSide,
  open,
  onOpenChange,
}: {
  row: GameRow | null
  side: Side
  onSide: (s: Side) => void
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const { level, setLevel } = useExperience()
  const { records } = useRecord()
  const lab = useLab().data
  const devigFiles = useDevigFiles().data
  const { toggle, has } = useSlip()
  const matchRoute = useMatchRoute()
  // the matchup shrinks to one line once the drawer scrolls; a new game starts it full size
  const [small, setSmall] = useState(false)
  useEffect(() => setSmall(false), [row?.id, open])
  if (!row) return null
  // the game's own page (live field, plays that moved the price, injuries); no link when the sheet is already on it
  const onGamePage = !!matchRoute({ to: '/game/$id', params: { id: row.id } })

  const code = side === 'home' ? row.home : row.away
  const color = (side === 'home' ? row.colors?.home : row.colors?.away) || 'var(--side-home)'
  const labGame = labFor(lab, row)
  const dvGame = labFor(devigFiles, row)
  const lv = level ?? 'sometimes'
  const leg = row.state === 'pre' ? mlLeg(row, side) : null
  const on = leg ? has(leg.id) : false
  const record = records.find((r) => r.sport === row.sport) ?? null
  const p = row.pick

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side='bottom'
        // land focus on the team that was tapped, not the first tab
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>('[role=tab][aria-selected=true]')?.focus({ preventScroll: true })
        }}
        className='max-h-[90svh] gap-0 overflow-hidden rounded-t-3xl border-t p-0 md:mx-auto md:max-w-xl [&>button:last-child]:top-3.5 [&>button:last-child]:grid [&>button:last-child]:size-9 [&>button:last-child]:place-items-center [&>button:last-child]:rounded-full [&>button:last-child]:bg-black/30 [&>button:last-child]:text-white [&>button:last-child]:opacity-100'
      >
        <MatchupHeader row={row} small={small} onGamePage={onGamePage} onClose={() => onOpenChange(false)} />

        <div onScroll={(e) => setSmall(e.currentTarget.scrollTop > 56)}
          className='flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-5 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]'>
          <GameInfo row={row} chanceWho={sideChance(row, 'home', labGame?.home_wp, dvGame?.home_wp).who} />

          <h3 className='-mb-2 text-[11.5px] font-semibold tracking-[0.06em] text-muted-foreground uppercase'>Pick a side to dig in</h3>
          <div role='tablist' aria-label='Team' className='grid grid-cols-2 gap-1 rounded-xl bg-muted p-1'>
            {(['away', 'home'] as const).map((s) => {
              const c = sideChance(row, s, labGame?.home_wp, dvGame?.home_wp)
              return (
                <button
                  key={s}
                  type='button'
                  role='tab'
                  aria-selected={side === s}
                  onClick={() => onSide(s)}
                  className={cn(
                    'flex h-12 items-center justify-center gap-2 rounded-lg text-[15px] font-bold text-muted-foreground tabular-nums transition-colors duration-150',
                    side === s && 'bg-foreground text-background'
                  )}
                >
                  <TeamLogo sport={row.sport} code={s === 'home' ? row.home : row.away} id={s === 'home' ? row.ids?.home : row.ids?.away}
                    color={(s === 'home' ? row.colors?.home : row.colors?.away) || `var(--side-${s})`} className='size-6 text-[9px]' />
                  {s === 'home' ? row.home : row.away}
                  {c.pct != null && ` · ${fmtPct(c.pct)}`}
                </button>
              )
            })}
          </div>

          <LevelPicker level={lv} onLevel={setLevel} />

          {/* college picks: before the start the model's own explanation is still here, so the pick sits above it */}
          {(row.sport === 'CBB' || row.sport === 'CFB') && dvGame && row.state === 'pre' && (isPick(row) || p?.lean) ? (
            <>
              <CollegeCall row={row} side={code} level={lv} record={record} />
              <NoModelBody row={row} side={side} level={lv} labGame={labGame} labFile={lab?.[row.sport]}
                devigGame={dvGame} devigFile={devigFiles?.[row.sport]} />
            </>
          ) : isPick(row) && p?.prob != null ? (
            <PickBody row={row} side={code} level={lv} record={record} />
          ) : p?.lean && p.leanProb != null ? (
            <PassBody row={row} side={code} level={lv} />
          ) : (
            <NoModelBody row={row} side={side} level={lv} labGame={labGame} labFile={lab?.[row.sport]}
              devigGame={dvGame} devigFile={devigFiles?.[row.sport]} />
          )}

          <TeamProps row={row} side={side} />

          {leg && (
            <button
              type='button'
              aria-pressed={on}
              onClick={() => toggle(leg)}
              className={cn(
                'mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-bold transition-opacity duration-150 hover:opacity-90',
                on ? 'border bg-background text-foreground' : 'text-white'
              )}
              style={on ? undefined : { background: color }}
            >
              {on ? <Minus className='size-4.5' aria-hidden='true' /> : <Plus className='size-4.5' aria-hidden='true' />}
              {on ? `Remove ${code} from parlay` : `Add ${code} to parlay ${fmtAmerican(leg.odds)}`}
            </button>
          )}

          <NarrativeButton row={row} level={lv} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
