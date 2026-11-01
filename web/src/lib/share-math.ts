// The share card's words, pure (no imports) so node tests can load it: how a finished parlay went, in a few lines
// someone can post. The odds line uses Kalshi's prices at kickoff (each leg's price multiplied).

export type ShareLeg = { label: string; result: 'won' | 'lost' | null; score: string | null; weakest: boolean }
export type ShareText = { kicker: string; head: string; sub: string; weak: string | null; text: string }

const odds = (p: number) => (p >= 0.5 ? `${Math.round(p * 100)}%` : `about 1 in ${Math.max(2, Math.round(1 / p))}`)

export function shareText(legs: ShareLeg[], hit: number | null, day: string): ShareText {
  const n = legs.length
  const won = legs.filter((l) => l.result === 'won').length
  const lost = legs.filter((l) => l.result === 'lost')
  const all = lost.length === 0 && won === n
  const kicker = `${day} · ${n}-leg parlay`
  const head = all ? 'Every leg hit' : `${won} of ${n} hit`
  const at = hit != null ? ` Kalshi had it at ${odds(hit)} at kickoff.` : ''
  const sub = (all ? 'Cashed.' : lost.length === 1 ? 'Lost by one leg.' : `${lost.length} legs lost.`) + at
  const w = n >= 2 ? legs.find((l) => l.weakest) : undefined
  const weak = !w
    ? null
    : w.result === 'lost'
      ? `DeVig flagged ${w.label} as the weakest leg. ${lost.length === 1 ? "It's the one that lost." : 'It lost.'}`
      : w.result === 'won'
        ? `DeVig flagged ${w.label} as the weakest leg. It came through.`
        : null
  const text = [`${head} on a ${n}-leg parlay.`, sub, weak].filter(Boolean).join(' ')
  return { kicker, head, sub, weak, text }
}
