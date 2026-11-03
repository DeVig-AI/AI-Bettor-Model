import { type CSSProperties } from 'react'
import { type GameRow } from '@/lib/devig'
import { type Call } from '@/lib/field'

// The field's call on a big play (lib/field-math.ts callOf): once the play has drawn in, a band in the team's colour
// sweeps across the field, the word slams in (TOUCHDOWN!, FIELD GOAL IS GOOD, INTERCEPTION!), the points come in one
// after another (+6, then +1 for the extra point), and the score ticks over. About three and a half seconds, then
// it clears. Not drawn with reduced motion (the field shows a still chip instead).

export const CALL_AT = 0.9 // seconds: the play's line has drawn in

export function CallBanner({ row, call, color, at = CALL_AT }: { row: GameRow; call: Call; color: string; at?: number }) {
  const band = call.kind === 'miss' ? '#4b5260' : color
  const turnover = call.kind === 'int' || call.kind === 'fumble' || call.kind === 'block'
  const flip = at + 0.5 + call.pts.length * 0.55 // the score ticks over after the last chip
  const long = call.word.length > 12
  return (
    <div aria-hidden='true' className='pointer-events-none absolute inset-x-0 top-[17%] flex flex-col items-center' style={{ animation: `fm-call 3.6s ${at}s both` }}>
      {/* the band: just behind the word, so the field (and its flashing end zone) stays in view */}
      <div className='relative w-full'>
        <div className='absolute inset-0 -skew-y-2'>
          <div className='size-full border-y-2 border-white/85' style={{ background: `linear-gradient(90deg, transparent, ${band} 14%, ${band} 86%, transparent)`,
            boxShadow: `0 0 22px ${band}`, animation: `fm-band .45s ${at}s cubic-bezier(.2,.8,.3,1) both` }} />
        </div>
        <div className='relative flex justify-center px-4 py-1.5'>
          <span className='font-display leading-none font-black whitespace-nowrap text-white italic'
            style={{ fontSize: long ? 'clamp(22px, 7.4vw, 32px)' : 'clamp(28px, 9.5vw, 40px)', letterSpacing: '.01em',
              textShadow: '0 3px 0 rgba(0,0,0,.4), 0 0 18px rgba(0,0,0,.3)', animation: `ct-pop .7s ${at + 0.08}s cubic-bezier(.2,.8,.3,1.2) both` }}>
            {call.word}
          </span>
        </div>
      </div>
      {call.pts.length > 0 && (
        <span className='mt-2.5 flex gap-1.5'>
          {call.pts.map((p, i) => (
            <span key={p.label} className='inline-flex items-baseline gap-1 rounded-full bg-black/65 px-2.5 py-0.5 ring-1 ring-white/20'
              style={{ animation: `fm-chip .4s ${at + 0.45 + i * 0.55}s cubic-bezier(.2,.8,.3,1.3) both` }}>
              <b className='font-display text-[17px] leading-none font-black text-white tabular-nums'>+{p.n}</b>
              <span className='font-condensed text-[10px] font-bold tracking-wider text-white/85 uppercase'>{p.label}</span>
            </span>
          ))}
        </span>
      )}
      {call.before && call.after && <ScoreLine row={row} before={call.before} after={call.after} at={flip} shown={at + 0.45} />}
      {turnover && call.team && (
        <span className='mt-2.5 rounded-full bg-black/65 px-2.5 py-0.5 font-condensed text-[11px] font-bold tracking-[.16em] text-white uppercase ring-1 ring-white/20'
          style={{ animation: `ct-in .3s ${at + 0.45}s both` }}>{call.team} ball</span>
      )}
    </div>
  )
}

// "MIA 10  BUF 29 → 36": the side that scored shows its old number, then the new one
function ScoreLine({ row, before, after, at, shown }: { row: GameRow; before: [number, number]; after: [number, number]; at: number; shown: number }) {
  const cell = (code: string, b: number, a: number) => (
    <span className='inline-flex items-baseline gap-1'>
      <span className='text-white/70'>{code}</span>
      {a === b ? <span>{a}</span> : (
        <span className='grid'>
          <span className='[grid-area:1/1]' style={{ animation: `ct-in .15s ${at}s reverse both` } as CSSProperties}>{b}</span>
          <span className='[grid-area:1/1] text-[#ffd23f]' style={{ animation: `fm-chip .35s ${at}s cubic-bezier(.2,.8,.3,1.3) both` }}>{a}</span>
        </span>
      )}
    </span>
  )
  return (
    <span className='mt-1.5 inline-flex gap-3 rounded bg-black/65 px-2 py-0.5 ring-1 ring-white/20 font-condensed text-[13px] font-bold text-white tabular-nums'
      style={{ animation: `ct-in .3s ${shown}s both` }}>
      {cell(row.away, before[0], after[0])}
      {cell(row.home, before[1], after[1])}
    </span>
  )
}
