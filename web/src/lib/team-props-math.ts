// Team props math: Kalshi's ladders for one game (/api/team-props) and the stats bot's team games, side by side.
// Pure (no imports) so node tests can load it. Counts and prices only; DeVig has no model for these, so nothing here is a pick.

export type Rung = [need: number, bid: number, ask: number, ticker: string] // "need+ " is Yes, e.g. 22 = over 21.5
export type Kind = 'tt' | 'by' | 'total' // a team's points, a team's winning margin, both teams' points
export type TeamPropsData = {
  away: string; home: string // Kalshi's codes for the two teams (keys of tt and by)
  tt: Record<string, Rung[]>; by: Record<string, Rung[]>; total: Rung[]
}
export type TeamGame = (string | number | null)[] // [date, opp, H/A, us, them, W/L, R/P, season, note?], newest first

export const mid = (r: Rung) => (r[1] + r[2]) / 2

// the rung Kalshi prices closest to even, the one a row shows
export function mainRung(rs: Rung[]): Rung | null {
  return rs.reduce<Rung | null>((a, r) => (!a || Math.abs(mid(r) - 0.5) < Math.abs(mid(a) - 0.5) ? r : a), null)
}

// where Kalshi's ladder crosses 50%, as a number of points (21.5 between a 22+ at 52% and a 25+ at 36%); null when no
// rung is on each side of even
export function fifty(rs: Rung[]): number | null {
  for (let i = 1; i < rs.length; i++) {
    const a = rs[i - 1], b = rs[i], ma = mid(a), mb = mid(b)
    if (ma >= 0.5 && mb < 0.5) return a[0] - 0.5 + ((ma - 0.5) / (ma - mb)) * (b[0] - a[0])
  }
  return null
}

// what Kalshi's lines expect: the game total, who's favored and by how much, and so each team's points
export function expected(d: TeamPropsData): { total: number | null; fav: string | null; margin: number | null; pts: Record<string, number> } {
  const total = fifty(d.total)
  let fav: string | null = null, margin: number | null = null
  for (const c of [d.away, d.home]) {
    const m = fifty(d.by[c] ?? [])
    if (m != null && (margin == null || m > margin)) { fav = c; margin = m }
  }
  const pts: Record<string, number> = {}
  if (total != null && fav && margin != null) {
    const dog = fav === d.home ? d.away : d.home
    pts[fav] = (total + margin) / 2
    pts[dog] = (total - margin) / 2
  }
  return { total, fav, margin, pts }
}

// a team's games with a final score, newest first, as the number this kind of prop counts
export function valuesOf(games: TeamGame[] | undefined, kind: Kind): { v: number; season: number; ha: string; date: string; opp: string }[] {
  const out = []
  for (const g of games ?? []) {
    const us = Number(g[3]), them = Number(g[4])
    if (g[3] == null || g[4] == null || !isFinite(us) || !isFinite(them)) continue
    out.push({ v: kind === 'tt' ? us : kind === 'by' ? us - them : us + them, season: Number(g[7]), ha: String(g[2]), date: String(g[0]), opp: String(g[1]) })
  }
  return out
}

export const hitCount = (vs: number[], need: number) => vs.filter((v) => v >= need).length

// what the other team gave up in its games, counted the same way (its opponents' points, or how much it lost by)
// (for a game total, both teams' points either way)
export function allowedOf(games: TeamGame[] | undefined, kind: Kind) {
  const flip = (g: TeamGame): TeamGame => [g[0], g[1], g[2], g[4], g[3], ...g.slice(5)]
  return valuesOf((games ?? []).map(flip), kind)
}
