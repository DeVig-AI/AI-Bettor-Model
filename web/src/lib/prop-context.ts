// What makes tonight different from a usual night for one player prop, from the stats bot's game logs: this season's
// hit rate, home vs away, past games against tonight's opponent, how much he's being used lately (targets, carries,
// minutes, ice time), and how many yards tonight's NFL opponent gives up through the air and on the ground.
// Pure (no imports) so node tests can load it. Counts only; none of this is a pick.

export type Log = (string | number | null)[] // one game, columns per the index's log_cols, newest first in a player's log
export type LogPlayer = { name: string; pos?: string; log: Log[] }
export type Game = { date: string; opp: string; ha: string; season: number; v: number }

// a game counts only when he played (the NFL logs list games played only)
const PLAYED: Record<string, string> = { NBA: 'min', NHL: 'toi' }
const sum = (g: Log, L: Record<string, number>, cols: string[]) => {
  let v = 0
  for (const c of cols) {
    if (L[c] == null || g[L[c]] == null) return null
    v += Number(g[L[c]])
  }
  return v
}

// every played game with this stat's value, newest first
export function gamesOf(log: Log[], sport: string, L: Record<string, number>, cols: string[]): Game[] {
  const pc = PLAYED[sport]
  const out: Game[] = []
  for (const g of log) {
    if (pc && L[pc] != null && !(Number(g[L[pc]]) > 0)) continue
    const v = sum(g, L, cols)
    if (v == null) continue
    out.push({ date: String(g[L.date]), opp: String(g[L.opp]), ha: String(g[L.ha]), season: Number(g[L.season]), v })
  }
  return out
}

export type Rate = { hit: number; n: number }
const rate = (gs: Game[], line: number): Rate => ({ hit: gs.filter((g) => g.v > line).length, n: gs.length })

export type Splits = {
  season: Rate // this season
  venue: Rate & { home: boolean; since: string | null } // at home (or away) like tonight, every logged game
  vsOpp: Game[] // last meetings with tonight's opponent, newest first (up to 3)
}
export function splits(gs: Game[], line: number, season: number | null, opp: string, home: boolean): Splits {
  const venue = gs.filter((g) => g.ha === (home ? 'H' : 'A'))
  return {
    season: rate(season == null ? [] : gs.filter((g) => g.season === season), line),
    venue: { ...rate(venue, line), home, since: venue.length ? venue[venue.length - 1].date : null },
    vsOpp: gs.filter((g) => g.opp === opp).slice(0, 3),
  }
}

// What usage means per sport and stat: NFL targets / carries / pass attempts, NBA minutes, NHL ice time
export function usageCols(sport: string, stat: string): { cols: string[]; word: string } | null {
  if (sport === 'NBA') return { cols: ['min'], word: 'minutes' }
  if (sport === 'NHL') return { cols: ['toi'], word: 'minutes on ice' }
  if (sport !== 'NFL') return null
  if (stat.startsWith('passing') || stat === 'interceptions') return { cols: ['att'], word: 'pass attempts' }
  if (stat.startsWith('rushing')) return { cols: ['car'], word: 'carries' }
  if (stat.startsWith('receiv') || stat === 'receptions' || stat === 'longest_reception') return { cols: ['tgt'], word: 'targets' }
  if (stat === 'rush_rec_yards' || stat === 'touchdowns') return { cols: ['car', 'tgt'], word: 'touches (carries + targets)' }
  return null
}

export type Usage = {
  word: string; recent: number; recentN: number; season: number; seasonN: number
  share: { recent: number; season: number } | null // NFL: his share of the team's targets / carries
}
// recent = his last 3 NFL games (5 otherwise) against his season average; NFL also his share of the team's total
export function usage(sport: string, stat: string, me: LogPlayer, team: LogPlayer[], L: Record<string, number>, season: number | null): Usage | null {
  const u = usageCols(sport, stat)
  if (!u || season == null) return null
  const mine = gamesOf(me.log, sport, L, u.cols).filter((g) => g.season === season)
  const k = sport === 'NFL' ? 3 : 5
  if (mine.length < k + 1) return null
  const avg = (gs: Game[]) => gs.reduce((a, g) => a + g.v, 0) / gs.length
  const recent = mine.slice(0, k)
  let share: Usage['share'] = null
  if (sport === 'NFL') {
    // the team's total on each of his dates, from everyone on the roster file (players who left aren't in it, so this is close, not exact)
    const tot = new Map<string, number>()
    for (const p of team) for (const g of gamesOf(p.log, sport, L, u.cols)) if (g.season === season) tot.set(g.date, (tot.get(g.date) ?? 0) + g.v)
    const sh = (gs: Game[]) => {
      const t = gs.reduce((a, g) => a + (tot.get(g.date) ?? 0), 0)
      return t > 0 ? gs.reduce((a, g) => a + g.v, 0) / t : null
    }
    const r = sh(recent), s = sh(mine)
    if (r != null && s != null) share = { recent: r, season: s }
  }
  return { word: u.word, recent: avg(recent), recentN: recent.length, season: avg(mine), seasonN: mine.length, share }
}

// NFL: yards tonight's opponent gave up per game this season, through the air and on the ground, added up from the
// logs of the teams it played. files: each of those teams' players, keyed by team code.
export function yardsAllowed(opp: string, oppGames: Log[], files: Record<string, LogPlayer[]>, L: Record<string, number>, season: number) {
  // oppGames: the opponent's team file games [date, opp, H/A, us, them, W/L, R/P, season, note]
  let pass = 0, rush = 0, n = 0
  for (const g of oppGames) {
    if (Number(g[7]) !== season) continue
    const date = String(g[0]), them = files[String(g[1])]
    if (!them) continue
    let p = 0, r = 0, seen = false
    for (const pl of them) for (const x of pl.log) {
      if (String(x[L.date]) !== date || String(x[L.opp]) !== opp) continue
      seen = true
      p += Number(x[L.pass_yds] ?? 0)
      r += Number(x[L.rush_yds] ?? 0)
    }
    if (seen) { pass += p; rush += r; n++ }
  }
  return n ? { pass: pass / n, rush: rush / n, n } : null
}
