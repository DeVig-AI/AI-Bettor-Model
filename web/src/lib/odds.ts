// Odds math for the Fair price calculator and the bet log. No imports, so the tests run it straight from this file
// (node --test tests/app/fair.test.mjs).

// The chance a price needs to break even (American odds; the vig is still in it)
export function breakeven(american: number | null | undefined): number | null {
  if (american == null || !isFinite(american) || (american > -100 && american < 100)) return null
  return american < 0 ? -american / (-american + 100) : 100 / (american + 100)
}

export function decimalOdds(american: number) {
  return american > 0 ? 1 + american / 100 : 1 + 100 / -american
}

export function americanFrom(chance: number) {
  if (!(chance > 0 && chance < 1)) return null
  return chance >= 0.5 ? (-100 * chance) / (1 - chance) : (100 * (1 - chance)) / chance
}

// Read typed odds: "-110", "+150", "150", "−110" (a typographic minus). Anything between -100 and +100 isn't a price.
export function parseAmerican(s: string): number | null {
  const t = s.trim().replace(/[−–]/g, '-').replace(/^\+/, '')
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null
  const n = Number(t)
  return n <= -100 || n >= 100 ? n : null
}

// A sportsbook's two prices with the vig removed by the power method: each side's break-even raised to the same
// power k so the two add to 1. Long shots carry more of a book's vig than favorites, and this takes more off them
// (the classic app's devigTwoWay does the same for sportsbooks).
export function noVig(mine: number, other: number): { mine: number; other: number; vig: number } | null {
  const a = breakeven(mine), b = breakeven(other)
  if (a == null || b == null) return null
  const vig = a + b - 1
  if (vig <= 0) return { mine: a / (a + b), other: b / (a + b), vig } // no vig to take off (or an arbitrage): plain split
  let lo = 1, hi = 10
  for (let i = 0; i < 80; i++) {
    const k = (lo + hi) / 2
    if (a ** k + b ** k > 1) lo = k
    else hi = k
  }
  const k = (lo + hi) / 2
  return { mine: a ** k, other: b ** k, vig }
}

// What 1 unit staked is expected to return at this price if the chance is right (0.05 = +5%)
export function expectedValue(chance: number, american: number) {
  return chance * decimalOdds(american) - 1
}

// The Kelly stake as a share of the bankroll; null when the price doesn't beat the chance (no bet)
export function kelly(chance: number, american: number) {
  const b = decimalOdds(american) - 1
  const f = (b * chance - (1 - chance)) / b
  return f > 0 ? f : null
}

// Beating the close: Kalshi's fair chance for your side at its last price before the game, minus the chance your
// price needed. Positive means the market ended up rating your side higher than your price did.
export function closingValue(american: number, closeChance: number) {
  const be = breakeven(american)
  if (be == null) return null
  return { points: closeChance - be, ev: expectedValue(closeChance, american) }
}

export type BetResult = 'won' | 'lost' | 'push' | null
export function profitUnits(american: number, result: BetResult) {
  if (result === 'won') return decimalOdds(american) - 1
  if (result === 'lost') return -1
  return 0
}
