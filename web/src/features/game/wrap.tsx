import { TrendingDown, TrendingUp } from 'lucide-react'
import { type GameRow, fmtPct } from '@/lib/devig'
import { type Wrap, type WrapPlayer, type WrapTeam, useWrap } from '@/lib/wrap'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { PlayerPhoto, TeamLogo } from '@/components/team-logo'
import { isPick } from '../games/plate'

// "How it went": after (or during) a game, what actually happened next to what DeVig expected. Who had a big or a
// quiet night by their own standard, where the game was won (turnovers, sacks, threes...), and the play that swung it.

type Factor = (WrapPlayer & { kind: 'player' }) | (WrapTeam & { kind: 'team' })

// a factor helps `side` when it's good for that side or bad for the other one
const helps = (f: { side: string; good: boolean }, side: string) => (f.side === side) === f.good

export function GameWrap({ row, compact = false }: { row: GameRow; compact?: boolean }) {
  const { wrap, isLoading } = useWrap(row)
  if (row.state === 'pre') return null
  if (isLoading) return <Skeleton className='h-48 w-full rounded-2xl' />
  if (!wrap) return null
  return <WrapBody row={row} wrap={wrap} compact={compact} />
}

function WrapBody({ row, wrap, compact }: { row: GameRow; wrap: Wrap; compact: boolean }) {
  const code = { away: row.away, home: row.home }
  const p = row.pick
  const picked = isPick(row) && p?.side ? p.side : null
  const pickSide = picked === row.home ? 'home' : picked === row.away ? 'away' : null
  const all: Factor[] = [
    ...wrap.teams.map((t) => ({ ...t, kind: 'team' as const })),
    ...wrap.players.map((x) => ({ ...x, kind: 'player' as const })),
  ].sort((a, b) => b.weight - a.weight)

  // the side whose story we tell: the pick's side if DeVig had one, else whoever won (or leads)
  const lead = wrap.away === wrap.home ? null : wrap.away > wrap.home ? 'away' : 'home'
  const focus = pickSide ?? wrap.winner ?? lead
  const pickWon = pickSide && wrap.winner ? pickSide === wrap.winner : null
  const key = focus
    ? all.filter((f) => (pickWon === false ? !helps(f, focus) : helps(f, focus))).slice(0, 4)
    : all.slice(0, 4)
  const rest = all.filter((f) => f.kind === 'player' && !key.includes(f)).slice(0, compact ? 0 : 4)

  const score = `${row.away} ${wrap.away} – ${row.home} ${wrap.home}`
  let verdict: string
  let heading: string
  if (pickSide && wrap.final) {
    verdict = `DeVig picked ${picked} (${fmtPct(p?.prob)}). ${picked} ${pickWon ? 'won' : 'lost'}, ${score}.`
    heading = pickWon ? `What went right for ${picked}` : 'What threw it off'
  } else if (pickSide) {
    verdict = `DeVig picked ${picked} (${fmtPct(p?.prob)}). So far: ${score}.`
    heading = focus === lead ? `What's going right for ${picked}` : `What's going wrong for ${picked}`
  } else {
    verdict = wrap.final ? `Final: ${score}.` : `So far: ${score}.`
    heading = focus ? `Why ${code[focus]} ${wrap.final ? 'won' : 'leads'}` : 'What stood out'
  }

  return (
    <section aria-label='How it went' className='flex flex-col gap-3'>
      {!compact && <h2 className='px-1 font-display text-[22px] font-extrabold'>{wrap.final ? 'How it went' : 'So far'}</h2>}
      <div className='rounded-2xl bg-card p-4'>
        <p className='text-[15px] leading-relaxed font-semibold'>{verdict}</p>
        {pickWon === false && (
          <p className='mt-1 text-sm leading-relaxed text-muted-foreground'>
            DeVig&apos;s chance is set before the game from how the teams have played. It can&apos;t see a big night or a bad one coming.
          </p>
        )}
        {key.length > 0 ? (
          <>
            <h3 className='mt-3 text-xs font-bold tracking-wide text-muted-foreground uppercase'>{heading}</h3>
            <ul className='mt-1.5 flex flex-col gap-2'>
              {key.map((f, i) => <FactorRow key={i} f={f} row={row} plus={focus ? helps(f, focus) : f.good} />)}
            </ul>
          </>
        ) : (
          <p className='mt-2 text-sm text-muted-foreground'>
            {wrap.final ? 'No one stat stands out: a close, even game.' : "Nothing stands out yet. Players are measured against their usual pace for this point in the game once a quarter's played."}
          </p>
        )}
      </div>

      {wrap.swing && (
        <div className='rounded-2xl bg-card p-4'>
          <h3 className='text-xs font-bold tracking-wide text-muted-foreground uppercase'>The biggest swing · {wrap.swing.when}</h3>
          <p className='mt-1 text-[15px] leading-relaxed'>{wrap.swing.text}</p>
          <p className='mt-1 text-sm text-muted-foreground'>
            {code[wrap.swing.side]}&apos;s chance to win went from{' '}
            {fmtPct(wrap.swing.side === 'home' ? wrap.swing.from : 1 - wrap.swing.from)} to{' '}
            <span className='font-semibold text-foreground'>{fmtPct(wrap.swing.side === 'home' ? wrap.swing.to : 1 - wrap.swing.to)}</span>.
          </p>
        </div>
      )}
      {wrap.forGood && wrap.winner && !compact && wrap.forGood.when !== wrap.swing?.when && (
        <div className='rounded-2xl bg-card p-4'>
          <h3 className='text-xs font-bold tracking-wide text-muted-foreground uppercase'>{code[wrap.winner]} ahead for good from {wrap.forGood.when}</h3>
          <p className='mt-1 text-[15px] leading-relaxed'>{wrap.forGood.text}</p>
        </div>
      )}

      {rest.length > 0 && (
        <div className='rounded-2xl bg-card p-4'>
          <h3 className='text-xs font-bold tracking-wide text-muted-foreground uppercase'>Also stood out</h3>
          <ul className='mt-1.5 flex flex-col gap-2'>
            {rest.map((f, i) => <FactorRow key={i} f={f} row={row} plus={f.good} />)}
          </ul>
        </div>
      )}
      <p className='px-1 text-xs text-muted-foreground'>
        From ESPN&apos;s box score and play-by-play. &quot;Usual&quot; is the player&apos;s last 15 games before this one{wrap.final ? '' : ', scaled to how much of the game is played'}.
      </p>
    </section>
  )
}

function FactorRow({ f, row, plus }: { f: Factor; row: GameRow; plus: boolean }) {
  const side = f.side
  const color = side === 'home' ? row.colors?.home : row.colors?.away
  const Icon = plus ? TrendingUp : TrendingDown
  return (
    <li className='flex items-start gap-3'>
      {f.kind === 'player' ? (
        <PlayerPhoto sport={row.sport} pid={f.pid} team={f.team} teamColor={color} className='size-10' />
      ) : (
        <TeamLogo sport={row.sport} code={f.team} id={side === 'home' ? row.ids?.home : row.ids?.away} color={color} px={64} className='size-10 shrink-0 text-xs' />
      )}
      <p className='min-w-0 flex-1 pt-0.5 text-sm leading-relaxed'>{f.text}</p>
      <Icon aria-label={plus ? 'helped' : 'hurt'} className={cn('mt-1 size-4 shrink-0', plus ? 'text-good' : 'text-bad')} />
    </li>
  )
}
