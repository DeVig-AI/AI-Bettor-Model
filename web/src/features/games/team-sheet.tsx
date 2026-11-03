import { ChevronRight, Minus, Plus } from 'lucide-react'
import { Link, useMatchRoute } from '@tanstack/react-router'
import { type GameRow, fmtAmerican, fmtPct, useRecord } from '@/lib/devig'
import { useExperience } from '@/lib/experience'
import { checkText, labFor, useDevigFiles, useLab } from '@/lib/lab'
import { useSlip } from '@/lib/parlay'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { TeamLogo } from '@/components/team-logo'
import { mlLeg } from '../parlay/legs'
import { LevelPicker, PassBody, PickBody } from './explain-sheet'
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
  const football = row.sport === 'NFL' || row.sport === 'CFB'

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

          {isPick(row) && p?.prob != null ? (
            <PickBody row={row} side={code} level={lv} record={record} />
          ) : p?.lean && p.leanProb != null ? (
            <PassBody row={row} side={code} level={lv} />
          ) : (
            <NoModelBody row={row} side={side} labHome={labGame?.home_wp ?? null} labNote={labGame ? checkText(lab?.[row.sport]?.check) : null}
              devigHome={dvGame?.home_wp ?? null} />
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

          {!onGamePage && (
            <Link
              to='/game/$id'
              params={{ id: row.id }}
              onClick={() => onOpenChange(false)}
              className='flex min-h-12 items-center justify-between gap-3 rounded-2xl bg-muted px-4 py-2.5 hover:bg-muted/70'
            >
              <span className='min-w-0'>
                <span className='block text-[15px] font-semibold'>{row.away} at {row.home} game page</span>
                <span className='block text-sm text-muted-foreground'>
                  {football && row.state !== 'pre' ? 'The drive play by play and the plays that moved the price' : 'Score, prices and injuries'}
                </span>
              </span>
              <ChevronRight className='size-5 shrink-0 text-muted-foreground' aria-hidden='true' />
            </Link>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

// how each of DeVig's ratings models gets its number, in a sentence or two
const HOW: Record<string, string> = {
  NHL: "Team ratings built from every result since 2022, who played the night before, and each team's recent share of the shots. Starting goalies aren't in it.",
  CBB: "One rating per team, built from every Division I final since 2011 and moved after each game by the margin, plus home court. No injuries, lineups or prices go in.",
}

// No DeVig pick for this game: DeVig's NHL or CBB ratings model when it has a number (the Lab's beside it), else the Lab's
// read when it has one (new, not proven), and what Kalshi's price says
function NoModelBody({ row, side, labHome, labNote, devigHome }: {
  row: GameRow; side: Side; labHome: number | null; labNote: string | null; devigHome?: number | null
}) {
  const code = side === 'home' ? row.home : row.away
  const name = (side === 'home' ? row.homeName : row.awayName) || code
  const fair = row.fairHome == null ? null : side === 'home' ? row.fairHome : 1 - row.fairHome
  const odds = side === 'home' ? row.ml?.home : row.ml?.away
  const labP = labHome == null ? null : side === 'home' ? labHome : 1 - labHome
  const dvP = devigHome == null ? null : side === 'home' ? devigHome : 1 - devigHome
  return (
    <div className='flex flex-col gap-4'>
      {dvP != null ? (
        <>
          <p className='text-lg leading-snug font-semibold'>
            DeVig&apos;s {row.sport} model gives {name} about{' '}
            <span className='text-devig'>{Math.round(dvP * 10)} times out of 10</span> ({fmtPct(dvP)}).
          </p>
          <div className='rounded-2xl bg-muted p-3.5'>
            <p className='font-semibold'>How it gets there</p>
            <p className='mt-1 text-sm leading-relaxed text-muted-foreground'>
              {HOW[row.sport] ?? 'Team ratings built from past results.'} It&apos;s new this season and graded on the Models page.
              {labP != null && ` The DeVig Lab's model says ${fmtPct(labP)}.`}
            </p>
          </div>
        </>
      ) : labP != null ? (
        <>
          <p className='text-lg leading-snug font-semibold'>
            The DeVig Lab&apos;s {row.sport} model gives {name} about{' '}
            <span className='text-devig'>{Math.round(labP * 10)} times out of 10</span> ({fmtPct(labP)}).
          </p>
          <div className='rounded-2xl bg-muted p-3.5'>
            <p className='font-semibold'>New, not proven</p>
            <p className='mt-1 text-sm leading-relaxed text-muted-foreground'>
              The Lab found this model by searching past seasons. It isn&apos;t one of DeVig&apos;s picks. {labNote}
            </p>
          </div>
        </>
      ) : (
        <p className='text-[15px] leading-relaxed'>
          DeVig doesn&apos;t have a model for this {row.sport} game, so there&apos;s no &quot;why&quot; from DeVig here. This is what the price says.
        </p>
      )}
      {fair != null && (
        <p className='text-sm leading-relaxed text-muted-foreground'>
          Kalshi&apos;s price{odds != null ? ` (${fmtAmerican(odds)})` : ''} gives {name} {fmtPct(fair)} once its fee gap is
          split off. That&apos;s the market&apos;s guess, not DeVig&apos;s.
          {dvP != null && Math.abs(dvP - fair) >= 0.01 && ` DeVig is ${Math.abs((dvP - fair) * 100).toFixed(1)} points ${dvP > fair ? 'higher' : 'lower'}.`}
          {dvP == null && labP != null && Math.abs(labP - fair) >= 0.01 && ` The Lab is ${Math.abs((labP - fair) * 100).toFixed(1)} points ${labP > fair ? 'higher' : 'lower'}.`}
        </p>
      )}
    </div>
  )
}
