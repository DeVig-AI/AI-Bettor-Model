import { type GameRow, fmtPct } from '@/lib/devig'
import { useDevigSoccer } from '@/lib/soccer'
import { Box } from './soccer-markets'

// DeVig Soccer v1 on a league match (CHAMPION_CHALLENGER_V4_PREREG.md, SOCCER.ml): its home / draw / away chance in
// 90 minutes and expected goals before kick-off, what it said once the match is graded, and its record beside
// Kalshi's. Chances only, no pick; new and not proven. Nothing shows for a match it doesn't cover.

const OUT = ['home', 'draw', 'away'] as const

export function DevigSoccer({ row }: { row: GameRow }) {
  const { data } = useDevigSoccer()
  const id = row.id.split('|')[1]
  const g = data?.games.get(id)
  const past = data?.record?.recent.find((r) => r.game_id === id)
  const p = g ? [g.home_wp, g.draw_p, g.away_wp] : past?.model
  if (!p || (row.state !== 'pre' && !past)) return null
  const top = p.indexOf(Math.max(...p))
  const label = (i: number) => (i === 1 ? 'Draw' : `${i === 0 ? row.home : row.away} win`)
  const kalshi = row.state === 'pre' && row.three ? [row.three.home, row.three.draw, row.three.away] : past?.kalshi ?? null
  const rec = data?.record?.shared
  return (
    <section aria-labelledby='devig-soccer-h' className='flex flex-col gap-2'>
      <h2 id='devig-soccer-h' className='flex items-baseline justify-between gap-2 px-1'>
        <span className='font-display text-[22px] font-extrabold'>DeVig&apos;s chances</span>
        <span className='shrink-0 text-xs font-semibold text-devig'>New, not proven</span>
      </h2>
      <div className='grid grid-cols-3 gap-2'>
        {OUT.map((o, i) => (
          <Box key={o} label={label(i)} value={fmtPct(p[i])} strong={top === i}
            sub={kalshi ? `Kalshi ${fmtPct(kalshi[i])}` : undefined} />
        ))}
      </div>
      <p className='px-1 text-xs leading-relaxed text-muted-foreground'>
        {row.state === 'pre' && g
          ? <>DeVig Soccer v1 expects {row.home} {g.xg_home.toFixed(1)}, {row.away} {g.xg_away.toFixed(1)} goals. </>
          : <>What DeVig Soccer v1 said at its last update before kick-off. </>}
        Ratings from final scores only: no injuries, line-ups or prices. Its chances, not a pick; nothing is bet.
        {rec?.devig && rec.kalshi
          ? ` Graded so far: ${rec.devig.games} ${rec.devig.games === 1 ? 'match' : 'matches'}, the likeliest outcome happened ${fmtPct(rec.devig.picked_right)} of the time for DeVig and ${fmtPct(rec.kalshi.picked_right)} for Kalshi.`
          : ' No matches graded yet.'}
      </p>
    </section>
  )
}
