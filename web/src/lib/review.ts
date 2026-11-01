import { useQueries } from '@tanstack/react-query'
import { type GameRow, SCORE_EVERY, useGames } from './devig'
import { normName } from './headshots'
import { hexColor } from '@/components/leg-bar'
import type { KLeg, KRead } from './kalshi-link'
import { useProps } from './props'
import { type Raw, boxPlayers, first, num, sideMap } from './wrap'

// The parlay review: a Kalshi combo read leg by leg against DeVig's numbers and the games themselves. Before the games
// it grades the ticket and points at its weak spots; once they start it says what each leg needed and what actually
// happened (ESPN's box score), how the price moved, and what to take from it. Display only: no model reads this.

export type LegKind = 'game' | 'spread' | 'total' | 'prop' | 'other'
type Stat = { label: string; get: (s: Record<string, string>) => number | null; log: string[] } // log: the stats file's game-log columns, summed

// Kalshi series -> league. Longest prefixes first (KXNCAAF before anything shorter; KXWNBA isn't KXNBA).
const LEAGUES: [string, string][] = [['KXNCAAF', 'CFB'], ['KXWNBA', 'WNBA'], ['KXNFL', 'NFL'], ['KXNBA', 'NBA'], ['KXNHL', 'NHL'], ['KXMLB', 'MLB']]
const add = (...v: (number | null)[]) => (v.every((x) => x == null) ? null : v.reduce<number>((a, b) => a + (b ?? 0), 0))
const STATS: Record<string, Record<string, Stat>> = {
  football: {
    PASSYDS: { label: 'passing yards', get: (s) => num(s['passing.passingYards']), log: ['pass_yds'] },
    PASSTDS: { label: 'passing touchdowns', get: (s) => num(s['passing.passingTouchdowns']), log: ['pass_td'] },
    PASSCOMP: { label: 'completions', get: (s) => first(s['passing.completions/passingAttempts']), log: ['cmp'] },
    PASSINT: { label: 'interceptions thrown', get: (s) => num(s['passing.interceptions']), log: ['int'] },
    RSHYDS: { label: 'rushing yards', get: (s) => num(s['rushing.rushingYards']), log: ['rush_yds'] },
    RSHATT: { label: 'carries', get: (s) => num(s['rushing.rushingAttempts']), log: ['car'] },
    RECYDS: { label: 'receiving yards', get: (s) => num(s['receiving.receivingYards']), log: ['rec_yds'] },
    REC: { label: 'catches', get: (s) => num(s['receiving.receptions']), log: ['rec'] },
    TD: { label: 'touchdowns', get: (s) => add(num(s['rushing.rushingTouchdowns']), num(s['receiving.receivingTouchdowns'])) ?? 0, log: ['rush_td', 'rec_td'] },
  },
  basketball: {
    PTS: { label: 'points', get: (s) => num(s.points), log: ['pts'] },
    REB: { label: 'rebounds', get: (s) => num(s.rebounds), log: ['reb'] },
    AST: { label: 'assists', get: (s) => num(s.assists), log: ['ast'] },
    '3PT': { label: 'threes', get: (s) => first(s['threePointFieldGoalsMade-threePointFieldGoalsAttempted']), log: ['fg3m'] },
    STL: { label: 'steals', get: (s) => num(s.steals), log: ['stl'] },
    BLK: { label: 'blocks', get: (s) => num(s.blocks), log: ['blk'] },
  },
  hockey: {
    GOAL: { label: 'goals', get: (s) => num(s.goals), log: ['g'] },
    AST: { label: 'assists', get: (s) => num(s.assists), log: ['a'] },
    PTS: { label: 'points', get: (s) => add(num(s.goals), num(s.assists)), log: ['p'] },
    SOG: { label: 'shots on goal', get: (s) => num(s.shotsTotal), log: ['sog'] },
  },
}
const FAMILY: Record<string, string> = { NFL: 'football', CFB: 'football', NBA: 'basketball', WNBA: 'basketball', NHL: 'hockey' }

export type LegInfo = {
  key: string // ticker|side
  leg: KLeg
  label: string // what the leg says, in words
  sport: string | null
  kind: LegKind
  match: string | null // "26NOV01ATLTB": the date and both teams, shared by every market on that game
  date: string | null // 20261101
  teams: string | null // ATLTB
  code: string | null // the team a game or spread leg is about (Kalshi's code)
  stat: Stat | null
  player: string | null
  strike: number | null // 224.5: the leg's Yes needs more than this
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
export function parseLeg(leg: KLeg): LegInfo {
  const key = `${leg.ticker}|${leg.side}`
  const label = (leg.side === 'no' ? 'No: ' : '') + (leg.title || leg.pick).replace(/\?$/, '').replace(/^Full Game: /i, '')
  const ev = String(leg.event || leg.ticker?.split('-').slice(0, 2).join('-') || '')
  const m = /^([A-Z0-9]+)-(\d{2})([A-Z]{3})(\d{2})([A-Z][A-Z0-9]*)$/.exec(ev)
  const base: LegInfo = { key, leg, label, sport: null, kind: 'other', match: null, date: null, teams: null, code: null, stat: null, player: null, strike: null }
  if (!m) return base
  const [, series, yy, mon, dd, teams] = m
  const mi = MONTHS.indexOf(mon)
  const lg = LEAGUES.find(([p]) => series.startsWith(p))
  if (!lg || mi < 0) return base
  const rest = series.slice(lg[0].length).replace(/PROT$/, '')
  const tail = leg.ticker?.split('-').slice(2).join('-') ?? ''
  const strike = leg.strike ?? num(/(\d+(?:\.\d+)?)\+/.exec(leg.title ?? '')?.[1]) ?? null
  const out: LegInfo = {
    ...base, sport: lg[1], match: `${yy}${mon}${dd}${teams}`, date: `20${yy}${String(mi + 1).padStart(2, '0')}${dd}`, teams,
    strike: strike != null && leg.strike == null ? strike - 0.5 : strike,
  }
  if (rest === 'GAME') return { ...out, kind: 'game', code: tail || null, label: tail ? `${leg.side === 'no' ? 'No: ' : ''}${tail} to win` : label }
  if (rest === 'SPREAD') return { ...out, kind: 'spread', code: tail.replace(/\d+$/, '') || null }
  if (rest === 'TOTAL') return { ...out, kind: 'total' }
  const stat = STATS[FAMILY[lg[1]] ?? '']?.[rest]
  if (stat) return { ...out, kind: 'prop', stat, player: (leg.title ?? '').split(':')[0].trim() || null }
  return out
}

// ---------- the leg's game: on DeVig's board (with its pick), else ESPN's scoreboard for that day ----------
export type LegGame = {
  sport: string; eid: string; away: string; home: string; kickoff: string
  state: 'pre' | 'in' | 'post'; detail: string; awayScore: number | null; homeScore: number | null
  colors: { away: string; home: string } | null; ids: { away?: string; home?: string } | null
  row: GameRow | null
}
type ScoreGame = { id: string; kickoff: string; away: string; home: string; away_score: number | null; home_score: number | null; state: 'pre' | 'in' | 'post'; detail: string
  away_color?: string | null; home_color?: string | null; away_id?: string; home_id?: string }

// Kalshi and ESPN spell a few teams differently
const SYN = [['JAX', 'JAC'], ['LA', 'LAR'], ['WAS', 'WSH'], ['GSW', 'GS'], ['NOP', 'NO'], ['NYK', 'NY'], ['SAS', 'SA'], ['UTA', 'UTAH'],
  ['PHX', 'PHO'], ['BKN', 'BRK'], ['CHA', 'CHO'], ['LV', 'LVR'], ['NJ', 'NJD'], ['SJ', 'SJS'], ['MTL', 'MON'], ['CBJ', 'CLS'], ['VGK', 'VEG'], ['TB', 'TBL']]
export const codes = (c: string) => [c, ...SYN.filter((g) => g.includes(c)).flat().filter((x) => x !== c)]

export function findGame<G extends { away: string; home: string }>(teams: string, games: G[]): G | null {
  const exact = games.filter((g) => codes(g.away).some((a) => codes(g.home).some((h) => a + h === teams)))
  if (exact.length === 1) return exact[0]
  const loose = games.filter((g) => codes(g.away).some((a) => teams.startsWith(a)) || codes(g.home).some((h) => teams.endsWith(h)))
  return loose.length === 1 ? loose[0] : null
}

const LIVE_SPORTS = ['NFL', 'CFB', 'NBA', 'WNBA', 'NHL', 'MLB']
export function useLegGames(infos: LegInfo[]): { games: Record<string, LegGame | null>; loading: boolean } {
  const { rows, isLoading } = useGames()
  const onBoard = (i: LegInfo) =>
    rows.find((r) => r.sport === i.sport && r.ticker?.split('-')[1] === i.match) ??
    (i.teams ? findGame(i.teams, rows.filter((r) => r.sport === i.sport && dayKey(r.kickoff) === i.date)) : null)
  const need = [...new Set(infos.filter((i) => i.sport && i.date && LIVE_SPORTS.includes(i.sport) && !onBoard(i)).map((i) => `${i.sport}|${i.date}`))]
  const boards = useQueries({
    queries: need.map((k) => {
      const [sport, date] = k.split('|')
      return {
        queryKey: ['scores_day', sport, date],
        queryFn: async () => {
          const r = await fetch(`/api/live?sport=${sport.toLowerCase()}&date=${date}`)
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return ((await r.json()) as { games: ScoreGame[] }).games
        },
        staleTime: 10e3,
        // every 15 seconds while one of the day's games is on, otherwise once a minute
        refetchInterval: (q: { state: { data?: ScoreGame[] } }) =>
          q.state.data?.some((g) => g.state === 'in' || (g.state === 'pre' && Date.parse(g.kickoff) <= Date.now())) ? SCORE_EVERY : 6e4,
      }
    }),
  })
  const day: Record<string, ScoreGame[]> = {}
  need.forEach((k, n) => (day[k] = boards[n]?.data ?? []))
  const out: Record<string, LegGame | null> = {}
  for (const i of infos) {
    const r = onBoard(i)
    if (r) {
      out[i.key] = { sport: r.sport, eid: r.id.split('|')[1], away: r.away, home: r.home, kickoff: r.kickoff, state: r.state, detail: r.detail, awayScore: r.awayScore, homeScore: r.homeScore, row: r,
        colors: pair(r.colors?.away, r.colors?.home), ids: r.ids ?? null }
      continue
    }
    const g = i.teams && i.sport && i.date ? findGame(i.teams, day[`${i.sport}|${i.date}`] ?? []) : null
    out[i.key] = g && i.sport
      ? { sport: i.sport, eid: g.id, away: g.away, home: g.home, kickoff: g.kickoff, state: g.state, detail: g.detail, awayScore: g.away_score, homeScore: g.home_score, row: null,
        colors: pair(g.away_color, g.home_color), ids: g.away_id ? { away: g.away_id, home: g.home_id } : null }
      : null
  }
  return { games: out, loading: isLoading || boards.some((b) => b.isLoading) }
}
const pair = (a?: string | null, h?: string | null) => { const x = hexColor(a), y = hexColor(h); return x && y ? { away: x, home: y } : null }
const dayKey = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(iso)).replace(/-/g, '')

// a full game row for the wrap-up, for a game DeVig's board doesn't carry any more
export function rowOf(g: LegGame): GameRow {
  return g.row ? { ...g.row, state: g.state, awayScore: g.awayScore, homeScore: g.homeScore } : {
    id: `${g.sport}|${g.eid}`, trackKey: g.eid, sport: g.sport, away: g.away, home: g.home, awayName: g.away, homeName: g.home,
    kickoff: g.kickoff, state: g.state, detail: g.detail, awayScore: g.awayScore, homeScore: g.homeScore, ml: null, fairHome: null,
    spread: null, total: null, colors: null, ids: null, pick: null, edge: null,
  }
}

// ---------- DeVig's own chance for a leg, when it has one ----------
export type DevigView = { p: number; note: string }
export function useDevigViews(infos: LegInfo[], games: Record<string, LegGame | null>): { views: Record<string, DevigView | null>; loading: boolean } {
  const { lines, isLoading } = useProps()
  const out: Record<string, DevigView | null> = {}
  for (const i of infos) {
    let yes: DevigView | null = null
    const row = games[i.key]?.row
    const p = row?.pick
    if (i.kind === 'game' && i.code && row && p?.side && p.prob != null && p.action !== 'PASS') {
      const team = codes(row.away).includes(i.code) ? row.away : codes(row.home).includes(i.code) ? row.home : null
      if (team) yes = { p: p.side === team ? p.prob : 1 - p.prob, note: `${row.sport} model, locked pregame` }
    } else if (i.kind === 'prop' && i.leg.ticker) {
      const l = lines.find((x) => x.ticker === i.leg.ticker)
      if (l?.modelOver != null) yes = { p: l.modelOver, note: 'props model; Kalshi has beaten it on past games' }
    }
    out[i.key] = yes && i.leg.side === 'no' ? { ...yes, p: 1 - yes.p } : yes
  }
  return { views: out, loading: isLoading && infos.some((i) => i.kind === 'prop') }
}

// ---------- the grade ----------
export type Reason = { text: string; tone: 'good' | 'bad' | 'even' }
export type Grade = { letter: 'A' | 'B' | 'C' | 'D' | 'F'; score: number; summary: string; reasons: Reason[]; hit: number | null; devigHit: number | null }
export type GradeLeg = { key: string; label: string; chance: number | null; bid: number | null; ask: number | null; devig: number | null; game: string | null }

const pct = (p: number) => `${Math.round(p * 100)}%`
export const SUMMARY: Record<Grade['letter'], string> = {
  A: "A good price, and DeVig's numbers back it.",
  B: 'A fair build with something in your favor.',
  C: "A fair-ish price with nothing in your favor: you're mostly paying for the thrill.",
  D: "You're paying extra for this one, or DeVig doubts a leg.",
  F: 'Overpriced, and DeVig doubts it.',
}

export function grade(legs: GradeLeg[], comboAsk: number | null, multiplied: number | null): Grade {
  let score = 70
  const reasons: Reason[] = []
  const say = (delta: number, text: string) => { score += delta; reasons.push({ text, tone: delta > 0 ? 'good' : delta < 0 ? 'bad' : 'even' }) }
  const games = legs.map((l) => l.game).filter(Boolean)
  const sameGame = new Set(games).size < games.length

  if (comboAsk != null && multiplied) {
    const r = comboAsk / multiplied
    const cmp = `Kalshi's combo price is ${Math.round(comboAsk * 100)}¢; the legs multiplied come to ${(multiplied * 100).toFixed(multiplied < 0.1 ? 1 : 0)}¢.`
    if (sameGame) say(0, `Some legs are from the same game, so they move together and the combo price can fairly differ from the legs multiplied. ${cmp}`)
    else if (r >= 1.25) say(-20, `You'd pay ${pct(r - 1)} more than the legs multiplied together. ${cmp}`)
    else if (r >= 1.1) say(-10, `You'd pay ${pct(r - 1)} more than the legs multiplied together. ${cmp}`)
    else if (r <= 0.97) say(5, `The combo costs less than the legs multiplied together. ${cmp}`)
    else say(0, `The combo price is close to the legs multiplied together. ${cmp}`)
  }
  if (legs.length >= 5) say(-Math.min(20, (legs.length - 4) * 5), `${legs.length} legs: each one is another way to lose, and each price carries Kalshi's cut.`)
  let anyDevig = false
  for (const l of legs) {
    if (l.devig == null || l.chance == null) continue
    anyDevig = true
    const gap = l.devig - l.chance
    if (gap <= -0.03) say(-10, `DeVig gives ${l.label} ${pct(l.devig)}; Kalshi says ${pct(l.chance)}.`)
    else if (gap >= 0.03) say(7, `DeVig likes ${l.label}: ${pct(l.devig)} vs Kalshi's ${pct(l.chance)}.`)
    else say(0, `DeVig and Kalshi agree on ${l.label} (about ${pct(l.chance)}).`)
  }
  for (const l of legs) {
    if (l.bid != null && l.ask != null && l.ask - l.bid > 0.1) say(-4, `${l.label}: buy and sell are ${Math.round((l.ask - l.bid) * 100)}¢ apart, so its price is rough.`)
    if (l.chance != null && l.chance >= 0.9 && legs.length > 1) say(-2, `${l.label} (${pct(l.chance)}) adds almost no payout but can still sink the ticket.`)
  }
  if (!anyDevig) reasons.push({ tone: 'even', text: "DeVig has no model for these legs, so this grade is about the price and the build only." })
  const letter: Grade['letter'] = score >= 85 ? 'A' : score >= 75 ? 'B' : score >= 62 ? 'C' : score >= 50 ? 'D' : 'F'
  const hit = legs.every((l) => l.chance != null) ? legs.reduce((m, l) => m * (l.chance as number), 1) : null
  const devigHit = anyDevig && hit != null ? legs.reduce((m, l) => m * (l.devig ?? (l.chance as number)), 1) : null
  return { letter, score, summary: SUMMARY[letter], reasons, hit, devigHit }
}

// ---------- weak spots (legs still to play) ----------
export function weakSpots(legs: (GradeLeg & { open: boolean })[]): { text: string; key?: string }[] {
  const open = legs.filter((l) => l.open)
  const out: { text: string; key?: string }[] = []
  const w = weakestOf(open)
  if (w && open.length > 1) {
    out.push({ key: w.key, text: `${w.label} is the leg most likely to sink it: Kalshi gives it ${pct(w.chance!)}.${w.chance! < 0.5 ? " It's more likely to lose than win." : ''}` })
  }
  for (const l of open) {
    if (l.devig != null && l.chance != null && l.devig - l.chance <= -0.03 && l.key !== w?.key)
      out.push({ key: l.key, text: `DeVig is less sure about ${l.label}: ${pct(l.devig)} vs Kalshi's ${pct(l.chance)}.` })
  }
  const byGame = new Map<string, GradeLeg[]>()
  for (const l of open) if (l.game) byGame.set(l.game, [...(byGame.get(l.game) ?? []), l])
  for (const [g, ls] of byGame)
    if (ls.length > 1) out.push({ text: `${ls.map((l) => l.label).join(' and ')} are from the same game (${g}). They tend to win or lose together, so one bad game can take out several legs.` })
  return out
}
export function weakestOf<T extends { chance: number | null }>(legs: T[]): T | null {
  return legs.filter((l) => l.chance != null).sort((a, b) => a.chance! - b.chance!)[0] ?? null
}

// ---------- what each leg needed, and what happened ----------
export function legOutcome(i: LegInfo, g: LegGame | null, sum: Raw | null): string | null {
  if (!g || g.state === 'pre') return null
  const so = g.state === 'post' ? '' : ' so far'
  const a = g.awayScore, h = g.homeScore
  const score = a != null && h != null ? `${g.away} ${a} – ${g.home} ${h}` : null
  const needNo = i.leg.side === 'no'
  if (i.kind === 'game') return score ? `${g.state === 'post' ? 'Final' : 'Now'}: ${score}.` : null
  if (i.kind === 'spread' && score && i.code && i.strike != null) {
    const team = codes(g.away).includes(i.code) ? 'away' : codes(g.home).includes(i.code) ? 'home' : null
    if (!team) return `${g.state === 'post' ? 'Final' : 'Now'}: ${score}.`
    const m = team === 'away' ? a! - h! : h! - a!
    const who = team === 'away' ? g.away : g.home
    const by = m > 0 ? `${who} ${g.state === 'post' ? 'won' : 'leads'} by ${m}` : m < 0 ? `${who} ${g.state === 'post' ? 'lost' : 'trails'} by ${-m}` : `${who} is tied`
    return `${score}: ${by}${so}. ${needNo ? 'You needed them not to win' : 'Needed a win'} by more than ${i.strike}.`
  }
  if (i.kind === 'total' && score && i.strike != null) {
    const unit = g.sport === 'NHL' || g.sport === 'MLB' ? (g.sport === 'NHL' ? 'goals' : 'runs') : 'points'
    return `${score}: ${a! + h!} ${unit}${so}. ${needNo ? 'Needed' : 'Needed more than'} ${needNo ? `${i.strike} or fewer` : i.strike}.`
  }
  if (i.kind === 'prop' && i.stat && i.player && i.strike != null) {
    const target = Math.floor(i.strike) + 1
    const need = needNo ? `needed ${target - 1} or fewer` : `needed ${target}+`
    if (!sum) return null
    const who = normName(i.player)
    const p = boxPlayers(sum, sideMap(sum)).find((x) => normName(x.name) === who)
    if (!p) return g.state === 'post' ? `${i.player} isn't in ESPN's box score (${need}).` : `${i.player} hasn't shown up in the box score yet (${need}).`
    const v = i.stat.get(p.s)
    return v == null ? null : `${i.player}: ${v} ${i.stat.label}${so}; ${need}.`
  }
  return score ? `${g.state === 'post' ? 'Final' : 'Now'}: ${score}.` : null
}

// ---------- the price over time ----------
// the Yes price in the last hour that ended before kickoff (the closing price)
export function priceAt(points: { t: number; p: number }[] | undefined, iso: string): number | null {
  const t = Date.parse(iso) / 1000
  const before = (points ?? []).filter((x) => x.t <= t + 60)
  return before.length ? before[before.length - 1].p : null
}

// ---------- saved snapshots, outcomes and lessons ----------
export type Snap = {
  at: string; letter: Grade['letter']; score: number; hit: number | null; devigHit: number | null; weakest: string | null
  legs: Record<string, { chance: number | null; devig: number | null }>
}
export type Outcome = {
  at: string; won: boolean; legs: number; hit: number | null; letter: Grade['letter'] | null
  lost: { kind: LegKind; weakest: boolean; fav: boolean; doubted: boolean }[]
}

export type TakeLeg = { label: string; result: 'won' | 'lost' | null; before: number | null; kick: number | null; devig: number | null; weakest: boolean }
export function takeaways(legs: TakeLeg[], hit: number | null, letter: string | null): string[] {
  const out: string[] = []
  const lost = legs.filter((l) => l.result === 'lost')
  const n = legs.length
  for (const l of lost) {
    const p = l.kick ?? l.before
    if (l.weakest) out.push(`${l.label} was the leg flagged as most likely to sink it, and it did. Before you bet, ask whether that leg is worth its risk.`)
    else if (p != null && p >= 0.7) out.push(`${l.label} was a ${pct(p)} favorite and still lost. That happens about 1 time in ${Math.max(2, Math.round(1 / (1 - p)))}: every "safe" leg you add is another one of those chances.`)
    if (l.devig != null && p != null && l.devig - p <= -0.03) out.push(`DeVig was less sure about ${l.label} (${pct(l.devig)}) than Kalshi was (${pct(p)}).`)
    if (l.before != null && l.kick != null && l.before - l.kick >= 0.05)
      out.push(`${l.label}'s price fell from ${pct(l.before)} to ${pct(l.kick)} before the game started: news (injuries, lineups, weather) moved it. Check prices again right before kickoff.`)
  }
  for (const l of legs)
    if (l.before != null && l.kick != null && l.kick - l.before >= 0.05)
      out.push(`You got ${l.label} at ${pct(l.before)} and it was ${pct(l.kick)} by kickoff: the market came your way, which is a good sign about the read, win or lose.`)
  if (legs.every((l) => l.result === 'won'))
    out.push(`Every leg hit.${hit != null ? ` Kalshi's prices gave this about 1 in ${Math.round(1 / hit)}.` : ''}${letter ? ` A win doesn't make it a good bet; the grade (${letter}) is about the price.` : ''}`)
  else if (lost.length && hit != null && n >= 3)
    out.push(`With ${n} legs, Kalshi's prices gave this about 1 in ${Math.round(1 / hit)} to hit. Fewer legs lose less often.`)
  return out
}

export function lessons(outs: Outcome[]): string[] {
  if (!outs.length) return []
  const won = outs.filter((o) => o.won).length
  const out: string[] = []
  const exp = outs.reduce((s, o) => s + (o.hit ?? 0), 0)
  const e = exp < 1 ? exp.toFixed(1) : String(Math.round(exp))
  out.push(`${won} won, ${outs.length - won} lost${outs.every((o) => o.hit != null) ? `. Kalshi's prices expected about ${e} win${e === '1' ? '' : 's'}` : ''}.`)
  const losses = outs.filter((o) => !o.won)
  const avg = (xs: Outcome[]) => xs.reduce((s, o) => s + o.legs, 0) / xs.length
  if (won && losses.length && avg(losses) - avg(outs.filter((o) => o.won)) >= 1)
    out.push(`Your losing tickets averaged ${avg(losses).toFixed(1)} legs; the winners ${avg(outs.filter((o) => o.won)).toFixed(1)}.`)
  const sank = losses.flatMap((o) => o.lost)
  if (sank.length >= 2) {
    const NAME: Record<LegKind, string> = { game: 'Team-to-win legs', spread: 'Spread legs', total: 'Total legs', prop: 'Player props', other: 'Other legs' }
    const by = new Map<LegKind, number>()
    sank.forEach((l) => by.set(l.kind, (by.get(l.kind) ?? 0) + 1))
    const [k, c] = [...by.entries()].sort((a, b) => b[1] - a[1])[0]
    if (c >= 2) out.push(`${NAME[k]} lost ${c} of the ${sank.length} legs that sank your tickets.`)
    const weak = losses.filter((o) => o.lost.some((l) => l.weakest)).length
    if (weak) out.push(`The leg flagged as weakest is what lost ${weak} of ${losses.length} times.`)
    const fav = sank.filter((l) => l.fav).length
    if (fav) out.push(`${fav} time${fav === 1 ? '' : 's'} a leg at 70% or better lost. "Safe" legs still lose.`)
    const doubted = sank.filter((l) => l.doubted).length
    if (doubted) out.push(`${doubted} of the legs that lost ${doubted === 1 ? 'was one' : 'were ones'} DeVig was less sure about than Kalshi.`)
  }
  const graded = outs.filter((o) => o.letter)
  const good = graded.filter((o) => o.letter === 'A' || o.letter === 'B')
  if (graded.length >= 3) out.push(`${good.length} of ${graded.length} graded tickets ${good.length === 1 ? 'was' : 'were'} an A or B.`)
  return out
}

// the snapshot kept when a combo is first read, while its legs are still to play
export function snapOf(d: Extract<KRead, { kind: 'combo' }>, g: Grade, legs: GradeLeg[]): Snap {
  const w = weakestOf(legs)
  return {
    at: d.fetched_at, letter: g.letter, score: g.score, hit: g.hit, devigHit: g.devigHit, weakest: w?.key ?? null,
    legs: Object.fromEntries(legs.map((l) => [l.key, { chance: l.chance, devig: l.devig }])),
  }
}

// every leg's price history at once (one request per leg, cached five minutes)
export function useHistories(items: { key: string; ticker: string | null; from: number | null; on: boolean }[]) {
  const qs = useQueries({
    queries: items.map((x) => ({
      queryKey: ['kalshi_history', x.ticker, x.from],
      queryFn: async () => {
        const r = await fetch(`/api/kalshi?history=${encodeURIComponent(x.ticker!)}&from=${x.from}`)
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return ((await r.json()) as { points: { t: number; p: number }[] }).points
      },
      enabled: x.on && !!x.ticker && !!x.from,
      staleTime: 5 * 6e4,
    })),
  })
  const out: Record<string, { t: number; p: number }[] | undefined> = {}
  items.forEach((x, n) => (out[x.key] = qs[n]?.data))
  return out
}
