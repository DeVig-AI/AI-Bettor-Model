// DeVig data layer for v2. Reads the public export files, which the
// GitHub Actions bots commit to the repo, and joins them into one row per game for the Games board.
import { useMemo } from 'react'
import { parse as parseClock } from './game-clock'
import { useQuery } from '@tanstack/react-query'

const RAW = 'https://raw.githubusercontent.com/DeVig-AI/AI-Bettor-Model/main/'

export async function getJson<T>(path: string): Promise<T> {
  // raw.githubusercontent.com caches for up to ~5 minutes; the minute stamp lets each refresh skip the browser cache.
  const r = await fetch(`${RAW}${path}?t=${Math.floor(Date.now() / 60000)}`)
  if (!r.ok) throw new Error(`${path}: ${r.status}`)
  return r.json() as Promise<T>
}

// ---------- file shapes (only the fields v2 uses) ----------
type Moneyline = { home: number | null; away: number | null }

export type GameLine = {
  sport: string
  espn_id: string
  away: string
  home: string
  kickoff: string
  state: 'pre' | 'in' | 'post'
  detail: string
  away_score: number | null
  home_score: number | null
  names?: { away: string; home: string }
  colors?: { away: string; home: string }
  ids?: { away: string; home: string } | null // ESPN team ids
  ml?: Moneyline | null
  home_ticker?: string
  spread?: { home_point: number; home: number; away: number } | null
  total?: { line: number; over: number; under: number } | null
}

type LiveLine = {
  sport: string
  espn_id: string
  away: string
  home: string
  kickoff: string
  state: 'pre' | 'in' | 'post'
  detail: string
  away_score: number | null
  home_score: number | null
  kalshi_game?: { moneyline?: Moneyline } | null
  kalshi_line?: { team: string; points: [number, number][] } | null // one team's Kalshi chance over time (unix seconds)
}

type Decision = {
  game_id: string
  sport: string
  away_team: string
  home_team: string
  kickoff_time: string
  locked_at?: string
  decision?: {
    action: string
    prob: number | null
    side: string | null
    tier: string | null
    bar?: number | null // the college boards carry their own pick bar (CHAMPION_CHALLENGER_V3_PREREG.md)
  }
  outcome?: {
    resolved: boolean
    decision_correct: boolean | null
    home_score?: number | null
    away_score?: number | null
  }
  market_snapshot?: { moneyline_home?: number | null; moneyline_away?: number | null; spread_home?: number | null }
  inputs?: ModelInputs
  lean?: Lean // added here from the board's slate entry for the same game
}

// The model's read on every game, picked or not (the lineboard's "slate" collection)
type Lean = { side: string | null; prob: number | null; note: string | null }
type SlateDoc = {
  game_id: string
  model?: { available?: boolean; winner_side?: string | null; winner_prob?: number | null; note?: string | null }
}

// What DeVig's own model looked at when it locked (NBA Model C exports these; other sports don't yet)
export type SideInputs = {
  ppg_last10: number | null
  papg_last10: number | null
  winpct_last10: number | null
  rest_days: number | null
  back_to_back: boolean | null
  // NBA Model C + injuries only: share of the team's minutes (last 10 games) listed out/doubtful, and questionable,
  // on the official injury report at lock
  minutes_out_pct?: number | null
  minutes_q_pct?: number | null
  top_player_out?: boolean
  injury_report?: boolean
}
export type ModelInputs = {
  model_version: string
  home: SideInputs
  away: SideInputs
  market_prob_home_at_lock: number | null
  market_book: string
}

type Lineboard = {
  generated_at: string
  docs: ({ collection: 'decisions'; data: Decision } | { collection: 'slate'; data: SlateDoc } | { collection: string; data: unknown })[]
}

// How sure the model has to be before DeVig makes a pick: its tested top-50% confidence bar, the same cutoffs the
// classic app uses. Below it the game is a pass. (Checked against the boards: every pick is above, every pass below.)
// CBB: DeVig CBB v1's median confidence on its 2024-26 check; CFB's comes with its board (fixed once from 2021-24).
export const PICK_BAR: Record<string, number> = { NFL: 0.6387, NBA: 0.6083, MLB: 0.5511, CBB: 0.7259 }

// ---------- odds math (same rules as the classic app's devigTwoWay) ----------
export function impliedProb(american: number | null | undefined) {
  if (american == null || !isFinite(american) || american === 0) return null
  return american < 0 ? -american / (-american + 100) : 100 / (american + 100)
}

// Kalshi is an exchange: no built-in vig, only the bid-ask gap and the fee, so the proportional split is used
// (it matches the exchange's own mid price). Sportsbook prices would use the power method instead.
export function fairHomeProb(ml: Moneyline | null | undefined) {
  const h = impliedProb(ml?.home),
    a = impliedProb(ml?.away)
  if (h == null || a == null) return null
  return h / (h + a)
}

export function fmtAmerican(n: number | null | undefined) {
  if (n == null || !isFinite(n)) return '—'
  const r = Math.round(n)
  return r > 0 ? `+${r}` : `${r}`
}

export function fmtPct(p: number | null | undefined, digits = 0) {
  if (p == null || !isFinite(p)) return '—'
  return `${(p * 100).toFixed(digits)}%`
}

// ---------- the joined row ----------
export type Pick = {
  action: string // ML, PASS, ...
  side: string | null
  prob: number | null
  tier: string | null
  lockedAt: string | null
  correct: boolean | null
  // the price when the pick locked (American odds for the picked side) and the market's fair chance for it then
  lockedOdds: number | null
  fairAtLock: number | null
  inputs: ModelInputs | null
  // on a pass: the team the model leaned to, its chance for that team, and the bar it didn't clear
  lean: string | null
  leanProb: number | null
  bar: number | null
  note: string | null // the model's own description (what it looks at)
}

export type GameRow = {
  id: string
  trackKey: string // ★ Track key, shared with the classic app (the pick's game_id, else the ESPN id)
  sport: string
  away: string
  home: string
  awayName: string
  homeName: string
  kickoff: string
  state: 'pre' | 'in' | 'post'
  detail: string
  awayScore: number | null
  homeScore: number | null
  ml: Moneyline | null
  fairHome: number | null
  spread: GameLine['spread']
  total: GameLine['total']
  colors: { away: string; home: string } | null
  ids: { away: string; home: string } | null // ESPN team ids (for logos)
  ticker?: string | null // Kalshi's market for the home team (KXNBAGAME-26OCT31PHICHA-CHA): its event ties a Kalshi leg to this game
  pick: Pick | null
  // DeVig's chance for its side minus Kalshi's fair chance for that side (null when there's no pick or no price)
  edge: number | null
  // for a game that's started: Kalshi's chance for the home team just before the start, and the spread when DeVig saved it
  closeHome?: number | null
  closeSpread?: number | null
  // soccer: Kalshi's three outcomes (90 minutes plus stoppage). fair = each one's mid price, scaled to add up to 1;
  // ml = the price to buy each one. fairHome stays null, so the two-way views leave these games alone.
  three?: Three | null
  ml3?: Three | null
  tickers3?: { home: string; draw: string; away: string } | null
  soccer?: SoccerMore | null
}
export type Three = { home: number; draw: number; away: number }
// soccer's other Kalshi match markets, mid prices from the board file (the game page asks Kalshi for fresh ones):
// spreads = "<side> wins by more than <line>", totals = "over <line> goals", btts = both teams score
export type SoccerMore = {
  spreads: [side: 'home' | 'away', line: number, mid: number, ask: number | null, ticker: string][]
  totals: [line: number, mid: number, ask: number | null, ticker: string][]
  btts: [mid: number, ask: number | null, ticker: string] | null
  more?: SoccerExtra | null
}
// the rest of Kalshi's markets on one soccer match (tools/soccer_lines.py "more"); every price ends mid, ask, ticker.
// corners / team_corners are "n or more"; players: goal and ast are "n or more", firstgoal the game's first goal,
// soa a goal or an assist
export type Px = [mid: number, ask: number | null, ticker: string]
export type Half = { win: { home: Px; draw: Px; away: Px } | null; totals: [line: number, ...p: Px][]; spreads: [side: 'home' | 'away', line: number, ...p: Px][]; btts: Px | null }
export type PlayerKind = 'goal' | 'firstgoal' | 'ast' | 'soa'
export type SoccerExtra = {
  corners: [n: number, ...p: Px][]
  team_corners: [side: 'home' | 'away', n: number, ...p: Px][]
  team_totals: [side: 'home' | 'away', line: number, ...p: Px][]
  first: [who: 'home' | 'away' | 'none', ...p: Px][]
  scores: [home: number, away: number, ...p: Px][]
  scores_1h: [home: number, away: number, ...p: Px][]
  halves: Partial<Record<'1' | '2', Half>>
  players: [side: 'home' | 'away', name: string, kind: PlayerKind, n: number, ...p: Px][]
}

// ---------- soccer (tools/soccer_lines.py writes live/soccer_lines.json about every 30 minutes) ----------
// the board's league code -> its name; the code is also the row's sport and /api/live's sport (lowercase)
export const SOCCER: Record<string, string> = {
  EPL: 'Premier League', LALIGA: 'La Liga', SERIEA: 'Serie A', BUND: 'Bundesliga', LIGUE1: 'Ligue 1',
  UCL: 'Champions League', UEL: 'Europa League', UECL: 'Conference League', MLS: 'MLS', LIGAMX: 'Liga MX',
}
export const isSoccer = (sport: string) => sport in SOCCER
type SoccerLine = {
  sport: string
  espn_id: string
  kickoff: string
  state: 'pre' | 'in' | 'post'
  detail: string
  home: string
  away: string
  names?: { home: string; away: string }
  ids?: { home: string; away: string } | null
  colors?: { home: string; away: string } | null
  home_score: number | null
  away_score: number | null
  fair?: Three | null
  ml?: { home: number | null; draw: number | null; away: number | null } | null
  tickers?: { home: string; draw: string; away: string } | null
  spreads?: SoccerMore['spreads']
  totals?: SoccerMore['totals']
  btts?: SoccerMore['btts']
  more?: SoccerExtra | null
}

const SPORTS_WITH_PICKS = ['nfl', 'nba', 'mlb', 'cbb', 'cfb'] as const

function toPick(d: Decision, home: string): Pick {
  const side = d.decision?.side ?? null
  const snap = d.market_snapshot
  const lockedOdds =
    side == null ? null : ((side === home ? snap?.moneyline_home : snap?.moneyline_away) ?? null)
  const fairHomeLock =
    d.inputs?.market_prob_home_at_lock ??
    fairHomeProb({ home: snap?.moneyline_home ?? null, away: snap?.moneyline_away ?? null })
  return {
    action: d.decision?.action ?? 'PASS',
    side,
    prob: d.decision?.prob ?? null,
    tier: d.decision?.tier ?? null,
    lockedAt: d.locked_at ?? null,
    correct: d.outcome?.resolved ? (d.outcome.decision_correct ?? null) : null,
    lockedOdds,
    fairAtLock: side == null || fairHomeLock == null ? null : side === home ? fairHomeLock : 1 - fairHomeLock,
    inputs: d.inputs ?? null,
    lean: side ?? d.lean?.side ?? null,
    leanProb: side != null ? (d.decision?.prob ?? null) : (d.lean?.prob ?? null),
    bar: d.decision?.bar ?? PICK_BAR[d.sport] ?? null,
    note: d.lean?.note ?? null,
  }
}

// When a file has no status for a game (game_lines leaves it to live_lines for the pro leagues, and live_lines can be
// hours old between game windows), go by the clock so the game still lands in Upcoming, Live or Final.
function stateByClock(kickoff: string, now = Date.now()): GameRow['state'] {
  const t = Date.parse(kickoff)
  if (!isFinite(t) || now < t) return 'pre'
  return now - t < 4.5 * 3600e3 ? 'in' : 'post'
}

// 1 unit at American odds: what a win pays
export function winUnits(odds: number) {
  return odds > 0 ? odds / 100 : 100 / -odds
}

function matchKey(sport: string, away: string, home: string) {
  return `${sport.toUpperCase()}|${away}|${home}`
}

// ---------- fresh: Kalshi and ESPN right now ----------
// The files above are only as new as the bots' last run (prices about every 30 minutes; the live file sleeps between
// game windows), so refresh, and timers while the board is open, also ask Kalshi (/api/prices, every 2 min) and ESPN (/api/live, every 15s while a game is on)
// directly for the games near now. What they return wins over the files.
type LiveScore = { id: string; state: 'pre' | 'in' | 'post'; detail: string; away_score: number | null; home_score: number | null }
export type Fresh = {
  at: number
  prices: Record<string, { bid: number | null; ask: number | null }> // by the home team's Kalshi ticker
  scores: Record<string, LiveScore> // by SPORT|ESPN id
}

function americanOf(p: number) {
  return p >= 0.5 ? (-100 * p) / (1 - p) : (100 * (1 - p)) / p
}
// one "home team wins" market: buying home costs the ask, buying away costs 1 - the bid (the same as the bot's ml)
export function freshMoneyline(m: { bid: number | null; ask: number | null } | undefined): Moneyline | null {
  if (!m || m.bid == null || m.ask == null) return null
  return { home: Math.round(americanOf(m.ask) * 10) / 10, away: Math.round(americanOf(1 - m.bid) * 10) / 10 }
}

// the three soccer markets right now: fair = mids scaled to add up to 1, ml = the price to buy each (the ask)
export function freshThree(prices: Fresh['prices'] | undefined, t: SoccerLine['tickers']): { fair: Three; ml: Three } | null {
  if (!prices || !t) return null
  const q = [prices[t.home], prices[t.draw], prices[t.away]]
  if (q.some((m) => !m || m.bid == null || m.ask == null || m.ask <= 0)) return null
  const mids = q.map((m) => (m!.bid! + m!.ask!) / 2)
  const sum = mids[0] + mids[1] + mids[2]
  if (!(sum > 0)) return null
  const ml = q.map((m) => Math.round(americanOf(Math.min(m!.ask!, 0.99)) * 10) / 10)
  return {
    fair: { home: mids[0] / sum, draw: mids[1] / sum, away: mids[2] / sum },
    ml: { home: ml[0], draw: ml[1], away: ml[2] },
  }
}

function soccerRows(games: SoccerLine[], fresh?: Fresh): GameRow[] {
  return games.map((g) => {
    const key = `${g.sport}|${g.espn_id}`
    const fs = fresh?.scores[key]
    const now = freshThree(fresh?.prices, g.tickers)
    const three = now?.fair ?? g.fair ?? null
    const m = g.ml
    const ml3 = now?.ml ?? (m && m.home != null && m.draw != null && m.away != null ? { home: m.home, draw: m.draw, away: m.away } : null)
    return {
      id: key,
      trackKey: String(g.espn_id),
      sport: g.sport,
      away: g.away,
      home: g.home,
      awayName: g.names?.away ?? g.away,
      homeName: g.names?.home ?? g.home,
      kickoff: g.kickoff,
      state: fs?.state ?? g.state ?? stateByClock(g.kickoff),
      detail: fs?.detail ?? g.detail ?? '',
      awayScore: fs?.away_score ?? g.away_score,
      homeScore: fs?.home_score ?? g.home_score,
      ml: ml3 ? { home: ml3.home, away: ml3.away } : null,
      fairHome: null,
      spread: null,
      total: null,
      colors: g.colors ?? null,
      ids: g.ids ?? null,
      ticker: null,
      pick: null,
      edge: null,
      three,
      ml3,
      tickers3: g.tickers ?? null,
      soccer: g.spreads?.length || g.totals?.length || g.btts || g.more ? { spreads: g.spreads ?? [], totals: g.totals ?? [], btts: g.btts ?? null, more: g.more ?? null } : null,
    }
  })
}

// a soccer game as a game line, so the fresh-score timers treat it like any other game
const soccerAsLine = (g: SoccerLine): GameLine => ({ ...g, ml: null, colors: g.colors ?? undefined })

// games that aren't over: started up to 6 hours ago, or starting within 36 hours
function nearNow(games: GameLine[], now = Date.now()) {
  return games.filter((g) => {
    const t = Date.parse(g.kickoff)
    return isFinite(t) && t > now - 6 * 3600e3 && t < now + 36 * 3600e3 && g.state !== 'post'
  })
}
// a game is on (or about to be) when its kickoff has passed and it isn't final
const anyOn = (games: GameLine[], scores?: Record<string, LiveScore>, now = Date.now()) =>
  Object.values(scores ?? {}).some((g) => g.state === 'in') ||
  nearNow(games, now).some((g) => Date.parse(g.kickoff) <= now && !(scores?.[`${g.sport}|${g.espn_id}`]?.state === 'post'))
export const SCORE_EVERY = 5e3 // ESPN through /api/live (cached 5s on the server), only while a game is on
const PRICE_EVERY = 2 * 60e3 // Kalshi through /api/prices

async function loadPrices(games: GameLine[], soccer: SoccerLine[] = []): Promise<Fresh['prices']> {
  const near = new Set(nearNow(soccer.map(soccerAsLine)).map((g) => `${g.sport}|${g.espn_id}`))
  const tickers = [...new Set([
    ...nearNow(games).map((g) => g.home_ticker),
    ...soccer.filter((g) => near.has(`${g.sport}|${g.espn_id}`)).flatMap((g) => (g.tickers ? [g.tickers.home, g.tickers.draw, g.tickers.away] : [])),
  ].filter((t): t is string => !!t))]
  const chunks: string[][] = []
  for (let i = 0; i < tickers.length; i += 40) chunks.push(tickers.slice(i, i + 40))
  const res = await Promise.allSettled(
    chunks.map(async (c) => {
      const r = await fetch(`/api/prices?tickers=${c.join(',')}`)
      if (!r.ok) throw new Error(`prices: ${r.status}`)
      return (await r.json()) as { markets: Fresh['prices'] }
    })
  )
  const prices: Fresh['prices'] = {}
  for (const r of res) if (r.status === 'fulfilled') Object.assign(prices, r.value.markets)
  if (!Object.keys(prices).length && chunks.length) throw new Error('Kalshi did not answer')
  return prices
}

async function loadScores(games: GameLine[]): Promise<Fresh['scores']> {
  const sports = [...new Set(nearNow(games).map((g) => g.sport.toLowerCase()))].filter((s) =>
    ['nfl', 'nba', 'mlb', 'nhl', 'wnba', 'cfb', 'cbb'].includes(s) || isSoccer(s.toUpperCase())
  )
  const res = await Promise.allSettled(
    sports.map(async (s) => {
      const r = await fetch(`/api/live?sport=${s}`)
      if (!r.ok) throw new Error(`live: ${r.status}`)
      return { sport: s.toUpperCase(), games: ((await r.json()) as { games: LiveScore[] }).games ?? [] }
    })
  )
  const scores: Fresh['scores'] = {}
  for (const r of res)
    if (r.status === 'fulfilled')
      for (const g of r.value.games) {
        const k = `${r.value.sport}|${g.id}`
        const was = lastScores.get(k)
        scores[k] = was && Date.now() - was.at < 60e3 ? newer(was.g, g) : g
        if (scores[k] === g) lastScores.set(k, { g, at: Date.now() })
      }
  if (!Object.keys(scores).length && sports.length) throw new Error('ESPN did not answer')
  return scores
}

// ESPN answers come through more than one server copy, and one can be a few seconds behind another: never let a
// game go backwards (a lower total score, or a later clock time in the same period, while it's on). After a minute
// the new answer wins anyway, so a real score correction still shows.
const lastScores = new Map<string, { g: LiveScore; at: number }>()
const STATE_RANK = { pre: 0, in: 1, post: 2 }
function newer(old: LiveScore | undefined, g: LiveScore): LiveScore {
  if (!old) return g
  if (STATE_RANK[g.state] !== STATE_RANK[old.state]) return STATE_RANK[g.state] > STATE_RANK[old.state] ? g : old
  const tot = (x: LiveScore) => (x.away_score ?? 0) + (x.home_score ?? 0)
  if (tot(g) !== tot(old)) return tot(g) > tot(old) ? g : old
  if (g.state === 'in') {
    const a = parseClock(old.detail), b = parseClock(g.detail)
    if (a && b && a.rest === b.rest && b.secs > a.secs) return old
  }
  return g
}

function buildRows(
  gameLines: GameLine[],
  live: LiveLine[],
  decisions: Decision[],
  fresh?: Fresh
): GameRow[] {
  // fresher scores and Kalshi prices from live_lines (every ~2 min) win over game_lines (every ~10 min)
  const liveById = new Map(live.map((g) => [`${g.sport}|${g.espn_id}`, g]))
  // picks are matched on sport + teams + kickoff within 18 hours (NFL ids aren't ESPN ids)
  const decByTeams = new Map<string, Decision[]>()
  for (const d of decisions) {
    const k = matchKey(d.sport, d.away_team, d.home_team)
    decByTeams.set(k, [...(decByTeams.get(k) ?? []), d])
  }
  const findPick = (g: GameLine): Decision | undefined => {
    const t = Date.parse(g.kickoff)
    return decByTeams
      .get(matchKey(g.sport, g.away, g.home))
      ?.find((d) => Math.abs(Date.parse(d.kickoff_time) - t) < 18 * 3600e3)
  }

  const seen = new Set<string>()
  const rows: GameRow[] = []
  const add = (g: GameLine) => {
    const key = `${g.sport}|${g.espn_id}`
    if (seen.has(key)) return
    seen.add(key)
    const lv = liveById.get(key)
    const fs = fresh?.scores[key]
    const ml = freshMoneyline(g.home_ticker ? fresh?.prices[g.home_ticker] : undefined) ?? lv?.kalshi_game?.moneyline ?? g.ml ?? null
    const fairHome = fairHomeProb(ml)
    const d = findPick(g)
    const pick: Pick | null = d?.decision ? toPick(d, g.home) : null
    let edge: number | null = null
    if (pick?.side && pick.prob != null && fairHome != null) {
      const fairSide = pick.side === g.home ? fairHome : 1 - fairHome
      edge = pick.prob - fairSide
    }
    rows.push({
      id: key,
      trackKey: d?.game_id ? String(d.game_id) : String(g.espn_id),
      sport: g.sport,
      away: g.away,
      home: g.home,
      awayName: g.names?.away ?? g.away,
      homeName: g.names?.home ?? g.home,
      kickoff: g.kickoff,
      state: fs?.state ?? lv?.state ?? g.state ?? stateByClock(g.kickoff),
      detail: fs?.detail ?? lv?.detail ?? g.detail ?? '',
      awayScore: fs?.away_score ?? lv?.away_score ?? g.away_score,
      homeScore: fs?.home_score ?? lv?.home_score ?? g.home_score,
      ml,
      fairHome,
      spread: g.spread ?? null,
      total: g.total ?? null,
      colors: g.colors ?? null,
      ids: g.ids ?? null,
      ticker: g.home_ticker ?? null,
      pick,
      edge,
      closeHome: closingHome(lv?.kalshi_line, g.home, g.kickoff) ?? fairFromSnap(d),
      closeSpread: d?.market_snapshot?.spread_home ?? null,
    })
  }
  gameLines.forEach(add)
  // games only live_lines knows about (e.g. started after game_lines was written)
  live.forEach((g) => add({ ...g, ml: g.kalshi_game?.moneyline ?? null }))
  return rows.sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff))
}

// Kalshi's chance for the home team at the start: the last point of the team's price line before kickoff
function closingHome(line: LiveLine['kalshi_line'], home: string, kickoff: string) {
  const pts = line?.points
  if (!line || !pts?.length) return null
  const t = Date.parse(kickoff) / 1000
  const before = pts.filter((p) => p[0] <= t)
  const p = (before.length ? before[before.length - 1] : pts[0])[1]
  if (p == null || !isFinite(p)) return null
  return line.team === home ? p : 1 - p
}
function fairFromSnap(d: Decision | undefined) {
  const m = d?.market_snapshot
  return m ? fairHomeProb({ home: m.moneyline_home ?? null, away: m.moneyline_away ?? null }) : null
}

// A graded pick from DeVig's own board, as a finished game. The live files drop a game a day or so after it ends
// (Sunday's NFL games are gone by Monday), so History and the game page fall back to these.
export function boardFinal(d: Decision): GameRow | null {
  const o = d.outcome
  if (!o?.resolved || o.away_score == null || o.home_score == null) return null
  const m = d.market_snapshot
  const ml = m?.moneyline_home != null && m?.moneyline_away != null ? { home: m.moneyline_home, away: m.moneyline_away } : null
  return {
    id: `${d.sport}|d${d.game_id}`,
    trackKey: String(d.game_id),
    sport: d.sport,
    away: d.away_team,
    home: d.home_team,
    awayName: TEAM_NAMES[d.sport]?.[d.away_team] ?? d.away_team,
    homeName: TEAM_NAMES[d.sport]?.[d.home_team] ?? d.home_team,
    kickoff: d.kickoff_time,
    state: 'post',
    detail: 'Final',
    awayScore: o.away_score,
    homeScore: o.home_score,
    ml: null,
    fairHome: null,
    spread: null,
    total: null,
    colors: null,
    ids: null,
    ticker: null,
    pick: d.decision ? toPick(d, d.home_team) : null,
    edge: null,
    closeHome: fairHomeProb(ml),
    closeSpread: m?.spread_home ?? null,
  }
}
const NFL_NAMES: Record<string, string> = {
  ARI: 'Arizona Cardinals', ATL: 'Atlanta Falcons', BAL: 'Baltimore Ravens', BUF: 'Buffalo Bills', CAR: 'Carolina Panthers',
  CHI: 'Chicago Bears', CIN: 'Cincinnati Bengals', CLE: 'Cleveland Browns', DAL: 'Dallas Cowboys', DEN: 'Denver Broncos',
  DET: 'Detroit Lions', GB: 'Green Bay Packers', HOU: 'Houston Texans', IND: 'Indianapolis Colts', JAX: 'Jacksonville Jaguars',
  KC: 'Kansas City Chiefs', LA: 'Los Angeles Rams', LAR: 'Los Angeles Rams', LAC: 'Los Angeles Chargers', LV: 'Las Vegas Raiders',
  MIA: 'Miami Dolphins', MIN: 'Minnesota Vikings', NE: 'New England Patriots', NO: 'New Orleans Saints', NYG: 'New York Giants',
  NYJ: 'New York Jets', PHI: 'Philadelphia Eagles', PIT: 'Pittsburgh Steelers', SEA: 'Seattle Seahawks', SF: 'San Francisco 49ers',
  TB: 'Tampa Bay Buccaneers', TEN: 'Tennessee Titans', WAS: 'Washington Commanders', WSH: 'Washington Commanders',
}
const TEAM_NAMES: Record<string, Record<string, string>> = { NFL: NFL_NAMES }

// Every finished game the app knows: the live files' finals, then graded board picks they've already dropped
// (NFL for the last 8 days, other sports for the last 3), newest first.
export function useFinals() {
  const { rows, isLoading } = useGames()
  const boards = useQuery({ queryKey: ['lineboards'], queryFn: loadBoards, refetchInterval: 10 * 60e3 })
  const finals = useMemo(() => {
    const out = rows.filter((r) => r.state === 'post')
    const seen = new Set(out.map((r) => `${r.sport}|${r.away}|${r.home}|${r.kickoff.slice(0, 10)}`))
    const near = (r: GameRow) => out.some((x) => x.sport === r.sport && x.away === r.away && x.home === r.home &&
      Math.abs(Date.parse(x.kickoff) - Date.parse(r.kickoff)) < 18 * 3600e3)
    const now = Date.now()
    for (const d of boards.data ?? []) {
      const r = boardFinal(d)
      if (!r) continue
      const age = now - Date.parse(r.kickoff)
      if (!(age >= 0 && age < (r.sport === 'NFL' ? 8 : 3) * 86400e3)) continue
      const k = `${r.sport}|${r.away}|${r.home}|${r.kickoff.slice(0, 10)}`
      if (seen.has(k) || near(r)) continue
      seen.add(k)
      out.push(r)
    }
    return out.sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff))
  }, [rows, boards.data])
  return { finals, isLoading: isLoading && boards.isLoading }
}

// Every pick and pass on the NFL, NBA, MLB, CBB and CFB boards, each with the model's lean from the slate (the college
// boards keep it on the decision itself). One loader for
// every reader of the ['lineboards'] query, so the cache always has the same shape.
const loadBoards = async () => {
  const all = await Promise.allSettled(
    SPORTS_WITH_PICKS.map((s) =>
      getJson<Lineboard>(`${s}/lineboard_export.json`)
    )
  )
  return all.flatMap((r) => {
    if (r.status !== 'fulfilled') return []
    const leans = new Map<string, Lean>()
    for (const d of r.value.docs) {
      if (d.collection !== 'slate') continue
      const m = (d.data as SlateDoc).model
      if (m?.available) leans.set((d.data as SlateDoc).game_id, { side: m.winner_side ?? null, prob: m.winner_prob ?? null, note: m.note ?? null })
    }
    return r.value.docs
      .filter((d) => d.collection === 'decisions')
      .map((d) => { const x = d.data as Decision; return { ...x, lean: leans.get(x.game_id) ?? x.lean } })
  })
}

export function useGames() {
  const gameLines = useQuery({
    queryKey: ['game_lines'],
    queryFn: () =>
      getJson<{ generated_at: string; games: GameLine[] }>(
        'live/game_lines.json'
      ),
    refetchInterval: 10 * 60e3,
  })
  const live = useQuery({
    queryKey: ['live_lines'],
    queryFn: () =>
      getJson<{ generated_at: string; games: LiveLine[] }>(
        'live/live_lines.json'
      ),
    refetchInterval: 2 * 60e3,
  })
  const boards = useQuery({
    queryKey: ['lineboards'],
    queryFn: loadBoards,
    refetchInterval: 10 * 60e3,
  })
  const soccer = useQuery({
    queryKey: ['soccer_lines'],
    queryFn: () => getJson<{ generated_at: string; games: SoccerLine[] }>('live/soccer_lines.json'),
    refetchInterval: 10 * 60e3,
    retry: 1,
  })
  const soccerGames = soccer.data?.games ?? []
  // every game the fresh-score timers watch: the game-lines file's and soccer's
  const watched = useMemo(
    () => [...(gameLines.data?.games ?? []), ...(soccer.data?.games ?? []).map(soccerAsLine)],
    [gameLines.data, soccer.data]
  )
  const prices = useQuery({
    queryKey: ['fresh_prices'],
    queryFn: () => loadPrices(gameLines.data?.games ?? [], soccerGames),
    enabled: !!gameLines.data || !!soccer.data,
    refetchInterval: PRICE_EVERY,
    retry: 1,
  })
  // scores every 5 seconds while any game is on; every 2 minutes otherwise (to notice a kickoff)
  const scores = useQuery({
    queryKey: ['fresh_scores'],
    queryFn: () => loadScores(watched),
    enabled: !!gameLines.data || !!soccer.data,
    refetchInterval: (q) => (anyOn(watched, q.state.data) ? SCORE_EVERY : PRICE_EVERY),
    retry: 1,
  })
  const fresh = useMemo(
    () => ({
      data: prices.data || scores.data
        ? { at: Math.max(prices.dataUpdatedAt, scores.dataUpdatedAt), prices: prices.data ?? {}, scores: scores.data ?? {} }
        : undefined,
      isFetching: prices.isFetching || scores.isFetching,
      refetch: () => { prices.refetch(); scores.refetch() },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prices.data, scores.data, prices.dataUpdatedAt, scores.dataUpdatedAt, prices.isFetching, scores.isFetching]
  )

  // rebuilt only when a file actually changes: a new array on every render makes the table reset itself in a loop
  const rows = useMemo(
    () =>
      gameLines.data || live.data || soccer.data
        ? [
            ...buildRows(gameLines.data?.games ?? [], live.data?.games ?? [], boards.data ?? [], fresh.data),
            ...soccerRows(soccer.data?.games ?? [], fresh.data),
          ].sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff))
        : [],
    [gameLines.data, live.data, boards.data, soccer.data, fresh.data]
  )
  const stamps = [gameLines.data?.generated_at, live.data?.generated_at, soccer.data?.generated_at]
    .filter(Boolean)
    .map((s) => Date.parse(s as string))
  if (fresh.data) stamps.push(fresh.data.at)
  return {
    rows,
    updatedAt: stamps.length ? new Date(Math.max(...stamps)) : null,
    isLoading: gameLines.isLoading && live.isLoading,
    error: gameLines.error && live.error ? gameLines.error : null,
    picksError: boards.error,
    refetch: () => {
      gameLines.refetch()
      live.refetch()
      boards.refetch()
      soccer.refetch()
      fresh.refetch()
    },
    isFetching: gameLines.isFetching || live.isFetching || boards.isFetching || soccer.isFetching || fresh.isFetching,
  }
}

// ---------- track record: every graded pick, units at the price it locked at ----------
export type GradedPick = {
  sport: string
  away: string
  home: string
  side: string
  kickoff: string
  won: boolean
  odds: number | null
  units: number | null
  awayScore: number | null
  homeScore: number | null
}
export type SportRecord = { sport: string; won: number; lost: number; units: number; priced: number; picks: GradedPick[] }

export function useRecord() {
  const boards = useQuery({
    queryKey: ['lineboards'],
    queryFn: loadBoards,
    refetchInterval: 10 * 60e3,
  })
  const records = useMemo(() => {
    const by = new Map<string, SportRecord>()
    for (const d of boards.data ?? []) {
      const side = d.decision?.side
      if (!side || d.decision?.action === 'PASS' || !d.outcome?.resolved || d.outcome.decision_correct == null) continue
      const snap = d.market_snapshot
      const odds = (side === d.home_team ? snap?.moneyline_home : snap?.moneyline_away) ?? null
      const won = d.outcome.decision_correct
      const units = odds == null || odds === 0 ? null : won ? winUnits(odds) : -1
      const r = by.get(d.sport) ?? { sport: d.sport, won: 0, lost: 0, units: 0, priced: 0, picks: [] }
      if (won) r.won++
      else r.lost++
      if (units != null) {
        r.units += units
        r.priced++
      }
      r.picks.push({
        sport: d.sport, away: d.away_team, home: d.home_team, side, kickoff: d.kickoff_time, won, odds, units,
        awayScore: d.outcome.away_score ?? null, homeScore: d.outcome.home_score ?? null,
      })
      by.set(d.sport, r)
    }
    for (const r of by.values()) r.picks.sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff))
    return ['NBA', 'NFL', 'MLB', 'CBB', 'CFB'].map((s) => by.get(s)).filter(Boolean) as SportRecord[]
  }, [boards.data])
  return { records, isLoading: boards.isLoading, error: boards.error }
}

