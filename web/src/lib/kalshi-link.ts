// The Kalshi link reader: paste a link from Kalshi's Share button (one bet, a game, or a combo) and /api/kalshi
// (functions/api/kalshi.js) returns its prices now and, for a combo, every leg. Saved links live in this browser.
import { useSyncExternalStore } from 'react'
import { useMutation } from '@tanstack/react-query'
import type { Outcome, Snap } from './review'

export type KLeg = {
  ticker: string | null; event: string | null; title: string | null; pick: string; side: 'yes' | 'no'
  status: string | null; result: 'won' | 'lost' | null
  bid: number | null; ask: number | null; last: number | null; chance: number | null; closes: string | null
  strike?: number | null; strike_type?: string | null // 224.5 'greater' = 225+
}
export type KRead =
  | { kind: 'combo'; ticker: string; fetched_at: string; combo: KLeg; legs: KLeg[]; multiplied: number | null; won: number; lost: number; truncated: boolean }
  | { kind: 'market'; ticker: string; fetched_at: string; market: KLeg }
  | { kind: 'event'; ticker: string; fetched_at: string; title: string | null; sub: string | null; markets: KLeg[] }

export class LinkError extends Error {}

export async function readLink(link: string): Promise<KRead> {
  if (link.trim().startsWith('slip:')) return readSlip(link.trim())
  let r: Response
  try {
    r = await fetch(`/api/kalshi?link=${encodeURIComponent(link.trim())}`, { headers: { accept: 'application/json' } })
  } catch {
    throw new LinkError("Couldn't reach DeVig. Check your connection and try again.")
  }
  const d = await r.json().catch(() => null)
  if (!r.ok || !d) throw new LinkError(d?.error ?? "Kalshi isn't answering right now. Try again in a minute.")
  return d as KRead
}

export function useReadLink() {
  return useMutation({ mutationFn: readLink })
}

// what a leg says, in words: "BYU wins", or "No: Boston wins" for a No leg
export function legLabel(l: KLeg) {
  const t = l.title || l.pick
  return l.side === 'no' ? `No: ${t}` : t
}

// snap: the review as it stood when first read (legs still to play); outcome: how it ended (see lib/review.ts)
export type Saved = { link: string; label: string; savedAt: string; snap?: Snap; outcome?: Outcome }
const KEY = 'devig_saved_links'
export function loadSaved(): Saved[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(v) ? v.filter((x) => x && typeof x.link === 'string').slice(0, 30) : []
  } catch {
    return []
  }
}
let mine: Saved[] | null = null // this visit's copy (private mode can't write localStorage)
const watchers = new Set<() => void>()
export function storeSaved(list: Saved[]) {
  mine = list.slice(0, 30)
  try { localStorage.setItem(KEY, JSON.stringify(mine)) } catch { /* private mode: kept for this visit only */ }
  watchers.forEach((w) => w())
}
export const getSaved = () => (mine ??= loadSaved())
// the saved list, shared by every reader on the page (History's, Parlay's) so a save in one shows in the others
export function useSaved(): Saved[] {
  return useSyncExternalStore((cb) => { watchers.add(cb); return () => watchers.delete(cb) }, getSaved, () => [])
}

// ---------- a parlay built in DeVig, saved as "slip:TICKER~yes,TICKER~no" and read back like a Kalshi combo ----------
export function slipLink(legs: { ticker?: string | null; side: 'yes' | 'no' }[]): string | null {
  if (!legs.length || legs.some((l) => !l.ticker)) return null
  return 'slip:' + legs.map((l) => `${l.ticker}~${l.side}`).join(',')
}
async function readSlip(link: string): Promise<KRead> {
  const parts = link.slice(5).split(',').map((x) => x.split('~') as [string, string]).filter(([t]) => t)
  const legs = await Promise.all(parts.map(async ([t, side]) => {
    const d = await readLink(t)
    if (d.kind !== 'market') throw new LinkError("One of this parlay's markets is gone from Kalshi.")
    const m = d.market
    if (side !== 'no') return m
    // the No side of the same market
    const flip = (v: number | null) => (v == null ? null : +(1 - v).toFixed(4))
    return { ...m, side: 'no' as const, bid: flip(m.ask), ask: flip(m.bid), last: flip(m.last), chance: flip(m.chance),
      result: m.result === 'won' ? 'lost' as const : m.result === 'lost' ? 'won' as const : null }
  }))
  const won = legs.filter((l) => l.result === 'won').length
  const lost = legs.filter((l) => l.result === 'lost').length
  const mult = legs.every((l) => l.chance != null || l.result) ? legs.reduce((p, l) => p * (l.result ? (l.result === 'won' ? 1 : 0) : l.chance!), 1) : null
  const combo: KLeg = { ticker: null, event: null, title: 'Your parlay', pick: 'Your parlay', side: 'yes', status: null,
    result: lost ? 'lost' : won === legs.length ? 'won' : null, bid: null, ask: null, last: null, chance: mult, closes: null }
  return { kind: 'combo', ticker: 'slip', fetched_at: new Date().toISOString(), combo, legs, multiplied: mult, won, lost, truncated: false }
}
export function labelFor(d: KRead) {
  if (d.kind === 'combo') return d.ticker === 'slip' ? `Your parlay, ${d.legs.length} legs` : `Combo, ${d.legs.length} legs`
  if (d.kind === 'market') return legLabel(d.market)
  return d.title || d.ticker
}
