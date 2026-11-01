// Team logos and player headshots from ESPN's image server (the same place the schedule data comes from), resized by
// ESPN's combiner so a list of games stays light. The board uses NBA/NFL-style codes; ESPN's image paths use its own
// for a few teams, and a code ESPN doesn't know returns a blank placeholder, so the odd ones are mapped here.
const LEAGUE: Record<string, string> = { NFL: 'nfl', NBA: 'nba', MLB: 'mlb', NHL: 'nhl', WNBA: 'wnba', CFB: 'ncaa', CBB: 'ncaa' }
const ESPN_CODE: Record<string, Record<string, string>> = {
  NBA: { GSW: 'gs', NOP: 'no', NYK: 'ny', SAS: 'sa', UTA: 'utah', WAS: 'wsh' },
  NFL: { WAS: 'wsh', LA: 'lar' },
  MLB: { AZ: 'ari', CWS: 'chw' },
}
const sized = (path: string, px: number, w = px) => `https://a.espncdn.com/combiner/i?img=${path}&w=${w}&h=${px}`

// the board's team code as ESPN spells it (lowercase), e.g. NBA GSW -> gs
export const espnCode = (sport: string, code: string) => (ESPN_CODE[sport]?.[code] ?? code).toLowerCase()

// id: ESPN's team id, which college teams need (their codes aren't unique)
export function teamLogo(sport: string, code: string, id?: string | null, px = 128): string | null {
  const lg = LEAGUE[sport]
  if (!lg || !code) return null
  if (lg === 'ncaa') return id ? sized(`/i/teamlogos/ncaa/500/${id}.png`, px) : null
  return sized(`/i/teamlogos/${lg}/500/${espnCode(sport, code)}.png`, px)
}

// pid: ESPN's athlete id (the NBA props model learns from ESPN box scores, so its explanations carry it)
export function headshot(sport: string, pid?: string | null, px = 200): string | null {
  const lg = LEAGUE[sport]
  if (!lg || lg === 'ncaa' || !pid || !/^\d+$/.test(pid)) return null
  // ESPN's headshots are 600x436 (wider than tall): keep that shape, or the face gets squeezed into a square.
  // The circle crops the sides.
  return sized(`/i/headshots/${lg}/players/full/${pid}.png`, px, Math.round((px * 600) / 436))
}
