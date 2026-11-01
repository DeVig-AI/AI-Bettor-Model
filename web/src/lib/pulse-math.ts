// Parlay pulse math, pure (no imports) so node tests can load it: the chance a parlay hits, minute by minute, as each
// leg's Kalshi price multiplied together. It treats the legs as unrelated (legs from one game move together, so it's a
// rough read, the same "legs multiplied" the combo reader shows), and a leg that's settled counts as 1 or 0 from then on.

export type PricePoint = [number, number] // [unix seconds, Yes chance 0..1]
export type PulseLeg = {
  title: string | null
  pick: string
  side: 'yes' | 'no'
  result: 'won' | 'lost' | null
  chance: number | null // the leg's chance now, for its side
  points: PricePoint[] // Kalshi's Yes price history, oldest first
}
export type Mark = { t: number; label: string; won: boolean }
export type Pulse = { line: PricePoint[]; marks: Mark[]; start: PricePoint | null; end: PricePoint | null; low: PricePoint | null; high: PricePoint | null }

// "Buffalo wins" → "Buffalo"; "Dennis Schröder: 6+ assists" → "Schröder"
export function shortLeg(l: Pick<PulseLeg, 'title' | 'pick' | 'side'>): string {
  const t = (l.title || l.pick || '').trim()
  const who = t.includes(':') ? t.split(':')[0].trim().split(/\s+/).slice(-1)[0] : t.replace(/\s+wins?$/i, '')
  return l.side === 'no' ? `No on ${who}` : who
}

// last price at or before t (the first one if t is before the history starts)
function at(points: PricePoint[], t: number): number | null {
  if (!points.length) return null
  if (t <= points[0][0]) return points[0][1]
  let lo = 0, hi = points.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (points[mid][0] <= t) lo = mid
    else hi = mid - 1
  }
  return points[lo][1]
}

// a leg's chance for its own side at time t; null when there's nothing to go on
export function legAt(l: PulseLeg, t: number, now: number): number | null {
  const settled = l.result ? (l.points.length ? l.points[l.points.length - 1][0] : now) : Infinity
  if (t >= settled) return l.result === 'won' ? 1 : 0
  const yes = at(l.points, t)
  if (yes == null) return l.chance
  return l.side === 'no' ? 1 - yes : yes
}

export function pulse(legs: PulseLeg[], start: number, now: number, step = 300): Pulse {
  const none: Pulse = { line: [], marks: [], start: null, end: null, low: null, high: null }
  if (!legs.length || !(now > start)) return none
  // start where the first leg's history does, so a long-saved parlay doesn't open on a flat line of guesses
  const firsts = legs.map((l) => l.points[0]?.[0]).filter((x): x is number => x != null)
  const from = Math.max(start, firsts.length ? Math.min(...firsts) : start)
  const line: PricePoint[] = []
  const push = (t: number, last: boolean) => {
    let p = 1
    for (const l of legs) {
      const v = last && !l.result && l.chance != null ? l.chance : legAt(l, t, now)
      if (v == null) return
      p *= v
    }
    line.push([t, Math.round(p * 10000) / 10000])
  }
  for (let t = Math.ceil(from / step) * step; t < now; t += step) push(t, false)
  push(now, true) // ends on the prices now, so it matches the legs below it
  if (line.length < 2) return none
  const marks: Mark[] = legs
    .filter((l) => l.result && l.points.length)
    .map((l) => ({ t: l.points[l.points.length - 1][0], label: `${shortLeg(l)} ${l.result === 'won' ? 'won' : 'lost'}`, won: l.result === 'won' }))
    .filter((m) => m.t >= line[0][0] && m.t <= now)
    .sort((a, b) => a.t - b.t)
  let low = line[0], high = line[0]
  for (const p of line) {
    if (p[1] < low[1]) low = p
    if (p[1] > high[1]) high = p
  }
  return { line, marks, start: line[0], end: line[line.length - 1], low, high }
}
