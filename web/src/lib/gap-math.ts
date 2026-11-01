// Gap chart math, pure (no imports) so node tests can load it: Kalshi's price for a team next to ESPN's own win
// chance, over the game. Both come in as the home team's chance; the chart shows whichever side the reader picked.
// Display only: DeVig hasn't tested how often gaps like this close, so nothing here is a pick.

export type Pt = [number, number] // [unix seconds, home chance 0..1]
export type SwingKey = { at: number; kind: string; q: number | null; clock: string; text: string; away_score: number | null; home_score: number | null }

export const forSide = (pts: Pt[], side: 'home' | 'away'): Pt[] => (side === 'home' ? pts : pts.map(([t, v]) => [t, Math.round((1 - v) * 1000) / 1000]))

// the points from t on, plus the last one before it so the line starts at the left edge
export function since(pts: Pt[], t: number): Pt[] {
  const i = pts.findIndex((p) => p[0] >= t)
  if (i < 0) return pts.length ? [[t, pts[pts.length - 1][1]]] : []
  return i > 0 ? [[t, pts[i - 1][1]] as Pt, ...pts.slice(i)] : pts.slice(i)
}

export function valueAt(pts: Pt[], t: number): number | null {
  let v: number | null = null
  for (const p of pts) {
    if (p[0] > t) break
    v = p[1]
  }
  return v
}

// a y range in whole tens that holds every value, at least 20 points tall
export function yRange(values: number[]): [number, number] {
  if (!values.length) return [0, 1]
  let lo = Math.floor((Math.min(...values) * 100 - 3) / 10) * 10
  let hi = Math.ceil((Math.max(...values) * 100 + 3) / 10) * 10
  lo = Math.max(0, lo)
  hi = Math.min(100, hi)
  while (hi - lo < 20) {
    if (hi < 100) hi += 10
    else lo -= 10
  }
  return [lo / 100, hi / 100]
}

// the headline: how far Kalshi's price is from ESPN's chance, in points
export function gapRead(kalshi: number | null, espn: number | null): { gap: number | null; text: string } {
  if (kalshi == null || espn == null) return { gap: null, text: kalshi == null ? "Kalshi's price isn't in yet" : "ESPN's chance isn't in yet" }
  const gap = Math.round((kalshi - espn) * 100)
  if (Math.abs(gap) < 3) return { gap, text: 'Kalshi and ESPN agree' }
  return { gap, text: `Kalshi is ${Math.abs(gap)} point${Math.abs(gap) === 1 ? '' : 's'} ${gap < 0 ? 'behind' : 'ahead of'} ESPN` }
}

export const KIND_LABEL: Record<string, string> = { TD: 'TD', FG: 'FG', INT: 'INT', FUM: 'FUM', SAF: 'SAF', BLK: 'BLK' }
