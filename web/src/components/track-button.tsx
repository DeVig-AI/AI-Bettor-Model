import { useNavigate } from '@tanstack/react-router'
import { Star } from 'lucide-react'
import { useAccount } from '@/lib/profile'
import { useTracked } from '@/lib/track'
import { cn } from '@/lib/utils'

// ☆ Track / ★ Tracking. As in the classic app, tracking needs a free account where accounts exist; without one
// the tap opens Profile, which explains how to get one. `keys`: every key that counts as this item (first is saved).
export function TrackButton({ kind, keys, label, compact, className }: {
  kind: 'g' | 'p'; keys: string[]; label: string; compact?: boolean; className?: string
}) {
  const { tracked, set } = useTracked()
  const { data: acct } = useAccount()
  const navigate = useNavigate()
  const on = keys.some((k) => tracked[kind][k])
  const tap = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (acct && (acct.state === 'guest' || acct.state === 'invite')) { navigate({ to: '/profile' }); return }
    if (on) set(kind, keys, false)
    else set(kind, keys.slice(0, 1), true)
  }
  return (
    <button type='button' onClick={tap} aria-pressed={on} aria-label={`${on ? 'Stop tracking' : 'Track'} ${label}`}
      className={cn('inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border text-xs font-semibold transition-colors duration-150',
        compact ? 'size-8' : 'h-9 px-3',
        on ? 'border-devig bg-devig/15 text-devig' : 'text-muted-foreground hover:text-foreground', className)}>
      <Star className={cn('size-4', on && 'fill-current')} aria-hidden='true' />
      {!compact && (on ? 'Tracking' : 'Track')}
    </button>
  )
}
