import { useLayoutEffect, useRef } from 'react'
import { type GameRow, fmtAmerican, fmtPct, isSoccer } from '@/lib/devig'
import { cn } from '@/lib/utils'
import { LogoMark, TeamLogo } from '@/components/team-logo'
import { useGameClock } from '@/lib/game-clock'

// A Matchup Plate: the game's two team colors meet in a diagonal cut placed at Kalshi's fair split (away on the left).
// DeVig's own read is an amber slash at the model's chance; the gap between the cut and the slash is the gap between
// DeVig and the market. Team colors come from the data; without them the plate falls back to the two neutral sides.

const ANGLE = 102 // degrees: the cut leans like the slice in DeVig's mark

function hex(c: string | undefined | null) {
  if (!c) return null
  const v = c.startsWith('#') ? c : `#${c}`
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : null
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short' })

function statusText(row: GameRow, showDay: boolean, clock = row.detail) {
  if (row.state === 'in') return clock || 'Live'
  if (row.state === 'post') return row.detail || 'Final'
  const d = new Date(row.kickoff)
  return (showDay ? `${dayFmt.format(d)} ` : '') + timeFmt.format(d)
}

export function isPick(r: GameRow) {
  return !!r.pick?.side && r.pick.action !== 'PASS'
}

type PlateProps = { row: GameRow; showDay: boolean; size?: 'md' | 'lg' }

export function Plate(props: PlateProps) {
  return isSoccer(props.row.sport) ? <SoccerPlate {...props} /> : <TwoWayPlate {...props} />
}

function TwoWayPlate({ row, showDay, size = 'md' }: PlateProps) {
  const away = hex(row.colors?.away) ?? 'var(--side-away)'
  const home = hex(row.colors?.home) ?? 'var(--side-home)'
  const split = row.fairHome == null ? 0.5 : 1 - row.fairHome // away share
  const cut = `${(split * 100).toFixed(1)}%`
  const p = row.pick
  const notch =
    isPick(row) && p?.prob != null ? (p.side === row.away ? p.prob : 1 - p.prob) : null
  const live = row.state === 'in'
  const clock = useGameClock(row.id, row.detail, live)
  const done = row.state === 'post' && row.awayScore != null && row.homeScore != null
  const big = size === 'lg'
  const label =
    `${row.awayName} at ${row.homeName}, ${statusText(row, showDay, row.detail)}.` +
    (row.fairHome != null
      ? ` Fair chance: ${row.away} ${fmtPct(split)}, ${row.home} ${fmtPct(row.fairHome)}.`
      : ' No Kalshi price yet.') +
    (notch != null && p?.prob != null ? ` DeVig's pick: ${p.side} to win, ${fmtPct(p.prob)}.` : '')

  return (
    <div
      role='img'
      aria-label={label}
      className={cn(
        'relative overflow-hidden rounded-[18px] text-white',
        big ? 'h-[248px] rounded-none' : 'h-[132px]',
        row.state === 'post' && 'opacity-80'
      )}
      style={{
        background: `linear-gradient(${ANGLE}deg, ${away} 0 ${cut}, ${home} ${cut} 100%)`,
      }}
    >
      {/* each team's logo, big and faint, behind its half */}
      <LogoMark sport={row.sport} code={row.away} id={row.ids?.away} className={big ? '-start-10 top-6 size-56' : '-start-8 top-3 size-36'} />
      <LogoMark sport={row.sport} code={row.home} id={row.ids?.home} className={big ? '-end-10 top-6 size-56' : '-end-8 top-3 size-36'} />
      {/* keeps white type readable on light team colors, and separates two similar colors at the cut */}
      <div aria-hidden='true' className='absolute inset-0 bg-black/25' />
      <div
        aria-hidden='true'
        className='absolute -top-4 -bottom-4 w-[2px] bg-black/50'
        style={{ left: cut, transform: `rotate(${ANGLE - 90}deg)` }}
      />
      {notch != null && (
        <div
          aria-hidden='true'
          className='absolute -top-4 -bottom-4 w-[5px] -translate-x-1/2 rounded-full bg-devig shadow-[0_0_0_2px_#0a0b0f]'
          style={{ left: `${(notch * 100).toFixed(1)}%`, transform: `translateX(-50%) rotate(${ANGLE - 90}deg)` }}
        />
      )}

      <div
        className={cn(
          'relative flex h-full flex-col justify-between',
          big ? 'px-5 pt-4 pb-5' : 'px-4 py-3'
        )}
      >
        <div className='flex items-center justify-between text-xs font-semibold text-white/90'>
          <span className={cn('flex items-center gap-1.5', live && 'text-[#b5ffd0]')}>
            {live && (
              <span aria-hidden='true' className='size-1.5 rounded-full bg-[#b5ffd0] motion-safe:animate-pulse' />
            )}
            {statusText(row, showDay, clock)}
          </span>
          <span>{row.sport}</span>
        </div>

        <div className='flex items-end justify-between gap-3'>
          <Side
            sport={row.sport}
            teamId={row.ids?.away}
            color={away}
            code={row.away}
            name={row.awayName}
            pct={row.fairHome == null ? null : split}
            score={live || row.state === 'post' ? row.awayScore : null}
            won={done && row.awayScore! > row.homeScore!}
            big={big}
          />
          <Side
            sport={row.sport}
            teamId={row.ids?.home}
            color={home}
            code={row.home}
            name={row.homeName}
            pct={row.fairHome}
            score={live || row.state === 'post' ? row.homeScore : null}
            won={done && row.homeScore! > row.awayScore!}
            big={big}
            right
          />
        </div>
      </div>
    </div>
  )
}

// ---------- soccer: three outcomes ----------
// Home on the left (soccer's order), then a dark draw lane, then away, each as wide as Kalshi's fair chance for it.
// The draw's chance sits in a dark chip in the top row: in its lane when there's room, slid along the row otherwise,
// and always at least GAP px clear of the start time and the league tag (placed by measuring them).

const DRAW_LANE = '#161a22'
const GAP = 10
const SHORT: Record<string, string> = {
  EPL: 'EPL', LALIGA: 'LA LIGA', SERIEA: 'SERIE A', BUND: 'BUNDESLIGA', LIGUE1: 'LIGUE 1',
  UCL: 'UCL', UEL: 'UEL', UECL: 'UECL', MLS: 'MLS', LIGAMX: 'LIGA MX',
}
export const leagueTag = (sport: string) => SHORT[sport] ?? sport

function SoccerPlate({ row, showDay, size = 'md' }: PlateProps) {
  const home = hex(row.colors?.home) ?? 'var(--side-home)'
  const away = hex(row.colors?.away) ?? 'var(--side-away)'
  const t = row.three
  const live = row.state === 'in'
  const clock = useGameClock(row.id, row.detail, live)
  const done = row.state === 'post' && row.awayScore != null && row.homeScore != null
  const drawn = done && row.homeScore === row.awayScore
  const big = size === 'lg'
  const c1 = t ? t.home * 100 : 100 / 3
  const c2 = t ? (t.home + t.draw) * 100 : 200 / 3
  const background = done
    ? `linear-gradient(${ANGLE}deg, ${home} 0 50%, ${away} 50% 100%)`
    : `linear-gradient(${ANGLE}deg, ${home} 0 ${c1}%, ${DRAW_LANE} ${c1}% ${c2}%, ${away} ${c2}% 100%)`
  const chipText = done ? (drawn ? 'FINAL · DRAW' : null) : t ? `DRAW ${fmtPct(t.draw)}` : null
  const target = done ? 54 : Math.min(c2, (c1 + c2) / 2 + 9) // percent across the plate; a little right of the lane's middle

  const plate = useRef<HTMLDivElement>(null)
  const time = useRef<HTMLSpanElement>(null)
  const tag = useRef<HTMLSpanElement>(null)
  const chip = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = plate.current
    if (!el || !chipText) return
    const place = () => {
      const c = chip.current, a = time.current, b = tag.current
      if (!c || !a || !b) return
      const P = el.getBoundingClientRect()
      const lo = a.getBoundingClientRect().right - P.left + GAP
      const hi = b.getBoundingClientRect().left - P.left - GAP
      const w = c.offsetWidth
      const want = (P.width * target) / 100 - w / 2
      c.style.left = `${Math.max(lo, Math.min(hi - w, want))}px`
      c.style.visibility = hi - lo >= w ? 'visible' : 'hidden' // no room at all (a very narrow screen): the line under the card still says it
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(el)
    if (time.current) ro.observe(time.current)
    document.fonts?.ready.then(place).catch(() => {})
    return () => ro.disconnect()
  }, [chipText, target, clock])

  const when = statusText(row, showDay, row.detail)
  const label =
    `${row.homeName} vs ${row.awayName}, ${when}.` +
    (done
      ? ` Final: ${row.home} ${row.homeScore}, ${row.away} ${row.awayScore}.`
      : t
        ? ` Fair chance: ${row.home} ${fmtPct(t.home)}, draw ${fmtPct(t.draw)}, ${row.away} ${fmtPct(t.away)}.`
        : ' No Kalshi price yet.')

  return (
    <div
      ref={plate}
      role='img'
      aria-label={label}
      className={cn(
        'relative overflow-hidden rounded-[18px] text-white',
        big ? 'h-[248px] rounded-none' : 'h-[132px]',
        row.state === 'post' && 'opacity-80'
      )}
      style={{ background }}
    >
      <LogoMark sport={row.sport} code={row.home} id={row.ids?.home} className={big ? '-start-10 top-6 size-56' : '-start-8 top-3 size-36'} />
      <LogoMark sport={row.sport} code={row.away} id={row.ids?.away} className={big ? '-end-10 top-6 size-56' : '-end-8 top-3 size-36'} />
      <div aria-hidden='true' className='absolute inset-0 bg-black/25' />
      {(done ? [50] : [c1, c2]).map((x, i) => (
        <div
          key={i}
          aria-hidden='true'
          className='absolute -top-4 -bottom-4 w-[2px] bg-black/50'
          style={{ left: `${x.toFixed(1)}%`, transform: `rotate(${ANGLE - 90}deg)` }}
        />
      ))}
      {chipText && (
        <div
          ref={chip}
          aria-hidden='true'
          className={cn(
            'absolute z-[3] rounded-full border-[1.5px] border-white/20 bg-[#0c0f14] px-[11px] pt-[5px] pb-1 font-condensed text-[14px] leading-none font-extrabold tracking-[0.06em] whitespace-nowrap text-[#f2f4f8]',
            big ? 'top-[18px]' : 'top-[10px]'
          )}
          style={{ left: `calc(${target}% - 40px)` }}
        >
          {chipText}
        </div>
      )}

      <div className={cn('relative flex h-full flex-col justify-between', big ? 'px-5 pt-4 pb-5' : 'px-4 py-3')}>
        <div className='flex items-center justify-between text-xs font-semibold text-white/90'>
          <span ref={time} className={cn('flex items-center gap-1.5', live && 'text-[#b5ffd0]')}>
            {live && <span aria-hidden='true' className='size-1.5 rounded-full bg-[#b5ffd0] motion-safe:animate-pulse' />}
            {statusText(row, showDay, clock)}
          </span>
          <span ref={tag}>{leagueTag(row.sport)}</span>
        </div>

        <div className='flex items-end justify-between gap-3'>
          <Side
            sport={row.sport}
            teamId={row.ids?.home}
            color={home}
            code={row.home}
            name={row.homeName}
            pct={t ? t.home : null}
            score={live || row.state === 'post' ? row.homeScore : null}
            won={done && row.homeScore! > row.awayScore!}
            big={big}
          />
          <Side
            sport={row.sport}
            teamId={row.ids?.away}
            color={away}
            code={row.away}
            name={row.awayName}
            pct={t ? t.away : null}
            score={live || row.state === 'post' ? row.awayScore : null}
            won={done && row.awayScore! > row.homeScore!}
            big={big}
            right
          />
        </div>
      </div>
    </div>
  )
}

// The line under a soccer card: the three fair chances (live: Kalshi's now), or the final score
export function soccerLine(row: GameRow) {
  const t = row.three
  if (row.state === 'post' && row.homeScore != null && row.awayScore != null) {
    const w = row.homeScore > row.awayScore ? row.home : row.awayScore > row.homeScore ? row.away : null
    return { lead: 'Final', text: `${row.home} ${row.homeScore}–${row.awayScore} ${row.away}${w ? ` · ${w} won` : ' · Draw'}` }
  }
  if (!t) return { lead: 'Fair', text: 'no Kalshi price yet' }
  return {
    lead: row.state === 'in' ? 'Now' : 'Fair',
    text: `${row.home} ${fmtPct(t.home)} · Draw ${fmtPct(t.draw)} · ${row.away} ${fmtPct(t.away)}`,
  }
}
export function soccerPrices(row: GameRow) {
  const m = row.ml3
  return m ? `${fmtAmerican(m.home)} / ${fmtAmerican(m.draw)} / ${fmtAmerican(m.away)}` : '—'
}

function Side({
  sport,
  teamId,
  color,
  code,
  name,
  pct,
  score,
  won,
  big,
  right,
}: {
  sport: string
  teamId?: string | null
  color: string
  code: string
  name: string
  pct: number | null
  score: number | null
  won: boolean
  big: boolean
  right?: boolean
}) {
  const hasScore = score != null
  return (
    <div className={cn('flex min-w-0 items-end gap-3', right && 'flex-row-reverse')}>
      <TeamLogo sport={sport} code={code} id={teamId} color={color.startsWith('#') ? color : null}
        px={big ? 128 : 96} className={cn(big ? 'mb-1 size-[60px] text-[18px]' : 'mb-0.5 size-[44px] text-[14px]')} />
    <div className={cn('min-w-0', right && 'text-end')}>
      {big && name !== code && <div className='truncate text-sm font-semibold text-white/85'>{name}</div>}
      <div
        className={cn(
          'font-display leading-[0.85] font-black tracking-tight',
          big ? 'text-[58px]' : 'text-[36px]'
        )}
      >
        {code}
      </div>
      {/* once there's a score it takes the chance's place under the code, so the two never run into each other */}
      {hasScore ? (
        <div className={cn('mt-1.5 flex items-center gap-2', right && 'flex-row-reverse')}>
          <span
            className={cn(
              'font-display leading-[0.9] font-extrabold tabular-nums',
              big ? 'text-[40px]' : 'text-[26px]',
              !won && 'opacity-80'
            )}
          >
            {score}
          </span>
          {won && big && (
            <span className='rounded-full bg-white px-2 py-0.5 text-xs font-extrabold text-[#0a0b0f]'>WIN</span>
          )}
        </div>
      ) : (
        <div className={cn('font-display font-extrabold tabular-nums', big ? 'mt-1 text-[30px]' : 'mt-1 text-[22px]')}>
          {pct == null ? '—' : fmtPct(pct)}
        </div>
      )}
    </div>
    </div>
  )
}

// The line under a plate: DeVig's read (or a pass), Kalshi's prices, and the Why? button when there's a pick
export function priceLine(row: GameRow) {
  return `${fmtAmerican(row.ml?.away)} / ${fmtAmerican(row.ml?.home)}`
}

// the picked team's full name ("Boston Celtics"), for saying the pick in words
export function pickName(row: GameRow) {
  const s = row.pick?.side
  return s == null ? '' : s === row.home ? row.homeName : s === row.away ? row.awayName : s
}
