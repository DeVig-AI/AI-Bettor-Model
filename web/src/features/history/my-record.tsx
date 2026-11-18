import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { useSaved } from '@/lib/kalshi-link'
import { record } from '@/lib/friends'
import { trackedParlays, useTracked } from '@/lib/track'
import { cn } from '@/lib/utils'
import { money, signed, useGradedParlays } from './parlays'
import { betFacts, hasBet } from '../check-bet/bet-box'
import { peek } from '../check-bet/link-reader'

export type Settled = { status: 'hit' | 'missed'; stake: number; payout: number }

// Your own record: parlays built and saved in DeVig, plus Kalshi and Polymarket bets you saved with what you put in.
// A Kalshi or Polymarket bet counts once it's settled (its kept outcome, or the latest read says so).
export function useMyRecord() {
  const { tracked } = useTracked()
  const list = useMemo(() => trackedParlays(tracked), [tracked])
  const graded = useGradedParlays(list)
  const saved = useSaved()
  // slip: entries are DeVig parlays, already counted above; a bet without a stake has no money to count
  const staked = useMemo(() => saved.filter((s) => !s.link.startsWith('slip:') && hasBet(s.bet)), [saved])
  const reads = useQueries({ queries: staked.map((s) => ({ ...peek(s.link), enabled: !s.outcome })) })
  const settled = useMemo(() => {
    const out: Settled[] = graded.filter((p) => p.status === 'hit' || p.status === 'missed')
      .map((p) => ({ status: p.status as Settled['status'], stake: Number(p.stake) || 0, payout: p.payout }))
    let links = 0, unstaked = 0
    staked.forEach((s, i) => {
      const d = reads[i]?.data
      const result = s.outcome ? (s.outcome.won ? 'won' : 'lost') : d && d.kind !== 'event' ? betFacts(d).result : null
      if (!result) return
      links++
      out.push({ status: result === 'won' ? 'hit' : 'missed', stake: s.bet!.stake, payout: s.bet!.pays })
    })
    for (const s of saved) if (!s.link.startsWith('slip:') && !hasBet(s.bet) && s.outcome) unstaked++
    return { list: out, links, unstaked }
  }, [graded, staked, reads, saved])
  return settled
}

// on Record: your own bets in one line, under DeVig's
export function MyRecordLine() {
  const { list } = useMyRecord()
  if (!list.length) return null
  const r = record(list)
  return (
    <Link to='/history' className='flex min-h-14 items-center gap-3 rounded-[18px] bg-card px-4 py-3 active:bg-muted/50'>
      <span className='min-w-0 flex-1'>
        <span className='block font-semibold'>Your bets</span>
        <span className='block text-sm text-muted-foreground tabular-nums'>
          {r.hit} hit · {r.missed} missed · {money(r.staked)} put in
        </span>
      </span>
      <span className={cn('font-condensed text-xl font-bold tabular-nums', r.net >= 0 ? 'text-good' : 'text-bad')}>{signed(r.net)}</span>
      <ChevronRight className='size-4 shrink-0 text-muted-foreground' aria-hidden='true' />
    </Link>
  )
}
