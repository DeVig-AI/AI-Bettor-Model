// Research: power rankings, team and player stats from the stats bot (stats/<sport>/index.json and team_<CODE>.json).
// The files describe their own columns ([label, field, decimals, signed]), so every sport renders from the same code.
// Counts, not chances: nothing here is a pick.
import { useQuery } from '@tanstack/react-query'

const RAW = 'https://raw.githubusercontent.com/DeVig-AI/AI-Bettor-Model/main/stats/'
export const RS_SPORTS = ['NBA', 'NHL', 'NFL', 'WNBA', 'CFB', 'MLB'] as const

// [label, field, decimals?, signed?]
export type Col = [string, string, number?, boolean?]
export type HitStat = [string, string, string[]] // [key, label, log columns summed]
export type RsTeamRow = {
  code: string; name: string; color?: string | null; rank: number; rating: number | null
  record?: string; last10?: string; streak?: string
}
export type RsIndex = {
  generated_at: string; sport: string; season: string; last_season: string; season_year?: number
  rank_last?: string; rating_note: string; source: string
  log_cols: string[]; search_cols?: string[]; team_rows?: Col[]
  roster_cols?: Col[]; player_cols?: Col[]; player_cols_def?: Col[]
  player_note?: string; player_note_def?: string
  log_show?: [string, string][]; log_show_def?: [string, string][]
  hit_stats?: HitStat[]; hit_stats_def?: HitStat[]
  roster_units?: [string, string[]][]; group_names?: Record<string, string>; group_cols?: Record<string, Col[]>
  teams: RsTeamRow[]
  players: (string | number | null)[][] // [id, name, team, pos, ...search cols, season_year]
}
type Stats = Record<string, number | string | null>
export type RsPlayer = {
  id: string | number; name: string; pos?: string; num?: string | number | null; grp?: string
  this?: Stats | null; last?: Stats | null; log?: (string | number | null)[][]
}
export type RsTeam = {
  generated_at: string; code: string; name: string; color?: string | null; rank: number; rating: number | null
  season: string; last_season: string; season_year?: number
  this?: Stats | null; last?: Stats | null; ranks?: Record<string, number>
  games?: (string | number | null)[][] // [date, opp, H/A, us, them, W/L, R/P, season, note?]
  players?: RsPlayer[]
}

const tick = () => Math.floor(Date.now() / 6e5) // the bot rebuilds during the day; read again after 10 minutes
async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${RAW}${path}?t=${tick()}`)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}
const ALIAS: Record<string, Record<string, string>> = { CFB: { AFA: 'AF', BUFF: 'BUF' } }
const teamPath = (sport: string, code: string) =>
  `${sport.toLowerCase()}/team_${String(ALIAS[sport]?.[code] ?? code).toUpperCase().replace(/[^A-Z0-9]/g, '_')}.json`

export const rsIndexQuery = (sport: string) =>
  ({ queryKey: ['rs_index', sport], queryFn: () => get<RsIndex>(`${sport.toLowerCase()}/index.json`), staleTime: 6e5 })
export function useRsIndex(sport: string) {
  return useQuery(rsIndexQuery(sport))
}
// a stats file's team code -> the code the games data uses (they differ for a few college teams)
export const gameCode = (sport: string, code: string) =>
  Object.entries(ALIAS[sport] ?? {}).find(([, v]) => v === code)?.[0] ?? code
export function useRsTeam(sport: string, code: string) {
  return useQuery({ queryKey: ['rs_team', sport, code], queryFn: () => get<RsTeam>(teamPath(sport, code)), staleTime: 6e5, enabled: !!code })
}

// Team colours: the stats files carry most; the NFL's come from here.
const NFL_COLORS: Record<string, string> = {
  ARI: '#97233F', ATL: '#A71930', BAL: '#241773', BUF: '#00338D', CAR: '#0085CA', CHI: '#0B162A', CIN: '#FB4F14', CLE: '#311D00',
  DAL: '#003594', DEN: '#FB4F14', DET: '#0076B6', GB: '#203731', HOU: '#03202F', IND: '#002C5F', JAX: '#006778', KC: '#E31837',
  LV: '#000000', LAC: '#0080C6', LA: '#003594', MIA: '#008E97', MIN: '#4F2683', NE: '#002244', NO: '#D3BC8D', NYG: '#0B2265',
  NYJ: '#125740', PHI: '#004C54', PIT: '#FFB612', SF: '#AA0000', SEA: '#002244', TB: '#D50A0A', TEN: '#0C2340', WAS: '#5A1414',
}
export function teamColor(sport: string, code: string, own?: string | null) {
  const c = own && /^#[0-9a-f]{6}$/i.test(own) ? own : sport === 'NFL' ? NFL_COLORS[code] : null
  return c ?? '#3a3d45'
}
// dark enough for white text? very light colours get a dark scrim instead
export function isLight(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
  return 0.299 * r + 0.587 * g + 0.114 * b > 160
}

export const rsNum = (v: unknown, d = 1) => (v == null || v === '' ? '—' : Number(v).toFixed(d))
export const rsSigned = (v: unknown) => {
  if (v == null) return '—'
  const n = Number(v)
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(1)}`
}
export const rsCell = (v: unknown, c: Col) =>
  (c[3] ? rsSigned(v) : c[2] == null ? (v == null ? '—' : String(v)) : rsNum(v, c[2])).replace(/(\d)-(\d)/g, '$1–$2')
export const rsShort = (label: string) => (label.includes('-') ? label.replace(/^20/, '').replace('-', '–') : label)
export const rsDate = (d: unknown) => {
  const p = String(d).split('-')
  return `${+p[1]}/${+p[2]}`
}
export const seasonYear = (f: { season_year?: number; season: string }) => f.season_year || parseInt(f.season.slice(0, 4), 10) + 1
export const logIdx = (idx: RsIndex) => Object.fromEntries(idx.log_cols.map((c, i) => [c, i])) as Record<string, number>
export const ordinal = (n: number) => {
  const v = n % 100, x = ['th', 'st', 'nd', 'rd']
  return n + (x[(v - 20) % 10] || x[v] || x[0])
}
export const isDefense = (idx: RsIndex, grp?: string) => !!(grp && idx.roster_units?.[1]?.[1].includes(grp) && idx.player_cols_def)

// one game's value for a hit stat (several columns summed); null when any is missing
export function statValue(g: (string | number | null)[], L: Record<string, number>, cols: string[]) {
  let v = 0
  for (const c of cols) {
    const y = g[L[c]]
    if (y == null) return null
    v += Number(y)
  }
  return v
}
export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

// a name from Kalshi's prop lines → the stats bot's player (id and team), when the names match
export function useRsPlayerLink(sport: string, name: string) {
  const ok = (RS_SPORTS as readonly string[]).includes(sport)
  const { data } = useQuery({
    queryKey: ['rs_index', sport],
    queryFn: () => get<RsIndex>(`${sport.toLowerCase()}/index.json`),
    staleTime: 6e5,
    enabled: ok,
  })
  if (!data) return null
  const n = norm(name)
  const p = data.players.find((x) => norm(String(x[1])) === n)
  return p ? { sport, team: String(p[2]), id: String(p[0]) } : null
}
