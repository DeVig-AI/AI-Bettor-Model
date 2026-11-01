// A parlay leg as a team-colored bar: the picked team's color fills most of it (the other team's color is the slice),
// a logo or photo on the left, the leg in big type, the matchup under it, and whatever goes on the right.
export function LegBar({ title, sub, colors, sideIsHome, logo, right, children, className }: {
  title: React.ReactNode; sub: React.ReactNode; colors: { away: string; home: string } | null; sideIsHome: boolean | null
  logo?: React.ReactNode; right?: React.ReactNode; children?: React.ReactNode; className?: string
}) {
  const c = colors
  const bg = c
    ? sideIsHome == null
      ? `linear-gradient(102deg, ${c.away} 0 50%, ${c.home} 50% 100%)`
      : sideIsHome
        ? `linear-gradient(102deg, ${c.away} 0 18%, ${c.home} 18% 100%)`
        : `linear-gradient(102deg, ${c.away} 0 82%, ${c.home} 82% 100%)`
    : 'linear-gradient(102deg, var(--side-away) 0 50%, var(--side-home) 50% 100%)'
  return (
    <div className={`relative flex h-16 items-center justify-between gap-3 overflow-hidden rounded-2xl px-3 text-white ${className ?? ''}`} style={{ background: bg }}>
      <div aria-hidden='true' className='absolute inset-0 bg-black/25' />
      {children}
      <div className='pointer-events-none relative flex min-w-0 items-center gap-3'>
        {logo}
        <div className='min-w-0'>
          <div className='truncate font-display text-[22px] leading-none font-black'>{title}</div>
          <div className='mt-0.5 truncate text-xs font-semibold text-white/85'>{sub}</div>
        </div>
      </div>
      {right != null && <div className='relative flex shrink-0 items-center gap-2'>{right}</div>}
    </div>
  )
}

// "#abc123" or "abc123" -> "#abc123"; anything else -> null
export const hexColor = (c?: string | null) => {
  if (!c) return null
  const v = c.startsWith('#') ? c : `#${c}`
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : null
}
