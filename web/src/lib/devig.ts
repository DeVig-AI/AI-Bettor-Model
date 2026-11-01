// DeVig data layer for v2. Reads the same public export files the classic app reads (docs/repo-data.js), which the
// GitHub Actions bots commit to the repo, and joins them into one row per game for the Games board.
import { useMemo } from 'react'
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
  }
  outcome?: {
    resolved: boolean
    decision_correct: boolean | null
    home_score?: number | null
    away_score?: number | null
  }
  market_snapshot?: { moneyline_home?: number | null; moneyline_away?: number | null }
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
export const PICK_BAR: Record<string, number> = { NFL: 0.6387, NBA: 0.6083, MLB: 0.5511 }

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
  pick: Pick | null
  // DeVig's chance for its side minus Kalshi's fair chance for that side (null when there's no pick or no price)
  edge: number | null
}

const SPORTS_WITH_PICKS = ['nfl', 'nba', 'mlb'] as const

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
    bar: PICK_BAR[d.sport] ?? null,
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
// game windows), so refresh, and a timer while the board is open, also asks Kalshi (/api/prices) and ESPN (/api/live)
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

async function loadFresh(games: GameLine[], now = Date.now()): Promise<Fresh> {
  // games that aren't over: started up to 6 hours ago, or starting within 36 hours
  const near = games.filter((g) => {
    const t = Date.parse(g.kickoff)
    return isFinite(t) && t > now - 6 * 3600e3 && t < now + 36 * 3600e3 && g.state !== 'post'
  })
  const tickers = [...new Set(near.map((g) => g.home_ticker).filter((t): t is string => !!t))]
  const sports = [...new Set(near.map((g) => g.sport.toLowerCase()))].filter((s) =>
    ['nfl', 'nba', 'mlb', 'nhl', 'wnba', 'cfb'].includes(s)
  )
  const chunks: string[][] = []
  for (let i = 0; i < tickers.length; i += 40) chunks.push(tickers.slice(i, i + 40))
  const [priceRes, scoreRes] = await Promise.all([
    Promise.allSettled(
      chunks.map(async (c) => {
        const r = await fetch(`/api/prices?tickers=${c.join(',')}`)
        if (!r.ok) throw new Error(`prices: ${r.status}`)
        return (await r.json()) as { markets: Fresh['prices'] }
      })
    ),
    Promise.allSettled(
      sports.map(async (s) => {
        const r = await fetch(`/api/live?sport=${s}`)
        if (!r.ok) throw new Error(`live: ${r.status}`)
        return { sport: s.toUpperCase(), games: ((await r.json()) as { games: LiveScore[] }).games ?? [] }
      })
    ),
  ])
  const prices: Fresh['prices'] = {}
  for (const r of priceRes) if (r.status === 'fulfilled') Object.assign(prices, r.value.markets)
  const scores: Fresh['scores'] = {}
  for (const r of scoreRes)
    if (r.status === 'fulfilled') for (const g of r.value.games) scores[`${r.value.sport}|${g.id}`] = g
  if (!Object.keys(prices).length && !Object.keys(scores).length && (chunks.length || sports.length))
    throw new Error('Kalshi and ESPN did not answer')
  return { at: now, prices, scores }
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
      pick,
      edge,
    })
  }
  gameLines.forEach(add)
  // games only live_lines knows about (e.g. started after game_lines was written)
  live.forEach((g) => add({ ...g, ml: g.kalshi_game?.moneyline ?? null }))
  return rows.sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff))
}

// Every pick and pass on the NFL, NBA and MLB boards, each with the model's lean from the slate. One loader for
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
      .map((d) => { const x = d.data as Decision; return { ...x, lean: leans.get(x.game_id) } })
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
  const fresh = useQuery({
    queryKey: ['fresh'],
    queryFn: () => loadFresh(gameLines.data?.games ?? []),
    enabled: !!gameLines.data,
    refetchInterval: 2 * 60e3,
    retry: 1,
  })

  // rebuilt only when a file actually changes: a new array on every render makes the table reset itself in a loop
  const rows = useMemo(
    () =>
      gameLines.data || live.data
        ? buildRows(
            gameLines.data?.games ?? [],
            live.data?.games ?? [],
            boards.data ?? [],
            fresh.data
          )
        : [],
    [gameLines.data, live.data, boards.data, fresh.data]
  )
  const stamps = [gameLines.data?.generated_at, live.data?.generated_at]
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
      fresh.refetch()
    },
    isFetching: gameLines.isFetching || live.isFetching || boards.isFetching || fresh.isFetching,
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
    return ['NBA', 'NFL', 'MLB'].map((s) => by.get(s)).filter(Boolean) as SportRecord[]
  }, [boards.data])
  return { records, isLoading: boards.isLoading, error: boards.error }
}

