import { ChevronRight, Minus, Plus } from 'lucide-react'
import { Link, useMatchRoute } from '@tanstack/react-router'
import { type GameRow, fmtAmerican, fmtPct, useRecord } from '@/lib/devig'
import { useExperience } from '@/lib/experience'
import { labFor, useDevigFiles, useLab } from '@/lib/lab'
import { useSlip } from '@/lib/parlay'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { TeamLogo } from '@/components/team-logo'
import { mlLeg } from '../parlay/legs'
import { LevelPicker, PassBody, PickBody } from './explain-sheet'
import { CollegeCall, NoModelBody } from './model-why'
import { isPick } from './plate'

// What opens when someone taps a team's half of a plate (Games, a game's page, or a leg in the parlay): the team's
// logo big, why DeVig gives it the chance it does, a switch to the other team, the parlay button, and a link to the game's page.
export type Side = 'away' | 'home'

const whenFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })

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
  if (!row) return null
  // the game's own page (live field, plays that moved the price, injuries); no link when the sheet is already on it
  const onGamePage = !!matchRoute({ to: '/game/$id', params: { id: row.id } })

  const code = side === 'home' ? row.home : row.away
  const name = side === 'home' ? row.homeName : row.awayName
  const opp = side === 'home' ? row.away : row.home
  const color = (side === 'home' ? row.colors?.home : row.colors?.away) || 'var(--side-home)'
  const id = side === 'home' ? row.ids?.home : row.ids?.away
  const labGame = labFor(lab, row)
  const dvGame = labFor(devigFiles, row)
  const lv = level ?? 'sometimes'
  const leg = row.state === 'pre' ? mlLeg(row, side) : null
  const on = leg ? has(leg.id) : false
  const record = records.find((r) => r.sport === row.sport) ?? null
  const p = row.pick
  const score = row.state === 'pre' ? null : side === 'home' ? row.homeScore : row.awayScore
  const oppScore = row.state === 'pre' ? null : side === 'home' ? row.awayScore : row.homeScore
  const sub = [
    `${side === 'home' ? 'vs' : 'at'} ${opp}`,
    row.state === 'pre' ? whenFmt.format(new Date(row.kickoff)) : row.state === 'in' ? `Live · ${row.detail}` : 'Final',
    score != null && oppScore != null ? `${score}–${oppScore}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side='bottom'
        // land focus on the team that was tapped, not the first tab
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>('[role=tab][aria-selected=true]')?.focus({ preventScroll: true })
        }}
        className='max-h-[90svh] gap-0 overflow-y-auto rounded-t-3xl border-t p-0 md:mx-auto md:max-w-xl [&>button:last-child]:top-3.5 [&>button:last-child]:grid [&>button:last-child]:size-9 [&>button:last-child]:place-items-center [&>button:last-child]:rounded-full [&>button:last-child]:bg-black/30 [&>button:last-child]:text-white [&>button:last-child]:opacity-100'
      >
        <div className='relative flex shrink-0 flex-col items-center gap-2 overflow-hidden rounded-t-3xl px-5 pt-7 pb-5 text-white' style={{ background: color }}>
          <span aria-hidden='true' className='absolute inset-0 bg-linear-to-b from-transparent from-40% to-black/35' />
          <span aria-hidden='true' className='absolute top-2.5 h-1.5 w-10 rounded-full bg-white/45' />
          {/* the game's page, up top so nobody has to scroll for it */}
          {!onGamePage && (
            <Link
              to='/game/$id'
              params={{ id: row.id }}
              onClick={() => onOpenChange(false)}
              className='absolute top-3.5 left-3.5 z-10 flex h-9 items-center gap-0.5 rounded-full bg-black/30 ps-3 pe-2 text-sm font-semibold text-white hover:bg-black/45'
            >
              Game page
              <ChevronRight className='size-4' aria-hidden='true' />
            </Link>
          )}
          <TeamLogo sport={row.sport} code={code} id={id} color={color} px={256} className='relative size-24 text-3xl' />
          <div className='relative text-center'>
            <SheetTitle className='font-display text-[28px] leading-none font-black text-white'>{name || code}</SheetTitle>
            <SheetDescription className='mt-1 text-sm text-white/85'>{sub}</SheetDescription>
          </div>
        </div>

        <div className='flex shrink-0 flex-col gap-4 px-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))]'>
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
                    'h-10 rounded-lg text-sm font-semibold text-muted-foreground tabular-nums transition-colors duration-150',
                    side === s && 'bg-foreground text-background'
                  )}
                >
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

        </div>
      </SheetContent>
    </Sheet>
  )
}
