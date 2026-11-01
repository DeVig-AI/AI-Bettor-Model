import { useState } from 'react'
import { UserRound } from 'lucide-react'
import { headshot, teamLogo } from '@/lib/logos'
import { cn } from '@/lib/utils'

// A team's logo on a white disc; the team's code in its color if the logo can't load
export function TeamLogo({ sport, code, id, color, px = 128, className }: {
  sport: string; code: string; id?: string | null; color?: string | null; px?: number; className?: string
}) {
  const [bad, setBad] = useState(false)
  const src = teamLogo(sport, code, id, px)
  return (
    <span aria-hidden='true' className={cn('grid shrink-0 place-items-center overflow-hidden rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.35)]', className)}
      style={{ color: color || '#1b212c' }}>
      {src && !bad ? (
        <img src={src} alt='' loading='lazy' decoding='async' draggable={false} onError={() => setBad(true)} className='size-[76%] object-contain' />
      ) : (
        <span className='font-display text-[0.9em] leading-none font-black'>{code}</span>
      )}
    </span>
  )
}

// The faint big logo behind a team's half of a plate (nothing when it can't load)
export function LogoMark({ sport, code, id, className }: { sport: string; code: string; id?: string | null; className?: string }) {
  const [bad, setBad] = useState(false)
  const src = teamLogo(sport, code, id, 256)
  if (!src || bad) return null
  return <img aria-hidden='true' src={src} alt='' loading='lazy' decoding='async' draggable={false} onError={() => setBad(true)}
    className={cn('pointer-events-none absolute object-contain opacity-[0.16]', className)} />
}

// A player's headshot on a dark disc, with their team's logo as a small badge; a plain figure when there's no photo
export function PlayerPhoto({ sport, pid, team, teamColor, className, badge = 'size-[42%]' }: {
  sport: string; pid?: string | null; team?: string | null; teamColor?: string | null; className?: string; badge?: string
}) {
  const [bad, setBad] = useState(false)
  const src = headshot(sport, pid)
  return (
    <span aria-hidden='true' className={cn('relative shrink-0', className)}>
      <span className='grid size-full place-items-end overflow-hidden rounded-full bg-muted'>
        {src && !bad ? (
          <img src={src} alt='' loading='lazy' decoding='async' draggable={false} onError={() => setBad(true)} className='size-full object-cover object-top' />
        ) : (
          <UserRound className='size-[78%] text-muted-foreground/70' />
        )}
      </span>
      {team && (
        <TeamLogo sport={sport} code={team} color={teamColor} px={64}
          className={cn('absolute -end-1 -bottom-0.5 text-[9px] ring-2 ring-background', badge)} />
      )}
    </span>
  )
}
