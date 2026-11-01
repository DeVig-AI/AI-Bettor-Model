import { useQuery } from '@tanstack/react-query'
import type { GameRow } from './devig'
import { normName } from './headshots'
import { clockSecs } from './pace-math'
import { type RsPlayer, type RsTeam, rsIndexQuery, useRsTeam } from './research'

// The wrap-up of a game: what actually happened, read from ESPN's box score and play-by-play, next to what DeVig
// expected. Players are measured against their own recent games (from DeVig's stats files), so "a big night" means
// big for that player, not just a big number. Display only: no model reads this.

const PATH: Record<string, string> = {
  NFL: 'football/nfl', CFB: 'football/college-football', NBA: 'basketball/nba', WNBA: 'basketball/wnba', NHL: 'hockey/nhl', MLB: 'baseball/mlb',
}

type Side = 'away' | 'home'
export type Raw = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

export type WrapPlayer = {
  side: Side; team: string; name: string; pid: string; good: boolean; weight: number; text: string
}
export type WrapTeam = { side: Side; team: string; good: boolean; weight: number; text: string }
export type Wrap = {
  final: boolean
  winner: Side | null
  away: number; home: number
  swing: { text: string; when: string; side: Side; from: number; to: number } | null // the play that moved the win chance most
  forGood: { text: string; when: string } | null // the score after which the winner never trailed or tied again
  players: WrapPlayer[]
  teams: WrapTeam[]
}

// ---------- reading ESPN's summary ----------
export function useSummary(row: GameRow | null) {
  const path = row ? PATH[row.sport] : undefined // only sports /api/live serves
  const eid = row?.id.split('|')[1]
  const on = !!row && !!path && !!eid && row.state !== 'pre'
  return useQuery({
    queryKey: ['espn_summary', row?.sport, eid],
    queryFn: async () => {
      // through DeVig's /api/live, which trims ESPN's summary (it's ~1 MB with the full play-by-play)
      const r = await fetch(`/api/live?sport=${row!.sport.toLowerCase()}&event=${eid}&wrap=1`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return ((await r.json()) as { wrap: Raw }).wrap
    },
    enabled: on,
    staleTime: row?.state === 'post' ? 30 * 6e4 : 6e4,
    refetchInterval: row?.state === 'in' ? 6e4 : false,
  })
}

export const num = (s: unknown): number | null => {
  if (s == null) return null
  const n = parseFloat(String(s).replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : null
}
export const first = (s: unknown): number | null => num(String(s ?? '').split(/[-/]/)[0]) // "4-28" -> 4, "16-44" -> 16
const second = (s: unknown): number | null => num(String(s ?? '').split(/[-/]/)[1])

export type Box = { side: Side; id: string; name: string; s: Record<string, string> }

export function sideMap(sum: Raw): Record<string, Side> {
  const out: Record<string, Side> = {}
  for (const c of sum.header?.competitions?.[0]?.competitors ?? []) out[String(c.team?.id)] = c.homeAway
  return out
}

export function boxPlayers(sum: Raw, sides: Record<string, Side>): Box[] {
  const byId = new Map<string, Box>()
  for (const t of sum.boxscore?.players ?? []) {
    const side = sides[String(t.team?.id)]
    if (!side) continue
    for (const g of t.statistics ?? []) {
      const keys: string[] = g.keys ?? []
      const grp = g.name ? `${g.name}.` : ''
      for (const a of g.athletes ?? []) {
        const id = String(a.athlete?.id ?? '')
        if (!id || !a.stats?.length) continue
        const b: Box = byId.get(id) ?? { side, id, name: a.athlete?.displayName ?? '', s: {} }
        keys.forEach((k, i) => (b.s[grp + k] = a.stats[i]))
        byId.set(id, b)
      }
    }
  }
  return [...byId.values()]
}

function teamStats(sum: Raw, sides: Record<string, Side>): Record<Side, Record<string, string>> {
  const out: Record<Side, Record<string, string>> = { away: {}, home: {} }
  for (const t of sum.boxscore?.teams ?? []) {
    const side: Side | undefined = t.homeAway ?? sides[String(t.team?.id)]
    if (!side) continue
    for (const x of t.statistics ?? []) if (!(x.name in out[side])) out[side][x.name] = x.displayValue
  }
  return out
}

function allPlays(sum: Raw): Raw[] {
  if (sum.plays?.length) return sum.plays
  return (sum.drives?.previous ?? []).flatMap((d: Raw) => d.plays ?? [])
}

const when = (p: Raw, sport: string) => {
  const n = p.period?.number
  const per = !n ? '' : sport === 'NHL' ? (n > 3 ? 'OT' : `P${n}`) : n > 4 ? 'OT' : `Q${n}`
  return [per, p.clock?.displayValue].filter(Boolean).join(' ')
}

// ---------- what counts as a big night, by sport ----------
// box: ESPN's key; log: the stats file's game-log column; verb: how to say it; up/down: how far from the player's
// usual counts as notable; floor: only call a quiet night quiet if the player usually does at least this much;
// at: a number that's notable on its own (no average needed); bad: more of it hurts their team.
// min: a big jump from a small usual only counts if the night itself was big (a bench player's 12 points isn't news)
type Spec = { box: string; log?: string; verb: (v: number) => string; up?: number; min?: number; down?: number; floor?: number; at?: number; bad?: boolean; read?: (s: string) => number | null }
const pl = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const FOOTBALL: Spec[] = [
  { box: 'passing.passingYards', log: 'pass_yds', verb: (v) => `threw for ${v} yards`, up: 80, min: 250, down: 80, floor: 150 },
  { box: 'passing.passingTouchdowns', log: 'pass_td', verb: (v) => `threw ${pl(v, 'touchdown')}`, at: 4 },
  { box: 'passing.interceptions', verb: (v) => `threw ${pl(v, 'interception')}`, at: 2, bad: true },
  { box: 'rushing.rushingYards', log: 'rush_yds', verb: (v) => `ran for ${v} yards`, up: 55, min: 90, down: 45, floor: 55 },
  { box: 'rushing.rushingTouchdowns', log: 'rush_td', verb: (v) => `ran in ${pl(v, 'touchdown')}`, at: 2 },
  { box: 'receiving.receivingYards', log: 'rec_yds', verb: (v) => `caught passes for ${v} yards`, up: 55, min: 90, down: 45, floor: 55 },
  { box: 'receiving.receivingTouchdowns', log: 'rec_td', verb: (v) => `caught ${pl(v, 'touchdown')}`, at: 2 },
  { box: 'defensive.sacks', log: 'sk', verb: (v) => `had ${pl(v, 'sack')}`, at: 2 },
  { box: 'interceptions.interceptions', log: 'int_d', verb: (v) => `picked off ${pl(v, 'pass', 'passes')}`, at: 2 },
  { box: 'fumbles.fumblesLost', verb: (v) => `lost ${pl(v, 'fumble')}`, at: 2, bad: true },
]
const BASKETBALL: Spec[] = [
  { box: 'points', log: 'pts', verb: (v) => `scored ${v}`, up: 10, min: 22, down: 10, floor: 15 },
  { box: 'rebounds', log: 'reb', verb: (v) => `grabbed ${v} rebounds`, up: 7, min: 12, at: 15 },
  { box: 'assists', log: 'ast', verb: (v) => `had ${v} assists`, up: 6, min: 9, at: 13 },
  { box: 'threePointFieldGoalsMade-threePointFieldGoalsAttempted', log: 'fg3m', verb: (v) => `made ${v} threes`, up: 4, min: 5, at: 7, read: first },
  { box: 'turnovers', log: 'tov', verb: (v) => `turned it over ${v} times`, at: 7, bad: true },
]
const HOCKEY: Spec[] = [
  { box: 'goals', log: 'g', verb: (v) => (v >= 3 ? `scored a hat trick (${v} goals)` : `scored ${v} goals`), at: 2 },
  { box: 'assists', log: 'a', verb: (v) => `had ${v} assists`, at: 3 },
  { box: 'shotsTotal', log: 'sog', verb: (v) => `put ${v} shots on goal`, up: 4, min: 6, at: 8 },
  { box: 'goalies.goalsAgainst', verb: (v) => `gave up ${v} goals`, at: 5, bad: true },
  { box: 'goalies.saves', verb: (v) => `made ${v} saves`, at: 38 },
]
const SPECS: Record<string, Spec[]> = { NFL: FOOTBALL, CFB: FOOTBALL, NBA: BASKETBALL, WNBA: BASKETBALL, CBB: BASKETBALL, NHL: HOCKEY }

// NHL groups skaters by position; look the key up in any group
const stat = (b: Box, key: string) => b.s[key] ?? Object.entries(b.s).find(([k]) => k.endsWith(`.${key}`))?.[1]

const fmtAvg = (v: number) => (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10)

// how much of the game is played, 0..1, from ESPN's status (period + seconds left in it); null once it's over
const GAME: Record<string, [number, number]> = { NFL: [4, 900], CFB: [4, 900], NBA: [4, 720], WNBA: [4, 600], CBB: [2, 1200], NHL: [3, 1200] }
export function playedShare(sport: string, status: Raw, final: boolean): number | null {
  if (final) return null
  const g = GAME[sport], per = num(status?.period), left = clockSecs(status)
  if (!g || !per) return 0
  const [n, len] = g
  if (per > n) return 1 // overtime
  return Math.min(1, Math.max(0, ((per - 1) * len + (len - Math.min(len, left ?? len))) / (n * len)))
}

// played: the share of the game played so far (null when it's over), so a live game is judged against the player's
// usual pace by now, not a full game: 24 yards at halftime is behind a 225-yard passer's pace, not "201 fewer than usual"
function playerFactors(sport: string, box: Box[], teams: Record<Side, RsTeam | undefined>, cols: string[], day: string, code: Record<Side, string>, played: number | null = null): WrapPlayer[] {
  const specs = SPECS[sport]
  if (!specs) return []
  const at = Object.fromEntries(cols.map((c, i) => [c, i]))
  const out: WrapPlayer[] = []
  for (const b of box) {
    const roster = teams[b.side]?.players ?? []
    const me: RsPlayer | undefined =
      roster.find((p) => String(p.id) === b.id || String((p as { espn?: unknown }).espn ?? '') === b.id) ??
      roster.find((p) => normName(p.name) === normName(b.name))
    // the player's games before this one, newest first (the stats file may already hold tonight)
    const before = (me?.log ?? []).filter((g) => String(g[at.date]) < day).slice(0, 15)
    let best: WrapPlayer | null = null
    for (const sp of specs) {
      const raw = stat(b, sp.box)
      const v = raw == null ? null : (sp.read ?? num)(raw)
      if (v == null) continue
      const hist = sp.log && at[sp.log] != null ? before.map((g) => Number(g[at[sp.log!]])).filter(Number.isFinite) : []
      const avg = hist.length >= 3 ? hist.reduce((a, x) => a + x, 0) / hist.length : null
      let weight = 0, good = !sp.bad, why = ''
      if (played != null) {
        // live: nothing about pace until a quarter of the game is in; "behind" waits for halftime
        const pace = avg == null ? null : avg * played
        if (avg != null && sp.up && played >= 0.25 && v >= avg && v - avg >= sp.up * 0.25 && v >= (sp.min ?? 0) * 0.5) {
          weight = (v - pace!) / sp.up
          why = ` so far, already past their usual ${fmtAvg(avg)} for a whole game`
        } else if (avg != null && sp.up && played >= 0.25 && v - pace! >= sp.up * played && v >= (sp.min ?? 0) * played) {
          weight = (v - pace!) / sp.up
          why = ` so far, ahead of their usual pace (${fmtAvg(avg)} a game, about ${fmtAvg(pace!)} by now)`
        } else if (avg != null && sp.down && sp.floor && played >= 0.5 && avg >= sp.floor && pace! - v >= sp.down * played) {
          weight = (pace! - v) / sp.down
          good = false
          why = ` so far, behind their usual pace (${fmtAvg(avg)} a game, about ${fmtAvg(pace!)} by now)`
        } else if (sp.at && v >= sp.at) {
          weight = v / sp.at
          why = ' so far'
        } else continue
      } else if (avg != null && sp.up && v - avg >= sp.up && v >= (sp.min ?? 0)) {
        weight = (v - avg) / sp.up
        const high = hist.length >= 5 && v > Math.max(...hist)
        why = `, ${Math.round(v - avg)} more than usual (${fmtAvg(avg)})${high ? `, the most in their last ${hist.length + 1} games` : ''}`
      } else if (avg != null && sp.down && sp.floor && avg >= sp.floor && avg - v >= sp.down) {
        weight = (avg - v) / sp.down
        good = false
        why = `, ${Math.round(avg - v)} fewer than usual (${fmtAvg(avg)})`
      } else if (sp.at && v >= sp.at) {
        weight = v / sp.at
        why = avg != null && !sp.bad && avg < v ? ` (usually ${fmtAvg(avg)})` : ''
      } else continue
      if (!best || weight > best.weight) best = { side: b.side, team: code[b.side], name: b.name, pid: b.id, good, weight, text: `${b.name} ${sp.verb(v)}${why}.` }
    }
    if (best) out.push(best)
  }
  return out.sort((a, b) => b.weight - a.weight)
}

function teamFactors(sport: string, ts: Record<Side, Record<string, string>>, code: Record<Side, string>): WrapTeam[] {
  const out: WrapTeam[] = []
  const both = (key: string, read: (s: unknown) => number | null = num) => [read(ts.away[key]), read(ts.home[key])] as const
  const push = (side: Side, good: boolean, weight: number, text: string) => out.push({ side, team: code[side], good, weight, text })
  const other = (s: Side): Side => (s === 'away' ? 'home' : 'away')
  if (sport === 'NFL' || sport === 'CFB') {
    const [ta, th] = both('turnovers')
    if (ta != null && th != null && Math.abs(ta - th) >= 2) {
      const s: Side = ta > th ? 'away' : 'home'
      push(s, false, Math.abs(ta - th) / 2, `${code[s]} turned it over ${pl(Math.max(ta, th), 'time')}; ${code[other(s)]} ${Math.min(ta, th) ? `only ${Math.min(ta, th)}` : 'never did'}.`)
    }
    const [sa, sh] = both('sacksYardsLost', first)
    for (const [s, v] of [['away', sa], ['home', sh]] as const) if (v != null && v >= 4) push(s, false, v / 4, `${code[s]}'s line gave up ${v} sacks.`)
    const [ra, rh] = both('rushingYards')
    if (ra != null && rh != null && Math.abs(ra - rh) >= 80) {
      const s: Side = ra > rh ? 'away' : 'home'
      push(s, true, Math.abs(ra - rh) / 80, `${code[s]} ran for ${Math.max(ra, rh)} yards to ${code[other(s)]}'s ${Math.min(ra, rh)}.`)
    }
    const [da, dh] = [first(ts.away.thirdDownEff), first(ts.home.thirdDownEff)]
    const [aa, ah] = [second(ts.away.thirdDownEff), second(ts.home.thirdDownEff)]
    if (da != null && dh != null && aa && ah && aa >= 5 && ah >= 5) {
      const pa = da / aa, ph = dh / ah
      if (Math.abs(pa - ph) >= 0.3) {
        const s: Side = pa > ph ? 'away' : 'home'
        push(s, true, Math.abs(pa - ph) / 0.3, `On third down ${code[s]} went ${s === 'away' ? da : dh} of ${s === 'away' ? aa : ah}; ${code[other(s)]} ${s === 'away' ? dh : da} of ${s === 'away' ? ah : aa}.`)
      }
    }
  } else if (sport === 'NBA' || sport === 'WNBA' || sport === 'CBB') {
    const K = 'threePointFieldGoalsMade-threePointFieldGoalsAttempted'
    const m = [first(ts.away[K]), first(ts.home[K])], a = [second(ts.away[K]), second(ts.home[K])]
    if (m[0] != null && m[1] != null && a[0] && a[1] && a[0] >= 15 && a[1] >= 15) {
      const p = [m[0] / a[0], m[1] / a[1]]
      if (Math.abs(p[0] - p[1]) >= 0.12) {
        const i = p[0] > p[1] ? 0 : 1, s: Side = i ? 'home' : 'away', j = 1 - i
        push(s, true, Math.abs(p[0] - p[1]) / 0.12, `${code[s]} made ${m[i]} of ${a[i]} threes (${Math.round(p[i] * 100)}%); ${code[other(s)]} ${m[j]} of ${a[j]} (${Math.round(p[j] * 100)}%).`)
      }
    }
    const [toa, toh] = both('totalTurnovers')
    if (toa != null && toh != null && Math.abs(toa - toh) >= 7) {
      const s: Side = toa > toh ? 'away' : 'home'
      push(s, false, Math.abs(toa - toh) / 7, `${code[s]} turned it over ${Math.max(toa, toh)} times to ${code[other(s)]}'s ${Math.min(toa, toh)}.`)
    }
    const [rba, rbh] = both('totalRebounds')
    if (rba != null && rbh != null && Math.abs(rba - rbh) >= 10) {
      const s: Side = rba > rbh ? 'away' : 'home'
      push(s, true, Math.abs(rba - rbh) / 10, `${code[s]} outrebounded ${code[other(s)]} ${Math.max(rba, rbh)} to ${Math.min(rba, rbh)}.`)
    }
    const F = 'freeThrowsMade-freeThrowsAttempted'
    const [fa, fh] = [second(ts.away[F]), second(ts.home[F])]
    if (fa != null && fh != null && Math.abs(fa - fh) >= 12) {
      const s: Side = fa > fh ? 'away' : 'home'
      push(s, true, Math.abs(fa - fh) / 12, `${code[s]} got to the line ${Math.max(fa, fh)} times; ${code[other(s)]} ${Math.min(fa, fh)}.`)
    }
  } else if (sport === 'NHL') {
    const [sa, sh] = both('shotsTotal')
    if (sa != null && sh != null && Math.abs(sa - sh) >= 12) {
      const s: Side = sa > sh ? 'away' : 'home'
      push(s, true, Math.abs(sa - sh) / 12, `${code[s]} outshot ${code[other(s)]} ${Math.max(sa, sh)} to ${Math.min(sa, sh)}.`)
    }
    const [pa, ph] = both('powerPlayGoals')
    for (const [s, v] of [['away', pa], ['home', ph]] as const)
      if (v != null && v >= 2) push(s, true, v / 2, `${code[s]} scored ${v} power-play goals (${ts[s].powerPlayGoals} of ${ts[s].powerPlayOpportunities} chances).`)
  }
  return out.sort((a, b) => b.weight - a.weight)
}

const BIG = /intercept|fumble|turnover|downs|blocked|safety|steal/i
// play-by-play text without the broadcast shorthand: "(07:50) Shotgun #4 M.Fletcher Jr. rush ..., clock 07:49" -> "M.Fletcher Jr. rush ..."
const tidy = (t: string) =>
  t.replace(/^\(\d+:\d+\)\s*/, '').replace(/\((?:Shotgun|No Huddle[^)]*)\)\s*/gi, '').replace(/^(?:No Huddle-)?Shotgun\s+/i, '')
    .replace(/#\d+\s*/g, '').replace(/,?\s*clock \d+:\d+/gi, '').replace(/\s*\((?:H|LS):[^)]*\)/g, '').replace(/\s+/g, ' ').trim()

function swingPlay(sum: Raw, sport: string): Wrap['swing'] {
  const wp: Raw[] = sum.winprobability ?? []
  if (wp.length < 5) return null
  const plays = new Map(allPlays(sum).map((p) => [String(p.id), p]))
  let best: Wrap['swing'] = null, size = 0
  for (let i = 1; i < wp.length; i++) {
    const from = wp[i - 1].homeWinPercentage, to = wp[i].homeWinPercentage
    const p = plays.get(String(wp[i].playId))
    if (from == null || to == null || !p?.text || Math.abs(to - from) <= size) continue
    if (!(p.scoringPlay || BIG.test(p.text) || BIG.test(p.type?.text ?? ''))) continue
    size = Math.abs(to - from)
    best = { text: tidy(p.text), when: when(p, sport), side: to > from ? 'home' : 'away', from, to }
  }
  return size >= 0.08 ? best : null
}

function forGoodPlay(sum: Raw, sport: string, winner: Side | null): Wrap['forGood'] {
  if (!winner) return null
  const scores = (sum.scoringPlays?.length ? sum.scoringPlays : allPlays(sum).filter((p) => p.scoringPlay)) as Raw[]
  let mark: Raw | null = null
  for (const p of scores) {
    const lead = winner === 'home' ? p.homeScore - p.awayScore : p.awayScore - p.homeScore
    if (lead > 0 && !mark) mark = p
    else if (lead <= 0) mark = null
  }
  return mark?.text ? { text: tidy(mark.text), when: when(mark, sport) } : null
}

const dayOf = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(iso))

export function useWrap(row: GameRow | null): { wrap: Wrap | null; isLoading: boolean } {
  const q = useSummary(row)
  const live = !!row && row.state !== 'pre'
  const want = live && !!SPECS[row!.sport]
  const idx = useQuery({ ...rsIndexQuery(row?.sport ?? ''), enabled: want })
  const ta = useRsTeam(row?.sport ?? '', want ? row!.away : '')
  const th = useRsTeam(row?.sport ?? '', want ? row!.home : '')
  if (!row || !q.data) return { wrap: null, isLoading: q.isLoading }
  return { isLoading: false, wrap: buildWrap(row, q.data, idx.data?.log_cols ?? [], { away: ta.data, home: th.data }) }
}

// the wrap itself, from ESPN's summary and both teams' stats files (pure, so it can be checked outside the app)
export function buildWrap(row: Pick<GameRow, 'sport' | 'away' | 'home' | 'kickoff' | 'state' | 'awayScore' | 'homeScore'>, sum: Raw, cols: string[], teams: Record<Side, RsTeam | undefined>): Wrap {
  const sides = sideMap(sum)
  const code: Record<Side, string> = { away: row.away, home: row.home }
  const comp = sum.header?.competitions?.[0]
  const score = (s: Side) => num(comp?.competitors?.find((c: Raw) => c.homeAway === s)?.score) ?? (s === 'away' ? row.awayScore : row.homeScore) ?? 0
  const away = score('away'), home = score('home')
  const final = comp?.status?.type?.completed ?? row.state === 'post'
  const played = playedShare(row.sport, comp?.status, final)
  const winner: Side | null = !final || away === home ? null : away > home ? 'away' : 'home'
  return {
    final, winner, away, home,
    swing: swingPlay(sum, row.sport),
    forGood: final ? forGoodPlay(sum, row.sport, winner) : null,
    players: playerFactors(row.sport, boxPlayers(sum, sides), teams, cols, dayOf(row.kickoff), code, played),
    // a quarter in, team gaps are noise (one third down, one turnover); wait until a quarter of the game is played
    teams: (played ?? 1) < 0.25 ? [] : teamFactors(row.sport, teamStats(sum, sides), code),
  }
}
