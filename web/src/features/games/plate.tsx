import { type GameRow, fmtAmerican, fmtPct } from '@/lib/devig'
import { cn } from '@/lib/utils'
import { LogoMark, TeamLogo } from '@/components/team-logo'

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

function statusText(row: GameRow, showDay: boolean) {
  if (row.state === 'in') return row.detail || 'Live'
  if (row.state === 'post') return row.detail || 'Final'
  const d = new Date(row.kickoff)
  return (showDay ? `${dayFmt.format(d)} ` : '') + timeFmt.format(d)
}

export function isPick(r: GameRow) {
  return !!r.pick?.side && r.pick.action !== 'PASS'
}

export function Plate({
  row,
  showDay,
  size = 'md',
}: {
  row: GameRow
  showDay: boolean
  size?: 'md' | 'lg'
}) {
  const away = hex(row.colors?.away) ?? 'var(--side-away)'
  const home = hex(row.colors?.home) ?? 'var(--side-home)'
  const split = row.fairHome == null ? 0.5 : 1 - row.fairHome // away share
  const cut = `${(split * 100).toFixed(1)}%`
  const p = row.pick
  const notch =
    isPick(row) && p?.prob != null ? (p.side === row.away ? p.prob : 1 - p.prob) : null
  const live = row.state === 'in'
  const done = row.state === 'post' && row.awayScore != null && row.homeScore != null
  const big = size === 'lg'
  const label =
    `${row.awayName} at ${row.homeName}, ${statusText(row, showDay)}.` +
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
            {statusText(row, showDay)}
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
            score={row.awayScore}
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
            score={row.homeScore}
            won={done && row.homeScore! > row.awayScore!}
            big={big}
            right
          />
        </div>
      </div>
    </div>
  )
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
      <div className={cn('flex items-baseline gap-2.5', right && 'flex-row-reverse')}>
        <span
          className={cn(
            'font-display leading-[0.85] font-black tracking-tight',
            big ? 'text-[58px]' : 'text-[36px]'
          )}
        >
          {code}
        </span>
        {hasScore && (
          <span
            className={cn(
              'font-display leading-[0.85] font-extrabold tabular-nums',
              big ? 'text-[46px]' : 'text-[30px]',
              !won && 'opacity-80'
            )}
          >
            {score}
          </span>
        )}
      </div>
      <div className={cn('font-display font-extrabold tabular-nums', big ? 'mt-1 text-[30px]' : 'mt-1 text-[22px]')}>
        {pct == null ? '—' : fmtPct(pct)}
      </div>
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
