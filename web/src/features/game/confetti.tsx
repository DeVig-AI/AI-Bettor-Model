import { type CSSProperties } from 'react'
import { cn } from '@/lib/utils'

// A burst of confetti in a team's colour, white and gold, falling from where it's placed (`className` positions it).
// The NBA court rains it from the big screen on a three, the field from the call on a touchdown.
export function Confetti({ color, delay, className }: { color: string; delay: number; className?: string }) {
  const bits = Array.from({ length: 30 }, (_, i) => {
    const r = (n: number) => { const v = Math.sin((i + 1) * n) * 10000; return v - Math.floor(v) }
    return { x: (r(3.1) - 0.5) * 340, y: 120 + r(7.7) * 140, rot: (r(5.3) - 0.5) * 900, d: 1.5 + r(9.1) * 0.9, c: [color, '#fff', '#ffd23f'][i % 3], w: 3 + r(2.2) * 3 }
  })
  return (
    <div aria-hidden='true' className={cn('pointer-events-none absolute left-1/2', className)}>
      {bits.map((b, i) => (
        <span key={i} className='absolute block rounded-[1px]' style={{ width: b.w, height: b.w * 1.8, background: b.c, opacity: 0,
          ['--x' as string]: `${b.x}px`, ['--y' as string]: `${b.y}px`, ['--r' as string]: `${b.rot}deg`,
          animation: `ct-confetti ${b.d}s ${delay + 0.15 + (i % 6) * 0.03}s cubic-bezier(.15,.6,.4,1) both` } as CSSProperties} />
      ))}
    </div>
  )
}
