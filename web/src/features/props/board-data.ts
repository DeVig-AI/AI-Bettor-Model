// What the props board and the player drawer read: Kalshi's live prices for what's on screen, each player's last 10
// games from the stats bot (stats/<sport>/team_<CODE>.json), and a player's lines for one stat grouped together.
// Counts and prices only; DeVig's model numbers come straight from the props export.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { type LivePrice, type PropLine, fetchLiveProps } from '@/lib/props'
import { logIdx, rsIndexQuery, rsTeamQuery, statsCode } from '@/lib/research'
import { type StreakPlayer, normName, recentGames } from '@/lib/streak-math'

export type Shown = PropLine & { mid: number; spread: number; live: boolean }

export function withLive(l: PropLine, live: Record<string, LivePrice>): Shown | null {
  const lv = l.ticker ? live[l.ticker] : undefined
  const bid = lv ? lv.bid : l.bid
  const ask = lv ? lv.ask : l.ask
  if (bid == null || ask == null || !(ask > 0 && ask < 1) || !(bid > 0)) return null
  return { ...l, bid, ask, mid: (bid + ask) / 2, spread: ask - bid, live: !!lv }
}

const LOG_SPORTS = ['NBA', 'NHL', 'NFL']
export const LAST = 10

// Kalshi's live price for these tickers; a ticker asked in the last minute isn't asked again
export function useLivePrices(tickers: string[]) {
  const [live, setLive] = useState<Record<string, LivePrice>>({})
  const [at, setAt] = useState<Date | null>(null)
  const asked = useRef(new Map<string, number>())
  const key = tickers.join(',')
  useEffect(() => {
    const now = Date.now()
    const want = key ? key.split(',').filter((t) => now - (asked.current.get(t) ?? 0) > 60000) : []
    if (!want.length) return
    want.forEach((t) => asked.current.set(t, now))
    let off = false
    fetchLiveProps(want).then((m) => {
      if (off || !Object.keys(m).length) return
      setLive((c) => ({ ...c, ...m }))
      setAt(new Date())
    })
    return () => { off = true }
  }, [key])
  return { live, at }
}

export type Logs = { last: (player: string, stat: string) => number[] | null; team: (player: string) => string | null }

// The last 10 played games of every player on these teams, per stat (oldest first)
export function usePlayerLogs(sport: string, teams: string[]): Logs | null {
  const ok = LOG_SPORTS.includes(sport)
  const idx = useQuery({ ...rsIndexQuery(sport), enabled: ok })
  const files = useQueries({
    queries: (ok ? teams : []).map((c) => ({ ...rsTeamQuery(sport, statsCode(sport, c)), retry: false })),
    combine: (rs) => rs.map((r) => r.data),
  })
  return useMemo(() => {
    if (!ok || !idx.data) return null
    const L = logIdx(idx.data)
    const cols = new Map((idx.data.hit_stats ?? []).map(([k, , c]) => [k, c]))
    const who = new Map<string, StreakPlayer>()
    files.forEach((t, i) => t?.players?.forEach((p) => {
      if (p.log?.length) who.set(normName(p.name), { id: p.id, name: p.name, team: teams[i], log: p.log })
    }))
    const memo = new Map<string, number[] | null>()
    return {
      last: (player, stat) => {
        const k = `${normName(player)}|${stat}`
        if (!memo.has(k)) {
          const p = who.get(normName(player)), c = cols.get(stat)
          memo.set(k, p && c ? recentGames(p, sport, L, c, LAST) : null)
        }
        return memo.get(k)!
      },
      team: (player) => who.get(normName(player))?.team ?? null,
    }
  }, [ok, idx.data, files, teams, sport])
}

// DeVig's typical night: the number where its model's chance of "N or more" crosses 50%, read off the player's
// ladder of lines. The model's average (expected) can sit well above it when a few huge games pull it up, and then
// "projects 87, over 70" would contradict the model's own 48% for 70+. Null when the ladder never crosses 50%.
export function typicalOf(ls: { line: number; modelOver: number | null }[]): number | null {
  const pts = ls.filter((l) => l.modelOver != null).map((l) => [needOf(l.line), l.modelOver!] as const).sort((a, b) => a[0] - b[0])
  for (let i = 1; i < pts.length; i++) {
    const [na, pa] = pts[i - 1], [nb, pb] = pts[i]
    if (pa >= 0.5 && pb < 0.5) return pa === pb ? na : na + ((pa - 0.5) / (pa - pb)) * (nb - na)
  }
  return null
}

// What the board shows as DeVig's number: the typical night, else the model's average
export const projOf = (g: Group) => g.typical ?? g.main.expected

// One player's lines for one stat in one game, easiest first; the main line is the one closest to 50/50
export type Group = { key: string; player: string; stat: string; lines: Shown[]; main: Shown; typical: number | null }
export function groupLines(ls: PropLine[], live: Record<string, LivePrice>): Group[] {
  const m = new Map<string, Shown[]>()
  const all = new Map<string, PropLine[]>()
  for (const l of ls) {
    const k = `${l.sport}|${l.gameKey}|${l.player}|${l.stat}`
    all.set(k, [...(all.get(k) ?? []), l])
    const s = withLive(l, live)
    if (s) m.set(k, [...(m.get(k) ?? []), s])
  }
  return [...m.entries()].map(([key, lines]) => {
    lines.sort((a, b) => a.line - b.line)
    const main = lines.reduce((a, b) => (Math.abs(b.mid - 0.5) < Math.abs(a.mid - 0.5) ? b : a))
    return { key, player: main.player, stat: main.stat, lines, main, typical: typicalOf(all.get(key) ?? lines) }
  })
}

// Kalshi's "N+" lines are stored as N - 0.5: the number a player has to reach, and whether a game got there
const half = (line: number) => Math.abs(line - Math.floor(line) - 0.5) < 1e-9
export const needOf = (line: number) => (half(line) ? line + 0.5 : line)
export const hits = (last: number[] | null, line: number) => (last ? last.filter((v) => v > line).length : null)
export const thinLine = (l: Shown) => (l.oi || 0) < 20 || l.spread > 0.06
export const tenOfTen = (last: number[] | null, line: number) => !!last && last.length === LAST && last.every((v) => v > line)

export function useGroups(ls: PropLine[], live: Record<string, LivePrice>) {
  return useMemo(() => groupLines(ls, live), [ls, live])
}
